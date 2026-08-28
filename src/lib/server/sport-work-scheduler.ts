import { prisma } from "./prisma";
import {
  audit,
  refreshExpiredRelationships,
  recomputeInstallmentAccruals,
  type SportWorkScope,
} from "./sport-work";
import { syncObligations } from "./sport-work-agenda";
import { SPORT_WORK_AUDIT_ACTIONS } from "@/lib/sport-work/audit-actions";
import { startOfDay, toDateOrNull } from "@/lib/sport-work/model";

/**
 * Il **giro notturno** del lavoro sportivo.
 *
 * Quattro cose, in quest'ordine, perche ognuna dipende dalla precedente:
 *
 * 1. i contratti la cui data di fine e passata diventano scaduti;
 * 2. il maturato delle scadenze si ricalcola dalle date;
 * 3. l'agenda degli adempimenti si riallinea a rapporti ed erogazioni;
 * 4. cio che scade presto — o e gia scaduto — produce una notifica.
 *
 * **L'intero giro e idempotente**, e non e un dettaglio di eleganza. Un job
 * che gira ogni notte e non lo fosse produrrebbe, dopo una settimana, sette
 * promemoria identici per la stessa scadenza: chi li riceve smette di
 * leggerli, e la volta che il promemoria conta davvero non lo vede nessuno.
 *
 * La difesa contro il doppione **non e uno stato sul lavoro**: e una chiave
 * deterministica scritta nella notifica stessa (`data.sportWorkKey`). Cosi
 * regge anche se il job viene rieseguito a mano, se Vercel lo invoca due
 * volte, o se qualcuno lo lancia dalla schermata mentre il cron sta girando.
 */

/** Giorni di preavviso su una scadenza compenso. */
export const PAYOUT_NOTICE_DAYS = 7;

/** Giorni di preavviso su un adempimento. */
export const OBLIGATION_NOTICE_DAYS = 14;

const notificationClient = () => (prisma as any).notification;
const installmentClient = () => (prisma as any).sportWorkInstallment;
const relationshipClient = () => (prisma as any).sportWorkRelationship;
const obligationClient = () => (prisma as any).sportWorkObligation;

/**
 * Crea una notifica **una volta sola**, per sempre.
 *
 * La chiave viaggia dentro `data`, non in una colonna nuova: il modello delle
 * notifiche e condiviso con mezzo prodotto, e aggiungergli una colonna per un
 * dominio solo sarebbe la prima di sette.
 */
const notifyOnce = async (
  organizationId: string,
  key: string,
  notification: { title: string; message: string; type: string },
) => {
  const existing = await notificationClient().findFirst({
    where: {
      organization_id: organizationId,
      data: { path: ["sportWorkKey"], equals: key },
    },
  });

  if (existing) return false;

  await notificationClient().create({
    data: {
      organization_id: organizationId,
      user_id: null,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      read: false,
      data: { sportWorkKey: key, domain: "sport_work" },
    },
  });

  return true;
};

const daysBetween = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);

const euro = (value: unknown) =>
  `${(Number(value) || 0).toFixed(2).replace(".", ",")} euro`;

export type SchedulerResult = {
  organizationId: string;
  expiredRelationships: number;
  accrualsUpdated: number;
  obligations: { created: number; updated: number; closed: number; total: number };
  notifications: number;
  notified: string[];
};

/**
 * Esegue il giro per un club.
 *
 * `scope` puo mancare: quando gira da cron non c'e un attore, e le funzioni di
 * dominio accettano l'assenza di scope come «nessun confine da verificare»
 * — che e corretto solo qui, dove il club lo sceglie il job e non una
 * richiesta HTTP.
 */
export const runSportWorkSchedulerForClub = async (
  organizationId: string,
  options: { now?: Date; scope?: SportWorkScope } = {},
): Promise<SchedulerResult> => {
  const now = options.now ?? new Date();
  const today = startOfDay(now);
  const scope = options.scope;

  const expiredRelationships = await refreshExpiredRelationships(
    organizationId,
    now,
  );

  const relationships = await relationshipClient().findMany({
    where: { organization_id: organizationId },
  });

  let accrualsUpdated = 0;
  for (const relationship of relationships) {
    accrualsUpdated += await recomputeInstallmentAccruals(
      relationship.id,
      scope,
      now,
    );
  }

  const obligations = await syncObligations(organizationId, scope, now);

  const notified: string[] = [];

  /* --------------------------------------- compensi in scadenza e scaduti */

  const installments = await installmentClient().findMany({
    where: {
      organization_id: organizationId,
      status: { in: ["ACCRUED", "SCHEDULED", "OVERDUE", "PARTIALLY_PAID"] },
    },
  });

  for (const installment of installments) {
    if (installment.cancelled) continue;
    const remaining = Number(installment.remaining_amount) || 0;
    if (remaining <= 0) continue;

    const due = toDateOrNull(installment.due_date);
    if (!due) continue;

    const delta = daysBetween(today, due);

    if (delta < 0) {
      const created = await notifyOnce(
        organizationId,
        `installment-overdue:${installment.id}`,
        {
          title: "Compenso scaduto",
          message: `${installment.label}: ${euro(remaining)} da erogare, scaduta il ${due.toISOString().slice(0, 10)}.`,
          type: "sport_work_payout_overdue",
        },
      );
      if (created) notified.push(`installment-overdue:${installment.id}`);
      continue;
    }

    if (delta <= PAYOUT_NOTICE_DAYS) {
      const created = await notifyOnce(
        organizationId,
        `installment-due:${installment.id}`,
        {
          title: "Compenso in scadenza",
          message: `${installment.label}: ${euro(remaining)} in scadenza il ${due.toISOString().slice(0, 10)}.`,
          type: "sport_work_payout_due",
        },
      );
      if (created) notified.push(`installment-due:${installment.id}`);
    }
  }

  /* ------------------------------------------------- adempimenti vicini */

  const dueObligations = await obligationClient().findMany({
    where: { organization_id: organizationId, status: "DUE" },
  });

  for (const obligation of dueObligations) {
    const due = toDateOrNull(obligation.due_date);
    if (!due) continue;

    const delta = daysBetween(today, due);
    if (delta > OBLIGATION_NOTICE_DAYS) continue;

    const created = await notifyOnce(
      organizationId,
      `obligation:${obligation.id}`,
      {
        title: delta < 0 ? `${obligation.title} - scaduto` : obligation.title,
        message: `${obligation.description || obligation.title} Scadenza: ${due
          .toISOString()
          .slice(0, 10)}.`,
        type: `sport_work_obligation_${String(obligation.kind).toLowerCase()}`,
      },
    );

    if (created) {
      notified.push(`obligation:${obligation.id}`);
      await obligationClient().update({
        where: { id: obligation.id },
        data: { notified_at: now },
      });
    }
  }

  const result: SchedulerResult = {
    organizationId,
    expiredRelationships,
    accrualsUpdated,
    obligations,
    notifications: notified.length,
    notified,
  };

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.schedulerRun,
    organizationId,
    "sport_work",
    null,
    {
      expiredRelationships,
      accrualsUpdated,
      obligationsCreated: obligations.created,
      obligationsClosed: obligations.closed,
      notifications: notified.length,
    },
  );

  return result;
};

/**
 * Il giro su tutti i club. E cio che invoca il cron.
 *
 * Un club che fallisce non ferma gli altri: il suo errore finisce nel
 * risultato, cosi chi legge il log sa **quale** club e rimasto indietro
 * invece di sapere solo che qualcosa non ha funzionato.
 */
export const runSportWorkSchedulerForAllClubs = async (now = new Date()) => {
  const clubs = await prisma.club.findMany({ select: { id: true, name: true } });

  const results: Array<
    | (SchedulerResult & { clubName: string; ok: true })
    | { organizationId: string; clubName: string; ok: false; error: string }
  > = [];

  for (const club of clubs) {
    try {
      const result = await runSportWorkSchedulerForClub(club.id, { now });
      results.push({ ...result, clubName: club.name, ok: true });
    } catch (error: any) {
      results.push({
        organizationId: club.id,
        clubName: club.name,
        ok: false,
        error: String(error?.message || error),
      });
    }
  }

  return results;
};
