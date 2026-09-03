import { prisma } from "./prisma";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import {
  assertActiveClub,
  type ActiveClubScope,
} from "@/lib/auth/active-club-boundary";
import {
  canManageClubConfiguration,
  getAccessRoleLabel,
  isCustomRoleValue,
  normalizeAccessRole,
  parseCustomRoleValue,
} from "@/lib/access-roles";
import { getPermissionLabel } from "@/lib/permissions/catalog";
import {
  OWNER_ONLY_ACTIONS,
  assertMayGrantRole,
  assertOwnerOnlyAction,
  isDirectionPermission,
  isOwnerActor,
  roleDenied,
  validateCustomRoleDraft,
  type CustomRoleDraft,
} from "@/lib/roles/custom-role";
import {
  accessScopeContains,
  normalizeAccessScopes,
  type AccessScopeEntry,
} from "@/lib/roles/access-scope";
import { normalizeClubSites } from "@/lib/club-sites";
import {
  unlinkClubJsonProfiles,
  unlinkProfileResources,
  unlinkParentGuardians,
  unlinkDirectAthleteProfile,
} from "./profile-account-links";

/**
 * **I ruoli personalizzati di club, dalla parte che scrive** (Wave 6, lane 6G).
 *
 * Proprietario del ciclo di vita di `club_roles`, `club_role_permissions`,
 * `club_access_scopes` e — per la sola assegnazione di un ruolo personalizzato
 * — di `organization_users`. Il dominio **puro** (cosa un ruolo puo contenere,
 * chi lo puo concedere) sta in `src/lib/roles/`: qui c'e l'archivio, l'audit e
 * il confine.
 *
 * ---
 *
 * ## Perche l'assegnazione passa da qui e non dalla porta generica
 *
 * Una tessera con un ruolo personalizzato ha **due colonne** — `role` con lo
 * slug e `custom_role_id` con il riferimento — e devono essere scritte
 * insieme. Una riga con lo slug e senza il riferimento e la scalata piu
 * economica che questo meccanismo permetterebbe: chi la legge vedrebbe il ruolo
 * **base** senza nessun restringimento. `assertConcessioneDiAccessoLecita` in
 * `resources.ts` chiude quindi la porta generica a qualunque ruolo
 * personalizzato, e questo modulo e l'unica strada.
 *
 * ## Ogni atto lascia una riga
 *
 * Creare, modificare, cancellare un ruolo; assegnarlo, revocarlo, cambiarne il
 * perimetro. E i dinieghi passano da `recordPermissionDenied`, che e la stessa
 * strada dei quattordici dinieghi muti chiusi in Wave 5.
 */

export type ClubRolesScope = ActiveClubScope & {
  userId: string;
  activeRole: string | null;
  actorEmail?: string | null;
  /**
   * Il perimetro di chi amministra, che fa parte del **soffitto** di cio che
   * puo concedere: vedi `accessScopeContains`.
   */
  accessScopes?: readonly AccessScopeEntry[] | null;
};

export type ClubRoleView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  base_role: string;
  base_role_label: string;
  is_active: boolean;
  permissions: string[];
  permission_labels: { key: string; label: string }[];
  contains_direction_keys: boolean;
  assigned_count: number;
  created_at: string;
};

export type ClubAccessAssignmentView = {
  membership_id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  role_label: string;
  is_primary: boolean;
  is_owner: boolean;
  custom_role_id: string | null;
  custom_role_name: string | null;
  permissions: string[];
  scopes: AccessScopeEntry[];
  granted_at: string;
};

const testo = (value: unknown) => String(value ?? "").trim();

/**
 * La lettura e la scrittura della configurazione degli accessi hanno lo stesso
 * perimetro della pagina che le ospita: proprietario e gestore, e **soltanto
 * nella loro forma canonica**.
 *
 * Un ruolo personalizzato normalizza sulla propria base. Uno costruito su
 * `club_manager` — anche con **zero chiavi**, cioe il piu ristretto che si
 * possa creare — arrivava qui, `canManageClubConfiguration` vedeva
 * `club_manager`, e quel ruolo poteva riscrivere i ruoli del club: darsi le
 * chiavi che gli erano state negate, o assegnarsele con un secondo ruolo. Il
 * modello e soffitto ∧ concessione, e questa era la porta che rialzava il
 * soffitto dal di dentro.
 *
 * Non c'e una chiave di catalogo con cui concederlo, ed e voluto: delegare la
 * facolta di ridefinire le deleghe e un atto del proprietario.
 *
 * Il diniego lascia una riga, perche «chi ha provato a guardare chi puo fare
 * cosa» e un evento di sicurezza e non un errore di navigazione.
 */
const assertPuoAmministrareAccessi = async (
  scope: ClubRolesScope,
  atto: string,
) => {
  if (
    !isCustomRoleValue(scope.activeRole) &&
    canManageClubConfiguration(scope.activeRole)
  ) {
    return;
  }

  await recordPermissionDenied({
    scope: {
      userId: scope.userId,
      activeRole: scope.activeRole,
      activeOrganizationId: scope.activeOrganizationId,
    },
    permission: "club_roles.manage",
    resource: "club_roles",
    metadata: { action: atto },
  });

  throw roleDenied(`il ruolo attivo non puo ${atto}`);
};

/**
 * Il perimetro che si concede dev'essere dentro il proprio.
 *
 * Vedi `accessScopeContains`. Qui si aggiunge la riga di audit, perche un
 * tentativo di uscire dal recinto e un evento di sicurezza.
 */
const assertPerimetroConcedibile = async (
  scope: ClubRolesScope,
  richiesti: readonly AccessScopeEntry[],
  atto: string,
) => {
  if (accessScopeContains(scope.accessScopes, richiesti)) return;

  await recordPermissionDenied({
    scope: {
      userId: scope.userId,
      activeRole: scope.activeRole,
      activeOrganizationId: scope.activeOrganizationId,
    },
    permission: "club_roles.scope",
    resource: "club_access_scopes",
    metadata: {
      action: atto,
      mio: normalizeAccessScopes(scope.accessScopes),
      richiesto: normalizeAccessScopes(richiesti),
    },
  });

  throw roleDenied(
    "non si concede un perimetro piu ampio del proprio: chi e ristretto a una sede o a una categoria puo delegare solo dentro di essa",
  );
};

const tracciaDiniegoProprietario = async (
  scope: ClubRolesScope,
  atto: string,
  resourceId?: string | null,
) => {
  await recordPermissionDenied({
    scope: {
      userId: scope.userId,
      activeRole: scope.activeRole,
      activeOrganizationId: scope.activeOrganizationId,
    },
    permission: "club_roles.owner_only",
    resource: "club_roles",
    resourceId: resourceId || null,
    metadata: { action: atto },
  });
};

const audit = (
  scope: ClubRolesScope,
  action: string,
  resourceId: string | null,
  metadata: Record<string, unknown>,
) =>
  recordAuditEvent({
    action,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail || null,
    actorRole: scope.activeRole,
    organizationId: scope.activeOrganizationId,
    resource: "club_roles",
    resourceId,
    metadata,
  });

const clubAttivo = (scope: ClubRolesScope) => {
  const club = testo(scope.activeOrganizationId);
  if (!club) {
    throw roleDenied("nessun club attivo selezionato");
  }
  return club;
};

/* ===================================================================== */
/*  Lettura                                                              */
/* ===================================================================== */

const caricaRuoli = async (organizationId: string) => {
  const ruoli = await prisma.clubRole.findMany({
    where: { organization_id: organizationId },
    orderBy: [{ created_at: "asc" }],
  });

  if (!ruoli.length) return [] as ClubRoleView[];

  const ids = ruoli.map((ruolo) => ruolo.id);
  const [chiavi, tessere] = await Promise.all([
    prisma.clubRolePermission.findMany({ where: { role_id: { in: ids } } }),
    prisma.organizationUser.findMany({
      where: { organization_id: organizationId, custom_role_id: { in: ids } },
      select: { custom_role_id: true },
    }),
  ]);

  const perRuolo = new Map<string, string[]>();
  for (const riga of chiavi) {
    const elenco = perRuolo.get(riga.role_id) || [];
    elenco.push(riga.permission_key);
    perRuolo.set(riga.role_id, elenco);
  }

  const conteggi = new Map<string, number>();
  for (const tessera of tessere) {
    const id = testo(tessera.custom_role_id);
    if (!id) continue;
    conteggi.set(id, (conteggi.get(id) || 0) + 1);
  }

  return ruoli.map((ruolo) => {
    const permissions = (perRuolo.get(ruolo.id) || []).slice().sort();
    return {
      id: ruolo.id,
      slug: ruolo.slug,
      name: ruolo.name,
      description: ruolo.description || null,
      base_role: ruolo.base_role,
      base_role_label: getAccessRoleLabel(ruolo.base_role),
      is_active: Boolean(ruolo.is_active),
      permissions,
      permission_labels: permissions.map((key) => ({
        key,
        label: getPermissionLabel(key),
      })),
      contains_direction_keys: permissions.some(isDirectionPermission),
      assigned_count: conteggi.get(ruolo.id) || 0,
      created_at:
        ruolo.created_at instanceof Date
          ? ruolo.created_at.toISOString()
          : String(ruolo.created_at),
    } satisfies ClubRoleView;
  });
};

export const listClubRoles = async (scope: ClubRolesScope) => {
  const club = clubAttivo(scope);
  await assertPuoAmministrareAccessi(scope, "vedere i ruoli del club");
  return caricaRuoli(club);
};

/**
 * Le persone con un accesso al club, con il loro ruolo e il loro perimetro.
 *
 * E la sostituzione della tabella finta della vecchia schermata: tre nomi
 * inventati con indirizzi `@example.com`, che nessuna riga di archivio aveva
 * mai visto.
 */
export type ScopeOption = { id: string; label: string };

export const listClubAccessAssignments = async (
  scope: ClubRolesScope,
): Promise<{
  assignments: ClubAccessAssignmentView[];
  roles: ClubRoleView[];
  creator_user_id: string | null;
  scope_options: { site: ScopeOption[]; category: ScopeOption[] };
}> => {
  const club = clubAttivo(scope);
  await assertPuoAmministrareAccessi(scope, "vedere chi ha accesso al club");

  const [tessere, ruoli, societa] = await Promise.all([
    prisma.organizationUser.findMany({
      where: { organization_id: club },
      orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
    }),
    caricaRuoli(club),
    prisma.club.findUnique({
      where: { id: club },
      select: { creator_id: true, club_sites: true, categories: true },
    }),
  ]);

  const ruoloPerId = new Map(ruoli.map((ruolo) => [ruolo.id, ruolo]));

  const utenti = tessere.length
    ? await prisma.user.findMany({
        where: { id: { in: tessere.map((tessera) => tessera.user_id) } },
        select: { id: true, email: true, first_name: true, last_name: true },
      })
    : [];
  const utentePerId = new Map(utenti.map((utente) => [utente.id, utente]));

  const perimetri = tessere.length
    ? await prisma.clubAccessScope.findMany({
        where: {
          organization_user_id: { in: tessere.map((tessera) => tessera.id) },
        },
      })
    : [];
  const perimetroPerTessera = new Map<string, AccessScopeEntry[]>();
  for (const riga of perimetri) {
    const elenco = perimetroPerTessera.get(riga.organization_user_id) || [];
    elenco.push({ kind: riga.scope_kind as never, value: riga.scope_value });
    perimetroPerTessera.set(riga.organization_user_id, elenco);
  }

  const assignments = tessere.map((tessera) => {
    const utente = utentePerId.get(tessera.user_id);
    const personalizzato = tessera.custom_role_id
      ? ruoloPerId.get(tessera.custom_role_id) || null
      : null;

    return {
      membership_id: tessera.id,
      user_id: tessera.user_id,
      email: utente?.email || "",
      name:
        [utente?.first_name, utente?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        utente?.email ||
        "",
      role: tessera.role,
      role_label: personalizzato?.name || getAccessRoleLabel(tessera.role),
      is_primary: Boolean(tessera.is_primary),
      is_owner: normalizeAccessRole(tessera.role) === "owner",
      custom_role_id: tessera.custom_role_id || null,
      custom_role_name: personalizzato?.name || null,
      permissions: personalizzato?.permissions || [],
      scopes: normalizeAccessScopes(perimetroPerTessera.get(tessera.id)),
      granted_at:
        tessera.created_at instanceof Date
          ? tessera.created_at.toISOString()
          : String(tessera.created_at),
    } satisfies ClubAccessAssignmentView;
  });

  /*
    Le voci con cui si compone un perimetro. Vengono da qui e non da una
    seconda chiamata del browser alla risorsa `clubs`, che e riservata: la
    schermata deve poter disegnare l'elenco delle sedi senza che chi la usa
    debba poter leggere l'anagrafica societaria per intero.
  */
  const sedi = normalizeClubSites(societa?.club_sites).map((sede) => ({
    id: sede.id,
    label: [sede.name, sede.city].filter(Boolean).join(" · "),
  }));
  const categorie = (Array.isArray(societa?.categories) ? societa.categories : [])
    .map((voce: unknown) => {
      const riga = (voce || {}) as Record<string, unknown>;
      const id = testo(riga.id);
      const label = testo(riga.name) || id;
      return id ? { id, label } : null;
    })
    .filter((voce): voce is ScopeOption => Boolean(voce));

  return {
    assignments,
    roles: ruoli,
    creator_user_id: societa?.creator_id || null,
    scope_options: { site: sedi, category: categorie },
  };
};

/* ===================================================================== */
/*  Il ciclo di vita di un ruolo: soltanto il proprietario (§10.4)        */
/* ===================================================================== */

export const createClubRole = async (
  scope: ClubRolesScope,
  draft: CustomRoleDraft,
): Promise<ClubRoleView> => {
  const club = clubAttivo(scope);
  await assertPuoAmministrareAccessi(scope, "creare un ruolo");

  try {
    assertOwnerOnlyAction(scope.activeRole, OWNER_ONLY_ACTIONS.clubRoleCreate);
  } catch (errore) {
    await tracciaDiniegoProprietario(scope, OWNER_ONLY_ACTIONS.clubRoleCreate);
    throw errore;
  }

  const valido = validateCustomRoleDraft(draft);

  const gia = await prisma.clubRole.findFirst({
    where: { organization_id: club, slug: valido.slug },
    select: { id: true },
  });
  if (gia) {
    throw new Error(`Esiste gia un ruolo «${valido.name}» in questo club`);
  }

  const ruolo = await prisma.clubRole.create({
    data: {
      organization_id: club,
      slug: valido.slug,
      name: valido.name,
      description: valido.description,
      base_role: valido.baseRole,
      /*
        Esplicito e non lasciato al default della colonna: un ruolo nasce
        attivo, e chi legge questa riga deve poterlo sapere senza andare a
        cercare lo schema.
      */
      is_active: true,
      created_by: scope.userId,
    },
  });

  await prisma.clubRolePermission.createMany({
    data: valido.permissions.map((permission_key) => ({
      role_id: ruolo.id,
      permission_key,
    })),
  });

  await audit(scope, AUDIT_ACTIONS.clubRoleCreated, ruolo.id, {
    slug: valido.slug,
    base_role: valido.baseRole,
    permissions_added: valido.permissions,
    count: valido.permissions.length,
  });

  const [creato] = (await caricaRuoli(club)).filter(
    (riga) => riga.id === ruolo.id,
  );
  return creato;
};

export type ClubRolePatch = {
  name?: string;
  description?: string | null;
  permissions?: readonly string[];
  isActive?: boolean;
};

/**
 * Modifica nome, descrizione, chiavi e stato di un ruolo.
 *
 * **Il ruolo base non si tocca**, e lo slug nemmeno: sono la stessa cosa
 * (§9.1). Cambiare la base sposterebbe il tetto sotto i piedi delle
 * assegnazioni in essere — la stessa persona si troverebbe con permessi diversi
 * senza che nessuno abbia toccato la sua tessera — e cambiare lo slug
 * lascerebbe in `organization_users.role` un valore che non nomina piu niente.
 * Si crea un ruolo nuovo.
 */
export const updateClubRole = async (
  scope: ClubRolesScope,
  roleId: string,
  patch: ClubRolePatch,
): Promise<ClubRoleView> => {
  const club = clubAttivo(scope);
  await assertPuoAmministrareAccessi(scope, "modificare un ruolo");

  try {
    assertOwnerOnlyAction(scope.activeRole, OWNER_ONLY_ACTIONS.clubRoleUpdate);
  } catch (errore) {
    await tracciaDiniegoProprietario(
      scope,
      OWNER_ONLY_ACTIONS.clubRoleUpdate,
      roleId,
    );
    throw errore;
  }

  const ruolo = await prisma.clubRole.findUnique({ where: { id: roleId } });
  if (!ruolo) throw new Error("Ruolo non trovato");
  assertActiveClub(scope, ruolo.organization_id, "il ruolo");

  const chiaviAttuali = (
    await prisma.clubRolePermission.findMany({ where: { role_id: ruolo.id } })
  )
    .map((riga) => riga.permission_key)
    .sort();

  const valido = validateCustomRoleDraft({
    name: patch.name ?? ruolo.name,
    description:
      patch.description === undefined ? ruolo.description : patch.description,
    baseRole: ruolo.base_role,
    permissions: patch.permissions ?? chiaviAttuali,
  });

  /*
    Il nome puo cambiare, lo slug no: se il nuovo nome producesse uno slug
    diverso si accetta il nome e si tiene lo slug. E l'unico modo di dare al
    club la liberta di rinominare senza spezzare le tessere gia scritte.
  */
  const aggiunte = valido.permissions.filter(
    (chiave) => !chiaviAttuali.includes(chiave),
  );
  const tolte = chiaviAttuali.filter(
    (chiave) => !valido.permissions.includes(chiave),
  );

  await prisma.clubRole.update({
    where: { id: ruolo.id },
    data: {
      name: valido.name,
      description: valido.description,
      is_active: patch.isActive === undefined ? ruolo.is_active : Boolean(patch.isActive),
    },
  });

  if (tolte.length) {
    await prisma.clubRolePermission.deleteMany({
      where: { role_id: ruolo.id, permission_key: { in: tolte } },
    });
  }
  if (aggiunte.length) {
    await prisma.clubRolePermission.createMany({
      data: aggiunte.map((permission_key) => ({
        role_id: ruolo.id,
        permission_key,
      })),
    });
  }

  await audit(scope, AUDIT_ACTIONS.clubRoleUpdated, ruolo.id, {
    slug: ruolo.slug,
    base_role: ruolo.base_role,
    permissions_added: aggiunte,
    permissions_removed: tolte,
    status: (patch.isActive === undefined ? ruolo.is_active : patch.isActive)
      ? "active"
      : "disabled",
  });

  const [aggiornato] = (await caricaRuoli(club)).filter(
    (riga) => riga.id === ruolo.id,
  );
  return aggiornato;
};

/**
 * Cancella un ruolo che **nessuno porta**.
 *
 * La chiave esterna e `RESTRICT` e non `CASCADE`, e questa guardia le fa da
 * gemella parlante: cancellare un ruolo assegnato avrebbe tolto dal club, in
 * silenzio, tutte le persone che lo portavano.
 */
export const deleteClubRole = async (scope: ClubRolesScope, roleId: string) => {
  clubAttivo(scope);
  await assertPuoAmministrareAccessi(scope, "cancellare un ruolo");

  try {
    assertOwnerOnlyAction(scope.activeRole, OWNER_ONLY_ACTIONS.clubRoleDelete);
  } catch (errore) {
    await tracciaDiniegoProprietario(
      scope,
      OWNER_ONLY_ACTIONS.clubRoleDelete,
      roleId,
    );
    throw errore;
  }

  const ruolo = await prisma.clubRole.findUnique({ where: { id: roleId } });
  if (!ruolo) throw new Error("Ruolo non trovato");
  assertActiveClub(scope, ruolo.organization_id, "il ruolo");

  const assegnate = await prisma.organizationUser.count({
    where: { organization_id: ruolo.organization_id, custom_role_id: ruolo.id },
  });
  if (assegnate > 0) {
    throw new Error(
      `Il ruolo «${ruolo.name}» e assegnato a ${assegnate} persone: revocalo prima di cancellarlo`,
    );
  }

  await prisma.clubRole.delete({ where: { id: ruolo.id } });

  await audit(scope, AUDIT_ACTIONS.clubRoleDeleted, ruolo.id, {
    slug: ruolo.slug,
    base_role: ruolo.base_role,
  });

  return { id: ruolo.id, deleted: true };
};

/* ===================================================================== */
/*  Assegnazione e revoca                                                */
/* ===================================================================== */

export type AssignRoleInput = {
  /** L'utenza da tesserare. Deve esistere: qui non si creano account. */
  userId: string;
  /** Un canonico (`staff`) oppure lo slug di un ruolo di club. */
  role: string;
  scopes?: readonly { kind?: string | null; value?: string | null }[];
  isPrimary?: boolean;
};

/**
 * **Una tessera non si firma da soli**, e non si concede piu di quello che si ha.
 *
 * Le quattro condizioni del tetto stanno in `assertMayGrantRole`; qui restano
 * le due che hanno bisogno dell'archivio: il ruolo personalizzato dev'essere
 * **di questo club** e attivo, e l'utenza dev'essere una che esiste.
 */
export const assignClubRole = async (
  scope: ClubRolesScope,
  input: AssignRoleInput,
) => {
  const club = clubAttivo(scope);
  await assertPuoAmministrareAccessi(scope, "assegnare un ruolo");

  const bersaglio = testo(input.userId);
  if (!bersaglio) throw new Error("Manca l'utenza a cui assegnare il ruolo");

  if (bersaglio === testo(scope.userId)) {
    await recordPermissionDenied({
      scope: {
        userId: scope.userId,
        activeRole: scope.activeRole,
        activeOrganizationId: scope.activeOrganizationId,
      },
      permission: "club_roles.assign",
      resource: "organization_users",
      metadata: { reason: "self_assignment", role: testo(input.role) },
    });
    throw roleDenied("un accesso non si concede a se stessi");
  }

  const ruoloRichiesto = testo(input.role);
  const personalizzato = parseCustomRoleValue(ruoloRichiesto);

  let ruoloDiClub: { id: string; slug: string; name: string } | null = null;
  let chiavi: string[] = [];

  if (personalizzato) {
    const riga = await prisma.clubRole.findFirst({
      where: { organization_id: club, slug: personalizzato.slug },
    });
    if (!riga || !riga.is_active) {
      throw roleDenied(
        "il ruolo indicato non esiste in questo club, o non e attivo",
      );
    }
    chiavi = (
      await prisma.clubRolePermission.findMany({ where: { role_id: riga.id } })
    )
      .map((permesso) => permesso.permission_key)
      .sort();
    ruoloDiClub = { id: riga.id, slug: riga.slug, name: riga.name };
  }

  try {
    assertMayGrantRole(scope.activeRole, {
      role: ruoloRichiesto,
      permissions: chiavi,
    });
  } catch (errore) {
    await recordPermissionDenied({
      scope: {
        userId: scope.userId,
        activeRole: scope.activeRole,
        activeOrganizationId: scope.activeOrganizationId,
      },
      permission: "club_roles.assign",
      resource: "organization_users",
      metadata: {
        role: ruoloRichiesto,
        target_user_id: bersaglio,
        reason: String((errore as Error)?.message || ""),
      },
    });
    throw errore;
  }

  const utente = await prisma.user.findUnique({
    where: { id: bersaglio },
    select: { id: true },
  });
  if (!utente) throw new Error("Utenza non trovata");

  const valoreRuolo = ruoloDiClub
    ? ruoloDiClub.slug
    : normalizeAccessRole(ruoloRichiesto);
  const perimetri = normalizeAccessScopes(input.scopes);
  if ((input.scopes?.length || 0) !== perimetri.length) {
    throw new Error(
      "Un perimetro deve indicare «site» o «category» e un valore: la richiesta ne porta uno incompleto",
    );
  }
  await assertPerimetroConcedibile(scope, perimetri, "assegnare un ruolo");

  /*
    **Il fondatore non si restringe.** La sua proprieta non nasce da una
    tessera ma da `clubs.creator_id`, e `resolveOrganizationScopeForUser` gliela
    riconosce comunque: dargli un ruolo personalizzato produrrebbe una schermata
    che dice «Segreteria» e un sistema che continua a rispondergli «owner». Una
    restrizione che non restringe e peggio di nessuna restrizione.
  */
  const societa = await prisma.club.findUnique({
    where: { id: club },
    select: { creator_id: true },
  });
  if (societa?.creator_id && testo(societa.creator_id) === bersaglio) {
    throw roleDenied(
      "il fondatore del club resta proprietario: il suo accesso non si restringe da qui",
    );
  }

  /*
    **Un ruolo alla volta, per persona e per club.**

    La tabella ne ammette piu d'uno — `@@unique(organization_id, user_id, role)`
    — e l'header `x-active-access-role` ne sceglie uno. Ma una schermata che
    dicesse «questa persona e Segreteria» mentre in archivio e **anche**
    Collaboratore mentirebbe due volte: sul fatto, e sull'effetto, perche il
    ruolo piu largo resterebbe selezionabile e la restrizione non restringerebbe
    niente. Assegnare sostituisce, e ogni tessera tolta lascia la sua riga.
  */
  const altre = await prisma.organizationUser.findMany({
    where: {
      organization_id: club,
      user_id: bersaglio,
      NOT: { role: valoreRuolo },
    },
  });
  if (
    altre.some((tessera) => normalizeAccessRole(tessera.role) === "owner") &&
    !isOwnerActor(scope.activeRole)
  ) {
    await tracciaDiniegoProprietario(scope, OWNER_ONLY_ACTIONS.grantOwner);
    throw roleDenied(
      `soltanto il proprietario del club puo ${OWNER_ONLY_ACTIONS.grantOwner}`,
    );
  }

  const esistente = await prisma.organizationUser.findFirst({
    where: { organization_id: club, user_id: bersaglio, role: valoreRuolo },
  });

  const tessera = esistente
    ? await prisma.organizationUser.update({
        where: { id: esistente.id },
        data: {
          custom_role_id: ruoloDiClub?.id || null,
          is_primary: Boolean(input.isPrimary ?? esistente.is_primary),
        },
      })
    : await prisma.organizationUser.create({
        data: {
          organization_id: club,
          user_id: bersaglio,
          role: valoreRuolo,
          custom_role_id: ruoloDiClub?.id || null,
          is_primary: Boolean(input.isPrimary),
        },
      });

  await prisma.clubAccessScope.deleteMany({
    where: { organization_user_id: tessera.id },
  });
  if (perimetri.length) {
    await prisma.clubAccessScope.createMany({
      data: perimetri.map((perimetro) => ({
        organization_user_id: tessera.id,
        scope_kind: perimetro.kind,
        scope_value: perimetro.value,
      })),
    });
  }

  for (const vecchia of altre) {
    await prisma.clubAccessScope.deleteMany({
      where: { organization_user_id: vecchia.id },
    });
    await prisma.organizationUser.delete({ where: { id: vecchia.id } });
    await audit(scope, AUDIT_ACTIONS.clubRoleRevoked, vecchia.id, {
      role: vecchia.role,
      target_user_id: bersaglio,
      reason: "replaced_by_new_role",
    });
  }

  await audit(scope, AUDIT_ACTIONS.clubRoleAssigned, tessera.id, {
    role: valoreRuolo,
    base_role: personalizzato?.baseRole || valoreRuolo,
    target_user_id: bersaglio,
    permissions_added: chiavi,
    previous_role: altre.map((vecchia) => vecchia.role).join(", ") || null,
    scopes: perimetri.map((perimetro) => `${perimetro.kind}:${perimetro.value}`),
  });

  return { membership_id: tessera.id, role: valoreRuolo };
};

/**
 * Cambia il perimetro di un'assegnazione esistente.
 *
 * Si scrive per **sostituzione**: l'elenco che arriva e il perimetro, e un
 * elenco vuoto significa «tutto il club». La forma incrementale — aggiungi
 * questa sede, togli quella — avrebbe due chiamate per una decisione sola, e la
 * seconda che fallisce lascerebbe un perimetro che nessuno ha scelto.
 */
export const updateAssignmentScopes = async (
  scope: ClubRolesScope,
  membershipId: string,
  scopes: readonly { kind?: string | null; value?: string | null }[],
) => {
  clubAttivo(scope);
  await assertPuoAmministrareAccessi(scope, "cambiare il perimetro di un accesso");

  const tessera = await prisma.organizationUser.findUnique({
    where: { id: testo(membershipId) },
  });
  if (!tessera) throw new Error("Accesso non trovato");
  assertActiveClub(scope, tessera.organization_id, "l'accesso");

  /*
    **Il proprio perimetro non si tocca da qui, ed e la terza volta che questa
    riga serve.**

    `assignClubRole` e `revokeClubAccess` hanno entrambe il divieto «su se
    stessi»; questa non l'aveva. E il proprio `membership_id` sta nella
    risposta di `GET /api/v1/club-roles/assignments`, che la stessa persona
    puo leggere.

    La convenzione dichiarata e che **zero righe di perimetro valgono tutto il
    club**: un ruolo perimetrato su una sede chiamava questa rotta sulla propria
    tessera con `{"scopes": []}` e alla richiesta successiva vedeva l'intero
    club. Il perimetro che il club aveva concesso se lo toglieva chi lo portava.
  */
  if (testo(tessera.user_id) === testo(scope.userId)) {
    throw roleDenied("il proprio perimetro non si cambia da questa schermata");
  }

  const perimetri = normalizeAccessScopes(scopes);
  if ((scopes?.length || 0) !== perimetri.length) {
    throw new Error(
      "Un perimetro deve indicare «site» o «category» e un valore: la richiesta ne porta uno incompleto",
    );
  }

  await assertPerimetroConcedibile(
    scope,
    perimetri,
    "cambiare il perimetro di un accesso",
  );

  await prisma.clubAccessScope.deleteMany({
    where: { organization_user_id: tessera.id },
  });
  if (perimetri.length) {
    await prisma.clubAccessScope.createMany({
      data: perimetri.map((perimetro) => ({
        organization_user_id: tessera.id,
        scope_kind: perimetro.kind,
        scope_value: perimetro.value,
      })),
    });
  }

  await audit(scope, AUDIT_ACTIONS.clubRoleScopeChanged, tessera.id, {
    role: tessera.role,
    target_user_id: tessera.user_id,
    scopes: perimetri.map((perimetro) => `${perimetro.kind}:${perimetro.value}`),
    count: perimetri.length,
  });

  return { membership_id: tessera.id, scopes: perimetri };
};

/**
 * Revoca un accesso.
 *
 * Tre dinieghi, e ognuno ha il suo motivo:
 *
 *   * **su se stessi** — chi si toglie da solo l'ultima tessera si chiude fuori
 *     dal proprio club, e lo farebbe da una schermata che non ha modo di
 *     rimetterlo dentro. Per andarsene c'e `/api/v1/auth/memberships/delete`;
 *   * **su un `owner`** — e uno degli atti riservati (§10.4);
 *   * **sul fondatore** — la sua proprieta non nasce da questa riga ma da
 *     `clubs.creator_id`, e toglierla darebbe l'impressione di aver fatto
 *     qualcosa che non e stato fatto.
 *
 * **Ripulisce anche i riferimenti che questa tessera lasciava dietro**
 * (correzione Fortitudo Scauri). Prima cancellava solo la tessera:
 * `clubs.trainers[].linkedUserId`, `athletes.data.guardians[].linkedUserId` e
 * `athletes.user_id` restavano collegati a un'utenza che nel club non aveva
 * piu accesso — la stessa scheda allenatore mostrava «Account collegato» a
 * un `organization_users` gia vuoto. Lo sweep e lo stesso che
 * `/api/v1/auth/memberships/delete` gia usa quando e la persona a
 * lasciare da sola il club: qui si applica anche quando e il proprietario a
 * cacciarla.
 */
export const revokeClubAccess = async (
  scope: ClubRolesScope,
  membershipId: string,
) => {
  const club = clubAttivo(scope);
  await assertPuoAmministrareAccessi(scope, "revocare un accesso");

  const tessera = await prisma.organizationUser.findUnique({
    where: { id: testo(membershipId) },
  });
  if (!tessera) throw new Error("Accesso non trovato");
  assertActiveClub(scope, tessera.organization_id, "l'accesso");

  if (testo(tessera.user_id) === testo(scope.userId)) {
    throw roleDenied("il proprio accesso non si revoca da questa schermata");
  }

  if (normalizeAccessRole(tessera.role) === "owner") {
    try {
      assertOwnerOnlyAction(scope.activeRole, OWNER_ONLY_ACTIONS.grantOwner);
    } catch (errore) {
      await tracciaDiniegoProprietario(
        scope,
        OWNER_ONLY_ACTIONS.grantOwner,
        tessera.id,
      );
      throw errore;
    }
  }

  const [societa, utente] = await Promise.all([
    prisma.club.findUnique({
      where: { id: club },
      select: { creator_id: true },
    }),
    prisma.user.findUnique({
      where: { id: tessera.user_id },
      select: { email: true },
    }),
  ]);
  if (societa?.creator_id && testo(societa.creator_id) === testo(tessera.user_id)) {
    throw roleDenied(
      "il fondatore del club non si revoca: la sua proprieta non nasce da questa tessera",
    );
  }

  const ripulito = await prisma.$transaction(async (tx) => {
    await tx.clubAccessScope.deleteMany({
      where: { organization_user_id: tessera.id },
    });
    await tx.organizationUser.delete({ where: { id: tessera.id } });

    const clubJsonProfiles = await unlinkClubJsonProfiles(
      tx,
      tessera.organization_id,
      tessera.user_id,
      utente?.email || null,
      tessera.role,
    );
    const resourceProfiles = await unlinkProfileResources(
      tx,
      tessera.organization_id,
      tessera.user_id,
      utente?.email || null,
      tessera.role,
    );
    const parentProfiles = await unlinkParentGuardians(
      tx,
      tessera.organization_id,
      tessera.user_id,
      utente?.email || null,
      tessera.role,
    );
    const athleteProfiles = await unlinkDirectAthleteProfile(
      tx,
      tessera.organization_id,
      tessera.user_id,
      tessera.role,
    );

    return {
      unlinkedProfilesCount:
        clubJsonProfiles + resourceProfiles + parentProfiles + athleteProfiles,
    };
  });

  await audit(scope, AUDIT_ACTIONS.clubRoleRevoked, tessera.id, {
    role: tessera.role,
    target_user_id: tessera.user_id,
    unlinked_profiles_count: ripulito.unlinkedProfilesCount,
  });

  return { membership_id: tessera.id, revoked: true };
};
