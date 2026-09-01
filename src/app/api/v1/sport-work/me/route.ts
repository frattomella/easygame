import { ok, sportWorkRoute } from "@/lib/server/sport-work-route";
import { readOwnCompensationStatement } from "@/lib/server/trainer-area";

/**
 * **I compensi di chi sta chiedendo, e di nessun altro** (W6-32).
 *
 * ## Perche una rotta di dominio e non il CRUD generico
 *
 * `sport_work` sta in `MANAGEMENT_ADMIN_ONLY_RESOURCES`
 * (`access-roles.ts:188`): la porta generica `/api/v1/[resource]` e chiusa a
 * chiunque non sia direzione, ed e giusto che lo resti — un allenatore non
 * deve poter elencare i rapporti del club. Ma «i miei compensi» non e un
 * elenco ristretto: e una **domanda diversa**, che non prende un filtro da chi
 * chiama e non ha un parametro da cambiare per farla diventare l'elenco di un
 * altro. Non esiste `?person_id=`.
 *
 * ## Il permesso
 *
 * `sport_work.read_own`, non `sport_work.read`. La seconda e della direzione;
 * chiederla qui avrebbe reso la pagina inaccessibile proprio a chi e stata
 * scritta, ed e il modo in cui una chiave resta muta per un'altra Wave.
 */
export const GET = sportWorkRoute(
  "sport_work.read_own",
  async ({ scope, url }) => {
    const anno = Number.parseInt(url.searchParams.get("year") || "", 10);

    /*
      `null` — nessuna persona del modulo collegata a questa utenza — non e un
      errore: e il caso ordinario di un allenatore che il club non ha ancora
      inserito nel registro del lavoro sportivo. La schermata lo dice, invece
      di mostrare un errore che manderebbe qualcuno a cercare un guasto.
    */
    const statement = await readOwnCompensationStatement(scope, {
      year: Number.isFinite(anno) ? anno : undefined,
    });

    return ok(statement);
  },
  "Lettura dei propri compensi non riuscita",
);
