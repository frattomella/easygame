import { prisma } from "./prisma";
import { listAccountingEntries, type AccountingScope } from "./accounting";
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
 * Quante pagine di prima nota il riepilogo si spinge a leggere.
 *
 * `listAccountingEntries` serve al massimo 500 righe per chiamata, ed e giusto
 * cosi: e la difesa di un elenco che si sfoglia. Un riepilogo di un anno pero
 * deve vedere **tutte** le righe, quindi le raccoglie sfogliando. Il tetto
 * esiste perche un club fuori scala non produca una lettura senza fine: oltre
 * il tetto la risposta dice `truncated: true`, che e cio che si puo dire di
 * onesto. Un riepilogo silenziosamente parziale sarebbe peggio di un errore.
 */
const PAGINA = 500;
const PAGINE_MASSIME = 40;

const NESSUN_PERMESSO = { reverse: false, reconcile: false, manage: false };

type RigheLette = {
  lines: Awaited<ReturnType<typeof listAccountingEntries>>["entries"];
  total: number;
  truncated: boolean;
};

const leggiTutteLeRighe = async (
  filtri: Record<string, unknown>,
  scope: AccountingScope,
): Promise<RigheLette> => {
  const raccolte: RigheLette["lines"] = [];
  let offset = 0;
  let total = 0;

  for (let pagina = 0; pagina < PAGINE_MASSIME; pagina += 1) {
    const risposta = await listAccountingEntries(
      { ...filtri, limit: PAGINA, offset },
      scope,
      NESSUN_PERMESSO,
    );

    total = risposta.total;
    raccolte.push(...risposta.entries);
    offset += risposta.entries.length;

    if (!risposta.entries.length || offset >= risposta.total) {
      return { lines: raccolte, total, truncated: false };
    }
  }

  return { lines: raccolte, total, truncated: raccolte.length < total };
};

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
  const rateTotali = summarizeLedgers(
    buildInstallmentLedgers({
      charges: rate || [],
      transactions: incassi || [],
      now,
    }),
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

  return {
    familyReceivablesCents: toCents(rateTotali.residualAmount),
    overdueReceivablesCents: toCents(rateTotali.overdueAmount),
    overdueCount: rateTotali.overdueCount,
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
    La lettura delle righe viene **prima**, e non per ordine di importanza: e
    lei che verifica il confine — `listAccountingEntries` risolve il club e
    nega l'accesso a quello di un altro. Le letture che seguono si appoggiano a
    quel verdetto invece di ripeterlo con criteri propri, che e il modo in cui
    due controlli sullo stesso confine finiscono per non coincidere piu.
  */
  const { lines, truncated } = await leggiTutteLeRighe(filtriDiLettura, scope);

  const organizationId =
    asText(input.organizationId) || asText(scope.activeOrganizationId);
  if (!organizationId) throw new Error("Accesso negato: nessun club attivo selezionato");

  const [causali, competenza, saldi, precedenti] = await Promise.all([
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
    truncated,
    accountBalances: saldi,
    accrualScope: "club",
  };
};
