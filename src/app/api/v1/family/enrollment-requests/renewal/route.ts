import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { buildRenewalDraft } from "@/lib/server/enrollment-requests";
import {
  FormSubmissionError,
  submitRenewalForm,
} from "@/lib/server/form-submissions";
import { readSubmissionPayload } from "@/lib/server/form-request";

/**
 * Il **rinnovo**: lo stesso modulo di iscrizione, con un contesto (Wave 5,
 * lane 5G, §16).
 *
 *   GET  /api/v1/family/enrollment-requests/renewal?athlete_id=…&slug=…
 *   POST /api/v1/family/enrollment-requests/renewal?athlete_id=…&slug=…
 *
 * `GET` restituisce il modulo gia riempito con cio che il club sa gia e la
 * stagione di destinazione; `POST` invia la compilazione, che entra nella
 * **stessa** coda della segreteria e aspetta la **stessa** approvazione umana.
 * Non nasce nessuna anagrafica da qui: la regola d'oro non ha eccezioni per
 * chi e gia tesserato (ADR-0040).
 *
 * **Perche atleta e modulo stanno nella query anche sul POST.** Il corpo e
 * `multipart/form-data` quando ci sono allegati, e in quel corpo il campo
 * `payload` e gia il contratto del motore dei moduli: aggiungerci due chiavi
 * significherebbe due modi di dire la stessa cosa a seconda del formato. Il
 * server non crede comunque a nessuno dei due valori — l'atleta passa dal
 * legame, il club dalla riga dell'atleta.
 *
 * **Nessuna schermata nuova per il club.** Il modulo di rinnovo si costruisce
 * con il builder che esiste e si pubblica come qualunque altro: qui si cita il
 * suo slug pubblico, e sede e categoria continua a metterle il server quando
 * il modulo si apre (ADR-0043).
 */

export const runtime = "nodejs";

const jsonError = (message: string, status: number) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const failure = (error: any, fallback: string) => {
  if (error instanceof FormSubmissionError) {
    return NextResponse.json(
      {
        data: { errors: error.fieldErrors },
        error: { message: error.message },
      },
      { status: error.status },
    );
  }

  const message = publicErrorMessage(error, fallback);
  return jsonError(
    message,
    message.includes("Accesso negato")
      ? 403
      : /non trovat[oa]/i.test(message)
        ? 404
        : 400,
  );
};

const readContext = (request: Request) => {
  const params = new URL(request.url).searchParams;
  return {
    athleteId: params.get("athlete_id") || "",
    publicSlug: params.get("slug") || "",
  };
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const { athleteId, publicSlug } = readContext(request);
    if (!athleteId || !publicSlug) {
      return jsonError("Indica l'atleta e il modulo di rinnovo", 400);
    }

    const data = await buildRenewalDraft(session.db.user_id, {
      athleteId,
      publicSlug,
    });

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Modulo di rinnovo non disponibile");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const { athleteId, publicSlug } = readContext(request);
    if (!athleteId || !publicSlug) {
      return jsonError("Indica l'atleta e il modulo di rinnovo", 400);
    }

    const payload = await readSubmissionPayload(request);

    const data = await submitRenewalForm(session.db.user_id, {
      athleteId,
      publicSlug,
      answers: payload.answers,
      files: payload.files,
      respondentName: payload.respondentName,
      respondentEmail: payload.respondentEmail,
    });

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Invio del rinnovo non riuscito");
  }
}
