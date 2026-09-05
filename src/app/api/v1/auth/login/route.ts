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
  serializeAuthUserWithoutSession,
  verifyPassword,
} from "@/lib/server/auth";
import {
  VerificationRejected,
  buildOtpTargetCounterKey,
  ensureVerificationReference,
  finalizeVerifiedSession,
  isPhoneVerificationBlocking,
  maskStoredPhone,
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

    /*
      **L'email non ferma piu il login (ADR-0115).**

      Qui c'era un 403 `EMAIL_NOT_VERIFIED` che rimandava indietro chiunque non
      avesse confermato l'indirizzo, e su un'installazione senza SMTP quel ramo
      non poteva nemmeno mandare il codice: l'account restava inutilizzabile per
      sempre. La regola nuova e che l'indirizzo e obbligatorio e si verifica
      **dopo**; l'avviso e la chiamata all'azione vivono sulla pagina Account,
      che adesso si puo raggiungere.

      Resta il blocco del telefono, ed e l'unico: sotto, `finalizeVerifiedSession`
      restituisce `session: null` quando `isPhoneVerificationBlocking`, e questa
      rotta risponde 403 `PHONE_NOT_VERIFIED` mandando il codice. Un ramo solo
      invece dei due che c'erano: chi decide che cosa blocchi e il dominio, non
      la rotta, ed e la ragione per cui prima le due condizioni erano scritte
      qui **e** dentro `finalizeVerifiedSession`, con il rischio di divergere.
    */
    if (isPhoneVerificationBlocking(user)) {
      const otpRateLimit = await consumeRequestRateLimits([
        {
          policy: AUTH_RATE_LIMITS.otpSendIp,
          identifier: `phone:ip:${ip}`,
        },
        {
          policy: AUTH_RATE_LIMITS.otpSendAccount,
          identifier: `phone:account:${user.id}`,
        },
        /*
          **Anche l'asse per destinatario** (HIGH-3 della revisione ostile
          PP-05A). Mancava qui come mancava nella registrazione: il numero e
          l'unica cosa che l'attaccante non puo cambiare a costo zero, e quindi
          l'unico asse che conta davvero contro il pompaggio di SMS. Qui serve
          la password, quindi la strada e stretta — ma il contatore per numero
          e condiviso con le altre rotte, ed e li che deve maturare.
        */
        {
          policy: AUTH_RATE_LIMITS.otpSendTarget,
          /* La forma canonica la impone `buildOtpTargetCounterKey` (M-4). */
          identifier: `phone:target:${buildOtpTargetCounterKey(
            String(user.phone || ""),
          )}`,
        },
      ]);
      if (otpRateLimit) return rateLimitedResponse(otpRateLimit);

      /*
        Il cooldown non deve trasformare un login in un errore: se il codice e
        partito da meno di un minuto, quello che la persona ha in mano e ancora
        buono, e la risposta e la stessa.
      */
      const phoneChallenge = await sendPhoneVerificationChallenge(
        user,
        "login",
      ).catch((error) => {
        if (
          error instanceof VerificationRejected &&
          error.code === "RESEND_TOO_SOON"
        ) {
          return { sent: false, previewCode: null };
        }
        throw error;
      });

      const riferimento = await ensureVerificationReference(user);

      return NextResponse.json(
        {
          data: {
            user: serializeAuthUserWithoutSession(user),
            session: null,
            verification: {
              /*
                **Il riferimento opaco, non l'UUID** (M-1 del secondo round).
                Qui usciva `user.id` in chiaro: un valore che non cambia mai,
                che l'occupante di un account aveva gia, e che rendeva vana la
                rotazione del riferimento fatta dallo sfratto. Il riferimento
                si crea se manca: e un segreto lungo, e si puo ruotare.
              */
              userId: riferimento,
              email: user.email,
              /* Mascherato: vedi `buildVerificationPayload`. */
              phone: maskStoredPhone(user.phone),
              emailRequired: !user.email_verified_at,
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
            user: serializeAuthUserWithoutSession(finalized.user),
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
