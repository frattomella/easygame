import { NextResponse } from "next/server";
import {
  readRequestId,
  reportServerError,
} from "@/lib/server/observability";
import { attachSessionCookie, serializeAuthUser } from "@/lib/server/auth";
import {
  buildPendingVerificationResponse,
  confirmEmailVerification,
  finalizeVerifiedSession,
} from "@/lib/server/auth-workflows";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body?.userId || "").trim();
    const code = String(body?.code || "").trim();

    if (!userId || !code) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "userId e codice sono obbligatori" },
        },
        { status: 400 },
      );
    }

    const rateLimit = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpConfirm,
        identifier: `email:${userId}:${getRequestIp(request)}`,
      },
    ]);
    if (rateLimit) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi tentativi. Richiedi un nuovo codice.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const verifiedUser = await confirmEmailVerification(userId, code);
    const finalized = await finalizeVerifiedSession(verifiedUser.id);

    if (!finalized.session) {
      const pending = await buildPendingVerificationResponse(verifiedUser.id);
      return NextResponse.json({
        data: {
          user: serializeAuthUser(pending.user),
          session: null,
          verification: pending.verification,
        },
        error: null,
      });
    }

    const response = NextResponse.json({
      data: {
        user: finalized.session.user,
        session: finalized.session,
        verification: finalized.verification,
      },
      error: null,
    });

    attachSessionCookie(response, finalized.session);
    return response;
  } catch (error: any) {
    if (error?.message !== "Codice non valido o scaduto") {
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
        route: "/api/v1/auth/verify/email/confirm",
        method: "POST",
      });
    }
    return NextResponse.json(
      {
        data: null,
        error: { message: "Codice non valido o scaduto" },
      },
      { status: 400 },
    );
  }
}
