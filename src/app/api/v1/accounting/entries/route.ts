import {
  accountingRoute,
  ok,
  readBody,
} from "../accounts/route-context";
import {
  createAccountingEntry,
  createInternalTransfer,
  listAccountingEntries,
} from "@/lib/server/accounting";
import { hasAccountingPermission } from "@/lib/accounting/permissions";

/**
 * La **prima nota**.
 *
 *   GET  /api/v1/accounting/entries
 *   POST /api/v1/accounting/entries
 *   POST /api/v1/accounting/entries?kind=transfer
 *
 * **Cosa sostituisce.** La pagina Movimenti faceva circa diciassette viaggi
 * HTTP per disegnarsi, di cui quattordici sulla stessa singola riga `clubs`,
 * una per colonna; poi ventidue letture normalizzate nel browser, due
 * deduplicazioni con chiavi diverse e un ordinamento per confronto fra
 * stringhe. Due di quelle letture erano morte da sempre.
 *
 * Qui e **una** lettura, con gli indici, e con i filtri che il browser non
 * aveva: data, anno fiscale, conto, causale, verso, sede, classificazione,
 * stato di riconciliazione.
 *
 * **Il verso di scrittura e uno solo.** Nascono qui i movimenti manuali e i
 * giroconti; incassi, compensi e contributi restano ai loro domini e questa
 * rotta li **proietta** in sola lettura. Chi provasse a scriverne uno riceve
 * un errore dal dominio, non un 403: non e un problema di permessi, e un
 * movimento che non appartiene a questa tabella.
 */

export const runtime = "nodejs";

const asFlag = (value: string | null) =>
  value === null ? undefined : !["0", "false", "no"].includes(value.toLowerCase());

export const GET = accountingRoute(
  "accounting.read",
  async ({ url, scope }) => {
    const q = url.searchParams;

    const result = await listAccountingEntries(
      {
        organizationId: q.get("organization_id"),
        from: q.get("from"),
        to: q.get("to"),
        /*
          Passato grezzo di proposito: `toFiscalYearFilter` sa che
          `searchParams.get()` restituisce `null` quando il parametro manca, e
          che `Number(null)` vale `0`. Convertirlo qui riporterebbe la trappola
          esattamente dove il lavoro sportivo l'aveva trovata.
        */
        fiscalYear: q.get("fiscal_year"),
        seasonId: q.get("season_id"),
        financialAccountId: q.get("financial_account_id"),
        operationTypeCode: q.get("operation_type_code"),
        direction: q.get("direction"),
        sourceDomain: q.get("source_domain"),
        siteId: q.get("site_id"),
        reconciliationStatus: q.get("reconciliation_status"),
        activityScope: q.get("activity_scope"),
        search: q.get("q"),
        includeProjections: asFlag(q.get("include_projections")),
        includeLegacy: asFlag(q.get("include_legacy")),
        limit: q.get("limit"),
        offset: q.get("offset"),
      },
      scope,
      {
        /*
          I permessi viaggiano **con le righe**, non ricalcolati dalla pagina.
          E la lezione W3-14: due porte che decidono la stessa cosa in due posti
          diversi finiscono per rispondere diversamente.
        */
        manage: hasAccountingPermission(scope.activeRole, "accounting.manage"),
        reverse: hasAccountingPermission(scope.activeRole, "accounting.reverse"),
        reconcile: hasAccountingPermission(scope.activeRole, "accounting.reconcile"),
      },
    );

    return ok(result);
  },
  "Errore nella lettura della prima nota",
);

export const POST = accountingRoute(
  "accounting.manage",
  async ({ request, url, scope }) => {
    const body = await readBody(request);

    if (url.searchParams.get("kind") === "transfer") {
      const transfer = await createInternalTransfer(
        {
          organizationId: body.organization_id ?? body.organizationId,
          entryDate: body.entry_date ?? body.entryDate,
          amount: body.amount,
          amountCents: body.amount_cents ?? body.amountCents,
          fromAccountId: body.from_account_id ?? body.fromAccountId,
          toAccountId: body.to_account_id ?? body.toAccountId,
          description: body.description,
          notes: body.notes,
          siteId: body.site_id ?? body.siteId,
          seasonId: body.season_id ?? body.seasonId,
        },
        scope,
      );
      return ok(transfer, 201);
    }

    const entry = await createAccountingEntry(
      {
        organizationId: body.organization_id ?? body.organizationId,
        entryDate: body.entry_date ?? body.entryDate,
        direction: body.direction,
        amount: body.amount,
        amountCents: body.amount_cents ?? body.amountCents,
        financialAccountId: body.financial_account_id ?? body.financialAccountId,
        operationTypeCode: body.operation_type_code ?? body.operationTypeCode,
        description: body.description,
        notes: body.notes,
        paymentMethod: body.payment_method ?? body.paymentMethod,
        counterpartyKind: body.counterparty_kind ?? body.counterpartyKind,
        counterpartyId: body.counterparty_id ?? body.counterpartyId,
        counterpartyLabel: body.counterparty_label ?? body.counterpartyLabel,
        documentKind: body.document_kind ?? body.documentKind,
        documentId: body.document_id ?? body.documentId,
        siteId: body.site_id ?? body.siteId,
        seasonId: body.season_id ?? body.seasonId,
        valueDate: body.value_date ?? body.valueDate,
        bankReference: body.bank_reference ?? body.bankReference,
      },
      scope,
    );

    return ok(entry, 201);
  },
  "Registrazione del movimento non riuscita",
);
