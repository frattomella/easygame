import { NextResponse } from "next/server";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  isCustomRoleValue,
  isManagementAccessRole,
  normalizeAccessRole,
} from "@/lib/access-roles";
import { assertMayGrantRole } from "@/lib/roles/custom-role";
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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );

/**
 * **La scheda che il gettone nomina deve essere del club che l'ha coniato.**
 *
 * `trainer_id` viene dal payload del gettone, e `getResourceById` senza scope
 * non filtra per club: chi coniava un gettone nel proprio club potendo
 * scrivere l'identificativo di una scheda **altrui** collegava se stesso a
 * quella scheda. Effetti misurati: il vero allenatore di quel club non
 * riusciva piu a collegarsi (409 permanente), e il suo codice d'accesso
 * veniva sovrascritto con quello dell'attaccante — che la sua segreteria gli
 * avrebbe poi consegnato in buona fede.
 *
 * Il ramo genitore era gia scoped. Era l'asimmetria a fare il difetto.
 */
const loadTrainerAccessTarget = async (
  trainerId: string,
  organizationId: string,
) => {
  /*
    **`club_resource_items.id` e una colonna `uuid`, e `trainer_id` non lo e.**

    La prima stesura di questa guardia confrontava le due cose. Non «non
    trovava»: faceva **fallire la query** con `22P02`, e l'errore risaliva al
    catch generico come un 500. Il gettone di ogni allenatore reale ne porta
    l'**identificativo logico** — `trainer-<istante>-<casuale>`, generato in
    `trainers/new/page.tsx` e ricopiato nel gettone — quindi l'onboarding degli
    allenatori era rotto per tutti.

    Il repository conosce gia questo errore e lo scrive in `resources.ts`; la
    correzione lo aveva reintrodotto in una porta nuova. Si cercano quindi
    **entrambe** le forme, e il confine di club resta quello che serviva:
    l'identificativo logico vive dentro il payload, e la ricerca e comunque
    ristretta al club che ha coniato il gettone.
  */
  const perUuid = isUuid(trainerId)
    ? await prisma.clubResourceItem.findFirst({
        where: {
          id: trainerId,
          organization_id: organizationId,
          resource_type: { in: ["trainers", "staff_members"] },
        },
        select: { id: true },
      })
    : null;

  const perIdLogico = perUuid
    ? null
    : await prisma.clubResourceItem.findFirst({
        where: {
          organization_id: organizationId,
          resource_type: { in: ["trainers", "staff_members"] },
          payload: { path: ["id"], equals: trainerId },
        },
        select: { id: true },
      });

  if (!perUuid && !perIdLogico) return null;

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

/**
 * **Il riscatto lasciava zero righe.**
 *
 * `AUDIT_ACTIONS.accessTokenRedeemed` esisteva gia in `audit.ts` — dichiarata
 * e mai scritta da nessuno. L'atto che fa entrare una persona in un club, con
 * il ruolo che il gettone porta dentro, non compariva nel registro: ne quando
 * riusciva, ne quando qualcuno provava codici a caso.
 *
 * Il gettone non entra mai nella riga. E una credenziale, e il registro lo si
 * rilegge: resta il suo identificativo, che dice quale gettone senza dirne il
 * valore.
 */
const tracciaRiscatto = async (dati: {
  esito: "success" | "denied";
  userId?: string | null;
  email?: string | null;
  organizationId?: string | null;
  tokenRecordId?: string | null;
  /** Il ruolo **concesso** dal gettone. Non e quello dell'attore. */
  ruoloConcesso?: string | null;
  motivo?: string | null;
}) => {
  await recordAuditEvent({
    action: AUDIT_ACTIONS.accessTokenRedeemed,
    outcome: dati.esito,
    actorUserId: dati.userId || null,
    actorEmail: dati.email || null,
    /*
      **Il registro raccontava un proprietario che riscatta un gettone.**
      `actorRole` portava il ruolo *concesso*, non quello di chi agiva: la
      riga di un gestore che si promuoveva diceva `owner`, cioe nascondeva
      esattamente il fatto per cui la riga esiste. Il ruolo dell'attore non
      c'e — chi riscatta puo non avere ancora nessuna tessera qui — e
      `null` lo dice; il ruolo concesso va nei metadati, dove e un dato
      dell'atto e non un'identita.
    */
    actorRole: null,
    organizationId: dati.organizationId || null,
    resource: "access_tokens",
    resourceId: dati.tokenRecordId || null,
    metadata: {
      ...(dati.motivo ? { motivo: dati.motivo } : {}),
      ...(dati.ruoloConcesso ? { ruolo_concesso: dati.ruoloConcesso } : {}),
    },
  });
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

    /*
      **Un gettone vale una tessera: provarne tanti dev'essere caro.**

      Il codice e corto e scritto a mano; chi indovina entra nel club con il
      ruolo che il gettone porta scritto dentro. Non c'era nessun contatore,
      e la sessione richiesta qui sopra non e una difesa: le utenze si
      creano.
    */
    const limitato = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.accessTokenRedeemUser,
        identifier: String(session.db.user_id || "anonimo"),
      },
      {
        policy: AUTH_RATE_LIMITS.accessTokenRedeemIp,
        identifier: getRequestIp(request),
      },
    ]);
    if (limitato) {
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: null,
        motivo: "troppi tentativi",
      });
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi tentativi. Riprova fra qualche minuto.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(limitato) },
      );
    }

    const body = await request.json().catch(() => ({}));
    const token = normalizeToken(String(body?.token || ""));

    if (!token) {
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        motivo: "token vuoto",
      });
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
      /* Il tentativo a vuoto e il segno di chi prova codici: e la riga che lo mostra. */
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        motivo: "gettone inesistente",
      });
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

      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: "gettone scaduto",
      });

      return NextResponse.json(
        {
          data: null,
          error: { message: "Il token di accesso e scaduto" },
        },
        { status: 410 },
      );
    }

    /*
      **Un gettone revocato era ancora riscattabile.**

      L'unico controllo di stato era `status === "redeemed"`. La schermata
      «Scollega account» scrive `revoked`, «Rigenera token» scrive `expired`,
      e nessuna delle due tocca `payload.expires_at` — che era l'unica altra
      cosa guardata. Scollegare un genitore non scollegava niente: chi aveva
      il codice in tasca rientrava, e da genitore rivedeva il fascicolo
      sanitario di un minore.

      Lo stato che vale e quello della **riga**, non quello che il payload
      racconta di se stesso. Elenco chiuso: si riscatta cio che e attivo.
    */
    const statoRiga = String(accessToken.status || "active").trim().toLowerCase();
    if (statoRiga && !["active", "pending", "sent"].includes(statoRiga) && statoRiga !== "redeemed") {
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: `gettone in stato «${statoRiga}»`,
      });
      return NextResponse.json(
        {
          data: null,
          error: { message: "Questo token non e piu valido" },
        },
        { status: 410 },
      );
    }

    if (accessToken.status === "redeemed" && payload.one_time !== false) {
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: "gettone gia riscattato",
      });
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

    /*
      **Il quinto scrittore di `organization_users`, e l'unico senza soffitto.**

      La Wave 5 ha messo `assertConcessioneDiAccessoLecita` su quattro strade
      che tesserano qualcuno; questa e la quinta e non la conosceva. Misurato:
      `POST /api/v1/organization_users {role:"owner"}` risponde «l'accesso a un
      club non si concede da soli», e poi lo stesso gestore coniava un gettone
      con `payload.role: "owner"`, lo riscattava, e diventava proprietario.

      Qui il concedente non e chi riscatta: e chi ha **coniato** il gettone. Il
      soffitto e quindi il suo, e viene applicato in due tempi — al conio, in
      `resources.ts`, dove il ruolo attivo si conosce; e qui, che e la difesa
      che vale anche per i gettoni coniati prima di questa correzione, quando
      la firma non c'era.
    */
    const coniatoDa = String(payload.minted_by_role || "").trim();

    if (isCustomRoleValue(payload.role) || isCustomRoleValue(role)) {
      /*
        Un gettone che dichiara uno slug personalizzato scriveva la tessera con
        il ruolo **base** e `custom_role_id: null` — la riga incoerente che
        ADR-0102 vieta, che da il ruolo base **senza** il restringimento. La
        rotta generica la rifiuta gia; questa la scriveva.
      */
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: "un ruolo personalizzato non si concede con un gettone",
      });
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Un ruolo personalizzato si assegna dalla gestione accessi, non con un token",
          },
        },
        { status: 403 },
      );
    }

    try {
      /*
        Senza firma — i gettoni coniati prima di questa correzione — si giudica
        con il piu stretto dei concedenti possibili: `club_manager`. Cosi un
        gettone storico continua a valere per allenatori, famiglie e soci, e
        **non** puo piu consegnare il club.
      */
      /*
        **Senza firma si giudica con il concedente piu stretto possibile.**

        Il ripiego era `club_manager`, che chiude `owner` e lascia
        `club_manager`. Ma un gettone senza firma e per definizione **anteriore**
        alle guardie di questa Wave, cioe di quando un collaboratore poteva
        forgiarne uno da `club_resource_items`: fidarsi che lo abbia coniato la
        direzione e la cosa che non si puo sapere.

        Un gettone storico continua percio a valere per cio per cui i gettoni
        esistono — allenatori, famiglie, soci, atleti — e non concede piu un
        ruolo che **amministra** il club. Chi ne avesse bisogno lo riconia: il
        conio di oggi la firma ce l'ha.
      */
      if (!coniatoDa && isManagementAccessRole(role)) {
        throw new Error(
          "Accesso negato: un gettone senza firma non concede un ruolo che amministra il club",
        );
      }
      assertMayGrantRole(coniatoDa || "club_manager", { role });
    } catch (errore: any) {
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: String(errore?.message || "concessione oltre il soffitto"),
      });
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Questo token concede un ruolo che chi lo ha emesso non poteva concedere",
          },
        },
        { status: 403 },
      );
    }

    const trainerTarget = trainerId
      ? await loadTrainerAccessTarget(trainerId, accessToken.organization_id)
      : null;
    const parentTarget =
      athleteId && guardianId
        ? await loadParentAccessTarget(
            athleteId,
            guardianId,
            accessToken.organization_id,
          )
        : null;

    if (trainerId && !trainerTarget?.record) {
      /*
        Comprende il caso in cui la scheda **esiste ma e di un altro club**:
        e il segnale del tentativo di scavalcare il confine, e taceva.
      */
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: "scheda allenatore assente o di un altro club",
      });
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
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: "genitore assente dalla scheda atleta",
      });
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
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: "la scheda e gia collegata a un altro account",
      });
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

    await tracciaRiscatto({
      esito: "success",
      userId: session.db.user_id,
      email: session.db.user?.email,
      organizationId: accessToken.organization_id,
      tokenRecordId: accessToken.id,
      ruoloConcesso: role,
    });

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
