import {
  ok,
  readBody,
  sportWorkRoute,
} from "@/lib/server/sport-work-route";
import { prepareCompensationPayout } from "@/lib/server/sport-work-ledger";

/**
 * La proposta di erogazione: cosa uscirebbe, e perche.
 *
 *   POST /api/v1/sport-work/payouts/prepare
 *
 * **Non scrive niente.** E la meta «proponi e spiega» del motore: restituisce
 * imponibili, contributi, netto, costo del club e la motivazione riga per
 * riga. La decisione la prende una persona guardando quella motivazione, e per
 * questo la rotta esiste separata invece di essere un ramo del POST.
 *
 * Richiede `sport_work.pay` e non `read`: la proposta contiene la posizione
 * annua del lavoratore verso le soglie, che e il dato piu riservato del
 * dominio.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.pay",
  async ({ request, scope }) =>
    ok(await prepareCompensationPayout((await readBody(request)) as any, scope)),
  "Calcolo della proposta non riuscito",
);
