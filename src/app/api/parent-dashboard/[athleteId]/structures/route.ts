import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";
import {
  appendFamilyStructureBooking,
  readClubStructures,
} from "@/lib/server/structure-bookings";
import {
  describeFieldAvailability,
  hasBookingConflict,
  isWithinFieldAvailability,
  uid,
  type StructureBooking,
} from "@/lib/structures-utils";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { createClubNotifications } from "@/lib/server/club-notifications";
import { isManagementAccessRole } from "@/lib/access-roles";
import { publicErrorMessage } from "@/lib/server/api-errors";

type Context = {
  params: {
    athleteId: string;
  };
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

const sameText = (left: unknown, right: unknown) =>
  firstText(left).toLowerCase() === firstText(right).toLowerCase();

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const dashboard = await getParentDashboardData(
      session.db.user_id,
      context.params.athleteId,
    );

    if (!dashboard) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Atleta non collegato a questo account" },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const structureId = firstText(body?.structureId);
    const fieldId = firstText(body?.fieldId);
    const start = firstText(body?.start);
    const end = firstText(body?.end);
    /*
      **Il figlio lo dice il percorso, e nient'altro.**

      Qui il corpo poteva sovrascriverlo: si cercava `body.athleteId` fra
      `linkedAthletes`, che sono **tutti** i figli di chi chiede, di **tutti**
      i club. Il controllo verificava che l'id fosse di un proprio figlio e non
      che quel figlio fosse di **questo** club — e il club della prenotazione
      viene invece dal percorso.

      Una madre con Marco nel club X e Sofia nel club Y poteva quindi scrivere
      dentro le strutture del club X una prenotazione intestata a Sofia, con la
      sua riga di audit e una notifica a tutta la dirigenza che nomina **un
      minore che non e loro tesserato**. Nessun attacco: bastava il campo
      sbagliato in un corpo JSON.

      La correzione non e un controllo in piu, e un controllo in **meno**: il
      contesto del figlio e gia risolto e verificato dal segmento di rotta
      (`resolveParentDashboard`), e il client mandava comunque lo stesso id.
      Due fonti per lo stesso fatto sono una di troppo, e la seconda non era
      vagliata.
    */
    const linkedAthlete = dashboard.athlete;

    if (!structureId || !fieldId || !start || !end) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Struttura, campo e orari sono obbligatori" },
        },
        { status: 400 },
      );
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate.getTime() >= endDate.getTime()
    ) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Intervallo prenotazione non valido" },
        },
        { status: 400 },
      );
    }

    /*
      **Una richiesta ha una durata, e sta nel futuro.**

      Il solo vincolo era `inizio < fine`, e la fascia oraria non lo copre: un
      campo che **non dichiara fasce** non ha vincolo, ed e deliberato
      (W6-D03, il silenzio non e un divieto) — cioe e lo stato normale di ogni
      club che quel riquadro non lo ha compilato.

      Su un campo cosi bastava chiedere dal 2027 al 2099. La riga nasce
      `pending`, e `hasBookingConflict` considera `pending` bloccante: il
      campo restava occupato per settant'anni, per ogni altra famiglia e per la
      segreteria. Non serviva nemmeno malafede: un errore di battitura
      sull'anno bastava.

      Il tetto e **un giorno**, che e la forma piu lunga che la fascia stessa
      sappia validare (fino alla mezzanotte successiva), e il passato si
      rifiuta perche una prenotazione e una richiesta, e non si chiede una cosa
      per ieri.
    */
    const DURATA_MASSIMA_MS = 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > DURATA_MASSIMA_MS) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Una prenotazione non puo durare piu di un giorno: dividila in piu richieste",
          },
        },
        { status: 400 },
      );
    }

    if (startDate.getTime() < Date.now()) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Non si puo prenotare un orario gia passato" },
        },
        { status: 400 },
      );
    }

    /*
      **PP-02 §L. Le strutture si leggono dal server.**

      Qui c'era `getClubStructures` di `simplified-db.ts`, che e il dominio del
      **browser**: fa `fetch("/api/v1/clubs?…")` con un percorso relativo, che
      dentro un route handler non si risolve, e restituisce `[]` inghiottendo
      l'errore. Ogni richiesta di prenotazione riceveva
      «Struttura non prenotabile» — non per un divieto, ma perche l'elenco su
      cui il divieto veniva applicato era vuoto.
    */
    const structures = await readClubStructures(dashboard.club.id);
    const structure = structures.find((item) =>
      sameText(item.id, structureId),
    );

    /*
      W6-54. Il divieto vale sulla rotta e non solo nella schermata: se vivesse
      solo nella UI, chi conosce gli identificativi prenoterebbe lo stesso.
    */
    if (
      !structure ||
      structure.isVisibleToMembers !== true ||
      structure.isBookableByMembers !== true
    ) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Struttura non prenotabile" },
        },
        { status: 404 },
      );
    }

    const field = structure.fields.find((item) => sameText(item.id, fieldId));
    if (!field || !field.isVisible || !field.isBookable) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Campo non prenotabile" },
        },
        { status: 400 },
      );
    }

    /*
      **PP-02 §L. La fascia dichiarata vale anche qui.**

      Il divieto sulla prenotabilita era gia sulla rotta (W6-54); la
      **disponibilita** no. La schermata mostrava le fasce e il modulo lasciava
      scegliere data e ora con due campi liberi: una famiglia poteva chiedere il
      campo alle tre di notte, e la richiesta arrivava in segreteria, dove
      qualcuno avrebbe dovuto rifiutare a mano una cosa che non doveva potersi
      chiedere.

      Il rifiuto **nomina le fasce**: «fuori dagli orari» senza dire quali e un
      rifiuto che non si puo correggere. Un campo che non ne dichiara nessuna
      resta senza vincolo, ed e deliberato: vedi `isWithinFieldAvailability`.
    */
    if (!isWithinFieldAvailability(field, startDate, endDate)) {
      const fasce = describeFieldAvailability(field);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: fasce
              ? `Il campo non e disponibile in quell'orario. Fasce aperte: ${fasce}`
              : "Il campo non e disponibile in quell'orario",
          },
        },
        { status: 400 },
      );
    }

    const parentName =
      [session.db.user.first_name, session.db.user.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      session.db.user.email ||
      "Genitore";
    const booking: StructureBooking = {
      id: uid("booking"),
      structureId: structure.id,
      fieldId: field.id,
      fieldName: field.name,
      title: `Richiesta ${field.name}`,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      status: "pending",
      bookedByType: "parent",
      bookedById: session.db.user_id,
      bookedByName: parentName,
      athleteId: linkedAthlete.id,
      athleteName: linkedAthlete.name || dashboard.athlete.name,
      parentId: session.db.user_id,
      paymentStatus: "unpaid",
      notes: firstText(body?.notes),
      createdAt: new Date().toISOString(),
    };

    if (hasBookingConflict(structure.bookings || [], booking)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Slot gia occupato per questo campo" },
        },
        { status: 409 },
      );
    }

    const esito = await appendFamilyStructureBooking({
      organizationId: dashboard.club.id,
      structureId: structure.id,
      booking,
    });

    if (!esito.ok) {
      return esito.reason === "conflict"
        ? NextResponse.json(
            {
              data: null,
              error: { message: "Slot gia occupato per questo campo" },
            },
            { status: 409 },
          )
        : NextResponse.json(
            {
              data: null,
              error: { message: "Struttura non prenotabile" },
            },
            { status: 404 },
          );
    }

    /*
      **PP-02 §L. La richiesta lascia una traccia e avvisa qualcuno.**

      Era l'unica azione della famiglia che non produceva ne audit ne notifica:
      la prenotazione finiva dentro un array JSON e nessuno in segreteria lo
      sapeva, a meno che non aprisse la scheda della struttura. Una richiesta
      che nessuno vede e una richiesta che non e stata fatta.

      Nessuna delle due deve poter far fallire la prenotazione, che a questo
      punto e gia scritta: un avviso mancato e un difetto, una prenotazione
      persa dopo il salvataggio e un difetto peggiore.
    */
    await recordAuditEvent({
      action: AUDIT_ACTIONS.structureBookingRequested,
      organizationId: dashboard.club.id,
      actorUserId: session.db.user_id,
      resource: "structure_bookings",
      resourceId: booking.id,
      request,
      metadata: {
        structureId: structure.id,
        fieldId: field.id,
        athleteId: linkedAthlete.id,
        startsAt: booking.start,
        endsAt: booking.end,
      },
    }).catch(() => false);

    await createClubNotifications({
      clubId: dashboard.club.id,
      title: "Nuova richiesta di prenotazione",
      /*
        **L'avviso dice dove si va a rispondere.**

        La richiesta nasce `pending`, e `pending` **blocca** lo slot per
        chiunque altro finche la data non passa: un avviso che non dice dove
        confermarla o rifiutarla lascia il campo occupato e la famiglia in
        attesa. Il posto c'e — la scheda della struttura elenca le prenotazioni
        e ne cambia lo stato — ma la schermata che elenca le strutture mostra
        solo un contatore, quindi da li non lo si trova.

        Il modello delle notifiche non ha un campo per il collegamento: il
        percorso viaggia in `data`, per chi lo sapra rendere, e intanto il
        testo lo nomina.
      */
      message: `${parentName} ha chiesto ${field.name} (${structure.name}) per ${booking.athleteName || "un atleta"}. Confermala o rifiutala dalla scheda della struttura.`,
      type: "structure_booking",
      data: {
        structureId: structure.id,
        fieldId: field.id,
        bookingId: booking.id,
        athleteId: linkedAthlete.id,
        link: `/structures/${structure.id}`,
      },
      audience: (role) => isManagementAccessRole(role),
    }).catch(() => 0);

    return NextResponse.json({ data: booking, error: null });
  } catch (error: any) {
    /*
      Il messaggio del server non esce grezzo: un identificativo malformato
      faceva arrivare al browser il testo interno di Prisma — nome del modello,
      operazione, codice Postgres. E la classe W4-R14, e questa rotta e una
      delle sei che PP-02 tocca.
    */
    return NextResponse.json(
      {
        data: null,
        error: {
          message: publicErrorMessage(
            error,
            "Errore richiesta prenotazione struttura",
          ),
        },
      },
      { status: 500 },
    );
  }
}

