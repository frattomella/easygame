import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createAnnouncement,
  listAnnouncements,
  readAnnouncementsForUser,
} from "@/lib/server/announcements";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * La bacheca del club (W2-D, G-08).
 *
 *   GET  /api/v1/announcements          gli annunci del club, per chi li governa
 *   GET  /api/v1/announcements?mine=1   la bacheca di chi sta guardando
 *   POST /api/v1/announcements          crea una bozza
 *
 * **Perche `?mine=1` e la stessa rotta.** Le due letture rispondono alla stessa
 * domanda da due lati — «cosa ho pubblicato» e «cosa devo leggere» — e devono
 * vedere la stessa finestra di validita. Due rotte sarebbero due idee di
 * «scaduto», e la prima volta che una delle due cambia una famiglia leggerebbe
 * un avviso che il club considera chiuso.
 *
 * **La creazione non pubblica.** Un annuncio nasce bozza e diventa pubblico con
 * un secondo gesto: e la ragione per cui esiste lo stato, e vale anche quando
 * la data di pubblicazione e adesso.
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

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const url = new URL(request.url);

    if (url.searchParams.get("mine")) {
      const data = await readAnnouncementsForUser({
        organizationId: String(scope.activeOrganizationId || ""),
        userId: session.db.user_id,
      });
      return NextResponse.json({ data, error: null });
    }

    const data = await listAnnouncements({ scope });
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Lettura della bacheca non riuscita");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const body = await request.json().catch(() => ({}));

    const announcement = await createAnnouncement({
      draft: body,
      scope,
      actorUserId: session.db.user_id,
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.announcementPublished,
      /*
        Una bozza non e una pubblicazione: la riga di audit dice `failure`
        perche nessuno l'ha ancora letta. E la stessa distinzione che il
        sollecito fa fra «mandato» e «non mandato».
      */
      outcome: "failure",
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: String(scope.activeOrganizationId || ""),
      resource: "announcements",
      metadata: { announcementId: announcement.id, stato: "bozza" },
    });

    return NextResponse.json({ data: announcement, error: null });
  } catch (error: any) {
    return failure(error, "Creazione dell'annuncio non riuscita");
  }
}
