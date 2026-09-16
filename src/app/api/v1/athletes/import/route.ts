import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { applyAthleteImport, describeImportPermissions } from "@/lib/server/athlete-import";

/**
 * **Import di atleti da file** (ADR-0195). `POST {batchId, categoriesToCreate,
 * rows}` scrive uno scaglione (al massimo 200 righe) del lotto deciso nel
 * wizard; `GET` dice cosa puo fare chi importa (creare categorie, assegnare
 * sedi, collegare schede), cosi la UI nasconde cio che il server
 * rifiuterebbe. Il piano lo calcola il client con il modulo puro condiviso;
 * il server rivaglia ogni riga e scrive dai registri dei domini.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const scopeFrom = async (request: Request, userId: string) =>
  resolveOrganizationScopeForUser(
    userId,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

const errorStatus = (error: any) => {
  const message = String(error?.message || "");
  if (message.includes("Accesso negato")) return 403;
  if (message.includes("non trovat")) return 404;
  return 400;
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    return NextResponse.json({ data: describeImportPermissions(scope), error: null });
  } catch (error: any) {
    return NextResponse.json({ data: null, error: { message: error?.message || "Errore" } }, { status: errorStatus(error) });
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
    const result = await applyAthleteImport(
      scope,
      payload,
      { userId: session.db.user_id, email: session.db.user.email },
      { request },
    );
    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore nell'import degli atleti" } },
      { status: errorStatus(error) },
    );
  }
}
