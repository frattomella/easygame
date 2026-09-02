import { NextResponse } from "next/server";
import {
  findUserByVerificationReference,
  sendEmailVerificationChallenge,
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
import { EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE } from "@/lib/auth/email-verification-policy";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body?.userId || "").trim();

    if (!userId) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "userId obbligatorio" },
        },
        { status: 400 },
      );
    }

    if (!(await isEmailDeliveryConfigured())) {
      return NextResponse.json(
        {
          data: { sent: false, previewCode: null },
          error: {
            message: EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE,
            code: "EMAIL_SERVICE_UNAVAILABLE",
          },
        },
        { status: 503 },
      );
    }

    const rateLimit = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpSend,
        identifier: `email:${userId}:${getRequestIp(request)}`,
      },
    ]);
    if (rateLimit) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi reinvii. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const user = await findUserByVerificationReference(userId);

    if (!user || user.email_verified_at) {
      return NextResponse.json({
        data: { sent: true, previewCode: null },
        error: null,
      });
    }

    const challenge = await sendEmailVerificationChallenge(
      user,
      "verify_email",
    );
    return NextResponse.json({
      data: {
        sent: true,
        previewCode: challenge.previewCode,
      },
      error: null,
    });
  } catch (error: any) {
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json(
        {
          data: { sent: false, previewCode: null },
          error: {
            message: getEmailErrorMessage(error.code),
            code: error.code,
          },
        },
        { status: 503 },
      );
    }
    /* eslint-disable-next-line no-console -- un codice di esito, nessun errore */
    console.error("Email verification resend error", {
      code: "EMAIL_VERIFICATION_RESEND_FAILED",
    });
    return NextResponse.json(
      {
        data: null,
        error: { message: "Errore invio verifica email" },
      },
      { status: 500 },
    );
  }
}
