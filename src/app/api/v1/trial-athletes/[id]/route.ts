import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  readTrialAthlete,
  setTrialAthleteStatus,
  updateTrialAthlete,
} from "@/lib/server/trial-athletes";

type Context = { params: { id: string } };

/**
 * Una persona in prova: la scheda con lo storico delle prove (GET) e le sue
 * modifiche (PATCH). Un PATCH con `{status}` cambia lo stato fra «in prova» e
 * «non prosegue»; «iscritto» lo scrive solo la conversione (`/convert`).
 */
export const runtime = "nodejs";

const scopeFrom = async (request: Request, userId: string) =>
  resolveOrganizationScopeForUser(
    userId,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

const errorStatus = (error: any) => {
  const message = String(error?.message || "");
  if (message.includes("Accesso negato")) return 403;
  if (message.includes("non trovata")) return 404;
  return 400;
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const data = await readTrialAthlete(scope, context.params.id);
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore lettura persona in prova" } },
      { status: errorStatus(error) },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload = body && typeof body === "object" && body.data ? body.data : body;
    const attore = { userId: session.db.user_id, email: session.db.user.email };
    const { status, ...campi } = (payload || {}) as Record<string, unknown>;
    let row = Object.keys(campi).length
      ? await updateTrialAthlete(scope, context.params.id, campi, attore)
      : null;
    if (status !== undefined) {
      row = await setTrialAthleteStatus(scope, context.params.id, status, attore);
    }
    if (!row) row = (await readTrialAthlete(scope, context.params.id)).trial;
    return NextResponse.json({ data: row, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore aggiornamento persona in prova" } },
      { status: errorStatus(error) },
    );
  }
}
