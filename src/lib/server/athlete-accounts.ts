import { createHash, randomBytes } from "crypto";
import { reportServerError } from "./observability";
import { athleteWithinAccessScope } from "./access-scope-query";
import { clubsWhereStillAthlete } from "./athlete-membership";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";

import { prisma } from "./prisma";
import { lockAthleteRow } from "./resources";
import {
  applyMembershipAccessScopes,
  deriveAthleteAccessScopes,
} from "./club-roles";
import { hashPassword } from "./auth";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { normalizeAccessRole } from "@/lib/access-roles";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import { sendTransactionalEmail } from "./email/email-service";
import { renderEmailLayout } from "./email/layout";
import { sendPasswordResetChallenge } from "./auth-workflows";
import { getParentDashboardData } from "./parent-dashboard";
import { readGuardiansForAthlete } from "./athlete-guardians";
import { resolveGuardianIdentity } from "@/lib/guardians/identity";
import { readAthleteRsvpInvitations } from "./rsvp";
import { escapeHtml } from "@/lib/documents/document-view";

/**
 * **L'unico scrittore dell'accesso EasyGame di un atleta** (W6-25/26/27).
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * Il ruolo `athlete` era modellato da capo a fondo: un ruolo canonico
 * (`access-roles.ts`), un'area propria, una guardia di percorso, un redirect,
 * una pagina, e una sessione che lo sa riconoscere leggendo
 * `athletes.user_id`. **E nessun percorso scriveva quella colonna.**
 * `unlinkDirectAthleteProfile` la slega; niente la lega mai. Il ruolo era
 * irraggiungibile — la forma di difetto che CLAUDE.md §11.8 chiama «codice
 * irraggiungibile», ed e la stessa dell'RSVP e di `board.read`.
 *
 * Il pulsante «Invia credenziali» c'era, in tre schede, e mostrava un errore.
 *
 * ## Come si consegna un accesso senza mai una password in chiaro
 *
 * **Nessun ramo di questo modulo compone, salva, mostra o manda una
 * password.** La consegna e in due tempi, e ognuno prova una cosa diversa:
 *
 * 1. l'**invito** porta un token opaco (32 byte casuali) dentro un link. In
 *    archivio ne resta solo lo SHA-256 (ADR-0085): il database, se finisse
 *    nelle mani sbagliate, non riaprirebbe nessuna porta. Chi apre il link
 *    dimostra di leggere quella casella;
 * 2. la **password** non la sceglie il club: la sceglie la persona, con il
 *    meccanismo che il prodotto ha gia — `sendPasswordResetChallenge` /
 *    `confirmPasswordReset` (ADR-0015). Qui non ne nasce un secondo.
 *
 * L'utenza, quando va creata, nasce con la **forma di
 * `createOAuthBootstrapUser`**: `password_hash` di una password casuale che
 * nessuno conosce e che nessuno riceve — `User.password_hash` e non-nullable,
 * quindi «nessuna password» si scrive cosi — e `email_verified_at` **nullo**,
 * perche a quel punto nessuno ha ancora dimostrato niente.
 *
 * Quel campo nullo e anche il **segnale** che l'accettazione legge: un'utenza
 * mai verificata e un'utenza le cui credenziali non le conosce nessuno, e le
 * si manda il link per sceglierle. Un'utenza gia verificata — l'atleta che e
 * anche genitore, o che ha gia un account — non viene toccata: nessun reset
 * non richiesto, nessuna sessione invalidata.
 *
 * ## La procedura, per ogni funzione di scrittura, in quest'ordine
 *
 * 1. il **permesso**, dal catalogo (`accounts.athlete.manage`), con la stringa
 *    `Accesso negato` nel messaggio e la riga di audit del diniego;
 * 2. il **confine**, riga per riga, con `assertActiveClub` — mai il confronto
 *    con `allowedOrganizationIds` (ADR-0094);
 * 3. la scrittura, e l'**audit**.
 *
 * ## Cosa questo modulo NON fa
 *
 * Non impedisce in codice due inviti vivi per lo stesso atleta: lo impedisce
 * il database, con l'indice unico parziale
 * `athlete_account_invites_vivo_unico`. Qui si **intercetta** il suo rifiuto
 * (`P2002`) e lo si traduce in una frase leggibile. Riscrivere quel controllo
 * in memoria riaprirebbe la corsa che l'indice chiude.
 *
 * Non e la porta dei tutori: quella e il token `parent_access`, ed e un altro
 * legame. Un atleta non e un genitore, e i due non si scrivono a vicenda.
 */

/* ========================================================================= *
 *  Il vocabolario
 * ========================================================================= */

export type AthleteAccountInviteStatus =
  | "sent"
  | "accepted"
  | "revoked"
  | "expired";

export type AthleteAccountsScope = {
  userId?: string | null;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds?: readonly string[];
  actorEmail?: string | null;
  /**
   * Il perimetro di sede e categoria.
   *
   * Non arrivava qui, e questo modulo e **l'unica** strada che scrive
   * `athletes.user_id` (ADR-0104). Misurato: un operatore recintato su una
   * sede leggeva lo stato dell'accesso di un minore dell'altra e gli mandava
   * un invito **verso un indirizzo scelto da lui**. Accettato l'invito,
   * l'account di quel minore — nome, recapiti, documenti, stato del
   * certificato — era suo. Non e una fuga di dati: e una presa di possesso.
   */
  accessScopes?: readonly AccessScopeEntry[] | null;
};

/** La chiave unica del dominio: leggere lo stato e agirci sopra. */
const CHIAVE = "accounts.athlete.manage" as const;

/** Quanto vive un invito. Trenta giorni: e una consegna, non un codice OTP. */
export const ATHLETE_INVITE_TTL_DAYS = 30;

const asText = (value: unknown) => String(value ?? "").trim();

const normalizeEmail = (value: unknown) => asText(value).toLowerCase();

const negato = (messaggio: string) => new Error(`Accesso negato: ${messaggio}`);

/**
 * L'indirizzo si valida qui e non si fida di nessuno: un invito e un'email che
 * parte verso il mondo, e un indirizzo malformato la fa fallire in silenzio.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const assertEmail = (value: string) => {
  if (!EMAIL_PATTERN.test(value)) {
    throw new Error("Indirizzo email non valido");
  }
};

/* ========================================================================= *
 *  Il minorenne (PP-04, ADR-0116)
 * ========================================================================= */

/**
 * **La maggiore eta, e perche la data mancante conta come minore.**
 *
 * Il numero e lo stesso di `src/lib/server/data-subject.ts` e la regola di
 * lettura pure: una data assente o illeggibile **si tratta come minore**. In
 * una societa sportiva un'anagrafica senza data di nascita e quasi sempre un
 * ragazzo inserito in fretta, e il default prudente costa una conferma in piu
 * (ADR-0105).
 *
 * I due valori sono ripetuti qui invece che importati, e non e una svista:
 * `data-subject.ts` e il proprietario dei diritti dell'interessato e non
 * esporta questa domanda — esporta un inventario polimorfo su sei indici che
 * qui non serve a niente. Se la soglia cambiasse per legge, i due posti vanno
 * cambiati insieme, ed e scritto in tutti e due.
 */
const ETA_MAGGIORE = 18;

export const athleteIsMinor = (birthDate: unknown, now = new Date()) => {
  if (!birthDate) return true;
  const nato = new Date(birthDate as any);
  if (Number.isNaN(nato.getTime())) return true;

  const diciotto = new Date(nato);
  diciotto.setFullYear(diciotto.getFullYear() + ETA_MAGGIORE);
  return diciotto.getTime() > now.getTime();
};

/**
 * **Dare un accesso proprio a un minore e una decisione, non un clic.**
 *
 * EasyGame non ha — e questa lane non se la inventa — una policy che dica se
 * un tredicenne possa avere un accesso proprio, chi debba autorizzarlo, e come
 * lo si prova. Finche quella policy non esiste, il comportamento e il piu
 * conservativo che il prodotto sappia gia esprimere: **il gesto non passa in
 * silenzio**. Chi lo compie dichiara, in modo esplicito e registrato
 * nell'audit, che chi ha la responsabilita genitoriale lo ha autorizzato.
 *
 * E la stessa forma della cancellazione di un minore (ADR-0105): non un
 * divieto — vietare deciderebbe una policy tanto quanto permettere — ma una
 * conferma separata che lascia un nome, un'ora e un club accanto alla scelta.
 * Il giorno in cui la policy vera arriva, questa e la riga che dice **chi**
 * aveva deciso prima.
 *
 * Non e un errore di autorizzazione e **non porta la stringa «Accesso
 * negato»**: il ruolo puo fare questa cosa, e la dichiarazione a mancare. Il
 * route handler generico lo mappa quindi su 400, che e cio che e.
 */
const assertMinoreAutorizzato = (
  atleta: { birth_date?: Date | string | null },
  acknowledgeMinor: unknown,
  now = new Date(),
) => {
  const minore = athleteIsMinor(atleta.birth_date, now);
  if (minore && acknowledgeMinor !== true) {
    throw new Error(
      "Questo atleta risulta minorenne, o non ha una data di nascita in anagrafica: " +
        "per aprirgli un accesso EasyGame serve la conferma esplicita che chi ne ha la " +
        "responsabilita genitoriale lo ha autorizzato.",
    );
  }
  return minore;
};

/*
  **Il token esiste in chiaro solo qui dentro.**

  Trentadue byte casuali, la stessa misura del token di reset password: e la
  soglia oltre la quale indovinarlo non e una strategia. In archivio finisce
  solo lo SHA-256, e non c'e nessuna funzione di questo modulo che restituisca
  il valore in chiaro a un chiamante.
*/
const creaToken = () => randomBytes(32).toString("hex");

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/*
  L'origine dell'applicazione, con la stessa regola del link di reset password:
  le due email portano a due pagine dello stesso prodotto e devono atterrare
  sullo stesso host. `getAppBaseUrl` di `auth-workflows.ts` non e esportata; la
  regola e ripetuta qui e non inventata.
*/
const baseUrl = () =>
  (
    process.env.AUTH_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3001"
  ).replace(/\/+$/, "");

const linkDiAttivazione = (token: string) =>
  `${baseUrl()}/athlete-dashboard/attiva?token=${encodeURIComponent(token)}`;

/* ========================================================================= *
 *  Il permesso, e la riga che il rifiuto lascia
 * ========================================================================= */

/**
 * `async` per la stessa ragione della guardia degli eventi e degli
 * appuntamenti: il diniego si **scrive** prima di essere lanciato, e
 * `tests/server/guardie-attese.test.mjs` presidia l'`await` su ogni chiamata.
 */
const assertPuoGestireAccessi = async (
  scope: AthleteAccountsScope,
  athleteId?: string | null,
) => {
  if (!roleHasPermission(scope.activeRole, CHIAVE)) {
    await recordPermissionDenied({
      scope: {
        userId: scope.userId,
        activeRole: scope.activeRole,
        activeOrganizationId: scope.activeOrganizationId,
      },
      permission: CHIAVE,
      resource: "athlete_account_invites",
      resourceId: asText(athleteId) || null,
    });
    throw negato(
      "il ruolo attivo non puo gestire l'accesso EasyGame di un atleta",
    );
  }
};

/**
 * L'atleta, verificato **riga per riga** contro il club attivo.
 *
 * Il club non arriva mai dal client: si legge dalla riga e lo si confronta con
 * quello attivo. E la forma di ADR-0094.
 */
const caricaAtletaDelClubAttivo = async (
  scope: AthleteAccountsScope,
  athleteId: string,
) => {
  const id = asText(athleteId);
  if (!id) throw new Error("Atleta mancante");

  const atleta = await prisma.athlete.findUnique({
    where: { id },
    select: {
      id: true,
      organization_id: true,
      user_id: true,
      first_name: true,
      last_name: true,
      /* La data di nascita: e cio a cui `athleteIsMinor` risponde (ADR-0116). */
      birth_date: true,
      data: true,
    },
  });

  if (!atleta) throw new Error("Atleta non trovato");
  assertActiveClub(scope, atleta.organization_id, "l'atleta");

  /*
    Tutti e cinque gli atti del dominio passano di qui — lo stato, l'invito,
    il reinvio, il cambio di indirizzo, la revoca — quindi e l'unico punto in
    cui il perimetro va messo. Ed era l'unico in cui non c'era.
  */
  const dentro = await athleteWithinAccessScope(
    atleta.organization_id,
    atleta.id,
    scope,
  );
  if (!dentro) {
    throw new Error(
      "Accesso negato: questo atleta e fuori dal perimetro di sede o categoria del ruolo attivo",
    );
  }

  return atleta;
};

/* ========================================================================= *
 *  Lo stato, per la scheda
 * ========================================================================= */

export type AthleteAccountState = {
  athleteId: string;
  /**
   * `none` | `invited` | `active` | `revoked`. Si **deriva**, non si scrive.
   *
   * **Il quarto stato e stato aggiunto da PP-04**, e non e una sfumatura.
   * Prima, un accesso revocato tornava indistinguibile da un accesso mai
   * aperto: entrambi «Nessun account». La segreteria che riapriva la scheda il
   * giorno dopo non aveva modo di sapere se quell'atleta non era mai stato
   * invitato o se qualcuno gli aveva **tolto** l'accesso — che sono la stessa
   * schermata e due fatti opposti, e il secondo e quello su cui si telefona.
   *
   * La storia lo diceva gia, in fondo al pannello; ma uno stato che si legge
   * solo scorrendo un elenco non e lo stato, e cio che il pannello dichiarava
   * in testa era falso.
   */
  status: "none" | "invited" | "active" | "revoked";
  /**
   * **Vero quando l'anagrafica dice minorenne, e anche quando non dice
   * niente** (ADR-0116). Non e una decorazione della schermata: e il campo su
   * cui il pannello sa di dover chiedere la conferma che il dominio pretende.
   *
   * Non esce la data di nascita, che qui non serve a niente: la domanda e
   * «serve la conferma?», e la risposta e un booleano.
   */
  isMinor: boolean;
  /** L'utenza collegata, quando l'accesso e attivo. Mai l'hash, mai il token. */
  account: {
    userId: string;
    email: string;
    name: string | null;
    emailVerifiedAt: string | null;
  } | null;
  /** L'invito **vivo**, se c'e. */
  invite: {
    id: string;
    email: string;
    sentAt: string;
    expiresAt: string;
    expired: boolean;
  } | null;
  /**
   * L'indirizzo a cui l'ultima cosa e stata mandata, e quando.
   *
   * Vivono fuori da `invite` perche `invite` e **solo quello vivo**: dopo una
   * revoca o una scadenza quel ramo e nullo, e con esso spariva dallo schermo
   * anche «a chi» e «quando», che sono le due domande che si fanno proprio in
   * quel momento.
   */
  lastInviteEmail: string | null;
  lastInviteAt: string | null;
  /** Quando l'accesso e stato tolto, se e stato tolto. */
  revokedAt: string | null;
  /** La storia: ogni invito, con il suo esito. Nessun token, in nessuna riga. */
  history: {
    id: string;
    email: string;
    status: AthleteAccountInviteStatus;
    sentAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    expiresAt: string;
  }[];
};

const iso = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString() : null;

/**
 * Lo stato dell'accesso di un atleta.
 *
 * **Si deriva**, come lo stato di una rata o di una scadenza: non c'e nessuna
 * colonna «stato dell'accesso» da tenere allineata. C'e un legame
 * (`athletes.user_id`) e ci sono gli inviti, e lo stato e cio che quei due
 * fatti dicono insieme.
 */
export const readAthleteAccountState = async (
  scope: AthleteAccountsScope,
  athleteId: string,
): Promise<AthleteAccountState> => {
  await assertPuoGestireAccessi(scope, athleteId);
  const atleta = await caricaAtletaDelClubAttivo(scope, athleteId);

  const [utente, inviti] = await Promise.all([
    atleta.user_id
      ? prisma.user.findUnique({
          where: { id: atleta.user_id },
          /*
            Elenco chiuso, e non «tolgo cio che non deve uscire»: da qui non
            escono `password_hash`, `user_metadata`, ne il resto della riga
            (CLAUDE.md §8).
          */
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            email_verified_at: true,
          },
        })
      : Promise.resolve(null),
    prisma.athleteAccountInvite.findMany({
      where: {
        organization_id: atleta.organization_id,
        athlete_id: atleta.id,
      },
      orderBy: { sent_at: "desc" },
      take: 20,
    }),
  ]);

  const adesso = new Date();
  const vivo =
    inviti.find(
      (riga) => riga.status === "sent" && new Date(riga.expires_at) > adesso,
    ) || null;

  /*
    **«Revocato» si deriva, come tutto il resto** (PP-04).

    Non c'e una colonna da tenere allineata, e non ne va aggiunta una: la
    revoca ha gia lasciato due tracce diverse, e sono queste due che vanno
    lette insieme.

    - un invito **accettato** e la prova che un accesso e esistito. Se adesso
      non c'e nessuna utenza collegata, qualcuno gliel'ha tolto: e la revoca
      dell'**accesso**;
    - un invito **revocato** e la revoca di un invito che non era ancora
      diventato un accesso.

    Sono due fatti diversi e la scheda li distingue nella storia; qui contano
    per la stessa cosa — «l'accesso c'era o stava per esserci, e non c'e piu» —
    perche la domanda a cui lo stato deve rispondere e «devo rimandarlo?».

    **Un invito solo scaduto non e una revoca**: nessuno ha deciso niente,
    e semplicemente passato del tempo. Resta `none`, e la data dell'ultimo
    invito dice perche.
  */
  const ultimo = inviti[0] || null;

  /*
    **La domanda si fa all'ultimo invito, non a uno qualunque** (PP-04,
    ADR-0121).

    La stesura precedente cercava, in tutta la storia, *un* invito accettato
    oppure *un* invito con `revoked_at`. Ma `revoked_at` non lo scrive solo una
    revoca: lo scrive `chiudiInvitoVivo(..., "revoked")`, che e cio che fanno
    **il reinvio** e **il cambio di indirizzo**. Un invito reinviato — o mandato
    all'indirizzo corretto — che poi **scade** lasciava dietro di se una riga
    revocata, e il pannello dichiarava «Accesso revocato» a un atleta che non
    ne aveva mai avuto uno, con una `revokedAt` che era la data del reinvio.

    Il commento qui sopra diceva gia la cosa giusta — «un invito solo scaduto
    non e una revoca» — e la derivazione non la realizzava: e il difetto piu
    difficile da vedere, quello in cui l'intento e scritto e il codice dice
    altro.

    Sulla riga piu recente le due clausole di ADR-0115 restano intere:
    `accepted_at` dice che un accesso e esistito e adesso non c'e piu;
    `revoked_at` dice che l'invito e stato tolto prima di diventarlo. Una riga
    solo `expired` non dice ne l'una ne l'altra.
  */
  const revocato =
    !utente && !vivo && Boolean(ultimo?.accepted_at || ultimo?.revoked_at);

  return {
    athleteId: atleta.id,
    status: utente
      ? "active"
      : vivo
        ? "invited"
        : revocato
          ? "revoked"
          : "none",
    isMinor: athleteIsMinor(atleta.birth_date, adesso),
    lastInviteEmail: ultimo?.email ?? null,
    lastInviteAt: iso(ultimo?.sent_at),
    revokedAt: revocato ? iso(ultimo?.revoked_at) : null,
    account: utente
      ? {
          userId: utente.id,
          email: utente.email,
          name:
            `${utente.first_name || ""} ${utente.last_name || ""}`.trim() ||
            null,
          emailVerifiedAt: iso(utente.email_verified_at),
        }
      : null,
    invite: vivo
      ? {
          id: vivo.id,
          email: vivo.email,
          sentAt: iso(vivo.sent_at) as string,
          expiresAt: iso(vivo.expires_at) as string,
          expired: false,
        }
      : null,
    history: inviti.map((riga) => ({
      id: riga.id,
      email: riga.email,
      status: riga.status as AthleteAccountInviteStatus,
      sentAt: iso(riga.sent_at) as string,
      acceptedAt: iso(riga.accepted_at),
      revokedAt: iso(riga.revoked_at),
      expiresAt: iso(riga.expires_at) as string,
    })),
  };
};

/* ========================================================================= *
 *  L'invito
 * ========================================================================= */

/**
 * L'utenza destinataria: quella che c'e, o una nuova **senza credenziali note**.
 *
 * La forma e quella di `createOAuthBootstrapUser`: `password_hash` di byte
 * casuali che nessuno vede — la colonna e non-nullable, e questo e il modo in
 * cui il prodotto scrive «nessuna password» — e nessuna verifica dichiarata,
 * perche a questo punto nessuno ha dimostrato di leggere quella casella.
 */
const risolviUtenza = async (
  email: string,
  athleteNome: {
    first_name?: string | null;
    last_name?: string | null;
  },
) => {
  const esistente = await prisma.user.findUnique({ where: { email } });
  if (esistente) return { user: esistente, creata: false as const };

  const password_hash = await hashPassword(randomBytes(24).toString("hex"));

  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      first_name: athleteNome.first_name || null,
      last_name: athleteNome.last_name || null,
      user_metadata: { role: "user" },
    },
  });

  return { user, creata: true as const };
};

/**
 * Estratto per essere richiamabile anche dall'anteprima di sviluppo
 * (`/private/email-preview`), stessa ragione dei builder in
 * `auth-workflows.ts`.
 */
export const buildAthleteInviteEmailHtml = ({
  athleteName,
  clubName,
  link,
}: {
  athleteName: string;
  clubName: string;
  link: string;
}): string =>
  renderEmailLayout({
    bodyHtml: `
      <h2 style="margin:0 0 12px;">Attiva il tuo accesso EasyGame</h2>
      <p>Ciao ${escapeHtml(athleteName)}, <strong>${escapeHtml(clubName)}</strong> ti ha aperto un accesso personale su EasyGame: da li vedi i tuoi allenamenti, le gare, le convocazioni e i tuoi documenti.</p>
      <p style="padding: 20px 0;">
        <a href="${link}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Attiva il mio accesso</a>
      </p>
      <p>Il link scade tra ${ATHLETE_INVITE_TTL_DAYS} giorni. Al primo accesso sceglierai tu la tua password: nessuno del club la conosce e nessuno te la puo comunicare.</p>
      <p style="color:#64748b;font-size:13px;">Se non ti aspettavi questo messaggio, ignoralo: senza il link non succede niente.</p>
    `,
  });

const inviaEmailDiInvito = async (input: {
  to: string;
  athleteName: string;
  clubName: string;
  token: string;
}) => {
  const link = linkDiAttivazione(input.token);

  /*
    **L'email non contiene una password, e non contiene nemmeno un'istruzione
    per riceverne una dal club.** Contiene un link che scade. Chi lo apre
    sceglie da se la propria password, con il meccanismo di ADR-0015.
  */
  return sendTransactionalEmail({
    to: input.to,
    subject: `${input.clubName}: attiva il tuo accesso EasyGame`,
    text: [
      `Ciao ${input.athleteName},`,
      "",
      `${input.clubName} ti ha aperto un accesso personale su EasyGame: da li vedi i tuoi allenamenti, le gare, le convocazioni e i tuoi documenti.`,
      "",
      `Attiva l'accesso entro ${ATHLETE_INVITE_TTL_DAYS} giorni aprendo questo link:`,
      link,
      "",
      "Al primo accesso sceglierai tu la tua password: nessuno del club la conosce e nessuno te la puo comunicare.",
      "",
      "Se non ti aspettavi questo messaggio, ignoralo: senza il link non succede niente.",
      "",
      input.clubName,
    ].join("\n"),
    html: buildAthleteInviteEmailHtml({
      athleteName: input.athleteName,
      clubName: input.clubName,
      link,
    }),
  });
};

/** Il rifiuto dell'indice parziale, tradotto. */
const eInvitoGiaVivo = (error: any) =>
  error?.code === "P2002" &&
  String(
    Array.isArray(error?.meta?.target)
      ? error.meta.target.join(",")
      : error?.meta?.target || "",
  ).includes("athlete_id");

export type AthleteInviteResult = {
  inviteId: string;
  email: string;
  expiresAt: string;
  /** Vero se l'email e davvero partita. Il token non compare mai qui. */
  delivered: boolean;
};

/**
 * Manda l'invito, e crea l'utenza se non c'e.
 *
 * Un invito gia vivo lo rifiuta il **database**. Chi vuole cambiare qualcosa
 * passa da `resendAthleteAccountInvite` o da `changeAthleteAccountEmail`, che
 * revocano prima: cosi non esistono due token validi per la stessa persona.
 */
export const sendAthleteAccountInvite = async (
  scope: AthleteAccountsScope,
  input: {
    athleteId: string;
    email: string;
    /**
     * Obbligatoriamente `true` quando l'atleta e minorenne, o quando la data
     * di nascita manca (ADR-0116). Dichiara che chi ha la responsabilita
     * genitoriale ha autorizzato l'accesso, e finisce nell'audit.
     */
    acknowledgeMinor?: boolean;
  },
): Promise<AthleteInviteResult> => {
  await assertPuoGestireAccessi(scope, input.athleteId);
  const atleta = await caricaAtletaDelClubAttivo(scope, input.athleteId);

  if (atleta.user_id) {
    throw new Error(
      "Questo atleta ha gia un accesso EasyGame attivo: revocalo prima di invitarne un altro",
    );
  }

  /*
    **Prima dell'email, e prima di creare l'utenza.** Un rifiuto che arrivasse
    dopo `risolviUtenza` lascerebbe in archivio un'utenza senza credenziali
    nata da un gesto che il dominio ha poi rifiutato: e un residuo, ed e per un
    minore.
  */
  const minore = assertMinoreAutorizzato(atleta, input.acknowledgeMinor);

  const email = normalizeEmail(input.email);
  assertEmail(email);

  /*
    **Un accesso mandato alla casella del tutore non e l'accesso dell'atleta**
    (ADR-0124).

    `risolviUtenza` non crea una seconda utenza per un indirizzo che ne ha gia
    una: la **trova**. Se quell'indirizzo e il recapito di un tutore di questa
    stessa scheda, cio che nasce da qui non e l'account del ragazzo — e un
    secondo cappello sull'account del genitore. Le conseguenze sono due, e
    nessuna delle due e cio che la segreteria crede di fare:

    1. la mail con il link di riscatto, e da li in poi ogni notifica
       dell'«atleta», arrivano nella casella del genitore. Il minore non
       riceve nessuna credenziale propria: il gesto che ADR-0116 fa dichiarare
       — «gli apro un accesso suo» — non e il gesto che avviene;
    2. quella identita diventa insieme l'account della scheda e un tutore, e
       `athleteBelongsToParent` deve poi decidere quale dei due e. ADR-0124 le
       da una risposta, ma la risposta migliore e non creare la domanda.

    Percio si rifiuta, e si dice cosa fare. **Non e un errore di
    autorizzazione** e non porta «Accesso negato»: il ruolo puo compiere
    l'azione, e l'indirizzo a essere quello sbagliato. Il route handler
    generico lo mappa su 400, come per la dichiarazione mancante di ADR-0116.
  */
  /*
    **La domanda si fa alle righe, non al blob** (ADR-0135).

    PP-04 aveva scritto questa guardia su `athletes.data.guardians[]` con un
    lettore suo (`guardianAccessIdentities`). WP-C ha tolto al blob l'autorita
    e con lei quel lettore: i recapiti dei tutori di questa scheda stanno in
    `athlete_guardians`, e a dire quali identita porta una riga e la primitiva
    del dominio, non una raccolta scritta qui (ADR-0153).
  */
  const identitaDeiTutori = new Set(
    (await readGuardiansForAthlete(prisma, atleta.id)).flatMap((riga) => {
      /*
        **Utenze e indirizzi insieme, perche le domande sono due.**

        Questa guardia si fa **due volte**: qui sull'indirizzo scritto, e piu
        sotto sull'utenza che `risolviUtenza` ha trovato — un tutore legato per
        utenza puo avere cambiato casella, e allora la coincidenza non si vede
        dal recapito. Un insieme che portasse solo gli indirizzi renderebbe la
        seconda domanda muta: `.has(user.id)` non troverebbe mai niente, e la
        difesa sarebbe inerte invece che assente (ADR-0147).
      */
      const identita = resolveGuardianIdentity(riga);
      return [...identita.userIds, ...identita.emails];
    }),
  );
  if (identitaDeiTutori.has(email)) {
    throw new Error(
      "Questo indirizzo e gia il recapito di un tutore di questa scheda: l'invito " +
        "arriverebbe nella casella del tutore e l'accesso nascerebbe sulla sua utenza, " +
        "non su una dell'atleta. Usa un indirizzo dell'atleta, oppure togli quel " +
        "recapito dai tutori.",
    );
  }

  const club = await prisma.club.findUnique({
    where: { id: atleta.organization_id },
    select: { id: true, name: true },
  });
  if (!club) throw new Error("Club non trovato");

  /*
    **L'indirizzo non puo essere quello di un altro atleta gia collegato.**

    Senza questo controllo due atleti finirebbero sulla stessa utenza, e
    `findDirectAthleteIdForUser` — che cerca `athlete.user_id = userId` —
    aprirebbe all'uno la scheda dell'altro. E la porta che il §3 del mandato
    chiude: un atleta non vede i dati di un altro atleta.
  */
  const { user, creata } = await risolviUtenza(email, atleta);
  const giaAtleta = await prisma.athlete.findFirst({
    where: { user_id: user.id },
    select: { id: true },
  });
  if (giaAtleta && giaAtleta.id !== atleta.id) {
    throw new Error(
      "Questo indirizzo e gia collegato alla scheda di un altro atleta",
    );
  }

  /*
    **E nemmeno quello di un altro atleta gia invitato** (PP-04, ADR-0125).

    La guardia qui sopra dichiara di chiudere «due atleti sulla stessa
    utenza», e guarda `athletes.user_id` — che il **riscatto** scrive. Fra due
    inviti quel campo e ancora vuoto, quindi la domanda arrivava sempre troppo
    presto. Il round conclusivo lo ha misurato contro PostgreSQL con la
    sequenza piu normale che una segreteria possa fare — due fratelli, una
    casella di famiglia sola, i due inviti mandati prima che qualcuno clicchi:
    entrambi passavano, entrambi si riscattavano, e due schede finivano a
    portare la **stessa** `user_id`.

    Da li in poi il prodotto sceglie: `findAthleteProfileForUser` prende il
    primo candidato, e l'altro ragazzo non ha nessun accesso mentre il club
    legge «Accesso attivo». E `eLaPersonaStessa` risponde di si per tutte e
    due, quindi quell'unica identita apre la bacheca di entrambe le schede.

    Una casella, un atleta. La coppia con l'invito ancora vivo e la seconda
    meta della stessa domanda, e va fatta qui perche qui c'e ancora una
    persona a cui dirlo.
  */
  const giaInvitato = await prisma.athleteAccountInvite.findFirst({
    where: {
      user_id: user.id,
      status: "sent",
      athlete_id: { not: atleta.id },
    },
    select: { athlete_id: true },
  });
  if (giaInvitato) {
    throw new Error(
      "Questo indirizzo ha gia un invito in corso sulla scheda di un altro " +
        "atleta: una casella puo essere l'accesso di un atleta solo. Revoca " +
        "quell'invito, oppure usa un indirizzo diverso per questa scheda.",
    );
  }

  /*
    **La stessa domanda dall'altro capo** (ADR-0124).

    La guardia sull'indirizzo copre il caso in cui il recapito del tutore e
    scritto per esteso. Ma un tutore puo essere legato per `linkedUserId` a
    un'utenza il cui indirizzo e cambiato, e allora la coincidenza non si vede
    dalla casella: si vede dall'utenza risolta.

    Qui `risolviUtenza` e gia passata, e va bene: se l'indirizzo non aveva
    un'utenza, quella appena creata non puo essere il tutore di nessuno, e
    questo ramo non scatta. Scatta solo su un'utenza **preesistente**, quindi
    non lascia nessun residuo.
  */
  if (identitaDeiTutori.has(String(user.id).trim().toLowerCase())) {
    throw new Error(
      "Questa utenza e gia collegata come tutore di questa scheda: l'accesso " +
        "dell'atleta nascerebbe sulla stessa identita del tutore. Usa un'utenza " +
        "dell'atleta.",
    );
  }

  const token = creaToken();
  const expiresAt = new Date(
    Date.now() + ATHLETE_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  let invito;
  try {
    invito = await prisma.athleteAccountInvite.create({
      data: {
        organization_id: atleta.organization_id,
        athlete_id: atleta.id,
        user_id: user.id,
        email,
        token_hash: hashToken(token),
        status: "sent",
        expires_at: expiresAt,
        sent_at: new Date(),
        created_by: asText(scope.userId) || null,
      },
    });
  } catch (error: any) {
    if (eInvitoGiaVivo(error)) {
      throw new Error(
        "Esiste gia un invito in corso per questo atleta: reinvialo o revocalo prima di crearne un altro",
      );
    }
    throw error;
  }

  const nomeAtleta =
    `${atleta.first_name || ""} ${atleta.last_name || ""}`.trim() || "atleta";

  /*
    L'email si manda **dopo** che la riga esiste: se partisse prima, un rifiuto
    dell'indice lascerebbe in giro un link che nessuna riga riconosce. Se
    invece e la consegna a fallire, la riga resta e il reinvio e un clic.
  */
  let delivered = false;
  try {
    const esito = await inviaEmailDiInvito({
      to: email,
      athleteName: nomeAtleta,
      clubName: club.name,
      token,
    });
    delivered = esito.status === "sent";
  } catch (error) {
    /*
      Non si rilancia, e non si registra il motivo tecnico accanto al token:
      la consegna e un fatto separato dall'invito, la scheda lo dice, e il
      reinvio esiste apposta.
    */
    reportServerError(error, {
      metadata: {
        inviteId: invito.id,
        esito: "[athlete-accounts] invio invito non riuscito",
      },
    });
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.athleteAccountInvited,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail,
    actorRole: scope.activeRole,
    organizationId: atleta.organization_id,
    resource: "athlete_account_invites",
    resourceId: invito.id,
    metadata: {
      athlete_id: atleta.id,
      email,
      /* Un'utenza nuova o una che esisteva gia: e la domanda che si fa dopo. */
      account_created: creata,
      delivered,
      /*
        **Chi ha aperto un accesso a un minore, e quando** (ADR-0116). L'audit
        porta gia attore, ruolo, club e ora: qui si aggiunge il fatto che
        rende quella riga interessante, cioe che il soggetto era un minore e
        che la responsabilita genitoriale e stata dichiarata.
      */
      minor: minore,
      guardian_acknowledged: minore ? true : null,
    },
  });

  return {
    inviteId: invito.id,
    email,
    expiresAt: expiresAt.toISOString(),
    delivered,
  };
};

/**
 * Chiude l'invito vivo, qualunque ne sia il motivo.
 *
 * Restituisce la riga chiusa, o `null` se non ce n'era una viva: un reinvio su
 * un atleta senza invito e comunque un invito, non un errore.
 */
const chiudiInvitoVivo = async (
  organizationId: string,
  athleteId: string,
  status: Extract<AthleteAccountInviteStatus, "revoked" | "accepted">,
) => {
  const vivo = await prisma.athleteAccountInvite.findFirst({
    where: {
      organization_id: organizationId,
      athlete_id: athleteId,
      status: "sent",
    },
    orderBy: { sent_at: "desc" },
  });
  if (!vivo) return null;

  return prisma.athleteAccountInvite.update({
    where: { id: vivo.id },
    data: {
      status,
      ...(status === "revoked"
        ? { revoked_at: new Date() }
        : { accepted_at: new Date() }),
    },
  });
};

/**
 * Rimanda l'invito.
 *
 * **Revoca il precedente e ne crea uno nuovo**, con un token nuovo. Non
 * riusa il vecchio: un link che gira da tre settimane in una casella
 * dimenticata non e la stessa cosa di un link appena mandato, e chi reinvia lo
 * fa quasi sempre perche il primo e finito in un posto che non controlla.
 */
export const resendAthleteAccountInvite = async (
  scope: AthleteAccountsScope,
  input: { athleteId: string },
): Promise<AthleteInviteResult> => {
  await assertPuoGestireAccessi(scope, input.athleteId);
  const atleta = await caricaAtletaDelClubAttivo(scope, input.athleteId);

  const vivo = await prisma.athleteAccountInvite.findFirst({
    where: {
      organization_id: atleta.organization_id,
      athlete_id: atleta.id,
      status: "sent",
    },
    orderBy: { sent_at: "desc" },
  });

  if (!vivo) {
    throw new Error(
      "Non c'e nessun invito da reinviare per questo atleta: mandane uno nuovo",
    );
  }

  await chiudiInvitoVivo(atleta.organization_id, atleta.id, "revoked");

  /*
    **Il reinvio non chiede di nuovo la conferma sul minore**, e non e una
    scappatoia: la decisione e gia stata presa e registrata quando l'invito che
    stiamo rimandando e nato — stessa persona, stesso indirizzo, stesso link
    verso la stessa casella. Chiederla di nuovo trasformerebbe una conferma in
    una casella da spuntare a ogni clic, che e il modo in cui una conferma
    smette di significare qualcosa.

    Il cambio di indirizzo, che manda il link a una casella **diversa**, la
    richiede eccome: vedi `changeAthleteAccountEmail`.
  */
  return sendAthleteAccountInvite(scope, {
    athleteId: atleta.id,
    email: vivo.email,
    acknowledgeMinor: true,
  });
};

/**
 * Cambia l'indirizzo a cui l'invito e stato mandato.
 *
 * Vale solo finche l'accesso **non e attivo**: dopo, l'indirizzo e quello
 * dell'utenza della persona, e cambiarlo dalla scheda del club vorrebbe dire
 * spostare l'account di qualcuno senza che quel qualcuno lo sappia. La strada
 * e revocare e invitare il nuovo indirizzo, e resta scritta nell'audit.
 */
export const changeAthleteAccountEmail = async (
  scope: AthleteAccountsScope,
  input: {
    athleteId: string;
    email: string;
    /**
     * Come per il primo invito, e per la stessa ragione: il link va a una
     * casella **diversa** da quella su cui la decisione era stata presa
     * (ADR-0116).
     */
    acknowledgeMinor?: boolean;
  },
): Promise<AthleteInviteResult> => {
  await assertPuoGestireAccessi(scope, input.athleteId);
  const atleta = await caricaAtletaDelClubAttivo(scope, input.athleteId);

  if (atleta.user_id) {
    throw new Error(
      "L'accesso e gia attivo: per cambiare indirizzo revocalo e manda un nuovo invito",
    );
  }

  const email = normalizeEmail(input.email);
  assertEmail(email);

  await chiudiInvitoVivo(atleta.organization_id, atleta.id, "revoked");

  return sendAthleteAccountInvite(scope, {
    athleteId: atleta.id,
    email,
    acknowledgeMinor: input.acknowledgeMinor,
  });
};

/* ========================================================================= *
 *  La revoca
 * ========================================================================= */

/**
 * Toglie l'accesso, e lascia traccia.
 *
 * Tre gesti in una transazione, perche a metà sarebbero peggio di zero: slega
 * `athletes.user_id`, toglie la tessera `athlete` di **quel** club, e chiude
 * l'invito vivo se ce n'e uno.
 *
 * **Non cancella l'utenza e non tocca le altre tessere.** Lo stesso essere
 * umano puo essere l'atleta di un club e il genitore di un altro: revocare qui
 * il suo accesso da atleta non deve chiudergli la porta di casa.
 */
export const revokeAthleteAccess = async (
  scope: AthleteAccountsScope,
  input: { athleteId: string; reason?: string | null },
): Promise<{ athleteId: string; revokedUserId: string | null }> => {
  await assertPuoGestireAccessi(scope, input.athleteId);
  const atleta = await caricaAtletaDelClubAttivo(scope, input.athleteId);

  const utenteCollegato = asText(atleta.user_id) || null;

  /*
    **Le tessere da togliere si scelgono per identita, non per slug** (PP-04).

    `role: "athlete"` toglieva **solo** la riga scritta con quella parola. Una
    tessera con lo slug italiano, o quella di un **ruolo personalizzato** il cui
    `base_role` e `athlete` (ADR-0102), sopravviveva alla revoca: la persona
    restava dentro il club come atleta, con il ruolo che le era stato dato,
    dopo che il club aveva letto «Accesso revocato».

    `normalizeAccessRole` e il vocabolario del repository e conosce gli alias;
    per il ruolo personalizzato la risposta sta su `club_roles.base_role`, che
    si legge — non si scrive — dal proprietario di quel dominio.
  */
  const tessereDaTogliere = utenteCollegato
    ? (
        await prisma.organizationUser.findMany({
          where: {
            organization_id: atleta.organization_id,
            user_id: utenteCollegato,
          },
          select: {
            id: true,
            role: true,
            custom_role: { select: { base_role: true } },
          },
        })
      )
        .filter(
          (tessera) =>
            normalizeAccessRole(
              tessera.custom_role?.base_role || tessera.role,
            ) === "athlete",
        )
        .map((tessera) => tessera.id)
    : [];

  await prisma.$transaction(async (tx) => {
    if (utenteCollegato) {
      await tx.athlete.update({
        where: { id: atleta.id },
        data: { user_id: null },
      });

      if (tessereDaTogliere.length) {
        await tx.clubAccessScope.deleteMany({
          where: { organization_user_id: { in: tessereDaTogliere } },
        });
        await tx.organizationUser.deleteMany({
          where: { id: { in: tessereDaTogliere } },
        });
      }
    }

    const vivo = await tx.athleteAccountInvite.findFirst({
      where: {
        organization_id: atleta.organization_id,
        athlete_id: atleta.id,
        status: "sent",
      },
      orderBy: { sent_at: "desc" },
    });

    if (vivo) {
      await tx.athleteAccountInvite.update({
        where: { id: vivo.id },
        data: { status: "revoked", revoked_at: new Date() },
      });
    } else if (utenteCollegato) {
      /*
        **Quando si revoca un accesso attivo non c'e nessun invito vivo**: c'e
        un invito **accettato**, e finora la revoca non lasciava su di lui
        nessun segno. Conseguenza: lo stato «Accesso revocato» si poteva
        dedurre, ma non si poteva dire **quando**.

        Lo `status` resta `accepted` — quell'invito e stato accettato davvero, e
        riscriverlo cancellerebbe un fatto — e si scrive solo `revoked_at`, che
        e la data in cui l'accesso nato da quell'invito e stato tolto. Le due
        colonne dicono due cose diverse e adesso le dicono entrambe.
      */
      const accettato = await tx.athleteAccountInvite.findFirst({
        where: {
          organization_id: atleta.organization_id,
          athlete_id: atleta.id,
          status: "accepted",
          revoked_at: null,
        },
        orderBy: { sent_at: "desc" },
      });

      if (accettato) {
        await tx.athleteAccountInvite.update({
          where: { id: accettato.id },
          data: { revoked_at: new Date() },
        });
      }
    }
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.athleteAccountRevoked,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail,
    actorRole: scope.activeRole,
    organizationId: atleta.organization_id,
    resource: "athlete_account_invites",
    resourceId: atleta.id,
    metadata: {
      athlete_id: atleta.id,
      revoked_user_id: utenteCollegato,
      reason: asText(input.reason) || null,
    },
  });

  return { athleteId: atleta.id, revokedUserId: utenteCollegato };
};

/* ========================================================================= *
 *  Lo scollegamento: non e la revoca
 * ========================================================================= */

/**
 * Slega `athletes.user_id` e basta.
 *
 * **La differenza con `revokeAthleteAccess`, in una frase**: quella toglie
 * anche la tessera `athlete` di `organization_users` e chiude l'invito vivo —
 * e un atto di revoca completa, riservato a chi decide che questa persona non
 * ha piu accesso al club come atleta. Questa funzione non tocca nessuna
 * tessera: e la forma di «Scollega account» che il mandato del 2026-09-03
 * (correzione Fortitudo Scauri) chiede anche per l'atleta, simmetrica a
 * quella gia scritta per allenatore e genitore in
 * `profile-account-links.ts`. La tessera, se c'e ancora, resta — la si
 * revoca dalla Gestione Accessi, non da qui.
 *
 * **Idempotente**: un atleta gia scollegato non lancia, restituisce
 * `revokedUserId: null`. Un doppio clic non e un errore.
 */
export const unlinkAthleteAccount = async (
  scope: AthleteAccountsScope,
  input: { athleteId: string; reason?: string | null },
): Promise<{ athleteId: string; unlinkedUserId: string | null }> => {
  await assertPuoGestireAccessi(scope, input.athleteId);
  const atleta = await caricaAtletaDelClubAttivo(scope, input.athleteId);

  const utenteCollegato = asText(atleta.user_id) || null;
  if (!utenteCollegato) {
    return { athleteId: atleta.id, unlinkedUserId: null };
  }

  await prisma.athlete.update({
    where: { id: atleta.id },
    data: { user_id: null },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.athleteAccountUnlinked,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail,
    actorRole: scope.activeRole,
    organizationId: atleta.organization_id,
    resource: "athletes",
    resourceId: atleta.id,
    metadata: {
      athlete_id: atleta.id,
      unlinked_user_id: utenteCollegato,
      reason: asText(input.reason) || null,
    },
  });

  return { athleteId: atleta.id, unlinkedUserId: utenteCollegato };
};

/* ========================================================================= *
 *  L'accettazione
 * ========================================================================= */

export type AthleteInviteAcceptance = {
  athleteId: string;
  organizationId: string;
  clubName: string;
  athleteName: string;
  email: string;
  /**
   * Vero quando l'utenza non aveva credenziali che qualcuno conoscesse e le e
   * stato mandato il link per sceglierle. Falso quando l'account esisteva gia:
   * in quel caso si entra con le proprie credenziali di sempre.
   */
  passwordSetupSent: boolean;
};

/**
 * Riscatta l'invito: **scrive il legame, e da li il ruolo atleta esiste**.
 *
 * ## Perche non chiede una sessione
 *
 * Il token *e* la prova, e l'invitato quasi mai ne ha una: la sua utenza e
 * nata senza credenziali note proprio per questo. Chiedere una sessione
 * significherebbe chiedergli di accedere prima di avere una password.
 *
 * E non c'e niente da dirottare: l'invito porta con se **chi** e stato
 * invitato (`user_id`), quindi il legame nasce verso quell'utenza e non verso
 * chi sta guardando lo schermo.
 *
 * ## Cosa scrive, e in una transazione sola
 *
 * `athletes.user_id`, la tessera `organization_users` con `role: "athlete"`, e
 * la chiusura dell'invito. Sono i tre fatti che rendono il ruolo raggiungibile:
 * `findDirectAthleteIdForUser` legge il primo, `resolveOrganizationScopeForUser`
 * il secondo. Scriverne due su tre lascerebbe una persona dentro un'area senza
 * un profilo, o con un profilo e senza area.
 */
export const acceptAthleteAccountInvite = async (
  token: string,
): Promise<AthleteInviteAcceptance> => {
  const normalizzato = asText(token);
  /*
    Un messaggio solo per tutti i motivi di rifiuto — assente, sconosciuto,
    scaduto, revocato, gia usato — perche distinguerli direbbe a chi prova
    quale forma di token esiste. E la stessa scelta di `confirmPasswordReset`.
  */
  const nonValido = () => new Error("Invito non valido, gia usato o scaduto");

  if (!normalizzato) throw nonValido();

  const invito = await prisma.athleteAccountInvite.findFirst({
    where: { token_hash: hashToken(normalizzato) },
  });

  if (!invito || invito.status !== "sent") throw nonValido();

  if (new Date(invito.expires_at) <= new Date()) {
    /*
      Lo stato `expired` si scrive **quando qualcuno ci prova**, e non da un
      cron: la scadenza e gia nella riga, e una colonna che dice la stessa cosa
      della data serve solo a far vedere alla scheda perche quel link non
      funziona piu.
    */
    await prisma.athleteAccountInvite.update({
      where: { id: invito.id },
      data: { status: "expired" },
    });
    throw nonValido();
  }

  const [atleta, club] = await Promise.all([
    prisma.athlete.findUnique({
      where: { id: invito.athlete_id },
      select: {
        id: true,
        organization_id: true,
        user_id: true,
        first_name: true,
        last_name: true,
      },
    }),
    prisma.club.findUnique({
      where: { id: invito.organization_id },
      select: { id: true, name: true },
    }),
  ]);

  if (!atleta || !club) throw nonValido();

  /*
    Fra l'invio e il clic il club puo aver collegato l'atleta a qualcun altro.
    L'invito non vince su un legame gia scritto: sarebbe un modo di rubare una
    scheda con un link vecchio.
  */
  if (atleta.user_id && atleta.user_id !== invito.user_id) throw nonValido();

  const utente = invito.user_id
    ? await prisma.user.findUnique({ where: { id: invito.user_id } })
    : null;

  if (!utente) throw nonValido();

  /*
    Un'utenza mai verificata e un'utenza le cui credenziali non conosce
    nessuno: e il segnale — e non un campo in piu — che dice se va mandato il
    link per scegliere la password. Chi ha gia un account verificato entra con
    le proprie credenziali, e non gli si forza nessun reset.
  */
  const senzaCredenzialiNote = !utente.email_verified_at;

  await prisma.$transaction(async (tx) => {
    /*
      **Una utenza, una scheda — e la decisione la prende chi scrive**
      (PP-04, ADR-0125).

      `sendAthleteAccountInvite` chiede gia due volte se questo indirizzo
      appartiene a un altro atleta, ma entrambe le domande arrivano prima che
      il legame esista: fra i due inviti `athletes.user_id` e ancora vuoto, e
      due inviti emessi sulla stessa casella superavano tutti e due il
      controllo. Chi puo rispondere davvero e questo punto, che e l'unico
      scrittore del campo, dentro la transazione che lo scrive.

      Misurato contro PostgreSQL prima del fix: due schede con la stessa
      `user_id`, il prodotto che ne sceglieva una, e quell'unica identita che
      apriva la bacheca di entrambe.
    */
    const altraScheda = await tx.athlete.findFirst({
      where: { user_id: utente.id, id: { not: atleta.id } },
      select: { id: true },
    });
    if (altraScheda) {
      throw new Error(
        "Questo indirizzo e gia l'accesso della scheda di un altro atleta: " +
          "chiedi alla societa un indirizzo diverso per questa scheda.",
      );
    }

    await tx.athlete.update({
      where: { id: atleta.id },
      data: { user_id: utente.id },
    });

    let tessera = await tx.organizationUser.findFirst({
      where: {
        organization_id: atleta.organization_id,
        user_id: utente.id,
        role: "athlete",
      },
      select: { id: true },
    });

    if (!tessera) {
      const haGiaUnaPrimaria = await tx.organizationUser.findFirst({
        where: { user_id: utente.id, is_primary: true },
        select: { id: true },
      });

      tessera = await tx.organizationUser.create({
        data: {
          organization_id: atleta.organization_id,
          user_id: utente.id,
          role: "athlete",
          is_primary: !haGiaUnaPrimaria,
        },
        select: { id: true },
      });
    }

    /*
      **La tessera nasce con il suo perimetro** (P0-2).

      Fino a qui non ne nasceva con nessuno, e per ADR-0103 zero righe di
      perimetro non significa «nessun accesso»: significa **tutto il club**.
      Un ragazzo che riscattava il proprio invito usciva percio con il
      perimetro piu largo che il modello preveda, sedi e categorie in cui non
      ha mai messo piede comprese. Misurato: `accessScopeAllows` rispondeva
      `true` su ogni sede.

      Il perimetro di un atleta non ha bisogno di essere dichiarato da
      nessuno: **e dove si allena**, cioe le sue appartenenze. Si deriva da li
      e si scrive dal proprietario di quella tabella (`club-roles.ts`), non
      da qui: questo file resta il proprietario di `athletes.user_id` e di
      nient altro.

      Se le appartenenze non dicono niente — un atleta che il club non ha
      ancora messo in nessuna categoria — non si inventa un recinto e non si
      rifiuta il riscatto: restano zero righe, che significano tutto il club.
      E il residuo dichiarato di questa correzione, ed e registrato come
      debito: la semantica di «zero righe» non si cambia in un riscatto senza
      prima misurarne tutti i lettori.
    */
    const perimetri = await deriveAthleteAccessScopes(
      tx,
      atleta.organization_id,
      atleta.id,
    );
    await applyMembershipAccessScopes(tx, tessera.id, perimetri);

    /*
      *(La stessa corsa e stata trovata in modo indipendente dal closeout
      P0-2, con la stessa chiusura: `updateMany` condizionato sullo stato. Le
      due misure concordano.)*

      **Il consumo e qui, ed e condizionato** (PP-04, ADR-0119).

      La lettura che ha deciso «questo invito e `sent`» sta **fuori** dalla
      transazione, e fra quella lettura e questa scrittura passa un'attesa di
      rete. Con un `update` per identificativo, due riscatti simultanei dello
      stesso token superavano entrambi il controllo e scrivevano entrambi:
      misurato contro PostgreSQL, due 200, due righe di audit `accepted` e —
      la parte che conta — **due `sendPasswordResetChallenge`**, cioe due token
      di reset validi emessi da un gesto solo.

      `updateMany` con `status: "sent"` nel `where` sposta la decisione dentro
      la transazione e la fa prendere al database, che e l'unico che puo
      prenderla: la riga si aggiorna una volta sola, e il secondo tentativo
      conta zero e aborta la transazione.

      Un fake Prisma non avrebbe mai mostrato questo: e la classe di difetti
      per cui la sonda della lane parla con PostgreSQL vero.
    */
    const consumato = await tx.athleteAccountInvite.updateMany({
      where: { id: invito.id, status: "sent" },
      data: { status: "accepted", accepted_at: new Date() },
    });
    if (consumato.count !== 1) throw nonValido();

    if (consumato.count !== 1) throw nonValido();

    if (senzaCredenzialiNote) {
      /*
        Aprire il link dimostra il controllo della casella: e esattamente cio
        che la verifica dell'indirizzo accerta, e non ha senso chiederlo due
        volte alla stessa persona nello stesso minuto.
      */
      await tx.user.update({
        where: { id: utente.id },
        data: { email_verified_at: new Date() },
      });
    }
  });

  let passwordSetupSent = false;
  if (senzaCredenzialiNote) {
    /*
      **La password non nasce qui.** Si riusa il meccanismo di ADR-0015: un
      token opaco, un link, e la persona che sceglie. Non c'e nessun secondo
      meccanismo di credenziali, e nessun ramo di questo file compone una
      password da comunicare.
    */
    try {
      const esito = await sendPasswordResetChallenge({
        id: utente.id,
        email: utente.email,
        first_name: utente.first_name,
      });
      passwordSetupSent = esito.sent;
    } catch (error) {
      reportServerError(error, {
        metadata: {
          userId: utente.id,
          esito: "[athlete-accounts] invio scelta password non riuscito",
        },
      });
    }
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.athleteAccountAccepted,
    actorUserId: utente.id,
    actorEmail: utente.email,
    actorRole: "athlete",
    organizationId: atleta.organization_id,
    resource: "athlete_account_invites",
    resourceId: invito.id,
    metadata: {
      athlete_id: atleta.id,
      password_setup_sent: passwordSetupSent,
    },
  });

  return {
    athleteId: atleta.id,
    organizationId: atleta.organization_id,
    clubName: club.name,
    athleteName:
      `${atleta.first_name || ""} ${atleta.last_name || ""}`.trim() || "Atleta",
    email: utente.email,
    passwordSetupSent,
  };
};

/* ========================================================================= *
 *  L'area dell'atleta: una lettura sola, e un elenco chiuso di campi
 * ========================================================================= */

/**
 * **Cio che un atleta vede di se stesso, dichiarato campo per campo.**
 *
 * ## Perche non nasce un secondo dominio
 *
 * Nessuna riga qui sotto interroga il database per conto proprio. La lettura
 * la fanno i domini che gia esistono — `getParentDashboardData` per la scheda,
 * gli eventi, le presenze e gli appuntamenti; `readAthleteRsvpInvitations` per
 * le convocazioni ancora aperte — e tutti e due risolvono da soli il
 * **legame**, che per un atleta e `athletes.user_id = <la sua utenza>`. Un
 * secondo lettore vorrebbe dire una seconda idea di «cosa riguarda questa
 * persona», e le due divergerebbero al primo cambiamento.
 *
 * ## Perche una proiezione, e perche a elenco chiuso
 *
 * Perche l'area famiglia e l'area atleta **non sono la stessa area**. La prima
 * parla a chi paga: quote, ricevute, fatture, iscrizione, consensi. La seconda
 * parla a chi gioca, e spesso e un minore. Qui si dichiara cio che esce, e
 * tutto il resto non esce: un campo nuovo su `getParentDashboardData` nasce
 * **invisibile** a quest'area invece di comparirci il giorno dopo perche
 * nessuno ci ha pensato. E la regola di `listParentChildren` e dell'anagrafica
 * dei colleghi (lane 5I).
 *
 * Fuori dall'elenco, e non per dimenticanza: il **denaro** (quote, ricevute,
 * fatture, iscrizione), i **tutori**, gli **altri atleti** collegati alla
 * stessa utenza, `athletes.data` intero, e il **contenuto clinico** — allergie,
 * note mediche, i certificati con i loro file. Del certificato restano lo
 * **stato** e la data, che sono la risposta a «posso scendere in campo»: e lo
 * stesso taglio che `src/lib/health/permissions.ts` fa per l'allenatore.
 */

/**
 * Un campo della proiezione: **come si chiama nella sorgente**, e come si
 * chiama in uscita.
 *
 * ## Perche un nome doppio, e non un elenco di stringhe
 *
 * Perche i due nomi non coincidono, e dare per scontato che coincidessero e
 * stato il difetto. `toFamilyAppointment` pubblica `starts_at`, `ends_at`,
 * `status_label`, `decision_note`; il fascicolo di famiglia pubblica
 * `documentKindLabel`, `state`, `stateLabel`, `submittedAt`. L'elenco chiedeva
 * `startsAt`, `type`, `status`, `uploadedAt` — nomi che in quegli oggetti
 * **non esistono** — e `soloCampi` copiava `undefined` senza che niente si
 * lamentasse: ogni appuntamento diceva «Data da definire» e ogni documento
 * «— · —».
 *
 * Una stringa sola vale quando i due nomi coincidono davvero. La coppia
 * `[sorgente, uscita]` e la traduzione, ed e dichiarata invece che implicita
 * perche cosi la si puo **verificare**: il presidio di
 * `tests/server/area-atleta-campi-sorgente.test.mjs` chiede alle sorgenti vere
 * un oggetto e pretende che ogni nome di sorgente sia una sua chiave. Una
 * whitelist sbagliata non stampa piu un trattino: fa fallire un test.
 *
 * L'elenco resta **chiuso** — e la ragione per cui esiste — e la traduzione non
 * lo allarga: cambia il nome di cio che gia usciva, non cio che esce.
 */
type CampoProiettato = string | readonly [sorgente: string, uscita: string];

/** Il nome che il campo ha **nella sorgente**: e cio che il presidio verifica. */
export const nomeSorgente = (campo: CampoProiettato) =>
  typeof campo === "string" ? campo : campo[0];

/** Il nome che il campo ha nel contratto letto dall'area atleta. */
const nomeUscita = (campo: CampoProiettato) =>
  typeof campo === "string" ? campo : campo[1];

const soloCampi = (righe: unknown, campi: readonly CampoProiettato[]) => {
  if (!Array.isArray(righe)) return [] as Record<string, unknown>[];
  return righe.map((riga) => {
    const sorgente = (riga || {}) as Record<string, unknown>;
    const uscita: Record<string, unknown> = {};
    for (const campo of campi) {
      uscita[nomeUscita(campo)] = sorgente[nomeSorgente(campo)];
    }
    return uscita;
  });
};

/**
 * **Gli elenchi chiusi, con accanto la sorgente che li produce.**
 *
 * Stanno insieme e sono esportati per una ragione sola: il presidio li
 * enumera. Se restassero sparsi dentro la proiezione, il controllo andrebbe
 * riscritto a mano per ognuno — e il difetto che chiudiamo e proprio quello di
 * un elenco che nessuno confronta con la sua sorgente.
 */
export const CAMPI_AREA_ATLETA = {
  /**
   * Un evento come lo mostra l'area atleta.
   *
   * Sorgente: `toEventLegacyShape` (`src/lib/events/model.ts`), che e la forma
   * con cui `clubs.trainings` e `clubs.matches` sono proiettate, piu il campo
   * che `getParentDashboardData` aggiunge alla riga — ed e **uno per genere**:
   * `attendanceStatus` esiste solo sull'allenamento, perche la presenza si fa
   * all'appello, e `participationStatus` solo sulla gara.
   *
   * Per questo gli elenchi sono due e non uno. Un elenco unico chiedeva a
   * ognuno dei due il campo dell'altro, e la riga usciva con una chiave che
   * valeva sempre `undefined`: invisibile sullo schermo, ma indistinguibile da
   * un nome sbagliato: cioe esattamente cio che il presidio deve saper
   * distinguere.
   */
  allenamento: [
    "id",
    "title",
    "startsAt",
    "endsAt",
    "location",
    "status",
    "categoryName",
    /*
      **Le altre categorie dell'evento** (PP-04, sopra ADR-0111).

      `categoryName` e l'etichetta della sola **primaria**. Su un allenamento
      congiunto — che e il caso in cui questa domanda si pone — l'atleta ci
      entra spesso per la **seconda** categoria, e leggeva il nome di una
      squadra che non e la sua.

      Qui escono gli **identificativi**, che e cio che la colonna
      `club_events.category_ids` contiene; i nomi li mette la schermata
      incrociandoli con `categories`, cioe con le squadre **di questo atleta**.
      Portare qui il catalogo delle categorie del club vorrebbe dire far uscire
      dall'elenco chiuso l'organigramma della societa per stampare
      un'etichetta.
    */
    "categories",
    "opponent",
    "attendanceStatus",
  ],
  gara: [
    "id",
    "title",
    "startsAt",
    "endsAt",
    "location",
    "status",
    "categoryName",
    "categories",
    "opponent",
    "participationStatus",
  ],
  /** Sorgente: `serializeAthleteCard`, campo `categories`. */
  categoria: ["id", "name", "siteId", "label", "isPrimary"],
  /** Sorgente: le righe di `club_event_participants`. */
  presenza: ["event_id", "status", "notes", "updated_at"],
  /**
   * Sorgente: `toFamilyAppointment` (`src/lib/appointments/projection.ts`),
   * che parla **snake_case**.
   *
   * `status_label` non c'era, e senza di lui l'atleta leggeva
   * `cancelled_by_family` e `no_show`: identificativi di colonna, in inglese,
   * su una schermata che spesso legge un ragazzino. L'etichetta italiana la
   * possiede gia il dominio degli appuntamenti — `APPOINTMENT_STATUS_LABELS` —
   * e qui basta chiederla. Lo stato tecnico resta accanto perche e cio su cui
   * una schermata puo ragionare senza tradurre una frase.
   */
  appuntamento: [
    "id",
    ["starts_at", "startsAt"],
    ["ends_at", "endsAt"],
    "status",
    ["status_label", "statusLabel"],
    "reason",
    "notes",
    ["decision_note", "decisionNote"],
  ],
  /**
   * Sorgente: `FamilyDocumentItem` (`src/lib/documents/family-dossier.ts`).
   *
   * `type` e l'**etichetta** del genere di documento e non la sua chiave, e
   * `statusLabel` e «Approvato» invece di `under_review`: valgono le stesse
   * due ragioni dell'appuntamento.
   *
   * **Non esce l'indirizzo del file, e non e una dimenticanza.** L'elenco
   * chiedeva `url`, che nella sorgente si chiama `fileUrl` e punta alla
   * rotta generica degli allegati: al ruolo `athlete` risponde 403,
   * cioe un pulsante rotto. La rotta per legame che l'area famiglia usa —
   * `/api/parent-dashboard/<atleta>/documents/<id>` — risponderebbe, e proprio
   * per questo non la si mette qui: aprirebbe i **byte** dei documenti, fra i
   * quali c'e il certificato medico, cioe il contenuto clinico che questa
   * proiezione tiene fuori per scelta (vedi `health`). Della carta l'atleta
   * vede che esiste, di che tipo e, e a che punto sta.
   */
  documento: [
    "id",
    "title",
    ["documentKindLabel", "type"],
    ["state", "status"],
    ["stateLabel", "statusLabel"],
    ["submittedAt", "uploadedAt"],
    "required",
  ],
  /** Sorgente: le righe di `notifications`. */
  notifica: ["id", "title", "message", "type", "read", "created_at"],
} as const satisfies Record<string, readonly CampoProiettato[]>;

/**
 * **Delle categorie di un evento escono solo le sue** (PP-04, ADR-0120).
 *
 * `categories` e nato per rispondere a «con quale delle mie squadre ci vado?»,
 * su un allenamento congiunto in cui `categoryName` — l'etichetta della sola
 * primaria — e il nome di una squadra che non e la sua. L'incrocio lo faceva
 * pero **la schermata**, e il server consegnava l'array intero.
 *
 * Un filtro nel client non e un filtro: la rotta risponde a `curl`. Da li
 * uscivano gli identificativi dei gruppi a cui l'atleta **non** appartiene —
 * non i nomi, che nessuna superficie dell'atleta risolve, ma la cardinalita e
 * la correlazione: quanti gruppi tocca un evento, e quali eventi condividono
 * un gruppo. Filtrare qui non costa niente e chiude anche l'inferenza.
 */
const soloLeMieCategorie = (righe: any[], mie: ReadonlySet<string>) =>
  righe.map((riga) => ({
    ...riga,
    categories: Array.isArray(riga?.categories)
      ? riga.categories.filter((id: unknown) => mie.has(String(id)))
      : [],
  }));

const proiettaAreaAtleta = (
  dati: Record<string, any>,
  invitiRsvp: Awaited<ReturnType<typeof readAthleteRsvpInvitations>>,
) => {
  const atleta = (dati.athlete || {}) as Record<string, any>;
  const club = (dati.club || {}) as Record<string, any>;
  const salute = (dati.health || {}) as Record<string, any>;

  /* Gli identificativi delle squadre di questo atleta: vedi soloLeMieCategorie. */
  const mieCategorie = new Set<string>(
    (Array.isArray(atleta.categories) ? atleta.categories : [])
      .map((categoria: any) => String(categoria?.id ?? ""))
      .filter(Boolean),
  );
  const evento = (righe: unknown, campi: readonly CampoProiettato[]) =>
    soloLeMieCategorie(soloCampi(righe, campi), mieCategorie);

  return {
    me: {
      id: String(atleta.id || ""),
      name: String(atleta.name || ""),
      firstName: atleta.first_name || null,
      lastName: atleta.last_name || null,
      birthDate: atleta.birth_date || null,
      birthPlace: atleta.birth_place || null,
      nationality: atleta.nationality || null,
      gender: atleta.gender || null,
      fiscalCode: atleta.fiscal_code || null,
      jerseyNumber: atleta.jersey_number || null,
      status: atleta.status || null,
      /* I recapiti: sono gli unici campi che l'atleta corregge da se. */
      email: atleta.email || null,
      phone: atleta.phone || null,
      address: atleta.address || null,
      city: atleta.city || null,
      province: atleta.province || null,
      postalCode: atleta.postal_code || null,
    },
    club: {
      id: String(club.id || ""),
      name: String(club.name || ""),
      logoUrl: club.logo_url || null,
      contactEmail: club.contact_email || null,
      contactPhone: club.contact_phone || null,
      city: club.city || null,
      province: club.province || null,
      website: club.website || null,
      /*
        **La stagione si chiama `activeSeason*` da chi la calcola.**

        `normalizeActiveClubSeason` — l'unico che sa quale delle stagioni
        configurate e quella attiva — pubblica `activeSeasonId` e
        `activeSeasonLabel`. Chiedere `club.seasonId` a quel payload non
        solleva niente: risponde `undefined`, che qui diventava `null`, e
        l'area atleta mostrava un club senza stagione anche quando la stagione
        c'era. E lo stesso difetto di W6-09, su una superficie nuova.

        I nomi in uscita restano `seasonId` / `seasonLabel` perche sono il
        contratto che l'area atleta gia legge: a cambiare e la **fonte**.
      */
      seasonId: club.activeSeasonId ?? null,
      seasonLabel: club.activeSeasonLabel ?? null,
    },
    categories: soloCampi(atleta.categories, CAMPI_AREA_ATLETA.categoria),
    /**
     * Lo **stato** del certificato e la sua data. Nient'altro: non i
     * certificati, non le allergie, non le note mediche.
     */
    /*
      **Le stesse parole che legge la famiglia.**

      Questa area si costruisce dallo stesso `getParentDashboardData`, e
      teneva le tre chiavi vecchie: `status` vale `"missing"` ogni volta che
      non c'e una data, cioe **anche** quando il certificato e stato
      consegnato senza scadenza. Al ragazzo si diceva «Certificato mancante»
      per una cosa che aveva gia fatto, mentre sulla Home il genitore leggeva
      «Consegnato»: lo stesso documento, due risposte opposte dentro lo stesso
      prodotto. E' la distinzione che PP-02 §F e nato per introdurre, arrivata
      su una superficie sola.
    */
    health: {
      status: salute.familyState || salute.status || "missing",
      statusLabel: salute.familyLabel || salute.statusLabel || "",
      detail: salute.familyDetail || "",
      summary: salute.familySummary || "",
      expiryDate: salute.expiryDate || null,
    },
    trainings: {
      upcoming: evento(dati.trainings?.upcoming, CAMPI_AREA_ATLETA.allenamento),
      history: evento(dati.trainings?.history, CAMPI_AREA_ATLETA.allenamento),
    },
    matches: {
      upcoming: evento(dati.matches?.upcoming, CAMPI_AREA_ATLETA.gara),
      history: evento(dati.matches?.history, CAMPI_AREA_ATLETA.gara),
    },
    /** Le convocazioni ancora da rispondere: e la sola cosa che gli e chiesta. */
    rsvp: invitiRsvp,
    attendance: {
      present: dati.attendance?.present ?? 0,
      absent: dati.attendance?.absent ?? 0,
      total: dati.attendance?.total ?? 0,
      rate: dati.attendance?.rate ?? 0,
      items: soloCampi(dati.attendance?.items, CAMPI_AREA_ATLETA.presenza),
    },
    appointments: soloCampi(
      dati.appointments?.items,
      CAMPI_AREA_ATLETA.appuntamento,
    ),
    documents: soloCampi(dati.documents?.uploaded, CAMPI_AREA_ATLETA.documento),
    notifications: soloCampi(dati.notifications, CAMPI_AREA_ATLETA.notifica),
    notificationsUnread: dati.notificationsUnread ?? 0,
    season: {
      trainingsPlayed: (dati.trainings?.history || []).length,
      matchesPlayed: (dati.matches?.history || []).length,
      attendanceRate: dati.analytics?.attendanceRate ?? 0,
      nextTraining:
        evento(
          dati.analytics?.nextTraining ? [dati.analytics.nextTraining] : [],
          CAMPI_AREA_ATLETA.allenamento,
        )[0] || null,
      nextMatch:
        evento(
          dati.analytics?.nextMatch ? [dati.analytics.nextMatch] : [],
          CAMPI_AREA_ATLETA.gara,
        )[0] || null,
    },
  };
};

export type AthleteAreaOverview = ReturnType<typeof proiettaAreaAtleta>;

/**
 * L'atleta di questa utenza, o `null`.
 *
 * **La domanda e `athletes.user_id`**, e non l'indirizzo email — che un utente
 * puo cambiarsi da solo — ne il legame di tutela, che apre l'area famiglia e
 * non questa: un atleta e se stesso, non i propri fratelli.
 *
 * ## Ma il legame da solo non basta (PP-04)
 *
 * Perche un legame puo **restare indietro rispetto alla tessera**, e allora
 * apre una porta che nessuno crede piu aperta. Due strade, misurate contro
 * PostgreSQL vero e contro le rotte vere con
 * `scripts/pp-04-atleta-probe.mjs`:
 *
 * **P-45, il cambio di ruolo.** `assignClubRole` applica «un ruolo alla volta
 * per persona e per club»: assegnare un ruolo nuovo **cancella** le altre
 * tessere, con `organizationUser.delete` e `reason: "replaced_by_new_role"`.
 * Quel ramo non chiama nessuno sweep — `unlinkDirectAthleteProfile` vive solo
 * dentro `revokeClubAccess` e dentro `memberships/delete`. Quindi: la
 * segreteria cambia a un atleta il ruolo in «Collaboratore», la tessera
 * `athlete` sparisce, `athletes.user_id` resta, e l'area atleta rispondeva
 * **200** — allenamenti, presenze, documenti, stato del certificato, recapiti.
 *
 * **P-52, la revoca della tessera.** `unlinkDirectAthleteProfile` riconosce
 * **lo slug** (`ATHLETE_ROLES` = `athlete`, `atleta`, `player`) e non
 * l'identita: `giocatore` e `giocatrice` sono alias legittimi in
 * `ROLE_ALIASES` e da quell'insieme mancano. La tessera se ne va, il legame
 * resta, e la persona che non appartiene piu al club apre ancora la sua area.
 *
 * La correzione non e un secondo elenco di slug — ne nascerebbe un terzo il
 * giorno dopo. E cambiare la **domanda**: non «questo legame esiste», ma
 * **«questa persona e ancora un atleta di quel club?»**. Risponde di si una
 * tessera il cui ruolo — risolto, alias e ruoli personalizzati compresi —
 * e `athlete`; oppure l'essere il fondatore del club, la cui appartenenza non
 * nasce da una tessera ma da `clubs.creator_id` e che percio non si potrebbe
 * chiudere fuori da casa propria.
 *
 * E la stessa forma della lezione di PP-02: **una revoca vale sull'identita,
 * non sulla riga che si e guardata.**
 *
 * ## Perche il primo atleta «ancora in essere», e non il primo
 *
 * Perche altrimenti un legame morto in un club **nasconderebbe** un legame
 * vivo in un altro: la funzione tornava la riga piu vecchia e si fermava li, e
 * chi fosse stato atleta in due societa avrebbe visto la porta chiusa invece
 * dell'area della societa in cui gioca ancora.
 */
export const findAthleteProfileForUser = async (userId: string) => {
  const id = asText(userId);
  if (!id) return null;

  const candidati = await prisma.athlete.findMany({
    where: { user_id: id },
    select: { id: true, organization_id: true },
    orderBy: { created_at: "asc" },
  });
  if (!candidati.length) return null;

  /*
    **La domanda vive in un modulo solo** (ADR-0117). Stava qui, e lo stesso
    campo aveva un secondo lettore — `athleteBelongsToParent` in
    `parent-dashboard.ts` — che non se la faceva: la porta d'ingresso era
    chiusa e quella di servizio no. Copiarla li avrebbe rifatto il difetto di
    partenza, che e due elenchi che divergono.
  */
  const eAncoraAtleta = await clubsWhereStillAthlete(
    id,
    candidati.map((riga) => riga.organization_id),
  );

  return (
    candidati.find((riga) => eAncoraAtleta.has(riga.organization_id)) || null
  );
};

/**
 * L'unica lettura dell'area atleta.
 *
 * Solleva `Accesso negato` quando l'utenza non e collegata a nessuna scheda:
 * e la stessa risposta che riceve chi prova ad aprire l'area senza esserci
 * dentro, e non distingue «non esiste» da «non e tua».
 */
export const readAthleteAreaOverview = async (
  userId: string,
): Promise<AthleteAreaOverview> => {
  const profilo = await findAthleteProfileForUser(userId);
  if (!profilo) {
    throw negato("nessuna scheda atleta collegata a questo account");
  }

  /*
    **L'unico punto che apre il ramo diretto verso il cruscotto** (ADR-0122).

    Il ragazzo non e tutore di se stesso, e le rotte della famiglia glielo
    dicono: il predefinito del dominio e restrittivo, e chi serve davvero
    l'atleta lo dichiara. E il verso giusto — dimenticarsene chiude una porta
    invece di aprirla.

    Qui i dati servono davvero: e da questo cruscotto che si ricava la
    proiezione ristretta dell'area atleta, che di suo mostra molto meno —
    niente denaro, niente tutori, niente altri atleti.
  */
  const dati = await getParentDashboardData(userId, profilo.id, {
    allowSelfAthleteLink: true,
  });
  if (!dati) {
    throw negato("nessuna scheda atleta collegata a questo account");
  }

  /*
    Le convocazioni non stanno in `getParentDashboardData`: il loro
    proprietario e `rsvp.ts`, che sa quando una risposta e ancora possibile. Un
    secondo calcolo della scadenza qui mostrerebbe all'atleta un pulsante che
    il server poi rifiuta.
  */
  const inviti = await readAthleteRsvpInvitations({
    athleteId: profilo.id,
    userId,
  });

  return proiettaAreaAtleta(dati as Record<string, any>, inviti);
};

/**
 * I **recapiti** che un atleta puo correggere da se.
 *
 * ## Perche solo questi sei campi
 *
 * Perche sono gli unici di cui la persona e la fonte piu attendibile. Nome,
 * data e luogo di nascita, codice fiscale, numero di maglia, categoria e stato
 * sono **anagrafica della societa**: finiscono su tesseramenti, ricevute e
 * documenti fiscali, e lasciarli riscrivere dall'interessato vorrebbe dire
 * lasciargli cambiare cio che il club ha dichiarato altrove. Un cambio di
 * indirizzo o di numero di telefono no: quello e suo.
 *
 * L'elenco e **chiuso**, e la scrittura passa da qui e non da un `...input`:
 * un campo nuovo su `athletes.data` nasce non scrivibile da questa porta.
 *
 * La traccia e `anagrafica.updated`, la stessa delle altre scritture su
 * un'anagrafica di persona: «chi ha cambiato i dati di chi, e quando» e la
 * domanda, e la risposta non cambia perche a scrivere e l'interessato.
 */
export const CAMPI_RECAPITO_MODIFICABILI = [
  "email",
  "phone",
  "address",
  "city",
  "province",
  "postalCode",
] as const;

export const updateOwnAthleteContacts = async (
  userId: string,
  input: Record<string, unknown>,
) => {
  const profilo = await findAthleteProfileForUser(userId);
  if (!profilo) {
    throw negato("nessuna scheda atleta collegata a questo account");
  }

  const atleta = await prisma.athlete.findUnique({
    where: { id: profilo.id },
    select: { id: true, organization_id: true, data: true },
  });
  if (!atleta) throw new Error("Atleta non trovato");

  const precedente =
    atleta.data &&
    typeof atleta.data === "object" &&
    !Array.isArray(atleta.data)
      ? (atleta.data as Record<string, unknown>)
      : {};

  const modificati: string[] = [];
  const prossimo: Record<string, unknown> = { ...precedente };

  for (const campo of CAMPI_RECAPITO_MODIFICABILI) {
    if (!(campo in input)) continue;
    const valore = asText(input[campo]);
    if (asText(precedente[campo]) === valore) continue;
    prossimo[campo] = valore;
    modificati.push(campo);
  }

  if (modificati.includes("email")) {
    const nuovo = asText(prossimo.email);
    /*
      Puo svuotarlo — un atleta senza indirizzo di contatto e un caso vero — ma
      se ne scrive uno deve essere un indirizzo. Questo campo **non e** quello
      con cui accede: quello vive su `users.email` e lo cambia il flusso
      dell'account, non questa porta.
    */
    if (nuovo) assertEmail(nuovo.toLowerCase());
  }

  if (!modificati.length) return { athleteId: atleta.id, updated: [] };

  /*
    **Il quinto scrittore di `athletes.data`, che il blocco non lo prendeva.**

    Questa strada — il ragazzo che corregge da se telefono, indirizzo o email —
    legge il blob, ne fonde sei campi e lo riscrive **per intero**. Senza blocco
    e senza rilettura era un lost update come gli altri, e il verso era
    deterministico e sfavorevole: il self-service non ha guardie, quindi e
    sempre il piu veloce a leggere e il piu lento a scrivere.

    Misurato tre volte su tre: «Scollega account» in parallelo a un salvataggio
    del proprio numero di telefono, e la revoca **spariva per intero** —
    registro vuoto, riga tutore intatta, persona revocata di nuovo dentro il
    fascicolo del minore. La segreteria aveva la conferma a schermo e la riga di
    audit.

    Un censimento dichiarava «quattro scrittori»; erano sei. Adesso questo
    prende lo stesso blocco degli altri e rifonde i sei campi su cio che legge
    **dentro**: cio che un altro ha scritto nel frattempo resta scritto.
  */
  await prisma.$transaction(async (client: any) => {
    await lockAthleteRow(client, atleta.id);

    const fresca = await client.athlete.findUnique({
      where: { id: atleta.id },
      select: { data: true },
    });

    const base =
      fresca?.data && typeof fresca.data === "object" && !Array.isArray(fresca.data)
        ? (fresca.data as Record<string, unknown>)
        : {};

    const aggiornato: Record<string, unknown> = { ...base };
    for (const campo of modificati) {
      aggiornato[campo] = prossimo[campo];
    }

    await client.athlete.update({
      where: { id: atleta.id },
      data: { data: aggiornato as never },
    });
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.anagraficaUpdated,
    actorUserId: userId,
    actorRole: "athlete",
    organizationId: atleta.organization_id,
    resource: "athletes",
    resourceId: atleta.id,
    metadata: { fields: modificati, self_service: true },
  });

  return { athleteId: atleta.id, updated: modificati };
};
