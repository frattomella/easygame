import { NextResponse } from "next/server";
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
    const body = await request.json();
    const email = String(body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: "Email e password sono obbligatori" },
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
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: "Invalid login credentials" },
        },
        { status: 401 },
      );
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: "Invalid login credentials" },
        },
        { status: 401 },
      );
    }

    if (!user.email_verified_at) {
      const otpRateLimit = await consumeRequestRateLimits([
        {
          policy: AUTH_RATE_LIMITS.otpSend,
          identifier: `email:${user.id}:${ip}`,
        },
      ]);
      if (otpRateLimit) return rateLimitedResponse(otpRateLimit);

      const emailChallenge = await sendEmailVerificationChallenge(
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
    return response;
  } catch (error: any) {
    if (isPrismaConnectionError(error)) {
      console.error("Login database connection error:", {
        databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
        directUrlConfigured: Boolean(process.env.DIRECT_URL),
        message: error?.message,
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

    console.error("Login error:", error);
    return NextResponse.json(
      {
        data: { user: null, session: null },
        error: { message: "Errore durante il login" },
      },
      { status: 500 },
    );
  }
}
