import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import {
  cancelFamilyAppointment,
  listFamilyAppointments,
  listFamilyFreeSlots,
  requestFamilyAppointment,
  rescheduleFamilyAppointment,
  resolveFamilyAppointmentContext,
} from "@/lib/server/appointments";

/**
 * **L'appuntamento visto dalla famiglia, sul dominio nuovo.**
 *
 * ---
 *
 * ## Cosa faceva questo file, e perche non poteva funzionare
 *
 * Leggeva `clubs.appointments`, ci aggiungeva un elemento con un
 * identificativo costruito dall'orologio (`parent-appointment-${Date.now()}`) e
 * riscriveva la colonna intera. La segreteria faceva la stessa cosa con una
 * **forma diversa** dello stesso oggetto — senza stato e senza `athlete_id` —
 * e alla prima operazione della segreteria la richiesta della famiglia
 * spariva: era D-1, e non era un difetto di questo file ma della sua unica
 * strada possibile.
 *
 * Data e ora viaggiavano come due stringhe separate, validate contro gli orari
 * di apertura **nel fuso del server**. Non esisteva nessuna conferma, nessun
 * rifiuto e nessun motivo: una richiesta restava in attesa per sempre.
 *
 * ## Cosa fa adesso
 *
 * Nulla, se non tradurre HTTP in chiamate al dominio. Il legame lo risolve
 * `resolveFamilyAppointmentContext` — che ne deriva anche il club, che percio
 * non arriva mai dal client — e la congiunzione atleta **e** autore vive in
 * `src/lib/server/appointments.ts`, dove vale per ogni chiamante e non solo per
 * questa rotta.
 *
 * I tre verbi restano quelli che l'area genitore chiama gia (`POST`, `PATCH`,
 * `DELETE`): `PATCH` non modifica piu la data in luogo, propone una
 * **riprogrammazione**, che crea una riga nuova e chiude la vecchia.
 */

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

const errorStatus = (error: any) => {
  const messaggio = String(error?.message || "");
  if (messaggio.includes("Accesso negato")) return 403;
  if (messaggio.includes("aggiornato da qualcun altro")) return 409;
  if (messaggio.includes("non trovata") || messaggio.includes("non trovato")) {
    return 404;
  }
  return 400;
};

const contesto = async (request: Request, athleteId: string) => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return { session: null, ctx: null };
  const ctx = await resolveFamilyAppointmentContext(session.db.user_id, athleteId);
  return { session, ctx };
};

const sessioneNonValida = () =>
  NextResponse.json(
    { data: null, error: { message: "Sessione non valida" } },
    { status: 401 },
  );

const legameAssente = () =>
  NextResponse.json(
    { data: null, error: { message: "Atleta non collegato a questo account" } },
    { status: 403 },
  );

/**
 * L'elenco degli appuntamenti del figlio e gli **slot liberi** su cui chiedere.
 *
 * La famiglia sceglie uno slot, non una data qualunque: e la differenza fra un
 * orario che risulta libero e un orario che il club puo davvero ricevere.
 */
export async function GET(request: Request, context: Context) {
  try {
    const { session, ctx } = await contesto(request, context.params.athleteId);
    if (!session) return sessioneNonValida();
    if (!ctx) return legameAssente();

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const inizio = from ? new Date(from) : new Date();
    const fine = to ? new Date(to) : new Date(inizio.getTime() + 30 * 86400000);

    const [items, slots] = await Promise.all([
      listFamilyAppointments(ctx),
      listFamilyFreeSlots(ctx, {
        from: inizio,
        to: fine,
        siteId: url.searchParams.get("site_id"),
      }),
    ]);

    return NextResponse.json({
      data: {
        items,
        availableSlots: slots.map((slot) => ({
          ...slot,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })),
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore lettura appuntamenti" },
      },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { session, ctx } = await contesto(request, context.params.athleteId);
    if (!session) return sessioneNonValida();
    if (!ctx) return legameAssente();

    const body = await request.json().catch(() => ({}));
    const reason = firstText(body?.reason, body?.title);
    if (!reason) {
      return NextResponse.json(
        { data: null, error: { message: "Il motivo e obbligatorio" } },
        { status: 400 },
      );
    }

    const appuntamento = await requestFamilyAppointment(ctx, {
      reason,
      startsAt: body?.starts_at ?? body?.startsAt ?? null,
      date: firstText(body?.date),
      time: firstText(body?.time),
      timezone: firstText(body?.timezone) || null,
      siteId: firstText(body?.site_id, body?.siteId) || null,
      slotId: firstText(body?.slot_id, body?.slotId) || null,
      notes: firstText(body?.notes),
      /*
        La chiave di idempotenza viaggia dall'intestazione quando il client la
        manda; quando non la manda, il dominio ne deriva una dal gesto. In
        entrambi i casi il doppio clic non produce due appuntamenti — e non e
        piu una cosa che il browser debba ricordarsi di impedire.
      */
      idempotencyKey:
        firstText(body?.idempotency_key, body?.idempotencyKey) ||
        request.headers.get("idempotency-key"),
    });

    return NextResponse.json({ data: appuntamento, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore prenotazione appuntamento" },
      },
      { status: errorStatus(error) },
    );
  }
}

/**
 * La riprogrammazione proposta dalla famiglia.
 *
 * Ammessa **finche l'appuntamento e in richiesta**: su uno gia confermato la
 * famiglia annulla e ne chiede un altro. Spostare un impegno che la segreteria
 * ha gia messo in agenda senza dirlo e cio che la macchina a stati non
 * consente, e il diniego arriva dal dominio, non da questo file.
 */
export async function PATCH(request: Request, context: Context) {
  try {
    const { session, ctx } = await contesto(request, context.params.athleteId);
    if (!session) return sessioneNonValida();
    if (!ctx) return legameAssente();

    const body = await request.json().catch(() => ({}));
    const appointmentId = firstText(body?.id, body?.appointmentId);
    if (!appointmentId) {
      return NextResponse.json(
        { data: null, error: { message: "Appuntamento mancante" } },
        { status: 400 },
      );
    }

    const appuntamento = await rescheduleFamilyAppointment(ctx, appointmentId, {
      reason: firstText(body?.reason, body?.title) || null,
      startsAt: body?.starts_at ?? body?.startsAt ?? null,
      date: firstText(body?.date),
      time: firstText(body?.time),
      timezone: firstText(body?.timezone) || null,
      siteId: firstText(body?.site_id, body?.siteId) || null,
      slotId: firstText(body?.slot_id, body?.slotId) || null,
      notes: firstText(body?.notes),
      expectedVersion: body?.version ?? null,
    });

    return NextResponse.json({ data: appuntamento, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore modifica appuntamento" },
      },
      { status: errorStatus(error) },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { session, ctx } = await contesto(request, context.params.athleteId);
    if (!session) return sessioneNonValida();
    if (!ctx) return legameAssente();

    const body = await request.json().catch(() => ({}));
    const appointmentId = firstText(body?.id, body?.appointmentId);
    if (!appointmentId) {
      return NextResponse.json(
        { data: null, error: { message: "Appuntamento mancante" } },
        { status: 400 },
      );
    }

    const appuntamento = await cancelFamilyAppointment(ctx, appointmentId, {
      expectedVersion: body?.version ?? null,
    });

    return NextResponse.json({ data: appuntamento, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore cancellazione appuntamento" },
      },
      { status: errorStatus(error) },
    );
  }
}
