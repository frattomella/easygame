import { prisma } from "./prisma";
import {
  readClubResourceCollection,
  replaceClubResourceCollections,
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

/** Senza annata **o con un'annata che il club non ha**: e della stagione piu vecchia per regola (revisione E5/A-L5). */
const countWithoutSeason = (collection: any[], knownSeasonIds: ReadonlySet<string>) =>
  collection.filter((record) => {
    const id = recordSeasonId(record);
    return !id || !knownSeasonIds.has(id);
  }).length;

const recordDate = (record: any) =>
  String(record?.date || record?.entryDate || record?.entry_date || record?.created_at || "").slice(0, 10);

/** «Nella finestra» inclusiva sulle date ISO (`YYYY-MM-DD`). */
const inWindow = (date: string, season: Pick<ClubSeason, "startDate" | "endDate">) =>
  Boolean(date) && date >= season.startDate && date <= season.endDate;

/**
 * Quante righe senza stagione la prima nota **mostra** sotto questa stagione
 * (revisione E1): la stessa regola di lettura di `accounting.ts` — la finestra
 * delle date, e solo se nessun'altra stagione la contiene.
 */
const conteggioPerFinestra = (
  collection: any[],
  season: ClubSeason,
  seasons: readonly ClubSeason[],
  knownSeasonIds: ReadonlySet<string>,
) =>
  collection.filter((record) => {
    const id = recordSeasonId(record);
    if (id && knownSeasonIds.has(id)) return false;
    const date = recordDate(record);
    if (!inWindow(date, season)) return false;
    return !seasons.some((other) => other.id !== season.id && inWindow(date, other));
  }).length;

/**
 * Tutti i record senza annata del club, per la guardia sulla stagione piu
 * vecchia e per quella sulla creazione di una stagione precedente (ADR-0197
 * §9, revisione A-H2): un record senza stagione cambia stagione ogni volta
 * che cambia la piu vecchia, e questo non deve succedere in silenzio.
 */
export const countRecordsWithoutSeason = async (options: {
  organizationId: string;
  knownSeasonIds: readonly string[];
}) => {
  const known = new Set(options.knownSeasonIds);
  let total = 0;
  for (const descriptor of [...CONFIG_COLLECTIONS, ...HISTORY_COLLECTIONS]) {
    if (!SEASON_SCOPED_DATA_TYPES.has(descriptor.key)) continue;
    const collection = await readClubResourceCollection(options.organizationId, descriptor.key);
    total += countWithoutSeason(collection, known);
  }
  const senzaStagione = { OR: [{ season_id: null }, { season_id: "" }, ...(known.size ? [{ season_id: { notIn: Array.from(known) } }] : [])] };
  total += await prisma.clubEvent.count({ where: { organization_id: options.organizationId, ...senzaStagione } });
  total += await prisma.accountingEntry.count({ where: { organization_id: options.organizationId, ...senzaStagione } });
  total += await prisma.documentRequest.count({ where: { organization_id: options.organizationId, ...senzaStagione } });
  total += await prisma.appointment.count({ where: { organization_id: options.organizationId, ...senzaStagione } });
  total += await prisma.formSubmission.count({ where: { organization_id: options.organizationId, ...senzaStagione } });
  total += await prisma.sportWorkRelationship.count({ where: { organization_id: options.organizationId, ...senzaStagione } });
  total += await prisma.generatedDocument.count({ where: { organization_id: options.organizationId, ...senzaStagione } });
  return total;
};

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
  const knownSeasonIds = new Set(state.seasons.map((entry) => entry.id));

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
    /* Anche le righe senza stagione che la prima nota mostra qui per finestra (revisione E1). */
    const perFinestra =
      descriptor.key === "transactions" || descriptor.key === "transfers"
        ? conteggioPerFinestra(collection, season, state.seasons, knownSeasonIds)
        : 0;
    entries.push({
      key: descriptor.key,
      label: descriptor.label,
      count: countBySeason(collection, season.id) + perFinestra,
      classification: "block",
    });
  }

  /* Le tabelle con `season_id`: storia, sempre. */
  const eventi = await prisma.clubEvent.count({
    where: { organization_id: organizationId, season_id: season.id },
  });
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

  /*
    I movimenti si contano con la regola con cui la prima nota li **mostra**
    (revisione E1): la stagione della riga, oppure — per una riga senza
    stagione — la finestra delle date, quando nessun'altra stagione la
    contiene. Contare solo `season_id` diceva «0 movimenti» a una stagione
    sotto cui il registro ne elencava, e dopo l'eliminazione quelle righe non
    sarebbero comparse piu sotto nessuna.
  */
  const finestra = { gte: new Date(`${season.startDate}T00:00:00.000Z`), lte: new Date(`${season.endDate}T23:59:59.999Z`) };
  const altreFinestre = state.seasons
    .filter((other) => other.id !== season.id)
    .map((other) => ({ gte: new Date(`${other.startDate}T00:00:00.000Z`), lte: new Date(`${other.endDate}T23:59:59.999Z`) }));
  const movimenti = await prisma.accountingEntry.count({
    where: {
      organization_id: organizationId,
      OR: [
        { season_id: season.id },
        {
          AND: [
            { OR: [{ season_id: null }, { season_id: "" }, ...(knownSeasonIds.size ? [{ season_id: { notIn: Array.from(knownSeasonIds) } }] : [])] },
            { entry_date: finestra },
            ...altreFinestre.map((other) => ({ NOT: { entry_date: other } })),
          ],
        },
      ],
    },
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

  const recordsWithoutSeason = isLegacy
    ? await countRecordsWithoutSeason({ organizationId, knownSeasonIds: Array.from(knownSeasonIds) })
    : 0;
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
    /*
      Si toglie **il riferimento com'era in archivio** (revisione E4/D-L2): un
      nome che risolveva sulla categoria della stagione, un id, un gruppo in
      `groupIds` o `group_ids`. Cio che si conta e cio che si toglie davvero.
    */
    const dropRefs = new Set(current.rawCategoryRefs);
    const dropGroups = new Set(current.rawGroupRefs);
    if (!dropRefs.size && !dropGroups.size) return trainer;
    const categories = (Array.isArray(trainer?.categories) ? trainer.categories : []).filter(
      (entry: any) => !dropRefs.has(entry),
    );
    const groupIds = (Array.isArray(trainer?.groupIds) ? trainer.groupIds : []).filter(
      (id: any) => !dropGroups.has(String(id || "").trim()),
    );
    const groupIdsSnake = (Array.isArray(trainer?.group_ids) ? trainer.group_ids : []).filter(
      (id: any) => !dropGroups.has(String(id || "").trim()),
    );
    const tolte =
      ((Array.isArray(trainer?.categories) ? trainer.categories.length : 0) - categories.length) +
      ((Array.isArray(trainer?.groupIds) ? trainer.groupIds.length : 0) - groupIds.length) +
      ((Array.isArray(trainer?.group_ids) ? trainer.group_ids.length : 0) - groupIdsSnake.length);
    if (!tolte) return trainer;
    detached += tolte;
    trainersChanged = true;
    return {
      ...trainer,
      categories,
      ...(Array.isArray(trainer?.groupIds) ? { groupIds } : {}),
      ...(Array.isArray(trainer?.group_ids) ? { group_ids: groupIdsSnake } : {}),
    };
  });

  /*
    **Una transazione per le collezioni** (revisione E3): categorie, gruppi,
    piani, sconti, programma e allenatori si riscrivono insieme o non si
    riscrivono. La stagione si toglie dalle impostazioni subito dopo; se
    quella scrittura fallisce la stagione resta, vuota, e si puo rieliminare.
  */
  const removed: Record<string, number> = {};
  const daScrivere: Array<{ resource_type: string; items: any[] }> = [];
  for (const descriptor of CONFIG_COLLECTIONS) {
    const collection = await readClubResourceCollection(organizationId, descriptor.key);
    const next = collection.filter((record: any) => recordSeasonId(record) !== season.id);
    removed[descriptor.key] = collection.length - next.length;
    if (removed[descriptor.key] > 0) {
      daScrivere.push({ resource_type: descriptor.key, items: next });
    }
  }
  if (trainersChanged) {
    daScrivere.push({ resource_type: "trainers", items: nextTrainers });
  }
  if (daScrivere.length) {
    await replaceClubResourceCollections(organizationId, daScrivere);
  }

  await removeClubSeason(organizationId, season.id);

  return { season, impact, removed, detachedTrainerAssignments: detached };
};
