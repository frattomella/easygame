import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import {
  registerDevicePushToken,
  revokeDevicePushToken,
} from "@/lib/server/device-push-tokens";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { readRequestId, reportServerError } from "@/lib/server/observability";
import { parseInput, validationErrorPayload } from "@/lib/validation";
import {
  deviceTokenInputSchema,
  deviceTokenRevokeInputSchema,
} from "@/lib/validation/schemas";

export const runtime = "nodejs";

const UNAUTHENTICATED_RESPONSE = NextResponse.json(
  { data: null, error: { message: "Sessione non valida" } },
  { status: 401 },
);

/**
 * Registra o rinnova il token push del dispositivo (WP11, ADR-0166).
 *
 * Idempotente: l'app mobile la chiama a ogni avvio e a ogni cambio di token
 * riportato da `expo-notifications`, non solo la prima volta — "token
 * refresh/change handling". Nessun invio di notifiche parte da qui: e solo
 * l'anagrafica del destinatario.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticatedUser(request);
  if (!session) {
    return UNAUTHENTICATED_RESPONSE;
  }

  const rateLimit = await consumeRequestRateLimits([
    {
      policy: AUTH_RATE_LIMITS.deviceTokenAccount,
      identifier: `device-token:${session.db.user_id}`,
    },
  ]);
  if (rateLimit) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Troppe richieste. Riprova più tardi.",
          code: "RATE_LIMITED",
        },
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  let token = "";
  let platform: "ios" | "android" = "ios";
  try {
    const body = await request.json().catch(() => ({}));
    const input = parseInput(deviceTokenInputSchema, body);
    token = input.token;
    platform = input.platform;
  } catch (error) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  try {
    await registerDevicePushToken({
      userId: session.db.user_id,
      sessionId: session.db.id,
      token,
      platform,
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.authDeviceTokenRegistered,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      request,
      // Mai il token stesso: `sanitizeMetadata` lo rimuoverebbe comunque
      // (contiene "token"), ma qui non lo si passa proprio.
      metadata: { platform },
    });

    return NextResponse.json({ data: { registered: true }, error: null });
  } catch (error: any) {
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/v1/auth/device-tokens",
      method: "POST",
    });
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Impossibile registrare il dispositivo",
          code: "DEVICE_TOKEN_REGISTER_FAILED",
        },
      },
      { status: 400 },
    );
  }
}

/**
 * Revoca esplicita (l'utente disattiva le notifiche dall'app, senza fare
 * logout). Il logout stesso revoca gia i token della propria sessione — vedi
 * `revokeDevicePushTokensForSession` in `/api/v1/auth/logout` — questa rotta
 * serve al caso in cui l'account resta collegato ma il dispositivo non deve
 * piu ricevere notifiche.
 */
export async function DELETE(request: Request) {
  const session = await requireAuthenticatedUser(request);
  if (!session) {
    return UNAUTHENTICATED_RESPONSE;
  }

  let token = "";
  try {
    const body = await request.json().catch(() => ({}));
    const input = parseInput(deviceTokenRevokeInputSchema, body);
    token = input.token;
  } catch (error) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  try {
    const revoked = await revokeDevicePushToken({
      userId: session.db.user_id,
      token,
    });

    if (revoked) {
      await recordAuditEvent({
        action: AUDIT_ACTIONS.authDeviceTokenRevoked,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        request,
      });
    }

    return NextResponse.json({ data: { revoked }, error: null });
  } catch (error: any) {
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/v1/auth/device-tokens",
      method: "DELETE",
    });
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Impossibile revocare il dispositivo",
          code: "DEVICE_TOKEN_REVOKE_FAILED",
        },
      },
      { status: 400 },
    );
  }
}
