import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  applyMembershipChange,
  previewMembershipChange,
  type MembershipChangeInput,
} from "@/lib/server/athlete-category-memberships";

/**
 * **Il cambio di appartenenza in blocco** (ADR-0194): `{mode: "preview"}`
 * calcola il piano per ogni atleta senza scrivere — e cio che il club legge
 * prima di confermare —; `{mode: "apply"}` lo scrive a lotti atomici, con
 * le schede bloccate e l'audit per atleta e per blocco. Stesso comando,
 * stesso piano: cio che l'anteprima dice e cio che l'applicazione fa.
 */
export const runtime = "nodejs";
/* Quattro lotti atomici di 50 con i round-trip di Neon: un minuto, non i dieci secondi di default (revisione ostile D1). */
export const maxDuration = 60;

const scopeFrom = async (request: Request, userId: string) =>
  resolveOrganizationScopeForUser(
    userId,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload = body && typeof body === "object" && body.data ? body.data : body;
    const input: MembershipChangeInput = {
      athleteIds: Array.isArray(payload?.athleteIds) ? payload.athleteIds.map(String) : [],
      command: payload?.command || {},
      expected: payload?.expected && typeof payload.expected === "object" ? payload.expected : null,
    };
    const report =
      payload?.mode === "apply"
        ? await applyMembershipChange(
            scope,
            input,
            { userId: session.db.user_id, email: session.db.user.email },
            { batchId: payload?.batchId || null, request },
          )
        : await previewMembershipChange(scope, input);
    return NextResponse.json({ data: report, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore nel cambio di categoria" } },
      { status: errorStatus(error) },
    );
  }
}
