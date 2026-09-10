import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  deleteSessionToken,
  getSessionFromRequest,
  readAuthToken,
} from "@/lib/server/auth";
import { revokeDevicePushTokensForSession } from "@/lib/server/device-push-tokens";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

export async function POST(request: Request) {
  // Letta prima della cancellazione, per poter attribuire l'evento.
  const session = await getSessionFromRequest(request).catch(() => null);
  const token = readAuthToken(request);

  /*
    Il token push del dispositivo (WP11) si revoca **prima** di cancellare la
    sessione: la colonna `session_id` che lo lega e l'unico modo per trovarlo,
    e una volta sparita la sessione la query non troverebbe piu niente da
    revocare (l'`onDelete: SetNull` sulla colonna e una rete di sicurezza per
    sessioni cancellate da un'altra strada, non il meccanismo di revoca).
  */
  if (session) {
    await revokeDevicePushTokensForSession(session.db.id).catch(() => 0);
  }

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
