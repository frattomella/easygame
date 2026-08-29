import { buildAccountingReport } from "@/lib/server/accounting-reports";
import {
  accountingRoute,
  ok,
} from "../accounts/route-context";

/**
 * Il **riepilogo gestionale**.
 *
 *   GET /api/v1/accounting/reports
 *       ?from=&to=&fiscal_year=&season_id=&financial_account_id=
 *       &operation_type_code=&site_id=&direction=&activity_scope=
 *       &compare_from=&compare_to=&compare_fiscal_year=
 *
 * **Non e un documento ufficiale**, e la risposta lo dice: `disclaimer` viaggia
 * con i numeri, perche una superficie che li mostra senza la riga che li
 * qualifica trasforma un promemoria interno in cio che il committente ha
 * vietato di far credere (§13 del piano).
 *
 * **Il permesso e `accounting.read`.** I saldi dei conti hanno il loro
 * (`accounting.accounts_read`) e li verifica il servizio: dichiararlo qui
 * negherebbe l'intero riepilogo a chi ha diritto di vedere i movimenti ma non
 * i saldi. Chi non ce l'ha riceve `accountBalances: null`, mai zero.
 *
 * **`fiscal_year` e `season_id` sono due assi diversi**, e la rotta li accetta
 * insieme: la stagione 2026/27 contiene movimenti del 2026 e del 2027, e il
 * riepilogo fiscale del 2026 prende solo i primi (§14). L'anno passa da
 * `toFiscalYearFilter`, dentro `normalizeReportingFilters`: un filtro scritto a
 * mano risponderebbe elenco vuoto a chi non chiede un anno, perche
 * `searchParams.get()` restituisce `null` e `Number(null)` vale `0`.
 */

export const runtime = "nodejs";

const testo = (value: string | null) => String(value ?? "").trim() || null;

export const GET = accountingRoute(
  "accounting.read",
  async ({ url, scope }) => {
    const q = url.searchParams;

    const compareFrom = testo(q.get("compare_from"));
    const compareTo = testo(q.get("compare_to"));
    const compareFiscalYear = testo(q.get("compare_fiscal_year"));

    const report = await buildAccountingReport(
      {
        organizationId: q.get("organization_id"),
        from: q.get("from"),
        to: q.get("to"),
        fiscalYear: q.get("fiscal_year"),
        seasonId: q.get("season_id"),
        financialAccountId: q.get("financial_account_id"),
        operationTypeCode: q.get("operation_type_code"),
        siteId: q.get("site_id"),
        direction: q.get("direction"),
        activityScope: q.get("activity_scope"),
        /*
          Il confronto si chiede, non si deduce. Un periodo precedente inferito
          dalla durata del primo darebbe un numero che nessuno ha domandato, e
          che cambierebbe da solo spostando una data.
        */
        compareWith:
          compareFrom || compareTo || compareFiscalYear
            ? {
                from: compareFrom,
                to: compareTo,
                fiscalYear: compareFiscalYear,
              }
            : null,
      },
      {
        userId: scope.userId,
        activeOrganizationId: scope.activeOrganizationId,
        activeRole: scope.activeRole,
        allowedOrganizationIds: scope.allowedOrganizationIds,
      },
    );

    return ok({ report });
  },
  "Errore nella lettura del riepilogo gestionale",
);
