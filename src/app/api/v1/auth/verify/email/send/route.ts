import { NextResponse } from "next/server";
import {
  VerificationRejected,
  buildOtpTargetCounterKey,
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

    const ip = getRequestIp(request);

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

    /*
      Tre assi come sull'invio del codice al telefono (PP-05): indirizzo IP e
      account **prima** di sapere chi sia il riferimento — cosi provare un
      riferimento a caso costa quanto provarne uno valido — e destinatario
      subito dopo, per impronta e mai in chiaro.
    */
    const primoGiro = await consumeRequestRateLimits([
      { policy: AUTH_RATE_LIMITS.otpSendIp, identifier: `email:ip:${ip}` },
      {
        policy: AUTH_RATE_LIMITS.otpSendAccount,
        identifier: `email:account:${userId}`,
      },
    ]);
    if (primoGiro) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi reinvii. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(primoGiro) },
      );
    }

    const user = await findUserByVerificationReference(userId);

    if (!user || user.email_verified_at) {
      return NextResponse.json({
        data: { sent: true, previewCode: null },
        error: null,
      });
    }

    const perIndirizzo = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpSendTarget,
        identifier: `email:target:${buildOtpTargetCounterKey(user.email)}`,
      },
    ]);
    if (perIndirizzo) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi reinvii verso questo indirizzo. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(perIndirizzo) },
      );
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
    /* Il cooldown non e un errore del server: vedi la rotta gemella del telefono. */
    if (
      error instanceof VerificationRejected &&
      error.code === "RESEND_TOO_SOON"
    ) {
      const attesa = error.retryAfterSeconds || 1;
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Attendi ${attesa} secondi prima di richiedere un altro codice.`,
            code: "RESEND_TOO_SOON",
          },
        },
        { status: 429, headers: { "Retry-After": String(attesa) } },
      );
    }
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
