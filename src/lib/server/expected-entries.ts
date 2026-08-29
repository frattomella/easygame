import { prisma } from "./prisma";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import {
  appendClubResourceItem,
  readClubResourceCollection,
  removeClubResourceItem,
} from "./resources";
import { readClubSeasonState } from "./seasons";
import { filterCollectionBySeason } from "@/lib/club-seasons";
import { assertAccountingPermission } from "@/lib/accounting/permissions";

/**
 * Le **previsioni**: entrate e uscite che il club si aspetta e che non sono
 * ancora accadute (W4-B1).
 *
 * ---
 *
 * ## Cosa una previsione non e
 *
 * **Non e cassa.** E il difetto D-2, gia chiuso altrove e ribadito qui: una
 * previsione non produce mai un importo incassato, nemmeno quando qualcuno la
 * segna «pagata». Il modulo che aggregava le sorgenti lo dichiara con
 * `cashEvidence: "none"`, e questo servizio non consegna nessun totale di cassa:
 * i suoi due totali si chiamano «previsto», e la superficie li tiene fuori dalla
 * fascia finanziaria.
 *
 * **Non e prima nota.** `accounting_entries` ospita solo fatti finanziari
 * avvenuti: una previsione li e per definizione non e, e portarcela dentro
 * rimetterebbe crediti e cassa nella stessa lista — cioe il difetto che la
 * Wave 4 ha appena finito di togliere da `/movements`. Le previsioni restano
 * dove sono sempre state: due collezioni di club, `expected_income` e
 * `expected_expenses`.
 *
 * ## Il difetto che questo modulo chiude
 *
 * Si scrivevano **dal browser** con `addClubData` / `deleteClubDataItem`: una
 * lettura della colonna JSON intera, un `append` (o una rimozione) in memoria e
 * il risalvataggio dell'intero array. Due segreterie nello stesso minuto e la
 * seconda scrittura cancellava la prima — senza errori e senza traccia. E lo
 * stesso difetto che il libro soci ha chiuso per l'anagrafica.
 *
 * Qui la scrittura e del server e passa da `appendClubResourceItem` /
 * `removeClubResourceItem`: **una riga** in `club_resource_items`, l'aggregato
 * ricalcolato dalla tabella, tutto sotto un `FOR UPDATE` sul club.
 *
 * ## Permessi e confine di club
 *
 * Il perimetro e quello della contabilita, dalla matrice condivisa
 * `src/lib/accounting/permissions.ts`: leggere e `accounting.read`, scrivere e
 * `accounting.manage` — registrare una previsione e lavoro di segreteria, come
 * registrare un movimento. Nessun `if` sul ruolo scritto qui.
 *
 * Ogni funzione riceve uno scope e lo applica: il messaggio di un diniego
 * contiene «Accesso negato», perche il route handler lo mappi su 403.
 */

export type ExpectedDirection = "income" | "expense";

/**
 * Il verso e il nome della collezione. **Due**, chiusi: un verso che non e
 * nessuno dei due non deve poter scegliere una collezione a caso.
 */
const RESOURCE_TYPE_BY_DIRECTION: Record<ExpectedDirection, string> = {
  income: "expected_income",
  expense: "expected_expenses",
};

export const EXPECTED_DIRECTIONS: readonly ExpectedDirection[] = [
  "income",
  "expense",
];

export type ExpectedEntryScope = {
  userId: string;
  activeOrganizationId: string | null;
  activeRole?: string | null;
  allowedOrganizationIds: string[];
};

export type ExpectedEntryView = {
  id: string;
  direction: ExpectedDirection;
  /** La data in cui il club si aspetta il movimento, non quella di cassa. */
  date: string | null;
  description: string;
  category: string | null;
  reference: string | null;
  /**
   * In centesimi, come ogni importo delle superfici contabili. La colonna
   * conserva gli euro perche ci sono gia dentro dati storici scritti cosi: la
   * conversione la fa qui il proprietario, una volta sola.
   */
  amountCents: number;
  seasonId: string | null;
  createdAt: string | null;
};

export type ExpectedEntriesResult = {
  entries: ExpectedEntryView[];
  /**
   * I totali del **previsto**. Il nome del campo lo dice: nessuno di questi
   * numeri e un saldo, e nessuno va accanto a un saldo.
   */
  totals: {
    expectedIncomeCents: number;
    expectedExpenseCents: number;
    expectedNetCents: number;
  };
  /** Viaggia con le righe: la superficie non ricalcola il permesso (W3-14). */
  canManage: boolean;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Da euro a centesimi, senza il riporto del virgola mobile.
 *
 * `12,35 * 100` in JavaScript vale `1234.9999999999998`: troncare darebbe un
 * centesimo in meno a ogni previsione, e un totale che nessuno sa spiegare.
 */
const toCents = (value: unknown): number => {
  const numero = typeof value === "number" ? value : Number(asText(value).replace(",", "."));
  if (!Number.isFinite(numero)) return 0;
  return Math.round(numero * 100);
};

const toIso = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return asText(value) || null;
};

/* ------------------------------------------------------------------ scope */

const ensureOrganizationAccess = (
  scope: ExpectedEntryScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) throw denied("previsioni senza club");
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("la previsione appartiene a un altro club");
  }
};

const resolveOrganizationId = (
  scope: ExpectedEntryScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per le previsioni");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

const resolveDirection = (value: unknown): ExpectedDirection => {
  const wanted = asText(value).toLowerCase();
  /*
    `expenses` al plurale arriva da chi ha in mano il nome della collezione
    invece del verso: accettarlo evita che la stessa cosa abbia due nomi a
    seconda di chi chiama.
  */
  if (wanted === "income") return "income";
  if (wanted === "expense" || wanted === "expenses") return "expense";
  throw new Error(
    "Il verso di una previsione e «income» o «expense»: non ce ne sono altri",
  );
};

/* --------------------------------------------------------------- stagione */

/**
 * La stagione con cui filtrare e marcare, oppure `null`.
 *
 * Riproduce le due regole gia scritte in `resources.ts`, e per le stesse
 * ragioni: una stagione che il club non ha salvato non filtra niente, e la
 * stagione **sintetizzata** per un club che non ne ha ancora non marca niente —
 * sparirebbe nel momento in cui il club ne crea una vera, e i record marcati non
 * apparterrebbero piu a nulla.
 */
const resolveSeason = async (
  organizationId: string,
  requestedSeasonId: string | null | undefined,
) => {
  const requested = asText(requestedSeasonId);
  if (!requested) return null;

  const state = await readClubSeasonState(organizationId).catch(() => null);
  if (!state || state.isFallback) return null;
  if (!state.seasons.some((season) => season.id === requested)) return null;

  return {
    activeSeasonId: requested,
    legacySeasonId: state.legacySeasonId,
    knownSeasonIds: state.seasons.map((season) => season.id),
  };
};

/* ---------------------------------------------------------------- lettura */

const toView = (
  direction: ExpectedDirection,
  item: Record<string, any>,
): ExpectedEntryView => ({
  id: asText(item?.id),
  direction,
  date: asText(item?.date) || asText(item?.dueDate) || null,
  description:
    asText(item?.description) ||
    asText(item?.title) ||
    asText(item?.name) ||
    (direction === "income" ? "Entrata prevista" : "Uscita prevista"),
  category: asText(item?.category) || null,
  reference: asText(item?.reference) || null,
  amountCents: toCents(item?.amount),
  seasonId: asText(item?.seasonId) || null,
  createdAt: toIso(item?.created_at ?? item?.createdAt),
});

const hasManagePermission = (scope: ExpectedEntryScope | undefined) => {
  try {
    assertAccountingPermission(scope?.activeRole, "accounting.manage");
    return true;
  } catch {
    return false;
  }
};

export type ListExpectedEntriesOptions = {
  organizationId?: string | null;
  seasonId?: string | null;
};

/**
 * Le previsioni del club, dalla piu vicina nel tempo.
 *
 * **Due letture e basta**, una per collezione. Non passa dall'aggregatore che la
 * Wave 4 ha rimosso da `/movements`: quello normalizzava ventidue sorgenti nel
 * browser e si portava dietro due letture morte.
 */
export const listExpectedEntries = async (
  scope: ExpectedEntryScope,
  options: ListExpectedEntriesOptions = {},
): Promise<ExpectedEntriesResult> => {
  assertAccountingPermission(scope?.activeRole, "accounting.read");
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const [income, expenses, season] = await Promise.all([
    readClubResourceCollection(organizationId, RESOURCE_TYPE_BY_DIRECTION.income),
    readClubResourceCollection(organizationId, RESOURCE_TYPE_BY_DIRECTION.expense),
    resolveSeason(organizationId, options.seasonId),
  ]);

  const keep = (resourceType: string, items: any[]) =>
    season
      ? filterCollectionBySeason(resourceType, items, season.activeSeasonId, {
          legacySeasonId: season.legacySeasonId,
          knownSeasonIds: season.knownSeasonIds,
        })
      : items;

  const entries = [
    ...keep(RESOURCE_TYPE_BY_DIRECTION.income, income as any[]).map(
      (item: Record<string, any>) => toView("income", item),
    ),
    ...keep(RESOURCE_TYPE_BY_DIRECTION.expense, expenses as any[]).map(
      (item: Record<string, any>) => toView("expense", item),
    ),
  ].sort((left, right) => asText(right.date).localeCompare(asText(left.date)));

  let expectedIncomeCents = 0;
  let expectedExpenseCents = 0;
  for (const entry of entries) {
    if (entry.direction === "income") expectedIncomeCents += entry.amountCents;
    else expectedExpenseCents += entry.amountCents;
  }

  return {
    entries,
    totals: {
      expectedIncomeCents,
      expectedExpenseCents,
      expectedNetCents: expectedIncomeCents - expectedExpenseCents,
    },
    canManage: hasManagePermission(scope),
  };
};

/* -------------------------------------------------------------- scrittura */

export type CreateExpectedEntryInput = {
  organizationId?: string | null;
  direction: string;
  date?: string | null;
  description?: string | null;
  category?: string | null;
  reference?: string | null;
  /** In centesimi. Nessuna superficie contabile manda euro. */
  amountCents?: number | string | null;
  seasonId?: string | null;
};

/**
 * Registra una previsione.
 *
 * **Non passa da `accounting_entries`**, e non e una dimenticanza: quella
 * tabella ospita fatti avvenuti, e un impegno futuro non lo e. Quando il denaro
 * arrivera davvero, a contare sara il movimento — e nascera dalla sua rotta.
 */
export const createExpectedEntry = async (
  scope: ExpectedEntryScope,
  input: CreateExpectedEntryInput,
): Promise<ExpectedEntryView> => {
  assertAccountingPermission(scope?.activeRole, "accounting.manage");
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  const direction = resolveDirection(input.direction);
  const resourceType = RESOURCE_TYPE_BY_DIRECTION[direction];

  const description = asText(input.description);
  if (!description) {
    throw new Error(
      "Una previsione senza descrizione non dice cosa il club si aspetta",
    );
  }

  const amountCents = Math.round(Number(input.amountCents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("L'importo previsto deve essere maggiore di zero");
  }

  const date = asText(input.date);
  if (!date) {
    throw new Error("Una previsione senza data non si puo collocare nel tempo");
  }

  const season = await resolveSeason(organizationId, input.seasonId);

  const payload: Record<string, any> = {
    date,
    description,
    category: asText(input.category) || null,
    reference: asText(input.reference) || null,
    /*
      L'importo si scrive in **euro** perche la colonna ne e piena da anni e una
      riga nuova in centesimi accanto a mille in euro darebbe totali sbagliati
      per sempre. La conversione avviene qui, in un punto solo, e la lettura
      riporta i centesimi.
    */
    amount: amountCents / 100,
    /*
      **Nessuno stato.** Una previsione dichiarata «pagata» era il modo in cui si
      finiva a credere che fosse cassa: quando il denaro arriva nasce un
      movimento, e la previsione ha finito il suo lavoro.
    */
    ...(season ? { seasonId: season.activeSeasonId } : {}),
  };

  const created = await prisma.$transaction((tx) =>
    appendClubResourceItem(tx, organizationId, resourceType, payload),
  );

  await recordAuditEvent({
    action: AUDIT_ACTIONS.resourceCreated,
    actorUserId: scope.userId,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: resourceType,
    resourceId: String(created.id),
    metadata: {
      verso: direction,
      descrizione: description,
      importoCentesimi: amountCents,
      data: date,
      stagione: season?.activeSeasonId || null,
    },
  });

  return toView(direction, created);
};

export type DeleteExpectedEntryInput = {
  organizationId?: string | null;
  direction: string;
  id: string;
};

/**
 * Cancella una previsione.
 *
 * **Qui un `DELETE` e legittimo, e non contraddice «il denaro non si cancella».**
 * Quella regola vale per i fatti di cassa, che si stornano perche sono accaduti.
 * Una previsione non e accaduta: e un promemoria, e un promemoria sbagliato si
 * toglie. Stornarla vorrebbe dire scrivere una previsione negativa, cioe un
 * numero che non significa niente.
 */
export const deleteExpectedEntry = async (
  scope: ExpectedEntryScope,
  input: DeleteExpectedEntryInput,
): Promise<ExpectedEntryView> => {
  assertAccountingPermission(scope?.activeRole, "accounting.manage");
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  const direction = resolveDirection(input.direction);
  const resourceType = RESOURCE_TYPE_BY_DIRECTION[direction];

  const id = asText(input.id);
  if (!id) throw new Error("Manca la previsione da cancellare");

  const removed = await prisma.$transaction((tx) =>
    removeClubResourceItem(tx, organizationId, resourceType, id),
  );

  if (!removed) {
    /*
      «Non trovata» anche per una previsione di un altro club: il confine e gia
      applicato dalla ricerca, che legge solo le righe di questo club. Dire
      «negato» direbbe a chi prova che quella riga esiste altrove.
    */
    throw new Error("Previsione non trovata");
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.resourceDeleted,
    actorUserId: scope.userId,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: resourceType,
    resourceId: String(removed.id),
    metadata: {
      verso: direction,
      descrizione: asText(removed.description),
      importoCentesimi: toCents(removed.amount),
    },
  });

  return toView(direction, removed);
};
