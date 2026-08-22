import { NextResponse } from "next/server";
import { confirmPasswordReset } from "@/lib/server/auth-workflows";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * Conclusione del reset password.
 *
 * Il token e valido una sola volta, scade dopo 30 minuti e, una volta usato,
 * invalida **tutte** le sessioni dell'utente.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!userId || !token || !password) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Richiesta incompleta", code: "VALIDATION_ERROR" },
        },
        { status: 400 },
      );
    }

    const ip = getRequestIp(request);
    const rateLimit = await consumeRequestRateLimits([
      { policy: AUTH_RATE_LIMITS.otpConfirm, identifier: `pwreset:${userId}` },
      { policy: AUTH_RATE_LIMITS.otpConfirm, identifier: `pwreset-ip:${ip}` },
    ]);
    if (rateLimit) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi tentativi. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const esito = await confirmPasswordReset({ userId, token, password });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.authPasswordResetCompleted,
      actorUserId: esito.userId,
      actorEmail: esito.email,
      request,
      metadata: { sessionsRevoked: true },
    });

    return NextResponse.json({
      data: {
        reset: true,
        message:
          "Password aggiornata. Le sessioni aperte sono state chiuse: accedi con la nuova password.",
      },
      error: null,
    });
  } catch (error: any) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.authPasswordResetFailed,
      outcome: "failure",
      request,
      // Nessun token e nessuna password nei metadati: solo il motivo.
      metadata: { reason: error?.message || "unknown" },
    });

    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Reset password non riuscito",
          code: "PASSWORD_RESET_FAILED",
        },
      },
      { status: 400 },
    );
  }
}
