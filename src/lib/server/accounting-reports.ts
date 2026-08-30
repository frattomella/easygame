import { prisma } from "./prisma";
import {
  readAccountingAggregationLines,
  resolveAccountingScopeId,
  type AccountingScope,
} from "./accounting";
import {
  canReadAccountBalances,
  listFinancialAccountBalances,
  type FinancialAccountBalance,
} from "./financial-accounts";
import { listOperationTypes } from "./fiscal-config";
import { assertAccountingPermission } from "@/lib/accounting/permissions";
import { toCents } from "@/lib/accounting/model";
import {
  ACCRUAL_ZERO,
  buildManagementReport,
  normalizeReportingFilters,
  type AccrualSummary,
  type ManagementReport,
  type ReportingFilters,
} from "@/lib/accounting/reporting";
import {
  buildInstallmentLedgers,
  summarizeLedgers,
} from "@/lib/payments/installment-ledger";
import { summarizeFunding } from "@/lib/funding/funding-model";
import { summarizePlanProgress } from "@/lib/sport-work/plan";

/**
 * Il **riepilogo gestionale**, assemblato dalle fonti che gia lo possiedono.
 *
 * Questo modulo non calcola quasi niente: legge, e passa a chi sa contare.
 * L'aritmetica sta in `src/lib/accounting/reporting.ts`, che e puro e
 * testabile senza database; i numeri di competenza li producono i moduli dei
 * loro domini — il ledger delle rate, i bandi, il lavoro sportivo — chiamati
 * per nome invece che riscritti.
 *
 * ---
 *
 * ## Le quattro sorgenti, e chi le possiede
 *
 * | Numero | Chi lo calcola |
 * |---|---|
 * | Righe di prima nota, proiezioni comprese | `listAccountingEntries` |
 * | Saldo dei conti | `listFinancialAccountBalances` |
 * | Crediti e insoluti delle famiglie | `summarizeLedgers` |
 * | Contributi da ricevere | `summarizeFunding` |
 * | Compensi da pagare | `summarizePlanProgress` |
 *
 * Nessuno di questi numeri viene ricalcolato qui. E la regola del §28 — «nessuna
 * schermata calcola un numero che un'altra gia calcola» — applicata al modulo
 * che avrebbe avuto piu occasioni di violarla.
 *
 * ## Cassa e competenza non si sommano
 *
 * I saldi e i movimenti sono **finanziari**; crediti, insoluti, contributi
 * attesi e compensi maturati sono **economici**. Il riepilogo li porta in due
 * campi distinti e non offre nessun totale che li unisca: e il difetto D-2
 * («Entrate» sommava cassa e dovuto), e il modo di non ripeterlo e non
 * esporre il numero che lo produce.
 *
 * ## I crediti non hanno un periodo
 *
 * Il filtro per date, anno fiscale e stagione agisce sulle **righe di prima
 * nota**. I crediti aperti no, e non e una dimenticanza: «quanto mi devono
 * ancora le famiglie» e una domanda sul presente, non su un intervallo. Un
 * credito filtrato per «ultimi 30 giorni» mostrerebbe una frazione arbitraria
 * di un debito che esiste per intero. La risposta porta `accrualScope: "club"`
 * perche la pagina lo possa dire invece di lasciarlo intuire.
 */

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Il riepilogo non sfoglia: **chiede una volta**.
 *
 * Sfogliava, e a caro prezzo. `listAccountingEntries` serve al massimo 500
 * righe per chiamata — e la difesa giusta per un elenco che si scorre — e il
 * riepilogo di un anno le raccoglieva chiamandola fino a quaranta volte. Ma
 * ognuna di quelle quaranta **ricostruiva il registro intero** per restituirne
 * cinquecento righe: su 35.000 righe il riepilogo costava 110 secondi, contro
 * una soglia di due.
 *
 * Adesso `readAllAccountingLines` fa una lettura sola sulla vista. Il tetto
 * resta, e serve ancora a fermare un club fuori scala: oltre, la risposta dice
 * `truncated: true`, che e cio che si puo dire di onesto. Un riepilogo
 * silenziosamente parziale sarebbe peggio di un errore.
 */
const leggiTutteLeRighe = (
  filtri: Record<string, unknown>,
  scope: AccountingScope,
) => readAccountingAggregationLines(filtri, scope);

/* ========================================================================== */
/* La competenza: crediti e debiti, letti dai loro proprietari                  */
/* ========================================================================== */

/**
 * I quattro numeri di competenza del club.
 *
 * Ogni lettura porta il suo `organization_id`, anche dopo che il confine e
 * gia stato verificato: e la regola del repository, e vale perche il giorno in
 * cui questa funzione viene chiamata da un altro punto il filtro c'e comunque.
 */
export const readAccrualSummary = async (
  organizationId: string,
  now = new Date(),
): Promise<AccrualSummary> => {
  const id = asText(organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const [rate, incassi, maturazioni, righeLiquidate, scadenzeCompensi] =
    await Promise.all([
      (prisma as any).athletePayment.findMany({ where: { organization_id: id } }),
      (prisma as any).paymentTransaction.findMany({
        where: { organization_id: id },
      }),
      (prisma as any).fundingAccrual.findMany({ where: { organization_id: id } }),
      (prisma as any).fundingSettlementLine.findMany({
        where: { organization_id: id },
      }),
      (prisma as any).sportWorkInstallment.findMany({
        where: { organization_id: id },
      }),
    ]);

  /*
    Il residuo delle rate lo sa `summarizeLedgers`, che lo ricava dal registro
    degli incassi: lo stato di una rata non si legge, si deriva (ADR-0036).
    Sommare qui `amount - paid` a mano sarebbe la seconda implementazione della
    regola piu delicata del prodotto.
  */
  const registri = buildInstallmentLedgers({
    charges: rate || [],
    transactions: incassi || [],
    now,
  });
  const rateTotali = summarizeLedgers(registri);

  /*
    **Il denaro incassato prima che il registro esistesse.**

    Una rata saldata **senza nessun incasso** a dimostrarlo: il ledger la conta
    come pagata per compatibilita, perche toglierla cancellerebbe denaro
    davvero ricevuto (RC FIX 3). Ma non ha un fatto finanziario da proiettare,
    quindi non compare nella cassa del periodo, e non compare fra i crediti
    perche e saldata.

    Senza dichiararla il rendiconto **non chiude**, e l'audit lo ha misurato:
    su due rate — 100 con 50 incassati davvero, 200 saldate senza registro — la
    risposta diceva incassato 50 e crediti 50 su un dovuto di 300, e i 200
    mancanti non li nominava nessuno. Su un club appena migrato quella
    differenza e l'intero storico.

    Non si somma alla cassa: e denaro senza data, senza conto e senza prova.
    Si dichiara accanto.
  */
  const incassatoStorico = registri.reduce(
    (somma: number, registro: any) =>
      registro.transactions.length === 0 && registro.state === "paid"
        ? somma + (Number(registro.paidAmount) || 0)
        : somma,
    0,
  );

  /*
    `summarizeFunding` vuole un assegnato, che qui non serve: il riepilogo
    guarda una societa intera e non un beneficiario, e l'unico numero che
    legge e `pendingSettlementAmount` — maturato meno liquidato. Passare zero
    rende `residualAmount` privo di senso, e infatti non viene letto.
  */
  const bandi = summarizeFunding({
    assignedAmount: 0,
    accruals: maturazioni || [],
    settlementLines: righeLiquidate || [],
  });

  const compensi = summarizePlanProgress(
    (scadenzeCompensi || []).map((riga: any) => ({
      gross_amount: Number(riga.gross_amount) || 0,
      accrued_amount: Number(riga.accrued_amount) || 0,
      paid_amount: Number(riga.paid_amount) || 0,
      status: riga.cancelled ? "CANCELLED" : String(riga.status || ""),
    })),
  );

  /*
    **Il denaro incassato in piu ha un nome.**

    `residualAmount` e il residuo **dovuto**, e non puo essere negativo: una
    rata da 300 pagata 500 lascia residuo zero, non meno duecento. E giusto —
    ma allora l'identita che il rendiconto dichiara, «dovuto = incassato +
    storico + residuo», si rompe dalla parte opposta: incassato piu residuo
    supera il dovuto di duecento euro, e nessun campo li nomina.

    Duecento euro che il club **tiene per conto della famiglia**. Non sono
    ricavo, non sono un credito, e non erano da nessuna parte: adesso sono un
    numero con un'etichetta, e l'identita torna a chiudere.
  */
  const eccedenzaFamiglie = registri.reduce(
    (somma: number, riga: any) =>
      somma + Math.max(0, Number(riga.paidAmount) - Number(riga.dueAmount)),
    0,
  );

  return {
    familyReceivablesCents: toCents(rateTotali.residualAmount),
    /** Quanto le famiglie hanno versato **in piu** del dovuto. */
    familyCreditCents: toCents(eccedenzaFamiglie),
    overdueReceivablesCents: toCents(rateTotali.overdueAmount),
    overdueCount: rateTotali.overdueCount,
    legacyCollectedCents: toCents(incassatoStorico),
    fundingPendingCents: toCents(bandi.pendingSettlementAmount),
    sportWorkAccruedUnpaidCents: toCents(compensi.accruedUnpaid),
  };
};

/* ========================================================================== */
/* Il riepilogo                                                                */
/* ========================================================================== */

export type AccountingReportResult = ManagementReport & {
  organizationId: string;
  /** Righe considerate, e se la lettura si e fermata prima della fine. */
  lineCount: number;
  /** Le righe lette, comprese quelle che non sono cassa. */
  lineCountRaw: number;
  /** Vero quando a fermarsi e stato **solo** il periodo di confronto. */
  truncatedConfronto?: boolean;
  truncated: boolean;
  /**
   * I saldi dei conti, oppure `null` per chi non ha `accounting.accounts_read`.
   *
   * **Mai zero al posto di `null`.** Un saldo a zero e un numero, e un numero
   * sbagliato mostrato al posto di un diniego e il difetto che la Wave 3 ha
   * misurato su `/movements`.
   */
  accountBalances: FinancialAccountBalance[] | null;
  /** I crediti guardano il club intero, non il periodo filtrato. */
  accrualScope: "club";
};

/**
 * Il riepilogo gestionale di un club.
 *
 * `compareWith` accetta un secondo intervallo: quando c'e, la risposta porta
 * il confronto **solo fra grandezze omogenee** — cassa contro cassa. Non
 * esiste una variazione «incassato contro crediti», perche non e una
 * variazione.
 */
export const buildAccountingReport = async (
  input: {
    organizationId?: unknown;
    from?: unknown;
    to?: unknown;
    fiscalYear?: unknown;
    seasonId?: unknown;
    financialAccountId?: unknown;
    operationTypeCode?: unknown;
    siteId?: unknown;
    direction?: unknown;
    activityScope?: unknown;
    sourceDomain?: unknown;
    reconciliationStatus?: unknown;
    search?: unknown;
    compareWith?: { from?: unknown; to?: unknown; fiscalYear?: unknown } | null;
    now?: Date;
  },
  scope: AccountingScope & { activeRole?: string | null },
): Promise<AccountingReportResult> => {
  /*
    Il permesso si verifica **anche qui**, e non solo nell'involucro della
    rotta. Non e ridondanza: un riepilogo e la fotografia economica di una
    societa, e il giorno in cui questa funzione viene chiamata da un job, da un
    export o da una seconda rotta, il controllo c'e comunque. E la stessa
    disciplina del lavoro sportivo, e costa una riga.
  */
  assertAccountingPermission(scope.activeRole, "accounting.read");

  const filters: ReportingFilters = normalizeReportingFilters(input as any);

  /*
    I filtri scendono nel servizio invece di essere applicati dopo: `entry_date`
    e `fiscal_year` hanno un indice, e filtrare in memoria vorrebbe dire
    leggere tutta la storia del club per mostrarne un mese.
  */
  const filtriDiLettura = {
    organizationId: input.organizationId,
    from: filters.from,
    to: filters.to,
    fiscalYear: filters.fiscalYear,
    seasonId: filters.seasonId,
    financialAccountId: filters.financialAccountId,
    operationTypeCode: filters.operationTypeCode,
    siteId: filters.siteId,
    direction: filters.direction,
    activityScope: filters.activityScope,
    /*
      Anche questi tre scendono nel servizio (W4-B2): il riepilogo deve
      raccontare **lo stesso insieme di righe** che l'elenco mostra sotto.
      Prima li ignorava, e chi filtrava per «da riconciliare» leggeva poche
      righe sotto totali che coprivano ancora tutto il periodo.
    */
    sourceDomain: filters.sourceDomain,
    reconciliationStatus: filters.reconciliationStatus,
    search: filters.search,
  };

  /*
    **Il confine si verifica prima, e da solo.**

    Prima lo verificava la lettura delle righe, ed era corretto ma costoso: le
    altre quattro letture aspettavano che finisse per potersi appoggiare al suo
    verdetto. Su 35.000 righe la sola sequenza fra il registro (1,4 s) e la
    competenza (0,9 s) portava il riepilogo **oltre la soglia di due secondi**.

    `resolveAccountingScopeId` fa lo stesso controllo senza leggere niente, e
    da li in poi le cinque letture partono insieme. Il verdetto resta uno solo:
    e la stessa funzione che `listAccountingEntries` usa dentro di se.
  */
  const organizationId = resolveAccountingScopeId(scope, input.organizationId);

  const [{ lines, truncated }, causali, competenza, saldi, precedenti] =
    await Promise.all([
      leggiTutteLeRighe(filtriDiLettura, scope),
      listOperationTypes(organizationId, { seed: false }),
      readAccrualSummary(organizationId, input.now || new Date()),
      /*
        I saldi hanno un permesso proprio, e chi non ce l'ha riceve `null`: la
        matrice della pagina e quella della rotta devono essere la stessa
        (lezione W3-14), e un elenco con i saldi a zero le farebbe divergere in
        silenzio.
      */
      canReadAccountBalances(scope.activeRole)
        ? listFinancialAccountBalances(
            {
              userId: asText(scope.userId),
              activeOrganizationId: scope.activeOrganizationId || null,
              activeRole: scope.activeRole,
              allowedOrganizationIds: scope.allowedOrganizationIds,
            },
            { organizationId },
          )
        : Promise.resolve(null),
      input.compareWith
        ? leggiTutteLeRighe(
            {
              ...filtriDiLettura,
              from: input.compareWith.from ?? null,
              to: input.compareWith.to ?? null,
              fiscalYear: input.compareWith.fiscalYear ?? null,
            },
            scope,
          )
        : Promise.resolve(null),
    ]);

  const bucketByOperationType = Object.fromEntries(
    causali.map((causale) => [causale.code, causale.reportingBucket]),
  );

  const report = buildManagementReport({
    lines,
    filters,
    accrual: competenza || ACCRUAL_ZERO,
    bucketByOperationType,
    previousLines: precedenti ? precedenti.lines : null,
  });

  return {
    ...report,
    organizationId,
    lineCount: lines.length,
    /*
      **Il troncamento e uno solo, e riguarda entrambe le letture.**

      Qui veniva preso dalla lettura principale e basta. Ma il rendiconto
      mostra anche il **confronto** con il periodo precedente, che e una
      seconda lettura con lo stesso tetto: se si ferma, le variazioni sono
      calcolate su una parte del periodo di prima e su tutto quello di adesso.
      Il numero che ne esce non e piccolo per caso — e sbagliato, e senza
      questa riga si presentava senza avvisi.
    */
    truncated: Boolean(truncated || precedenti?.truncated),
    /*
      **Quale delle due letture si e fermata.** L'avviso stampa il numero di
      righe raccolte dalla lettura **principale**: se a fermarsi e stato solo
      il periodo di confronto, quel numero non e dove si e fermato niente, e
      dirlo confonderebbe piu del silenzio.
    */
    truncatedConfronto: Boolean(precedenti?.truncated && !truncated),
    /*
      Quante righe la lettura ha davvero raccolto: e il numero che l'avviso
      deve dire. `lineCount` esclude le righe neutralizzate, quindi dichiarava
      un limite piu basso di quello vero.
    */
    lineCountRaw: lines.length,
    accountBalances: saldi,
    accrualScope: "club",
  };
};
