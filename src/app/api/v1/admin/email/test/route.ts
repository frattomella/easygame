import { NextResponse } from "next/server";
import { smtpTestInputSchema } from "@/lib/email/smtp-config";
import { requirePlatformAdmin } from "@/lib/server/auth";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import {
  EmailDeliveryError,
  getEmailErrorMessage,
  testSmtpDelivery,
} from "@/lib/server/email/email-service";

export async function POST(request: Request) {
  const session = await requirePlatformAdmin(request);
  if (!session) {
    return NextResponse.json(
      {
        data: null,
        error: { message: "Accesso riservato all'amministratore piattaforma" },
      },
      { status: 403 },
    );
  }

  const parsed = smtpTestInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: parsed.error.issues[0]?.message || "Destinatario non valido",
          code: "SMTP_TEST_VALIDATION_FAILED",
        },
      },
      { status: 400 },
    );
  }

  const rateLimit = await consumeRequestRateLimits([
    {
      policy: AUTH_RATE_LIMITS.otpSend,
      identifier: `smtp-test:${session.db.user_id}:${getRequestIp(request)}`,
    },
  ]);
  if (rateLimit) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Troppi test SMTP. Riprova più tardi.",
          code: "RATE_LIMITED",
        },
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  try {
    await testSmtpDelivery(parsed.data.to);
    return NextResponse.json({ data: { sent: true }, error: null });
  } catch (error) {
    const code =
      error instanceof EmailDeliveryError ? error.code : "SMTP_DELIVERY_FAILED";
    return NextResponse.json(
      {
        data: { sent: false },
        error: { message: getEmailErrorMessage(code), code },
      },
      { status: 502 },
    );
  }
}
