import {
  getSponsorCredit,
  listSponsorCollections,
  saveSponsorContract,
} from "@/lib/server/sponsors";
import { failure, ok, resolveSponsorScope } from "../http";

/**
 * Il **contratto** di uno sponsor e le sue tre cifre.
 *
 *   GET /api/v1/sponsorships/:id    -> { sponsor, credit }
 *   PUT /api/v1/sponsorships/:id    { contract: { … } }
 *
 * ---
 *
 * **Perche il credito arriva dal server e non si ricalcola nella pagina.** Il
 * residuo di uno sponsor si ricava da due fonti — gli incassi con la
 * controparte dichiarata in `payment_transactions`, e la vecchia collezione
 * JSON — e una pagina che ne vedesse una sola direbbe un numero sbagliato con
 * la faccia di uno giusto. `getSponsorCredit` le legge entrambe, e sa perche
 * non si sommano due volte.
 *
 * **Il contratto si salva una scheda alla volta.** `saveSponsorContract`
 * riscriveva l'intera collezione: due contratti salvati insieme si
 * infrangevano tutte e otto le volte su un conflitto di chiave primaria, con un
 * messaggio che non diceva niente. Adesso tocca una riga sola sotto il
 * `FOR UPDATE` del club.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, context: Context) {
  try {
    const url = new URL(request.url);
    const organizationId =
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId");
    const resolved = await resolveSponsorScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await getSponsorCredit(
      context.params.id,
      resolved.scope,
      organizationId,
    );

    /*
      Gli incassi viaggiano con il credito, e non a parte: sono cio che il
      credito **spiega**, e una schermata che li chiedesse con una seconda
      lettura potrebbe mostrarli disallineati dal residuo che gli sta sopra.
    */
    const collections = await listSponsorCollections(
      data.sponsor.id,
      String(organizationId || resolved.scope.activeOrganizationId || ""),
    );

    return ok({ ...data, collections });
  } catch (error: any) {
    return failure(error, "Lettura dello sponsor non riuscita");
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveSponsorScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const sponsor = await saveSponsorContract(
      {
        sponsorId: context.params.id,
        organizationId,
        contract: body?.contract,
      },
      resolved.scope,
    );

    return ok({ sponsor });
  } catch (error: any) {
    return failure(error, "Salvataggio del contratto non riuscito");
  }
}
