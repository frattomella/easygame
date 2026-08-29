import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  answerRsvp,
  readAthleteRsvpInvitations,
  readEventRsvpSummary,
} from "@/lib/server/rsvp";

/**
 * L'RSVP (G-20, Wave 2 §9).
 *
 *   POST /api/v1/rsvp                      la risposta della famiglia
 *   GET  /api/v1/rsvp?training_id=...      il riepilogo per lo staff
 *   GET  /api/v1/rsvp?athlete_id=...       gli inviti di un atleta, per la famiglia
 *
 * **Perche una rotta sola con due letture.** Le due `GET` guardano lo stesso
 * fatto da due lati — l'evento e l'atleta — e devono restare coerenti: se
 * fossero due rotte, la prima volta che una cambia il calcolo della scadenza o
 * dell'evento annullato, la famiglia vedrebbe un pulsante che lo staff non
 * vede. Il parametro sceglie il lato, e nient'altro.
 *
 * **I due permessi non sono lo stesso permesso.** `rsvp.read` e leggere le
 * risposte **degli altri** — e lo staff, con il perimetro per gruppo operativo
 * dell'allenatore applicato dal dominio. `rsvp.answer` e rispondere **per il
 * proprio atleta**, e li il gate vero e il legame con l'atleta, non il ruolo:
 * un genitore collegato solo come tutore puo non avere nessuna appartenenza al
 * club, e il ruolo attivo della sessione sarebbe `null`. Per questo la lettura
 * per atleta e la scrittura non guardano `scope.activeRole`: lo verifica il
 * dominio, sul ruolo con cui si sta rispondendo.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: unknown, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

const readParam = (url: URL, ...names: string[]) => {
  for (const name of names) {
    const value = String(url.searchParams.get(name) ?? "").trim();
    if (value) return value;
  }
  return "";
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const trainingId = readParam(url, "training_id", "trainingId");
    const athleteId = readParam(url, "athlete_id", "athleteId");

    if (athleteId) {
      const invitations = await readAthleteRsvpInvitations({
        athleteId,
        userId: session.db.user_id,
      });
      return NextResponse.json({ data: { invitations }, error: null });
    }

    if (!trainingId) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Indica training_id oppure athlete_id" },
        },
        { status: 400 },
      );
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const summary = await readEventRsvpSummary({
      organizationId: readParam(url, "organization_id", "organizationId") || null,
      trainingId,
      scope,
      actorEmail: session.db.user.email,
    });

    return NextResponse.json({ data: summary, error: null });
  } catch (error) {
    return failure(error, "Lettura delle risposte non riuscita");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const body = await request.json().catch(() => ({}));

    const result = await answerRsvp({
      /*
        Il club arriva pure dal corpo, ma non viene usato per scegliere le
        righe: il dominio lo confronta con il club dell'atleta e rifiuta se
        non coincide (CLAUDE.md §8 — mai fidarsi di un `organization_id` che
        arriva dal client).
      */
      organizationId: body?.organization_id ?? body?.organizationId ?? null,
      trainingId: String(body?.training_id ?? body?.trainingId ?? "").trim(),
      athleteId: String(body?.athlete_id ?? body?.athleteId ?? "").trim(),
      status: body?.status ?? body?.rsvp_status ?? body?.rsvpStatus,
      note: body?.note ?? body?.rsvp_note ?? body?.rsvpNote,
      userId: session.db.user_id,
      actorEmail: session.db.user.email,
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    return failure(error, "Risposta non registrata");
  }
}
