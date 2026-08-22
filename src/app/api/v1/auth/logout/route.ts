import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  deleteSessionToken,
  getSessionFromRequest,
  readAuthToken,
} from "@/lib/server/auth";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

export async function POST(request: Request) {
  // Letta prima della cancellazione, per poter attribuire l'evento.
  const session = await getSessionFromRequest(request).catch(() => null);
  const token = readAuthToken(request);
  await deleteSessionToken(token);

  if (session) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.authLogout,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      request,
    });
  }

  const response = NextResponse.json({
    error: null,
  });
  clearSessionCookie(response);
  return response;
}
