import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";
import { isDateTimeWithinOpeningHours } from "@/lib/opening-hours-utils";

type Context = {
  params: {
    athleteId: string;
  };
};

const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

const normalizeStatus = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const isParentAppointment = (
  appointment: any,
  athleteId: string,
  userId: string,
) =>
  String(appointment?.athlete_id || appointment?.athleteId || "") === athleteId ||
  String(appointment?.requested_by_user_id || "") === userId;

const canEditAppointment = (appointment: any) =>
  ["pending", "requested", "richiesto"].includes(normalizeStatus(appointment?.status));

const createAppointmentNotification = async ({
  organizationId,
  title,
  message,
  appointment,
}: {
  organizationId: string;
  title: string;
  message: string;
  appointment: Record<string, any>;
}) => {
  await prisma.notification
    .create({
      data: {
        organization_id: organizationId,
        user_id: null,
        title,
        message,
        type: "appointment_request",
        data: appointment,
      },
    })
    .catch(() => undefined);
};

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
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
    const reason = firstText(body?.reason, body?.title);
    const date = firstText(body?.date);
    const time = firstText(body?.time);
    const notes = firstText(body?.notes);

    if (!reason || !date || !time) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Motivo, giorno e orario sono obbligatori" },
        },
        { status: 400 },
      );
    }

    const validation = isDateTimeWithinOpeningHours(
      dashboard.appointments.openingHours,
      date,
      time,
    );
    if (!validation.valid) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              validation.reason ||
              "L'orario selezionato e fuori dagli orari di apertura della segreteria.",
          },
        },
        { status: 400 },
      );
    }

    const club = await prisma.club.findUnique({
      where: { id: dashboard.club.id },
      select: { appointments: true },
    });
    const nowIso = new Date().toISOString();
    const parentName =
      [session.db.user.first_name, session.db.user.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || session.db.user.email;
    const appointment = {
      id: `parent-appointment-${Date.now()}`,
      title: reason,
      reason,
      date,
      time,
      notes,
      status: "pending",
      source: "parent_dashboard",
      organization_id: dashboard.club.id,
      athlete_id: dashboard.athlete.id,
      athlete_name: dashboard.athlete.name,
      person: parentName,
      parent_name: parentName,
      requested_by_user_id: session.db.user_id,
      requested_by_email: session.db.user.email,
      requested_by_phone: session.db.user.phone || "",
      created_at: nowIso,
      updated_at: nowIso,
    };

    await prisma.club.update({
      where: { id: dashboard.club.id },
      data: {
        appointments: [...asArray(club?.appointments), appointment],
      },
    });

    await createAppointmentNotification({
      organizationId: dashboard.club.id,
      title: "Nuova richiesta appuntamento",
      message: `${parentName} ha richiesto un appuntamento per ${dashboard.athlete.name}.`,
      appointment,
    });

    return NextResponse.json({ data: appointment, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore prenotazione appuntamento",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
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
    const appointmentId = firstText(body?.id, body?.appointmentId);
    const reason = firstText(body?.reason, body?.title);
    const date = firstText(body?.date);
    const time = firstText(body?.time);
    const notes = firstText(body?.notes);

    if (!appointmentId || !reason || !date || !time) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Appuntamento, motivo, giorno e orario sono obbligatori" },
        },
        { status: 400 },
      );
    }

    const validation = isDateTimeWithinOpeningHours(
      dashboard.appointments.openingHours,
      date,
      time,
    );
    if (!validation.valid) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              validation.reason ||
              "L'orario selezionato e fuori dagli orari di apertura della segreteria.",
          },
        },
        { status: 400 },
      );
    }

    const club = await prisma.club.findUnique({
      where: { id: dashboard.club.id },
      select: { appointments: true },
    });
    const appointments = asArray<Record<string, any>>(club?.appointments);
    const appointmentIndex = appointments.findIndex(
      (appointment) =>
        firstText(appointment?.id) === appointmentId &&
        isParentAppointment(appointment, dashboard.athlete.id, session.db.user_id),
    );

    if (appointmentIndex < 0) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Richiesta appuntamento non trovata" },
        },
        { status: 404 },
      );
    }

    const currentAppointment = appointments[appointmentIndex];
    if (!canEditAppointment(currentAppointment)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Questa richiesta e gia stata gestita dalla segreteria" },
        },
        { status: 409 },
      );
    }

    const updatedAppointment = {
      ...currentAppointment,
      title: reason,
      reason,
      date,
      time,
      notes,
      updated_at: new Date().toISOString(),
    };
    const updatedAppointments = appointments.map((appointment, index) =>
      index === appointmentIndex ? updatedAppointment : appointment,
    );

    await prisma.club.update({
      where: { id: dashboard.club.id },
      data: { appointments: updatedAppointments },
    });

    await createAppointmentNotification({
      organizationId: dashboard.club.id,
      title: "Richiesta appuntamento aggiornata",
      message: `${updatedAppointment.person || "Un genitore"} ha modificato una richiesta appuntamento per ${dashboard.athlete.name}.`,
      appointment: updatedAppointment,
    });

    return NextResponse.json({ data: updatedAppointment, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore modifica appuntamento",
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
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
    const appointmentId = firstText(body?.id, body?.appointmentId);
    if (!appointmentId) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Appuntamento mancante" },
        },
        { status: 400 },
      );
    }

    const club = await prisma.club.findUnique({
      where: { id: dashboard.club.id },
      select: { appointments: true },
    });
    const appointments = asArray<Record<string, any>>(club?.appointments);
    const appointmentIndex = appointments.findIndex(
      (appointment) =>
        firstText(appointment?.id) === appointmentId &&
        isParentAppointment(appointment, dashboard.athlete.id, session.db.user_id),
    );

    if (appointmentIndex < 0) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Richiesta appuntamento non trovata" },
        },
        { status: 404 },
      );
    }

    const cancelledAppointment = {
      ...appointments[appointmentIndex],
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const updatedAppointments = appointments.map((appointment, index) =>
      index === appointmentIndex ? cancelledAppointment : appointment,
    );

    await prisma.club.update({
      where: { id: dashboard.club.id },
      data: { appointments: updatedAppointments },
    });

    await createAppointmentNotification({
      organizationId: dashboard.club.id,
      title: "Richiesta appuntamento cancellata",
      message: `${cancelledAppointment.person || "Un genitore"} ha cancellato una richiesta appuntamento per ${dashboard.athlete.name}.`,
      appointment: cancelledAppointment,
    });

    return NextResponse.json({ data: cancelledAppointment, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore cancellazione appuntamento",
        },
      },
      { status: 500 },
    );
  }
}
