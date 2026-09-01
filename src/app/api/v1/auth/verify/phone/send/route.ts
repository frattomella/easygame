import { NextResponse } from "next/server";
import {
  readRequestId,
  reportServerError,
} from "@/lib/server/observability";
import {
  findUserByVerificationReference,
  sendPhoneVerificationChallenge,
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

    if (!userId) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "userId obbligatorio" },
        },
        { status: 400 },
      );
    }

    const rateLimit = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpSend,
        identifier: `phone:${userId}:${getRequestIp(request)}`,
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

    if (!user || !user.phone || user.phone_verified_at) {
      return NextResponse.json({
        data: { sent: true, previewCode: null },
        error: null,
      });
    }

    const challenge = await sendPhoneVerificationChallenge(user, "verify_phone");
    return NextResponse.json({
      data: {
        sent: true,
        previewCode: challenge.previewCode,
      },
      error: null,
    });
  } catch (error: any) {
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
      route: "/api/v1/auth/verify/phone/send",
      method: "POST",
    });
    return NextResponse.json(
      {
        data: null,
        error: { message: "Errore invio verifica telefono" },
      },
      { status: 500 },
    );
  }
}
