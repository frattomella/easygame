import { parseInput } from "@/lib/validation";
import { financialAccountPatchSchema } from "@/lib/validation/schemas";
import {
  archiveFinancialAccount,
  getFinancialAccountBalance,
  getFinancialAccountById,
  renameFinancialAccount,
} from "@/lib/server/financial-accounts";
import { accountingRoute, ok, readBody } from "../route-context";

/**
 * Un conto solo.
 *
 *   GET   /api/v1/accounting/accounts/:id?with_balance=1
 *   PATCH /api/v1/accounting/accounts/:id     rinomina, corregge, archivia
 *
 * **Non c'e `DELETE`, ed e la regola e non un'omissione.** Un conto e citato
 * da ogni movimento che ci e passato: cancellarlo o li porta via con se, o li
 * lascia a puntare al nulla. `{"archived": true}` lo toglie dagli elenchi in
 * cui si sceglie dove registrare e lo lascia leggibile ovunque sia gia citato;
 * `{"archived": false}` lo riapre.
 *
 * **Il tipo e il saldo di apertura non si modificano.** Il tipo dice la natura
 * di tutti i movimenti gia registrati; il saldo di apertura e il punto di
 * partenza della somma, e cambiarlo sposterebbe l'intera storia del conto
 * senza che nessun movimento lo spieghi.
 */

export const runtime = "nodejs";

const isTruthy = (value: string | null) =>
  value === "1" || value === "true" || value === "yes";

export const GET = accountingRoute(
  "accounting.read",
  async ({ params, url, scope }) => {
    const account = await getFinancialAccountById(params.id, scope);

    if (!isTruthy(url.searchParams.get("with_balance"))) {
      return ok({ account });
    }

    /*
      Il saldo passa dal servizio, che verifica `accounting.accounts_read` da
      solo: e la stessa verifica dell'elenco, e farla qui a mano vorrebbe dire
      due regole per la stessa cosa.
    */
    const balance = await getFinancialAccountBalance(params.id, scope);
    return ok({ account: { ...account, balance }, balancesIncluded: true });
  },
  "Errore nella lettura del conto",
);

export const PATCH = accountingRoute(
  "accounting.accounts_read",
  async ({ params, request, scope }) => {
    const raw = await readBody(request);
    const input = parseInput(financialAccountPatchSchema, raw);

    /*
      Archiviare e rinominare sono due gesti diversi e possono arrivare
      insieme: prima si scrivono gli estremi, poi si archivia. L'ordine
      inverso lascerebbe una modifica applicata a un conto appena chiuso, che
      e leggibile solo per chi ha scritto il codice.
    */
    let account = await renameFinancialAccount(
      params.id,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.iban !== undefined ? { iban: input.iban } : {}),
        ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
        ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      scope,
    );

    if (input.archived !== undefined) {
      account = await archiveFinancialAccount(params.id, scope, {
        archived: input.archived,
      });
    }

    return ok({ account });
  },
  "Errore nell'aggiornamento del conto",
);
