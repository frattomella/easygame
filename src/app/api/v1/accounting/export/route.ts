import { accountingRoute } from "../accounts/route-context";
import { buildAccountingExport } from "@/lib/server/accounting-export";

/**
 * L'**export della contabilita**.
 *
 *   GET /api/v1/accounting/export
 *
 * Risponde un **CSV**, non JSON: chi apre questo indirizzo vuole un file da
 * dare al commercialista, e i filtri sono gli stessi della prima nota — date,
 * anno fiscale, stagione, conto, causale, verso, origine, sede,
 * classificazione, riconciliazione, ricerca libera.
 *
 * **Il permesso e `accounting.export`, che la segreteria non ha.** Un export e
 * la fotografia completa dei conti della societa che lascia l'applicazione
 * dentro un file, e sta nello stesso recinto degli estremi bancari. Il diniego
 * lo produce l'involucro `accountingRoute`, con il motivo dentro il messaggio
 * e una traccia nell'audit.
 *
 * **Il file non promette niente che non sia.** Nessuna intestazione, nessun
 * nome di file e nessuna etichetta usa «ufficiale», «conforme», «a norma» o
 * «per il deposito»: nessuno standard di interscambio verso un gestionale di
 * studio esiste (§32 del piano), e proprio per questo il file e leggibile da
 * chiunque — colonne dichiarate in italiano e nessun formato proprietario.
 */

export const runtime = "nodejs";

export const GET = accountingRoute(
  "accounting.export",
  async ({ request, url, scope }) => {
    const q = url.searchParams;

    const risultato = await buildAccountingExport(
      {
        organizationId: q.get("organization_id"),
        from: q.get("from"),
        to: q.get("to"),
        /*
          Passato grezzo di proposito: `toFiscalYearFilter` sa che
          `searchParams.get()` restituisce `null` quando il parametro manca, e
          che `Number(null)` vale `0`. Convertirlo qui riporterebbe la trappola
          esattamente dove il lavoro sportivo l'aveva trovata — e qui
          significherebbe consegnare un file vuoto a chi non ha scelto un anno.
        */
        fiscalYear: q.get("fiscal_year"),
        seasonId: q.get("season_id"),
        financialAccountId: q.get("financial_account_id"),
        operationTypeCode: q.get("operation_type_code"),
        direction: q.get("direction"),
        sourceDomain: q.get("source_domain"),
        siteId: q.get("site_id"),
        activityScope: q.get("activity_scope"),
        reconciliationStatus: q.get("reconciliation_status"),
        search: q.get("q"),
      },
      scope,
      request,
    );

    /*
      Il nome del file arriva da `csvFileName`, che lo riduce a minuscole,
      cifre e trattini: nel `Content-Disposition` non puo quindi finire una
      virgoletta ne un ritorno a capo, che sono il modo in cui si inietta un
      secondo header. Il corpo porta gia il BOM.
    */
    return new Response(risultato.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${risultato.fileName}"`,
        /*
          Un elenco di movimenti con importi e controparti non si mette in
          nessuna cache condivisa, ed e la stessa scelta gia presa sulla
          riconciliazione dei bandi.
        */
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
  "Export della contabilita non riuscito",
);
