import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  applyMembershipChange,
  replaceAthleteMembershipSet,
} from "@/lib/server/athlete-category-memberships";

type Context = { params: { id: string } };

/**
 * **Le appartenenze di un atleta** (ADR-0194). `PUT {memberships: [...]}`
 * scrive l'insieme intero — la strada della scheda, della creazione e
 * dell'iscrizione approvata —; `POST {command}` applica un comando solo
 * (imposta come primaria con la sua politica, aggiungi come secondaria,
 * rimuovi) con lo stesso piano del cambio in blocco. In entrambi i casi la
 * sede si deriva dalla squadra scelta e una coppia non configurata non
 * nasce.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

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
  if (message.includes("cambiate nel frattempo")) return 409;
  return 400;
};

export async function PUT(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload = body && typeof body === "object" && body.data ? body.data : body;
    const rows = Array.isArray(payload?.memberships) ? payload.memberships : [];
    const esito = await replaceAthleteMembershipSet(
      scope,
      context.params.id,
      rows,
      { userId: session.db.user_id, email: session.db.user.email },
      { request, expectedRowIds: Array.isArray(payload?.expectedRowIds) ? payload.expectedRowIds : null },
    );
    return NextResponse.json({ data: esito, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore nel salvataggio delle categorie" } },
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
    const report = await applyMembershipChange(
      scope,
      { athleteIds: [context.params.id], command: payload?.command || {} },
      { userId: session.db.user_id, email: session.db.user.email },
      { request },
    );
    return NextResponse.json({ data: report, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore nel cambio di categoria" } },
      { status: errorStatus(error) },
    );
  }
}
