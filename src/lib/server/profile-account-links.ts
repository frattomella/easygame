import { athleteWithinAccessScope } from "./access-scope-query";
import { prisma } from "./prisma";
import { reportServerError } from "./observability";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { syncClubAggregateField } from "./resources";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";

/**
 * **Scollegare un profilo dall'utenza che vi accedeva, senza toccare la
 * tessera di club** (correzione Fortitudo Scauri, 2026-09-03).
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * «Scollega account» sulla scheda allenatore chiamava `DELETE
 * /api/v1/organization_users/<id>`: la stessa rotta che `resources.ts`
 * rifiuta esplicitamente per **qualunque** tessera, con il messaggio «una
 * tessera di club si revoca dalla gestione accessi, non dalla rotta
 * generica». Il pulsante non chiedeva di revocare una tessera: chiedeva a
 * **questo profilo** di dimenticare l'utenza che aveva. Le due cose non sono
 * la stessa, e il codice le trattava come se lo fossero.
 *
 * Il difetto gemello viveva dall'altra parte: `revokeClubAccess`
 * (`club-roles.ts`) cancella la tessera e basta. Non tocca
 * `clubs.trainers[].linkedUserId`, non tocca `athletes.data.guardians[]`, non
 * tocca `athletes.user_id`. Un proprietario che revoca l'accesso di un
 * allenatore dalla Gestione Accessi lascia la sua scheda ancora «collegata» a
 * un'utenza che nel club non ha piu nessuna tessera — la coppia esatta di
 * campi che lo stato di Fortitudo Scauri porta ancora oggi
 * (`linked_user_id` valorizzato, `organization_users` vuota).
 *
 * ## Le tre operazioni, e perche vivono qui
 *
 * - **Scollegare un profilo** (`unlinkTrainerAccount`,
 *   `unlinkGuardianAccount`) — un atto della scheda, un profilo alla volta.
 *   Non tocca `organization_users` per costruzione: non lo chiede a nessuno,
 *   non lo importa.
 * - **Ripulire i riferimenti dopo una revoca completa** — le funzioni a
 *   sweep (`unlinkClubJsonProfiles`, `unlinkProfileResources`,
 *   `unlinkParentGuardians`, `unlinkDirectAthleteProfile`) che
 *   `POST /api/v1/auth/memberships/delete` (l'utente che lascia da solo il
 *   club) e `revokeClubAccess` (il proprietario che lo caccia) chiamano
 *   entrambe, sulla stessa transazione che cancella la tessera. **Prima**
 *   vivevano solo nella prima rotta: la seconda cancellava la tessera e
 *   lasciava tutto il resto dov'era. Sono spostate qui perche due copie della
 *   stessa scopa sono la duplicazione che CLAUDE.md §2 vieta, e perche la
 *   prossima porta che revoca una tessera deve trovarle gia scritte, non
 *   riscriverle.
 *
 * Un profilo non e mai piu di un'utenza qui: un'utenza puo essere allenatore
 * **e** atleta **e** genitore nello stesso club, e scollegarne uno non tocca
 * gli altri due (§6 del mandato). Nessuna delle funzioni di questo modulo
 * cerca «tutti i profili di questa persona»: ognuna cerca il **profilo che le
 * e stato indicato**, o — per lo sweep — i profili di **quel ruolo preciso**
 * nel **club che sta revocando**.
 *
 * ## Cosa questo modulo NON fa
 *
 * Non scrive `athletes.user_id` per il caso «scollega un profilo atleta dalla
 * sua scheda»: quello resta `src/lib/server/athlete-accounts.ts`
 * (`unlinkAthleteAccount`), che e il proprietario dichiarato di quella
 * colonna (CLAUDE.md §2). Lo sweep di questo modulo la tocca comunque
 * (`unlinkDirectAthleteProfile`) per lo stesso motivo per cui
 * `memberships/delete/route.ts` lo faceva gia prima di questa correzione: una
 * revoca completa deve trovare **tutti** i profili di quell'utenza in quel
 * club, e l'atleta e uno di questi. Non e un secondo scrittore nuovo — era
 * gia cosi, spostato qui per non duplicarlo una terza volta.
 */

export type ProfileAccountLinksScope = {
  userId: string;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds?: readonly string[];
  accessScopes?: readonly AccessScopeEntry[] | null;
  actorEmail?: string | null;
};

const testo = (value: unknown) => String(value ?? "").trim();

const negato = (messaggio: string) => new Error(`Accesso negato: ${messaggio}`);

/**
 * Il permesso di scollegare **questo tipo** di profilo.
 *
 * `GESTIONE` per costruzione (catalogo permessi): chi legge gia per intero la
 * scheda puo anche scollegarne l'accesso, la stessa ragione di
 * `accounts.athlete.manage`.
 */
const assertPuoScollegare = async (
  scope: ProfileAccountLinksScope,
  permission: "accounts.trainer.manage" | "accounts.parent.manage",
  resource: string,
  resourceId?: string | null,
) => {
  if (roleHasPermission(scope.activeRole, permission)) return;

  await recordPermissionDenied({
    scope: {
      userId: scope.userId,
      activeRole: scope.activeRole,
      activeOrganizationId: scope.activeOrganizationId,
    },
    permission,
    resource,
    resourceId: resourceId || null,
  });

  throw negato("il ruolo attivo non puo scollegare questo account");
};

const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    testo(value),
  );

/* ========================================================================= *
 *  Utilita condivise: leggere e ripulire i campi di collegamento
 * ========================================================================= */

export const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const toArray = (value: unknown) => (Array.isArray(value) ? value : []);

const normalizeToken = (value: unknown) => testo(value).toLowerCase();

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
    return [value.id, value.value, value.userId, value.user_id, value.email, value.label]
      .map((entry) => testo(entry))
      .filter(Boolean);
  }

  return [testo(value)].filter(Boolean);
};

const hasTargetToken = (
  value: unknown,
  userId: string,
  userEmail: string | null,
) => {
  const targets = [normalizeToken(userId), normalizeToken(userEmail)].filter(Boolean);
  return flattenTokens(value).some((entry) => targets.includes(normalizeToken(entry)));
};

export const isLinkedToTarget = (
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
  if (!Array.isArray(value)) return value;
  return value.filter((entry) => !hasTargetToken(entry, userId, userEmail));
};

/**
 * Ripulisce **tutti** i nomi doppi di un legame — `linkedUserId` e
 * `linked_user_id`, `linkedUserEmail` e `linked_user_email`, `linkedAt` e
 * `linked_at` — nello stesso gesto.
 *
 * E la funzione che chiude il difetto misurato su Fortitudo Scauri: prima di
 * questa correzione due percorsi diversi scrivevano ognuno una sola grafia,
 * e le due finivano scollegate — `linkedUserId` a `null`, `linked_user_id`
 * ancora valorizzato. Chi vuole scollegare un profilo passa sempre da qui, e
 * non da un oggetto scritto a mano.
 *
 * `changed` e `false` quando il record non era collegato a **questo**
 * utente: scollegare un profilo gia scollegato non e un errore, e le funzioni
 * che chiamano questa restano percio idempotenti.
 */
export const clearLinkedFields = (
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
    /*
      **Anche `userId` e `user_id`**, che concedono e che nessuno ripuliva.

      `resolveFamilyRecipients` in `document-requests.ts` raccoglie **quattro**
      grafie dell'identificativo, non due: una riga tutore scritta con
      `user_id` sopravviveva alla revoca e continuava a ricevere le notifiche
      documentali su quel minore — che ne portano il nome e il documento
      chiesto. Il cruscotto no, perche la sua proiezione quelle due grafie le
      lascia cadere; la campanella si. Due letture, due risposte.
    */
    userId: null,
    user_id: null,
    linkedUserEmail: null,
    linked_user_email: null,
    linkedUserIds: removeTargetFromList(record.linkedUserIds, userId, userEmail),
    linked_user_ids: removeTargetFromList(record.linked_user_ids, userId, userEmail),
    linkedUserEmails: removeTargetFromList(record.linkedUserEmails, userId, userEmail),
    linked_user_emails: removeTargetFromList(
      record.linked_user_emails,
      userId,
      userEmail,
    ),
    linkedAt: null,
    linked_at: null,
    accessTokenRecordId: null,
    access_token_record_id: null,
    /*
      **La revoca scrive un negativo, e non basta cancellare i positivi.**

      Il legame che concede l'accesso ha **quattro** forme, e la quarta e
      l'indirizzo di **contatto** che la segreteria scrive a mano sulla scheda
      (`guardian.email`). Quell'indirizzo qui non si tocca — deve restare,
      perche il club deve poter continuare a scrivere a quella persona — e
      finche non c'era questo campo la conseguenza era che **la revoca non
      revocava**: la scheda diceva «Account non collegato», il dialogo aveva
      promesso «non vedra piu calendario, pagamenti e documenti del minore», e
      la persona continuava a vedere tutto, byte del certificato medico
      compresi.

      Non e un caso limite: e il percorso normale di una separazione, di un
      affido che cambia, di un tutore che il club toglie. Cancellare
      l'indirizzo avrebbe risolto l'accesso distruggendo un dato che serve; un
      negativo esplicito toglie l'accesso e lascia il dato.

      Un riscatto successivo riscrive `linkedUserId`, e quello vince: il
      marchio nega il **ripiego** sull'indirizzo, non un legame dichiarato.
    */
    accessRevokedAt: new Date().toISOString(),
    access_revoked_at: new Date().toISOString(),
  };

  if (isRecord(record.data)) {
    next.data = {
      ...record.data,
      linkedUserId: null,
      linked_user_id: null,
      linkedUserEmail: null,
      linked_user_email: null,
      linkedUserIds: removeTargetFromList(record.data.linkedUserIds, userId, userEmail),
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

/* ========================================================================= *
 *  Scollegare UN profilo allenatore
 * ========================================================================= */

const TIPI_ALLENATORE = ["trainers", "staff_members"] as const;

const caricaAllenatoreDelClubAttivo = async (
  scope: ProfileAccountLinksScope,
  trainerId: string,
) => {
  const id = testo(trainerId);
  if (!id) throw new Error("Allenatore mancante");

  /*
    Le stesse due forme dell'identificativo che `access/redeem/route.ts`
    conosce gia: `club_resource_items.id` e una colonna UUID, e il gettone di
    un allenatore reale porta l'identificativo **logico**
    (`trainer-<istante>-<casuale>`).
  */
  const perUuid = isUuid(id)
    ? await prisma.clubResourceItem.findFirst({
        where: { id, resource_type: { in: [...TIPI_ALLENATORE] } },
      })
    : null;

  const record =
    perUuid ||
    (await prisma.clubResourceItem.findFirst({
      where: {
        resource_type: { in: [...TIPI_ALLENATORE] },
        payload: { path: ["id"], equals: id },
      },
    }));

  if (!record) throw new Error("Allenatore non trovato");
  assertActiveClub(scope, record.organization_id, "l'allenatore");

  return record;
};

export type UnlinkTrainerAccountResult = {
  trainerId: string;
  unlinkedUserId: string | null;
};

/**
 * Scollega l'utenza dalla scheda di **questo** allenatore.
 *
 * Non tocca `organization_users`: la tessera, se c'e ancora, resta. Non
 * tocca gli altri profili della stessa utenza: un atleta collegato altrove
 * non lo sa nemmeno.
 */
export const unlinkTrainerAccount = async (
  scope: ProfileAccountLinksScope,
  input: { trainerId: string; reason?: string | null },
): Promise<UnlinkTrainerAccountResult> => {
  await assertPuoScollegare(
    scope,
    "accounts.trainer.manage",
    "trainers",
    input.trainerId,
  );
  const record = await caricaAllenatoreDelClubAttivo(scope, input.trainerId);

  const payload = (
    record.payload && typeof record.payload === "object" ? record.payload : {}
  ) as Record<string, any>;
  const linkedUserId =
    testo(payload.linkedUserId || payload.linked_user_id) || null;

  if (!linkedUserId) {
    return { trainerId: record.id, unlinkedUserId: null };
  }

  /*
    Un'unica scrittura, con **entrambe** le grafie insieme: e la forma che
    chiude il difetto misurato — non due percorsi che ne scrivono una a testa
    e lasciano l'altra dov'era.
  */
  const nextPayload = {
    ...payload,
    linkedUserId: null,
    linked_user_id: null,
    linkedUserEmail: "",
    linked_user_email: "",
    linkedAt: null,
    linked_at: null,
    accessTokenStatus: "revoked",
    access_token_status: "revoked",
    accessTokenValue: "",
    access_token_value: "",
    token: "",
  };
  await prisma.clubResourceItem.update({
    where: { id: record.id },
    data: { payload: nextPayload },
  });

  /*
    `clubs.trainers` / `clubs.staff_members` sono una **proiezione** JSON
    delle stesse righe (D2): gran parte dell'interfaccia legge ancora di li.
    Senza riallinearla qui, lo scollegamento aggiornerebbe la riga vera e
    lascerebbe la proiezione con il vecchio collegamento — lo stesso
    disallineamento misurato su Fortitudo Scauri, spostato invece di chiuso.
  */
  await syncClubAggregateField(record.organization_id, record.resource_type);

  /*
    Il gettone d'accesso vive come riga a se (`club_resource_items`,
    `resource_type: "access_tokens"`): non ha una proiezione JSON da
    tenere allineata, quindi qui basta Prisma diretto. Un fallimento non
    annulla lo scollegamento gia scritto sopra: e un'azione di sicurezza in
    piu, non il fatto che questa funzione esiste per registrare.
  */
  const tokenRecordId = testo(
    payload.accessTokenRecordId || payload.access_token_record_id,
  );
  if (tokenRecordId) {
    try {
      await prisma.clubResourceItem.updateMany({
        where: { id: tokenRecordId, resource_type: "access_tokens" },
        data: { status: "revoked" },
      });
    } catch (error) {
      reportServerError(error, {
        metadata: {
          trainerId: record.id,
          esito: "[profile-account-links] revoca token allenatore non riuscita",
        },
      });
    }
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.trainerAccountUnlinked,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail,
    actorRole: scope.activeRole,
    organizationId: record.organization_id,
    resource: record.resource_type,
    resourceId: record.id,
    metadata: {
      unlinked_user_id: linkedUserId,
      reason: testo(input.reason) || null,
    },
  });

  return { trainerId: record.id, unlinkedUserId: linkedUserId };
};

/* ========================================================================= *
 *  Scollegare UN genitore
 * ========================================================================= */

const caricaAtletaDelClubAttivo = async (
  scope: ProfileAccountLinksScope,
  athleteId: string,
) => {
  const id = testo(athleteId);
  if (!id) throw new Error("Atleta mancante");

  const atleta = await prisma.athlete.findUnique({ where: { id } });
  if (!atleta) throw new Error("Atleta non trovato");
  assertActiveClub(scope, atleta.organization_id, "l'atleta");

  /*
    **E il perimetro di sede e categoria, che questa porta non chiedeva.**

    Il gemello che gestisce l'accesso degli atleti ce l'ha; questa — l'unica
    porta con cui si **revoca** un tutore — no, benche lo scope dichiari
    `accessScopes` e nessuna riga lo leggesse.

    Il verso pericoloso non e la lettura: e che la revoca **scrive**. Un
    collaboratore recintato sulla sede Nord poteva chiamarla su un minore
    della sede Sud e mettere l'identita del tutore vero nell'elenco delle
    revoche, chiudendogli l'accesso su ogni canale — cruscotto, promemoria del
    certificato, solleciti, notifiche documentali. E per uscirne serve un
    **riscatto**, cioe coniare un gettone, che e della direzione: un ruolo
    perimetrato poteva togliere cio che non puo ridare.
  */
  if (!(await athleteWithinAccessScope(atleta.organization_id, atleta.id, scope))) {
    throw new Error(
      "Accesso negato: questo atleta e fuori dal tuo perimetro",
    );
  }

  return atleta;
};

export type UnlinkGuardianAccountResult = {
  athleteId: string;
  guardianId: string;
  unlinkedUserId: string | null;
};

/**
 * Scollega l'utenza dal genitore **indicato** di questo atleta.
 *
 * Il genitore vive dentro `athletes.data.guardians[]` (`athlete-guardians.ts`):
 * non e una riga a se, quindi non ha una tessera propria da toccare — solo
 * l'elemento dell'elenco cambia, in una sola scrittura del campo `data`.
 */
export const unlinkGuardianAccount = async (
  scope: ProfileAccountLinksScope,
  input: { athleteId: string; guardianId: string; reason?: string | null },
): Promise<UnlinkGuardianAccountResult> => {
  await assertPuoScollegare(
    scope,
    "accounts.parent.manage",
    "athletes",
    input.athleteId,
  );
  const atleta = await caricaAtletaDelClubAttivo(scope, input.athleteId);

  const data = isRecord(atleta.data) ? (atleta.data as Record<string, any>) : {};
  const guardians = toArray(data.guardians);
  const guardianId = testo(input.guardianId);
  const index = guardians.findIndex((entry) => testo(entry?.id) === guardianId);

  if (index < 0) {
    throw new Error("Genitore non trovato nella scheda atleta");
  }

  const guardian = guardians[index] || {};

  /*
    **Quattro grafie, non due.**

    `resolveFamilyRecipients` ne legge quattro per decidere **chi riceve**, e
    una riga scritta con `userId`/`user_id` usciva di qui al primo `return`:
    nessun marchio, nessuna ripulitura, nessun audit — e la rotta rispondeva
    **200**. La scheda mostrava «Account non collegato» perche anche quel badge
    guarda due grafie, quindi il club non aveva modo di sapere che quella
    persona continuava a ricevere le notifiche documentali sul minore, ne un
    pulsante per toglierla.

    E la forma esatta del difetto che questa funzione e nata per chiudere,
    sopravvissuta su un canale diverso.
  */
  const linkedUserId =
    testo(
      guardian.linkedUserId ||
        guardian.linked_user_id ||
        guardian.userId ||
        guardian.user_id,
    ) || null;

  const linkedUserEmail =
    testo(
      guardian.linkedUserEmail || guardian.linked_user_email || guardian.email,
    ) || null;

  /*
    **Non c'e piu un'uscita silenziosa.** Una riga senza nessuna identita non
    concede niente e non c'e niente da revocare; una riga che ha almeno un
    indirizzo si revoca, perche e quell'indirizzo a fare da ripiego.
  */
  if (!linkedUserId && !linkedUserEmail) {
    return { athleteId: atleta.id, guardianId, unlinkedUserId: null };
  }
  const { next } = clearLinkedFields(
    guardian,
    linkedUserId || "",
    linkedUserEmail,
  );
  const nextGuardian = {
    ...next,
    parentAccessTokenStatus: "revoked",
    parent_access_token_status: "revoked",
  };

  const nextGuardians = guardians.map((entry, position) =>
    position === index ? nextGuardian : entry,
  );

  /*
    **L'accesso si toglie a un'identita, non a una riga.**

    Il marchio sulla riga si aggirava in due mosse, e nessuna delle due
    richiedeva malafede: aggiungerne una **nuova** con lo stesso indirizzo e un
    `id` diverso, oppure lasciare che lo facesse il dominio dei moduli, che
    all'approvazione di un'iscrizione in cui la persona si dichiara tutore fa
    `guardians.push(...)` di un oggetto nuovo. Una riga pulita, e il ripiego
    sull'indirizzo la accetta.

    L'elenco vive sull'atleta e non ha un `id` da cambiare. Chi si presenta con
    un'identita che sta qui dentro non entra, da qualunque riga arrivi —
    finche non torna con un legame **dichiarato**, cioe un riscatto, che e la
    strada che ha il suo gate e che da questo elenco lo toglie.
  */
  const identitaRevocate = new Set<string>(
    (Array.isArray((data as any).revokedGuardianIdentities)
      ? (data as any).revokedGuardianIdentities
      : []
    )
      .map((valore: unknown) => String(valore || "").trim().toLowerCase())
      .filter(Boolean),
  );

  for (const valore of [linkedUserId, linkedUserEmail]) {
    const pulito = String(valore || "").trim().toLowerCase();
    if (pulito) identitaRevocate.add(pulito);
  }

  await prisma.athlete.update({
    where: { id: atleta.id },
    data: {
      data: {
        ...data,
        guardians: nextGuardians,
        revokedGuardianIdentities: Array.from(identitaRevocate) as string[],
      },
    },
  });

  const tokenRecordId = testo(
    guardian.parentAccessTokenRecordId || guardian.parent_access_token_record_id,
  );
  if (tokenRecordId) {
    try {
      await prisma.clubResourceItem.updateMany({
        where: { id: tokenRecordId, resource_type: "access_tokens" },
        data: { status: "revoked" },
      });
    } catch (error) {
      reportServerError(error, {
        metadata: {
          athleteId: atleta.id,
          guardianId,
          esito: "[profile-account-links] revoca token genitore non riuscita",
        },
      });
    }
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.guardianAccountUnlinked,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail,
    actorRole: scope.activeRole,
    organizationId: atleta.organization_id,
    resource: "athletes",
    resourceId: atleta.id,
    metadata: {
      guardian_id: guardianId,
      unlinked_user_id: linkedUserId,
      reason: testo(input.reason) || null,
    },
  });

  return { athleteId: atleta.id, guardianId, unlinkedUserId: linkedUserId };
};

/* ========================================================================= *
 *  Lo sweep: ripulire i riferimenti dopo una revoca completa
 *
 *  Spostato da `src/app/api/v1/auth/memberships/delete/route.ts` (che lo
 *  chiamava gia per l'uscita volontaria dal club) perche `revokeClubAccess`
 *  ne ha bisogno per lo stesso motivo e non lo aveva: due copie della stessa
 *  scopa sono la duplicazione che CLAUDE.md §2 vieta.
 * ========================================================================= */

export const TRAINER_ROLES = new Set(["trainer", "allenatore", "coach"]);
export const PARENT_ROLES = new Set(["parent", "genitore", "guardian", "tutore"]);
export const ATHLETE_ROLES = new Set(["athlete", "atleta", "player"]);
export const STAFF_ROLES = new Set([
  "admin",
  "manager",
  "gestore",
  "staff",
  "member",
  "socio",
  "collaborator",
  "collaboratore",
]);

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
    if (result.changed) changed = true;
    return result.next;
  });

  return { next, changed };
};

/** Ripulisce `club_resource_items` (`trainers` / `staff_members`) di `organizationId`. */
export const unlinkProfileResources = async (
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
    if (!result.changed) continue;

    await tx.clubResourceItem.update({
      where: { id: resource.id },
      data: { payload: result.next },
    });
    updated += 1;
  }

  return updated;
};

/** Ripulisce la proiezione JSON `clubs.trainers` / `clubs.staff_members`. */
export const unlinkClubJsonProfiles = async (
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
  if (!club) return 0;

  const trainers = TRAINER_ROLES.has(normalizedRole)
    ? unlinkProfileCollection(club.trainers, userId, userEmail, accessRole, "trainers")
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
    await tx.club.update({ where: { id: organizationId }, data });
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
    if (result.changed) changed = true;
    return result.next;
  });

  return { next, changed };
};

/** Ripulisce `athletes.data.guardians[]` (ed elenchi storici) di tutti gli atleti del club. */
export const unlinkParentGuardians = async (
  tx: any,
  organizationId: string,
  userId: string,
  userEmail: string | null,
  accessRole: string,
) => {
  if (!PARENT_ROLES.has(normalizeToken(accessRole))) return 0;

  const athletes = await tx.athlete.findMany({
    where: { organization_id: organizationId },
    select: { id: true, data: true },
  });
  /*
    **Le chiavi che si spazzano erano quelle che nessuno legge.**

    L'elenco copriva `parents`, `tutors` e `tutori` — tre forme che nessun
    predicato di accesso consulta — e **non** `parent1`/`parent2`, che invece
    concedono: il vaglio del legame ci ricade quando `guardians` e vuoto, e da
    li passano anche i solleciti degli insoluti e i promemoria del certificato.

    Cioe si spazzava dove non c'era polvere e si lasciava intatto cio che apre
    la porta. Una anagrafica travasata — che e la ragione per cui quella coppia
    esiste — restava senza nessuna strada di revoca: il pulsante «Scollega
    account» non ha una riga da indicare, e la revoca della tessera non la
    guardava.
  */
  const collectionKeys = ["guardians", "parents", "tutors", "tutori"];
  const legacyKeys = ["parent1", "parent2"];
  let updated = 0;

  for (const athlete of athletes) {
    const data = isRecord(athlete.data) ? { ...athlete.data } : {};
    let changed = false;

    for (const key of collectionKeys) {
      if (!Array.isArray(data[key])) continue;

      const result = unlinkParentCollection(data[key], userId, userEmail);
      if (result.changed) {
        data[key] = result.next;
        changed = true;
      }
    }

    /*
      La coppia storica sono **oggetti**, non array: si trattano a parte, con
      lo stesso `clearLinkedFields` che ripulisce le righe dell'elenco.
    */
    for (const key of legacyKeys) {
      if (!isRecord(data[key])) continue;

      const esito = clearLinkedFields(data[key], userId, userEmail);
      if (esito.changed) {
        data[key] = esito.next;
        changed = true;
      }
    }

    /*
      **L'identita si registra dove quella persona compare, e solo li.**

      Due stesure sbagliate, in due direzioni opposte, e la seconda era mia.

      La prima registrava **dopo** `if (!changed) continue`: su un atleta la cui
      unica riga fosse storica — o gia ripulita da una stesura precedente —
      l'elenco non veniva mai scritto, e saltava la sola difesa che tutti gli
      altri lettori consultano.

      La seconda ha spostato la registrazione **prima** del `continue`, e ha
      fatto molto peggio: l'insieme cresce sempre, quindi `changed` diventa
      vero su **ogni atleta del club**. Il ciclo gira dentro una transazione, e
      una `athlete.update` per atleta significa che su un club di qualche
      centinaio di tesserati la revoca di una tessera — o l'uscita volontaria,
      che e self-service — puo andare in timeout e non riuscire. E ogni scheda
      accumulava l'indirizzo di ogni genitore mai uscito dal club, compresi i
      figli di altre famiglie, senza nessuna strada che li togliesse.

      La domanda giusta non e «ho cambiato qualcosa» ne «e un atleta del club»:
      e **questa persona compare su questa scheda**. Su un atleta che con lei
      non ha mai avuto niente a che fare non c'e niente da revocare.
    */
    const compareSuQuestaScheda =
      changed ||
      [...collectionKeys, ...legacyKeys].some((key) => {
        const valore = data[key];
        const righe = Array.isArray(valore)
          ? valore
          : isRecord(valore)
            ? [valore]
            : [];
        return righe.some((riga) => isLinkedToTarget(riga, userId, userEmail));
      });

    if (!compareSuQuestaScheda) continue;

    const identitaDaRegistrare = new Set<string>(
      (Array.isArray((data as any).revokedGuardianIdentities)
        ? ((data as any).revokedGuardianIdentities as unknown[])
        : []
      )
        .map((valore) => String(valore || "").trim().toLowerCase())
        .filter(Boolean),
    );

    const primaDellaRegistrazione = identitaDaRegistrare.size;
    for (const valore of [userId, userEmail]) {
      const pulito = String(valore || "").trim().toLowerCase();
      if (pulito) identitaDaRegistrare.add(pulito);
    }

    if (identitaDaRegistrare.size !== primaDellaRegistrazione) {
      (data as any).revokedGuardianIdentities = Array.from(
        identitaDaRegistrare,
      ) as string[];
      changed = true;
    }

    if (!changed) continue;


    await tx.athlete.update({ where: { id: athlete.id }, data: { data } });
    updated += 1;
  }

  return updated;
};

/**
 * Slega `athletes.user_id` per ogni atleta di `organizationId` collegato a
 * `userId`.
 *
 * Gia presente in `memberships/delete/route.ts` prima di questa correzione:
 * non e un quarto scrittore nuovo di `athletes.user_id`, e spostato qui per
 * non duplicarlo.
 */
export const unlinkDirectAthleteProfile = async (
  tx: any,
  organizationId: string,
  userId: string,
  accessRole: string,
) => {
  if (!ATHLETE_ROLES.has(normalizeToken(accessRole))) return 0;

  const result = await tx.athlete.updateMany({
    where: { organization_id: organizationId, user_id: userId },
    data: { user_id: null },
  });

  return result.count || 0;
};
