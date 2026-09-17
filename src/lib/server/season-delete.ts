import { prisma } from "./prisma";
import {
  readClubResourceCollection,
  replaceClubResourceCollection,
} from "./resources";
import { readClubSeasonState, removeClubSeason } from "./seasons";
import {
  SEASON_SCOPED_DATA_TYPES,
  type ClubSeason,
} from "@/lib/club-seasons";
import { splitTrainerAssignmentsBySeason } from "@/lib/trainers/season-assignments";

/**
 * **Eliminare una stagione** (ADR-0197 §30–§36).
 *
 * Non e un `DELETE FROM seasons`: una stagione vive in `clubs.settings` e
 * cio che le appartiene sta in dieci posti diversi, con tre nature diverse:
 *
 * - **configurazione** (categorie, gruppi operativi, sconti, piani, gruppi
 *   numerazione, programma settimanale, budget previsto): e cio che si
 *   riscriverebbe identico ogni luglio. Si cancella con la stagione,
 *   **purche** nessun dato operativo la nomini;
 * - **storia** (eventi e presenze, movimenti e incassi, appartenenze,
 *   pratiche, appuntamenti, rapporti di lavoro sportivo, documenti
 *   generati): non si distrugge. Una stagione che ne ha si **blocca** —
 *   «archivia» e l'operazione giusta, e la stagione ce l'ha gia;
 * - **riferimenti** (le assegnazioni degli allenatori alle categorie della
 *   stagione): si staccano, e la scheda dell'allenatore resta.
 *
 * L'audit (`audit_logs`) non si tocca mai: e la traccia di cio che e stato,
 * compresa questa eliminazione.
 *
 * Due difese in piu: la stagione **attiva** non si elimina (prima se ne
 * attiva un'altra: nessuna scelta silenziosa), e la stagione **piu vecchia**
 * non si elimina finche esistono record senza annata, perche quei record le
 * appartengono per regola (WP-32) e cancellarla li sposterebbe in silenzio
 * sulla stagione dopo.
 */

export type SeasonDeleteImpactEntry = {
  key: string;
  label: string;
  count: number;
  classification: "cascade" | "block" | "detach";
};

export type SeasonDeleteImpact = {
  season: ClubSeason;
  entries: SeasonDeleteImpactEntry[];
  /** Cio che blocca: storia, o record senza annata sulla stagione piu vecchia. */
  blockers: SeasonDeleteImpactEntry[];
  canDelete: boolean;
  isActive: boolean;
  isLegacy: boolean;
  /** Il testo che l'utente deve scrivere per confermare. */
  confirmationText: string;
};

const CONFIG_COLLECTIONS: Array<{ key: string; label: string }> = [
  { key: "categories", label: "Categorie" },
  { key: "category_groups", label: "Gruppi operativi" },
  { key: "discounts", label: "Sconti" },
  { key: "payment_plans", label: "Piani di pagamento" },
  { key: "jersey_groups", label: "Gruppi numerazione" },
  { key: "weekly_schedule", label: "Voci del programma settimanale" },
  { key: "expected_income", label: "Entrate previste" },
  { key: "expected_expenses", label: "Uscite previste" },
];

/** Collezioni JSON di stagione che sono **storia**, non configurazione. */
const HISTORY_COLLECTIONS: Array<{ key: string; label: string }> = [
  { key: "transactions", label: "Movimenti storici (colonna)" },
  { key: "transfers", label: "Trasferimenti" },
  { key: "sponsor_payments", label: "Pagamenti sponsor" },
  { key: "procure", label: "Procure" },
  { key: "secretariat_notes", label: "Note di segreteria" },
  { key: "jersey_assignments", label: "Numeri di maglia assegnati" },
  { key: "kit_assignments", label: "Kit consegnati" },
];

const recordSeasonId = (record: any) =>
  String(record?.seasonId || record?.season_id || "").trim();

const countBySeason = (collection: any[], seasonId: string) =>
  collection.filter((record) => recordSeasonId(record) === seasonId).length;

const countWithoutSeason = (collection: any[]) =>
  collection.filter((record) => !recordSeasonId(record)).length;

export const confirmationTextFor = (season: Pick<ClubSeason, "label">) =>
  `ELIMINA ${season.label}`;

/**
 * Enumera cio che la stagione ha, con la sua classificazione. E cio che la
 * finestra di conferma mostra prima di chiedere di scrivere il nome.
 */
export const summarizeSeasonDeleteImpact = async (options: {
  organizationId: string;
  seasonId: string;
}): Promise<SeasonDeleteImpact> => {
  const { organizationId } = options;
  const state = await readClubSeasonState(organizationId);
  const seasonId = String(options.seasonId || "").trim();
  const season = state.seasons.find((entry) => entry.id === seasonId);
  if (!season || state.isFallback) {
    throw new Error("Stagione non trovata");
  }

  const entries: SeasonDeleteImpactEntry[] = [];
  const isLegacy = state.legacySeasonId === season.id;
  let recordsWithoutSeason = 0;

  const categoryCollection = await readClubResourceCollection(organizationId, "categories");
  const categoryIds = new Set(
    categoryCollection
      .filter((record: any) => recordSeasonId(record) === season.id)
      .map((record: any) => String(record?.id || "").trim())
      .filter(Boolean),
  );

  for (const descriptor of CONFIG_COLLECTIONS) {
    const collection =
      descriptor.key === "categories"
        ? categoryCollection
        : await readClubResourceCollection(organizationId, descriptor.key);
    recordsWithoutSeason += countWithoutSeason(collection);
    entries.push({
      key: descriptor.key,
      label: descriptor.label,
      count: countBySeason(collection, season.id),
      classification: "cascade",
    });
  }

  for (const descriptor of HISTORY_COLLECTIONS) {
    if (!SEASON_SCOPED_DATA_TYPES.has(descriptor.key)) continue;
    const collection = await readClubResourceCollection(organizationId, descriptor.key);
    recordsWithoutSeason += countWithoutSeason(collection);
    entries.push({
      key: descriptor.key,
      label: descriptor.label,
      count: countBySeason(collection, season.id),
      classification: "block",
    });
  }

  /* Le tabelle con `season_id`: storia, sempre. */
  const eventi = await prisma.clubEvent.count({
    where: { organization_id: organizationId, season_id: season.id },
  });
  const eventiSenzaStagione = await prisma.clubEvent.count({
    where: { organization_id: organizationId, OR: [{ season_id: null }, { season_id: "" }] },
  });
  recordsWithoutSeason += eventiSenzaStagione;
  entries.push({ key: "events", label: "Allenamenti e gare", count: eventi, classification: "block" });

  const presenze = eventi
    ? await prisma.clubEventParticipant.count({
        where: {
          organization_id: organizationId,
          event_id: {
            in: (
              await prisma.clubEvent.findMany({
                where: { organization_id: organizationId, season_id: season.id },
                select: { id: true },
              })
            ).map((row) => row.id),
          },
        },
      })
    : 0;
  entries.push({ key: "participants", label: "Presenze e convocazioni", count: presenze, classification: "block" });

  const appartenenze = categoryIds.size
    ? await prisma.athleteCategoryMembership.count({
        where: { organization_id: organizationId, category_id: { in: Array.from(categoryIds) } },
      })
    : 0;
  entries.push({ key: "memberships", label: "Tesserati nelle squadre", count: appartenenze, classification: "block" });

  const movimenti = await prisma.accountingEntry.count({
    where: { organization_id: organizationId, season_id: season.id },
  });
  entries.push({ key: "accounting_entries", label: "Movimenti contabili", count: movimenti, classification: "block" });

  const conteggi: Array<[string, string, Promise<number>]> = [
    ["document_requests", "Richieste documentali", prisma.documentRequest.count({ where: { organization_id: organizationId, season_id: season.id } })],
    ["generated_documents", "Documenti generati", prisma.generatedDocument.count({ where: { organization_id: organizationId, season_id: season.id } })],
    ["form_submissions", "Pratiche di iscrizione", prisma.formSubmission.count({ where: { organization_id: organizationId, season_id: season.id } })],
    ["appointments", "Appuntamenti", prisma.appointment.count({ where: { organization_id: organizationId, season_id: season.id } })],
    ["sport_work_relationships", "Rapporti di lavoro sportivo", prisma.sportWorkRelationship.count({ where: { organization_id: organizationId, season_id: season.id } })],
  ];
  for (const [key, label, promise] of conteggi) {
    entries.push({ key, label, count: await promise, classification: "block" });
  }

  /* Rate e incassi legati ai piani della stagione: storia economica. */
  const planIds = new Set(
    (await readClubResourceCollection(organizationId, "payment_plans"))
      .filter((record: any) => recordSeasonId(record) === season.id)
      .map((record: any) => String(record?.id || "").trim())
      .filter(Boolean),
  );
  const rate = planIds.size
    ? (
        await prisma.athletePayment.findMany({
          where: { organization_id: organizationId },
          select: { data: true },
        })
      ).filter((row) => {
        const data = (row?.data && typeof row.data === "object" ? row.data : {}) as Record<string, any>;
        const plan = String(data.paymentPlanId || data.payment_plan_id || data.planId || data.plan_id || "").trim();
        return plan && planIds.has(plan);
      }).length
    : 0;
  entries.push({ key: "payments", label: "Rate sui piani della stagione", count: rate, classification: "block" });

  /* Le assegnazioni degli allenatori: riferimenti, si staccano. */
  const trainers = await readClubResourceCollection(organizationId, "trainers");
  const groupCollection = await readClubResourceCollection(organizationId, "category_groups");
  const assegnazioni = trainers.reduce((total: number, trainer: any) => {
    const current = splitTrainerAssignmentsBySeason({
      trainer,
      categories: categoryCollection as Array<{ id: string; name?: string | null; seasonId?: string | null }>,
      groups: groupCollection.map((group: any) => ({
        id: String(group?.id || ""),
        categoryId: String(group?.categoryId || group?.category_id || ""),
        seasonId: group?.seasonId ?? null,
      })),
      seasons: state.seasons,
      seasonId: season.id,
      legacySeasonId: state.legacySeasonId,
    }).current;
    return total + current.categoryIds.length + current.groupIds.length;
  }, 0);
  entries.push({ key: "trainer_assignments", label: "Assegnazioni allenatori", count: assegnazioni, classification: "detach" });

  if (isLegacy && recordsWithoutSeason > 0) {
    entries.push({
      key: "legacy_records",
      label: "Record senza annata attribuiti a questa stagione (la piu vecchia)",
      count: recordsWithoutSeason,
      classification: "block",
    });
  }

  const blockers = entries.filter((entry) => entry.classification === "block" && entry.count > 0);
  const isActive = season.id === state.activeSeasonId;

  return {
    season,
    entries,
    blockers,
    canDelete: !isActive && blockers.length === 0,
    isActive,
    isLegacy,
    confirmationText: confirmationTextFor(season),
  };
};

export type DeleteClubSeasonResult = {
  season: ClubSeason;
  impact: SeasonDeleteImpact;
  removed: Record<string, number>;
  detachedTrainerAssignments: number;
};

/**
 * Elimina una stagione **vuota**: configurazione cancellata, riferimenti
 * staccati, stagione tolta dalle impostazioni. Ogni difesa e rifatta qui,
 * non solo nella finestra: il testo di conferma, la stagione attiva, la
 * storia.
 */
export const deleteClubSeason = async (options: {
  organizationId: string;
  seasonId: string;
  confirmation: unknown;
}): Promise<DeleteClubSeasonResult> => {
  const { organizationId } = options;
  const impact = await summarizeSeasonDeleteImpact({
    organizationId,
    seasonId: options.seasonId,
  });
  const { season } = impact;

  if (impact.isActive) {
    throw new Error(
      "Prima di eliminare questa stagione, imposta un'altra stagione come attiva",
    );
  }
  if (impact.blockers.length) {
    const elenco = impact.blockers
      .map((entry) => `${entry.count} ${entry.label.toLowerCase()}`)
      .join(", ");
    throw new Error(
      `La stagione ${season.label} contiene dati storici che non si cancellano (${elenco}): archiviala invece di eliminarla`,
    );
  }
  if (String(options.confirmation || "").trim() !== impact.confirmationText) {
    throw new Error(
      `Per confermare scrivi esattamente: ${impact.confirmationText}`,
    );
  }

  /*
    Le assegnazioni alle categorie e ai gruppi della stagione si calcolano
    **prima** di cancellare le collezioni: dopo, quei riferimenti non
    risolvono piu su niente e nessuno saprebbe piu di quale stagione erano.
  */
  const state = await readClubSeasonState(organizationId);
  const categoryCollection = await readClubResourceCollection(organizationId, "categories");
  const groupCollection = await readClubResourceCollection(organizationId, "category_groups");
  const trainers = await readClubResourceCollection(organizationId, "trainers");
  let detached = 0;
  let trainersChanged = false;
  const nextTrainers = trainers.map((trainer: any) => {
    const current = splitTrainerAssignmentsBySeason({
      trainer,
      categories: categoryCollection as Array<{ id: string; name?: string | null; seasonId?: string | null }>,
      groups: groupCollection.map((group: any) => ({
        id: String(group?.id || ""),
        categoryId: String(group?.categoryId || group?.category_id || ""),
        seasonId: group?.seasonId ?? null,
      })),
      seasons: state.seasons,
      seasonId: season.id,
      legacySeasonId: state.legacySeasonId,
    }).current;
    const toDrop = new Set([...current.categoryIds, ...current.groupIds]);
    if (!toDrop.size) return trainer;
    detached += toDrop.size;
    trainersChanged = true;
    const categories = (Array.isArray(trainer?.categories) ? trainer.categories : []).filter(
      (entry: any) => !toDrop.has(String(typeof entry === "string" ? entry : entry?.id || "").trim()),
    );
    const groupIds = (Array.isArray(trainer?.groupIds) ? trainer.groupIds : []).filter(
      (id: any) => !toDrop.has(String(id || "").trim()),
    );
    return { ...trainer, categories, ...(Array.isArray(trainer?.groupIds) ? { groupIds } : {}) };
  });

  const removed: Record<string, number> = {};
  for (const descriptor of CONFIG_COLLECTIONS) {
    const collection = await readClubResourceCollection(organizationId, descriptor.key);
    const next = collection.filter((record: any) => recordSeasonId(record) !== season.id);
    removed[descriptor.key] = collection.length - next.length;
    if (removed[descriptor.key] > 0) {
      await replaceClubResourceCollection(organizationId, descriptor.key, next);
    }
  }

  if (trainersChanged) {
    await replaceClubResourceCollection(organizationId, "trainers", nextTrainers);
  }

  await removeClubSeason(organizationId, season.id);

  return { season, impact, removed, detachedTrainerAssignments: detached };
};
