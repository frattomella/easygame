import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  listEventTrialAttendance,
  saveEventTrialAttendance,
} from "@/lib/server/trial-athletes";

type Context = { params: { id: string } };

/**
 * Le presenze delle persone in prova a un evento (ADR-0188). GET: le
 * presenze registrate e le persone in prova pertinenti (stessa categoria).
 * POST `{entries: [{trialAthleteId, status, notes}]}`: l'appello, una riga per
 * persona. Non e `/participants`: quella e la tabella degli atleti, e una
 * persona in prova non deve entrarci. Nessun nominativo libero: solo
 * identificativi di righe che esistono.
 */
export const runtime = "nodejs";

const scopeFrom = async (request: Request, userId: string) =>
  resolveOrganizationScopeForUser(
    userId,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: [], error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const rows = await listEventTrialAttendance(scope, context.params.id);
    return NextResponse.json({ data: rows, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: [], error: { message: error?.message || "Errore lettura presenze di prova" } },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: [], error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload = body && typeof body === "object" && body.data ? body.data : body;
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const rows = await saveEventTrialAttendance(scope, context.params.id, entries, {
      userId: session.db.user_id,
      email: session.db.user.email,
    });
    return NextResponse.json({ data: rows, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: [], error: { message: error?.message || "Errore salvataggio presenze di prova" } },
      { status: errorStatus(error) },
    );
  }
}
