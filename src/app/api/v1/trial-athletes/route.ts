import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createTrialAthlete,
  listTrialAthletes,
  searchTrialAthletes,
} from "@/lib/server/trial-athletes";

/**
 * **Le persone in prova** (ADR-0188): l'elenco del club e la registrazione
 * di una persona nuova. La ricerca (`?q=`) propone le corrispondenze — con la
 * data di nascita che distingue gli omonimi — e non fonde mai nessuno: chi
 * registra sceglie. Il perimetro dell'allenatore e il tenant li applica il
 * dominio, riga per riga.
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

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: [], error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const url = new URL(request.url);
    const birthDate = url.searchParams.get("birthDate");
    const rows = birthDate
      ? await searchTrialAthletes(scope, { q: url.searchParams.get("q"), birthDate })
      : await listTrialAthletes(scope, {
          status: url.searchParams.get("status"),
          q: url.searchParams.get("q"),
          categoryId: url.searchParams.get("categoryId"),
        });
    return NextResponse.json({ data: rows, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: [], error: { message: error?.message || "Errore lettura persone in prova" } },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload = body && typeof body === "object" && body.data ? body.data : body;
    const row = await createTrialAthlete(scope, payload || {}, {
      userId: session.db.user_id,
      email: session.db.user.email,
    });
    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore registrazione persona in prova" } },
      { status: errorStatus(error) },
    );
  }
}
