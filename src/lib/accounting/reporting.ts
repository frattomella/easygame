import {
  ACTIVITY_SCOPES,
  ACTIVITY_SCOPE_LABELS,
  RECONCILIATION_STATUSES,
  SOURCE_DOMAINS,
  SOURCE_DOMAIN_LABELS,
  toFiscalYearFilter,
  type AccountingLine,
  type AccountingSourceDomain,
  type ActivityScope,
  type ReconciliationStatus,
} from "./model";

/**
 * Il **riepilogo gestionale**: somme e raggruppamenti sulle righe di prima
 * nota, e niente altro.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM.
 * Riceve righe gia lette e restituisce aggregati. Chi le legge e
 * `src/lib/server/accounting-reports.ts`; chi le mostra e `src/app/reports/`.
 *
 * ---
 *
 * ## Il nome, e cio che non si puo dire
 *
 * Il titolo e **«Riepilogo gestionale»**. Non e il rendiconto che una ASD
 * deposita o conserva per obbligo, non e un bilancio, e nessun professionista
 * lo ha validato. Nessuna etichetta di questo modulo — e nessuna intestazione
 * o titolo di export costruito su di esse — contiene le parole «ufficiale»,
 * «conforme», «a norma» o «per il deposito» (§13 del piano). La regola non e
 * affidata alla buona volonta di chi scrive una stringa: `PAROLE_VIETATE` e
 * `assertNoOfficialClaim` la rendono verificabile, e un test la verifica.
 *
 * ## Le quattro grandezze, e perche non si sommano
 *
 * | Grandezza | Cosa e | Da dove |
 * |---|---|---|
 * | **incassato** | denaro entrato | righe `IN`, giroconti esclusi |
 * | **pagato** | denaro uscito | righe `OUT`, giroconti esclusi |
 * | **crediti** | denaro atteso | ledger delle rate, bandi |
 * | **debiti** | denaro maturato non erogato | lavoro sportivo |
 *
 * Le prime due sono **cassa** (finanziarie), le altre due **competenza**
 * (economiche). Il riepilogo le tiene in due oggetti distinti — `cash` e
 * `accrual` — e non esiste in questo modulo nessuna funzione che ne produca
 * un totale unico: e il difetto D-2 («Entrate» sommava cassa e dovuto), e
 * l'unico modo di non ripeterlo e non offrire il numero che lo produce.
 *
 * ## Il giroconto
 *
 * Un giroconto e **due** movimenti — un'uscita da un conto e un'entrata su un
 * altro — e la liquidita del club non cambia. Non e quindi ne un incasso ne un
 * pagamento, e resta fuori da `collectedCents` e `paidCents`. Non viene pero
 * nascosto: `transferInCents`, `transferOutCents` e `transferCount` lo
 * dichiarano, perche chi guarda il flusso finanziario di un conto deve vedere
 * il denaro che ne e uscito anche quando e finito in un altro conto suo.
 *
 * ## Nessuna formula duplicata
 *
 * Qui **non si calcola nessun saldo**. Il saldo di un conto ha un proprietario
 * — `deriveAccountBalanceCents` per la regola, `listFinancialAccountBalances`
 * per i dati — e questo modulo lo riceve gia fatto. Cio che raggruppa per
 * conto e il **flusso del periodo**, che e una grandezza diversa dal saldo e
 * si chiama con un altro nome apposta.
 */

/* ========================================================================== */
/* Il nome, e le parole che non si possono usare                               */
/* ========================================================================== */

export const MANAGEMENT_REPORT_TITLE = "Riepilogo gestionale";

/**
 * La riga che la pagina dichiara, e che accompagna ogni export.
 *
 * Dice cosa il documento **e** e cosa **non e**, in questo ordine: chi lo
 * legge deve capirlo prima di stampare il numero, non dopo.
 */
export const MANAGEMENT_REPORT_DISCLAIMER =
  "Riepilogo interno per cassa e competenza, calcolato sui dati registrati in EasyGame. Non sostituisce il rendiconto che la societa deposita o conserva, non e un bilancio e non e stato verificato da un professionista.";

/**
 * Le parole che nessuna etichetta di questo dominio puo contenere.
 *
 * Non sono un elenco di stile: sono quattro affermazioni che il prodotto non
 * puo fare, perche nessuno le ha verificate. Una sola di esse su
 * un'intestazione trasforma un promemoria interno in cio che il committente ha
 * vietato di far credere.
 */
export const PAROLE_VIETATE = [
  "ufficiale",
  "conforme",
  "a norma",
  "per il deposito",
] as const;

/**
 * Solleva se un testo destinato a un'intestazione o a un export rivendica una
 * validita che non ha.
 *
 * Il messaggio **non** contiene «Accesso negato»: non e un problema di
 * permessi, e mapparlo su un 403 manderebbe chi legge a cercare un errore nei
 * ruoli.
 */
export const assertNoOfficialClaim = (testo: string, dove = "etichetta") => {
  const normalizzato = String(testo || "").toLowerCase();
  const trovata = PAROLE_VIETATE.find((parola) => normalizzato.includes(parola));
  if (trovata) {
    throw new Error(
      `Il riepilogo gestionale non e un documento validato: «${trovata}» non puo comparire in ${dove}`,
    );
  }
  return testo;
};

/* ========================================================================== */
/* Cosa entra nel conto, e cosa no                                             */
/* ========================================================================== */

/**
 * Una riga **neutralizzata**: e stata stornata, oppure e lo storno di
 * un'altra.
 *
 * Escono entrambe, ed e la stessa regola di `deriveAccountBalanceCents`: la
 * coppia originale/storno somma zero, e tenerla dentro darebbe lo stesso
 * risultato con due righe in piu da spiegare a chi legge il rendiconto.
 */
export const isNeutralizedLine = (line: AccountingLine) =>
  Boolean(line.reversedAt) || line.sourceDomain === "REVERSAL";

/**
 * Vero se la riga e una gamba di giroconto.
 *
 * Il verso da solo non basta a riconoscerlo: una gamba `OUT` e indistinguibile
 * da un pagamento se non si guarda l'origine, ed e esattamente il modo in cui
 * il vecchio aggregatore dichiarava uscite che non erano uscite.
 */
export const isTransferLine = (line: AccountingLine) =>
  line.sourceDomain === "INTERNAL_TRANSFER";

/* ========================================================================== */
/* Il flusso di cassa                                                          */
/* ========================================================================== */

/**
 * **Cassa**: cio che e entrato e cio che e uscito, nel periodo.
 *
 * Tutti gli importi sono in centesimi interi, come sulla riga: il rendiconto e
 * il posto dove un arrotondamento di mezzo centesimo per riga diventa una
 * differenza visibile su mille righe.
 */
export type CashSummary = {
  /** Denaro entrato. Giroconti esclusi. */
  collectedCents: number;
  /** Denaro uscito. Giroconti esclusi. */
  paidCents: number;
  /** `collectedCents - paidCents`. E un saldo di **movimento**, non di conto. */
  netCents: number;
  /** Le gambe di giroconto in entrata. Non sono un incasso. */
  transferInCents: number;
  /** Le gambe di giroconto in uscita. Non sono un pagamento. */
  transferOutCents: number;
  transferCount: number;
  /** Righe considerate: giroconti compresi, righe neutralizzate escluse. */
  lineCount: number;
  /** Righe escluse perche stornate o perche storni. Si dichiarano. */
  neutralizedCount: number;
};

const CASH_ZERO: CashSummary = {
  collectedCents: 0,
  paidCents: 0,
  netCents: 0,
  transferInCents: 0,
  transferOutCents: 0,
  transferCount: 0,
  lineCount: 0,
  neutralizedCount: 0,
};

export const summarizeCash = (
  lines: readonly AccountingLine[] = [],
): CashSummary => {
  const totali = { ...CASH_ZERO };

  for (const line of lines) {
    if (isNeutralizedLine(line)) {
      totali.neutralizedCount += 1;
      continue;
    }

    const importo = Number(line.amountCents) || 0;
    totali.lineCount += 1;

    if (isTransferLine(line)) {
      totali.transferCount += 1;
      if (line.direction === "IN") totali.transferInCents += importo;
      else totali.transferOutCents += importo;
      continue;
    }

    if (line.direction === "IN") totali.collectedCents += importo;
    else totali.paidCents += importo;
  }

  totali.netCents = totali.collectedCents - totali.paidCents;
  return totali;
};

/* ========================================================================== */
/* Competenza: crediti e debiti                                                */
/* ========================================================================== */

/**
 * **Competenza**: denaro atteso e denaro dovuto.
 *
 * Nessuno di questi numeri si ricava dalle righe di prima nota, e non e un
 * limite: sono di altri domini, che li calcolano gia. Arrivano qui gia
 * calcolati proprio perche questo modulo non li ricalcoli — ognuno porta il
 * nome del suo proprietario in `ACCRUAL_OWNERS`.
 */
export type AccrualSummary = {
  /** Residuo delle rate delle famiglie. Proprietario: il ledger delle rate. */
  familyReceivablesCents: number;
  /**
   * Quanto le famiglie hanno versato **in piu** del dovuto.
   *
   * Il residuo non puo essere negativo — una rata da 300 pagata 500 lascia
   * residuo zero — e senza questo campo l identita «dovuto = incassato +
   * storico + residuo» si rompeva dalla parte opposta, per un importo che
   * nessun numero del rendiconto nominava. E denaro che il club tiene per
   * conto della famiglia: non e ricavo e non e un credito.
   */
  familyCreditCents: number;
  /** La parte di quel residuo gia scaduta. */
  overdueReceivablesCents: number;
  overdueCount: number;
  /** Maturato e non ancora liquidato dagli enti. Proprietario: i bandi. */
  /**
   * **Il denaro incassato prima che il registro esistesse.**
   *
   * Sono le rate che risultano saldate e **non hanno nessun incasso** a
   * dimostrarlo: righe anteriori al registro degli incassi (ADR-0036), dove il
   * ledger conserva per compatibilita la lettura «pagata = incassata per
   * intero». Toglierla cancellerebbe denaro davvero ricevuto (RC FIX 3).
   *
   * **Perche e un numero a se, e perche l'audit lo ha preteso.** Quel denaro
   * non compare fra i crediti — la rata e saldata — e non puo comparire nella
   * cassa del periodo, perche non esiste nessun fatto finanziario con una data,
   * un conto e un importo da mostrare. Senza dichiararlo, il rendiconto **non
   * chiude**: dovuto meno incassato meno residuo lasciava una differenza muta,
   * e su un club appena migrato quella differenza e l'intero storico.
   *
   * Dichiararlo e l'unica cosa onesta: e la stessa scelta del saldo di apertura
   * dei conti, che conserva un numero senza inventarne i movimenti.
   */
  legacyCollectedCents: number;
  fundingPendingCents: number;
  /** Maturato e non ancora erogato alle persone. Proprietario: lavoro sportivo. */
  sportWorkAccruedUnpaidCents: number;
};

export const ACCRUAL_ZERO: AccrualSummary = {
  familyReceivablesCents: 0,
  familyCreditCents: 0,
  overdueReceivablesCents: 0,
  overdueCount: 0,
  legacyCollectedCents: 0,
  fundingPendingCents: 0,
  sportWorkAccruedUnpaidCents: 0,
};

/* ========================================================================== */
/* I raggruppamenti                                                            */
/* ========================================================================== */

/**
 * Un gruppo del riepilogo.
 *
 * Porta **sempre** entrambi i versi, anche quando uno dei due e zero: una voce
 * che mostra solo il totale netto nasconde una causale su cui sono passati
 * diecimila euro in entrata e diecimila in uscita.
 */
export type ReportGroup = {
  key: string;
  label: string;
  inCents: number;
  outCents: number;
  netCents: number;
  lineCount: number;
};

type GroupPicker = (line: AccountingLine) => { key: string; label: string };

const raggruppa = (
  lines: readonly AccountingLine[],
  scegli: GroupPicker,
  { includeTransfers = false }: { includeTransfers?: boolean } = {},
): ReportGroup[] => {
  const gruppi = new Map<string, ReportGroup>();

  for (const line of lines) {
    if (isNeutralizedLine(line)) continue;
    if (!includeTransfers && isTransferLine(line)) continue;

    const { key, label } = scegli(line);
    const gruppo = gruppi.get(key) || {
      key,
      label,
      inCents: 0,
      outCents: 0,
      netCents: 0,
      lineCount: 0,
    };

    const importo = Number(line.amountCents) || 0;
    if (line.direction === "IN") gruppo.inCents += importo;
    else gruppo.outCents += importo;
    gruppo.netCents = gruppo.inCents - gruppo.outCents;
    gruppo.lineCount += 1;

    gruppi.set(key, gruppo);
  }

  /*
    L'ordine e per valore assoluto decrescente e non alfabetico: chi apre un
    rendiconto cerca le voci che pesano, e trovarle in fondo a un elenco
    ordinato per nome e il motivo per cui nessuno lo scorre.
  */
  return [...gruppi.values()].sort(
    (a, b) =>
      Math.abs(b.inCents) + Math.abs(b.outCents) -
      (Math.abs(a.inCents) + Math.abs(a.outCents)),
  );
};

const SENZA_CAUSALE = "Senza causale";
const SENZA_CONTO = "Senza conto";
const SENZA_VOCE = "Senza voce di rendiconto";

/** Per causale. Il giroconto non ne ha una, e resta fuori. */
export const groupByOperationType = (lines: readonly AccountingLine[] = []) =>
  raggruppa(lines, (line) => ({
    key: line.operationTypeCode || "",
    label: line.operationTypeLabel || line.operationTypeCode || SENZA_CAUSALE,
  }));

/**
 * Per **voce di rendiconto** (`reporting_bucket`).
 *
 * La voce non sta sulla riga: sta sulla causale, che e configurazione del
 * club. Arriva quindi come mappa `codice -> voce`, e non viene dedotta —
 * dedurla vorrebbe dire che questo modulo decide una classificazione, che e
 * esattamente cio che il §15 vieta.
 */
export const groupByReportingBucket = (
  lines: readonly AccountingLine[] = [],
  bucketByOperationType: Readonly<Record<string, string | null>> = {},
) =>
  raggruppa(lines, (line) => {
    const voce = line.operationTypeCode
      ? bucketByOperationType[line.operationTypeCode] || null
      : null;
    return { key: voce || "", label: voce || SENZA_VOCE };
  });

/**
 * Per conto, **flusso del periodo**.
 *
 * Non e il saldo del conto e non deve essere chiamato cosi: il saldo parte da
 * un'apertura e somma tutta la storia, questo somma solo il periodo filtrato.
 * I giroconti entrano, perche sul singolo conto il denaro si e mosso davvero.
 */
export const groupFlowsByAccount = (lines: readonly AccountingLine[] = []) =>
  raggruppa(
    lines,
    (line) => ({
      key: line.financialAccountId || "",
      label: line.financialAccountName || SENZA_CONTO,
    }),
    { includeTransfers: true },
  );

/** Per mese, chiave `YYYY-MM`, in ordine cronologico. */
export const groupByMonth = (lines: readonly AccountingLine[] = []) =>
  raggruppa(lines, (line) => {
    const chiave = String(line.entryDate || "").slice(0, 7);
    return { key: chiave, label: chiave };
  }).sort((a, b) => a.key.localeCompare(b.key));

/** Per origine: quanto viene dalla prima nota e quanto dai domini. */
export const groupBySourceDomain = (lines: readonly AccountingLine[] = []) =>
  raggruppa(
    lines,
    (line) => ({
      key: line.sourceDomain,
      label: SOURCE_DOMAIN_LABELS[line.sourceDomain] || line.sourceDomain,
    }),
    { includeTransfers: true },
  );

/* ========================================================================== */
/* Istituzionale, commerciale, e cio che nessuno ha classificato               */
/* ========================================================================== */

/**
 * Il raggruppamento per classificazione, **con il non classificato dichiarato**.
 *
 * E il punto che vale di piu di tutto il modulo (§15). Un club che legge
 * «istituzionale 12.400, commerciale 3.100, **non classificato 22.700**»
 * capisce che deve configurare le causali. Un club che legge solo i primi due
 * numeri crede di avere un rendiconto.
 *
 * Da qui discendono due scelte che sembrano dettagli e non lo sono:
 *
 * 1. `groups` contiene **sempre tutti e tre** gli scope, anche a zero, e nello
 *    stesso ordine del catalogo. Una superficie che itera l'elenco non puo
 *    quindi far sparire «non classificato» semplicemente perche non ha righe,
 *    ne mostrarlo in una posizione diversa a seconda dei totali;
 * 2. il conteggio delle righe `unspecified` e un campo di primo livello, non
 *    una voce da cercare dentro `groups`: chi disegna la pagina lo trova sulla
 *    strada, e non deve decidere di andarlo a prendere.
 */
export type ActivityScopeBreakdown = {
  groups: Array<ReportGroup & { scope: ActivityScope }>;
  /** Quante righe nessuno ha classificato. **Si dichiara, non si nasconde.** */
  unspecifiedLineCount: number;
  unspecifiedInCents: number;
  unspecifiedOutCents: number;
  classifiedLineCount: number;
  /** Vero quando c'e almeno una riga non classificata: la pagina deve dirlo. */
  hasUnclassified: boolean;
    /** Quanto **denaro** non e attribuito, sul denaro che si muove. */
  unspecifiedShare: number;
  /** La stessa quota misurata sulle **righe**: dice quante correzioni servono. */
  unspecifiedLineShare: number;
};

export const groupByActivityScope = (
  lines: readonly AccountingLine[] = [],
): ActivityScopeBreakdown => {
  const perScope = new Map(
    raggruppa(lines, (line) => ({
      key: line.activityScope,
      label: ACTIVITY_SCOPE_LABELS[line.activityScope] || line.activityScope,
    })).map((gruppo) => [gruppo.key, gruppo]),
  );

  const groups = ACTIVITY_SCOPES.map((scope) => {
    const gruppo = perScope.get(scope);
    return {
      scope,
      key: scope,
      label: ACTIVITY_SCOPE_LABELS[scope],
      inCents: gruppo?.inCents || 0,
      outCents: gruppo?.outCents || 0,
      netCents: gruppo?.netCents || 0,
      lineCount: gruppo?.lineCount || 0,
    };
  });

  const nonClassificato = groups.find((gruppo) => gruppo.scope === "unspecified")!;
  const totale = groups.reduce((somma, gruppo) => somma + gruppo.lineCount, 0);

  /*
    **La quota non classificata si misura in denaro, non in righe.**

    Contarla sulle righe la rende irriconoscibile: un audit su una stagione
    vera ha misurato **il 67% delle uscite** senza classificazione, e il
    prodotto dichiarava **3,1%** — perche quelle uscite erano sei righe grosse
    su centonovantacinque. Un presidente legge tre per cento e conclude che il
    catalogo e configurato.

    Le righe restano, perche dicono quante correzioni servono; ma la
    percentuale che si mostra accanto al numero e quella del denaro, che e la
    domanda vera: **quanto** del bilancio non e attribuito.
  */
  const denaroDi = (gruppo: (typeof groups)[number]) =>
    gruppo.inCents + gruppo.outCents;
  const denaroTotale = groups.reduce((somma, gruppo) => somma + denaroDi(gruppo), 0);
  const denaroNonClassificato = denaroDi(nonClassificato);

  return {
    groups,
    unspecifiedLineCount: nonClassificato.lineCount,
    unspecifiedInCents: nonClassificato.inCents,
    unspecifiedOutCents: nonClassificato.outCents,
    classifiedLineCount: totale - nonClassificato.lineCount,
    hasUnclassified: nonClassificato.lineCount > 0,
    /** Quanto **denaro** non e attribuito, sul denaro che si muove. */
    unspecifiedShare:
      denaroTotale > 0 ? denaroNonClassificato / denaroTotale : 0,
    /** La quota calcolata sulle **righe**: dice quante correzioni servono. */
    unspecifiedLineShare: totale > 0 ? nonClassificato.lineCount / totale : 0,
  };
};

/* ========================================================================== */
/* I due assi: anno fiscale e stagione                                         */
/* ========================================================================== */

/**
 * I filtri del riepilogo, gia normalizzati.
 *
 * `fiscalYear` e `seasonId` sono **due assi diversi e indipendenti**, ed e il
 * requisito del §14: la stagione 2026/27 contiene movimenti del 2026 e del
 * 2027, e il riepilogo fiscale del 2026 prende solo i primi. Sono due domande,
 * e il prodotto risponde a tutte e due.
 */
export type ReportingFilters = {
  from?: string | null;
  to?: string | null;
  fiscalYear?: number | null;
  seasonId?: string | null;
  financialAccountId?: string | null;
  operationTypeCode?: string | null;
  siteId?: string | null;
  direction?: "IN" | "OUT" | null;
  activityScope?: ActivityScope | null;
  /**
   * **I tre filtri che il riepilogo non conosceva** (W4-B2).
   *
   * L'elenco della prima nota li offriva e il riepilogo no: chi filtrava per
   * «da riconciliare» leggeva un elenco di poche righe sotto **totali che
   * coprivano ancora tutto il periodo**. La superficie lo dichiarava, ed era
   * meglio di tacerlo — ma la risposta giusta e che i due numeri parlino della
   * stessa cosa.
   */
  sourceDomain?: AccountingSourceDomain | null;
  reconciliationStatus?: ReconciliationStatus | null;
  search?: string | null;
};

const testo = (value: unknown) => String(value ?? "").trim();

/**
 * Normalizza cio che arriva da una query string.
 *
 * **`toFiscalYearFilter` non e opzionale qui.** `Number(null)` non e `NaN`: e
 * `0`, ed e un intero. Un filtro scritto come
 * `Number.isInteger(Number(anno)) ? { fiscalYear: Number(anno) } : {}` passa i
 * test — che passano `undefined` — e in produzione filtra `fiscalYear = 0`,
 * cioe risponde **elenco vuoto** a chiunque non chieda un anno esplicito,
 * perche `searchParams.get()` restituisce `null` quando il parametro manca.
 * E un difetto trovato a runtime con duemila test verdi, e non si ripete.
 */
export const normalizeReportingFilters = (
  raw: Record<string, unknown> = {},
): ReportingFilters => {
  const verso = testo(raw.direction).toUpperCase();
  const scope = testo(raw.activityScope).toLowerCase();
  const origine = testo(raw.sourceDomain).toUpperCase();
  const riconciliazione = testo(raw.reconciliationStatus).toLowerCase();

  return {
    from: testo(raw.from) || null,
    to: testo(raw.to) || null,
    fiscalYear: toFiscalYearFilter(raw.fiscalYear),
    seasonId: testo(raw.seasonId) || null,
    financialAccountId: testo(raw.financialAccountId) || null,
    operationTypeCode: testo(raw.operationTypeCode) || null,
    siteId: testo(raw.siteId) || null,
    direction: verso === "IN" || verso === "OUT" ? verso : null,
    activityScope: (ACTIVITY_SCOPES as readonly string[]).includes(scope)
      ? (scope as ActivityScope)
      : null,
    sourceDomain: (SOURCE_DOMAINS as readonly string[]).includes(origine)
      ? (origine as AccountingSourceDomain)
      : null,
    reconciliationStatus: (RECONCILIATION_STATUSES as readonly string[]).includes(
      riconciliazione,
    )
      ? (riconciliazione as ReconciliationStatus)
      : null,
    /*
      La ricerca si normalizza **una volta sola**, qui, e non a ogni riga: un
      `toLowerCase()` dentro il filtro costerebbe quanto le righe, e su un
      riepilogo di un anno le righe sono migliaia.
    */
    /*
      **Il testo cercato non si abbassa qui.**

      Il rendiconto legge le stesse righe dell'elenco, e l'elenco lo filtra il
      database: da quando lo fa con `ILIKE`, abbassare prima con
      `toLowerCase()` di JavaScript rimetteva in mezzo proprio la differenza
      che si era tolta. Misurato: cercando `ΟΔΟΣ` l'elenco trovava la riga e
      il **rendiconto no** — cioe le due superfici raccontavano due insiemi
      diversi sotto la stessa parola, che e l'invariante dichiarata a monte di
      `buildAccountingReport`.
    */
    search: testo(raw.search) || null,
  };
};

/**
 * Applica i filtri alle righe gia lette.
 *
 * Serve alle superfici e ai confronti fra periodi, che partono da un insieme
 * gia caricato e non possono tornare al database per ogni taglio. I filtri che
 * il servizio ha gia applicato restano idempotenti: riapplicarli non cambia
 * niente.
 */
export const filterLinesForReport = (
  lines: readonly AccountingLine[] = [],
  filters: ReportingFilters = {},
): AccountingLine[] => {
  const da = filters.from ? Date.parse(filters.from) : null;
  /*
    Una data nuda in fondo a un intervallo comprende **tutto** quel giorno,
    come in `normalizzaFiltri`: qui restava mezzanotte, e l'ultimo giorno
    spariva da ogni superficie che passa di qua.
  */
  const a = filters.to
    ? Date.parse(filters.to) +
      (/^\d{4}-\d{2}-\d{2}$/.test(filters.to) ? 24 * 60 * 60 * 1000 - 1 : 0)
    : null;

  return lines.filter((line) => {
    const quando = Date.parse(line.entryDate);
    if (da !== null && !Number.isNaN(da) && quando < da) return false;
    if (a !== null && !Number.isNaN(a) && quando > a) return false;
    /*
      Il confronto e con `null` esplicito e non con la verita di JavaScript:
      l'anno 0 non esiste in questo dominio, ma un filtro che si fidasse di
      `if (filters.fiscalYear)` tornerebbe ad essere il difetto che
      `toFiscalYearFilter` chiude.
    */
    if (filters.fiscalYear !== null && filters.fiscalYear !== undefined) {
      if (line.fiscalYear !== filters.fiscalYear) return false;
    }
    if (filters.seasonId && (line.seasonId || null) !== filters.seasonId) {
      return false;
    }
    if (
      filters.financialAccountId &&
      line.financialAccountId !== filters.financialAccountId
    ) {
      return false;
    }
    if (
      filters.operationTypeCode &&
      (line.operationTypeCode || null) !== filters.operationTypeCode
    ) {
      return false;
    }
    if (filters.siteId && (line.siteId || null) !== filters.siteId) return false;
    if (filters.sourceDomain && line.sourceDomain !== filters.sourceDomain) {
      return false;
    }
    if (
      filters.reconciliationStatus &&
      line.reconciliationStatus !== filters.reconciliationStatus
    ) {
      return false;
    }
    if (filters.search) {
      /*
        Gli stessi campi che l'elenco cerca, nello stesso ordine: due ricerche
        che guardassero campi diversi darebbero due insiemi diversi sotto la
        stessa parola, ed e peggio di non cercare affatto.
      */
      const testoRiga = [
        line.description,
        line.counterpartyLabel,
        line.operationTypeLabel,
        line.operationTypeCode,
        line.notes,
        line.bankReference,
      ]
        .filter(Boolean)
        .join(" ");
      /*
        Qui il confronto e in memoria e non puo chiedere a Postgres di
        abbassare: si abbassano **entrambi i lati** con la stessa funzione,
        che e la sola cosa che rende il confronto simmetrico.
      */
      if (
        !testoRiga.toLowerCase().includes(String(filters.search).toLowerCase())
      ) {
        return false;
      }
    }
    if (filters.direction && line.direction !== filters.direction) return false;
    if (filters.activityScope && line.activityScope !== filters.activityScope) {
      return false;
    }
    return true;
  });
};

/* ========================================================================== */
/* Il riepilogo, e il confronto fra due periodi                                */
/* ========================================================================== */

export type PeriodBreakdown = {
  cash: CashSummary;
  byOperationType: ReportGroup[];
  byReportingBucket: ReportGroup[];
  byAccount: ReportGroup[];
  byMonth: ReportGroup[];
  bySourceDomain: ReportGroup[];
  byActivityScope: ActivityScopeBreakdown;
};

export const buildPeriodBreakdown = (
  lines: readonly AccountingLine[] = [],
  bucketByOperationType: Readonly<Record<string, string | null>> = {},
): PeriodBreakdown => ({
  cash: summarizeCash(lines),
  byOperationType: groupByOperationType(lines),
  byReportingBucket: groupByReportingBucket(lines, bucketByOperationType),
  byAccount: groupFlowsByAccount(lines),
  byMonth: groupByMonth(lines),
  bySourceDomain: groupBySourceDomain(lines),
  byActivityScope: groupByActivityScope(lines),
});

/**
 * Il confronto fra due periodi, **solo su grandezze omogenee**.
 *
 * Confronta cassa con cassa. Non esiste una variazione «entrate contro
 * crediti», perche non e una variazione: sono due grandezze diverse, e
 * metterle nella stessa differenza e la forma aritmetica del difetto D-2.
 *
 * `share` e `null` quando il periodo di riferimento vale zero: una variazione
 * percentuale su zero non e «+100%», e non e nemmeno infinito — e una domanda
 * senza risposta, e il posto giusto per dirlo e il dato, non la pagina.
 */
export type CashDelta = {
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  /** Variazione relativa, o `null` se il periodo precedente vale zero. */
  share: number | null;
};

const delta = (corrente: number, precedente: number): CashDelta => ({
  currentCents: corrente,
  previousCents: precedente,
  deltaCents: corrente - precedente,
  share: precedente === 0 ? null : (corrente - precedente) / Math.abs(precedente),
});

export type PeriodComparison = {
  collected: CashDelta;
  paid: CashDelta;
  net: CashDelta;
};

export const compareCashPeriods = (
  current: CashSummary,
  previous: CashSummary,
): PeriodComparison => ({
  collected: delta(current.collectedCents, previous.collectedCents),
  paid: delta(current.paidCents, previous.paidCents),
  net: delta(current.netCents, previous.netCents),
});

/* ========================================================================== */
/* La dashboard economica: ogni riquadro dichiara il suo proprietario          */
/* ========================================================================== */

/**
 * La **grandezza** di un riquadro.
 *
 * Non e una decorazione: e cio che decide in quale riga di totali il numero
 * puo comparire. Cassa e crediti non stanno mai nella stessa riga (§28), e la
 * superficie ottiene la separazione raggruppando su questo campo invece che
 * ricordandosene.
 */
export type KpiQuantity = "finanziaria" | "economica";

export type KpiDefinition = {
  key: string;
  label: string;
  quantity: KpiQuantity;
  /** Chi possiede il numero. Il percorso del modulo, non una parafrasi. */
  owner: string;
  /** Cosa misura, in una frase che si puo mostrare accanto al numero. */
  definition: string;
};

/**
 * **I riquadri della dashboard economica, con la loro definizione.**
 *
 * Il brief impone che nessun numero sia duplicato e che ogni riquadro dichiari
 * il proprio proprietario. Qui il proprietario e scritto, non implicito: se
 * domani due schermate mostrano lo stesso numero, la domanda «chi lo calcola»
 * ha una riga a cui rispondere.
 *
 * **«Debiti verso fornitori» non c'e**, e la sua assenza e una decisione: il
 * prodotto non ha un ciclo passivo, e un riquadro sempre a zero suggerirebbe
 * che il club non ha debiti invece che «EasyGame non lo sa».
 */
export const DASHBOARD_KPIS: readonly KpiDefinition[] = [
  {
    key: "accountBalances",
    label: "Saldo cassa e banca",
    quantity: "finanziaria",
    owner: "src/lib/server/financial-accounts.ts",
    definition:
      "Denaro disponibile sui conti oggi: saldo di apertura piu tutti i movimenti registrati, storni esclusi. E derivato, non memorizzato, e non dipende dal periodo filtrato.",
  },
  {
    key: "collected",
    label: "Incassato nel periodo",
    quantity: "finanziaria",
    owner: "src/lib/server/accounting.ts",
    definition:
      "Denaro entrato con la data del movimento, nel periodo filtrato. Le gambe di giroconto sono escluse: spostare denaro fra due conti propri non e un incasso.",
  },
  {
    key: "paid",
    label: "Pagato nel periodo",
    quantity: "finanziaria",
    owner: "src/lib/server/accounting.ts",
    definition:
      "Denaro uscito con la data del movimento, nel periodo filtrato. Le gambe di giroconto sono escluse per la stessa ragione.",
  },
  {
    key: "familyReceivables",
    label: "Crediti verso le famiglie",
    quantity: "economica",
    owner: "src/lib/payments/installment-ledger.ts",
    definition:
      "Residuo delle rate non annullate: dovuto meno incassato. Non e denaro disponibile e non si somma all'incassato.",
  },
  {
    key: "overdueReceivables",
    label: "Insoluti",
    quantity: "economica",
    owner: "src/lib/payments/installment-ledger.ts",
    definition:
      "La parte del credito verso le famiglie la cui scadenza e gia passata. E un sottoinsieme dei crediti, non una voce che vi si aggiunge.",
  },
  {
    key: "fundingPending",
    label: "Contributi da ricevere",
    quantity: "economica",
    owner: "src/lib/funding/funding-model.ts",
    definition:
      "Maturato dai bandi e non ancora liquidato dall'ente: `pendingSettlementAmount`. Diventa cassa il giorno del bonifico, non prima.",
  },
  {
    key: "sportWorkAccruedUnpaid",
    label: "Compensi da pagare",
    quantity: "economica",
    owner: "src/lib/sport-work/plan.ts",
    definition:
      "Maturato verso i lavoratori sportivi e non ancora erogato: `accruedUnpaid`. E il debito vero del club verso le persone.",
  },
];

/** I riquadri di una grandezza. La separazione visiva **e** questa. */
export const kpisByQuantity = (quantity: KpiQuantity) =>
  DASHBOARD_KPIS.filter((kpi) => kpi.quantity === quantity);

export const findKpi = (key: string) =>
  DASHBOARD_KPIS.find((kpi) => kpi.key === key) || null;

/* ========================================================================== */
/* Il riepilogo completo                                                       */
/* ========================================================================== */

/**
 * Il riepilogo gestionale, nella forma in cui la rotta lo restituisce.
 *
 * `cash` e `accrual` sono due campi distinti e restano tali fino alla
 * schermata. Non c'e un `total`, e non deve nascerne uno.
 */
export type ManagementReport = {
  title: typeof MANAGEMENT_REPORT_TITLE;
  disclaimer: typeof MANAGEMENT_REPORT_DISCLAIMER;
  filters: ReportingFilters;
  cash: CashSummary;
  accrual: AccrualSummary;
  breakdown: PeriodBreakdown;
  comparison: PeriodComparison | null;
  kpis: readonly KpiDefinition[];
};

export const buildManagementReport = ({
  lines,
  filters = {},
  accrual = ACCRUAL_ZERO,
  bucketByOperationType = {},
  previousLines = null,
}: {
  lines: readonly AccountingLine[];
  filters?: ReportingFilters;
  accrual?: AccrualSummary;
  bucketByOperationType?: Readonly<Record<string, string | null>>;
  previousLines?: readonly AccountingLine[] | null;
}): ManagementReport => {
  const breakdown = buildPeriodBreakdown(lines, bucketByOperationType);

  return {
    title: MANAGEMENT_REPORT_TITLE,
    disclaimer: MANAGEMENT_REPORT_DISCLAIMER,
    filters,
    cash: breakdown.cash,
    accrual,
    breakdown,
    comparison: previousLines
      ? compareCashPeriods(breakdown.cash, summarizeCash(previousLines))
      : null,
    kpis: DASHBOARD_KPIS,
  };
};
