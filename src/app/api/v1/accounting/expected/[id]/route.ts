import { accountingRoute, ok } from "../../accounts/route-context";
import { deleteExpectedEntry } from "@/lib/server/expected-entries";

/**
 * La cancellazione di una **previsione**.
 *
 *   DELETE /api/v1/accounting/expected/:id?direction=income|expense
 *
 * **Perche qui un `DELETE` esiste, e sulla prima nota no.** «Il denaro non si
 * cancella, si storna» vale per i fatti di cassa: sono accaduti, e cancellarli
 * cancellerebbe la storia. Una previsione non e accaduta — e un promemoria, e un
 * promemoria sbagliato si toglie. Stornarla vorrebbe dire scrivere una
 * previsione negativa, che non significa niente.
 *
 * Il **verso** e obbligatorio perche dice in quale delle due collezioni cercare:
 * senza, la rotta dovrebbe leggerle entrambe per capirlo.
 */

export const runtime = "nodejs";

export const DELETE = accountingRoute(
  "accounting.manage",
  async ({ url, params, scope }) => {
    const entry = await deleteExpectedEntry(scope, {
      organizationId: url.searchParams.get("organization_id"),
      direction: url.searchParams.get("direction") || "",
      id: params.id || "",
    });

    return ok({ entry });
  },
  "Cancellazione della previsione non riuscita",
);
