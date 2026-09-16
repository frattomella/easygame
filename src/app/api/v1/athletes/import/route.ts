import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { applyAthleteImport, describeImportPermissions } from "@/lib/server/athlete-import";
import { reportServerError } from "@/lib/server/observability";

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

/* Un errore del driver fuori dal ciclo delle righe non si mostra: si registra e si risponde con una frase (C-L1). */
const messaggioPubblico = (error: any, fallback: string, request: Request) => {
  const message = String(error?.message || "");
  if (message.includes("Accesso negato") || message.includes("non trovat") || /^(Al massimo|Identificativo|Troppe|Categoria|Riga)/.test(message)) return message;
  reportServerError(error, { route: "/api/v1/athletes/import", method: "POST" });
  return fallback;
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
      { request, activeSeasonId: request.headers.get("x-active-season-id") },
    );
    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: messaggioPubblico(error, "Errore nell'import degli atleti: riprovare lo stesso lotto", request) } },
      { status: errorStatus(error) },
    );
  }
}
