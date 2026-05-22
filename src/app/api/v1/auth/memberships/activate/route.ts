import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";

const UUID_PATTERN =
  /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuidLike = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/^ownership:/i, "")
    .replace(/^urn:uuid:/i, "");

const isUuid = (value: unknown) => UUID_PATTERN.test(String(value || "").trim());

const getLinkedUserId = (value: any) =>
  String(
    value?.linkedUserId ||
      value?.linked_user_id ||
      value?.userId ||
      value?.user_id ||
      "",
  ).trim();

const findParentAthleteIdForUser = async (
  organizationId: string,
  userId: string,
) => {
  const directAthlete = await prisma.athlete.findFirst({
    where: {
      organization_id: organizationId,
      user_id: userId,
    },
    select: { id: true },
  });

  if (directAthlete?.id) {
    return directAthlete.id;
  }

  const athletes = await prisma.athlete.findMany({
    where: {
      organization_id: organizationId,
    },
    select: {
      id: true,
      data: true,
    },
  });

  const linkedAthlete = athletes.find((athlete) => {
    const data =
      athlete.data && typeof athlete.data === "object"
        ? (athlete.data as Record<string, any>)
        : {};
    const guardians = Array.isArray(data.guardians) ? data.guardians : [];

    return guardians.some((guardian: any) => getLinkedUserId(guardian) === userId);
  });

  return linkedAthlete?.id || null;
};

const resolveActivatedAccessTarget = async ({
  organizationId,
  userId,
  role,
}: {
  organizationId: string;
  userId: string;
  role: string;
}) => {
  const normalizedRole = String(role || "").trim().toLowerCase();

  if (normalizedRole === "trainer") {
    return {
      redirectPath: "/trainer-dashboard",
      resolvedRole: "trainer",
      linkedAthleteId: null,
    };
  }

  if (normalizedRole === "owner" || normalizedRole === "admin") {
    return {
      redirectPath: `/dashboard?clubId=${organizationId}`,
      resolvedRole: normalizedRole,
      linkedAthleteId: null,
    };
  }

  const parentAthleteId = await findParentAthleteIdForUser(organizationId, userId);
  if (parentAthleteId) {
    return {
      redirectPath: `/parent-view/${parentAthleteId}`,
      resolvedRole: "parent",
      linkedAthleteId: parentAthleteId,
    };
  }

  if (normalizedRole === "parent" || normalizedRole === "athlete") {
    return {
      redirectPath: null,
      resolvedRole: normalizedRole,
      linkedAthleteId: null,
    };
  }

  return {
    redirectPath: `/dashboard?clubId=${organizationId}`,
    resolvedRole: normalizedRole || "member",
    linkedAthleteId: null,
  };
};

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => ({}));
    const organizationId = normalizeUuidLike(
      body?.organization_id || body?.club_id || "",
    );
    const role = String(body?.role || "").trim();
    const membershipId = String(
      body?.membership_id || body?.membershipId || "",
    ).trim();
    const accessKind = String(
      body?.access_kind || body?.accessKind || "",
    ).trim();

    if (!organizationId || !isUuid(organizationId)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Club da attivare non valido" },
        },
        { status: 400 },
      );
    }

    const organizationSelect = {
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
    const includeOrganization = {
      organization: {
        select: organizationSelect,
      },
    };

    let membership =
      membershipId && accessKind !== "ownership" && isUuid(membershipId)
      ? await prisma.organizationUser.findFirst({
          where: {
            id: membershipId,
            organization_id: organizationId,
            user_id: session.db.user_id,
          },
          include: includeOrganization,
        })
      : null;

    if (!membership && role && accessKind !== "ownership") {
      membership = await prisma.organizationUser.findFirst({
        where: {
          organization_id: organizationId,
          user_id: session.db.user_id,
          role,
        },
        include: includeOrganization,
      });
    }

    if (!membership && accessKind !== "ownership") {
      membership = await prisma.organizationUser.findFirst({
        where: {
          organization_id: organizationId,
          user_id: session.db.user_id,
        },
        include: includeOrganization,
        orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
      });
    }

    const ownedClub =
      accessKind === "ownership" || role === "owner"
        ? await prisma.club.findFirst({
            where: {
              id: organizationId,
              creator_id: session.db.user_id,
            },
            select: organizationSelect,
          })
        : null;

    if (!membership && !ownedClub) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Non hai accesso a questo club" },
        },
        { status: 403 },
      );
    }

    await prisma.organizationUser.updateMany({
      where: {
        user_id: session.db.user_id,
        is_primary: true,
      },
      data: {
        is_primary: false,
      },
    });

    const updatedMembership = membership
      ? await prisma.organizationUser.update({
          where: {
            id: membership.id,
          },
          data: {
            is_primary: true,
          },
          include: includeOrganization,
        })
      : null;

    if (!updatedMembership && ownedClub) {
      const accessTarget = await resolveActivatedAccessTarget({
        organizationId: ownedClub.id,
        userId: session.db.user_id,
        role: "owner",
      });

      return NextResponse.json({
        data: {
          id: `ownership:${ownedClub.id}`,
          organization_id: ownedClub.id,
          user_id: session.db.user_id,
          role: "owner",
          is_primary: true,
          access_kind: "ownership",
          is_ownership_record: true,
          redirect_path: accessTarget.redirectPath,
          resolved_role: accessTarget.resolvedRole,
          linked_athlete_id: accessTarget.linkedAthleteId,
          organization: ownedClub,
          organizations: ownedClub,
        },
        error: null,
      });
    }

    if (!updatedMembership) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Accesso assegnato non trovato" },
        },
        { status: 403 },
      );
    }

    const accessTarget = await resolveActivatedAccessTarget({
      organizationId,
      userId: session.db.user_id,
      role: updatedMembership.role,
    });

    return NextResponse.json({
      data: {
        ...updatedMembership,
        access_kind: "membership",
        is_ownership_record: false,
        redirect_path: accessTarget.redirectPath,
        resolved_role: accessTarget.resolvedRole,
        linked_athlete_id: accessTarget.linkedAthleteId,
        organizations: updatedMembership.organization,
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore attivazione club" },
      },
      { status: 500 },
    );
  }
}
