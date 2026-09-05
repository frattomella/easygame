import { NextResponse } from "next/server";
import {
  readRequestId,
  reportServerError,
} from "@/lib/server/observability";
import { getSessionFromRequest } from "@/lib/server/auth";
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
import type { AuthRateLimitResult } from "@/lib/auth/rate-limit-policy";
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
      Tre assi come sull'invio del codice al telefono (PP-05): la **rete**
      prima di sapere chi sia il riferimento — cosi provare un riferimento a
      caso costa quanto provarne uno valido, e l'asse per rete copre il costo
      della lettura — poi l'**account**, e infine il **destinatario**, per
      impronta e mai in chiaro.
    */
    const troppeRichieste = (esito: AuthRateLimitResult) =>
      NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi reinvii. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(esito) },
      );

    const primoGiro = await consumeRequestRateLimits([
      { policy: AUTH_RATE_LIMITS.otpSendIp, identifier: `email:ip:${ip}` },
    ]);
    if (primoGiro) return troppeRichieste(primoGiro);

    /*
      **L'UUID nudo vale solo per chi ha gia una sessione su quell'account**
      (M-1 del secondo round): senza questo vincolo la rotazione del riferimento
      nello sfratto era teatro, e chiunque avesse raccolto UUID utente — che
      circolano in molte proiezioni club-scoped — poteva pilotare questa rotta
      su account altrui e distinguere un identificativo vero da uno inventato.
    */
    const sessioneCorrente = await getSessionFromRequest(request);
    const user = await findUserByVerificationReference(
      userId,
      sessioneCorrente?.db.user_id,
    );

    /*
      **L'asse «per account» si consuma sull'account, non sulla stringa**
      (quinto round della revisione ostile, MEDIUM). Vedi la rotta gemella del
      telefono per la ragione per esteso: lo stesso account si nomina in piu
      modi — il riferimento opaco corrente, l'UUID nudo per chi ha la sessione,
      e un riferimento appena ruotato — e contarli come chiavi diverse dava un
      secchiello per nome. Un riferimento che non risolve nessuno ricade sulla
      stringa grezza, cosi chi pesca riferimenti a caso paga lo stesso prezzo
      di chi ne ha uno valido.
    */
    const secondoGiro = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpSendAccount,
        identifier: `email:account:${user?.id || userId}`,
      },
    ]);
    if (secondoGiro) return troppeRichieste(secondoGiro);

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
    /*
      **Il punto unico degli errori, come ogni altra rotta** (CLAUDE.md §2, e
      L-5 del secondo round della revisione ostile). Qui viveva un
      `console.error` con la sua deroga scritta a mano: la deroga era
      difendibile — usciva solo un codice — ma un secondo posto da cui si
      scrive nei log e un secondo posto da controllare, e la riga non portava
      l'identificativo di richiesta, quindi non si poteva mettere in fila con
      le altre della stessa richiesta.
    */
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/v1/auth/verify/email/send",
      method: "POST",
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
