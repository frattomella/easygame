import { prisma } from "./prisma";
import { sendNotificationEmails } from "./email/email-service";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import {
  getLatestMedicalCertificateExpiry,
  getMedicalCertificateAvailability,
} from "@/lib/medical-certificates";

/**
 * I promemoria sui certificati medici.
 *
 * **Perche un modulo e non la sola rotta.** La logica viveva dentro
 * `POST /api/medical-certificate-reminders`, che lavora su **un** atleta per
 * chiamata e richiede una sessione: era usabile solo da una schermata, quindi
 * di fatto non veniva mai usata. Il giro automatico ha bisogno delle stesse
 * regole su tutti gli atleti di tutti i club, e ADR-0007 chiede che la logica
 * di dominio stia sotto `src/lib/server/` e non dentro un route handler.
 *
 * Le regole che questo modulo tiene in un posto solo:
 *
 * 1. **Idempotenza.** La difesa contro il doppione non e uno stato sull'atleta
 *    ma una chiave deterministica dentro la notifica
 *    (`medical_certificate_reminder:<atleta>:<certificato|missing>`). Un giro
 *    rieseguito — a mano, o due volte per un riavvio — non crea niente.
 * 2. **La finestra di riguardo e di sette giorni.** Per il giro automatico
 *    conta **a prescindere dal fatto che il promemoria sia stato letto**: la
 *    rotta a mano cerca solo fra le notifiche non lette, e per un cron quel
 *    filtro significa rimandare ogni notte lo stesso promemoria a chi lo ha
 *    aperto. Chi lo riceve smette di leggerlo, e la volta che conta non lo
 *    vede nessuno.
 * 3. **Isolamento fra club.** Un tutore raggiunto dal promemoria di un club
 *    deve essere un utente **di quel club**: le anagrafiche portano una email,
 *    e la stessa email puo esistere in due societa diverse.
 */

export const REMINDER_TYPE = "medical_certificate_reminder";

/**
 * I giorni entro i quali lo stesso promemoria non si ripete.
 *
 * Sette e il passo con cui una famiglia puo davvero fare qualcosa: prendere un
 * appuntamento, ritirare un referto. Un promemoria al giorno per la stessa
 * scadenza non accorcia quel tempo, lo rende solo rumore.
 */
export const REMINDER_WINDOW_DAYS = 7;

/*
  L'identificativo di un account, nella forma con **cinque** gruppi.

  La rotta a mano ne portava una versione a **quattro** gruppi
  (`...-[89ab][0-9a-f]{12}$`, senza il penultimo) che non corrisponde a nessun
  UUID reale: il `POST` rispondeva «Atleta non valido» a **qualunque** atleta,
  quindi il pulsante «Sollecita» della segreteria non ha mai mandato niente.
  La forma giusta e questa, ed e esportata perche la rotta la riusi invece di
  tenerne una copia propria: due validatori dello stesso identificativo sono
  due occasioni di sbagliarne uno.
*/
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, any> =>
  isRecord(value) ? value : {};

const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

const normalizeEmail = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

/**
 * I tutori dichiarati in anagrafica, nelle due forme che convivono nei dati:
 * l'elenco `guardians` e la coppia storica `parent1`/`parent2`.
 */
export const getGuardianRows = (athlete: any) => {
  const data = asRecord(athlete?.data);
  const guardians = asArray(data.guardians).map((guardian) => {
    const record = asRecord(guardian);
    return {
      linkedUserId: firstText(
        record.linkedUserId,
        record.linked_user_id,
        record.userId,
        record.user_id,
      ),
      linkedUserEmail: firstText(
        record.linkedUserEmail,
        record.linked_user_email,
        record.email,
      ),
    };
  });

  const legacyParents = [data.parent1, data.parent2]
    .filter(Boolean)
    .map((guardian) => {
      const record = asRecord(guardian);
      return {
        linkedUserId: firstText(
          record.linkedUserId,
          record.linked_user_id,
          record.userId,
          record.user_id,
        ),
        linkedUserEmail: firstText(
          record.linkedUserEmail,
          record.linked_user_email,
          record.email,
        ),
      };
    });

  return guardians.length > 0 ? guardians : legacyParents;
};

/** La chiave con cui una notifica dice a quale promemoria corrisponde. */
export const buildReminderKey = (
  athleteId: string,
  certificateId?: string | null,
) => `${REMINDER_TYPE}:${athleteId}:${certificateId || "missing"}`;

/** La chiave letta da una notifica gia scritta, nelle due forme salvate. */
export const getReminderKey = (notification: { data?: any }) => {
  const data = asRecord(notification.data);
  return firstText(data.key, data.reminderKey);
};

/**
 * Il certificato a cui il promemoria si riferisce.
 *
 * Il primo, in ordine di scadenza crescente, che sia gia scaduto, in scadenza
 * entro trenta giorni, o privo di data: e quello che la famiglia deve
 * rinnovare. `null` significa «non ce n'e nessuno», e la chiave lo scrive come
 * `missing` invece di non esistere.
 */
export const pickRelevantCertificate = (
  athlete: any,
  certificateId?: string,
  referenceDate: Date = new Date(),
) => {
  const certificates = asArray(athlete?.medical_certificates);
  if (certificateId) {
    const exact = certificates.find(
      (certificate: any) => String(certificate?.id || "") === certificateId,
    );
    if (exact) return exact;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  return (
    certificates.find((certificate: any) => {
      const expiryDate = certificate?.expiry_date
        ? new Date(certificate.expiry_date)
        : null;
      return (
        !expiryDate ||
        Number.isNaN(expiryDate.getTime()) ||
        expiryDate <= thirtyDaysFromNow
      );
    }) || null
  );
};

/**
 * Lo stato del certificato **dell'atleta**, non di una singola riga.
 *
 * Si guarda la scadenza piu lontana fra quelle presenti: un atleta con un
 * certificato vecchio scaduto e uno nuovo valido e in regola, e ricevere un
 * promemoria gli direbbe il contrario.
 */
export const getAthleteCertificateAvailability = (
  athlete: any,
  referenceDate: Date = new Date(),
) => {
  const latestExpiry = getLatestMedicalCertificateExpiry(
    asArray(athlete?.medical_certificates),
  );

  return getMedicalCertificateAvailability(latestExpiry || null, referenceDate);
};

/** Titolo, messaggio e dati che finiscono dentro la notifica. */
export const buildReminderContent = (athlete: any, certificate: any) => {
  const athleteName =
    [athlete?.first_name, athlete?.last_name].filter(Boolean).join(" ").trim() ||
    "Atleta";
  const expiryDate = certificate?.expiry_date
    ? new Date(certificate.expiry_date).toISOString().slice(0, 10)
    : null;

  return {
    athleteName,
    expiryDate,
    title: "Certificato medico da aggiornare",
    message: expiryDate
      ? `${athleteName}: certificato ${certificate?.type || "medico"} da verificare entro il ${new Date(expiryDate).toLocaleDateString("it-IT")}.`
      : `${athleteName}: certificato medico mancante o da aggiornare.`,
  };
};

/**
 * Gli account che devono ricevere il promemoria per questo atleta.
 *
 * `organizationId` e opzionale, e la differenza fra le due porte:
 *
 *   - **presente** (giro automatico): un destinatario vale solo se e iscritto
 *     a quel club. Senza questo vincolo la stessa email presente in due
 *     societa porterebbe il promemoria di una nell'altra;
 *   - **assente** (rotta a mano): il comportamento e quello che la rotta ha
 *     sempre avuto, e non lo si cambia da qui.
 */
export const resolveGuardianRecipientIds = async (
  athlete: any,
  options: { organizationId?: string } = {},
) => {
  const guardianRows = getGuardianRows(athlete);
  const linkedIds = guardianRows
    .flatMap((guardian) => [guardian.linkedUserId])
    .filter((value) => UUID_PATTERN.test(value));
  const linkedEmails = Array.from(
    new Set(
      guardianRows
        .map((guardian) => normalizeEmail(guardian.linkedUserEmail))
        .filter(Boolean),
    ),
  );

  const usersByEmail =
    linkedEmails.length > 0
      ? await prisma.user.findMany({
          where: { email: { in: linkedEmails } },
          select: { id: true },
        })
      : [];

  const candidateIds = Array.from(
    new Set(
      linkedIds
        .concat(usersByEmail.map((user) => user.id))
        .filter((value) => UUID_PATTERN.test(value)),
    ),
  );

  const organizationId = String(options.organizationId || "").trim();
  if (!organizationId || candidateIds.length === 0) return candidateIds;

  const memberships = await prisma.organizationUser.findMany({
    where: { organization_id: organizationId, user_id: { in: candidateIds } },
    select: { user_id: true },
  });
  const membersOfClub = new Set(memberships.map((row) => row.user_id));

  return candidateIds.filter((userId) => membersOfClub.has(userId));
};

/**
 * Fra i destinatari, quelli che hanno gia ricevuto **questo** promemoria nella
 * finestra di riguardo.
 *
 * `onlyUnread` distingue le due porte: la rotta a mano guarda solo le notifiche
 * non lette — chi ha letto e non ha provveduto va risollecitato da una persona
 * — mentre il giro automatico guarda tutte, perche per un cron un promemoria
 * gia letto e un doppione e non un sollecito.
 */
export const findAlreadyNotifiedRecipients = async (params: {
  organizationId: string;
  userIds: string[];
  key: string;
  since: Date;
  onlyUnread: boolean;
}) => {
  if (params.userIds.length === 0) return new Set<string>();

  const existing = await prisma.notification.findMany({
    where: {
      organization_id: params.organizationId,
      user_id: { in: params.userIds },
      type: REMINDER_TYPE,
      ...(params.onlyUnread ? { read: false } : {}),
      created_at: { gte: params.since },
    },
    select: { user_id: true, data: true },
  });

  return new Set(
    existing
      .filter((notification) => getReminderKey(notification) === params.key)
      .map((notification) => notification.user_id)
      .filter(Boolean) as string[],
  );
};

/** L'istante da cui vale la finestra di riguardo. */
export const getReminderWindowStart = (now: Date) => {
  const since = new Date(now);
  since.setDate(since.getDate() - REMINDER_WINDOW_DAYS);
  return since;
};

/** Scrive le notifiche del promemoria per i destinatari indicati. */
export const createReminderNotifications = async (params: {
  organizationId: string;
  athlete: any;
  certificate: any;
  key: string;
  recipientIds: string[];
}) => {
  if (params.recipientIds.length === 0) return 0;

  const { athleteName, expiryDate, title, message } = buildReminderContent(
    params.athlete,
    params.certificate,
  );

  await prisma.notification.createMany({
    data: params.recipientIds.map((userId) => ({
      organization_id: params.organizationId,
      user_id: userId,
      title,
      message,
      type: REMINDER_TYPE,
      read: false,
      data: {
        key: params.key,
        reminderKey: params.key,
        source: "certificate_alerts",
        athleteId: params.athlete.id,
        athleteName,
        certificateId: params.certificate?.id || null,
        certificateType: params.certificate?.type || "Certificato Medico",
        expiryDate,
        actionHref: `/parent-view/${params.athlete.id}`,
      },
    })),
  });

  return params.recipientIds.length;
};

export type MedicalReminderResult = {
  organizationId: string;
  clubName?: string;
  created: number;
  skipped: number;
  recipients: number;
  athletes: number;
  ok: boolean;
  error?: string;
};

/**
 * Il giro su un club.
 *
 * `athletes` conta gli atleti che un promemoria lo meritano — certificato
 * mancante, scaduto o in scadenza — non quelli del club. `skipped` conta i
 * promemoria **non** mandati, per i due motivi che esistono: il destinatario
 * era gia stato avvisato nella finestra, oppure l'atleta non ha nessun account
 * di tutore raggiungibile. Il secondo caso non e un errore del giro: e un dato
 * mancante in anagrafica, e va visto nel rapporto invece di far fallire tutto.
 */
export const runMedicalCertificateRemindersForClub = async (
  organizationId: string,
  now = new Date(),
): Promise<MedicalReminderResult> => {
  const athletes = await prisma.athlete.findMany({
    where: { organization_id: organizationId },
    include: { medical_certificates: { orderBy: { expiry_date: "asc" } } },
  });

  const since = getReminderWindowStart(now);

  let candidates = 0;
  let created = 0;
  let skipped = 0;
  const recipientsReached = new Set<string>();
  const emailRecipients = new Set<string>();

  for (const athlete of athletes) {
    const availability = getAthleteCertificateAvailability(athlete, now);
    if (availability === "valid") continue;

    candidates += 1;

    const recipientIds = await resolveGuardianRecipientIds(athlete, {
      organizationId,
    });

    if (recipientIds.length === 0) {
      skipped += 1;
      continue;
    }

    recipientIds.forEach((userId) => recipientsReached.add(userId));

    const certificate = pickRelevantCertificate(athlete, undefined, now);
    const key = buildReminderKey(athlete.id, certificate?.id);

    const alreadyNotified = await findAlreadyNotifiedRecipients({
      organizationId,
      userIds: recipientIds,
      key,
      since,
      onlyUnread: false,
    });

    const toNotify = recipientIds.filter(
      (userId) => !alreadyNotified.has(userId),
    );

    skipped += alreadyNotified.size;

    if (toNotify.length === 0) continue;

    created += await createReminderNotifications({
      organizationId,
      athlete,
      certificate,
      key,
      recipientIds: toNotify,
    });

    toNotify.forEach((userId) => emailRecipients.add(userId));
  }

  /*
    Una sola email per destinatario per giro, non una per atleta: il messaggio
    di `sendNotificationEmails` dice «hai una nuova notifica», e mandarlo tre
    volte a chi ha tre figli non aggiunge niente.
  */
  await sendNotificationEmails(Array.from(emailRecipients));

  await recordAuditEvent({
    action: AUDIT_ACTIONS.medicalReminderRun,
    organizationId,
    resource: "medical_certificates",
    metadata: {
      athletes: candidates,
      created,
      skipped,
      recipients: recipientsReached.size,
      windowDays: REMINDER_WINDOW_DAYS,
    },
  });

  return {
    organizationId,
    created,
    skipped,
    recipients: recipientsReached.size,
    athletes: candidates,
    ok: true,
  };
};

/**
 * Il giro su tutti i club. E cio che invoca il cron.
 *
 * Un club che fallisce non ferma gli altri: il suo errore finisce nel
 * risultato, cosi chi legge il log sa **quale** club e rimasto senza
 * promemoria invece di sapere solo che qualcosa non ha funzionato.
 */
export const runMedicalCertificateRemindersForAllClubs = async (
  now = new Date(),
) => {
  const clubs = await prisma.club.findMany({ select: { id: true, name: true } });

  const results: MedicalReminderResult[] = [];

  for (const club of clubs) {
    try {
      const result = await runMedicalCertificateRemindersForClub(club.id, now);
      results.push({ ...result, clubName: club.name });
    } catch (error: any) {
      results.push({
        organizationId: club.id,
        clubName: club.name,
        created: 0,
        skipped: 0,
        recipients: 0,
        athletes: 0,
        ok: false,
        error: String(error?.message || error),
      });
    }
  }

  return {
    processedClubs: results.length,
    failed: results.filter((row) => row.ok === false).length,
    results,
  };
};
