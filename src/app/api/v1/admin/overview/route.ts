import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requirePlatformAdmin } from "@/lib/server/auth";

export async function GET(request: Request) {
  const session = await requirePlatformAdmin(request);
  if (!session) {
    return NextResponse.json(
      {
        data: null,
        error: { message: "Accesso riservato all'amministratore piattaforma" },
      },
      { status: 403 },
    );
  }

  const [users, clubs, memberships] = await Promise.all([
    prisma.user.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        is_club_creator: true,
        created_at: true,
      },
    }),
    prisma.club.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        name: true,
        city: true,
        creator_id: true,
        contact_email: true,
        contact_phone: true,
        created_at: true,
        settings: true,
      },
    }),
    prisma.organizationUser.findMany({
      select: {
        organization_id: true,
        user_id: true,
        role: true,
      },
    }),
  ]);

  const membershipByClub = memberships.reduce<Record<string, number>>(
    (accumulator, membership) => {
      accumulator[membership.organization_id] =
        (accumulator[membership.organization_id] || 0) + 1;
      return accumulator;
    },
    {},
  );

  return NextResponse.json({
    data: {
      summary: {
        totalUsers: users.length,
        totalClubs: clubs.length,
        totalMemberships: memberships.length,
      },
      users,
      clubs: clubs.map((club) => ({
        ...club,
        memberCount: membershipByClub[club.id] || 0,
      })),
    },
    error: null,
  });
}
