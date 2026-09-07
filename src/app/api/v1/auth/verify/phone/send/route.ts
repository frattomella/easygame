import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  readRequestId,
  reportServerError,
} from "@/lib/server/observability";
import {
  VerificationRejected,
  buildOtpTargetCounterKey,
  findUserByVerificationReference,
  sendPhoneVerificationChallenge,
} from "@/lib/server/auth-workflows";
import { normalizePhoneNumber } from "@/lib/auth/phone-number";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import type { AuthRateLimitResult } from "@/lib/auth/rate-limit-policy";

/**
 * **La risposta non dice se il numero esiste.**
 *
 * Un riferimento sconosciuto, un utente senza numero, un numero gia verificato
 * e un invio riuscito danno tutti `{ sent: true }`. E la stessa regola del
 * recupero password (`PASSWORD_RESET_GENERIC_MESSAGE`), e vale anche per il
 * **tempo**: sotto non c'e nessun ramo che costi visibilmente piu degli altri
 * — nessun bcrypt, nessuna chiamata di rete condizionata — perche l'unica
 * consegna che potrebbe farsi attendere e a valle di una challenge scritta,
 * cioe dentro il ramo che gia esiste.
 *
 * L'unica risposta diversa e il 429, e la si ottiene solo avendo gia in mano
 * un riferimento valido: e un segreto lungo, non un identificativo che si
 * indovina.
 */
const rispostaOpaca = () =>
  NextResponse.json({
    data: { sent: true, previewCode: null },
    error: null,
  });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
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

    /*
      **Tre assi (PP-05).** Prima la chiave era una sola,
      `phone:<utente>:<indirizzo>`: chi cambiava indirizzo IP ripartiva da zero
      e poteva far arrivare SMS senza fine al numero di un'altra persona,
      invalidandole ogni volta il codice appena ricevuto. Adesso si contano
      account e indirizzo prima ancora di sapere chi sia il riferimento — cosi
      il costo di provare un riferimento a caso e lo stesso di provarne uno
      valido — e il **numero** subito dopo, quando lo si conosce.
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
      { policy: AUTH_RATE_LIMITS.otpSendIp, identifier: `phone:ip:${ip}` },
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
      (quinto round della revisione ostile, MEDIUM). Lo stesso account si nomina
      in tre modi — il riferimento opaco corrente, l'UUID nudo per chi ha la
      sessione, e un riferimento appena ruotato — e contarli come chiavi diverse
      dava **tre secchielli** allo stesso account: misurati quindici passaggi su
      un tetto dichiarato di cinque. Il prodotto ruota il riferimento da se, in
      tre punti, quindi era un asse **azzerabile su richiesta**.

      Un riferimento che non risolve nessuno ricade sulla stringa grezza, e non
      per pigrizia: chi pesca riferimenti a caso deve pagare lo stesso prezzo di
      chi ne ha uno valido, altrimenti la differenza fra i due 429 direbbe quali
      riferimenti esistono. L'asse per rete resta **prima** della risoluzione, e
      copre il costo della lettura.
    */
    const secondoGiro = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpSendAccount,
        identifier: `phone:account:${user?.id || userId}`,
      },
    ]);
    if (secondoGiro) return troppeRichieste(secondoGiro);

    if (!user || !user.phone || user.phone_verified_at) {
      return rispostaOpaca();
    }

    const numero = normalizePhoneNumber(user.phone);
    if (!numero.valid) return rispostaOpaca();

    /*
      Il contatore **per numero** usa l'impronta e mai il numero in chiaro: i
      secchielli non devono diventare un secondo archivio da cui leggere i
      recapiti di chi si registra. Stessa scelta gia fatta per il riferimento
      di un'iscrizione (`enrollmentStatusReference`).
    */
    const perNumero = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpSendTarget,
        identifier: `phone:target:${buildOtpTargetCounterKey(numero.e164)}`,
      },
    ]);
    if (perNumero) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi reinvii verso questo numero. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(perNumero) },
      );
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
      Il cooldown non e un errore del server: e la risposta prevista a un
      secondo clic sul pulsante «rimanda». Porta con se i secondi che mancano,
      perche una schermata che dice «attendi» senza dire quanto fa premere di
      nuovo subito.
    */
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
