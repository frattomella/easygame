import { NextResponse } from "next/server";
import { isManagementAccessRole } from "@/lib/access-roles";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

type Context = {
  params: { athleteId: string };
};

export async function GET(request: Request, context: Context) {
  const session = await requireAuthenticatedUser(request);
  if (!session) {
    return NextResponse.json(
      { data: null, error: { message: "Sessione non valida" } },
      { status: 401 },
    );
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id: context.params.athleteId },
    include: {
      category_memberships: true,
      medical_certificates: true,
    },
  });

  if (!athlete) {
    return NextResponse.json(
      { data: null, error: { message: "Atleta non trovato" } },
      { status: 404 },
    );
  }

  const directAthleteAccess = athlete.user_id === session.db.user_id;
  const ownsClub = await prisma.club.findFirst({
    where: {
      id: athlete.organization_id,
      creator_id: session.db.user_id,
    },
    select: { id: true },
  });
  const memberships = await prisma.organizationUser.findMany({
    where: {
      organization_id: athlete.organization_id,
      user_id: session.db.user_id,
    },
    select: { role: true },
  });
  const managementAccess =
    Boolean(ownsClub) ||
    memberships.some((membership) => isManagementAccessRole(membership.role));

  if (!directAthleteAccess && !managementAccess) {
    return NextResponse.json(
      { data: null, error: { message: "Accesso atleta non autorizzato" } },
      { status: 403 },
    );
  }

  return NextResponse.json({
    data: {
      athlete,
      certificates: athlete.medical_certificates,
      categoryMemberships: athlete.category_memberships,
    },
    error: null,
  });
}
