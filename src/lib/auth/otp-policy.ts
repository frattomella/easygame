/**
 * Le costanti dell'OTP, e le due decisioni che si prendono senza database.
 *
 * Modulo puro: nessun Prisma, nessuna rete. Le scritture condizionate che
 * rendono queste regole vere sotto concorrenza stanno in
 * `src/lib/server/auth-workflows.ts`; qui vivono i numeri e le funzioni che si
 * possono provare a mano.
 */

/** Quanti tentativi ha una challenge prima di essere carta straccia. */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * Sei cifre, **tutte e un milione**.
 *
 * La prima stesura generava `randomInt(100000, 1_000_000)`: novecentomila
 * codici invece di un milione, perche i codici che cominciano per zero non
 * uscivano mai. Sono 0,15 bit in meno e nessun attacco pratico — ma e una
 * proprieta che si dichiara e poi non e vera, e quelle sono le proprieta di cui
 * ci si fida quando si calcola un margine.
 */
export const OTP_CODE_LENGTH = 6;

/**
 * **Scadenza breve sul telefono, piu larga sull'email.**
 *
 * L'SMS arriva in pochi secondi e si legge dalla schermata di blocco: cinque
 * minuti sono comodi. L'email passa da un server di posta, da un filtro
 * antispam e a volte da una app che sincronizza ogni dieci minuti: quindici.
 * Non e una differenza di sicurezza, e una differenza di canale — e mettere
 * quindici minuti anche sull'SMS significherebbe tenere aperta tre volte piu a
 * lungo una finestra che non serve a nessuno.
 */
export const PHONE_OTP_TTL_MINUTES = 5;
export const EMAIL_OTP_TTL_MINUTES = 15;

/**
 * **Il tempo minimo fra due invii dello stesso codice.**
 *
 * Diverso dal contatore di frequenza, e per questo esiste oltre a quello. Il
 * contatore dice «non piu di N in una finestra» e serve contro l'abuso; il
 * cooldown dice «non adesso» e serve contro il dito che preme due volte, che e
 * il caso comune: senza, il secondo clic **invalida** il codice appena
 * arrivato, la persona digita quello che ha in mano e legge «codice non
 * valido». Il difetto sembra un errore di digitazione ed e un errore del
 * prodotto.
 */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export type OtpResendDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Si puo rimandare il codice?
 *
 * `lastSentAt` e la nascita della challenge viva piu recente, oppure `null` se
 * non ce n'e nessuna. Il rifiuto porta con se i secondi che mancano, perche una
 * schermata che dice «riprova» senza dire quando fa premere di nuovo subito.
 */
export const resolveOtpResendDecision = (
  lastSentAt: Date | null | undefined,
  now: Date = new Date(),
  cooldownSeconds: number = OTP_RESEND_COOLDOWN_SECONDS,
): OtpResendDecision => {
  if (!lastSentAt) return { allowed: true };

  const trascorsi = (now.getTime() - new Date(lastSentAt).getTime()) / 1000;
  /*
    Un `lastSentAt` nel futuro — orologi che divergono fra istanze, o una riga
    scritta a mano — non deve **aprire** il cooldown: `trascorsi` negativo
    resta sotto la soglia e il rinvio si nega. Sbagliare stringendo.
  */
  if (trascorsi >= cooldownSeconds) return { allowed: true };

  return {
    allowed: false,
    retryAfterSeconds: Math.max(Math.ceil(cooldownSeconds - trascorsi), 1),
  };
};

/**
 * Gli **unici** ambienti in cui un codice puo tornare nella risposta, e solo
 * se `AUTH_ALLOW_TEST_CODES` vale `true`. Tutto il resto — `production`,
 * `staging`, `preview`, e qualunque nome che nessuno ha previsto — nega.
 */
const AMBIENTI_CON_ANTEPRIMA = new Set(["development", "test", "local"]);

/**
 * **Il codice torna nella risposta?**
 *
 * Due condizioni, e la prima e sempre una scelta esplicita:
 * `AUTH_ALLOW_TEST_CODES` deve valere `true`. Nessun ambiente lo accende da
 * solo.
 *
 * **Il fail-open che chiude** (LOW-10 della revisione ostile PP-05A): la
 * condizione era `NODE_ENV !== "production"`, quindi un `NODE_ENV` **non
 * impostato** apriva. Su Vercel `NODE_ENV` vale sempre `production` e il
 * rischio pratico era basso, ma una difesa che si apre quando una variabile
 * manca e scritta al contrario: quando un ambiente non si dichiara, non lo si
 * indovina. Qui, senza `NODE_ENV`, si chiede al database di dichiararsi —
 * `EASYGAME_DB_ENV`, la stessa variabile su cui si regge la guardia degli
 * script di scrittura — e in mancanza anche di quella si nega.
 */
export const shouldExposeVerificationPreviewCode = (
  environment: {
    NODE_ENV?: string;
    AUTH_ALLOW_TEST_CODES?: string;
    EASYGAME_DB_ENV?: string;
  } = process.env,
) => {
  if (environment.AUTH_ALLOW_TEST_CODES !== "true") return false;

  /*
    **Un elenco di ammissione, non uno di negazione** (L-3 del secondo round).
    La prima stesura negava `production`, `staging` e `preview` e ammetteva
    tutto il resto: `NODE_ENV=prod` passava, perche non e nessuna delle tre.
    Un elenco di negazione va tenuto aggiornato contro l'ingegno di chi scrive
    le variabili; uno di ammissione no.
  */
  const ambiente = String(environment.NODE_ENV || "")
    .trim()
    .toLowerCase();
  if (ambiente) return AMBIENTI_CON_ANTEPRIMA.has(ambiente);

  return (
    String(environment.EASYGAME_DB_ENV || "")
      .trim()
      .toLowerCase() === "development"
  );
};
