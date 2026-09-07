import { NextResponse } from "next/server";
import {
  readRequestId,
  reportServerError,
} from "@/lib/server/observability";
import {
  attachSessionCookie,
  getSessionFromRequest,
  serializeAuthUserWithoutSession,
} from "@/lib/server/auth";
import {
  VerificationRejected,
  buildPendingVerificationResponse,
  challengePurposeCanMintSession,
  confirmEmailVerification,
  finalizeVerifiedSession,
  findUserByVerificationReference,
} from "@/lib/server/auth-workflows";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import type { AuthRateLimitResult } from "@/lib/auth/rate-limit-policy";

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

    /* Due assi, come sulla conferma del telefono (PP-05). */
    const troppiTentativi = (esito: AuthRateLimitResult) =>
      NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi tentativi. Richiedi un nuovo codice.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(esito) },
      );

    const perRete = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpConfirmIp,
        identifier: `email:ip:${getRequestIp(request)}`,
      },
    ]);
    if (perRete) return troppiTentativi(perRete);

    /*
      **L'UUID nudo vale solo per chi ha gia una sessione su quell'account**
      (M-1 del secondo round). Chi arriva dalla pagina Account manda il proprio
      identificativo e ha la sessione; chi arriva dalla registrazione o dal
      login manda il riferimento opaco. Nessun altro puo pilotare questa rotta
      su un account che non e suo.
    */
    const sessioneCorrente = await getSessionFromRequest(request);

    /*
      **L'asse «per account» si consuma sull'account, non sulla stringa**
      (quinto round della revisione ostile, MEDIUM). Vedi la rotta gemella del
      telefono per la ragione per esteso.
    */
    const utente = await findUserByVerificationReference(
      userId,
      sessioneCorrente?.db.user_id,
    );
    const perAccount = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpConfirm,
        identifier: `email:account:${utente?.id || userId}`,
      },
    ]);
    if (perAccount) return troppiTentativi(perAccount);

    const { user: verifiedUser, purpose } = await confirmEmailVerification(
      userId,
      code,
      sessioneCorrente?.db.user_id,
    );

    /* Stessa regola della rotta gemella (CRITICAL-1, ADR-0134). */
    const finalized = challengePurposeCanMintSession(purpose)
      ? await finalizeVerifiedSession(verifiedUser.id)
      : { session: null, verification: null };

    if (!finalized.session) {
      const pending = await buildPendingVerificationResponse(verifiedUser.id);
      return NextResponse.json({
        data: {
          user: serializeAuthUserWithoutSession(pending.user),
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
    /* Un errore del server non e un codice sbagliato: vedi la rotta gemella. */
    if (!(error instanceof VerificationRejected)) {
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
      return NextResponse.json(
        {
          data: null,
          error: { message: "Verifica non riuscita" },
        },
        { status: 500 },
      );
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
