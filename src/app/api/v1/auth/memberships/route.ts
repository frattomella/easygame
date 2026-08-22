import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: [],
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const clubSummarySelect = {
      id: true,
      name: true,
      logo_url: true,
      creator_id: true,
      contact_email: true,
      contact_phone: true,
      city: true,
      province: true,
      created_at: true,
      settings: true,
    } as const;

    // Letture indipendenti, eseguite in parallelo: questa rotta e sul percorso
    // critico di ogni caricamento di pagina (AuthProvider).
    const [memberships, ownedClubs] = await Promise.all([
      prisma.organizationUser.findMany({
        where: {
          user_id: session.db.user_id,
        },
        include: {
          organization: {
            select: clubSummarySelect,
          },
        },
        orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
      }),
      prisma.club.findMany({
        where: {
          creator_id: session.db.user_id,
        },
        select: clubSummarySelect,
        orderBy: { created_at: "asc" },
      }),
    ]);

    const membershipRows = memberships.map((membership) => ({
      ...membership,
      access_kind: "membership",
      is_ownership_record: false,
      organizations: membership.organization,
    }));

    const ownershipRows = ownedClubs.map((club) => {
      const matchingPrimaryMembership = memberships.find(
        (membership) =>
          membership.organization_id === club.id &&
          membership.role === "owner" &&
          membership.is_primary,
      );

      return {
        id: `ownership:${club.id}`,
        organization_id: club.id,
        user_id: session.db.user_id,
        role: "owner",
        is_primary: Boolean(matchingPrimaryMembership),
        access_kind: "ownership",
        is_ownership_record: true,
        created_at: club.created_at,
        updated_at: club.created_at,
        organization: club,
        organizations: club,
      };
    });

    return NextResponse.json({
      data: [...ownershipRows, ...membershipRows],
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore caricamento membership" },
      },
      { status: 500 },
    );
  }
}
