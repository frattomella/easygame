import { createHash, randomBytes } from "crypto";

import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { roleHasPermission } from "@/lib/permissions/catalog";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import { sendTransactionalEmail } from "./email/email-service";
import { sendPasswordResetChallenge } from "./auth-workflows";
import { getParentDashboardData } from "./parent-dashboard";
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
      data: true,
    },
  });

  if (!atleta) throw new Error("Atleta non trovato");
  assertActiveClub(scope, atleta.organization_id, "l'atleta");

  return atleta;
};

/* ========================================================================= *
 *  Lo stato, per la scheda
 * ========================================================================= */

export type AthleteAccountState = {
  athleteId: string;
  /** `none` | `invited` | `active`. Si **deriva**, non si scrive. */
  status: "none" | "invited" | "active";
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
      (riga) =>
        riga.status === "sent" && new Date(riga.expires_at) > adesso,
    ) || null;

  return {
    athleteId: atleta.id,
    status: utente ? "active" : vivo ? "invited" : "none",
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
const risolviUtenza = async (email: string, athleteNome: {
  first_name?: string | null;
  last_name?: string | null;
}) => {
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
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Attiva il tuo accesso EasyGame</h2>
        <p>Ciao ${escapeHtml(input.athleteName)}, <strong>${escapeHtml(input.clubName)}</strong> ti ha aperto un accesso personale su EasyGame: da li vedi i tuoi allenamenti, le gare, le convocazioni e i tuoi documenti.</p>
        <p style="padding: 20px 0;">
          <a href="${link}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Attiva il mio accesso</a>
        </p>
        <p>Il link scade tra ${ATHLETE_INVITE_TTL_DAYS} giorni. Al primo accesso sceglierai tu la tua password: nessuno del club la conosce e nessuno te la puo comunicare.</p>
        <p style="color:#64748b;font-size:13px;">Se non ti aspettavi questo messaggio, ignoralo: senza il link non succede niente.</p>
      </div>
    `,
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
  input: { athleteId: string; email: string },
): Promise<AthleteInviteResult> => {
  await assertPuoGestireAccessi(scope, input.athleteId);
  const atleta = await caricaAtletaDelClubAttivo(scope, input.athleteId);

  if (atleta.user_id) {
    throw new Error(
      "Questo atleta ha gia un accesso EasyGame attivo: revocalo prima di invitarne un altro",
    );
  }

  const email = normalizeEmail(input.email);
  assertEmail(email);

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
    console.error("[athlete-accounts] invio invito non riuscito", {
      inviteId: invito.id,
      message: (error as Error)?.message,
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

  return sendAthleteAccountInvite(scope, {
    athleteId: atleta.id,
    email: vivo.email,
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
  input: { athleteId: string; email: string },
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

  return sendAthleteAccountInvite(scope, { athleteId: atleta.id, email });
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

  await prisma.$transaction(async (tx) => {
    if (utenteCollegato) {
      await tx.athlete.update({
        where: { id: atleta.id },
        data: { user_id: null },
      });

      await tx.organizationUser.deleteMany({
        where: {
          organization_id: atleta.organization_id,
          user_id: utenteCollegato,
          role: "athlete",
        },
      });
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
  const nonValido = () =>
    new Error("Invito non valido, gia usato o scaduto");

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
    await tx.athlete.update({
      where: { id: atleta.id },
      data: { user_id: utente.id },
    });

    const tessera = await tx.organizationUser.findFirst({
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

      await tx.organizationUser.create({
        data: {
          organization_id: atleta.organization_id,
          user_id: utente.id,
          role: "athlete",
          is_primary: !haGiaUnaPrimaria,
        },
      });
    }

    await tx.athleteAccountInvite.update({
      where: { id: invito.id },
      data: { status: "accepted", accepted_at: new Date() },
    });

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
      console.error("[athlete-accounts] invio scelta password non riuscito", {
        userId: utente.id,
        message: (error as Error)?.message,
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

const soloCampi = (righe: unknown, campi: readonly string[]) => {
  if (!Array.isArray(righe)) return [] as Record<string, unknown>[];
  return righe.map((riga) => {
    const sorgente = (riga || {}) as Record<string, unknown>;
    const uscita: Record<string, unknown> = {};
    for (const campo of campi) uscita[campo] = sorgente[campo];
    return uscita;
  });
};

/** I campi di un evento che l'area atleta mostra. */
const CAMPI_EVENTO = [
  "id",
  "title",
  "startsAt",
  "endsAt",
  "location",
  "status",
  "categoryName",
  "opponent",
  "attendanceStatus",
  "participationStatus",
] as const;

const proiettaAreaAtleta = (
  dati: Record<string, any>,
  invitiRsvp: Awaited<ReturnType<typeof readAthleteRsvpInvitations>>,
) => {
  const atleta = (dati.athlete || {}) as Record<string, any>;
  const club = (dati.club || {}) as Record<string, any>;
  const salute = (dati.health || {}) as Record<string, any>;

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
    categories: soloCampi(atleta.categories, [
      "id",
      "name",
      "siteId",
      "isPrimary",
    ]),
    /**
     * Lo **stato** del certificato e la sua data. Nient'altro: non i
     * certificati, non le allergie, non le note mediche.
     */
    health: {
      status: salute.status || "missing",
      statusLabel: salute.statusLabel || "",
      expiryDate: salute.expiryDate || null,
    },
    trainings: {
      upcoming: soloCampi(dati.trainings?.upcoming, CAMPI_EVENTO),
      history: soloCampi(dati.trainings?.history, CAMPI_EVENTO),
    },
    matches: {
      upcoming: soloCampi(dati.matches?.upcoming, CAMPI_EVENTO),
      history: soloCampi(dati.matches?.history, CAMPI_EVENTO),
    },
    /** Le convocazioni ancora da rispondere: e la sola cosa che gli e chiesta. */
    rsvp: invitiRsvp,
    attendance: {
      present: dati.attendance?.present ?? 0,
      absent: dati.attendance?.absent ?? 0,
      total: dati.attendance?.total ?? 0,
      rate: dati.attendance?.rate ?? 0,
      items: soloCampi(dati.attendance?.items, [
        "event_id",
        "status",
        "notes",
        "updated_at",
      ]),
    },
    appointments: soloCampi(dati.appointments?.items, [
      "id",
      "startsAt",
      "endsAt",
      "status",
      "reason",
      "notes",
      "decisionNote",
    ]),
    documents: soloCampi(dati.documents?.uploaded, [
      "id",
      "name",
      "title",
      "type",
      "status",
      "uploadedAt",
      "url",
      "required",
    ]),
    notifications: soloCampi(dati.notifications, [
      "id",
      "title",
      "message",
      "type",
      "read",
      "created_at",
    ]),
    notificationsUnread: dati.notificationsUnread ?? 0,
    season: {
      trainingsPlayed: (dati.trainings?.history || []).length,
      matchesPlayed: (dati.matches?.history || []).length,
      attendanceRate: dati.analytics?.attendanceRate ?? 0,
      nextTraining:
        soloCampi(
          dati.analytics?.nextTraining ? [dati.analytics.nextTraining] : [],
          CAMPI_EVENTO,
        )[0] || null,
      nextMatch:
        soloCampi(
          dati.analytics?.nextMatch ? [dati.analytics.nextMatch] : [],
          CAMPI_EVENTO,
        )[0] || null,
    },
  };
};

export type AthleteAreaOverview = ReturnType<typeof proiettaAreaAtleta>;

/**
 * L'atleta di questa utenza, o `null`.
 *
 * **La domanda e `athletes.user_id`, e nient'altro.** Non l'indirizzo email,
 * che un utente puo cambiarsi da solo, e non il legame di tutela, che apre
 * l'area famiglia e non questa: un atleta e se stesso, non i propri fratelli.
 */
export const findAthleteProfileForUser = async (userId: string) => {
  const id = asText(userId);
  if (!id) return null;

  return prisma.athlete.findFirst({
    where: { user_id: id },
    select: { id: true, organization_id: true },
    orderBy: { created_at: "asc" },
  });
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

  const dati = await getParentDashboardData(userId, profilo.id);
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
    atleta.data && typeof atleta.data === "object" && !Array.isArray(atleta.data)
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

  await prisma.athlete.update({
    where: { id: atleta.id },
    data: { data: prossimo as never },
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
