import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { assertClubResourceAccess } from "@/lib/access-roles";
import { athleteWithinAccessScope } from "@/lib/server/access-scope-query";
import { loadConvertedTrialHistory } from "@/lib/server/trial-athletes";

type Context = { params: { id: string } };

/**
 * **La storia da prova di un atleta gia iscritto** (mandato multi-stagione
 * B1/B2/B3): `null` se non e mai stato una persona in prova, altrimenti il
 * primo momento di attivita e le presenze registrate prima della conversione.
 * Nessun permesso di dominio delle prove: chi legge la scheda dell'atleta
 * legge la sua storia.
 *
 * **Il perimetro vale anche qui** (revisione ostile Wave F, Reviewer A):
 * «lettura di `athletes`» e un permesso di ruolo piatto — un allenatore
 * perimetrato su una sola sede/categoria lo ha comunque, e senza questo
 * controllo leggerebbe la storia da prova di un atleta fuori dal suo
 * perimetro. Stesso controllo, stesso punto, della foto in
 * `athletes/:id/avatar` (`athleteWithinAccessScope`).
 */
export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    assertClubResourceAccess(scope.activeRole, "athletes", "read");
    const organizationId = scope.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ data: null, error: { message: "Nessun club attivo" } }, { status: 400 });
    }
    const dentroIlPerimetro = await athleteWithinAccessScope(organizationId, context.params.id, scope);
    if (!dentroIlPerimetro) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: questo atleta e fuori dal perimetro di sede o categoria del ruolo attivo" } },
        { status: 403 },
      );
    }
    const history = await loadConvertedTrialHistory(organizationId, context.params.id);
    return NextResponse.json({ data: history, error: null });
  } catch (error: any) {
    const status = String(error?.message || "").includes("Accesso negato") ? 403 : 400;
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore nella lettura della storia da prova" } },
      { status },
    );
  }
}
