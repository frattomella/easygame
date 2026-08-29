import { admitNewMember } from "@/lib/server/members";
import { failure, ok, resolveMembershipScope } from "../http";

/**
 * L'ammissione di un socio nuovo.
 *
 *   POST /api/v1/membership/admissions   { member: {…}, effective_date, resolution_reference, … }
 *
 * Scrive l'anagrafica **e** l'evento di ammissione in una transazione sola.
 * Prima questo gesto era una lettura, un append e una riscrittura dell'intera
 * colonna `clubs.members` **fatta dal browser**: due segreterie nello stesso
 * minuto, e la seconda scrittura cancellava la prima senza un errore e senza
 * una traccia.
 *
 * Chi e gia in anagrafica e va ammesso adesso passa invece da
 * `POST /api/v1/membership/events` con `event_type: "ADMISSION"`: l'anagrafica
 * c'e gia, e crearne una seconda sarebbe la stessa persona due volte.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveMembershipScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await admitNewMember(resolved.scope, {
      organizationId,
      member: body?.member || {},
      effectiveDate: body?.effective_date ?? body?.effectiveDate ?? null,
      resolutionReference:
        body?.resolution_reference ?? body?.resolutionReference ?? null,
      resolutionDate: body?.resolution_date ?? body?.resolutionDate ?? null,
      notes: body?.notes ?? null,
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Ammissione del socio non riuscita");
  }
}
