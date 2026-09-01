import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  assertAuditReadPermission,
  listAuditActions,
  listAuditAreas,
  listAuditEvents,
  type AuditOutcome,
} from "@/lib/server/audit";

/**
 * **La consultazione del registro** (WP-16, Wave 6 lane 6G).
 *
 *   GET /api/v1/audit?area=payment&outcome=denied&from=…&to=…&limit=…&offset=…
 *
 * Il registro esisteva da tre Wave e non lo leggeva nessuno: centootto punti di
 * scrittura, quattro indici adatti alla lettura, zero rotte. Questa e la porta
 * che mancava.
 *
 * ## Due controlli, e non uno
 *
 * Il **club attivo** decide *quali* righe: `listAuditEvents` filtra sempre su
 * `organization_id`, e le righe senza club — il cron, un login fallito prima
 * che ci sia un'organizzazione — non escono di qui.
 *
 * La chiave `audit.read` decide *se*. E una chiave di direzione, e resta
 * concedibile a un ruolo personalizzato basato su `club_manager`: e con questa
 * rotta che si dimostra la regola di §10.5 — tolta la chiave, 403; rimessa,
 * 200 — senza che la matrice per risorsa c'entri niente.
 */

export const runtime = "nodejs";

const OUTCOMES = new Set(["success", "failure", "denied"]);

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      url.searchParams.get("organization_id") ||
        url.searchParams.get("club_id") ||
        request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    await assertAuditReadPermission(scope);

    const outcome = url.searchParams.get("outcome");

    const risultato = await listAuditEvents(
      String(scope.activeOrganizationId || ""),
      {
        actorUserId: url.searchParams.get("actor_user_id"),
        actorEmail: url.searchParams.get("actor_email"),
        action: url.searchParams.get("action"),
        area: url.searchParams.get("area"),
        resource: url.searchParams.get("resource"),
        resourceId: url.searchParams.get("resource_id"),
        outcome:
          outcome && OUTCOMES.has(outcome) ? (outcome as AuditOutcome) : null,
        deniedOnly: url.searchParams.get("denied") === "1",
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        limit: Number(url.searchParams.get("limit") || 50),
        offset: Number(url.searchParams.get("offset") || 0),
      },
    );

    return NextResponse.json({
      data: {
        ...risultato,
        areas: listAuditAreas(),
        actions: listAuditActions(),
      },
      error: null,
    });
  } catch (error: any) {
    const messaggio = String(error?.message || "Lettura del registro non riuscita");
    return NextResponse.json(
      { data: null, error: { message: messaggio } },
      { status: messaggio.includes("Accesso negato") ? 403 : 400 },
    );
  }
}
