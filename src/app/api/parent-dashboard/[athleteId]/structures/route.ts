import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";
import { getClubStructures, saveClubStructures } from "@/lib/simplified-db";
import {
  hasBookingConflict,
  normalizeStructure,
  uid,
  type StructureBooking,
} from "@/lib/structures-utils";

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
      /*
        **Il cruscotto della famiglia lo apre un tutore** (ADR-0118, ADR-0122).

        Da qui esce il payload intero — quote, ricevute, anagrafica dei tutori,
        contenuto clinico e indirizzo del file del certificato — mentre
        l'atleta di quella scheda ne riceve, dalla propria area, l'elenco
        chiuso di `CAMPI_AREA_ATLETA`. Non c'e niente da dichiarare: dopo
        ADR-0122 il legame diretto e **chiuso per predefinito**, e questa riga
        e qui perche il prossimo lettore non lo riapra credendo di correggere
        una dimenticanza.
      */
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
    const requestedAthleteId = firstText(body?.athleteId, dashboard.athlete.id);
    const linkedAthlete =
      dashboard.athlete.linkedAthletes.find((athlete: any) =>
        sameText(athlete.id, requestedAthleteId),
      ) || dashboard.athlete;

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

    const structures = (await getClubStructures(dashboard.club.id)).map(
      normalizeStructure,
    );
    const structureIndex = structures.findIndex((structure) =>
      sameText(structure.id, structureId),
    );
    const structure = structures[structureIndex];

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

    const nextStructure = {
      ...structure,
      bookings: [...(structure.bookings || []), booking],
    };
    const nextStructures = structures.map((item, index) =>
      index === structureIndex ? nextStructure : item,
    );
    const ok = await saveClubStructures(dashboard.club.id, nextStructures);

    if (!ok) {
      return NextResponse.json(
        { data: null, error: { message: "Salvataggio prenotazione fallito" } },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: booking, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            error?.message || "Errore richiesta prenotazione struttura",
        },
      },
      { status: 500 },
    );
  }
}

