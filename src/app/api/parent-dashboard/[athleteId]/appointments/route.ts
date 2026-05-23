import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";

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

    const club = await prisma.club.findUnique({
      where: { id: dashboard.club.id },
      select: { appointments: true },
    });
    const nowIso = new Date().toISOString();
    const appointment = {
      id: `parent-appointment-${Date.now()}`,
      title: reason,
      reason,
      date,
      time,
      notes,
      status: "requested",
      source: "parent_dashboard",
      organization_id: dashboard.club.id,
      athlete_id: dashboard.athlete.id,
      athlete_name: dashboard.athlete.name,
      requested_by_user_id: session.db.user_id,
      requested_by_email: session.db.user.email,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await prisma.club.update({
      where: { id: dashboard.club.id },
      data: {
        appointments: [...asArray(club?.appointments), appointment],
      },
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
