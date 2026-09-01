import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  listEventParticipants,
  saveEventAttendance,
  saveEventConvocations,
} from "@/lib/server/events";

type Context = { params: { id: string } };

/**
 * **Tre colonne dello stesso fatto, tre scrittori distinti** (ADR-0099).
 *
 * `action: "convoke"` scrive la convocazione. `action: "attendance"` scrive
 * l'appello. La risposta della famiglia non passa di qui: ha la sua rotta, il
 * suo permesso e il suo gate — il **legame**, non il ruolo. I due permessi non
 * sono lo stesso permesso, e una promessa non diventa mai una presenza.
 */

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
      return NextResponse.json(
        { data: [], error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const rows = await listEventParticipants(scope, context.params.id);
    return NextResponse.json({ data: rows, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore lettura partecipanti" },
      },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: [], error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload =
      body && typeof body === "object" && body.data ? body.data : body;
    const action = String(payload?.action || body?.action || "").trim();
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const attore = {
      userId: session.db.user_id,
      email: session.db.user.email,
    };

    if (action === "convoke") {
      const rows = await saveEventConvocations(
        scope,
        context.params.id,
        entries,
        attore,
      );
      return NextResponse.json({ data: rows, error: null });
    }

    if (action === "attendance") {
      const rows = await saveEventAttendance(
        scope,
        context.params.id,
        entries,
        attore,
      );
      return NextResponse.json({ data: rows, error: null });
    }

    return NextResponse.json(
      {
        data: [],
        error: {
          message: "Azione non riconosciuta: usare «convoke» o «attendance»",
        },
      },
      { status: 400 },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore salvataggio partecipanti" },
      },
      { status: errorStatus(error) },
    );
  }
}
