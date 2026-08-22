import { NextResponse } from "next/server";
import {
  getAccessRedirectPath,
  isKnownAccessRole,
  normalizeAccessRole,
} from "@/lib/access-roles";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

const UUID_PATTERN =
  /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuidLike = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/^ownership:/i, "")
    .replace(/^urn:uuid:/i, "");

const isUuid = (value: unknown) =>
  UUID_PATTERN.test(String(value || "").trim());

const getLinkedUserId = (value: any) =>
  String(
    value?.linkedUserId ||
      value?.linked_user_id ||
      value?.userId ||
      value?.user_id ||
      "",
  ).trim();

const findDirectAthleteIdForUser = async (
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

  return directAthlete?.id || null;
};

const findParentAthleteIdForUser = async (
  organizationId: string,
  userId: string,
) => {
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

    return guardians.some(
      (guardian: any) => getLinkedUserId(guardian) === userId,
    );
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
  const normalizedRole = normalizeAccessRole(role);
  const linkedAthleteId =
    normalizedRole === "athlete"
      ? await findDirectAthleteIdForUser(organizationId, userId)
      : normalizedRole === "parent"
        ? await findParentAthleteIdForUser(organizationId, userId)
        : null;

  return {
    redirectPath: getAccessRedirectPath(normalizedRole, {
      organizationId,
      linkedAthleteId,
    }),
    resolvedRole: normalizedRole,
    linkedAthleteId,
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
    const rawRole = String(body?.role || "").trim();
    const role = normalizeAccessRole(rawRole);
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

    if (rawRole && !isKnownAccessRole(rawRole)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Ruolo di accesso non supportato" },
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

    const membershipCandidates =
      accessKind !== "ownership"
        ? await prisma.organizationUser.findMany({
            where: {
              organization_id: organizationId,
              user_id: session.db.user_id,
            },
            include: includeOrganization,
            orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
          })
        : [];
    let membership = membershipId
      ? membershipCandidates.find(
          (candidate) => candidate.id === membershipId,
        ) || null
      : null;

    if (membership && role && normalizeAccessRole(membership.role) !== role) {
      membership = null;
    } else if (!membershipId && role) {
      membership =
        membershipCandidates.find(
          (candidate) => normalizeAccessRole(candidate.role) === role,
        ) || null;
    } else if (!membershipId && !role) {
      membership = membershipCandidates[0] || null;
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

    if (membership && !isKnownAccessRole(membership.role)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Ruolo della membership non supportato" },
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

    await recordAuditEvent({
      action: AUDIT_ACTIONS.membershipActivated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: updatedMembership.role,
      organizationId,
      resource: "organization_users",
      resourceId: updatedMembership.id,
      request,
    });

    return NextResponse.json({
      data: {
        ...updatedMembership,
        role: accessTarget.resolvedRole,
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
