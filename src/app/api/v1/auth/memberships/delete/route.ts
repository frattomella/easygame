import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
/*
  Lo sweep che ripulisce trainer/staff/genitori/atleta dopo che una tessera se
  ne va vive in `profile-account-links.ts`: lo chiama anche `revokeClubAccess`
  (`club-roles.ts`), che prima di questa correzione cancellava la tessera e
  basta, lasciando dietro esattamente i riferimenti dangling che questa rotta
  gia ripuliva per l'uscita volontaria. Due copie della stessa scopa sono la
  duplicazione che CLAUDE.md §2 vieta.
*/
import {
  unlinkClubJsonProfiles,
  unlinkProfileResources,
  unlinkParentGuardians,
  unlinkDirectAthleteProfile,
} from "@/lib/server/profile-account-links";

const UUID_PATTERN =
  /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuidLike = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/^urn:uuid:/i, "");

const isUuid = (value: unknown) => UUID_PATTERN.test(String(value || "").trim());

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
