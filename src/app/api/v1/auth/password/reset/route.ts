import { NextResponse } from "next/server";
import { confirmPasswordReset } from "@/lib/server/auth-workflows";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";

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

    await confirmPasswordReset({ userId, token, password });

    return NextResponse.json({
      data: {
        reset: true,
        message:
          "Password aggiornata. Le sessioni aperte sono state chiuse: accedi con la nuova password.",
      },
      error: null,
    });
  } catch (error: any) {
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
