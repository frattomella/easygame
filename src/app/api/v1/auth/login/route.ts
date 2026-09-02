import { NextResponse } from "next/server";
import {
  readRequestId,
  reportServerError,
} from "@/lib/server/observability";
import {
  getPrismaConnectionErrorMessage,
  isPrismaConnectionError,
  prisma,
} from "@/lib/server/prisma";
import {
  attachSessionCookie,
  serializeAuthUser,
  verifyPassword,
} from "@/lib/server/auth";
import {
  finalizeVerifiedSession,
  isPhoneVerificationEnabled,
  sendEmailVerificationChallenge,
  sendPhoneVerificationChallenge,
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
import { resolveEmailVerificationPolicy } from "@/lib/auth/email-verification-policy";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { parseInput, validationErrorPayload } from "@/lib/validation";
import { loginInputSchema } from "@/lib/validation/schemas";

/**
 * Un solo messaggio per «utente sconosciuto» e «password sbagliata»: distinguerli
 * direbbe a chi prova indirizzi a caso quali esistono. In italiano come il resto
 * del prodotto — questa frase e la prima che un utente legge quando sbaglia.
 */
const INVALID_CREDENTIALS_MESSAGE = "Email o password non corretti";

const DUMMY_PASSWORD_HASH =
  "$2a$10$3gQkUQ3VL89S/gY5KFIC0OG/lquhesFrvFvKtZk4ebmerY.cPiUuO";

const rateLimitedResponse = (result: {
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
}) =>
  NextResponse.json(
    {
      data: { user: null, session: null },
      error: {
        message: "Troppe richieste. Riprova più tardi.",
        code: "RATE_LIMITED",
      },
    },
    { status: 429, headers: rateLimitHeaders({ ...result, allowed: false }) },
  );

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    /*
      La forma del corpo la dichiara uno schema, non tre coercizioni a mano:
      cosi «quanto puo essere lunga un'email» ha una risposta sola in tutto il
      progetto, e chi legge la rotta vede cosa accetta senza ricostruirlo dal
      codice che la smonta (D14, WP-05).
    */
    let email = "";
    let password = "";
    try {
      const input = parseInput(loginInputSchema, body);
      email = input.email;
      password = input.password;
    } catch (error) {
      return NextResponse.json(
        {
          ...validationErrorPayload(error),
          data: { user: null, session: null },
        },
        { status: 400 },
      );
    }

    const ip = getRequestIp(request);
    const loginRateLimit = await consumeRequestRateLimits([
      { policy: AUTH_RATE_LIMITS.loginIp, identifier: `ip:${ip}` },
      {
        policy: AUTH_RATE_LIMITS.loginIdentity,
        identifier: `identity:${email}`,
      },
    ]);
    if (loginRateLimit) return rateLimitedResponse(loginRateLimit);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      await recordAuditEvent({
        action: AUDIT_ACTIONS.authLoginFailure,
        outcome: "failure",
        actorEmail: email,
        request,
        metadata: { reason: "unknown_account" },
      });
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: INVALID_CREDENTIALS_MESSAGE },
        },
        { status: 401 },
      );
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      await recordAuditEvent({
        action: AUDIT_ACTIONS.authLoginFailure,
        outcome: "failure",
        actorUserId: user.id,
        actorEmail: user.email,
        request,
        metadata: { reason: "wrong_password" },
      });
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: INVALID_CREDENTIALS_MESSAGE },
        },
        { status: 401 },
      );
    }

    if (!user.email_verified_at) {
      const emailVerificationPolicy = resolveEmailVerificationPolicy(
        await isEmailDeliveryConfigured(),
      );
      if (emailVerificationPolicy.canSendOtp) {
        const otpRateLimit = await consumeRequestRateLimits([
          {
            policy: AUTH_RATE_LIMITS.otpSend,
            identifier: `email:${user.id}:${ip}`,
          },
        ]);
        if (otpRateLimit) return rateLimitedResponse(otpRateLimit);
      }

      const emailChallenge = emailVerificationPolicy.canSendOtp
        ? await sendEmailVerificationChallenge(user, "login")
        : { sent: false, previewCode: null };
      return NextResponse.json(
        {
          data: {
            user: serializeAuthUser(user),
            session: null,
            verification: {
              userId: user.id,
              email: user.email,
              phone: user.phone || null,
              emailRequired: true,
              phoneRequired: Boolean(
                isPhoneVerificationEnabled() &&
                  user.phone_verification_required &&
                  user.phone,
              ),
              emailPreviewCode: emailChallenge.previewCode,
            },
          },
          error: {
            message: "Email non verificata",
            code: "EMAIL_NOT_VERIFIED",
          },
        },
        { status: 403 },
      );
    }

    if (
      isPhoneVerificationEnabled() &&
      user.phone_verification_required &&
      user.phone &&
      !user.phone_verified_at
    ) {
      const otpRateLimit = await consumeRequestRateLimits([
        {
          policy: AUTH_RATE_LIMITS.otpSend,
          identifier: `phone:${user.id}:${ip}`,
        },
      ]);
      if (otpRateLimit) return rateLimitedResponse(otpRateLimit);

      const phoneChallenge = await sendPhoneVerificationChallenge(
        user,
        "login",
      );
      return NextResponse.json(
        {
          data: {
            user: serializeAuthUser(user),
            session: null,
            verification: {
              userId: user.id,
              email: user.email,
              phone: user.phone,
              emailRequired: false,
              phoneRequired: true,
              phonePreviewCode: phoneChallenge.previewCode,
            },
          },
          error: {
            message: "Telefono non verificato",
            code: "PHONE_NOT_VERIFIED",
          },
        },
        { status: 403 },
      );
    }

    const finalized = await finalizeVerifiedSession(user.id);
    if (!finalized.session) {
      return NextResponse.json(
        {
          data: {
            user: serializeAuthUser(finalized.user),
            session: null,
            verification: finalized.verification,
          },
          error: {
            message: "Verifica account incompleta",
            code: "VERIFICATION_REQUIRED",
          },
        },
        { status: 403 },
      );
    }

    const session = finalized.session;
    const response = NextResponse.json({
      data: {
        user: session.user,
        session,
      },
      error: null,
    });

    attachSessionCookie(response, session);

    await recordAuditEvent({
      action: AUDIT_ACTIONS.authLoginSuccess,
      actorUserId: finalized.user.id,
      actorEmail: finalized.user.email,
      actorRole: finalized.user.role,
      request,
    });

    return response;
  } catch (error: any) {
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: getEmailErrorMessage(error.code),
            code: error.code,
          },
        },
        { status: 503 },
      );
    }
    if (isPrismaConnectionError(error)) {
      reportServerError(error, {
        route: "/api/v1/auth/login",
        metadata: {
          databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
          directUrlConfigured: Boolean(process.env.DIRECT_URL),
        },
      });

      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: getPrismaConnectionErrorMessage(),
            code: "DATABASE_UNAVAILABLE",
          },
        },
        { status: 503 },
      );
    }

    /*
      **Non l'errore intero** (ADR-0019: i log non devono contenere dati personali).
      Il messaggio di un errore di validazione dell'ORM porta con se l'oggetto che
      si stava scrivendo: su questi flussi vuol dire password, hash e codici di
      verifica. Il punto unico lo riduce a nome, messaggio e codice, e ci mette
      l'identificativo di richiesta perche due righe della stessa richiesta si
      possano finalmente mettere in fila.
    */
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/v1/auth/login",
      method: "POST",
    });
    return NextResponse.json(
      {
        data: { user: null, session: null },
        error: { message: "Errore durante il login" },
      },
      { status: 500 },
    );
  }
}
