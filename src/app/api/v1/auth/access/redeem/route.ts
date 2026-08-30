import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { normalizeAccessRole } from "@/lib/access-roles";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getResourceById, updateResource } from "@/lib/server/resources";

const normalizeToken = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

const organizationUserInclude = {
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
};

const isOrganizationUserUniqueError = (error: any) => {
  if (error?.code !== "P2002") {
    return false;
  }

  const target = Array.isArray(error?.meta?.target)
    ? error.meta.target.join(",")
    : String(error?.meta?.target || error?.message || "");

  return (
    target.includes("organization_id") &&
    target.includes("user_id")
  );
};

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

const loadParentAccessTarget = async (
  athleteId: string,
  guardianId: string,
  organizationId: string,
) => {
  const athlete = await prisma.athlete.findFirst({
    where: {
      id: athleteId,
      organization_id: organizationId,
    },
  });

  if (!athlete) {
    return null;
  }

  const data =
    athlete.data && typeof athlete.data === "object"
      ? (athlete.data as Record<string, any>)
      : {};
  const guardians = Array.isArray(data.guardians) ? data.guardians : [];
  const guardianIndex = guardians.findIndex(
    (guardian: any) => String(guardian?.id || "").trim() === guardianId,
  );

  if (guardianIndex < 0) {
    return {
      athlete,
      data,
      guardians,
      guardian: null,
      guardianIndex,
    };
  }

  return {
    athlete,
    data,
    guardians,
    guardian: guardians[guardianIndex],
    guardianIndex,
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

    const tokenType = String(payload.token_type || payload.tokenType || "").trim();
    let role = normalizeAccessRole(payload.role || "member") || "member";
    const trainerId = String(payload.trainer_id || "").trim();
    const athleteId = String(payload.athlete_id || "").trim();
    const guardianId = String(payload.guardian_id || "").trim();

    if (
      tokenType === "parent_access" ||
      (athleteId && guardianId && (!payload.role || role === "member"))
    ) {
      role = "parent";
    }

    const trainerTarget = trainerId ? await loadTrainerAccessTarget(trainerId) : null;
    const parentTarget =
      athleteId && guardianId
        ? await loadParentAccessTarget(
            athleteId,
            guardianId,
            accessToken.organization_id,
          )
        : null;

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

    if ((athleteId || guardianId) && (!parentTarget || !parentTarget.guardian)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Il genitore collegato a questo token non e stato trovato nella scheda atleta",
          },
        },
        { status: 404 },
      );
    }

    const alreadyLinkedUserId = String(
      trainerTarget?.record?.linkedUserId ||
        trainerTarget?.record?.linked_user_id ||
        parentTarget?.guardian?.linkedUserId ||
        parentTarget?.guardian?.linked_user_id ||
        "",
    ).trim();

    if (alreadyLinkedUserId && alreadyLinkedUserId !== session.db.user_id) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              trainerId
                ? "Questo allenatore e gia collegato a un altro account EasyGame"
                : "Questo genitore e gia collegato a un altro account EasyGame",
          },
        },
        { status: 409 },
      );
    }

    const existingMembership = await prisma.organizationUser.findFirst({
      where: {
        organization_id: accessToken.organization_id,
        user_id: session.db.user_id,
        role,
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

    const updateExistingMembership = (membershipId: string, isPrimary: boolean) =>
      prisma.organizationUser.update({
        where: { id: membershipId },
        data: {
          is_primary: isPrimary || !hasPrimaryMembership,
        },
        include: organizationUserInclude,
      });

    const createAssignedMembership = () =>
      prisma.organizationUser.create({
        data: {
          organization_id: accessToken.organization_id,
          user_id: session.db.user_id,
          role,
          is_primary: !hasPrimaryMembership,
        },
        include: organizationUserInclude,
      });

    let membership = existingMembership
      ? await updateExistingMembership(
          existingMembership.id,
          existingMembership.is_primary,
        )
      : null;

    if (!membership) {
      try {
        membership = await createAssignedMembership();
      } catch (error: any) {
        if (!isOrganizationUserUniqueError(error)) {
          throw error;
        }

        /*
          **Lo schema lo cambia una migrazione, non una richiesta.**

          Qui si eseguiva `DROP INDEX` e `CREATE UNIQUE INDEX` con
          `$executeRawUnsafe`, dentro il gestore di una rotta che un utente
          qualunque raggiunge con un token valido: una richiesta che si
          ripara il database da sola. La migrazione
          `20260521103000_allow_multiple_roles_per_organization_user` fa gia
          esattamente le stesse due istruzioni, quindi era anche codice morto
          su ogni database aggiornato.

          Il conflitto ha due cause possibili e adesso si distinguono: due
          richieste simultanee che creano la **stessa** tessera — e allora la
          riga c'e gia e la si usa — oppure il vecchio vincolo ancora in piedi,
          che e un problema di schema e va detto a chi puo applicare la
          migrazione, non aggirato.
        */
        const membershipConcorrente = await prisma.organizationUser.findFirst({
          where: {
            organization_id: accessToken.organization_id,
            user_id: session.db.user_id,
            role,
          },
        });

        if (!membershipConcorrente) {
          /*
            **La parola «database» qui cancellerebbe il messaggio.**

            `publicErrorMessage` — che questa rotta adesso attraversa — tratta
            «database» come un marcatore di errore interno e sostituisce tutto
            con «Errore collegamento al club». Il suggerimento operativo, che
            e l'unica ragione per cui questo errore esiste, non arrivava a
            nessuno: ne all'utente, ne a chi legge i log di produzione.

            Dice quindi la stessa cosa senza quella parola.
          */
          throw new Error(
            "Vincolo di unicita ancora nella forma vecchia su organization_id/user_id: " +
              "applica la migration Prisma 20260521103000_allow_multiple_roles_per_organization_user " +
              "per abilitare piu ruoli nello stesso club.",
          );
        }

        membership = await updateExistingMembership(
          membershipConcorrente.id,
          membershipConcorrente.is_primary,
        );
      }
    }
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
          redeemed_profile_resource:
            trainerTarget?.resource || (parentTarget ? "athletes" : null),
          redeemed_trainer_id: trainerId || null,
          redeemed_athlete_id: athleteId || null,
          redeemed_guardian_id: guardianId || null,
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

    if (parentTarget?.guardian) {
      const updatedGuardians = parentTarget.guardians.map((guardian: any) =>
        String(guardian?.id || "").trim() === guardianId
          ? {
              ...guardian,
              linkedUserId: session.db.user_id,
              linked_user_id: session.db.user_id,
              linkedUserEmail: session.db.user.email,
              linked_user_email: session.db.user.email,
              linkedAt: nowIso,
              linked_at: nowIso,
              parentAccessTokenRecordId: accessToken.id,
              parent_access_token_record_id: accessToken.id,
              parentAccessTokenStatus:
                payload.one_time === false ? "active" : "redeemed",
              parent_access_token_status:
                payload.one_time === false ? "active" : "redeemed",
              parentAccessTokenRedeemedAt: nowIso,
              parent_access_token_redeemed_at: nowIso,
              parentAccessTokenValue:
                payload.one_time === false ? String(accessToken.name || "") : "",
              parent_access_token_value:
                payload.one_time === false ? String(accessToken.name || "") : "",
            }
          : guardian,
      );

      await prisma.athlete.update({
        where: { id: parentTarget.athlete.id },
        data: {
          data: {
            ...parentTarget.data,
            guardians: updatedGuardians,
          },
        },
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
        error: {
          message: publicErrorMessage(error, "Errore collegamento al club"),
        },
      },
      { status: 500 },
    );
  }
}
