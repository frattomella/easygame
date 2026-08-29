import { listMembershipRegister } from "@/lib/server/members";
import { MEMBERSHIP_REGISTER_DISCLAIMER } from "@/lib/members/model";
import { failure, ok, resolveMembershipScope } from "../http";

/**
 * Il libro soci a una data.
 *
 *   GET /api/v1/membership/register?at=2026-03-12
 *
 * Senza `at` risponde su oggi. **Con `at` risponde alla domanda per cui il
 * registro esiste**: chi era socio quel giorno. Gli eventi con efficacia
 * successiva non vengono nascosti — quel giorno non erano ancora accaduti.
 *
 * La classificazione del prodotto viaggia con i dati e non solo nella pagina:
 * chi consuma questo endpoint deve poter dire cos'e cio che sta stampando.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveMembershipScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const atDate = url.searchParams.get("at");
    const rows = await listMembershipRegister(resolved.scope, {
      organizationId,
      atDate,
    });

    // La data effettivamente applicata, ripulita: e la stessa che la
    // derivazione ha usato, e chi stampa il libro deve poterla scrivere sopra.
    const asked = atDate ? new Date(atDate) : null;

    return ok({
      atDate:
        asked && !Number.isNaN(asked.getTime()) ? asked.toISOString() : null,
      disclaimer: MEMBERSHIP_REGISTER_DISCLAIMER,
      rows,
    });
  } catch (error: any) {
    return failure(error, "Lettura del libro soci non riuscita");
  }
}
