import { NextResponse } from "next/server";
import {
  readRequestId,
  reportServerError,
} from "@/lib/server/observability";
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
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * Avvio del reset password.
 *
 * Risponde **sempre** allo stesso modo, esista o no l'account: l'endpoint non
 * deve permettere di scoprire quali email sono registrate.
 */
export async function POST(request: Request) {
  /**
   * La risposta deve essere **identica byte per byte** che l'account esista o
   * no: una differenza anche solo di forma (un campo in piu) sarebbe un
   * oracolo di esistenza. `previewToken` compare quindi solo quando e
   * davvero valorizzato, cioe fuori produzione con AUTH_ALLOW_TEST_CODES.
   */
  const rispostaGenerica = (previewToken: string | null = null) =>
    NextResponse.json({
      data: {
        sent: true,
        message: PASSWORD_RESET_GENERIC_MESSAGE,
        ...(previewToken ? { previewToken } : {}),
      },
      error: null,
    });

  const genericSuccess = rispostaGenerica();

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

    await recordAuditEvent({
      action: AUDIT_ACTIONS.authPasswordResetRequested,
      actorUserId: user.id,
      actorEmail: user.email,
      request,
      metadata: { delivered: challenge.sent },
    });

    return rispostaGenerica(challenge.previewCode);
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
      route: "/api/v1/auth/password/forgot",
      method: "POST",
    });
    // Anche in caso di errore inatteso non si rivela nulla sull'account.
    return genericSuccess;
  }
}
