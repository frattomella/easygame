import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getResourceById, updateResource } from "@/lib/server/resources";

const normalizeToken = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

const loadTrainerAccessTarget = async (trainerId: string) => {
  try {
    return {
      resource: "trainers",
      record: await getResourceById("trainers", trainerId),
    } as const;
  } catch {
    try {
      return {
        resource: "staff_members",
        record: await getResourceById("staff_members", trainerId),
      } as const;
    } catch {
      return null;
    }
  }
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
    const token = normalizeToken(String(body?.token || ""));

    if (!token) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Inserisci un token valido" },
        },
        { status: 400 },
      );
    }

    const accessToken = await prisma.clubResourceItem.findFirst({
      where: {
        resource_type: "access_tokens",
        name: token,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logo_url: true,
            creator_id: true,
            contact_email: true,
            contact_phone: true,
            city: true,
            province: true,
            created_at: true,
          },
        },
      },
    });

    if (!accessToken) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Token non trovato o non piu valido" },
        },
        { status: 404 },
      );
    }

    const payload =
      typeof accessToken.payload === "object" && accessToken.payload
        ? (accessToken.payload as Record<string, any>)
        : {};

    const expiresAtRaw = payload.expires_at || payload.expiresAt || null;
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
      await prisma.clubResourceItem.update({
        where: { id: accessToken.id },
        data: {
          status: "expired",
          payload: {
            ...payload,
            expired_at: new Date().toISOString(),
          },
        },
      });

      return NextResponse.json(
        {
          data: null,
          error: { message: "Il token di accesso e scaduto" },
        },
        { status: 410 },
      );
    }

    if (accessToken.status === "redeemed" && payload.one_time !== false) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Questo token e gia stato utilizzato" },
        },
        { status: 409 },
      );
    }

    const role = String(payload.role || "member").trim() || "member";
    const trainerId = String(payload.trainer_id || "").trim();
    const trainerTarget = trainerId ? await loadTrainerAccessTarget(trainerId) : null;

    if (trainerId && !trainerTarget?.record) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "La scheda allenatore collegata a questo token non e stata trovata",
          },
        },
        { status: 404 },
      );
    }

    const alreadyLinkedUserId = String(
      trainerTarget?.record?.linkedUserId ||
        trainerTarget?.record?.linked_user_id ||
        "",
    ).trim();

    if (alreadyLinkedUserId && alreadyLinkedUserId !== session.db.user_id) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Questo allenatore e gia collegato a un altro account EasyGame",
          },
        },
        { status: 409 },
      );
    }

    const existingMembership = await prisma.organizationUser.findUnique({
      where: {
        organization_id_user_id: {
          organization_id: accessToken.organization_id,
          user_id: session.db.user_id,
        },
      },
    });

    const hasPrimaryMembership = await prisma.organizationUser.findFirst({
      where: {
        user_id: session.db.user_id,
        is_primary: true,
      },
      select: {
        id: true,
      },
    });

    const membership = await prisma.organizationUser.upsert({
      where: {
        organization_id_user_id: {
          organization_id: accessToken.organization_id,
          user_id: session.db.user_id,
        },
      },
      update: {
        role,
      },
      create: {
        organization_id: accessToken.organization_id,
        user_id: session.db.user_id,
        role,
        is_primary: !hasPrimaryMembership,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logo_url: true,
            creator_id: true,
            contact_email: true,
            contact_phone: true,
            city: true,
            province: true,
            created_at: true,
          },
        },
      },
    });
    const nowIso = new Date().toISOString();

    await prisma.clubResourceItem.update({
      where: { id: accessToken.id },
      data: {
        status: payload.one_time === false ? accessToken.status || "active" : "redeemed",
        payload: {
          ...payload,
          redeemed_at: nowIso,
          redeemed_by: session.db.user_id,
          redemption_count: Number(payload.redemption_count || 0) + 1,
          last_redeemed_membership_id: membership.id,
          reused_membership: Boolean(existingMembership),
          redeemed_profile_resource: trainerTarget?.resource || null,
          redeemed_trainer_id: trainerId || null,
        },
      },
    });

    if (trainerId && trainerTarget?.record) {
      await updateResource(trainerTarget.resource, trainerId, {
        linkedUserId: session.db.user_id,
        linked_user_id: session.db.user_id,
        linkedUserEmail: session.db.user.email,
        linked_user_email: session.db.user.email,
        linkedAt: nowIso,
        linked_at: nowIso,
        accessTokenRecordId: accessToken.id,
        access_token_record_id: accessToken.id,
        accessTokenStatus: payload.one_time === false ? "active" : "redeemed",
        access_token_status: payload.one_time === false ? "active" : "redeemed",
        accessTokenRedeemedAt: nowIso,
        access_token_redeemed_at: nowIso,
        accessTokenValue: payload.one_time === false ? String(accessToken.name || "") : "",
        access_token_value:
          payload.one_time === false ? String(accessToken.name || "") : "",
        token: payload.one_time === false ? String(accessToken.name || "") : "",
      });
    }

    return NextResponse.json({
      data: {
        membership: {
          ...membership,
          organizations: membership.organization,
        },
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore collegamento al club" },
      },
      { status: 500 },
    );
  }
}
