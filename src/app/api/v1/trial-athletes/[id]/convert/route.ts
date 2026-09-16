import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  convertTrialAthlete,
  findAthleteCandidates,
} from "@/lib/server/trial-athletes";

type Context = { params: { id: string } };

/**
 * La conversione di una persona in prova in atleta (ADR-0188). GET propone
 * le schede esistenti che potrebbero gia essere questa persona (stesso nome;
 * la data di nascita distingue la corrispondenza esatta): si propone, non si
 * fonde. POST crea la scheda (`{create: {...}}`) o collega quella scelta
 * (`{athleteId}`). La riga di prova resta, con la scheda e la data.
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
      return NextResponse.json({ data: [], error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const data = await findAthleteCandidates(scope, context.params.id);
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: [], error: { message: error?.message || "Errore ricerca schede esistenti" } },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload = body && typeof body === "object" && body.data ? body.data : body;
    const data = await convertTrialAthlete(scope, context.params.id, payload || {}, {
      userId: session.db.user_id,
      email: session.db.user.email,
    });
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore conversione in atleta" } },
      { status: errorStatus(error) },
    );
  }
}
