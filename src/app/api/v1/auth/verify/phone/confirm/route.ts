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
  confirmPhoneVerification,
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

    /*
      **Due assi anche sulla conferma (PP-05).** La chiave era
      `canale:utente:indirizzo`: chi cambiava rete azzerava il contatore. Il
      tetto vero resta quello della challenge — cinque tentativi, in una
      scrittura condizionata sola — ma questi contatori fermano chi si fa
      emettere challenge nuove per avere tentativi nuovi, e per farlo devono
      contare l'account **indipendentemente** dalla rete da cui arriva.
    */
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
        identifier: `phone:ip:${getRequestIp(request)}`,
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
      (quinto round della revisione ostile, MEDIUM). Qui pesa piu che
      sull'invio: e il contatore che limita i tentativi di indovinare un codice
      a sei cifre **oltre** i cinque della challenge, e contarlo su una stringa
      scelta da chi chiama ne apriva uno per nome — misurate dieci prove su un
      tetto dichiarato di cinque, con i due nomi dello stesso account. Il
      prodotto ruota il riferimento da se, in tre punti, quindi era un asse
      **azzerabile su richiesta** proprio dove serve di piu.

      Un riferimento che non risolve nessuno ricade sulla stringa grezza: chi
      pesca riferimenti a caso deve pagare lo stesso prezzo di chi ne ha uno
      valido, altrimenti la differenza fra i due 429 direbbe quali riferimenti
      esistono. L'asse per rete resta **prima** della risoluzione, e copre il
      costo della lettura.
    */
    const utente = await findUserByVerificationReference(
      userId,
      sessioneCorrente?.db.user_id,
    );
    const perAccount = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpConfirm,
        identifier: `phone:account:${utente?.id || userId}`,
      },
    ]);
    if (perAccount) return troppiTentativi(perAccount);

    const { user: verifiedUser, purpose } = await confirmPhoneVerification(
      userId,
      code,
      sessioneCorrente?.db.user_id,
    );

    /*
      **Un codice apre una sessione solo se la porta era gia stata aperta**
      (CRITICAL-1, ADR-0134). Un codice chiesto da `/verify/phone/send` ha
      scopo `verify_phone`: conferma il numero e basta. Chi lo chiede dall'area
      Account una sessione ce l'ha gia; chi lo chiede senza averla non deve
      ottenerne una presentando solo un identificativo e un codice SMS.
    */
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
    /*
      **Un errore del server non e un codice sbagliato (PP-05).**

      Questo `catch` rispondeva 400 «Codice non valido o scaduto» a *qualunque*
      eccezione: un guasto del database, una sessione che non si crea, un
      difetto introdotto a valle. Chi guardava lo schermo leggeva «il codice e
      sbagliato», riscriveva lo stesso codice, e bruciava i cinque tentativi
      contro un guasto che non c'entrava niente — mentre chi guardava i log non
      vedeva la riga, perche il ramo del codice sbagliato non registra nulla.

      Adesso solo `VerificationRejected` — l'errore che il dominio solleva
      quando il codice davvero non vale — produce il 400. Tutto il resto e un
      500 registrato, come su ogni altra rotta.
    */
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
        route: "/api/v1/auth/verify/phone/confirm",
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
