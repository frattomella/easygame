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
  ledgerRowToLine,
  type LedgerViewRow,
} from "@/lib/accounting/ledger-view";

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

/**
 * Il club su cui si sta lavorando, e il confine gia verificato.
 *
 * Esportata perche il riepilogo possa applicare il confine **senza leggere
 * niente**: prima lo ricavava dalla lettura delle righe, e le altre quattro
 * letture aspettavano quella per potersi appoggiare al suo verdetto. Il
 * verdetto resta uno solo — questa e la stessa funzione — e le cinque letture
 * partono insieme.
 */
export const resolveAccountingScopeId = (
  scope: AccountingScope,
  requested?: unknown,
) => resolveOrganizationId(scope, requested);

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

/**
 * **L'ultimo istante di una data nuda**, e il valore com'e quando porta gia
 * un orario.
 *
 * `AAAA-MM-GG` in fondo a un intervallo significa «tutto quel giorno». Senza
 * questa distinzione l'ultimo giorno di ogni periodo spariva dal rendiconto e
 * dall'export; con un orario esplicito, invece, chi chiama ha detto una cosa
 * piu precisa e va rispettata.
 */
const fineGiornata = (value: unknown) => {
  const data = toDateOrNull(value);
  if (!data) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return new Date(data.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  return data;
};

const iso = (value: unknown): string | null => toDateOrNull(value)?.toISOString() || null;

/* ========================================================================== */
/* La finestra di una stagione                                                 */
/* ========================================================================== */

/**
 * **La finestra di date di una stagione.**
 *
 * Serve a un problema preciso, trovato dalla lane del rendiconto: le righe
 * proiettate — incassi, compensi, liquidazioni — non hanno una colonna
 * `season_id` e non possono averla: `payment_transactions` non sa cosa sia una
 * stagione sportiva. Il risultato osservabile era che un riepilogo filtrato per
 * stagione mostrava comunque gli incassi di **tutte** le stagioni.
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
  /*
    **Configurate davvero**, e non sintetizzate dal normalizzatore.

    `normalizeClubSeasons` restituisce una stagione predefinita anche a un club
    che non ne ha nessuna: e utile alle schermate, e qui sarebbe una risposta
    inventata. La distinzione fra i due casi decide se una stagione sconosciuta
    e un errore o un dato mancante.
  */
  const configurate = Array.isArray((club?.settings as any)?.seasons)
    ? ((club?.settings as any).seasons as unknown[])
    : [];
  const stagioni = normalizeClubSeasons(club?.settings)?.seasons || [];
  const stagione = stagioni.find((riga: any) => String(riga.id) === seasonId);

  /*
    **Una stagione che il club ha configurato, e questa non c'e: si rifiuta.**

    Senza questo controllo il filtro cadeva sul confronto letterale, e le righe
    proiettate — che una stagione non la dichiarano mai — non ne portavano
    nessuna: la risposta era un elenco vuoto, un rendiconto tutto a zero e un
    CSV valido e senza righe. Nessun errore, e nessun modo di distinguere
    «questa stagione non ha movimenti» da «questa stagione non esiste», che e
    la differenza fra una societa tranquilla e un segnalibro vecchio.

    Il rifiuto vale **solo** se il club le stagioni le ha configurate. Chi non
    le ha ancora configurate non deve vedersi rifiutare una lettura per una
    configurazione che nessuno gli ha chiesto: li vale la sola regola che il
    dato sostiene — chi dichiara la stagione risponde con quella — e le righe
    che non la dichiarano restano fuori dal filtro, non dal registro.
  */
  if (!stagione && configurate.length > 0) {
    throw new Error(
      `La stagione «${seasonId}» non e fra quelle configurate dal club: scegline una dall'elenco, oppure configurala.`,
    );
  }
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
 * **Il tetto assoluto di una lettura integrale.**
 *
 * Il rendiconto e l'export devono vedere **tutte** le righe del filtro, e le
 * leggono in una volta sola. Questo numero esiste perche un club fuori scala
 * non produca una lettura senza fine — non perche 40.000 righe siano un
 * problema: al di sotto, il registro si legge in un secondo.
 *
 * E dichiarato qui, e non in due moduli, perche il riepilogo e l'export ne
 * abbiano lo **stesso**: due tetti diversi sarebbero due risposte diverse alla
 * stessa domanda.
 */
export const TETTO_RIGHE_REGISTRO = 40000;

/**
 * L'ordine del registro, e vale per **ogni** lettura.
 *
 * Data decrescente, e a parita di data l'identificativo. Il secondo criterio
 * non e estetico: senza, la pagina 2 puo ripetere righe della pagina 1, perche
 * due letture con lo stesso `ORDER BY` ambiguo non sono obbligate a restituire
 * lo stesso ordine.
 */
const ORDINE_REGISTRO = [{ entry_date: "desc" as const }, { id: "asc" as const }];

const ledgerClient = () => (prisma as any).accountingLedgerLine;

/**
 * Il `where` della vista, da un filtro gia normalizzato.
 *
 * **Ogni filtro scende nel database.** Prima ne scendeva meta: quelli che la
 * tabella possedeva finivano nel `where` di Prisma, gli altri — origine,
 * causale sulle proiezioni, ricerca testuale — si applicavano in memoria su
 * righe gia lette. Che vuol dire che venivano lette tutte comunque.
 */
const ledgerWhere = (
  organizationId: string,
  f: {
    from: Date | null;
    to: Date | null;
    fiscalYear: number | null;
    accountId: string | null;
    siteId: string | null;
    operationTypeCode: string | null;
    direction: string | null;
    sourceDomain: string | null;
    activityScope: string | null;
    reconciliation: string | null;
    search: string | null;
    seasonId: string | null;
    finestraStagione: { inizio: Date; fine: Date } | null;
    rowKinds: readonly string[] | null;
  },
) => ({
  organization_id: organizationId,
  ...(f.from || f.to
    ? {
        entry_date: {
          ...(f.from ? { gte: f.from } : {}),
          ...(f.to ? { lte: f.to } : {}),
        },
      }
    : {}),
  ...(f.fiscalYear !== null ? { fiscal_year: f.fiscalYear } : {}),
  ...(f.accountId ? { financial_account_id: f.accountId } : {}),
  ...(f.siteId ? { site_id: f.siteId } : {}),
  ...(f.operationTypeCode ? { operation_type_code: f.operationTypeCode } : {}),
  ...(f.direction ? { direction: f.direction } : {}),
  ...(f.sourceDomain ? { source_domain: f.sourceDomain } : {}),
  ...(f.activityScope ? { activity_scope: f.activityScope } : {}),
  ...(f.reconciliation ? { reconciliation_status: f.reconciliation } : {}),
  ...(f.rowKinds ? { row_kind: { in: [...f.rowKinds] } } : {}),
  /*
    La ricerca lavora su una colonna che la vista compone gia in minuscolo:
    descrizione, controparte, causale, note e riferimento bancario. Cercare su
    sei colonne separate avrebbe richiesto sei `OR`, e nessuno di essi avrebbe
    potuto usare un indice.
  */
  ...(f.search
    ? { search_text: { contains: f.search, mode: "insensitive" as const } }
    : {}),
  /*
    La stagione: chi la dichiara risponde con quella, chi non la dichiara —
    ogni riga proiettata — risponde con la data. Le due vie devono coesistere,
    perche un movimento manuale registrato in una stagione e retrodatato a
    un'altra deve restare dove l'operatore l'ha messo.

    Senza finestra — un club che non ha configurato le stagioni, o una stagione
    senza date — resta la sola regola che il dato sostiene: si confronta cio
    che la riga dichiara. **Non** si risponde elenco vuoto: sarebbe far sparire
    denaro vero per una configurazione mancante.
  */
  ...(f.seasonId
    ? f.finestraStagione
      ? {
          OR: [
            { season_id: f.seasonId },
            {
              AND: [
                { season_id: null },
                {
                  entry_date: {
                    gte: f.finestraStagione.inizio,
                    lte: f.finestraStagione.fine,
                  },
                },
              ],
            },
          ],
        }
      : { season_id: f.seasonId }
    : {}),
});

/** Quali generi di riga il filtro lascia passare. `null` = tutti. */
const rowKindsOf = (filters: AccountingListFilters) => {
  const generi = ["entry"];
  if (filters.includeProjections !== false) generi.push("projected");
  if (filters.includeLegacy !== false) generi.push("legacy");
  return generi.length === 3 ? null : generi;
};

const normalizzaFiltri = async (
  organizationId: string,
  filters: AccountingListFilters,
) => {
  /*
    `toFiscalYearFilter` e obbligatorio, e non e prudenza: `Number(null)` vale
    `0` ed e un intero, quindi un filtro scritto a mano risponderebbe **elenco
    vuoto** a chiunque non chieda un anno esplicito. E la trappola che il lavoro
    sportivo ha trovato a runtime con duemila test verdi.
  */
  const seasonId = asText(filters.seasonId) || null;

  return {
    from: toDateOrNull(filters.from),
    /*
      **«Fino al 31 dicembre» comprende il 31 dicembre.**

      Il filtro arriva da un `<input type="date">`, cioe una data nuda, e
      `new Date("2026-12-31")` vale **mezzanotte**. Il confronto `lte`
      escludeva quindi tutto cio che quel giorno porta un orario — e lo portano
      quasi tutti i movimenti che il prodotto scrive da se: uno storno
      (`paid_at` e l'istante), un rimborso confermato dal provider, una
      liquidazione, un compenso.

      Misurato: un incasso di 500 il 15 ottobre e un rimborso di 200 il 31
      dicembre alle 16:40 danno, filtrando per anno fiscale, un netto di 300;
      filtrando `2026-01-01…2026-12-31`, un netto di **500**. Il rendiconto
      sopravvaluta di duecento euro, e il CSV consegnato al commercialista ha
      una riga in meno di quello per anno fiscale.

      Peggio fra due periodi adiacenti: un incasso alle 20:00 del 31 dicembre
      non e ne nel 2026 ne nel 2027. Contato **zero volte**.
    */
    to: fineGiornata(filters.to),
    fiscalYear: toFiscalYearFilter(filters.fiscalYear),
    accountId: asText(filters.financialAccountId) || null,
    siteId: asText(filters.siteId) || null,
    operationTypeCode: asText(filters.operationTypeCode) || null,
    direction: normalizeDirection(filters.direction),
    sourceDomain: asText(filters.sourceDomain).toUpperCase() || null,
    activityScope: asText(filters.activityScope).toLowerCase() || null,
    reconciliation: asText(filters.reconciliationStatus).toLowerCase() || null,
    /*
      **La ricerca si abbassa come si e abbassata la colonna.**

      `search_text` e costruita da `lower()` di Postgres, che applica la
      mappatura di maiuscole e minuscole **carattere per carattere**;
      `String.prototype.toLowerCase` applica quella completa di Unicode, che
      in qualche punto e diversa:

        "ΟΔΟΣ"      Postgres "οδοσ"     JavaScript "οδος"   (sigma finale)
        "İstanbul"  Postgres "istanbul" JavaScript "i̇stanbul"

      Non e una divergenza fra due letture del registro: e una riga che **non
      si trova cercandola con la propria descrizione**. Chi digita ΟΔΟΣ ottiene
      `οδος`, la colonna contiene `οδοσ`, e la riga non esce.

      Il confronto lo fa il database: si abbassa con lo stesso `lower()`.
    */
    search: asText(filters.search) || null,
    seasonId,
    finestraStagione: seasonId
      ? await resolveSeasonWindow(organizationId, seasonId)
      : null,
    rowKinds: rowKindsOf(filters),
  };
};

/**
 * La prima nota di un club: **una pagina, due letture, nessuna ricostruzione**.
 *
 * ---
 *
 * ## Cosa faceva prima, e quanto costava
 *
 * Leggeva tutto: tutti i movimenti propri, tutti gli incassi, tutti i compensi,
 * tutte le liquidazioni, tutto il blob storico. Poi filtrava in memoria,
 * ordinava in memoria e affettava cinquanta righe. Il resto lo buttava.
 *
 * Su un club medio non si vedeva. Su 35.000 righe — sotto il tetto dichiarato
 * di 40.000 — una pagina costava **5,7 secondi**. E il rendiconto e l'export,
 * che questa funzione la **sfogliavano** quaranta e ottanta volte, costavano
 * 110 e 93 secondi: ognuna delle ottanta chiamate ricostruiva il registro
 * intero per restituirne cinquecento righe.
 *
 * Il costo non era una costante alta: era O(N x pagine). Una cache sopra
 * sarebbe stata un cerotto su una domanda posta male.
 *
 * ## Cosa fa adesso
 *
 * Chiede al database una pagina, e il conto totale. Il registro — movimenti
 * propri piu proiezione di incassi, compensi, liquidazioni e movimenti storici
 * — e la vista `accounting_ledger_lines`, che non contiene niente: e la stessa
 * lettura di prima, scritta una volta sola e messa dove gli indici lavorano.
 *
 * Le regole della proiezione non sono state duplicate senza rete:
 * `src/lib/accounting/ledger-view.ts` le dichiara in TypeScript, e
 * `scripts/wave-4-registro-riconciliazione.mjs` prova contro il database vero
 * che le due letture coincidono riga per riga.
 */
export const listAccountingEntries = async (
  filters: AccountingListFilters,
  scope: AccountingScope,
  permissions: { reverse: boolean; reconcile: boolean; manage: boolean },
) => {
  const organizationId = resolveOrganizationId(scope, filters.organizationId);
  const where = ledgerWhere(
    organizationId,
    await normalizzaFiltri(organizationId, filters),
  );

  const limit = toLimit(filters.limit);
  const offset = toOffset(filters.offset);

  const [righe, total] = await Promise.all([
    ledgerClient().findMany({
      where,
      orderBy: ORDINE_REGISTRO,
      take: limit,
      skip: offset,
    }),
    ledgerClient().count({ where }),
  ]);

  return {
    entries: (righe || []).map((riga: LedgerViewRow) =>
      ledgerRowToLine(riga, permissions),
    ),
    total,
    limit,
    offset,
  };
};

/**
 * **Tutte** le righe del filtro, in una lettura sola.
 *
 * La usano il riepilogo gestionale e l'export, che non possono sfogliare: un
 * rendiconto costruito su una parte delle righe e un rendiconto sbagliato, e un
 * file di prima nota a cui mancano righe, aperto in un foglio di calcolo che
 * non sa niente di questa conversazione, **non si distingue da uno completo**.
 *
 * Prima sfogliavano `listAccountingEntries` quaranta e ottanta volte. Adesso
 * chiedono una volta, e il tetto serve solo a fermare un club fuori scala:
 * oltre, chi chiama decide se dichiarare la risposta parziale (il riepilogo) o
 * rifiutare il file (l'export).
 */
export const readAllAccountingLines = async (
  filters: AccountingListFilters,
  scope: AccountingScope,
  permissions: { reverse: boolean; reconcile: boolean; manage: boolean },
  cap = TETTO_RIGHE_REGISTRO,
): Promise<{ lines: AccountingLine[]; total: number; truncated: boolean }> => {
  const organizationId = resolveOrganizationId(scope, filters.organizationId);
  const where = ledgerWhere(
    organizationId,
    await normalizzaFiltri(organizationId, filters),
  );

  const [righe, total] = await Promise.all([
    ledgerClient().findMany({ where, orderBy: ORDINE_REGISTRO, take: cap }),
    ledgerClient().count({ where }),
  ]);

  const lines = (righe || []).map((riga: LedgerViewRow) =>
    ledgerRowToLine(riga, permissions),
  );

  return { lines, total, truncated: total > lines.length };
};

/**
 * **Le sole colonne che il riepilogo somma e raggruppa.**
 *
 * `buildManagementReport` non guarda descrizioni, note, controparti, documenti
 * ne il testo di ricerca: raggruppa per verso, causale, conto, mese, origine e
 * ambito, e somma gli importi. Leggere il resto significa far attraversare al
 * driver, per trentacinquemila righe, colonne che nessuno legge — e il testo
 * di ricerca e la piu grande di tutte, perche e la concatenazione delle altre.
 *
 * Su un riepilogo senza filtri, che e cio che la pagina chiede aprendosi,
 * quelle colonne erano la differenza fra stare dentro la soglia e starne
 * fuori.
 */
const COLONNE_DI_AGGREGAZIONE = {
  id: true,
  row_kind: true,
  organization_id: true,
  entry_date: true,
  fiscal_year: true,
  season_id: true,
  direction: true,
  amount_cents: true,
  currency: true,
  financial_account_id: true,
  financial_account_name: true,
  operation_type_code: true,
  operation_type_label: true,
  activity_scope: true,
  source_domain: true,
  source_id: true,
  reconciliation_status: true,
  reversal_of_id: true,
  reversed_at: true,
} as const;

/**
 * Le righe del riepilogo: **tutte quelle del filtro, e solo le colonne che
 * servono a contarle**.
 *
 * Restituisce righe di dominio come le altre, con i campi non letti a vuoto.
 * Non e una scorciatoia nascosta: la funzione ha un nome che dice a cosa
 * serve, e chi ha bisogno della riga intera — l'export, l'elenco — chiama
 * `readAllAccountingLines`.
 */
export const readAccountingAggregationLines = async (
  filters: AccountingListFilters,
  scope: AccountingScope,
  cap = TETTO_RIGHE_REGISTRO,
): Promise<{ lines: AccountingLine[]; total: number; truncated: boolean }> => {
  const organizationId = resolveOrganizationId(scope, filters.organizationId);
  const where = ledgerWhere(
    organizationId,
    await normalizzaFiltri(organizationId, filters),
  );

  const [righe, total] = await Promise.all([
    ledgerClient().findMany({
      where,
      orderBy: ORDINE_REGISTRO,
      take: cap,
      select: COLONNE_DI_AGGREGAZIONE,
    }),
    ledgerClient().count({ where }),
  ]);

  const lines = (righe || []).map((riga: any) =>
    ledgerRowToLine(
      {
        ...riga,
        description: "",
        notes: null,
        payment_method: null,
        counterparty_kind: null,
        counterparty_id: null,
        counterparty_label: null,
        document_kind: null,
        document_id: null,
        document_number: null,
        site_id: null,
        value_date: null,
        bank_reference: null,
        transfer_group_id: null,
        reversal_reason: null,
        created_by: null,
        created_at: null,
        search_text: null,
      } as LedgerViewRow,
      { reverse: false, reconcile: false, manage: false },
    ),
  );

  return { lines, total, truncated: total > lines.length };
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
/**
 * Lo spazio dei nomi di una chiave di idempotenza mandata dal client.
 *
 * Il prefisso e cio che la rende innocua: un client puo collidere con le
 * proprie richieste e con nessun'altra, e non puo occupare la chiave di un
 * evento di dominio.
 */
const chiaveIdempotenteDelClient = (
  chiave: unknown,
  scope?: AccountingScope,
) => {
  const testo = asText(chiave);
  if (!testo) return null;
  const utente = asText(scope?.userId) || "anonimo";

  /*
    **Non si taglia una chiave.**

    Tagliarla a 120 caratteri faceva collidere due richieste **diverse** che
    condividevano l'inizio: la seconda riceveva la prima, con 201 e l'importo
    sbagliato — cioe un movimento che non veniva registrato mentre l'API
    dichiarava successo. `source_event_key` e `text` e non ha limite, quindi
    il taglio non comprava niente.

    Una chiave troppo lunga si rifiuta, invece: e un errore del client, e
    dirlo costa meno che perdere una scrittura.
  */
  if (testo.length > 200) {
    throw new Error(
      "La chiave di idempotenza supera i 200 caratteri: accorciala, non verra tagliata",
    );
  }

  return `client:${utente}:${testo}`;
};

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
    /**
     * **La chiave che un client puo mandare, e che non puo occupare.**
     *
     * L'obiezione qui sopra e giusta: se il client scegliesse
     * `sourceEventKey` potrebbe **impedire** la registrazione di un movimento
     * legittimo, prendendone la chiave. Ma senza nessuna chiave un tentativo
     * ripetuto — una richiesta andata in timeout e rimandata — scrive il
     * movimento due volte, e sono soldi contati due volte.
     *
     * Misurato da un audit indipendente: cinque chiamate identiche
     * simultanee, cinque righe, **10.000 euro duplicati** su un affitto da
     * 2.500.
     *
     * La chiave del client vive percio in uno spazio dei nomi **suo**:
     * `client:<utente>:<chiave>`. Puo collidere solo con se stessa — che e
     * esattamente cio che serve — e non puo toccare le chiavi degli eventi di
     * dominio, che quel prefisso non ce l'hanno.
     */
    clientRequestKey?: unknown;
  },
) => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  /*
    Se il tentativo e gia stato scritto, si restituisce quello: un secondo
    invio della stessa richiesta non e un secondo movimento.
  */
  const chiaveDelClient = chiaveIdempotenteDelClient(
    options?.clientRequestKey,
    scope,
  );
  /**
   * Il movimento gia scritto con questa chiave, se c'e — e il confronto con
   * cio che si sta chiedendo adesso.
   *
   * Rispondere «fatto» a una richiesta **diversa** che riusa la chiave sarebbe
   * peggio di scriverla due volte: un operatore che corregge un importo e
   * rimanda si sentirebbe dire che ha funzionato, e il registro terrebbe il
   * numero sbagliato.
   */
  const giaScritto = async () => {
    if (!chiaveDelClient) return null;
    const gia = await (prisma as any).accountingEntry.findFirst({
      where: {
        organization_id: organizationId,
        source_event_key: chiaveDelClient,
        reversed_at: null,
      },
    });
    if (!gia) return null;

    const richiesti = resolveAmountCents(input);
    if (Number(gia.amount_cents) !== richiesti) {
      throw new Error(
        `Questa richiesta e gia stata registrata per ${(Number(gia.amount_cents) / 100).toFixed(2)} EUR: ` +
          "il movimento **non** e stato modificato. Per correggerlo, storna e registra di nuovo.",
      );
    }
    return gia;
  };

  const primaVolta = await giaScritto();
  if (primaVolta) return primaVolta;

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

  /*
    **Chi perde la corsa riceve il movimento, non un errore.**

    La lettura della chiave sta fuori dalla transazione, quindi cinque invii
    simultanei la superavano tutti e cinque e si infrangevano poi sull'indice
    unico. Il denaro restava giusto — una riga sola — ma quattro chiamanti
    ricevevano un 400 generico per una richiesta **riuscita**, e un client che
    rimanda su errore ne manderebbe altre.

    L'indice arbitra; qui si traduce il suo verdetto in cio che e successo
    davvero: il movimento c'e, ed e quello. E la stessa forma di
    `sport-work-agenda.ts`.
  */
  const scrivi = async () =>
    (prisma as any).$transaction(async (client: any) => {
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
        source_event_key:
          asText(options?.sourceEventKey) || chiaveDelClient || null,
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

  let row: any;
  try {
    row = await scrivi();
  } catch (errore: any) {
    const conflitto =
      String(errore?.code) === "P2002" ||
      /Unique constraint failed/i.test(String(errore?.message));
    const vinto = conflitto ? await giaScritto() : null;
    if (!vinto) throw errore;
    row = vinto;
  }

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

  /*
    **La guardia sta nella scrittura, non prima di essa** — e qui non ci stava.

    `reconcileAccountingEntry` era gia stata riscritta cosi, con il commento
    che spiega perche. Questa funzione no, e una sonda di concorrenza lo ha
    ottenuto **trenta volte su trenta**: lanciando insieme uno storno e una
    riclassificazione, la modifica leggeva la riga prima che lo storno
    confermasse, la trovava non stornata, e scriveva. L'originale finiva
    `commerciale` e il suo storno restava `istituzionale`.

    La coppia non si annullava piu **per voce**: nel rendiconto restavano
    settecentotrentacinque euro di uscita commerciale e altrettanti di entrata
    istituzionale, per movimenti che finanziariamente si compensano. La
    ripartizione fra istituzionale e commerciale e il numero da cui dipende il
    trattamento fiscale di una ASD, e si corrompeva in tutte e due le direzioni.

    Il rimedio non e un lock: e la condizione **dentro** l'`UPDATE`. Postgres
    valuta il `WHERE` sulla riga al momento della scrittura, quindi o la riga e
    ancora non stornata e l'aggiornamento avviene, o non lo e e non tocca
    niente — e allora si dice perche.
  */
  const aggiornate = await entryClient().updateMany({
    where: { id: originale.id, reversed_at: null },
    data: dati,
  });

  if (!aggiornate?.count) {
    throw new Error(
      "Un movimento stornato non si modifica: la coppia originale e storno racconta una correzione, e riscriverne una meta la rende illeggibile",
    );
  }

  const row = await entryClient().findUnique({
    where: { id: originale.id },
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
          /*
            **Lo storno cancella la spunta bancaria dell'originale.**

            `reconcileAccountingEntry` dichiara impossibile lo stato «stornato
            e riconciliato», e mette la sua guardia dentro l'`UPDATE` perche
            una riconciliazione non passi su una riga gia stornata. Ma la corsa
            ha due versi, e il secondo non era coperto: se la riconciliazione
            arriva **prima**, la riga risulta riconciliata, e lo storno che
            segue la lascia cosi. Una sonda di concorrenza lo ha ottenuto otto
            volte su otto.

            Non e un difetto di ordine, e di significato: uno storno dice «questo
            movimento non e mai avvenuto», e cio che non e avvenuto non puo
            essere stato visto sull'estratto conto. La spunta torna quindi dove
            stava, e l'operatore riconcilia la coppia — che nell'estratto conto,
            se il denaro si e mosso davvero, comparira come due righe.
          */
          reconciliation_status: "unreconciled",
          reconciled_at: null,
          reconciled_by: null,
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
