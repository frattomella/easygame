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
import {
  applyRedeemAccessScopes,
  deriveAthleteAccessScopes,
} from "@/lib/server/club-roles";
import {
  normalizeAccessScopes,
  type AccessScopeEntry,
} from "@/lib/roles/access-scope";
import { prisma } from "@/lib/server/prisma";
import {
  eCaricoDiTutore,
  findGuardianRow,
  linkGuardianAccount,
} from "@/lib/server/athlete-guardians";
import { guardianUserIdText } from "@/lib/guardians/identity";
import { lockAthleteRow } from "@/lib/server/resources";
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
        select: { id: true, resource_type: true },
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
        select: { id: true, resource_type: true },
      });

  const trovata = perUuid || perIdLogico;
  if (!trovata) return null;

  /*
    **Il ripiego si prende quando il primo tentativo non trova, non quando
    solleva.**

    Qui il ramo `staff_members` stava dentro un `catch`, e
    `getResourceById` senza `scope` **non solleva** quando la riga non c'e:
    `assertRecordAccess` esce con `if (!scope || !record) return`. Il primo
    tentativo restituiva percio `{ resource: "trainers", record: null }` senza
    eccezione, il `catch` non scattava mai, e il ripiego era **codice morto**:
    l'onboarding a gettone di una voce di staff rispondeva 404 e non era
    possibile.

    Il difetto era invisibile perche **mascherava** un altro difetto: finche
    nessun invito di staff si riscattava, il fatto che la revoca non lo
    chiudesse non apriva niente. Due difetti che si nascondono a vicenda
    restano tutti e due, e il giorno in cui si corregge il primo il secondo
    diventa uno sfruttamento — misurato: chiudendo questo, la revoca di una
    tessera di staff lasciava rientrare la persona.

    Si guarda percio **cio che si e trovato**, non se si e sollevato.
  */
  /*
    **Si legge la riga che la guardia ha trovato, non un'altra con lo stesso
    nome.**

    La guardia qui sopra cerca con il filtro di club — ed e giusta. Poi il
    codice **buttava via la risposta** e richiamava `getResourceById` con
    l'identificativo **logico** e senza `scope`: e in `findClubResourceRecord`
    uno `scope` assente significa nessun filtro di club, e nessun ordinamento.
    La domanda giusta veniva fatta, e la risposta veniva scartata.

    L'identificativo logico lo sceglie il client — un `id` non-UUID finisce nel
    carico senza vincolo di unicita, nemmeno fra club — quindi chi gestisce un
    club qualunque poteva coniarne uno uguale a quello di un profilo altrui,
    riscattare, e farsi scrivere l'utenza **sulla scheda dell'altro club**.
    Misurato: nove tentativi su dieci dirottati, e quale club risponda lo
    decideva l'ordine fisico delle tuple.

    Da qui in poi si nomina la riga per **identificativo di riga**, che e unico
    e che la guardia ha gia verificato appartenere a questo club. La stessa
    risposta dice anche il **tipo**, quindi il ripiego non serve piu.
  */
  const record = await getResourceById(
    trovata.resource_type as "trainers" | "staff_members",
    trovata.id,
  ).catch(() => null);

  if (!record) return null;

  return {
    resource: trovata.resource_type as "trainers" | "staff_members",
    record,
    /** L'identificativo **di riga**: e con questo che si scrive. */
    rowId: trovata.id,
  } as const;
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

  /*
    **Il gettone nomina una riga, e la domanda la fa il modulo proprietario**
    (49 §I, §J).

    Questa ricerca era scritta a mano, e il commento di allora prometteva
    proprio cio che non faceva: «e la stessa domanda che `linkGuardianAccount`
    fara dopo: se le due rispondessero diverso, il riscatto collegherebbe una
    riga e ne dichiarerebbe un'altra». Le due **rispondevano** diverso, e in un
    modo che si vede solo su una voce fusa: la guardia cercava dentro
    `athletes.data.guardians[]`, che di una posizione condivisa pubblica un
    identificativo **solo**, mentre `linkGuardianAccount` cerca fra le righe.
    Un invito coniato per la riga nascosta veniva percio rifiutato con 404 —
    una promessa fatta a una famiglia che smetteva di funzionare perche
    l'archivio ha cambiato forma.

    Adesso la domanda e `findGuardianRow`: una funzione sola, sulle **righe**,
    con l'ordine dal piu preciso al piu largo. E cio che si passa poi al
    collegamento e l'identificativo della riga **trovata qui**, non la maniglia
    che il gettone portava: la guardia e l'uso interrogano cosi la stessa riga,
    che e la prima delle due regole del confine di club.
  */
  const guardian = await findGuardianRow(prisma, athlete.id, guardianId);

  return { athlete, guardian };
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

    /*
      **Due club che coniano lo stesso codice si oscuravano a vicenda.**

      La ricerca non aveva ne filtro di organizzazione ne ordinamento, e le
      righe di un club **cancellato** restano in archivio: una revisione ha
      misurato un gettone orfano che rispondeva al posto di uno vivo,
      restituendo 409 su un riscatto legittimo.

      Il club non lo puo dire chi riscatta — non ne fa ancora parte — quindi
      si tiene il piu **recente** fra quelli di un club che esiste ancora:
      un codice riemesso vince su uno vecchio, che e cio che chi lo consegna
      si aspetta.
    */
    const candidati = await prisma.clubResourceItem.findMany({
      where: {
        resource_type: "access_tokens",
        name: token,
        organization: { is: {} },
      },
      orderBy: { updated_at: "desc" },
      take: 2,
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

    /*
      **Un codice che risponde per due club non si riscatta: si rifiuta.**

      Tenere «il piu recente» risolve il gettone orfano, ma sceglie anche
      quando la scelta non spetta a noi. Chi conosce un codice — e per
      consegnarlo qualcuno lo conosce: la segreteria che lo detta, la casella
      da cui passa — puo coniarne uno **con lo stesso nome nel proprio club**
      e toccarlo un istante dopo: da quel momento e il suo club a rispondere.
      Chi riscatta entra dove non voleva, con nome e indirizzo, e se il
      gettone del club ospite e un legame di tutore si trova davanti la
      cartella di un minore che non conosce.

      Il codice non dice a quale club appartiene, e chi riscatta non lo puo
      dire — non ne fa ancora parte. Quando la domanda e ambigua l'unica
      risposta onesta e nessuna: si rifiuta, si traccia, e il club riemette.
      Chi collide ottiene di fermare un riscatto, non di dirottarlo — che e
      il lato giusto su cui sbagliare.

      La chiusura durevole e un vincolo di unicita su
      `(resource_type, name)`, cioe una migrazione: sta nel debito tecnico
      come W6-D29, e non si apre in un closeout.
    */
    if (candidati.length > 1) {
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        motivo: "token ambiguo fra piu club",
      });
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Questo codice non e utilizzabile: chiedi al club di generarne uno nuovo",
          },
        },
        { status: 409 },
      );
    }

    const accessToken = candidati[0] || null;

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

    const trainerId = String(payload.trainer_id || "").trim();
    const athleteId = String(payload.athlete_id || "").trim();
    const guardianId = String(payload.guardian_id || "").trim();

    /*
      **Un gettone multiuso senza un profilo a cui legarsi non e multiuso: e
      illimitato** (P0-2, invariante D).

      `one_time: false` lasciava lo stato su `active` per sempre. Su un gettone
      legato a un profilo la cardinalita c'e lo stesso, ed e quella giusta: lo
      chiude `alreadyLinkedUserId`, perche la seconda persona trova la scheda
      gia collegata a un altro account. Su un gettone che non nomina nessun
      profilo quel freno **non esiste**, e lo riscattano utenti illimitati:
      misurato, due utenti diversi con lo stesso codice, due tessere.

      Nessuna schermata del prodotto conia gettoni multiuso — le due che li
      coniano scrivono `one_time: true` — quindi il caso non ha un uso
      legittimo da difendere. Il multiuso resta ammesso **solo** dove ha un
      freno: legato a un profilo. Altrimenti vale una volta.
    */
    const multiUsoLecito =
      payload.one_time === false &&
      Boolean(trainerId || athleteId || guardianId);

    if (accessToken.status === "redeemed" && !multiUsoLecito) {
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

    let role = normalizeAccessRole(payload.role || "member") || "member";

    /*
      **Il ruolo, che non e la stessa domanda della revoca.**

      Qui si decide soltanto **quale ruolo** concedere. Il collegamento del
      tutore avviene piu sotto, su `parentTarget?.guardian`, che dipende dalle
      sole `athlete_id` + `guardian_id` e avviene **qualunque sia il ruolo**.

      Le due domande sono percio due funzioni, e stanno in ordine:
      `eCaricoDiTutore` (il ruolo) e un sottoinsieme di
      `eCaricoCheApreUnaTutela` (cio che collega un tutore), ed e **quella
      larga** che la revoca usa. Averle confuse in una funzione sola lasciava
      passare un carico con `role: "trainer"` e le due chiavi: collegava il
      tutore e nessuna revoca lo chiudeva.
    */
    if (eCaricoDiTutore(payload)) {
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

    /*
      **Le quattro grafie, e non due** (49 §B).

      Questa lettura ne guardava due — `linkedUserId` e `linked_user_id` — su
      una fonte che adesso e la **riga**, dove l'utenza si chiama `user_id`:
      leggerne due voleva dire non vederla affatto, e un gettone gia collegato
      a un'altra persona sarebbe passato. `guardianUserIdText` le legge tutte e
      quattro, ed e la stessa funzione che usano i canali di invio.
    */
    const alreadyLinkedUserId =
      String(
        trainerTarget?.record?.linkedUserId ||
          trainerTarget?.record?.linked_user_id ||
          "",
      ).trim() || guardianUserIdText(parentTarget?.guardian);

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
    /*
      **La tessera nasce con il suo perimetro** (P0-2, invarianti A e B).

      Fino a qui questa rotta non scriveva **nessuna** riga di perimetro, e per
      ADR-0103 zero righe non significa «nessun accesso»: significa **tutto il
      club**. Misurato: un gestore recintato sulla sede A conia un gettone di
      allenatore, la persona lo riscatta, e da quel momento legge anche la
      sede B — cioe il gestore ha allargato il proprio recinto per interposta
      persona. E la stessa lezione che `accessScopeContains` aveva gia
      imparato sulla Gestione accessi, e che qui non arrivava.

      Due ingredienti: cio che il **profilo di origine** dichiara, e cio che
      **chi ha coniato** poteva concedere. Il secondo e un soffitto, mai un
      pavimento.
    */
    const perimetroEmittente = await (async (): Promise<AccessScopeEntry[]> => {
      /*
        Il conio di oggi timbra il perimetro sul gettone. I gettoni coniati
        prima non lo portano: per quelli si guarda il recinto **attuale** di
        chi li ha coniati, che e la cosa piu vicina al vero che l archivio
        sappia dire — e sbaglia dal lato stretto se quel recinto e stato
        ristretto nel frattempo.
      */
      const timbrato = normalizeAccessScopes(
        (payload.minted_by_scopes || payload.mintedByScopes) as any,
      );
      if (timbrato.length) return timbrato;

      const coniatore = String(payload.minted_by_user_id || "").trim();
      if (!coniatore) return [];

      const tessereConiatore = await prisma.organizationUser.findMany({
        where: {
          organization_id: accessToken.organization_id,
          user_id: coniatore,
        },
        select: { id: true },
      });
      if (!tessereConiatore.length) return [];

      const righe = await prisma.clubAccessScope.findMany({
        where: {
          organization_user_id: { in: tessereConiatore.map((r) => r.id) },
        },
        select: { scope_kind: true, scope_value: true },
      });

      return normalizeAccessScopes(
        righe.map((r) => ({ kind: r.scope_kind, value: r.scope_value })),
      );
    })();

    const perimetroProfilo = await (async (): Promise<AccessScopeEntry[]> => {
      /*
        L allenatore porta le **categorie** della sua scheda; il tutore porta
        le appartenenze del minore a cui il gettone lo lega. Un gettone di
        solo ruolo non porta niente, e allora comanda il soffitto.
      */
      if (trainerTarget?.record) {
        const categorie = Array.isArray(trainerTarget.record.categories)
          ? trainerTarget.record.categories
          : [];
        return normalizeAccessScopes(
          categorie
            .map((voce: any) =>
              String(voce?.id || voce?.value || voce || "").trim(),
            )
            .filter(Boolean)
            .map((value: string) => ({ kind: "category", value })),
        );
      }

      if (athleteId) {
        return deriveAthleteAccessScopes(
          prisma,
          accessToken.organization_id,
          athleteId,
        );
      }

      return [];
    })();

    try {
      await applyRedeemAccessScopes(
        prisma,
        membership.id,
        perimetroProfilo,
        perimetroEmittente,
      );
    } catch (errore: any) {
      await tracciaRiscatto({
        esito: "denied",
        userId: session.db.user_id,
        email: session.db.user?.email,
        organizationId: accessToken.organization_id,
        tokenRecordId: accessToken.id,
        motivo: String(errore?.message || "perimetro oltre il soffitto"),
      });
      throw errore;
    }

    const nowIso = new Date().toISOString();

    await prisma.clubResourceItem.update({
      where: { id: accessToken.id },
      data: {
        status: multiUsoLecito ? accessToken.status || "active" : "redeemed",
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
      /* Per riga, non per identificativo logico: vedi `loadTrainerAccessTarget`. */
      await updateResource(trainerTarget.resource, trainerTarget.rowId, {
        linkedUserId: session.db.user_id,
        linked_user_id: session.db.user_id,
        linkedUserEmail: session.db.user.email,
        linked_user_email: session.db.user.email,
        linkedAt: nowIso,
        linked_at: nowIso,
        accessTokenRecordId: accessToken.id,
        access_token_record_id: accessToken.id,
        accessTokenStatus: multiUsoLecito ? "active" : "redeemed",
        access_token_status: multiUsoLecito ? "active" : "redeemed",
        accessTokenRedeemedAt: nowIso,
        access_token_redeemed_at: nowIso,
        accessTokenValue: multiUsoLecito ? String(accessToken.name || "") : "",
        access_token_value:
          payload.one_time === false ? String(accessToken.name || "") : "",
        token: payload.one_time === false ? String(accessToken.name || "") : "",
      });
    }
    if (parentTarget?.guardian) {
      /*
        **Il riscatto e l'unico atto che apre, e adesso e una riga**
        (PP-02 / WP-C).

        Qui c'erano centosessanta righe, ed erano tre scritture in corsa fra
        loro: l'elemento dell'array, il registro delle identita revocate e il
        registro dei solo-recapito. Tutti e tre dentro lo stesso blob, tutti e
        tre da rileggere sotto blocco perche il valore letto a inizio richiesta
        era gia vecchio — una revoca committata nel frattempo si vedeva la
        propria riga **risuscitata**, `linkedUserId` riscritto e
        `accessRevokedAt` azzerato.

        Le tre difese vivevano in tre posti perche la riga non aveva una
        chiave: il marchio sulla riga si aggirava aggiungendone una sorella con
        lo stesso indirizzo, quindi serviva un registro a livello di scheda, e
        il registro andava tenuto d'accordo con la riga.

        Adesso sono **una** riga con una chiave, e scioglierle e una `UPDATE`:
        `revoked_at` a nullo, `contact_only` a falso, l'utenza scritta. Non c'e
        niente da rileggere perche non c'e niente da rimandare.

        Cosa resta vero, e va detto: un accesso ridato si ridà **per intero** —
        anche i promemoria del certificato medico, che guardano il marchio e
        senza questo avrebbero escluso per sempre il tutore riattivato, senza
        che niente lo dicesse.
      */
      /*
        **Si collega la riga che la guardia ha trovato, e non un'altra.**

        Qui si passava la maniglia del gettone piu un elenco di identita — le
        due dell'utenza di sessione e le tre grafie dell'indirizzo della voce.
        Se la maniglia non avesse risolto, il ripiego per identita avrebbe
        collegato una riga che **nessuna guardia aveva controllato**: due
        genitori con un indirizzo di famiglia condiviso (ADR-0114) sono la
        configurazione in cui quella scelta cade sulla persona sbagliata.

        Si passa percio l'identificativo della riga gia risolta e **nessuna**
        identita: la guardia e l'uso interrogano la stessa riga, e se nel
        frattempo non c'e piu non si collega niente — che e la risposta giusta.
      */
      await linkGuardianAccount(prisma, {
        athleteId: String(parentTarget.athlete.id),
        guardianRowId: parentTarget.guardian.id,
        identityKeys: [],
        userId: session.db.user_id,
        email: session.db.user?.email,
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
