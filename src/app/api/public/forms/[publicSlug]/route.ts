import { NextResponse } from "next/server";
import { findPublicFormBySlug } from "@/lib/server/forms";
import {
  FormSubmissionError,
  submitPublicForm,
} from "@/lib/server/form-submissions";
import { readSubmissionPayload } from "@/lib/server/form-request";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimit,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";

/**
 * Il modulo pubblico: l'unico endpoint di EasyGame che risponde a chi non ha
 * una sessione e scrive nel database di un club.
 *
 *   GET  /api/public/forms/:slug   il modulo da compilare
 *   POST /api/public/forms/:slug   l'invio
 *
 * **Cosa arriva dal client e cosa no.** Dal client arrivano le risposte e i
 * file. Non arrivano — e non verrebbero creduti — il club, il modulo, la
 * versione, lo stato o il collegamento a una persona: quelli li ricava il
 * server dallo slug, che e l'unica cosa che il client sa.
 *
 * **Un solo esito negativo.** Slug inesistente, modulo in bozza, link
 * disabilitato, modulo chiuso: sempre 404. Distinguere i casi direbbe a chi
 * prova gli slug quali ha indovinato.
 *
 * **Rate limiting per indirizzo.** Aprire un modulo e quasi gratuito;
 * inviarlo crea righe e allegati. I due contatori sono separati perche i due
 * costi lo sono, e usano lo stesso meccanismo dell'autenticazione — un
 * secondo sistema di conteggio sarebbe una seconda implementazione della
 * stessa cosa.
 */

export const runtime = "nodejs";

type Context = { params: { publicSlug: string } };

const notFound = () =>
  NextResponse.json(
    { data: null, error: { message: "Modulo non disponibile" } },
    { status: 404 },
  );

const tooManyRequests = (result: {
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
    { status: 429, headers: rateLimitHeaders(result as any) },
  );

export async function GET(request: Request, context: Context) {
  try {
    const limit = await consumeAuthRateLimit(
      AUTH_RATE_LIMITS.publicFormView,
      getRequestIp(request),
    );
    if (!limit.allowed) return tooManyRequests(limit);

    const match = await findPublicFormBySlug(context.params.publicSlug);
    if (!match) return notFound();

    /*
      Cosa esce di qui: il modulo e l'identita del club. Mai le compilazioni
      gia raccolte, mai gli identificativi interni degli atleti, mai una
      precompilazione — chi apre un link pubblico non e nessuno finche non si
      dichiara, e mostrargli dati gia in archivio sarebbe un modo per farsi
      leggere l'anagrafica da chiunque abbia il link.
    */
    return NextResponse.json({
      data: {
        form: {
          title: match.schema.title,
          description: match.schema.description,
          fields: match.schema.fields,
          collectRespondentEmail: match.schema.settings.collectRespondentEmail,
        },
        club: {
          name: match.club.name,
          logoUrl: match.club.logoUrl,
          contactEmail: match.club.contactEmail,
        },
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: "Errore nel caricamento del modulo" } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const limit = await consumeAuthRateLimit(
      AUTH_RATE_LIMITS.publicFormSubmit,
      getRequestIp(request),
    );
    if (!limit.allowed) return tooManyRequests(limit);

    const payload = await readSubmissionPayload(request);

    const result = await submitPublicForm(context.params.publicSlug, {
      answers: payload.answers,
      files: payload.files,
      respondentName: payload.respondentName,
      respondentEmail: payload.respondentEmail,
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    if (error instanceof FormSubmissionError) {
      if (error.status === 404) return notFound();

      return NextResponse.json(
        {
          data: { errors: error.fieldErrors },
          error: { message: error.message },
        },
        { status: error.status },
      );
    }

    /*
      Un 500 su questa rotta e l'unico modo in cui EasyGame puo perdere una
      compilazione arrivata da fuori, e finora non lasciava traccia da
      nessuna parte: non nella risposta — giustamente, a un estraneo non si
      raccontano gli errori interni — e nemmeno nei log. Il messaggio al
      pubblico resta generico; il motivo si scrive dove lo legge chi tiene su
      il servizio.
    */
    console.error("[public-form] invio fallito", {
      slug: context.params.publicSlug,
      message: String(error?.message || error),
    });

    return NextResponse.json(
      { data: null, error: { message: "Errore nell'invio del modulo" } },
      { status: 500 },
    );
  }
}
