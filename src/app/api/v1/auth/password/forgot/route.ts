import { NextResponse } from "next/server";
import {
  PASSWORD_RESET_GENERIC_MESSAGE,
  findUserByEmailForPasswordReset,
  sendPasswordResetChallenge,
} from "@/lib/server/auth-workflows";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import {
  EmailDeliveryError,
  getEmailErrorMessage,
  isEmailDeliveryConfigured,
} from "@/lib/server/email/email-service";

export const runtime = "nodejs";

/**
 * Avvio del reset password.
 *
 * Risponde **sempre** allo stesso modo, esista o no l'account: l'endpoint non
 * deve permettere di scoprire quali email sono registrate.
 */
export async function POST(request: Request) {
  const genericSuccess = NextResponse.json({
    data: { sent: true, message: PASSWORD_RESET_GENERIC_MESSAGE },
    error: null,
  });

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { data: null, error: { message: "Email obbligatoria" } },
        { status: 400 },
      );
    }

    const ip = getRequestIp(request);
    const rateLimit = await consumeRequestRateLimits([
      { policy: AUTH_RATE_LIMITS.otpSend, identifier: `pwreset:${email}` },
      { policy: AUTH_RATE_LIMITS.otpSend, identifier: `pwreset-ip:${ip}` },
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

    if (!(await isEmailDeliveryConfigured())) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Il servizio email non è configurato: il reset password non è disponibile.",
            code: "SMTP_CONFIGURATION_INVALID",
          },
        },
        { status: 503 },
      );
    }

    const user = await findUserByEmailForPasswordReset(email);
    if (!user) {
      // Nessun account: stessa risposta, nessun invio.
      return genericSuccess;
    }

    const challenge = await sendPasswordResetChallenge(user);

    return NextResponse.json({
      data: {
        sent: true,
        message: PASSWORD_RESET_GENERIC_MESSAGE,
        previewToken: challenge.previewCode,
      },
      error: null,
    });
  } catch (error: any) {
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json(
        {
          data: null,
          error: { message: getEmailErrorMessage(error.code), code: error.code },
        },
        { status: 503 },
      );
    }

    console.error("[auth/password/forgot]", error);
    // Anche in caso di errore inatteso non si rivela nulla sull'account.
    return genericSuccess;
  }
}
