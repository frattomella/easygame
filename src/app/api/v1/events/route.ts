import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { resolveSeasonContext } from "@/lib/server/season-context";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createClubEvent,
  createClubEventsBatch,
  listClubEvents,
  listConvocatedAthleteIdsByEvent,
} from "@/lib/server/events";
import {
  isEventAvailabilityError,
  normalizeEventKind,
  toEventLegacyShape,
} from "@/lib/events/model";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { RSVP_NEUTRAL_ATTENDANCE_STATUS } from "@/lib/server/rsvp";
import { isPresentAttendance } from "@/lib/funding/attendance-measure";

/**
 * **Il calendario del club, e l'unica porta per crearci dentro.**
 *
 * Allenamenti e gare non hanno piu due rotte separate su due colonne JSON:
 * hanno una rotta sola su una tabella sola, e il tipo e un parametro
 * (ADR-0098). E la riga che rende esprimibile il calendario unico, l'RSVP sulle
 * gare, la presenza a una gara e «scrivi ai convocati» — quattro gap che
 * sembravano indipendenti e poggiavano tutti sullo stesso mattone mancante.
 *
 * La risposta porta **entrambe le forme**: la riga, e la forma storica che le
 * schermate leggono ancora. Sparira la seconda, non la prima.
 */

const scopeFrom = async (request: Request, userId: string) => {
  const url = new URL(request.url);
  return resolveOrganizationScopeForUser(
    userId,
    url.searchParams.get("organization_id") ||
      url.searchParams.get("club_id") ||
      request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );
};

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

/**
 * **Quanti sono stati registrati, e quanti presenti** (P0-5).
 *
 * `status` dice come e andata, e una riga in stato `pending` **non e** un
 * appello: e nata da una risposta della famiglia e dal registro non e mai
 * passata (`RSVP_NEUTRAL_ATTENDANCE_STATUS`). Contarla direbbe fatto un
 * appello che nessuno ha preso — la stessa distinzione che
 * `isPresentAttendance` fa sul verso opposto, e che ADR-0099 tiene su tre
 * colonne con tre scrittori.
 *
 * Un `groupBy` per l'intera pagina, che e la ragione per cui qui escono due
 * numeri e non l'elenco.
 */
type ConteggiDellEvento = {
  attendance_recorded: number;
  attendance_present: number;
  convocated_count: number;
};

const CONTEGGI_A_ZERO: ConteggiDellEvento = {
  attendance_recorded: 0,
  attendance_present: 0,
  convocated_count: 0,
};

const leggiAppello = async (organizationId: string, eventIds: string[]) => {
  const conteggi = new Map<string, ConteggiDellEvento>();
  if (!organizationId || !eventIds.length) return conteggi;

  const voce = (eventId: string) => {
    const chiave = String(eventId || "");
    if (!conteggi.has(chiave)) conteggi.set(chiave, { ...CONTEGGI_A_ZERO });
    return conteggi.get(chiave)!;
  };

  const [appello, convocazioni] = await Promise.all([
    (prisma as any).clubEventParticipant.groupBy({
      by: ["event_id", "status"],
      where: {
        organization_id: organizationId,
        event_id: { in: eventIds },
        status: { notIn: [RSVP_NEUTRAL_ATTENDANCE_STATUS] },
      },
      _count: { _all: true },
    }),
    /*
      **Le convocazioni sono una colonna diversa, con uno scrittore diverso**
      (ADR-0099, P0-6).

      `convocation_status` vale `convocated` o `excluded`, e `null` significa
      «nessuno ha ancora deciso» — non «non convocato», che e una decisione
      presa. Si contano le sole convocate: e cio che la scheda della gara
      chiede, e contare anche le escluse direbbe che una rosa e stata fatta
      quando qualcuno ha solo tolto un nome.
    */
    (prisma as any).clubEventParticipant.groupBy({
      by: ["event_id"],
      where: {
        organization_id: organizationId,
        event_id: { in: eventIds },
        convocation_status: "convocated",
      },
      _count: { _all: true },
    }),
  ]);

  for (const riga of appello as any[]) {
    if (!riga?.event_id) continue;

    const quante = Number(riga?._count?._all || 0);
    const conto = voce(riga.event_id);

    conto.attendance_recorded += quante;
    if (isPresentAttendance(riga)) conto.attendance_present += quante;
  }

  for (const riga of convocazioni as any[]) {
    if (!riga?.event_id) continue;
    voce(riga.event_id).convocated_count = Number(riga?._count?._all || 0);
  }

  return conteggi;
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: [], error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const scope = await scopeFrom(request, session.db.user_id);

    /*
      **Il perimetro di stagione della lettura** (ADR-0197): la stagione che
      il browser mostra (`x-active-season-id`), oppure `season_id` quando la
      schermata ne chiede una precisa, oppure niente con `all_seasons=1` —
      per chi vuole lo storico e lo dice.
    */
    const stagione = await resolveSeasonContext(scope.activeOrganizationId, request);
    const rows = await listClubEvents(scope, {
      kind: (url.searchParams.get("kind") as any) || "all",
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      seasonId: url.searchParams.get("season_id"),
      season: stagione,
      allSeasons: url.searchParams.get("all_seasons") === "1",
      siteId: url.searchParams.get("site_id"),
      categoryId: url.searchParams.get("category_id"),
      groupId: url.searchParams.get("group_id"),
      status: url.searchParams.get("status"),
      includeCancelled: url.searchParams.get("include_cancelled") === "1",
    });

    /*
      **L'appello si scriveva e non lo rileggeva nessuno** (P0-5).

      Il registro presenze salva su `club_event_participants` — la tabella
      giusta, con il suo scrittore unico — e da li **non tornava indietro
      niente**: questa rotta serviva le sole colonne dell'evento, e ogni
      schermata che chiede «l'appello e stato fatto?» leggeva
      `training.attendance`, che non e mai esistito nella risposta.

      L'effetto, misurato a schermo: si segnano tre presenti su sedici, si
      salva, e la scheda continua a dire «0/16 · Presenze mancanti» — anche
      dopo un ricaricamento. La bacheca continua a chiedere di completare un
      appello gia completato, e non c'e modo di distinguere una seduta fatta
      da una da fare.

      Escono **due numeri per evento**, non l'elenco: quanti sono stati
      registrati e quanti presenti. E cio che serve a una scheda, e non pesa —
      un `groupBy` per l'intera pagina invece di una lettura per riga. Chi
      apre il registro chiede l'elenco vero alla rotta dei partecipanti, che
      lo filtra sul perimetro.
    */
    const appello = await leggiAppello(
      scope.activeOrganizationId as string,
      rows.map((row) => String(row.id)),
    );

    /*
      **E chi sono i convocati** (`D-AUD-9`).

      Il conteggio dice quante convocazioni ha una gara; l'avviso «fra i
      convocati c'e un certificato scaduto» chiede **quali atleti**, e la
      pagina Gare lo calcolava sulle grafie del payload — quindi non si
      accendeva mai, nemmeno con due certificati scaduti in rosa. Gli
      identificativi escono dallo stesso recinto dei partecipanti: sono un
      dato personale quanto una riga.
    */
    const rosePerEvento = await listConvocatedAthleteIdsByEvent(
      scope,
      scope.activeOrganizationId as string,
      rows.map((row) => String(row.id)),
    );

    return NextResponse.json({
      data: rows.map((row) => ({
        ...toEventLegacyShape(row),
        ...(appello.get(String(row.id)) || CONTEGGI_A_ZERO),
        convocated_athlete_ids: rosePerEvento.get(String(row.id)) || [],
        row: {
          id: row.id,
          kind: row.kind,
          status: row.status,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          capacity: row.capacity,
          rsvp_required: row.rsvp_required,
          rsvp_deadline: row.rsvp_deadline,
          version: row.version,
        },
      })),
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { data: [], error: { message: error?.message || "Errore lettura eventi" } },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const payload =
      body && typeof body === "object" && body.data ? body.data : body;
    const kind = normalizeEventKind(payload?.kind || body?.kind);
    const batch = Array.isArray(payload?.events) ? payload.events : null;
    /* La stagione che il browser mostra: e quella in cui l evento nasce (ADR-0197). */
    const stagione = await resolveSeasonContext(scope.activeOrganizationId, request);

    try {
      if (batch) {
        /*
          La generazione dal programma settimanale crea decine di eventi
          insieme: una richiesta sola, e **una** riproiezione alla fine invece
          di una per evento.
        */
        const { righe, conflitti } = await createClubEventsBatch(
          scope,
          kind,
          batch,
          { userId: session.db.user_id, email: session.db.user.email },
          { season: stagione },
        );
        return NextResponse.json({
          data: righe.map((row) => ({ ...toEventLegacyShape(row), id: row.id })),
          /*
            «Conflitto da verificare» (WP-07): la riga non e stata creata
            perche occupava un posto gia occupato. Chi ha chiamato questa
            rotta decide cosa farne — la generazione manuale la mostra nel
            riepilogo finale.
          */
          conflicts: conflitti,
          error: null,
        });
      }

      const row = await createClubEvent(
        scope,
        kind,
        payload,
        { userId: session.db.user_id, email: session.db.user.email },
        { season: stagione },
      );

      return NextResponse.json({
        data: { ...toEventLegacyShape(row), id: row.id, row },
        error: null,
      });
    } catch (denied: any) {
      if (String(denied?.message || "").includes("Accesso negato")) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.resourceAccessDenied,
          outcome: "denied",
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          actorRole: scope.activeRole,
          organizationId: scope.activeOrganizationId,
          resource: "club_events",
          request,
          metadata: { attemptedAction: "create", permission: "events.manage" },
        });
      }
      throw denied;
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore creazione evento",
          /*
            La causa strutturata viaggia solo quando c'e (bug UAT "giovedi 17
            alle 19:00"): un client che non la legge vede lo stesso envelope
            di sempre, `message` compreso.
          */
          ...(isEventAvailabilityError(error)
            ? { code: error.code, details: error.details }
            : {}),
        },
      },
      { status: errorStatus(error) },
    );
  }
}
