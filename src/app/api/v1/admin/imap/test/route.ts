import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import {
  getImapErrorMessage,
  testImapConnection,
  toImapErrorCode,
} from "@/lib/server/email/imap-service";

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

  // Stesso tetto del test SMTP: un test di connessione apre una sessione
  // verso un server esterno e non deve poter essere ripetuto all'infinito.
  const rateLimit = await consumeRequestRateLimits([
    {
      policy: AUTH_RATE_LIMITS.otpSend,
      identifier: `imap-test:${session.db.user_id}:${getRequestIp(request)}`,
    },
  ]);
  if (rateLimit) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Troppi test IMAP. Riprova più tardi.",
          code: "RATE_LIMITED",
        },
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  try {
    await testImapConnection();
    return NextResponse.json({ data: { connected: true }, error: null });
  } catch (error) {
    const code = toImapErrorCode(error);
    return NextResponse.json(
      {
        data: { connected: false },
        error: { message: getImapErrorMessage(code), code },
      },
      { status: 502 },
    );
  }
}
