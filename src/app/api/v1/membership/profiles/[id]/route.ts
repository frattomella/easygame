import { removeMemberProfile, updateMemberProfile } from "@/lib/server/members";
import { failure, ok, resolveMembershipScope } from "../../http";

/**
 * La scheda di **un** socio: si corregge una alla volta, e si cancella solo se
 * il libro non la nomina.
 *
 *   PATCH  /api/v1/membership/profiles/:id   { … }
 *   DELETE /api/v1/membership/profiles/:id
 *
 * ---
 *
 * ## Il difetto che chiude, e come e stato misurato
 *
 * Correggere o cancellare un socio era una lettura, una modifica di un
 * elemento dell'array e una riscrittura dell'**intera** colonna
 * `clubs.members`, fatta dal browser — `updateClubDataItem` e
 * `deleteClubDataItem` in `simplified-db.ts`.
 *
 * Una sonda di concorrenza ha lanciato quella riscrittura insieme a
 * un'ammissione, e ha ottenuto lo stato che nessuna schermata puo spiegare:
 * **un socio presente nel libro e assente dall'anagrafica**, perche la copia
 * partita dal browser non lo conteneva ancora. Il libro soci esiste per essere
 * dimostrabile, e un registro che cita una persona che l'anagrafica non conosce
 * piu non dimostra piu niente.
 *
 * ## Perche `profiles` e non `members`
 *
 * Perche il **libro** e una cosa e l'**anagrafica** e un'altra, e questa rotta
 * tocca la seconda. Gli eventi stanno in `/membership/events`, l'ammissione in
 * `/membership/admissions`, la scheda qui. E `members` e gia una risorsa del
 * CRUD generico: una cartella con quel nome oscurerebbe la rotta dinamica.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function PATCH(request: Request, context: Context) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveMembershipScope(request, organizationId);
    if (resolved.response) return resolved.response;

    /*
      Il club non e una modifica del socio: e il perimetro, e viaggia fuori dal
      corpo delle correzioni perche non finisca dentro il suo payload.
    */
    const { organization_id, organizationId: _org, ...updates } = body;

    const member = await updateMemberProfile(
      resolved.scope,
      context.params.id,
      updates,
      { organizationId },
    );

    return ok({ member });
  } catch (error: any) {
    return failure(error, "Modifica del socio non riuscita");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const url = new URL(request.url);
    const organizationId =
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId");
    const resolved = await resolveMembershipScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const esito = await removeMemberProfile(resolved.scope, context.params.id, {
      organizationId,
    });

    return ok(esito);
  } catch (error: any) {
    return failure(error, "Cancellazione del socio non riuscita");
  }
}
