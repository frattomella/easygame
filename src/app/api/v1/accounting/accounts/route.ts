import { parseInput } from "@/lib/validation";
import { financialAccountCreateSchema } from "@/lib/validation/schemas";
import {
  createFinancialAccount,
  listFinancialAccounts,
} from "@/lib/server/financial-accounts";
import { FINANCIAL_ACCOUNT_KIND_LABELS } from "@/lib/accounting/model";
import { accountingRoute, ok, readBody } from "./route-context";

/**
 * I **conti finanziari** di una societa.
 *
 *   GET  /api/v1/accounting/accounts?with_balances=1&include_archived=1
 *   POST /api/v1/accounting/accounts
 *
 * **Perche i saldi non arrivano per difetto.** L'elenco ha due lettori: chi
 * registra un movimento, che deve solo scegliere dove il denaro si e mosso, e
 * chi tiene i conti, che vuole sapere quanto c'e. Il primo ha
 * `accounting.read`, il secondo `accounting.accounts_read`. Servire sempre i
 * saldi vorrebbe dire negare l'intera rotta al primo — cioe rendere la prima
 * nota inutilizzabile da chi la usa tutti i giorni.
 *
 * `?with_balances=1` chiede la seconda cosa, e chi non ne ha il diritto riceve
 * un **403 che dice perche**, non un elenco con i saldi a zero: un numero
 * sbagliato al posto di un diniego e il difetto che la Wave 3 ha misurato su
 * `/movements`.
 *
 * **Nessuna cancellazione, e non manca niente.** Un conto e citato dai
 * movimenti che ci sono passati: si archivia con il `PATCH` su `[id]`.
 */

export const runtime = "nodejs";

const isTruthy = (value: string | null) =>
  value === "1" || value === "true" || value === "yes";

export const GET = accountingRoute(
  /*
    Il permesso della rotta e quello dell'elenco. Il permesso dei **saldi** lo
    verifica il servizio, perche dipende da un parametro della richiesta e non
    dalla rotta: dichiararlo qui negherebbe l'elenco anche a chi non ha chiesto
    i saldi.
  */
  "accounting.read",
  async ({ url, scope }) => {
    const withBalances = isTruthy(url.searchParams.get("with_balances"));

    const accounts = await listFinancialAccounts(scope, {
      organizationId: url.searchParams.get("organization_id"),
      includeArchived: isTruthy(url.searchParams.get("include_archived")),
      withBalances,
    });

    return ok({
      accounts,
      /*
        I saldi sono derivati: la risposta lo dice, perche una superficie che
        li mostra non deve inventarsi un pulsante «ricalcola» per un numero che
        non e mai stato memorizzato.
      */
      balancesIncluded: withBalances,
      vocabularies: {
        kinds: Object.entries(FINANCIAL_ACCOUNT_KIND_LABELS).map(
          ([key, label]) => ({ key, label }),
        ),
      },
    });
  },
  "Errore nella lettura dei conti",
);

export const POST = accountingRoute(
  /*
    **Scrivere si dichiara con il permesso di scrittura.**

    Qui c'era `accounts_read`, ereditato da quando `accounts_manage` non
    esisteva ancora nel catalogo. Il servizio dentro verificava gia il permesso
    giusto, quindi non era sfruttabile — ma e esattamente la distinzione che
    `permissions.ts` descrive come «il modo in cui un permesso finisce
    allargato per distrazione il giorno in cui la lettura viene concessa a
    qualcuno in piu».
  */
  "accounting.accounts_manage",
  async ({ request, scope }) => {
    const raw = await readBody(request);
    const input = parseInput(financialAccountCreateSchema, raw);

    const account = await createFinancialAccount(
      {
        ...input,
        organizationId:
          (raw as any).organization_id || (raw as any).organizationId || null,
      },
      scope,
    );

    return ok({ account }, 201);
  },
  "Errore nella creazione del conto",
);
