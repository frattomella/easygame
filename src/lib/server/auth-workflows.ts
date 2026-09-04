import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import { prisma } from "./prisma";
import { createSessionForUser, hashPassword } from "./auth";
import {
  EMAIL_OTP_TTL_MINUTES,
  MAX_OTP_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_CODE_LENGTH,
  PHONE_OTP_TTL_MINUTES,
  resolveOtpResendDecision,
  shouldExposeVerificationPreviewCode,
} from "../auth/otp-policy";
import {
  getPasswordPolicyMessage,
  validatePassword,
} from "../auth/password-policy";
import {
  canDeliverPhoneOtp,
  isPhoneVerificationEnabled,
  isPhoneVerificationRequired,
  isSmsTransportConfigured,
} from "../auth/provider-policy";
import { maskPhoneNumber, normalizePhoneNumber } from "../auth/phone-number";
import {
  isEmailDeliveryConfigured,
  sendTransactionalEmail,
} from "./email/email-service";
import { sendSms } from "./sms/sms-service";
import {
  EASYGAME_BRAND,
  renderEmailDocument,
} from "./email/template-core";

export {
  canDeliverPhoneOtp,
  isPhoneVerificationEnabled,
  isPhoneVerificationRequired,
  isSmsTransportConfigured,
} from "../auth/provider-policy";

type VerificationChannel = "email" | "phone";
type VerificationPurpose =
  | "signup"
  | "login"
  | "verify_email"
  | "verify_phone"
  | "reset_password";

type VerificationDispatchResult = {
  sent: boolean;
  previewCode: string | null;
};

const EMAIL_CODE_TTL_MINUTES = EMAIL_OTP_TTL_MINUTES;
const PHONE_CODE_TTL_MINUTES = PHONE_OTP_TTL_MINUTES;

/**
 * **Il codice sbagliato non e un errore di sistema.**
 *
 * Un errore con questo nome non viene registrato dal punto unico degli errori:
 * e la cosa piu comune che succede su questi endpoint, e riempirne i log
 * significa non vedere piu quelli veri. Le rotte lo riconoscono dal messaggio;
 * la classe esiste perche riconoscerlo dal messaggio e fragile e perche il
 * ripiego sul messaggio resta come seconda difesa.
 */
export class VerificationRejected extends Error {
  readonly code: "INVALID_OR_EXPIRED_CODE" | "RESEND_TOO_SOON";
  readonly retryAfterSeconds: number | null;

  constructor(
    code:
      | "INVALID_OR_EXPIRED_CODE"
      | "RESEND_TOO_SOON" = "INVALID_OR_EXPIRED_CODE",
    retryAfterSeconds: number | null = null,
  ) {
    super(
      code === "RESEND_TOO_SOON"
        ? "Attendi prima di richiedere un altro codice"
        : "Codice non valido o scaduto",
    );
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "VerificationRejected";
  }
}

const DEFAULT_WIDGETS = [
  "metrics",
  "activities",
  "trainings",
  "certifications",
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const asMetadataRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * Sei cifre uniformi su **tutto** l'intervallo, zeri iniziali compresi.
 *
 * `randomInt(100000, 1_000_000)` — la forma di prima — non produceva mai un
 * codice che comincia per zero: novecentomila valori invece di un milione.
 */
const createOtpCode = () =>
  randomInt(0, 10 ** OTP_CODE_LENGTH)
    .toString()
    .padStart(OTP_CODE_LENGTH, "0");

/**
 * **Il pepe delle impronte OTP.**
 *
 * Stessa catena di ripieghi del contatore di frequenza
 * (`auth-rate-limit.ts`), e per la stessa ragione: un'installazione che non ha
 * dichiarato un segreto proprio deve comunque avere un valore che non e nel
 * database.
 */
const otpPepper = () =>
  process.env.AUTH_OTP_SECRET ||
  process.env.AUTH_RATE_LIMIT_SECRET ||
  process.env.CRON_SECRET ||
  process.env.DATABASE_URL ||
  "easygame-local";

/**
 * **L'impronta di un codice a sei cifre non e un'impronta, se e uno SHA nudo.**
 *
 * `sha256(codice)` su un codice a sei cifre e reversibile in un istante: un
 * milione di valori, una tabella precalcolata, e chi legge la colonna
 * `code_hash` legge il codice. Il requisito «OTP memorizzato in forma sicura,
 * mai in chiaro» non era soddisfatto — era soddisfatto *alla lettera* e non
 * nella sostanza, che e il modo peggiore.
 *
 * Un HMAC con un pepe che vive **nell'ambiente e non nel database** chiude
 * quella strada: chi porta via un dump non ha il pepe, e senza il pepe il
 * milione di valori non si puo enumerare.
 *
 * L'impronta lega anche **canale, scopo e utente**. Serve a rendere inutile lo
 * spostamento di una riga: un `code_hash` copiato dalla challenge email di un
 * account sulla challenge telefono di un altro non corrisponde piu a niente.
 *
 * ## Cosa succede alle challenge gia emesse
 *
 * Diventano inverificabili, e va bene: vivono cinque o quindici minuti, e chi
 * si trova a cavallo del rilascio richiede il codice. Non c'e migrazione,
 * perche non c'e niente da conservare.
 */
export const hashOtpCode = (
  code: string,
  binding: { userId: string; channel: string; purpose: string },
) =>
  createHmac("sha256", otpPepper())
    .update(`${binding.channel}:${binding.purpose}:${binding.userId}:${code}`)
    .digest("hex");

/** Il destinatario, come impronta: i contatori non tengono numeri in chiaro. */
const hashTarget = (target: string) =>
  createHash("sha256")
    .update(
      `${otpPepper()}:target:${String(target || "")
        .trim()
        .toLowerCase()}`,
    )
    .digest("hex");

export const buildOtpTargetCounterKey = (target: string) => hashTarget(target);

const getAppBaseUrl = () =>
  process.env.AUTH_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3001";

/**
 * Il codice restituito nella risposta, in sviluppo.
 *
 * **Il `sent` non entra piu nella decisione.** Prima era
 * `!sent && shouldExposeVerificationPreviewCode()`: il codice si vedeva solo
 * quando la consegna **falliva**. Con un trasporto configurato — anche una
 * sandbox, anche un doppio di prova — la consegna riesce, e chi sviluppa
 * restava senza codice proprio quando aveva finalmente un canale da provare.
 * Era una condizione nata come ripiego («se non parte, almeno leggilo») e
 * diventata un ostacolo.
 *
 * La difesa e una sola e non cambia: `shouldExposeVerificationPreviewCode()`
 * vuole `NODE_ENV !== "production"` **e** `AUTH_ALLOW_TEST_CODES === "true"`.
 * In produzione non c'e nessuna combinazione di variabili che faccia uscire un
 * codice da qui.
 */
const getPreviewCode = (_sent: boolean, code: string) =>
  shouldExposeVerificationPreviewCode() ? code : null;

export const createVerificationReference = () =>
  `verify_${randomBytes(24).toString("hex")}`;

export const findUserByVerificationReference = async (reference: string) => {
  const normalizedReference = String(reference || "").trim();
  if (!normalizedReference) return null;

  const byToken = await prisma.user.findUnique({
    where: { token_verification_id: normalizedReference },
  });
  if (byToken) return byToken;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedReference,
    )
  ) {
    return null;
  }

  return prisma.user.findUnique({ where: { id: normalizedReference } });
};

/**
 * Il numero in archivio, come si mostra a chi non ha ancora una sessione.
 *
 * Passa dalla forma canonica perche il mascheramento conti le cifre giuste:
 * `340 123 4567` e `+393401234567` hanno lunghezze diverse e produrrebbero due
 * maschere diverse per lo stesso numero. Un numero illeggibile resta
 * mascherato lo stesso — mai restituito in chiaro per il fatto di essere
 * scritto male.
 */
export const maskStoredPhone = (phone?: string | null) => {
  if (!phone) return null;
  const numero = normalizePhoneNumber(phone);
  return maskPhoneNumber(numero.valid ? numero.e164 : String(phone));
};

const buildVerificationPayload = (user: {
  id: string;
  email: string;
  phone?: string | null;
  email_verified_at?: Date | null;
  phone_verified_at?: Date | null;
  phone_verification_required?: boolean;
}) => ({
  userId: user.id,
  email: user.email,
  /*
    **Il numero si mostra mascherato.** Questa struttura esce da rotte che si
    raggiungono senza sessione (registrazione, login non completato, invio e
    conferma del codice): restituire il numero per intero significherebbe che
    chi ha un identificativo di verifica legge il cellulare del titolare.
    Prefisso e ultime tre cifre bastano a chi si sta verificando per
    riconoscere il proprio, e non bastano a nessun altro per comporlo.
  */
  phone: maskStoredPhone(user.phone),
  emailRequired: !user.email_verified_at,
  phoneRequired: isPhoneVerificationBlocking(user),
});

/**
 * **«Account non pienamente attivato», in una riga sola (ADR-0115).**
 *
 * Un account e non pienamente attivato quando **richiede** la verifica del
 * telefono e non l'ha ancora ottenuta. L'unica limitazione che ne discende e
 * quella dichiarata: **non si crea una sessione**. Non ce ne sono altre, e non
 * se ne inventano: chi e dentro resta dentro, chi deve entrare verifica prima.
 *
 * L'email non entra in questa definizione. Da PP-05 l'indirizzo e obbligatorio
 * ma si verifica **dopo**: un'email non verificata non impedisce l'accesso, si
 * vede sulla pagina Account con la sua chiamata all'azione, e porta con se una
 * sola limitazione, definita in `findOrCreateOAuthUser`.
 */
export const isPhoneVerificationBlocking = (user: {
  phone?: string | null;
  phone_verified_at?: Date | null;
  phone_verification_required?: boolean;
}) =>
  isPhoneVerificationRequired() &&
  Boolean(user.phone_verification_required && user.phone) &&
  !user.phone_verified_at;

/**
 * Apre una challenge nuova e chiude quelle vive dello stesso canale.
 *
 * ## Le tre cose che questa funzione fa e prima non faceva
 *
 * **1. Il cooldown.** Se una challenge dello stesso canale e nata da meno di
 * `OTP_RESEND_COOLDOWN_SECONDS`, non se ne apre un'altra: si solleva
 * `RESEND_TOO_SOON` e **la challenge esistente resta viva**. Prima ogni invio
 * chiudeva il precedente, quindi due clic sul pulsante «rimanda» rendevano
 * inutile il codice appena arrivato — e chi conosceva un identificativo poteva
 * tenere un account permanentemente inverificabile invalidandogli il codice a
 * ripetizione.
 *
 * **2. Si chiude tutto il canale, non solo lo stesso scopo.** Il `where`
 * portava anche `purpose`, quindi una challenge `signup` e una `verify_phone`
 * convivevano: due codici validi insieme sullo stesso numero, e la verifica —
 * che il proposito non lo guardava — accettava il piu recente dei due. Adesso
 * chi apre chiude, per canale, con l'unica eccezione del reset password, che ha
 * un flusso e una vita sue.
 *
 * **3. Il `target` e quello passato, e la verifica lo ricontrolla.** Vedi
 * `verifyInternalChallenge`.
 */
const createInternalChallenge = async ({
  userId,
  channel,
  purpose,
  target,
  expiresInMinutes,
}: {
  userId: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  target: string;
  expiresInMinutes: number;
}) => {
  const adesso = new Date();

  const ultima = await prisma.authVerificationChallenge.findFirst({
    where: {
      user_id: userId,
      channel,
      purpose: { not: "reset_password" },
      consumed_at: null,
      expires_at: { gt: adesso },
    },
    orderBy: { created_at: "desc" },
  });

  const rinvio = resolveOtpResendDecision(ultima?.created_at || null, adesso);
  if (!rinvio.allowed) {
    throw new VerificationRejected("RESEND_TOO_SOON", rinvio.retryAfterSeconds);
  }

  const code = createOtpCode();

  /*
    **Chiudere e aprire sono una cosa sola, e il database lo fa rispettare.**

    Le due scritture erano separate, e in sequenza il risultato era giusto. In
    parallelo no: N richieste simultanee eseguono prima tutti gli `UPDATE` — che
    non trovano niente da chiudere, perche nessuno ha ancora inserito — e poi
    tutti gli `INSERT`. La sonda contro Postgres lo ha misurato (P3, dodici
    reinvii simultanei): **dodici challenge vive, dodici codici validi insieme**.
    Il cooldown si scavalcava mandando le richieste insieme invece che in fila, e
    dodici codici validi con cinque tentativi ciascuno moltiplicano per dodici le
    probabilita di indovinarne uno.

    Adesso le due scritture stanno in una transazione, e — cio che conta
    davvero — l'invariante «una challenge viva per utente e canale» e un
    **indice unico parziale** (migrazione `20260904120000_pp05_...`): non e piu
    una cosa che questo codice promette, e una cosa che il database non lascia
    accadere. Chi perde la corsa riceve una violazione di unicita, e qui la si
    traduce nel cooldown — che e la risposta vera: un codice valido esiste gia
    ed e gia partito.
  */
  try {
    await prisma.$transaction([
      prisma.authVerificationChallenge.updateMany({
        where: {
          user_id: userId,
          channel,
          purpose: { not: "reset_password" },
          consumed_at: null,
        },
        data: {
          consumed_at: adesso,
        },
      }),
      prisma.authVerificationChallenge.create({
        data: {
          user_id: userId,
          channel,
          purpose,
          target,
          code_hash: hashOtpCode(code, { userId, channel, purpose }),
          /*
            **`created_at` si scrive, non si lascia al database.** Il cooldown lo
            confronta con `new Date()` dell'applicazione: mescolare l'orologio di
            Postgres con quello del processo fa durare il cooldown un po' di piu o
            un po' di meno a seconda della deriva fra i due, e su una finestra di
            sessanta secondi la deriva conta.
          */
          created_at: adesso,
          expires_at: new Date(adesso.getTime() + expiresInMinutes * 60 * 1000),
          /*
            **Lo stato iniziale si scrive, non si eredita dallo schema.** Sono i
            valori predefiniti delle colonne, quindi Postgres li metterebbe
            comunque; scriverli rende la riga completa nel momento in cui nasce,
            indipendentemente da dove vivano i default — ed e la differenza fra un
            `where: { consumed_at: null }` che trova la riga e uno che non la trova
            perche la colonna, in quel momento, non e stata ancora popolata da
            nessuno.
          */
          consumed_at: null,
          attempts: 0,
        },
      }),
    ]);
  } catch (error: any) {
    /*
      `P2002` e la violazione di unicita di Prisma. Qui vuol dire una cosa
      sola: un'altra richiesta simultanea ha gia aperto la challenge di questo
      canale. Non e un errore da registrare — e la corsa che l'indice esiste
      per perdere — e la risposta corretta e la stessa del cooldown.
    */
    if (error?.code === "P2002") {
      throw new VerificationRejected(
        "RESEND_TOO_SOON",
        OTP_RESEND_COOLDOWN_SECONDS,
      );
    }
    throw error;
  }

  return code;
};

/**
 * Il testo dell'SMS, in un posto solo.
 *
 * Corto e senza link, per tre ragioni pratiche: sta in un solo segmento
 * GSM-7 (costa un SMS e non due), si legge dalla schermata di blocco senza
 * aprire niente, e non insegna a nessuno che EasyGame manda link via SMS —
 * che e la cosa che rende credibile il messaggio di chi imita EasyGame.
 */
export const buildPhoneVerificationSmsText = (code: string) =>
  `EasyGame: il tuo codice di verifica e ${code}. Scade tra ${PHONE_CODE_TTL_MINUTES} minuti. Non condividerlo con nessuno.`;

/**
 * L'HTML dell'email di verifica, estratto per essere richiamabile anche
 * dall'anteprima di sviluppo (`/private/email-preview`) senza duplicare il
 * markup: la preview deve mostrare esattamente quello che si spedisce.
 */
/**
 * **Marchio EasyGame, e non e una scelta di stile** (PP-05B, ADR-0116).
 *
 * La verifica di un recapito la manda EasyGame, non il club: chi la riceve
 * deve poter distinguere questo messaggio da una comunicazione della propria
 * societa, perche e l'unico dei due che gli chiede di digitare qualcosa. Un
 * codice che arriva con il logo di chiunque insegna a fidarsi di chiunque.
 *
 * Restituisce **le due forme**: prima il testo semplice si scriveva a mano
 * accanto all'HTML, in una stringa che gia divergeva — diceva «Il tuo codice
 * EasyGame e …» dove l'HTML diceva «Verifica accesso EasyGame».
 */
export const buildVerificationEmail = ({
  firstName,
  code,
}: {
  firstName?: string | null;
  code: string;
}) => {
  const nome = String(firstName || "").trim();
  return renderEmailDocument({
    brand: EASYGAME_BRAND,
    preheader: `Il tuo codice scade tra ${EMAIL_CODE_TTL_MINUTES} minuti.`,
    blocks: [
      { kind: "heading", text: "Verifica accesso EasyGame" },
      {
        kind: "text",
        text: nome
          ? `Ciao ${nome}, usa questo codice per completare l'accesso:`
          : "Usa questo codice per completare l'accesso:",
      },
      { kind: "code", value: code },
      {
        kind: "text",
        text: `Il codice scade tra ${EMAIL_CODE_TTL_MINUTES} minuti e vale una volta sola.`,
      },
      {
        kind: "footnote",
        text: "Se non hai richiesto tu questo codice, ignora il messaggio: senza il codice non succede niente.",
      },
    ],
  });
};

export const sendEmailVerificationChallenge = async (
  user: {
    id: string;
    email: string;
    first_name?: string | null;
  },
  purpose: VerificationPurpose = "signup",
): Promise<VerificationDispatchResult> => {
  const code = await createInternalChallenge({
    userId: user.id,
    channel: "email",
    purpose,
    target: user.email,
    expiresInMinutes: EMAIL_CODE_TTL_MINUTES,
  });

  const { html, text } = buildVerificationEmail({
    firstName: user.first_name,
    code,
  });
  const delivery = await sendTransactionalEmail({
    to: user.email,
    subject: "Verifica il tuo account EasyGame",
    text,
    html,
  });

  return {
    sent: delivery.status === "sent",
    previewCode: getPreviewCode(delivery.status === "sent", code),
  };
};

/**
 * **Il codice lo fa EasyGame, l'operatore lo porta. Sempre (ADR-0114).**
 *
 * Prima c'erano due meccanismi: con Twilio configurato il codice lo generava e
 * lo verificava Twilio, senza Twilio lo generava e lo verificava questo file.
 * Due implementazioni della stessa cosa, con due comportamenti diversi — tetto
 * dei tentativi, scadenza, consumo monouso e corsa fra invio e conferma valgono
 * solo nella seconda — e con la piu debole attiva **proprio in produzione**,
 * cioe l'unico posto dove Twilio era configurato. Nessun test poteva vederlo,
 * perche nei test Twilio non c'era mai.
 *
 * Adesso la challenge si scrive sempre, e il trasporto e solo un trasporto.
 */
export const sendPhoneVerificationChallenge = async (
  user: {
    id: string;
    phone?: string | null;
  },
  purpose: VerificationPurpose = "signup",
): Promise<VerificationDispatchResult> => {
  /*
    Si normalizza qui e non ci si fida della colonna: una riga scritta prima di
    PP-05 puo contenere `340 123 4567`, e il legame fra challenge e numero
    corrente (`verifyInternalChallenge`) confronta forme canoniche. Un numero
    illeggibile non apre nessuna challenge e non fa partire nessun SMS.
  */
  const numero = normalizePhoneNumber(user.phone);
  if (!numero.valid) {
    return { sent: false, previewCode: null };
  }

  const code = await createInternalChallenge({
    userId: user.id,
    channel: "phone",
    purpose,
    target: numero.e164,
    expiresInMinutes: PHONE_CODE_TTL_MINUTES,
  });

  const delivery = await sendSms({
    to: numero.e164,
    text: buildPhoneVerificationSmsText(code),
  });

  return {
    sent: delivery.status === "sent",
    previewCode: getPreviewCode(delivery.status === "sent", code),
  };
};

/**
 * **Una challenge vale per il destinatario per cui e nata, e per nessun altro.**
 *
 * Il difetto che chiude (PP-05). La ricerca era per `user_id` e `channel` e
 * basta: il `target` scritto sulla riga non veniva mai riletto. Bastava
 * quindi:
 *
 * 1. registrarsi con il proprio numero e farsi mandare il codice;
 * 2. cambiare il numero del profilo con quello di un altro — la scrittura
 *    azzera `phone_verified_at`, ed e giusto che lo faccia;
 * 3. confermare con il codice ricevuto **sul proprio** numero.
 *
 * Il risultato era `phone_verified_at` valorizzato su un numero che nessuno
 * aveva mai verificato: la regola «cambio numero → nuova verifica» esisteva
 * nella riga che azzera la colonna e non esisteva in quella che la riscrive.
 * Lo stesso vale per l'indirizzo email.
 *
 * Adesso il destinatario corrente entra nel `where`, in forma canonica. Se non
 * corrisponde, la challenge non si trova, e non si trova **senza spendere un
 * tentativo**: non c'e niente da consumare su una riga che non riguarda questo
 * destinatario.
 */
const verifyInternalChallenge = async ({
  userId,
  channel,
  target,
  code,
}: {
  userId: string;
  channel: VerificationChannel;
  target: string;
  code: string;
}) => {
  const challenge = await prisma.authVerificationChallenge.findFirst({
    where: {
      user_id: userId,
      channel,
      target,
      // Le challenge di reset password hanno un token lungo e un flusso
      // proprio: non devono essere consumate da una conferma OTP, altrimenti
      // un reset in corso verrebbe invalidato da un tentativo di verifica.
      purpose: { not: "reset_password" },
      consumed_at: null,
      expires_at: {
        gt: new Date(),
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  if (!challenge) {
    throw new VerificationRejected();
  }

  /*
    Il confronto e a tempo costante come quello del reset password. Su un
    codice a sei cifre la differenza pratica e nulla — il tetto dei tentativi
    chiude molto prima di qualunque misura — ma un confronto fra impronte si
    scrive cosi, e avere due primitive diverse per la stessa cosa nello stesso
    file e il modo in cui una delle due resta indietro.
  */
  const fornita = Buffer.from(
    hashOtpCode(code, {
      userId,
      channel,
      purpose: challenge.purpose,
    }),
    "hex",
  );
  const attesa = Buffer.from(challenge.code_hash, "hex");
  const corrisponde =
    fornita.length === attesa.length && timingSafeEqual(fornita, attesa);

  const esito = await spendiUnTentativo(challenge.id, corrisponde);
  if (esito !== "valido") {
    throw new VerificationRejected();
  }

  return challenge;
};

/**
 * **Un tentativo si prende prima di giudicare il codice, e si prende in una
 * scrittura sola.**
 *
 * **Il difetto che chiude (B-H1, revisione finale della Wave 6).** La
 * verifica leggeva `attempts`, confrontava il codice e riscriveva
 * `attempts + 1` come **valore assoluto**. Sotto N richieste simultanee ognuna
 * leggeva 0 e ognuna scriveva 1: il contatore contava le raffiche, non i
 * tentativi. Misurato dal database vero: **60 codici sbagliati in parallelo,
 * `attempts = 1`, challenge ancora viva, e il codice giusto accettato subito
 * dopo**. Il codice e a sei cifre, la challenge si fa emettere senza sessione
 * e il successo restituisce una sessione: con B-H2 — che lasciava passare le
 * raffiche anche dal contatore per indirizzo — era una presa di possesso
 * dell'account.
 *
 * **La forma.** Tre scritture condizionate, nessuna lettura fra una e l'altra:
 *
 * 1. si **spende** il tentativo: `UPDATE … SET attempts = attempts + 1 WHERE
 *    id = ? AND consumed_at IS NULL AND attempts < MAX`. Postgres valuta il
 *    `WHERE` sulla riga bloccata, quindi N richieste simultanee ne fanno
 *    passare **al massimo MAX**, e le altre trovano zero righe: la challenge
 *    e esaurita (o consumata) e si chiude, senza guardare il codice;
 * 2. se il codice e sbagliato e il tentativo era l'ultimo, la challenge si
 *    **consuma** con lo stesso `WHERE` sul tetto — chi ha spento l'ultimo
 *    tentativo la chiude, gli altri non hanno niente da chiudere;
 * 3. se il codice e giusto, si consuma **solo se e ancora viva**: due
 *    richieste con il codice giusto nello stesso istante producono **una**
 *    verifica, non due, perche una challenge e monouso e la seconda scrittura
 *    trova `consumed_at` gia valorizzato.
 *
 * Il codice si confronta **dopo** aver speso il tentativo, non prima: un
 * confronto che precede la scrittura e la stessa lettura-poi-scrittura che
 * questo commento chiude. Lo stesso schema vale per il reset della password,
 * dove il token e lungo ma la corsa era identica.
 *
 * La prova sotto concorrenza vera sta nella sonda
 * (`scripts/wave-6-security-probe.mjs`, U-70), dalla rotta.
 */
const spendiUnTentativo = async (
  challengeId: string,
  codiceValido: boolean,
): Promise<"valido" | "sbagliato" | "esaurito"> => {
  if (!(await prendiUnTentativo(challengeId))) return "esaurito";
  if (!codiceValido) return "sbagliato";

  const consumata = await prisma.authVerificationChallenge.updateMany({
    where: { id: challengeId, consumed_at: null },
    data: { consumed_at: new Date() },
  });

  return consumata.count === 1 ? "valido" : "esaurito";
};

/**
 * Spende un tentativo sulla challenge, in una scrittura condizionata sola.
 * `false` se era gia al tetto o consumata.
 *
 * **Al tetto non si scrive `consumed_at`, di proposito.** Il tetto vive gia
 * nel `WHERE` (`attempts < MAX`): una challenge a cinque tentativi non e piu
 * spendibile da nessuno, e non serve una seconda scrittura per dirlo. La
 * prima stesura la chiudeva — «chi spegne l'ultimo tentativo la consuma» —
 * e quella scrittura **competeva** con il consumo di un codice giusto ancora
 * in volo: cinque richieste con il codice giusto e una sesta qualunque
 * potevano finire con la challenge chiusa e **nessuna** verifica riuscita.
 * Un doppio in memoria lo ha mostrato prima del database. Due scritture
 * condizionate, e basta: prendere il tentativo, consumare se valido.
 */
const prendiUnTentativo = async (challengeId: string) => {
  const speso = await prisma.authVerificationChallenge.updateMany({
    where: {
      id: challengeId,
      consumed_at: null,
      attempts: { lt: MAX_OTP_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });

  return speso.count === 1;
};

export const confirmEmailVerification = async (
  userReference: string,
  code: string,
) => {
  const user = await findUserByVerificationReference(userReference);
  if (!user) throw new VerificationRejected();

  await verifyInternalChallenge({
    userId: user.id,
    channel: "email",
    target: user.email,
    code,
  });

  /*
    **Si scrive solo se l'indirizzo e ancora quello.** Fra l'emissione della
    challenge e la conferma qualcuno puo aver cambiato l'indirizzo da un'altra
    sessione: la scrittura condizionata fa fallire quella corsa invece di
    stampare «verificato» sull'indirizzo nuovo. `updateMany` con il `where`,
    non `update` con l'id.
  */
  const scritto = await prisma.user.updateMany({
    where: { id: user.id, email: user.email },
    data: { email_verified_at: new Date() },
  });
  if (scritto.count !== 1) throw new VerificationRejected();

  const aggiornato = await prisma.user.findUnique({ where: { id: user.id } });
  if (!aggiornato) throw new VerificationRejected();
  return aggiornato;
};

export const confirmPhoneVerification = async (
  userReference: string,
  code: string,
) => {
  const user = await findUserByVerificationReference(userReference);

  if (!user) {
    throw new VerificationRejected();
  }

  const numero = normalizePhoneNumber(user.phone);
  if (!numero.valid) {
    /*
      Stesso errore di un codice sbagliato, di proposito: «telefono non
      disponibile» diceva a chi provava identificativi a caso che quello
      corrispondeva a un account privo di numero. Anti-enumeration
      (14-security.md): la risposta non distingue i casi.
    */
    throw new VerificationRejected();
  }

  await verifyInternalChallenge({
    userId: user.id,
    channel: "phone",
    target: numero.e164,
    code,
  });

  const scritto = await prisma.user.updateMany({
    where: { id: user.id, phone: user.phone },
    data: { phone_verified_at: new Date() },
  });
  if (scritto.count !== 1) throw new VerificationRejected();

  const aggiornato = await prisma.user.findUnique({ where: { id: user.id } });
  if (!aggiornato) throw new VerificationRejected();
  return aggiornato;
};

export const ensurePrimaryClubForUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      club_access: true,
    },
  });

  if (!user || !user.is_club_creator) {
    return null;
  }

  if (user.club_access.length > 0) {
    return user.club_access[0]?.organization_id || null;
  }

  const userMetadata = asMetadataRecord(user.user_metadata);

  const organizationName =
    user.organization_name ||
    (userMetadata.organizationName
      ? String(userMetadata.organizationName)
      : "") ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    "Nuovo Club";

  const club = await prisma.club.create({
    data: {
      name: organizationName,
      slug: `${slugify(organizationName)}-${Date.now().toString().slice(-6)}`,
      creator_id: user.id,
      contact_email: user.email,
      contact_phone: user.phone || null,
      address: userMetadata.address || null,
      city: userMetadata.city || null,
      postal_code: userMetadata.postalCode || null,
      region: userMetadata.region || null,
      province: userMetadata.province || null,
      country: "Italia",
    },
  });

  await prisma.organizationUser.create({
    data: {
      organization_id: club.id,
      user_id: user.id,
      role: "owner",
      is_primary: true,
    },
  });

  await prisma.dashboard.create({
    data: {
      organization_id: club.id,
      creator_id: user.id,
      slug: `${slugify(organizationName)}-dashboard-${Date.now()
        .toString()
        .slice(-6)}`,
      settings: {
        theme: "default",
        layout: "standard",
        widgets: DEFAULT_WIDGETS,
      },
    },
  });

  return club.id;
};

export const finalizeVerifiedSession = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Utente non trovato");
  }

  /*
    **L'email non blocca piu la sessione (ADR-0115).**

    Prima questa riga sollevava «Email non verificata» e nessun account senza
    indirizzo confermato poteva entrare — nemmeno per vedere la pagina che gli
    chiedeva di confermarlo. Su un'installazione senza SMTP configurato quello
    era un blocco totale: l'account si creava e non si poteva usare, e la
    schermata che lo diceva era irraggiungibile.

    La regola nuova: l'indirizzo e **obbligatorio** e si verifica **dopo**. Chi
    non l'ha verificato entra, e trova sulla pagina Account l'avviso «Email non
    verificata» con il pulsante che manda il codice. La limitazione che
    l'accompagna e una sola, ed e in `findOrCreateOAuthUser`: un indirizzo non
    verificato **non vale come identita**, quindi non protegge l'account da chi
    quell'indirizzo lo possiede davvero e lo dimostra.

    Il telefono invece blocca, ed e l'unico blocco: `isPhoneVerificationBlocking`.
  */
  if (isPhoneVerificationBlocking(user)) {
    return {
      user,
      session: null,
      verification: buildVerificationPayload(user),
    };
  }

  await ensurePrimaryClubForUser(user.id);

  const refreshedUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!refreshedUser) {
    throw new Error("Utente non trovato");
  }

  const session = await createSessionForUser(refreshedUser);
  return {
    user: refreshedUser,
    session,
    verification: buildVerificationPayload(refreshedUser),
  };
};

export const createOAuthBootstrapUser = async ({
  email,
  firstName,
  lastName,
  avatarUrl,
  provider,
  providerAccountId,
}: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  provider: string;
  providerAccountId: string;
}) => {
  const randomPassword = randomBytes(24).toString("hex");
  const password_hash = await hashPassword(randomPassword);

  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      first_name: firstName || null,
      last_name: lastName || null,
      email_verified_at: new Date(),
      user_metadata: {
        role: "user",
        avatarUrl: avatarUrl || undefined,
        oauthPreferredProvider: provider,
      },
    },
  });

  await prisma.externalAccount.create({
    data: {
      user_id: user.id,
      provider,
      provider_account_id: providerAccountId,
      email,
      display_name:
        [firstName, lastName].filter(Boolean).join(" ").trim() || null,
      avatar_url: avatarUrl || null,
    },
  });

  return user;
};

export const upsertExternalAccount = async ({
  userId,
  provider,
  providerAccountId,
  email,
  displayName,
  avatarUrl,
  data,
}: {
  userId: string;
  provider: string;
  providerAccountId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  data?: Record<string, any>;
}) => {
  await prisma.externalAccount.upsert({
    where: {
      provider_provider_account_id: {
        provider,
        provider_account_id: providerAccountId,
      },
    },
    update: {
      email: email || null,
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
      data: data || undefined,
    },
    create: {
      user_id: userId,
      provider,
      provider_account_id: providerAccountId,
      email: email || null,
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
      data: data || undefined,
    },
  });
};

type OAuthProviderConfig = {
  id: "google" | "microsoft";
  label: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string;
  profile: (accessToken: string) => Promise<{
    providerAccountId: string;
    email: string;
    emailVerified: boolean;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    raw: Record<string, any>;
  }>;
};

/**
 * Il tenant Microsoft su cui si autentica, `common` se non e stato scelto.
 *
 * `common`, `organizations` e `consumers` sono i tre endpoint **multi-tenant**:
 * accettano l'utente di qualunque directory, anche una creata poco fa da chi
 * sta attaccando. Un tenant nominato e invece una directory sola, la cui
 * amministrazione e nota.
 */
const MICROSOFT_SHARED_TENANTS = new Set([
  "common",
  "organizations",
  "consumers",
]);

/** Due indirizzi sono lo stesso indirizzo. Confronto normalizzato, come al login. */
const sameEmail = (a: unknown, b: unknown) =>
  String(a ?? "")
    .trim()
    .toLowerCase() ===
    String(b ?? "")
      .trim()
      .toLowerCase() && String(a ?? "").trim() !== "";

const microsoftTenant = () =>
  String(process.env.MICROSOFT_TENANT_ID || "").trim() || "common";

const microsoftTenantIsTrusted = () =>
  !MICROSOFT_SHARED_TENANTS.has(microsoftTenant().toLowerCase());

const oauthProviders: Record<string, OAuthProviderConfig | undefined> = {
  google:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          id: "google",
          label: "Google",
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUrl: "https://oauth2.googleapis.com/token",
          scope: "openid email profile",
          profile: async (accessToken: string) => {
            const response = await fetch(
              "https://openidconnect.googleapis.com/v1/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
            );
            const payload = (await response.json()) as Record<string, any>;
            return {
              providerAccountId: String(payload.sub),
              email: String(payload.email),
              emailVerified: Boolean(payload.email_verified),
              firstName: payload.given_name || null,
              lastName: payload.family_name || null,
              displayName: payload.name || null,
              avatarUrl: payload.picture || null,
              raw: payload,
            };
          },
        }
      : undefined,
  microsoft:
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? {
          id: "microsoft",
          label: "Microsoft",
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          authorizationUrl: `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/authorize`,
          tokenUrl: `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/token`,
          scope: "openid profile email User.Read",
          profile: async (accessToken: string) => {
            const response = await fetch(
              "https://graph.microsoft.com/oidc/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
            );
            const payload = (await response.json()) as Record<string, any>;
            return {
              providerAccountId: String(payload.sub || payload.oid),
              email: String(payload.email || payload.preferred_username),
              /*
                **Microsoft non verifica l'indirizzo, e lo dice.**

                Il claim `email` di Entra ID e un attributo che l'amministratore
                del tenant scrive: non e legato a un dominio dimostrato. Con
                l'endpoint `/common` il tenant lo puo creare chiunque in pochi
                minuti — quindi chiunque puo presentarsi con l'indirizzo di un
                altro. E la vulnerabilita che Microsoft stessa documenta
                («nOAuth»): l'indirizzo non va usato per decidere chi sei.

                Diventa affidabile solo quando il deployment fissa **il proprio**
                tenant: li l'amministratore e il club, e la sua parola vale.
                Senza `MICROSOFT_TENANT_ID` l'indirizzo resta non verificato, e
                piu sotto un indirizzo non verificato non apre nessun conto
                esistente.
              */
              emailVerified: microsoftTenantIsTrusted(),
              firstName: payload.given_name || null,
              lastName: payload.family_name || null,
              displayName: payload.name || null,
              avatarUrl: null,
              raw: payload,
            };
          },
        }
      : undefined,
};

export const getEnabledOAuthProviders = () =>
  Object.values(oauthProviders).filter(
    (provider): provider is OAuthProviderConfig => Boolean(provider),
  );

export const getOAuthProviderById = (providerId: string) => {
  const provider = oauthProviders[providerId];
  if (!provider) {
    throw new Error("Provider OAuth non configurato");
  }
  return provider;
};

export const getOAuthRedirectUri = (providerId: string) =>
  `${getAppBaseUrl()}/api/v1/auth/oauth/${providerId}/callback`;

export const buildOAuthStateCookieName = (providerId: string) =>
  `easygame_oauth_state_${providerId}`;

export const buildOAuthAuthorizationUrl = ({
  providerId,
  state,
}: {
  providerId: string;
  state: string;
}) => {
  const provider = getOAuthProviderById(providerId);
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: getOAuthRedirectUri(providerId),
    response_type: "code",
    scope: provider.scope,
    state,
  });

  if (providerId === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "select_account");
  }

  return `${provider.authorizationUrl}?${params.toString()}`;
};

export const exchangeOAuthCode = async ({
  providerId,
  code,
}: {
  providerId: string;
  code: string;
}) => {
  const provider = getOAuthProviderById(providerId);
  const body = new URLSearchParams({
    code,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uri: getOAuthRedirectUri(providerId),
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error("Scambio OAuth non riuscito");
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
  };

  if (!tokenPayload.access_token) {
    throw new Error("Access token non disponibile");
  }

  return provider.profile(tokenPayload.access_token);
};

export const findOrCreateOAuthUser = async ({
  providerId,
  providerAccountId,
  email,
  emailVerified,
  firstName,
  lastName,
  displayName,
  avatarUrl,
  raw,
}: {
  providerId: string;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  raw?: Record<string, any>;
}) => {
  const existingAccount = await prisma.externalAccount.findUnique({
    where: {
      provider_provider_account_id: {
        provider: providerId,
        provider_account_id: providerAccountId,
      },
    },
    include: {
      user: true,
    },
  });

  if (existingAccount?.user) {
    const existingMetadata = asMetadataRecord(
      existingAccount.user.user_metadata,
    );
    const updatedUser = await prisma.user.update({
      where: { id: existingAccount.user.id },
      data: {
        /*
          **Verificato da chi, e per quale indirizzo.**

          L'identita qui e dimostrata — il provider ha riconosciuto lo stesso
          `sub` di sempre — ma «l'indirizzo e verificato» resta una cosa che
          dice il provider, e la dice **del proprio** indirizzo, non di
          qualunque indirizzo l'account porti in quel momento.

          Senza il confronto, questo ramo era la strada che riapriva il difetto
          chiuso ieri: si collega il proprio account a Google, si cambia il
          proprio indirizzo con quello del tutore di un'altra famiglia — il
          cambio azzera `email_verified_at`, ed e quell'azzeramento a chiudere
          la porta — e poi si rientra da Google. Stesso `sub`, quindi nessun
          controllo, e qui si ristampava «verificato» su un indirizzo che
          nessuno ha mai verificato. Da li l'area genitore riconosceva di
          nuovo il legame per indirizzo, con dentro pagamenti, fatture e
          certificati medici di quel minore.

          Si stampa quindi solo se il provider ha verificato **quell'**
          indirizzo: quello che porta l'account adesso.
        */
        email_verified_at:
          existingAccount.user.email_verified_at ||
          (emailVerified && sameEmail(email, existingAccount.user.email)
            ? new Date()
            : null),
        user_metadata: {
          ...existingMetadata,
          avatarUrl: avatarUrl || existingMetadata.avatarUrl,
          oauthPreferredProvider: providerId,
        },
      },
    });

    await upsertExternalAccount({
      userId: updatedUser.id,
      provider: providerId,
      providerAccountId,
      email,
      displayName,
      avatarUrl,
      data: raw,
    });

    return updatedUser;
  }

  /*
    **Un indirizzo non verificato non apre nessun conto, e non ne crea.**

    Sotto questa riga ci sono i due percorsi che si fidano dell'indirizzo: uno
    entra in un conto che esiste gia, l'altro ne crea uno nuovo. Entrambi
    prendono per buono che chi si presenta possieda quell'indirizzo, e finche
    quella prova non c'era il primo era una **presa di possesso**: bastava un
    tenant proprio, un utente con l'indirizzo della vittima e un giro di login
    per ricevere il cookie di sessione della vittima — password, OTP e limiti
    di tentativi scavalcati tutti insieme.

    Il secondo non e innocuo per conto suo: creare un conto sull'indirizzo di
    un altro lo occupa, e quando il legittimo proprietario arrivera davvero
    verificato finira **dentro** il conto occupato, con chi lo aveva occupato
    ancora collegato.

    Il ramo di sopra — il provider riconosce lo stesso `sub` — non passa di
    qui: quell'identita e dimostrata, e chi si e gia collegato continua a
    entrare.
  */
  if (!emailVerified) {
    throw new Error(
      /*
        Il messaggio finisce in `?oauthError=` sulla pagina di login: non ci si
        mette l'indirizzo, che e un dato personale e le query string si
        registrano nei log di ogni intermediario.
      */
      `Accesso negato: ${providerId} non certifica che l'indirizzo dichiarato ` +
        "appartenga a chi ha effettuato l'accesso, e un indirizzo non verificato " +
        "non puo aprire ne creare un account. " +
        "Accedi con la password, oppure configura MICROSOFT_TENANT_ID sul tenant del club.",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    const existingMetadata = asMetadataRecord(existingUser.user_metadata);

    /*
      **L'unica limitazione di un'email non verificata (ADR-0115).**

      Da PP-05 un account con l'indirizzo non confermato ha una sessione. Cio
      apre una strada che prima era chiusa da sola: registro un account con
      `vittima@example.com`, non verifico niente, e uso il prodotto. Quando la
      vittima arriva davvero — con Google, che l'indirizzo lo certifica — questo
      ramo la fa entrare **dentro** il conto che ho occupato, e io ci resto
      insieme a lei, con la mia password ancora buona e le mie sessioni ancora
      aperte.

      Chi dimostra di possedere l'indirizzo ha piu titolo di chi lo ha solo
      scritto in un modulo. Quindi, quando un account mai verificato viene
      adottato da un accesso esterno che certifica quell'indirizzo, la
      credenziale dell'occupante **decade**: password sostituita con un valore
      casuale che nessuno conosce, sessioni chiuse tutte. Non si cancella
      niente e non si perde niente: chi era il legittimo proprietario e non
      aveva mai verificato usa «Password dimenticata» e rientra dall'indirizzo
      che ora e provato suo.

      Non tocca chi si era gia collegato con lo stesso `sub` (ramo di sopra) ne
      chi aveva l'indirizzo gia verificato: li nessuna occupazione e possibile.
    */
    const eraOccupatoSenzaProva = !existingUser.email_verified_at;
    if (eraOccupatoSenzaProva) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          password_hash: await hashPassword(randomBytes(32).toString("hex")),
        },
      });
      await prisma.session.deleteMany({ where: { user_id: existingUser.id } });
    }

    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        first_name: existingUser.first_name || firstName || null,
        last_name: existingUser.last_name || lastName || null,
        email_verified_at: existingUser.email_verified_at || new Date(),
        user_metadata: {
          ...existingMetadata,
          name:
            [
              existingUser.first_name || firstName,
              existingUser.last_name || lastName,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            displayName ||
            undefined,
          avatarUrl: avatarUrl || existingMetadata.avatarUrl,
          oauthPreferredProvider: providerId,
        },
      },
    });

    await upsertExternalAccount({
      userId: updatedUser.id,
      provider: providerId,
      providerAccountId,
      email,
      displayName,
      avatarUrl,
      data: raw,
    });

    return updatedUser;
  }

  return createOAuthBootstrapUser({
    email,
    firstName,
    lastName,
    avatarUrl,
    provider: providerId,
    providerAccountId,
  });
};

export const createSessionForOAuthUser = async (userId: string) => {
  const { session } = await finalizeVerifiedSession(userId);
  if (!session) {
    throw new Error("Sessione OAuth non disponibile");
  }
  return session;
};

export const createOAuthState = () => randomUUID();

export const getAuthCapabilities = async () => {
  const emailConfigured = await isEmailDeliveryConfigured();
  return {
    emailVerification: true,
    /*
      **Il numero si chiede sempre.** Prima questa chiave diceva alla schermata
      di registrazione se mostrare il campo «Cellulare», e senza Twilio il
      campo spariva. Oggi il campo c'e sempre, perche il numero e obbligatorio
      per regola di prodotto; queste chiavi dicono invece se il codice si puo
      **consegnare** e se la verifica **blocca** l'accesso, che sono le due
      cose che dipendono davvero dall'installazione.
    */
    phoneNumberRequired: true,
    phoneVerification: canDeliverPhoneOtp(),
    phoneVerificationRequired: isPhoneVerificationRequired(),
    emailProviderConfigured: emailConfigured,
    phoneProviderConfigured: isSmsTransportConfigured(),
    testCodesEnabled: shouldExposeVerificationPreviewCode(),
    providers: getEnabledOAuthProviders().map((provider) => ({
      id: provider.id,
      label: provider.label,
    })),
  };
};

export const buildPendingVerificationResponse = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Utente non trovato");
  }

  return {
    user,
    session: null,
    verification: buildVerificationPayload(user),
  };
};

/* ------------------------------------------------------------------------- *
 * Reset password (ADR-0015)
 *
 * Diverso dagli OTP a 6 cifre: qui si usa un token lungo casuale consegnato
 * come link via email. Il token e salvato solo come hash SHA-256 e la ricerca
 * della challenge e vincolata anche al `purpose`, cosi un token di reset non
 * puo essere consumato dalla conferma email e viceversa.
 * ------------------------------------------------------------------------- */

const PASSWORD_RESET_TTL_MINUTES = 30;

export const PASSWORD_RESET_GENERIC_MESSAGE =
  "Se l'indirizzo è associato a un account, ti abbiamo inviato le istruzioni per reimpostare la password.";

const createPasswordResetToken = () => randomBytes(32).toString("hex");

export const findUserByEmailForPasswordReset = async (email: string) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail) return null;
  return prisma.user.findUnique({ where: { email: normalizedEmail } });
};

/**
 * Estratto per la stessa ragione di `buildVerificationEmail`, e con lo stesso
 * marchio: chi reimposta una password sta parlando con EasyGame.
 *
 * `resetUrl` finiva dentro un `href` **senza passare da niente**: e generato
 * qui, quindi non era sfruttabile, ma era l'unico punto del prodotto in cui un
 * URL entrava in un attributo senza controllo. Adesso passa da
 * `sanitizeEmailUrl` come tutti gli altri, e se un giorno la base dell'URL
 * arrivera dalla configurazione la difesa sara gia in piedi.
 */
export const buildPasswordResetEmail = ({
  firstName,
  resetUrl,
}: {
  firstName?: string | null;
  resetUrl: string;
}) => {
  const nome = String(firstName || "").trim();
  return renderEmailDocument({
    brand: EASYGAME_BRAND,
    preheader: `Il link scade tra ${PASSWORD_RESET_TTL_MINUTES} minuti.`,
    blocks: [
      { kind: "heading", text: "Reimposta la password" },
      {
        kind: "text",
        text: nome
          ? `Ciao ${nome}, hai richiesto di reimpostare la password del tuo account EasyGame.`
          : "Hai richiesto di reimpostare la password del tuo account EasyGame.",
      },
      { kind: "cta", label: "Scegli una nuova password", url: resetUrl },
      {
        kind: "text",
        text: `Il link scade tra ${PASSWORD_RESET_TTL_MINUTES} minuti e può essere usato una sola volta.`,
      },
      {
        kind: "footnote",
        text: "Se non hai richiesto tu il reset, ignora questa email: la password resta invariata.",
      },
    ],
  });
};

export const sendPasswordResetChallenge = async (user: {
  id: string;
  email: string;
  first_name?: string | null;
}): Promise<VerificationDispatchResult> => {
  const token = createPasswordResetToken();

  // Un solo token di reset valido per volta.
  await prisma.authVerificationChallenge.updateMany({
    where: {
      user_id: user.id,
      channel: "email",
      purpose: "reset_password",
      consumed_at: null,
    },
    data: { consumed_at: new Date() },
  });

  await prisma.authVerificationChallenge.create({
    data: {
      user_id: user.id,
      channel: "email",
      purpose: "reset_password",
      target: user.email,
      code_hash: hashOtpCode(token, {
        userId: user.id,
        channel: "email",
        purpose: "reset_password",
      }),
      expires_at: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
    },
  });

  const resetUrl = `${getAppBaseUrl()}/auth/reset-password?uid=${encodeURIComponent(
    user.id,
  )}&token=${encodeURIComponent(token)}`;

  const { html, text } = buildPasswordResetEmail({
    firstName: user.first_name,
    resetUrl,
  });
  const delivery = await sendTransactionalEmail({
    to: user.email,
    subject: "Reimposta la password EasyGame",
    text,
    html,
  });

  return {
    sent: delivery.status === "sent",
    // In sviluppo, se l'email non parte, il token è consultabile come per gli OTP.
    previewCode: getPreviewCode(delivery.status === "sent", token),
  };
};

export const confirmPasswordReset = async ({
  userId,
  token,
  password,
}: {
  userId: string;
  token: string;
  password: string;
}) => {
  const normalizedUserId = String(userId || "").trim();
  const normalizedToken = String(token || "").trim();

  if (!normalizedUserId || !normalizedToken) {
    throw new Error("Link di reset non valido o scaduto");
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedUserId },
  });
  if (!user) {
    throw new Error("Link di reset non valido o scaduto");
  }

  const challenge = await prisma.authVerificationChallenge.findFirst({
    where: {
      user_id: user.id,
      channel: "email",
      purpose: "reset_password",
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { created_at: "desc" },
  });

  if (!challenge) {
    throw new Error("Link di reset non valido o scaduto");
  }

  /*
    Il tentativo si prende **prima** del confronto, con la stessa scrittura
    condizionata della verifica OTP (vedi `prendiUnTentativo`): qui il
    controllo `attempts >= MAX_OTP_ATTEMPTS` precedeva l'incremento, quindi N
    richieste simultanee lo superavano tutte. Il token e lungo e la forza
    bruta non e praticabile, ma la corsa era la stessa di B-H1 e la primitiva
    e una sola.
  */
  if (!(await prendiUnTentativo(challenge.id))) {
    throw new Error("Link di reset non valido o scaduto");
  }

  const provided = Buffer.from(
    hashOtpCode(normalizedToken, {
      userId: user.id,
      channel: "email",
      purpose: "reset_password",
    }),
    "hex",
  );
  const expected = Buffer.from(challenge.code_hash, "hex");
  const matches =
    provided.length === expected.length && timingSafeEqual(provided, expected);

  if (!matches) {
    throw new Error("Link di reset non valido o scaduto");
  }

  /*
    Il token giusto non consuma tentativi: se la password che segue non
    rispetta la regola, la persona corregge e rimanda con lo **stesso** link,
    come prima. Il rimborso e condizionato alla challenge ancora aperta e
    a un contatore positivo: chi non ha il token non ha niente da farsi
    rimborsare.
  */
  await prisma.authVerificationChallenge.updateMany({
    where: { id: challenge.id, consumed_at: null, attempts: { gt: 0 } },
    data: { attempts: { decrement: 1 } },
  });

  /*
    **La regola sulla password si controlla dopo il token, non prima.**

    Prima veniva applicata subito dopo aver trovato l'utente, e i suoi messaggi
    escono verbatim dalla rotta: una password corta rispondeva «deve contenere
    almeno 12 caratteri» quando quell'`uid` esisteva e «Link di reset non valido
    o scaduto» quando non esisteva — **senza avere il token**. Chi provava un
    identificativo scopriva cosi se corrispondeva a un account.

    E `validatePassword` confronta anche con la parte locale dell'indirizzo:
    l'errore «una password che non contenga il nome dell'email» confermava
    all'attaccante di aver indovinato l'indirizzo della vittima.

    Adesso chi non ha dimostrato di avere il token riceve una frase sola,
    identica in tutti i casi.
  */
  const policy = validatePassword(password, user.email);
  if (!policy.valid) {
    throw new Error(getPasswordPolicyMessage(policy));
  }

  const password_hash = await hashPassword(password);

  await prisma.$transaction([
    prisma.authVerificationChallenge.update({
      where: { id: challenge.id },
      data: { consumed_at: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        // Chi ha aperto il link ha dimostrato di controllare la casella.
        ...(user.email_verified_at ? {} : { email_verified_at: new Date() }),
      },
    }),
    // Un reset invalida ogni sessione aperta, ovunque.
    prisma.session.deleteMany({ where: { user_id: user.id } }),
  ]);

  return { userId: user.id, email: user.email };
};
