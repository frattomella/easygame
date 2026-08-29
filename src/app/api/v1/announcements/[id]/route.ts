import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  markAnnouncementRead,
  publishAnnouncement,
  readAnnouncementById,
  readAnnouncementDeliveries,
  updateAnnouncement,
  withdrawAnnouncement,
} from "@/lib/server/announcements";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * Un annuncio della bacheca.
 *
 *   GET    /api/v1/announcements/:id                  l'annuncio
 *   GET    /api/v1/announcements/:id?deliveries=1     chi lo ha ricevuto e chi lo ha aperto
 *   PATCH  /api/v1/announcements/:id                  modifica
 *   POST   /api/v1/announcements/:id { action }       publish | withdraw | read
 *
 * **Perche le tre azioni passano da un `action` e non da tre rotte.** Non sono
 * risorse: sono transizioni dello stesso oggetto, e il permesso che le governa
 * e lo stesso per due su tre. Tre rotte sarebbero tre punti in cui ricordarsi
 * di verificare il club.
 *
 * **`read` e l'eccezione, e ha un permesso diverso**: la compie chi legge, non
 * chi pubblica, ed e l'unica che un genitore puo chiamare.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovato")
      ? 404
      : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const url = new URL(request.url);

    if (url.searchParams.get("deliveries")) {
      const data = await readAnnouncementDeliveries({
        announcementId: params.id,
        scope,
      });
      return NextResponse.json({ data, error: null });
    }

    const data = await readAnnouncementById({
      announcementId: params.id,
      scope,
    });
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Lettura dell'annuncio non riuscita");
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const body = await request.json().catch(() => ({}));

    const data = await updateAnnouncement({
      announcementId: params.id,
      draft: body,
      scope,
    });

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Modifica dell'annuncio non riuscita");
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const organizationId = String(scope.activeOrganizationId || "");

    if (action === "read") {
      const letto = await markAnnouncementRead({
        organizationId,
        deliveryId: String(body?.delivery_id ?? body?.deliveryId ?? ""),
        userId: session.db.user_id,
      });
      return NextResponse.json({ data: { read: letto }, error: null });
    }

    if (action === "withdraw") {
      const data = await withdrawAnnouncement({
        announcementId: params.id,
        scope,
      });
      return NextResponse.json({ data, error: null });
    }

    if (action !== "publish") {
      return NextResponse.json(
        { data: null, error: { message: "Azione non riconosciuta" } },
        { status: 400 },
      );
    }

    const outcome = await publishAnnouncement({
      announcementId: params.id,
      scope,
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.announcementPublished,
      outcome: outcome.delivered > 0 ? "success" : "failure",
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId,
      resource: "announcements",
      metadata: {
        announcementId: params.id,
        delivered: outcome.delivered,
        withoutAccount: outcome.withoutAccount,
        alreadyDelivered: outcome.alreadyDelivered,
      },
    });

    return NextResponse.json({ data: outcome, error: null });
  } catch (error: any) {
    return failure(error, "Operazione sull'annuncio non riuscita");
  }
}
