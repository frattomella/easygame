import { athleteWithinAccessScope } from "./access-scope-query";
import {
  findGuardianRow,
  revokeGuardianAccessInClub,
  revokeGuardianRow,
} from "./athlete-guardians";
import { normalizeGuardianRows } from "@/lib/athlete-guardians";
import { prisma } from "./prisma";
import { reportServerError } from "./observability";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import {
  isAthleteAccessRole,
  isManagementAccessRole,
  isParentAccessRole,
  isTrainerAccessRole,
} from "@/lib/access-roles";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { lockAthleteRow, syncClubAggregateField } from "./resources";
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
 * ---
 *
 * ## Cosa e sparito da qui (PP-02 / WP-C)
 *
 * Trecentocinquanta righe, e nessuna era una funzionalita.
 *
 * Un tutore viveva dentro `athletes.data.guardians[]`, un array **senza
 * chiave**, quindi «scollega quello li» voleva prima dire *quale*. La risposta
 * era una ricerca per identificativo che poteva nominarne due, un ripiego che
 * ricalcolava gli id sintetici al volo, una chiave storica per `parent1` e
 * `parent2`, e la ripulitura di tutte le righe **sorelle** della stessa
 * persona, perche l'indirizzo di famiglia e uno solo e la revoca doveva
 * seguire la persona e non la riga.
 *
 * Poi il blocco: la scheda si bloccava, il blob si rileggeva **dentro** il
 * blocco e la ripulitura si rifaceva su quello — perche il client
 * dell'anagrafica rimanda **sempre** l'array dei tutori, e bastavano due
 * persone in segreteria sulla stessa scheda perche la revoca sparisse per
 * intero. Misurato tre volte su tre: schermata con la conferma, riga di audit
 * scritta, registro vuoto, e la persona revocata che continuava a leggere
 * allergie, farmaci e i byte del certificato del minore.
 *
 * Infine il registro delle identita revocate, che era il **surrogato di una
 * chiave**: serviva perche il marchio sulla riga si aggirava aggiungendone una
 * sorella con lo stesso indirizzo.
 *
 * Adesso il tutore e una riga con una chiave, e questa funzione e una
 * `UPDATE`. Non c'e uno snapshot da rimandare, quindi non c'e una corsa da
 * perdere; non c'e un elenco da percorrere, quindi non c'e un blocco da
 * prendere; non c'e un id da indovinare, perche l'identificativo che la scheda
 * manda **e** quello della riga.
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

  const guardianId = testo(input.guardianId);
  if (!guardianId) {
    throw new Error("Genitore non trovato su questa scheda");
  }

  /*
    Si legge **prima** per due ragioni: sapere a chi si sta togliendo l'accesso,
    che e cio che finisce in audit, e distinguere «non esiste» da «esiste ed e
    gia scollegato». La revoca vera e una istruzione sola, subito sotto.
  */
  const riga = await findGuardianRow(prisma, atleta.id, guardianId);

  if (!riga) {
    throw new Error("Genitore non trovato su questa scheda");
  }

  const linkedUserId = riga.user_id;

  await revokeGuardianRow(prisma, {
    athleteId: atleta.id,
    guardianRowId: riga.id,
    organizationId: atleta.organization_id,
  });

  /*
    Il gettone vive anche come riga di `club_resource_items`, e quella riga la
    conosce il suo dominio: qui si segna revocata, e se non ci riesce
    l'operazione non fallisce — l'accesso e gia chiuso sulla riga del tutore,
    che e cio che decide.
  */
  const tokenRecordId = testo(
    (riga as any).access_token_record_id ||
      (atleta.data as any)?.parentAccessTokenRecordId,
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

/* ------------------------------------------------------------------- *
 *  Il vocabolario del ruolo e uno solo (AC-2 della RCA, KB 44)
 *
 *  Qui vivevano quattro `Set` di letterali — diciannove grafie in tutto —
 *  che dovevano restare d'accordo con `ROLE_ALIASES` di `access-roles.ts`,
 *  che di grafie ne conosce trentasei, piu le quattro forme di
 *  `custom:<base>:<nome>` che `assignClubRole` scrive **da se**.
 *
 *  Non restavano d'accordo, e nulla lo verificava: **diciannove** grafie
 *  (`tutor`, `giocatore`, `giocatrice`, `club_manager`, `administrator`,
 *  `amministratore`, `segreteria`, `secretary`, `membro`, `allenatrice`,
 *  piu le cinque forme di `owner`) e **tutti** gli slug personalizzati erano
 *  invisibili ai quattro sweep — ventitre valori su quaranta. La revoca
 *  riusciva, la tessera spariva, l'audit la registrava — e il profilo
 *  restava collegato a un'utenza senza tessera.
 *
 *  Il conteggio e misurato, non dedotto: la RCA ne dichiarava quattordici
 *  perche aveva confrontato i due elenchi a vista, e le cinque grafie di
 *  `owner` mancavano da entrambe le letture. Le conta
 *  `scripts/pp-02-totalita-ruoli.mjs` riportando la difesa vecchia.
 *
 *  Gli sweep non hanno piu un vocabolario proprio: chiedono ai predicati
 *  canonici, che passano tutti da `normalizeAccessRole` e risolvono percio
 *  sia gli alias sia il ruolo base di uno slug personalizzato. Un'unica
 *  fonte, e il test di totalita la enumera tutta.
 * ------------------------------------------------------------------- */

const getProfileRole = (record: any) => {
  const data = isRecord(record?.data) ? record.data : {};
  return normalizeToken(record?.role || data.role);
};

const shouldUnlinkProfileForRole = (
  record: any,
  accessRole: string,
  resourceType: "trainers" | "staff_members",
) => {
  const profileRole = getProfileRole(record);

  if (isTrainerAccessRole(accessRole)) {
    return resourceType === "trainers" || isTrainerAccessRole(profileRole);
  }

  if (isManagementAccessRole(accessRole)) {
    return resourceType === "staff_members" && !isTrainerAccessRole(profileRole);
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
  const trainerRole = isTrainerAccessRole(accessRole);
  if (!trainerRole && !isManagementAccessRole(accessRole)) {
    return 0;
  }

  let updated = 0;
  const resources = await tx.clubResourceItem.findMany({
    where: {
      organization_id: organizationId,
      resource_type: {
        in: trainerRole ? ["trainers", "staff_members"] : ["staff_members"],
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
  const trainerRole = isTrainerAccessRole(accessRole);
  if (!trainerRole && !isManagementAccessRole(accessRole)) {
    return 0;
  }

  const club = await tx.club.findUnique({
    where: { id: organizationId },
    select: { trainers: true, staff_members: true },
  });
  if (!club) return 0;

  const trainers = trainerRole
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

/**
 * **La revoca di una tessera, in una istruzione** (PP-02 / WP-C).
 *
 * ---
 *
 * ## Cosa c'era qui, e perche non poteva funzionare
 *
 * Duecentosettanta righe che percorrevano **ogni tesserato del club**: per
 * ognuno un blocco di riga, una rilettura del blob, una ripulitura in memoria
 * di quattro collezioni piu la coppia storica, la registrazione dell'identita
 * nel registro delle revoche, e una `update`.
 *
 * Da quella forma discendevano due difetti che **non si potevano chiudere
 * insieme**, ed e questo che rende il reperto `R-2` diverso da un difetto
 * ordinario:
 *
 * - scegliere le schede **fuori** dal blocco lascia sfuggire quella che
 *   acquista il tutore mentre la revoca gira. Misurato dalle due porte vere in
 *   parallelo: su un club da 60 atleti la revoca dura ~840 ms, e a **sette
 *   sfasamenti su sette** la scheda scritta nel frattempo sfuggiva — la
 *   finestra non e stretta, e **tutta la durata della scansione**, e cresce
 *   con i tesserati;
 * - bloccarle **tutte** con un `FOR UPDATE` sul club chiude quella finestra e
 *   va in abbraccio mortale con il passaggio di stagione, che prende le stesse
 *   righe in un ordine scorrelato (gli id sono UUID). Cinque giri su cinque,
 *   dal log di PostgreSQL: «Revoca dell'accesso non riuscita», tessera ancora
 *   li, il genitore ancora dentro, e **niente in audit**.
 *
 * Piu un tetto: oltre ~1.100 schede toccate la transazione scadeva.
 *
 * ## Perche adesso il problema non si pone
 *
 * Non e stata scelta la meno dannosa delle due: e sparita la scansione.
 *
 * Un tutore e una riga di `athlete_guardians` con un indice su
 * `(organization_id, user_id)`. «Togli l'accesso a questa persona in questo
 * club» e percio una `UPDATE` con un `WHERE`, e da li:
 *
 * - **non c'e una finestra**, perche non c'e un intervallo fra lo scegliere e
 *   l'agire: e la stessa istruzione a fare tutte e due le cose;
 * - **non c'e un ordine di acquisizione** da incrociare con il rollover,
 *   perche non si prendono blocchi su un elenco;
 * - **non c'e un tetto**, perche il costo non cresce con i tesserati del club
 *   ma con le righe che riguardano davvero quella persona — i suoi figli.
 *
 * `PP02-D34` e `PP02-D33` si chiudono tutti e due, e non perche sia stata
 * messa una serratura piu grossa: perche la domanda a cui rispondevano non si
 * pone piu.
 *
 * ## Il perimetro resta quello di ADR-0110
 *
 * Questa funzione **non tocca `organization_users`**: scollegare un profilo non
 * e revocare una tessera. Toglie l'accesso del tutore alle schede su cui
 * compare, e nient'altro.
 */
export const unlinkParentGuardians = async (
  tx: any,
  organizationId: string,
  userId: string,
  userEmail: string | null,
  accessRole: string,
) => {
  if (!isParentAccessRole(accessRole)) return 0;

  return revokeGuardianAccessInClub(tx, {
    organizationId,
    userId,
    email: userEmail,
  });
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
  if (!isAthleteAccessRole(accessRole)) return 0;

  const schede = await tx.athlete.findMany({
    where: { organization_id: organizationId, user_id: userId },
    select: { id: true },
  });

  const result = await tx.athlete.updateMany({
    where: { organization_id: organizationId, user_id: userId },
    data: { user_id: null },
  });

  /*
    **Un invito ancora vivo e una strada di ritorno, e va chiusa con la porta.**

    Le due porte che revocano l'accesso di un atleta facevano due cose diverse:
    quella della scheda (`revokeAthleteAccess`) marca «revocato» l'invito
    ancora in piedi, questa no. E `acceptAthleteAccountInvite` guarda soltanto
    stato, scadenza e `athletes.user_id` — che questa funzione ha appena
    azzerato.

    Misurato in sequenza, senza nessuna concorrenza: revoca dalla Gestione
    accessi, schermata «revocato», riga di audit — e il ragazzo apre l'email che
    aveva gia ricevuto, `user_id` torna al suo posto e nasce una tessera nuova.
    Da li `/api/v1/athlete-accounts/me`, che per progetto non chiede ne ruolo ne
    tessera, riapre l'area atleta completa.

    Due porte per lo stesso fatto devono lasciare lo stesso stato, o quella piu
    debole diventa la strada che si prende.
  */
  for (const scheda of schede) {
    const vivo = await tx.athleteAccountInvite.findFirst({
      where: {
        organization_id: organizationId,
        athlete_id: scheda.id,
        status: "sent",
      },
      orderBy: { sent_at: "desc" },
    });

    if (vivo) {
      await tx.athleteAccountInvite.update({
        where: { id: vivo.id },
        data: { status: "revoked", revoked_at: new Date() },
      });
    }
  }

  return result.count || 0;
};
