import { NextResponse } from "next/server";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import { readPublicEnrollmentStatus } from "@/lib/server/enrollment-requests";
import {
  ENROLLMENT_NOT_AVAILABLE_MESSAGE,
  hashEnrollmentReceiptReference,
} from "@/lib/forms/enrollment-receipt";

/**
 * **La ricevuta di un'iscrizione** (Wave 5, lane 5G, §16).
 *
 *   GET /api/public/enrollment-status/:reference
 *
 * La seconda superficie senza sessione del prodotto, dopo il modulo pubblico e
 * il link di pagamento. Esiste perche l'iscrizione online funzionava per il
 * club e non per la famiglia: si inviava, e poi non si sapeva piu niente.
 *
 * **Sola lettura, e non e una limitazione temporanea.** Da qui non si
 * modifica, non si carica un allegato e non si annulla niente: il riferimento
 * e anonimo, e un canale pubblico di **scrittura** ricorrente si progetta
 * (`W2-09`), non lo si aggiunge a una rotta di lettura perche era comodo.
 *
 * **Un solo esito negativo.** Riferimento vuoto, sconosciuto, o che punta a
 * una pratica sparita: sempre `404`, sempre lo stesso messaggio. Non si dice
 * «non e di questo club», che confermerebbe l'esistenza del riferimento
 * altrove — e la stessa regola gia adottata dallo slug dei moduli pubblici e
 * dal token dei pagamenti.
 *
 * **Cosa esce, e cosa no.** Esce lo stato della pratica e cio che il club
 * aspetta. Non escono le risposte del modulo — che sono la dichiarazione su un
 * minore, codice fiscale compreso — ne gli allegati, ne l'indirizzo di chi ha
 * compilato, ne nessun identificativo interno. L'elenco lo tiene chiuso
 * `buildPublicEnrollmentView`, che costruisce la vista da zero invece di
 * togliere campi da un record.
 *
 * Il limite di frequenza si consuma **prima** di toccare il database: un
 * tentativo fermato non deve costare una query.
 */

export const runtime = "nodejs";

type Context = { params: { reference: string } };

const notAvailable = () =>
  NextResponse.json(
    { data: null, error: { message: ENROLLMENT_NOT_AVAILABLE_MESSAGE } },
    { status: 404 },
  );

const tooManyRequests = (result: {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}) =>
  NextResponse.json(
    {
      data: null,
      error: {
        message: "Troppe richieste. Riprova fra qualche minuto.",
        code: "RATE_LIMITED",
      },
    },
    { status: 429, headers: rateLimitHeaders(result) },
  );

export async function GET(request: Request, context: Context) {
  try {
    const reference = String(context.params.reference || "");

    const limited = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.enrollmentStatusIp,
        identifier: getRequestIp(request),
      },
      {
        policy: AUTH_RATE_LIMITS.enrollmentStatusReference,
        identifier: hashEnrollmentReceiptReference(reference) || "vuoto",
      },
    ]);
    if (limited) return tooManyRequests(limited);

    const view = await readPublicEnrollmentStatus(reference);
    if (!view) return notAvailable();

    return NextResponse.json({ data: view, error: null });
  } catch (error: any) {
    /*
      A un estraneo non si raccontano gli errori interni; a chi tiene su il
      servizio si, ed e l'unico posto in cui il motivo resta leggibile. Il
      riferimento non entra nemmeno nei log: e una credenziale.
    */
    console.error("[enrollment-status] lettura non riuscita", {
      message: String(error?.message || error),
    });

    return NextResponse.json(
      { data: null, error: { message: "Errore nella lettura della domanda" } },
      { status: 500 },
    );
  }
}
