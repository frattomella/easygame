import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";

const UUID_PATTERN =
  /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuidLike = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/^urn:uuid:/i, "");

const isUuid = (value: unknown) => UUID_PATTERN.test(String(value || "").trim());

const normalizeToken = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toArray = (value: unknown) => (Array.isArray(value) ? value : []);

const TRAINER_ROLES = new Set(["trainer", "allenatore", "coach"]);
const PARENT_ROLES = new Set(["parent", "genitore", "guardian", "tutore"]);
const ATHLETE_ROLES = new Set(["athlete", "atleta", "player"]);
const STAFF_ROLES = new Set([
  "admin",
  "manager",
  "gestore",
  "staff",
  "member",
  "socio",
  "collaborator",
  "collaboratore",
]);

const flattenTokens = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenTokens(entry));
  }

  if (typeof value === "string" && value.includes(",")) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (isRecord(value)) {
    return [
      value.id,
      value.value,
      value.userId,
      value.user_id,
      value.email,
      value.label,
    ]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  return [String(value || "").trim()].filter(Boolean);
};

const hasTargetToken = (
  value: unknown,
  userId: string,
  userEmail: string | null,
) => {
  const targets = [normalizeToken(userId), normalizeToken(userEmail)].filter(Boolean);
  return flattenTokens(value).some((entry) =>
    targets.includes(normalizeToken(entry)),
  );
};

const isLinkedToTarget = (
  record: any,
  userId: string,
  userEmail: string | null,
) => {
  const data = isRecord(record?.data) ? record.data : {};
  return [
    record?.linkedUserId,
    record?.linked_user_id,
    record?.userId,
    record?.user_id,
    record?.linkedUserEmail,
    record?.linked_user_email,
    record?.email,
    record?.linkedUserIds,
    record?.linked_user_ids,
    record?.linkedUserEmails,
    record?.linked_user_emails,
    data.linkedUserId,
    data.linked_user_id,
    data.userId,
    data.user_id,
    data.linkedUserEmail,
    data.linked_user_email,
    data.email,
    data.linkedUserIds,
    data.linked_user_ids,
    data.linkedUserEmails,
    data.linked_user_emails,
  ].some((value) => hasTargetToken(value, userId, userEmail));
};

const removeTargetFromList = (
  value: unknown,
  userId: string,
  userEmail: string | null,
) => {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.filter((entry) => !hasTargetToken(entry, userId, userEmail));
};

const clearLinkedFields = (
  record: any,
  userId: string,
  userEmail: string | null,
) => {
  if (!isRecord(record) || !isLinkedToTarget(record, userId, userEmail)) {
    return { next: record, changed: false };
  }

  const next: Record<string, unknown> = {
    ...record,
    linkedUserId: null,
    linked_user_id: null,
    linkedUserEmail: null,
    linked_user_email: null,
    linkedUserIds: removeTargetFromList(record.linkedUserIds, userId, userEmail),
    linked_user_ids: removeTargetFromList(
      record.linked_user_ids,
      userId,
      userEmail,
    ),
    linkedUserEmails: removeTargetFromList(
      record.linkedUserEmails,
      userId,
      userEmail,
    ),
    linked_user_emails: removeTargetFromList(
      record.linked_user_emails,
      userId,
      userEmail,
    ),
    linkedAt: null,
    linked_at: null,
    accessTokenRecordId: null,
    access_token_record_id: null,
  };

  if (isRecord(record.data)) {
    next.data = {
      ...record.data,
      linkedUserId: null,
      linked_user_id: null,
      linkedUserEmail: null,
      linked_user_email: null,
      linkedUserIds: removeTargetFromList(
        record.data.linkedUserIds,
        userId,
        userEmail,
      ),
      linked_user_ids: removeTargetFromList(
        record.data.linked_user_ids,
        userId,
        userEmail,
      ),
      linkedUserEmails: removeTargetFromList(
        record.data.linkedUserEmails,
        userId,
        userEmail,
      ),
      linked_user_emails: removeTargetFromList(
        record.data.linked_user_emails,
        userId,
        userEmail,
      ),
      linkedAt: null,
      linked_at: null,
      accessTokenRecordId: null,
      access_token_record_id: null,
    };
  }

  return { next, changed: true };
};

const getProfileRole = (record: any) => {
  const data = isRecord(record?.data) ? record.data : {};
  return normalizeToken(record?.role || data.role);
};

const shouldUnlinkProfileForRole = (
  record: any,
  accessRole: string,
  resourceType: "trainers" | "staff_members",
) => {
  const normalizedRole = normalizeToken(accessRole);
  const profileRole = getProfileRole(record);

  if (TRAINER_ROLES.has(normalizedRole)) {
    return resourceType === "trainers" || TRAINER_ROLES.has(profileRole);
  }

  if (STAFF_ROLES.has(normalizedRole)) {
    return resourceType === "staff_members" && !TRAINER_ROLES.has(profileRole);
  }

  return false;
};

const unlinkProfileCollection = (
  value: unknown,
  userId: string,
  userEmail: string | null,
  accessRole: string,
  resourceType: "trainers" | "staff_members",
) => {
  let changed = false;
  const next = toArray(value).map((entry) => {
    if (!shouldUnlinkProfileForRole(entry, accessRole, resourceType)) {
      return entry;
    }

    const result = clearLinkedFields(entry, userId, userEmail);
    if (result.changed) {
      changed = true;
    }
    return result.next;
  });

  return { next, changed };
};

const unlinkProfileResources = async (
  tx: any,
  organizationId: string,
  userId: string,
  userEmail: string | null,
  accessRole: string,
) => {
  const normalizedRole = normalizeToken(accessRole);
  if (!TRAINER_ROLES.has(normalizedRole) && !STAFF_ROLES.has(normalizedRole)) {
    return 0;
  }

  let updated = 0;
  const resources = await tx.clubResourceItem.findMany({
    where: {
      organization_id: organizationId,
      resource_type: {
        in: TRAINER_ROLES.has(normalizedRole)
          ? ["trainers", "staff_members"]
          : ["staff_members"],
      },
    },
    select: { id: true, payload: true, resource_type: true },
  });

  for (const resource of resources) {
    if (
      !shouldUnlinkProfileForRole(
        resource.payload,
        accessRole,
        resource.resource_type as "trainers" | "staff_members",
      )
    ) {
      continue;
    }

    const result = clearLinkedFields(resource.payload, userId, userEmail);
    if (!result.changed) {
      continue;
    }

    await tx.clubResourceItem.update({
      where: { id: resource.id },
      data: { payload: result.next },
    });
    updated += 1;
  }

  return updated;
};

const unlinkClubJsonProfiles = async (
  tx: any,
  organizationId: string,
  userId: string,
  userEmail: string | null,
  accessRole: string,
) => {
  const normalizedRole = normalizeToken(accessRole);
  if (!TRAINER_ROLES.has(normalizedRole) && !STAFF_ROLES.has(normalizedRole)) {
    return 0;
  }

  const club = await tx.club.findUnique({
    where: { id: organizationId },
    select: { trainers: true, staff_members: true },
  });

  if (!club) {
    return 0;
  }

  const trainers = TRAINER_ROLES.has(normalizedRole)
    ? unlinkProfileCollection(
        club.trainers,
        userId,
        userEmail,
        accessRole,
        "trainers",
      )
    : { next: club.trainers, changed: false };
  const staffMembers = unlinkProfileCollection(
    club.staff_members,
    userId,
    userEmail,
    accessRole,
    "staff_members",
  );
  const data: Record<string, any> = {};
  let updated = 0;

  if (trainers.changed) {
    data.trainers = trainers.next;
    updated += 1;
  }

  if (staffMembers.changed) {
    data.staff_members = staffMembers.next;
    updated += 1;
  }

  if (updated > 0) {
    await tx.club.update({
      where: { id: organizationId },
      data,
    });
  }

  return updated;
};

const unlinkParentGuardians = async (
  tx: any,
  organizationId: string,
  userId: string,
  userEmail: string | null,
  accessRole: string,
) => {
  if (!PARENT_ROLES.has(normalizeToken(accessRole))) {
    return 0;
  }

  const athletes = await tx.athlete.findMany({
    where: { organization_id: organizationId },
    select: { id: true, data: true },
  });
  const collectionKeys = ["guardians", "parents", "tutors", "tutori"];
  let updated = 0;

  for (const athlete of athletes) {
    const data = isRecord(athlete.data) ? { ...athlete.data } : {};
    let changed = false;

    for (const key of collectionKeys) {
      if (!Array.isArray(data[key])) {
        continue;
      }

      const result = unlinkParentCollection(data[key], userId, userEmail);
      if (result.changed) {
        data[key] = result.next;
        changed = true;
      }
    }

    if (!changed) {
      continue;
    }

    await tx.athlete.update({
      where: { id: athlete.id },
      data: { data },
    });
    updated += 1;
  }

  return updated;
};

const unlinkParentCollection = (
  value: unknown,
  userId: string,
  userEmail: string | null,
) => {
  let changed = false;
  const next = toArray(value).map((entry) => {
    const result = clearLinkedFields(entry, userId, userEmail);
    if (result.changed) {
      changed = true;
    }
    return result.next;
  });

  return { next, changed };
};

const unlinkDirectAthleteProfile = async (
  tx: any,
  organizationId: string,
  userId: string,
  accessRole: string,
) => {
  if (!ATHLETE_ROLES.has(normalizeToken(accessRole))) {
    return 0;
  }

  const result = await tx.athlete.updateMany({
    where: {
      organization_id: organizationId,
      user_id: userId,
    },
    data: {
      user_id: null,
    },
  });

  return result.count || 0;
};

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const membershipId = normalizeUuidLike(
      body?.membership_id || body?.membershipId || "",
    );
    const organizationId = normalizeUuidLike(
      body?.organization_id || body?.club_id || body?.organizationId || "",
    );
    const role = String(body?.role || "").trim();

    if (membershipId && !isUuid(membershipId)) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso non valido" } },
        { status: 400 },
      );
    }

    if (organizationId && !isUuid(organizationId)) {
      return NextResponse.json(
        { data: null, error: { message: "Club non valido" } },
        { status: 400 },
      );
    }

    const membership = membershipId
      ? await prisma.organizationUser.findFirst({
          where: {
            id: membershipId,
            user_id: session.db.user_id,
          },
          include: { organization: { select: { creator_id: true } } },
        })
      : await prisma.organizationUser.findFirst({
          where: {
            organization_id: organizationId,
            user_id: session.db.user_id,
            ...(role ? { role } : {}),
          },
          include: { organization: { select: { creator_id: true } } },
          orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
        });

    if (!membership) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso assegnato non trovato" } },
        { status: 404 },
      );
    }

    if (
      membership.role === "owner" &&
      membership.organization.creator_id === session.db.user_id
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "La proprieta del club non si elimina dagli accessi assegnati.",
          },
        },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const clubJsonProfiles = await unlinkClubJsonProfiles(
        tx,
        membership.organization_id,
        session.db.user_id,
        session.db.user.email,
        membership.role,
      );
      const resourceProfiles = await unlinkProfileResources(
        tx,
        membership.organization_id,
        session.db.user_id,
        session.db.user.email,
        membership.role,
      );
      const parentProfiles = await unlinkParentGuardians(
        tx,
        membership.organization_id,
        session.db.user_id,
        session.db.user.email,
        membership.role,
      );
      const athleteProfiles = await unlinkDirectAthleteProfile(
        tx,
        membership.organization_id,
        session.db.user_id,
        membership.role,
      );

      await tx.organizationUser.delete({
        where: { id: membership.id },
      });

      return {
        deletedMembershipId: membership.id,
        organizationId: membership.organization_id,
        role: membership.role,
        unlinkedProfilesCount:
          clubJsonProfiles + resourceProfiles + parentProfiles + athleteProfiles,
      };
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore eliminazione accesso" },
      },
      { status: 500 },
    );
  }
}
