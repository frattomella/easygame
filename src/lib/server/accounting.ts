import { prisma } from "./prisma";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import {
  assertAccountingEntryInvariants,
  fiscalYearOfEntry,
  isCounterpartyKind,
  isReconciliationStatus,
  normalizeActivityScope,
  normalizeDirection,
  oppositeDirection,
  toCents,
  toFiscalYearFilter,
  type AccountingLine,
  type AccountingSourceDomain,
  type CounterpartyKind,
  type ReconciliationStatus,
} from "@/lib/accounting/model";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import {
  mergeAccountingLines,
  projectFundingSettlements,
  projectPaymentTransactions,
  projectSportWorkPayouts,
} from "@/lib/accounting/projection";

/**
 * **La prima nota**: il proprietario delle righe proprie, e il lettore di
 * quelle degli altri.
 *
 * ---
 *
 * ## Cosa questo modulo sostituisce
 *
 * `/movements` era **un aggregatore di lettura nel browser**: circa diciassette
 * viaggi HTTP per disegnare una pagina, di cui quattordici sulla **stessa
 * singola riga** `clubs` — una per colonna, e ognuna riportava comunque
 * `settings`, la colonna piu grande. Poi ventidue letture normalizzate in
 * memoria, due deduplicazioni con due chiavi diverse, e un `sort` con
 * `localeCompare` su date ISO. Due delle ventidue erano **morte**: cercavano
 * `suppliers` e `supplier_payments`, che non esistono ne come colonna ne come
 * risorsa.
 *
 * Qui la stessa pagina e **una lettura**, sul server, con gli indici.
 *
 * ## Cosa vive qui e cosa no
 *
 * Le righe di `accounting_entries` sono **solo** il movimento di cassa
 * registrato a mano, le due gambe di un giroconto e i loro storni. Tutto il
 * resto — incassi, compensi, contributi — appartiene al suo dominio e viene
 * **proiettato**: vedi `src/lib/accounting/projection.ts` e
 * `src/lib/accounting/OWNERSHIP.md`.
 *
 * ## Il taglio storico, e perche non c'e doppio conteggio
 *
 * I movimenti scritti **prima** di questa Wave vivono in `clubs.transactions` e
 * `clubs.transfers`, colonne JSON senza data interrogabile, senza autore e
 * senza causale. Non sono stati travasati in tabella, e la ragione non e
 * pigrizia: travasarli avrebbe richiesto di **inventare** per ognuno un conto e
 * una causale che nessuno ha mai dichiarato.
 *
 * Il loro effetto sui conti **c'e gia**, ed e dentro `opening_balance_cents`:
 * quel numero e cio che il vecchio blob dichiarava il giorno della migrazione,
 * ed e la somma di quei movimenti. Contarli una seconda volta li
 * raddoppierebbe.
 *
 * Quindi: **compaiono nella prima nota** (la storia non si perde, e si legge)
 * e **non toccano nessun saldo di conto** (il saldo li ha gia dentro). Sono
 * marcati `legacy`, in sola lettura, e non si cancellano piu da un `confirm()`
 * del browser — che era il difetto D-3.
 */

/* ========================================================================== */
/* Fondamenta                                                                  */
/* ========================================================================== */

export type AccountingScope = {
  userId?: string | null;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const entryClient = () => (prisma as any).accountingEntry;

/**
 * Il confine, ed e il **club attivo** — non l'insieme dei club accessibili.
 *
 * **Il difetto che l'audit della Wave 4 ha misurato qui.** Il confronto era con
 * `allowedOrganizationIds`, cioe con tutti i club a cui l'utente appartiene.
 * Ma il permesso si verifica con `activeRole`, che e il ruolo **nel club
 * attivo**: i due insiemi non coincidono mai per chi ha piu di un club, e
 * chiunque puo crearsi una societa e diventarne proprietario.
 *
 * Bastava mandare `x-active-club-id: <la mia>` insieme all'identificativo di
 * un movimento **di un'altra**, e il permesso veniva concesso con il ruolo
 * sbagliato. L'audit lo ha provato end-to-end: un genitore in un club, e
 * proprietario nel proprio, ha letto l'IBAN altrui, rinominato un conto,
 * registrato un'uscita da 70.000 euro e stornato un movimento.
 *
 * **Era gia stato trovato e chiuso una volta**, in
 * `src/lib/server/document-templates.ts`, con il commento che lo racconta. Sei
 * moduli nuovi lo hanno reintrodotto: la lezione non era nel codice, era in un
 * commento che nessuno ha riletto.
 *
 * La regola giusta e una sola: **la riga deve appartenere al club attivo**. Per
 * lavorare su un altro club si cambia club, e il ruolo viene risolto di nuovo
 * per quello.
 */
const ensureOrganizationAccess = (
  scope: AccountingScope,
  organizationId: string | null | undefined,
) => {
  if (!organizationId) throw denied("movimento senza club");
  const attivo = asText(scope?.activeOrganizationId);
  if (!attivo) throw denied("nessun club attivo selezionato");
  if (attivo !== asText(organizationId)) {
    throw denied("non trovato, o non appartiene al club attivo");
  }
};

const resolveOrganizationId = (scope: AccountingScope, requested?: unknown) => {
  const wanted = asText(requested);
  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }
  if (scope.activeOrganizationId) return scope.activeOrganizationId;
  throw denied("nessun club attivo selezionato");
};

const toDateOrNull = (value: unknown) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = asText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const iso = (value: unknown): string | null => toDateOrNull(value)?.toISOString() || null;

/* ========================================================================== */
/* Dalla riga alla forma comune                                                */
/* ========================================================================== */

/**
 * Una riga propria diventa una riga di prima nota.
 *
 * A differenza delle proiezioni, questa **puo** essere modificata, stornata e
 * riconciliata: e sua. I permessi li decide chi chiama, e questa funzione
 * riceve il verdetto invece di ricalcolarlo — un permesso valutato in due posti
 * e un permesso che prima o poi diverge.
 */
const toLine = (
  row: any,
  can: { reverse: boolean; reconcile: boolean; manage: boolean },
  numeriDocumento?: Map<string, string>,
): AccountingLine => {
  const stornata = Boolean(row.reversed_at);
  const eStorno = row.source_domain === "REVERSAL";
  const giroconto = row.source_domain === "INTERNAL_TRANSFER";

  return {
    id: `accounting-entry:${row.id}`,
    organizationId: row.organization_id,
    entryDate: iso(row.entry_date) as string,
    fiscalYear: Number(row.fiscal_year),
    seasonId: row.season_id || null,
    direction: row.direction,
    amountCents: Number(row.amount_cents) || 0,
    currency: row.currency || "EUR",
    financialAccountId: row.financial_account_id || null,
    financialAccountName: row.financial_account?.name || null,
    operationTypeCode: row.operation_type_code || null,
    operationTypeLabel:
      row.operation_type_label_snapshot || row.operation_type?.label || null,
    activityScope: normalizeActivityScope(row.activity_scope_snapshot),
    description: row.description,
    notes: row.notes || null,
    paymentMethod: row.payment_method || null,
    counterpartyKind: (row.counterparty_kind as CounterpartyKind) || null,
    counterpartyId: row.counterparty_id || null,
    counterpartyLabel: row.counterparty_label || null,
    sourceDomain: row.source_domain as AccountingSourceDomain,
    sourceId: row.source_id || null,
    documentKind: row.document_kind || null,
    documentId: row.document_id || null,
    /*
      Il numero del documento arriva da una lettura sola per pagina, non da un
      join riga per riga: i documenti collegati sono pochi, e chiederli uno
      alla volta e il difetto che questa Wave ha tolto alla pagina.
    */
    documentNumber: numeriDocumento?.get(String(row.document_id || "")) || null,
    siteId: row.site_id || null,
    reconciliationStatus: row.reconciliation_status as ReconciliationStatus,
    valueDate: iso(row.value_date),
    bankReference: row.bank_reference || null,
    transferGroupId: row.transfer_group_id || null,
    reversalOfId: row.reversal_of_id || null,
    reversedAt: iso(row.reversed_at),
    reversalReason: row.reversal_reason || null,
    createdBy: row.created_by || null,
    createdAt: iso(row.created_at),
    /*
      **Cosa si puo fare, e perche cosi poco.**

      Una riga **stornata** e uno **storno** non si toccano: sono la coppia che
      racconta una correzione, e modificarne una meta la renderebbe illeggibile.
      Un **giroconto** non si modifica gamba per gamba — si storna intero,
      altrimenti le due meta possono divergere e il denaro sparisce fra due
      conti. Nessuna riga si **cancella**: e la regola della Wave.
    */
    canEdit: can.manage && !stornata && !eStorno && !giroconto,
    canDelete: false,
    canReverse: can.reverse && !stornata && !eStorno,
    canReconcile: can.reconcile && !stornata,
  };
};

/* ========================================================================== */
/* I movimenti storici, che vivono ancora nel JSON                             */
/* ========================================================================== */

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/**
 * Le righe scritte prima della prima nota, lette dal blob e mostrate in sola
 * lettura.
 *
 * **Non hanno un conto**, e non gliene viene attribuito uno: il loro effetto e
 * gia dentro il saldo di apertura dei conti travasati, e assegnarle a una cassa
 * le conterebbe due volte.
 *
 * **Non hanno una causale**, e neanche questa viene inventata: compaiono come
 * `unspecified`, che e la verita. Il rendiconto le contera fra le «non
 * classificate» invece di nasconderle in un totale — ed e cosi che un club
 * capisce che ha del lavoro di classificazione da fare.
 */
const projectLegacyClubMovements = (club: any): AccountingLine[] => {
  const organizationId = String(club?.id || "");
  if (!organizationId) return [];

  const base = (id: string, entryDate: string) => ({
    organizationId,
    entryDate,
    fiscalYear: fiscalYearOfEntry(entryDate),
    seasonId: null,
    currency: "EUR",
    financialAccountId: null,
    financialAccountName: null,
    operationTypeCode: null,
    operationTypeLabel: null,
    activityScope: "unspecified" as const,
    notes: null,
    counterpartyKind: null,
    counterpartyId: null,
    counterpartyLabel: null,
    sourceId: id,
    documentKind: null,
    documentId: null,
    documentNumber: null,
    siteId: null,
    reconciliationStatus: "unreconciled" as const,
    valueDate: null,
    bankReference: null,
    transferGroupId: null,
    reversalOfId: null,
    reversedAt: null,
    reversalReason: null,
    createdBy: null,
    createdAt: entryDate,
    canEdit: false,
    canDelete: false,
    canReverse: false,
    canReconcile: false,
  });

  const movimenti = asArray(club.transactions).flatMap((row, index): AccountingLine[] => {
    const entryDate = iso(row?.date) || iso(row?.created_at);
    if (!entryDate) return [];
    const amountCents = Math.abs(toCents(Number(row?.amount) || 0));
    if (amountCents === 0) return [];

    const tipo = String(row?.type || row?.direction || "income").toLowerCase();
    return [
      {
        ...base(String(row?.id || `legacy-${index}`), entryDate),
        id: `legacy-transaction:${row?.id || index}`,
        direction: ["expense", "uscita", "out"].includes(tipo) ? "OUT" : "IN",
        amountCents,
        sourceDomain: "MANUAL",
        description: asText(row?.description) || asText(row?.title) || "Movimento storico",
        paymentMethod: asText(row?.paymentMethod) || asText(row?.method) || null,
      } as AccountingLine,
    ];
  });

  const giroconti = asArray(club.transfers).flatMap((row, index): AccountingLine[] => {
    const entryDate = iso(row?.date) || iso(row?.created_at);
    if (!entryDate) return [];
    const amountCents = Math.abs(toCents(Number(row?.amount) || 0));
    if (amountCents === 0) return [];

    /*
      Un giroconto storico e **una** riga sola nel blob, non due. Resta una riga
      qui, con verso `OUT` per convenzione e senza gruppo: non e una gamba di
      niente, e presentarlo come due meta suggerirebbe un collegamento che nel
      dato non c'e.
    */
    return [
      {
        ...base(String(row?.id || `legacy-transfer-${index}`), entryDate),
        id: `legacy-transfer:${row?.id || index}`,
        direction: "OUT",
        amountCents,
        sourceDomain: "INTERNAL_TRANSFER",
        description: asText(row?.description) || "Giroconto storico",
        paymentMethod: "Giroconto",
      } as AccountingLine,
    ];
  });

  return [...movimenti, ...giroconti];
};

/**
 * **La finestra di date di una stagione.**
 *
 * Serve a un problema preciso, trovato dalla lane del rendiconto: il filtro per
 * stagione scendeva nel `where` di Prisma, che vale **solo per le righe
 * proprie**. Le righe proiettate — incassi, compensi, liquidazioni — non hanno
 * una colonna `season_id` e non possono averla: `payment_transactions` non sa
 * cosa sia una stagione sportiva. Il risultato osservabile era che un riepilogo
 * filtrato per stagione mostrava comunque gli incassi di **tutte** le stagioni.
 *
 * Le due risposte facili sono entrambe sbagliate. Escluderle nasconde denaro
 * vero; lasciarle passare tutte risponde a una domanda diversa da quella posta.
 *
 * La risposta giusta e che **una riga che non dichiara una stagione appartiene
 * alla stagione nel cui periodo cade**, e le stagioni sono gia configurate con
 * le loro date. E la stessa forma con cui l'anno fiscale si deriva dalla data:
 * un asse temporale non si digita, si legge dal fatto.
 */
const resolveSeasonWindow = async (organizationId: string, seasonId: string) => {
  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const stagioni = normalizeClubSeasons(club?.settings)?.seasons || [];
  const stagione = stagioni.find((riga: any) => String(riga.id) === seasonId);
  if (!stagione) return null;

  const inizio = toDateOrNull(stagione.startDate);
  const fine = toDateOrNull(stagione.endDate);
  if (!inizio || !fine) return null;

  /*
    La fine e inclusiva: una stagione che finisce il 30 giugno contiene il 30
    giugno. Senza l'ultimo istante del giorno, un incasso di quella mattina
    cadrebbe fuori da entrambe le stagioni.
  */
  fine.setUTCHours(23, 59, 59, 999);
  return { inizio, fine };
};

/* ========================================================================== */
/* Lettura                                                                     */
/* ========================================================================== */

export type AccountingListFilters = {
  organizationId?: unknown;
  from?: unknown;
  to?: unknown;
  fiscalYear?: unknown;
  seasonId?: unknown;
  financialAccountId?: unknown;
  operationTypeCode?: unknown;
  direction?: unknown;
  sourceDomain?: unknown;
  siteId?: unknown;
  reconciliationStatus?: unknown;
  activityScope?: unknown;
  search?: unknown;
  /** Includere le righe proiettate dai domini. Vero salvo richiesta contraria. */
  includeProjections?: boolean;
  /** Includere i movimenti storici del blob. Vero salvo richiesta contraria. */
  includeLegacy?: boolean;
  limit?: unknown;
  offset?: unknown;
};

const toLimit = (value: unknown, fallback = 100) => {
  const parsed = Number(asText(value));
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 500);
};

const toOffset = (value: unknown) => {
  const parsed = Number(asText(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * La prima nota di un club, in **una** lettura.
 *
 * I filtri sui campi che la tabella possiede scendono nel `where` di Prisma; i
 * filtri che valgono anche per le proiezioni si applicano dopo, sulla forma
 * comune. La differenza non e cosmetica: gli indici lavorano solo sul primo
 * gruppo, e per questo `entry_date`, `fiscal_year` e `financial_account_id` ne
 * hanno uno.
 */
export const listAccountingEntries = async (
  filters: AccountingListFilters,
  scope: AccountingScope,
  permissions: { reverse: boolean; reconcile: boolean; manage: boolean },
) => {
  const organizationId = resolveOrganizationId(scope, filters.organizationId);

  const from = toDateOrNull(filters.from);
  const to = toDateOrNull(filters.to);
  /*
    `toFiscalYearFilter` e obbligatorio, e non e prudenza: `Number(null)` vale
    `0` ed e un intero, quindi un filtro scritto a mano risponderebbe **elenco
    vuoto** a chiunque non chieda un anno esplicito. E la trappola che il lavoro
    sportivo ha trovato a runtime con duemila test verdi.
  */
  const fiscalYear = toFiscalYearFilter(filters.fiscalYear);
  const direction = normalizeDirection(filters.direction);
  const accountId = asText(filters.financialAccountId) || null;
  const seasonId = asText(filters.seasonId) || null;
  const siteId = asText(filters.siteId) || null;
  const operationTypeCode = asText(filters.operationTypeCode) || null;
  const sourceDomain = asText(filters.sourceDomain).toUpperCase() || null;
  const activityScope = asText(filters.activityScope).toLowerCase() || null;
  const reconciliation = asText(filters.reconciliationStatus).toLowerCase() || null;
  const search = asText(filters.search).toLowerCase() || null;

  /*
    La finestra si risolve **prima** della lettura, e puo non esserci: un club
    che non ha ancora configurato le stagioni, o una stagione senza date, non
    permettono di attribuire per data una riga che la stagione non la dichiara.

    In quel caso **non** si risponde elenco vuoto — sarebbe far sparire denaro
    vero per una configurazione mancante. Vale la sola regola che il dato
    sostiene: chi dichiara la stagione risponde con quella. Le proiezioni, che
    non la dichiarano mai, restano fuori dal filtro, e la superficie che le
    voleva dovra prima far configurare le stagioni.
  */
  const finestraStagione = seasonId
    ? await resolveSeasonWindow(organizationId, seasonId)
    : null;

  const proprie = await entryClient().findMany({
    where: {
      organization_id: organizationId,
      ...(from || to
        ? { entry_date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(fiscalYear !== null ? { fiscal_year: fiscalYear } : {}),
      ...(accountId ? { financial_account_id: accountId } : {}),
      /*
        Non si filtra qui su `season_id`: le righe proprie che **non** lo
        dichiarano (un movimento registrato prima che le stagioni esistessero)
        sparirebbero, mentre appartengono alla stagione in cui cadono. Il filtro
        vale su tutte le righe allo stesso modo, poco piu sotto.
      */
      ...(siteId ? { site_id: siteId } : {}),
      ...(operationTypeCode ? { operation_type_code: operationTypeCode } : {}),
      ...(direction ? { direction } : {}),
      ...(reconciliation ? { reconciliation_status: reconciliation } : {}),
      ...(activityScope ? { activity_scope_snapshot: activityScope } : {}),
    },
    orderBy: [{ entry_date: "desc" }, { created_at: "desc" }],
    include: { financial_account: true, operation_type: true },
  });

  const numeriDocumento = await risolviNumeriDocumento(organizationId, proprie);
  let righe = proprie.map((row: any) => toLine(row, permissions, numeriDocumento));

  if (filters.includeProjections !== false) {
    righe = righe.concat(
      await loadProjectedLines(organizationId, { from, to, accountId }),
    );
  }

  if (filters.includeLegacy !== false) {
    const club = await (prisma as any).club.findUnique({
      where: { id: organizationId },
      select: { id: true, transactions: true, transfers: true },
    });
    if (club) righe = righe.concat(projectLegacyClubMovements(club));
  }

  /* I filtri che valgono su tutte le righe, proiezioni comprese. */
  const filtrate = mergeAccountingLines(righe).filter((riga) => {
    if (from && Date.parse(riga.entryDate) < from.getTime()) return false;
    if (to && Date.parse(riga.entryDate) > to.getTime()) return false;
    if (fiscalYear !== null && riga.fiscalYear !== fiscalYear) return false;
    if (seasonId && !finestraStagione) {
      /*
        Nessuna finestra: si puo solo confrontare cio che la riga dichiara.
      */
      if (riga.seasonId !== seasonId) return false;
    }
    if (finestraStagione) {
      /*
        Chi dichiara la stagione risponde con quella; chi non la dichiara —
        ogni riga proiettata — risponde con la data. Le due vie devono
        coesistere: un movimento manuale registrato in una stagione e
        retrodatato a un'altra deve restare dove l'operatore l'ha messo.
      */
      if (riga.seasonId) {
        if (riga.seasonId !== seasonId) return false;
      } else {
        const quando = Date.parse(riga.entryDate);
        if (
          quando < finestraStagione.inizio.getTime() ||
          quando > finestraStagione.fine.getTime()
        ) {
          return false;
        }
      }
    }
    if (direction && riga.direction !== direction) return false;
    if (accountId && riga.financialAccountId !== accountId) return false;
    if (siteId && riga.siteId !== siteId) return false;
    if (sourceDomain && riga.sourceDomain !== sourceDomain) return false;
    if (operationTypeCode && riga.operationTypeCode !== operationTypeCode) return false;
    if (activityScope && riga.activityScope !== activityScope) return false;
    if (reconciliation && riga.reconciliationStatus !== reconciliation) return false;
    if (search) {
      const testo = [
        riga.description,
        riga.counterpartyLabel,
        riga.operationTypeLabel,
        riga.operationTypeCode,
        riga.notes,
        riga.bankReference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!testo.includes(search)) return false;
    }
    return true;
  });

  const limit = toLimit(filters.limit);
  const offset = toOffset(filters.offset);

  return {
    entries: filtrate.slice(offset, offset + limit),
    total: filtrate.length,
    limit,
    offset,
  };
};

/**
 * I numeri dei documenti collegati alle righe proprie, in **una** lettura.
 *
 * La lettura porta il suo `organization_id` anche se gli id arrivano da righe
 * gia verificate: un documento di un altro club che per un errore finisse
 * referenziato non deve poter comparire con il suo numero. E il confine, non un
 * doppione del confine.
 */
const risolviNumeriDocumento = async (
  organizationId: string,
  righe: readonly any[],
): Promise<Map<string, string>> => {
  const fatture: string[] = [];
  const ricevute: string[] = [];
  for (const riga of righe) {
    const id = asText(riga.document_id);
    if (!id) continue;
    const tipo = asText(riga.document_kind).toLowerCase();
    if (tipo === "invoice" || tipo === "fattura") fatture.push(id);
    else if (tipo === "receipt" || tipo === "ricevuta") ricevute.push(id);
  }

  const mappa = new Map<string, string>();
  if (!fatture.length && !ricevute.length) return mappa;

  const [f, r] = await Promise.all([
    fatture.length
      ? (prisma as any).invoice.findMany({
          where: { organization_id: organizationId, id: { in: fatture } },
          select: { id: true, invoice_number: true },
        })
      : [],
    ricevute.length
      ? (prisma as any).receipt.findMany({
          where: { organization_id: organizationId, id: { in: ricevute } },
          select: { id: true, receipt_number: true },
        })
      : [],
  ]);

  for (const riga of f || []) mappa.set(riga.id, riga.invoice_number);
  for (const riga of r || []) {
    if (riga.receipt_number) mappa.set(riga.id, riga.receipt_number);
  }
  return mappa;
};

/**
 * Le righe dei domini proprietari, lette con i loro filtri e proiettate.
 *
 * **Ogni lettura porta il suo `organization_id`.** Non e ridondanza rispetto al
 * confine gia verificato: e la regola del repository, e vale anche quando chi
 * legge ha gia superato un controllo — perche il giorno in cui questa funzione
 * viene chiamata da un altro punto, il filtro c'e comunque.
 */
const loadProjectedLines = async (
  organizationId: string,
  window: { from: Date | null; to: Date | null; accountId: string | null },
): Promise<AccountingLine[]> => {
  const periodo = (field: string) =>
    window.from || window.to
      ? {
          [field]: {
            ...(window.from ? { gte: window.from } : {}),
            ...(window.to ? { lte: window.to } : {}),
          },
        }
      : {};

  const contoSe = window.accountId ? { financial_account_id: window.accountId } : {};

  const [incassi, compensi, liquidazioni] = await Promise.all([
    (prisma as any).paymentTransaction.findMany({
      where: { organization_id: organizationId, ...periodo("paid_at"), ...contoSe },
      include: {
        athlete: { select: { first_name: true, last_name: true } },
        /*
          Il documento che attesta l'incasso, quando e stato emesso. Prima le
          colonne documento restavano vuote su ogni riga proiettata, e l'export
          doveva rileggerle da capo: e lo stesso dato, chiesto due volte.
        */
        receipts: {
          select: { id: true, receipt_number: true, cancelled_at: true },
          take: 1,
          orderBy: [{ issue_date: "desc" }],
        },
        transaction_invoices: {
          select: { id: true, invoice_number: true, cancelled_at: true },
          take: 1,
          orderBy: [{ issue_date: "desc" }],
        },
      },
      orderBy: [{ paid_at: "desc" }],
    }),
    (prisma as any).sportWorkOutboundTransaction.findMany({
      where: { organization_id: organizationId, ...periodo("paid_at"), ...contoSe },
      include: { person: { select: { first_name: true, last_name: true } } },
      orderBy: [{ paid_at: "desc" }],
    }),
    (prisma as any).fundingSettlement.findMany({
      where: { organization_id: organizationId, ...periodo("settled_at"), ...contoSe },
      include: { program: { select: { name: true } } },
      orderBy: [{ settled_at: "desc" }],
    }),
  ]);

  const nome = (persona: any) =>
    persona
      ? `${persona.first_name || ""} ${persona.last_name || ""}`.trim() || null
      : null;

  return [
    ...projectPaymentTransactions(
      (incassi || []).map((row: any) => {
        /*
          La fattura vince sulla ricevuta quando ci sono entrambe: e il
          documento con la numerazione fiscale propria, ed e quello che un
          commercialista cerca. Un documento **annullato** non si mostra: dire
          che un incasso porta un numero ritirato e peggio che non dirne
          nessuno.
        */
        const fattura = (row.transaction_invoices || []).find((d: any) => !d.cancelled_at);
        const ricevuta = (row.receipts || []).find((d: any) => !d.cancelled_at);
        const documento = fattura || ricevuta;

        return {
          ...row,
          _athleteName: nome(row.athlete),
          _documentKind: documento ? (fattura ? "invoice" : "receipt") : null,
          _documentId: documento?.id || null,
          _documentNumber: fattura?.invoice_number || ricevuta?.receipt_number || null,
        };
      }),
    ),
    ...projectSportWorkPayouts(
      (compensi || []).map((row: any) => ({ ...row, _personName: nome(row.person) })),
    ),
    ...projectFundingSettlements(
      (liquidazioni || []).map((row: any) => ({
        ...row,
        _programName: row.program?.name || null,
      })),
    ),
  ];
};

export const getAccountingEntryById = async (id: string, scope: AccountingScope) => {
  const row = await entryClient().findUnique({
    where: { id: asText(id) },
    include: { financial_account: true, operation_type: true },
  });
  if (!row) throw new Error("Movimento non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/* ========================================================================== */
/* Scrittura                                                                   */
/* ========================================================================== */

export type CreateAccountingEntryInput = {
  organizationId?: unknown;
  entryDate: unknown;
  direction: unknown;
  amount?: unknown;
  amountCents?: unknown;
  financialAccountId: unknown;
  operationTypeCode: unknown;
  description?: unknown;
  notes?: unknown;
  paymentMethod?: unknown;
  counterpartyKind?: unknown;
  counterpartyId?: unknown;
  counterpartyLabel?: unknown;
  documentKind?: unknown;
  documentId?: unknown;
  siteId?: unknown;
  seasonId?: unknown;
  valueDate?: unknown;
  bankReference?: unknown;
};

const resolveAmountCents = (input: {
  amountCents?: unknown;
  amount?: unknown;
}): number => {
  if (input.amountCents !== undefined && input.amountCents !== null && input.amountCents !== "") {
    const parsed = Number(input.amountCents);
    if (!Number.isInteger(parsed)) {
      throw new Error("L'importo in centesimi deve essere un numero intero");
    }
    return parsed;
  }
  return toCents(asText(input.amount) || 0);
};

/**
 * Il conto, verificato **nel club del movimento**.
 *
 * Un conto di un altro club come bersaglio e un IDOR: la foreign key non lo
 * fermerebbe, perche il conto esiste davvero — semplicemente non e di chi
 * scrive. Il confine lo mette questa lettura, e il messaggio non dice se quel
 * conto esista altrove.
 */
const ensureAccountBelongsToClub = async (
  client: any,
  organizationId: string,
  accountId: string,
) => {
  const conto = await client.financialAccount.findUnique({ where: { id: accountId } });
  if (!conto || conto.organization_id !== organizationId) {
    throw new Error("Conto finanziario non trovato");
  }
  if (conto.is_archived) {
    throw new Error(
      "Il conto e archiviato: non si registrano movimenti nuovi su un conto chiuso",
    );
  }
  return conto;
};

/**
 * La causale, verificata nel club, con la sua classificazione **congelata**.
 *
 * Il congelamento e il punto: la causale e configurazione mutabile, e se domani
 * un club ne corregge la natura tutti i movimenti passati cambierebbero natura
 * retroattivamente. Il lavoro sportivo congela contributi e aliquote per la
 * stessa ragione, e un documento fiscale porta uno snapshot.
 */
const resolveOperationType = async (
  client: any,
  organizationId: string,
  code: string,
) => {
  const causale = await client.fiscalOperationType.findFirst({
    where: { organization_id: organizationId, code },
  });
  if (!causale) {
    throw new Error(`Causale «${code}» non trovata fra quelle configurate dal club`);
  }
  if (causale.is_active === false) {
    throw new Error(`La causale «${causale.label}» e disattivata`);
  }
  return causale;
};

const counterpartyColumns = (input: {
  counterpartyKind?: unknown;
  counterpartyId?: unknown;
  counterpartyLabel?: unknown;
}) => {
  const kind = asText(input.counterpartyKind).toUpperCase();
  if (!kind) return {};
  if (!isCounterpartyKind(kind)) {
    throw new Error(`Tipo di controparte sconosciuto: ${kind}`);
  }
  return {
    counterparty_kind: kind,
    counterparty_id: asText(input.counterpartyId) || null,
    counterparty_label: asText(input.counterpartyLabel) || null,
  };
};

/** Registra un movimento manuale: un fatto di cassa che nessun altro evento genera. */
export const createAccountingEntry = async (
  input: CreateAccountingEntryInput,
  scope: AccountingScope,
  options?: {
    /**
     * **La chiave dell'evento che ha prodotto questa riga.**
     *
     * Serve a chi registra un movimento **a partire da un fatto di un altro
     * dominio** — l'esempio e il versamento F24, che nasce quando un
     * adempimento viene assolto. Due clic sul pulsante, o due richieste
     * simultanee, portano la stessa chiave, e la seconda si infrange
     * sull'indice unico parziale invece di far uscire il denaro due volte.
     *
     * Non e un campo dell'API: nessuna rotta HTTP lo imposta, e le rotte
     * costruiscono il loro input campo per campo proprio perche un corpo di
     * richiesta non possa portarlo. Un client che potesse sceglierlo potrebbe
     * anche **impedire** la registrazione di un movimento legittimo,
     * occupandone la chiave.
     */
    sourceEventKey?: string | null;
  },
) => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);
  const entryDate = toDateOrNull(input.entryDate);
  const direction = normalizeDirection(input.direction);
  const amountCents = resolveAmountCents(input);
  const accountId = asText(input.financialAccountId);
  const code = asText(input.operationTypeCode);

  assertAccountingEntryInvariants({
    direction,
    amountCents,
    entryDate,
    sourceDomain: "MANUAL",
    financialAccountId: accountId,
    operationTypeCode: code,
    description: asText(input.description) || code,
  });

  const row = await (prisma as any).$transaction(async (client: any) => {
    await ensureAccountBelongsToClub(client, organizationId, accountId);
    const causale = await resolveOperationType(client, organizationId, code);

    return client.accountingEntry.create({
      data: {
        organization_id: organizationId,
        entry_date: entryDate as Date,
        fiscal_year: fiscalYearOfEntry(entryDate as Date),
        season_id: asText(input.seasonId) || null,
        direction,
        amount_cents: amountCents,
        financial_account_id: accountId,
        operation_type_id: causale.id,
        operation_type_code: causale.code,
        activity_scope_snapshot: normalizeActivityScope(causale.activity_scope),
        operation_type_label_snapshot: causale.label,
        description: asText(input.description) || causale.label,
        notes: asText(input.notes) || null,
        payment_method: asText(input.paymentMethod) || null,
        ...counterpartyColumns(input),
        source_domain: "MANUAL",
        source_event_key: asText(options?.sourceEventKey) || null,
        document_kind: asText(input.documentKind) || null,
        document_id: asText(input.documentId) || null,
        site_id: asText(input.siteId) || null,
        value_date: toDateOrNull(input.valueDate),
        bank_reference: asText(input.bankReference) || null,
        created_by: scope.userId || null,
      },
      include: { financial_account: true, operation_type: true },
    });
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.accountingEntryRecorded,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId,
    resource: "accounting_entries",
    resourceId: row.id,
    metadata: {
      direction: row.direction,
      amountCents: row.amount_cents,
      accountId: row.financial_account_id,
      operationTypeCode: row.operation_type_code,
    },
  });

  return row;
};

/* ========================================================================== */
/* Giroconto                                                                   */
/* ========================================================================== */

/**
 * **Un giroconto e due movimenti, in una transazione sola.**
 *
 * Oggi sono due chiamate HTTP separate, e un giroconto a meta lascia denaro
 * sparito: uscito da un conto e mai arrivato nell'altro. Qui o nascono
 * entrambe le gambe, o non ne nasce nessuna.
 *
 * **Perche non e un terzo verso.** Il vecchio modello aveva
 * `direction: "transfer"`, e ogni consumatore doveva ricordarsi di escluderlo
 * dai totali — chi se ne dimenticava dichiarava 500 EUR di entrata e 500 di
 * uscita per un'operazione che non ha ne l'una ne l'altra. Qui sono un'uscita e
 * un'entrata vere, su due conti veri, tenute insieme da `transfer_group_id`. La
 * liquidita totale non cambia perche le due si compensano, non perche qualcuno
 * si ricorda di saltarle.
 */
export const createInternalTransfer = async (
  input: {
    organizationId?: unknown;
    entryDate: unknown;
    amount?: unknown;
    amountCents?: unknown;
    fromAccountId: unknown;
    toAccountId: unknown;
    description?: unknown;
    notes?: unknown;
    operationTypeCode?: unknown;
    siteId?: unknown;
    seasonId?: unknown;
  },
  scope: AccountingScope,
) => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);
  const entryDate = toDateOrNull(input.entryDate);
  const amountCents = resolveAmountCents(input);
  const fromId = asText(input.fromAccountId);
  const toId = asText(input.toAccountId);

  if (!entryDate) {
    throw new Error("Un giroconto senza data non e collocabile in nessun esercizio");
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("L'importo di un giroconto deve essere maggiore di zero");
  }
  if (!fromId || !toId) {
    throw new Error("Un giroconto ha un conto di partenza e uno di arrivo");
  }
  if (fromId === toId) {
    throw new Error(
      "Un giroconto fra un conto e se stesso non sposta niente: scegliere due conti diversi",
    );
  }

  const gruppo = crypto.randomUUID();

  const righe = await (prisma as any).$transaction(async (client: any) => {
    const partenza = await ensureAccountBelongsToClub(client, organizationId, fromId);
    const arrivo = await ensureAccountBelongsToClub(client, organizationId, toId);

    const comune = {
      organization_id: organizationId,
      entry_date: entryDate,
      fiscal_year: fiscalYearOfEntry(entryDate),
      season_id: asText(input.seasonId) || null,
      amount_cents: amountCents,
      source_domain: "INTERNAL_TRANSFER" as const,
      transfer_group_id: gruppo,
      site_id: asText(input.siteId) || null,
      payment_method: "Giroconto",
      notes: asText(input.notes) || null,
      created_by: scope.userId || null,
      /*
        Un giroconto non porta causale: non e un'operazione economica, e
        attribuirgliene una lo farebbe comparire in una voce di rendiconto.
        Il verso lo spiega la coppia, non una categoria.
      */
      operation_type_id: null,
      operation_type_code: null,
      activity_scope_snapshot: "unspecified",
    };

    const testo =
      asText(input.description) || `Giroconto ${partenza.name} -> ${arrivo.name}`;

    const uscita = await client.accountingEntry.create({
      data: {
        ...comune,
        direction: "OUT",
        financial_account_id: fromId,
        description: testo,
      },
    });
    const entrata = await client.accountingEntry.create({
      data: {
        ...comune,
        direction: "IN",
        financial_account_id: toId,
        description: testo,
      },
    });

    return [uscita, entrata];
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.accountingTransferRecorded,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId,
    resource: "accounting_entries",
    resourceId: gruppo,
    metadata: { amountCents, fromAccountId: fromId, toAccountId: toId },
  });

  return { transferGroupId: gruppo, entries: righe };
};

/* ========================================================================== */
/* Correzione                                                                  */
/* ========================================================================== */

/**
 * **Correggere un movimento, senza poter riscrivere il fatto.**
 *
 * `canEdit` esisteva sulla riga e non aveva una rotta: la superficie non
 * mostrava nessun pulsante, perche uno che risponde 404 e peggio della sua
 * assenza. Questa e la rotta, ed e volutamente stretta.
 *
 * **Cosa non si corregge, e perche.** Data, verso, importo e conto **non** si
 * toccano: sono il fatto finanziario. Se uno di essi e sbagliato, il movimento
 * registrato non e mai avvenuto cosi, e la risposta e uno storno — che lascia
 * visibili l'errore e la correzione. Poterli riscrivere vorrebbe dire poter far
 * sparire un movimento da 10.000 EUR trasformandolo in uno da 10, senza che
 * nessuno se ne accorga: e il difetto D-3 con un altro nome.
 *
 * `entry_date` in particolare e `NOT NULL` e immutabile dal primo giorno,
 * perche un periodo si possa chiudere senza migrazioni dolorose.
 *
 * **Cosa si corregge**: cio che descrive il fatto senza cambiarlo —
 * descrizione, note, metodo, controparte, riferimento bancario, sede — e la
 * **causale**, che merita una riga a parte.
 *
 * **Perche la causale si puo correggere**, benche la Wave insista sul
 * congelamento. Le due cose non si contraddicono: il congelamento impedisce che
 * **modificare una causale nel catalogo** riscriva la natura di mille movimenti
 * passati, in silenzio e senza un autore. Correggere la classificazione di
 * **una** riga e l'opposto: e una decisione presa da una persona, su un
 * movimento solo, che lascia una traccia con il valore di prima e quello di
 * dopo. Un errore di classificazione altrimenti non avrebbe rimedio, e uno
 * storno per correggerlo farebbe sparire denaro vero dai totali di cassa.
 *
 * **Una riga stornata, uno storno e un giroconto non si correggono.** I primi
 * due sono la coppia che racconta una correzione, e modificarne una meta la
 * renderebbe illeggibile; il terzo si modificherebbe gamba per gamba, e le due
 * meta possono divergere.
 */
export const updateAccountingEntry = async (
  input: {
    entryId: unknown;
    description?: unknown;
    notes?: unknown;
    paymentMethod?: unknown;
    counterpartyKind?: unknown;
    counterpartyId?: unknown;
    counterpartyLabel?: unknown;
    bankReference?: unknown;
    valueDate?: unknown;
    siteId?: unknown;
    operationTypeCode?: unknown;
  },
  scope: AccountingScope,
) => {
  const entryId = asText(input.entryId);
  const originale = await entryClient().findUnique({ where: { id: entryId } });
  if (!originale) throw new Error("Movimento non trovato");
  ensureOrganizationAccess(scope, originale.organization_id);

  if (originale.reversed_at) {
    throw new Error(
      "Un movimento stornato non si corregge: la coppia originale e storno racconta cosa e successo",
    );
  }
  if (originale.source_domain === "REVERSAL") {
    throw new Error("Uno storno non si corregge: si corregge cio che ha stornato");
  }
  if (originale.source_domain === "INTERNAL_TRANSFER") {
    throw new Error(
      "Un giroconto non si corregge una gamba per volta: si storna intero e si registra di nuovo",
    );
  }

  const dati: Record<string, any> = {};
  const scritto = (chiave: string, valore: unknown) => {
    if (valore === undefined) return;
    dati[chiave] = asText(valore) || null;
  };

  scritto("notes", input.notes);
  scritto("payment_method", input.paymentMethod);
  scritto("bank_reference", input.bankReference);
  scritto("site_id", input.siteId);

  if (input.description !== undefined) {
    const testo = asText(input.description);
    if (!testo) {
      throw new Error("Un movimento senza descrizione non e leggibile da nessuno");
    }
    dati.description = testo;
  }

  if (input.valueDate !== undefined) {
    dati.value_date = toDateOrNull(input.valueDate);
  }

  if (input.counterpartyKind !== undefined) {
    Object.assign(dati, counterpartyColumns(input));
    if (!asText(input.counterpartyKind)) {
      dati.counterparty_kind = null;
      dati.counterparty_id = null;
      dati.counterparty_label = null;
    }
  }

  let causaleDopo: any = null;
  if (input.operationTypeCode !== undefined) {
    const code = asText(input.operationTypeCode);
    if (!code) {
      throw new Error(
        "Un movimento senza causale nasce gia sbagliato: scegliere la causale e la prima cosa",
      );
    }
    causaleDopo = await resolveOperationType(prisma, originale.organization_id, code);
    dati.operation_type_id = causaleDopo.id;
    dati.operation_type_code = causaleDopo.code;
    /*
      La classificazione si **ricongela** su quella della causale nuova: e una
      decisione presa adesso, e da adesso vale.
    */
    dati.activity_scope_snapshot = normalizeActivityScope(causaleDopo.activity_scope);
    dati.operation_type_label_snapshot = causaleDopo.label;
  }

  if (Object.keys(dati).length === 0) return originale;

  /*
    I valori di prima si copiano **adesso**, non si rileggono da `originale`
    dopo l'aggiornamento: un client che restituisse la riga viva invece di una
    copia farebbe scrivere in audit il valore nuovo al posto del vecchio, e la
    traccia direbbe che niente e cambiato. Copiare due stringhe costa meno di
    dipendere da quel dettaglio.
  */
  const causalePrima = originale.operation_type_code;
  const ambitoPrima = originale.activity_scope_snapshot;

  const row = await entryClient().update({
    where: { id: originale.id },
    data: dati,
    include: { financial_account: true, operation_type: true },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.accountingEntryUpdated,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId: originale.organization_id,
    resource: "accounting_entries",
    resourceId: originale.id,
    metadata: {
      campi: Object.keys(dati),
      /*
        La riclassificazione porta il valore di prima e quello di dopo: e la
        sola modifica che cambia la natura fiscale di una riga, e chi legge
        l'audit deve poter ricostruire cosa diceva il rendiconto prima.
      */
      ...(causaleDopo
        ? {
            causalePrima,
            ambitoPrima,
            causaleDopo: causaleDopo.code,
            ambitoDopo: dati.activity_scope_snapshot,
          }
        : {}),
    },
  });

  return row;
};

/* ========================================================================== */
/* Storno                                                                      */
/* ========================================================================== */

/**
 * **Storna un movimento. Non lo cancella.** (D-3)
 *
 * Un incasso di 100 EUR su una rata non si poteva cancellare: si stornava, e
 * restavano visibili entrambe le righe con il motivo. Un movimento manuale di
 * 10.000 EUR in cassa si cancellava con un `confirm()` del browser, spariva
 * dall'array e dalla tabella gemella, e nell'audit restava «qualcuno ha
 * modificato il club» — con l'id **del club**, non del movimento.
 *
 * Era la contraddizione piu netta del dominio: la regola valeva dove il denaro
 * era una riga di tabella e non valeva dove era un oggetto in un JSON.
 *
 * **Un giroconto si storna intero**: entrambe le gambe insieme, o le due meta
 * possono divergere e il denaro sparisce fra due conti.
 */
export const reverseAccountingEntry = async (
  input: { entryId: unknown; reason: unknown; entryDate?: unknown },
  scope: AccountingScope,
) => {
  const entryId = asText(input.entryId);
  const reason = asText(input.reason);
  if (!entryId) throw new Error("Movimento non trovato");
  if (!reason) {
    throw new Error("Uno storno deve dire perche: senza motivo la riga non spiega niente");
  }

  const originale = await entryClient().findUnique({ where: { id: entryId } });
  if (!originale) throw new Error("Movimento non trovato");
  ensureOrganizationAccess(scope, originale.organization_id);

  if (originale.source_domain === "REVERSAL") {
    throw new Error("Uno storno non si storna");
  }
  if (originale.reversed_at) {
    throw new Error("Questo movimento e gia stato stornato");
  }

  const now = toDateOrNull(input.entryDate) || new Date();

  const daStornare =
    originale.source_domain === "INTERNAL_TRANSFER" && originale.transfer_group_id
      ? await entryClient().findMany({
          where: {
            organization_id: originale.organization_id,
            transfer_group_id: originale.transfer_group_id,
          },
        })
      : [originale];

  if (daStornare.some((riga: any) => riga.reversed_at)) {
    throw new Error("Questo giroconto e gia stato stornato");
  }

  const storni = await (prisma as any).$transaction(async (client: any) => {
    const prodotti = [];
    for (const riga of daStornare) {
      /*
        Marcare **prima** l'originale, nella stessa transazione: se due
        richieste arrivano insieme, la seconda trova `reversed_at` scritto e si
        infrange comunque sull'indice unico parziale su `reversal_of_id`.
      */
      await client.accountingEntry.update({
        where: { id: riga.id },
        data: {
          reversed_at: now,
          reversed_by: scope.userId || null,
          reversal_reason: reason,
        },
      });

      prodotti.push(
        await client.accountingEntry.create({
          data: {
            organization_id: riga.organization_id,
            entry_date: now,
            fiscal_year: fiscalYearOfEntry(now),
            season_id: riga.season_id,
            direction: oppositeDirection(riga.direction),
            amount_cents: riga.amount_cents,
            currency: riga.currency,
            financial_account_id: riga.financial_account_id,
            /*
              Lo storno eredita la causale e la classificazione **congelata**
              dell'originale: uno storno classificato diversamente sposterebbe
              denaro da una voce di rendiconto a un'altra senza che nessuno lo
              abbia deciso.
            */
            operation_type_id: riga.operation_type_id,
            operation_type_code: riga.operation_type_code,
            activity_scope_snapshot: riga.activity_scope_snapshot,
            operation_type_label_snapshot: riga.operation_type_label_snapshot,
            description: `Storno - ${riga.description}`,
            notes: reason,
            payment_method: riga.payment_method,
            counterparty_kind: riga.counterparty_kind,
            counterparty_id: riga.counterparty_id,
            counterparty_label: riga.counterparty_label,
            source_domain: "REVERSAL",
            source_id: riga.id,
            site_id: riga.site_id,
            /*
              Lo storno di una gamba di giroconto **non** eredita il gruppo: il
              vincolo lo lega a `INTERNAL_TRANSFER`, e le due righe di storno
              restano legate all'originale da `reversal_of_id`, che e il legame
              giusto.
            */
            reversal_of_id: riga.id,
            created_by: scope.userId || null,
          },
          include: { financial_account: true, operation_type: true },
        }),
      );
    }
    return prodotti;
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.accountingEntryReversed,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId: originale.organization_id,
    resource: "accounting_entries",
    resourceId: originale.id,
    metadata: {
      reason,
      reversalIds: storni.map((riga: any) => riga.id),
      transferGroupId: originale.transfer_group_id || null,
    },
  });

  return storni;
};

/* ========================================================================== */
/* Riconciliazione                                                             */
/* ========================================================================== */

/**
 * Spunta un movimento contro l'estratto conto.
 *
 * **In V1 la riconciliazione e un atto umano su un dato che il sistema gia
 * conosce.** Nessun import di tracciati bancari, nessun matching automatico su
 * causale libera: sbaglia abbastanza da farsi disattivare, e nel frattempo ha
 * marcato come riconciliate righe che non lo erano — che e peggio di non
 * riconciliare affatto, perche toglie la domanda invece di rispondere.
 */
export const reconcileAccountingEntry = async (
  input: {
    entryId: unknown;
    status: unknown;
    valueDate?: unknown;
    bankReference?: unknown;
  },
  scope: AccountingScope,
) => {
  const entryId = asText(input.entryId);
  const status = asText(input.status).toLowerCase();

  if (!isReconciliationStatus(status)) {
    throw new Error(
      "Stato di riconciliazione sconosciuto: da riconciliare, riconciliato o contestato",
    );
  }

  const originale = await entryClient().findUnique({ where: { id: entryId } });
  if (!originale) throw new Error("Movimento non trovato");
  ensureOrganizationAccess(scope, originale.organization_id);

  if (originale.reversed_at) {
    throw new Error(
      "Un movimento stornato non si riconcilia: quel denaro non e mai arrivato in banca",
    );
  }

  /*
    **La guardia deve stare nella scrittura, non prima di essa.**

    L'audit ha lanciato uno storno e una riconciliazione insieme: la
    riconciliazione leggeva la riga **prima** che lo storno confermasse, la
    trovava non stornata, e scriveva. Otto movimenti su otto finivano con
    `reversed_at` valorizzato **e** `reconciliation_status = 'reconciled'` —
    lo stato che il messaggio d'errore due righe sopra dichiara impossibile.

    Il rimedio non e un lock: e mettere la condizione **dentro** l'`UPDATE`.
    Postgres valuta il `WHERE` sulla riga al momento della scrittura, quindi o
    la riga e ancora non stornata e l'aggiornamento avviene, o non lo e e non
    tocca niente — e allora si rilegge e si dice perche.
  */
  const aggiornate = await entryClient().updateMany({
    where: { id: originale.id, reversed_at: null },
    data: {
      reconciliation_status: status,
      value_date: toDateOrNull(input.valueDate) ?? originale.value_date,
      bank_reference: asText(input.bankReference) || originale.bank_reference,
      reconciled_at: status === "reconciled" ? new Date() : null,
      reconciled_by: status === "reconciled" ? scope.userId || null : null,
    },
  });

  if (!aggiornate?.count) {
    throw new Error(
      "Un movimento stornato non si riconcilia: quel denaro non e mai arrivato in banca",
    );
  }

  const row = await entryClient().findUnique({
    where: { id: originale.id },
    include: { financial_account: true, operation_type: true },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.accountingEntryReconciled,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId: originale.organization_id,
    resource: "accounting_entries",
    resourceId: originale.id,
    metadata: { status, previousStatus: originale.reconciliation_status },
  });

  return row;
};

export const toAccountingLine = toLine;
