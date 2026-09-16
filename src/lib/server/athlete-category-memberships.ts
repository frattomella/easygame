/**
 * **Il writer delle appartenenze di un atleta alle categorie** (ADR-0194).
 *
 * Un cambio di categoria e un'operazione sulle appartenenze, non un
 * `category_id = X`: si decide quale riga e primaria, quali restano, quali
 * spariscono, e la sede si **deriva** dalla squadra scelta. Questo modulo e
 * il punto unico in cui quella decisione si scrive — dalla scheda singola,
 * dal cambio in blocco, dalla creazione, dalla prova e dall'iscrizione — e
 * ogni strada passa dallo stesso piano (`planMembershipChange`), dalle stesse
 * guardie e dalla stessa transazione.
 *
 * ## Cosa garantisce
 *
 * - **tenant e permesso**: il club attivo, `athlete_category_memberships`
 *   scrivibile dal ruolo, il perimetro di sede/categoria dell'accesso;
 * - **identita**: la categoria e un identificativo del catalogo, la coppia
 *   (categoria, sede) e una squadra configurata (`placement.ts`); una coppia
 *   che il club non ha non nasce, nemmeno se un client la manda;
 * - **una primaria**: il piano non ne produce due e l'ordine di scrittura
 *   rispetta l'indice parziale (scende, cancella, inserisce, sale); la scheda
 *   e bloccata (`bloccaSchede`) per tutta la transazione, quindi due
 *   amministratori che cambiano la stessa primaria si mettono in fila e il
 *   secondo lavora su cio che il primo ha scritto;
 * - **proiezione**: `athletes.category_id/category_name` e
 *   `athletes.data.{category,categoryName,categoryMemberships,categories}`
 *   si riscrivono nella stessa transazione, con la funzione del dominio;
 * - **audit**: una riga per atleta con prima, dopo e politica; per il blocco
 *   una riga di riepilogo con `batchId`;
 * - **storia**: nessuna riga di evento, presenza o convocazione si tocca.
 *
 * ## Blocco
 *
 * Il blocco si scrive a lotti di `CHUNK` atleti, ciascuno atomico e con le
 * schede bloccate in ordine crescente (ADR-0138). Un lotto che fallisce non
 * lascia meta lotto scritto; i lotti successivi non partono, e il rapporto
 * dice per ogni atleta se e stato aggiornato, se era gia a posto, se e stato
 * segnalato o se non e stato tentato. Niente meta atleti aggiornati senza
 * un rapporto.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { bloccaSchede } from "./athlete-lock-order";
import { canonicalizeCategoryReferenceForWrite, loadClubCategoryCatalog, loadMembershipTargetIndex } from "./category-write-guard";
import { athleteIdsWithinAccessScope, assertMembershipWithinAccessScope } from "./access-scope-query";
import { AUDIT_ACTIONS, recordAuditEvent, recordPermissionDenied } from "./audit";
import { assertClubResourceAccess, canAccessClubResource } from "@/lib/access-roles";
import {
  describeMembershipPlacement,
  explainUnresolvedPlacement,
  type MembershipTarget,
  type MembershipTargetIndex,
} from "@/lib/categories/placement";
import {
  planMembershipChange,
  summarizeMembershipPlans,
  type MembershipChangeCommand,
  type MembershipChangePlan,
  type PlannedMembership,
} from "@/lib/categories/membership-change";
import {
  buildAthleteCategoryProjection,
  normalizeAthleteCategoryMemberships,
} from "@/lib/athlete-category-memberships";

type MembershipScope = {
  userId?: string | null;
  activeOrganizationId: string | null;
  activeRole: string | null;
  allowedOrganizationIds?: string[];
  accessScopes?: any;
};

type Attore = { userId?: string | null; email?: string | null };

const CHUNK = 50;
/**
 * Al massimo per richiesta: quattro lotti atomici di 50 stanno dentro un
 * minuto di funzione serverless con i round-trip di Neon (revisione ostile
 * D1). Oltre, il client spezza in piu richieste con lo stesso `batchId`.
 */
export const MAX_ATHLETES_PER_REQUEST = 200;
const MAX_ATHLETES = MAX_ATHLETES_PER_REQUEST;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asText = (value: unknown) => String(value ?? "").trim();
const negato = (motivo: string) => new Error(`Accesso negato: ${motivo}`);

const requireOrganization = (scope: MembershipScope) => {
  const organizationId = asText(scope.activeOrganizationId);
  if (!organizationId) throw negato("nessun club attivo selezionato");
  if (
    Array.isArray(scope.allowedOrganizationIds) &&
    scope.allowedOrganizationIds.length &&
    !scope.allowedOrganizationIds.includes(organizationId)
  ) {
    throw negato("il club attivo non e fra quelli consentiti");
  }
  return organizationId;
};

const assertCanWrite = async (scope: MembershipScope, resourceId?: string | null) => {
  if (
    canAccessClubResource(scope.activeRole, "athlete_category_memberships", "update") &&
    canAccessClubResource(scope.activeRole, "athletes", "update")
  ) {
    return;
  }
  await recordPermissionDenied({
    scope: scope as never,
    permission: "athlete_category_memberships:update",
    resource: "athlete_category_memberships",
    resourceId: resourceId || null,
  });
  assertClubResourceAccess(scope.activeRole, "athlete_category_memberships", "update");
  assertClubResourceAccess(scope.activeRole, "athletes", "update");
};

/* ── Catalogo e collocazioni ────────────────────────────────────────────── */

export { loadMembershipTargetIndex } from "./category-write-guard";

type RigaArchivio = {
  id: string;
  category_id: string;
  category_name: string | null;
  is_primary: boolean;
  site_id: string | null;
};

/**
 * Le righe come stanno in archivio, **tutte e com'erano**: niente
 * normalizzatore, perche il normalizzatore promuove la prima riga a
 * primaria quando nessuna lo e e, con il catalogo in mano, mette da parte
 * una secondaria che il club non conosce piu (ADR-0185 §5). Qui l'archivio
 * e la verita: un atleta senza primaria si **segnala** (§9 caso H), non si
 * ripara di nascosto, e una riga messa da parte diventerebbe una riga
 * cancellata. Il nome corrente lo da `descriviRiga`.
 */
const daArchivio = (righe: readonly RigaArchivio[]): PlannedMembership[] =>
  righe.map((riga) => ({
    categoryId: asText(riga.category_id),
    categoryName: asText(riga.category_name) || asText(riga.category_id),
    storedCategoryName: asText(riga.category_name) || undefined,
    isPrimary: Boolean(riga.is_primary),
    siteId: asText(riga.site_id),
    rowId: riga.id,
  }));

/**
 * La collocazione **scegliibile** che un comando nomina: per identificativo
 * di gruppo (`group:<cat>:<sede>`) o per coppia (categoria, sede). Una
 * coppia che il club non ha configurato non e una destinazione.
 */
export const resolveMembershipTarget = (
  index: MembershipTargetIndex,
  input: { targetId?: unknown; categoryId?: unknown; siteId?: unknown },
): MembershipTarget => {
  const perId = asText(input.targetId) ? index.byId(input.targetId) : null;
  if (perId) return perId;
  const categoryId = asText(input.categoryId);
  if (!categoryId) {
    throw new Error(
      asText(input.targetId)
        ? "Cambio di categoria: la squadra scelta non e piu configurata dal club"
        : "Cambio di categoria: la categoria di destinazione non e indicata",
    );
  }
  const siteId = asText(input.siteId);
  const candidate = index.forCategory(categoryId);
  /* Senza sede indicata e con una squadra sola, la sede e quella: e la derivazione, non un'ipotesi. */
  if (!siteId && candidate.length === 1) return candidate[0];
  const collocazione = index.place({ categoryId, siteId });
  if (collocazione.status === "resolved") return collocazione.target;
  if (collocazione.status === "no_site_configured") {
    const implicito = index.forCategory(categoryId)[0];
    if (implicito) return implicito;
  }
  if (collocazione.status === "unresolved") {
    throw new Error(`Cambio di categoria: ${explainUnresolvedPlacement(collocazione)}`);
  }
  throw new Error("Cambio di categoria: la categoria di destinazione non e una categoria del club");
};

/**
 * Ogni riga nuova o cambiata deve cadere su una squadra del club. Una riga
 * che esiste gia con la stessa coppia passa com'e: il dato precedente alle
 * sedi non blocca il salvataggio, e lo sistema chi lo sceglie, non chi
 * salva un'altra cosa.
 */
const assertPlacementsAreCanonical = (
  index: MembershipTargetIndex,
  after: readonly PlannedMembership[],
  before: readonly PlannedMembership[],
) => {
  /* Club senza catalogo (ADR-0185 §9): niente con cui confrontare, come nel vaglio del registro. */
  if (!index.targets.length) return;
  const coppieCorrenti = new Set(before.map((r) => `${r.categoryId.toLowerCase()}|${r.siteId}`));
  for (const riga of after) {
    if (coppieCorrenti.has(`${riga.categoryId.toLowerCase()}|${riga.siteId}`)) continue;
    const collocazione = index.place(riga);
    if (collocazione.status === "unresolved") {
      /* La categoria la giudica il vaglio della categoria; qui si giudica la coppia. */
      if (collocazione.reason === "unknown_category") continue;
      throw new Error(`Appartenenza a una categoria: ${explainUnresolvedPlacement(collocazione)}`);
    }
  }
};

/**
 * Le righe che **cambiano** rispetto all'archivio: nuove, o con sede o ruolo
 * diversi. Il perimetro dell'accesso si vaglia su queste e sulla
 * destinazione, non su una secondaria di un'altra sede che c'era gia
 * (revisione ostile A2/B9): «la coppia che una riga gia aveva passa».
 */
const righeCheCambiano = (after: readonly PlannedMembership[], before: readonly PlannedMembership[]) => {
  const prima = new Map(before.map((r) => [r.categoryId.toLowerCase(), r] as const));
  return after.filter((r) => {
    const corrente = prima.get(r.categoryId.toLowerCase());
    return !corrente || corrente.siteId !== r.siteId || corrente.isPrimary !== r.isPrimary;
  });
};

const fuoriPerimetro = (scope: MembershipScope, righe: readonly PlannedMembership[]) => {
  for (const riga of righe) {
    try {
      assertMembershipWithinAccessScope(scope as never, { site_id: riga.siteId || null, category_id: riga.categoryId });
    } catch {
      return true;
    }
  }
  return false;
};

/**
 * Il piano di un atleta, con l'archivio in mano: le righe che il catalogo
 * non conosce restano fuori dal piano e si riattaccano com'erano (mai
 * primarie se il piano ne ha una), cosi l'anteprima non dice «rimossa» di
 * una riga che il writer conserva (revisione ostile A4/D5); due righe con la
 * stessa categoria in grafie diverse, o due primarie, fermano l'atleta
 * (D12). La firma delle righe correnti serve a riconoscere un archivio
 * cambiato fra anteprima e applicazione (D7).
 */
const pianifica = (
  before: readonly PlannedMembership[],
  command: MembershipChangeCommand,
  configurate: ReadonlySet<string>,
): MembershipChangePlan => {
  const chiavi = before.map((r) => r.categoryId.toLowerCase());
  if (new Set(chiavi).size !== chiavi.length) {
    return { after: [...before], blocked: true, unchanged: true, summary: { primaryChanged: false, promoted: false, added: false, removed: [], keptAsSecondary: null, keptSecondaries: [] }, warnings: ["duplicate_rows"] };
  }
  const nelCatalogo = configurate.size ? before.filter((r) => configurate.has(r.categoryId.toLowerCase())) : [...before];
  const fuoriCatalogo = configurate.size ? before.filter((r) => !configurate.has(r.categoryId.toLowerCase())) : [];
  const plan = planMembershipChange(nelCatalogo, command);
  if (!fuoriCatalogo.length) return plan;
  const primariaNelPiano = plan.after.some((r) => r.isPrimary);
  const conservate = fuoriCatalogo.map((r) => ({ ...r, isPrimary: primariaNelPiano ? false : r.isPrimary }));
  return {
    ...plan,
    after: [...plan.after, ...conservate],
    warnings: [...plan.warnings, "legacy_rows_kept"],
  };
};

export const firmaAppartenenze = (righe: readonly PlannedMembership[]) =>
  righe
    .map((r) => `${r.categoryId.toLowerCase()}|${r.isPrimary ? "P" : "S"}|${r.siteId}`)
    .sort()
    .join(" ~ ");

/* ── Scrittura ──────────────────────────────────────────────────────────── */

type EsitoScrittura = {
  righe: RigaArchivio[];
  cambiata: boolean;
};

/**
 * Scrive **per differenza** dentro la transazione, nell'ordine che l'indice
 * parziale impone: prima scende la primaria che smette di esserlo, poi si
 * cancella, poi si inserisce, per ultimo sale la nuova primaria. Poi la
 * proiezione sull'anagrafica.
 */
const scriviAppartenenze = async (
  tx: any,
  organizationId: string,
  athleteId: string,
  correnti: readonly RigaArchivio[],
  after: readonly PlannedMembership[],
  /** Le categorie configurate: una riga fuori dal catalogo non si cancella da qui (ADR-0186 §8). */
  configurate: ReadonlySet<string>,
): Promise<EsitoScrittura> => {
  const perCategoria = new Map(correnti.map((riga) => [asText(riga.category_id).toLowerCase(), riga] as const));
  const volute = new Map(after.map((riga) => [riga.categoryId.toLowerCase(), riga] as const));

  const discese: RigaArchivio[] = [];
  const salite: PlannedMembership[] = [];
  const modifiche: Array<{ riga: RigaArchivio; campi: Record<string, unknown> }> = [];
  const inserimenti: PlannedMembership[] = [];
  const cancellazioni: RigaArchivio[] = [];

  for (const voluta of after) {
    const corrente = perCategoria.get(voluta.categoryId.toLowerCase());
    if (!corrente) {
      inserimenti.push(voluta);
      continue;
    }
    const campi: Record<string, unknown> = {};
    if (asText(corrente.site_id) !== voluta.siteId) campi.site_id = voluta.siteId || null;
    if (Boolean(corrente.is_primary) !== voluta.isPrimary) {
      if (voluta.isPrimary) salite.push(voluta);
      else discese.push(corrente);
    }
    if (Object.keys(campi).length) modifiche.push({ riga: corrente, campi });
  }
  const primariaVoluta = after.some((r) => r.isPrimary);
  for (const corrente of correnti) {
    const chiave = asText(corrente.category_id).toLowerCase();
    if (volute.has(chiave)) continue;
    if (configurate.size && !configurate.has(chiave)) {
      /*
        Una riga fuori dal catalogo non si cancella da qui (ADR-0186 §8), ma
        se era primaria e il piano ne mette un'altra, **scende**: due primarie
        sono il rifiuto dell'indice per tutto il lotto (revisione ostile A1).
      */
      if (corrente.is_primary && primariaVoluta) discese.push(corrente);
      continue;
    }
    cancellazioni.push(corrente);
  }

  const cambiata = Boolean(discese.length || salite.length || modifiche.length || inserimenti.length || cancellazioni.length);
  if (!cambiata) return { righe: [...correnti], cambiata: false };

  for (const riga of discese) {
    await tx.athleteCategoryMembership.update({ where: { id: riga.id }, data: { is_primary: false } });
  }
  for (const riga of cancellazioni) {
    await tx.athleteCategoryMembership.delete({ where: { id: riga.id } });
  }
  for (const { riga, campi } of modifiche) {
    await tx.athleteCategoryMembership.update({ where: { id: riga.id }, data: campi });
  }
  for (const voluta of inserimenti) {
    await tx.athleteCategoryMembership.create({
      data: {
        organization_id: organizationId,
        athlete_id: athleteId,
        category_id: voluta.categoryId,
        category_name: voluta.storedCategoryName || voluta.categoryName,
        is_primary: false,
        site_id: voluta.siteId || null,
      },
    });
  }
  for (const voluta of salite) {
    const corrente = perCategoria.get(voluta.categoryId.toLowerCase());
    if (corrente) await tx.athleteCategoryMembership.update({ where: { id: corrente.id }, data: { is_primary: true } });
  }
  const nuovaPrimariaInserita = inserimenti.find((r) => r.isPrimary);
  if (nuovaPrimariaInserita) {
    await tx.athleteCategoryMembership.updateMany({
      where: { organization_id: organizationId, athlete_id: athleteId, category_id: nuovaPrimariaInserita.categoryId },
      data: { is_primary: true },
    });
  }

  const righe: RigaArchivio[] = await tx.athleteCategoryMembership.findMany({
    where: { organization_id: organizationId, athlete_id: athleteId },
    select: { id: true, category_id: true, category_name: true, is_primary: true, site_id: true },
    orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
  });

  /* La proiezione sull'anagrafica: colonne e `data`, con la funzione del dominio (ADR-0186 §6). */
  const normalizzate = normalizeAthleteCategoryMemberships(
    righe.map((r) => ({ id: r.id, category_id: r.category_id, category_name: r.category_name, is_primary: r.is_primary, site_id: r.site_id })),
  );
  const proiezione = buildAthleteCategoryProjection(normalizzate, { clubId: organizationId, athleteId });
  const primaria = righe.find((r) => r.is_primary) || null;
  const scheda = await tx.athlete.findUnique({ where: { id: athleteId }, select: { data: true, organization_id: true } });
  if (!scheda || asText(scheda.organization_id) !== organizationId) {
    throw new Error("Atleta non trovato nel club attivo");
  }
  const data = scheda.data && typeof scheda.data === "object" && !Array.isArray(scheda.data) ? (scheda.data as Record<string, unknown>) : {};
  /*
    Le copie legacy della sede e della categoria in `data` non si riscrivono:
    la sede e derivata (ADR-0194 §25) e `category_id`/`category_name`/
    `category_memberships`/`memberships` sono chiavi che il normalizzatore
    leggerebbe come sorgente quando le righe mancano (revisione ostile C12).
  */
  const {
    site_id: _legacySiteId,
    siteId: _legacySiteIdCamel,
    category_id: _legacyCategoryId,
    category_name: _legacyCategoryName,
    category_memberships: _legacyMemberships,
    memberships: _legacyMembershipsShort,
    ...senzaSedeLegacy
  } = data as Record<string, unknown>;
  await tx.athlete.update({
    where: { id: athleteId },
    data: {
      category_id: primaria?.category_id ?? null,
      category_name: primaria ? (proiezione.categoryName ?? primaria.category_name) : null,
      /* La sede e derivata dalle appartenenze: la copia legacy in `data` non si riscrive piu (ADR-0194). */
      data: { ...senzaSedeLegacy, ...proiezione } as never,
    },
  });

  return { righe, cambiata: true };
};

/* ── Il comando ─────────────────────────────────────────────────────────── */

export type MembershipChangeInput = {
  athleteIds: string[];
  /** Le firme viste in anteprima, per atleta: un archivio cambiato nel frattempo blocca quell'atleta (`changed_since_preview`). */
  expected?: Record<string, string> | null;
  command:
    | {
        kind: "assign";
        targetId?: string;
        categoryId?: string;
        siteId?: string;
        role: "primary" | "secondary";
        previousPrimaryPolicy?: "remove" | "keep_as_secondary";
        otherSecondariesPolicy?: "keep" | "remove";
      }
    | { kind: "remove"; categoryId: string };
};

export type MembershipChangeAthleteReport = {
  athleteId: string;
  name: string;
  before: Array<{ categoryId: string; label: string; isPrimary: boolean; siteId: string; siteName: string }>;
  after: Array<{ categoryId: string; label: string; isPrimary: boolean; siteId: string; siteName: string }>;
  status: "updated" | "unchanged" | "blocked" | "failed" | "not_attempted" | "planned";
  /** La firma delle righe correnti: l'applicazione la confronta con l'archivio e si ferma se e cambiato (D7). */
  signature: string;
  warnings: MembershipChangePlan["warnings"];
  summary: { primaryChanged: boolean; promoted: boolean; added: boolean; removed: number; keptAsSecondary: boolean; keptSecondaries: number };
  error?: string;
};

export type MembershipChangeReport = {
  batchId: string;
  mode: "preview" | "apply";
  target: { id: string; label: string; categoryId: string; siteId: string; siteName: string } | null;
  command: MembershipChangeCommand;
  totals: ReturnType<typeof summarizeMembershipPlans> & { failed: number; notAttempted: number };
  athletes: MembershipChangeAthleteReport[];
};

const normalizeCommand = (index: MembershipTargetIndex, input: MembershipChangeInput["command"]): { command: MembershipChangeCommand; target: MembershipTarget | null } => {
  if (input.kind === "remove") {
    const categoryId = asText(input.categoryId);
    if (!categoryId) throw new Error("Rimozione dalla categoria: la categoria non e indicata");
    return { command: { kind: "remove", categoryId }, target: null };
  }
  if (input.kind !== "assign") throw new Error("Cambio di categoria: comando non riconosciuto");
  const target = resolveMembershipTarget(index, input);
  /* Un valore fuori dal vocabolario e un errore, non il default piu distruttivo (revisione ostile D4). */
  const role = input.role;
  if (role !== "primary" && role !== "secondary") throw new Error("Cambio di categoria: il ruolo deve essere «primary» o «secondary»");
  const previousPrimaryPolicy = input.previousPrimaryPolicy ?? "remove";
  if (previousPrimaryPolicy !== "remove" && previousPrimaryPolicy !== "keep_as_secondary") {
    throw new Error("Cambio di categoria: la politica sulla primaria precedente deve essere «remove» o «keep_as_secondary»");
  }
  const otherSecondariesPolicy = input.otherSecondariesPolicy ?? "keep";
  if (otherSecondariesPolicy !== "keep" && otherSecondariesPolicy !== "remove") {
    throw new Error("Cambio di categoria: la politica sulle altre secondarie deve essere «keep» o «remove»");
  }
  return {
    target,
    command: {
      kind: "assign",
      target: { categoryId: target.categoryId, categoryName: target.categoryName, siteId: target.siteId },
      role,
      previousPrimaryPolicy,
      otherSecondariesPolicy,
    },
  };
};

const descriviRiga = (index: MembershipTargetIndex, riga: PlannedMembership) => {
  const collocazione = index.place(riga);
  const { label, siteName } = describeMembershipPlacement(collocazione);
  return { categoryId: riga.categoryId, label, isPrimary: riga.isPrimary, siteId: riga.siteId, siteName };
};

const riassumi = (plan: MembershipChangePlan) => ({
  primaryChanged: plan.summary.primaryChanged,
  promoted: plan.summary.promoted,
  added: plan.summary.added,
  removed: plan.summary.removed.length,
  keptAsSecondary: Boolean(plan.summary.keptAsSecondary),
  keptSecondaries: plan.summary.keptSecondaries.length,
});

const RIASSUNTO_VUOTO = { primaryChanged: false, promoted: false, added: false, removed: 0, keptAsSecondary: false, keptSecondaries: 0 };

/**
 * Un errore dell'archivio si dice in italiano, non con il testo del driver
 * (revisione ostile D14): il codice di Prisma resta nel log del server.
 */
const messaggioDiScrittura = (error: any) => {
  const codice = asText(error?.code);
  if (codice === "P2002") return "Cambio di categoria non riuscito: l'archivio ha rifiutato una seconda primaria o una riga doppia. Ricaricare e riprovare.";
  if (codice === "P2028" || codice === "P2034" || /40P01|deadlock/i.test(String(error?.message || ""))) {
    return "Cambio di categoria non riuscito: l'archivio era occupato da un'altra modifica. Riprovare fra qualche secondo.";
  }
  const messaggio = String(error?.message || "").trim();
  return messaggio && !/^\s*(Invalid|Transaction API|PrismaClient)/i.test(messaggio) ? messaggio : "Cambio di categoria non riuscito";
};

const nomeAtleta = (a: { first_name: string | null; last_name: string | null }) =>
  `${asText(a.first_name)} ${asText(a.last_name)}`.trim();

/**
 * Gli atleti del comando: tutti del club attivo, tutti dentro il perimetro
 * dell'accesso, nessun duplicato. Un identificativo estraneo e un errore,
 * non un atleta saltato in silenzio.
 */
const caricaAtleti = async (organizationId: string, scope: MembershipScope, athleteIds: readonly string[]) => {
  if (!Array.isArray(athleteIds) || athleteIds.length > MAX_ATHLETES) {
    throw new Error(`Cambio di categoria: al massimo ${MAX_ATHLETES} atleti per richiesta`);
  }
  const ids = Array.from(new Set(athleteIds.map(asText).filter((id) => UUID.test(id))));
  if (!ids.length) throw new Error("Cambio di categoria: nessun atleta indicato");
  if (ids.length !== new Set(athleteIds.map(asText).filter(Boolean)).size) {
    throw new Error("Cambio di categoria: un identificativo di atleta non e valido");
  }
  if (ids.length > MAX_ATHLETES) throw new Error(`Cambio di categoria: al massimo ${MAX_ATHLETES} atleti per volta`);
  const atleti = await prisma.athlete.findMany({
    where: { id: { in: ids }, organization_id: organizationId },
    select: { id: true, first_name: true, last_name: true },
  });
  if (atleti.length !== ids.length) {
    throw negato("uno o piu atleti non appartengono al club attivo");
  }
  const dentro = await athleteIdsWithinAccessScope(organizationId, scope as never);
  if (dentro) {
    const ammessi = new Set(dentro);
    if (atleti.some((a) => !ammessi.has(a.id))) {
      throw negato("uno o piu atleti sono fuori dal perimetro di sede o categoria dell'accesso");
    }
  }
  const perId = new Map(atleti.map((a) => [a.id, a] as const));
  return ids.map((id) => perId.get(id)!);
};

const caricaRighe = async (client: any, organizationId: string, athleteIds: readonly string[]) => {
  const righe: Array<RigaArchivio & { athlete_id: string }> = await client.athleteCategoryMembership.findMany({
    where: { organization_id: organizationId, athlete_id: { in: [...athleteIds] } },
    select: { id: true, athlete_id: true, category_id: true, category_name: true, is_primary: true, site_id: true },
    orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
  });
  const perAtleta = new Map<string, RigaArchivio[]>();
  for (const riga of righe) {
    const bucket = perAtleta.get(riga.athlete_id) || [];
    bucket.push(riga);
    perAtleta.set(riga.athlete_id, bucket);
  }
  return perAtleta;
};

/**
 * Il piano di un atleta con i vagli che l'applicazione farebbe: una coppia
 * non configurata o una riga fuori dal perimetro non fanno cadere il lotto,
 * **fermano l'atleta** e lo dicono (revisione ostile A2/D6). L'anteprima e
 * l'applicazione usano la stessa funzione: cio che si legge e cio che
 * succede.
 */
const pianoConVaglio = (
  scope: MembershipScope,
  index: MembershipTargetIndex,
  configurate: ReadonlySet<string>,
  before: readonly PlannedMembership[],
  command: MembershipChangeCommand,
): MembershipChangePlan => {
  const plan = pianifica(before, command, configurate);
  if (plan.blocked || plan.unchanged) return plan;
  try {
    assertPlacementsAreCanonical(index, plan.after, before);
  } catch {
    return { ...plan, after: [...before], blocked: true, unchanged: true, warnings: [...plan.warnings, "placement_invalid"] };
  }
  if (fuoriPerimetro(scope, righeCheCambiano(plan.after, before))) {
    return { ...plan, after: [...before], blocked: true, unchanged: true, warnings: [...plan.warnings, "out_of_scope"] };
  }
  return plan;
};

/**
 * L'anteprima: lo stesso piano dell'applicazione, senza scrivere. E cio che
 * il club legge prima di confermare (§8).
 */
export const previewMembershipChange = async (
  scope: MembershipScope,
  input: MembershipChangeInput,
): Promise<MembershipChangeReport> => {
  const organizationId = requireOrganization(scope);
  await assertCanWrite(scope);
  const atleti = await caricaAtleti(organizationId, scope, input.athleteIds);
  const index = await loadMembershipTargetIndex(organizationId);
  const { command, target } = normalizeCommand(index, input.command);
  if (target) {
    assertMembershipWithinAccessScope(scope as never, { site_id: target.siteId || null, category_id: target.categoryId });
  }
  const configurate = new Set(index.targets.map((t) => t.categoryId.toLowerCase()));
  const righePerAtleta = await caricaRighe(prisma, organizationId, atleti.map((a) => a.id));

  const piani = atleti.map((atleta) => {
    const before = daArchivio(righePerAtleta.get(atleta.id) || []);
    const plan = pianoConVaglio(scope, index, configurate, before, command);
    return { athleteId: atleta.id, atleta, before, plan };
  });
  const totals = summarizeMembershipPlans(piani);
  return {
    batchId: randomUUID(),
    mode: "preview",
    target: target ? { id: target.id, label: target.label, categoryId: target.categoryId, siteId: target.siteId, siteName: target.siteName } : null,
    command,
    totals: { ...totals, failed: 0, notAttempted: 0 },
    athletes: piani.map(({ athleteId, atleta, before, plan }) => ({
      athleteId,
      name: nomeAtleta(atleta),
      before: before.map((r) => descriviRiga(index, r)),
      after: (plan.blocked ? before : plan.after).map((r) => descriviRiga(index, r)),
      status: plan.blocked ? "blocked" : plan.unchanged ? "unchanged" : "planned",
      signature: firmaAppartenenze(before),
      warnings: plan.warnings,
      summary: riassumi(plan),
    })),
  };
};

/**
 * L'applicazione: a lotti atomici, con le schede bloccate, il piano
 * **ricalcolato dentro la transazione** sulle righe lette con il blocco in
 * mano — cosi due amministratori concorrenti non partono dalla stessa
 * fotografia — e l'audit per atleta e per blocco.
 */
export const applyMembershipChange = async (
  scope: MembershipScope,
  input: MembershipChangeInput,
  attore: Attore = {},
  options: { batchId?: string | null; request?: Request | null } = {},
): Promise<MembershipChangeReport> => {
  const organizationId = requireOrganization(scope);
  await assertCanWrite(scope);
  const atleti = await caricaAtleti(organizationId, scope, input.athleteIds);
  const index = await loadMembershipTargetIndex(organizationId);
  const { command, target } = normalizeCommand(index, input.command);
  if (target) {
    /* Il perimetro dell'accesso vale anche sulla destinazione: chi e ristretto a una sede non sposta nessuno altrove. */
    assertMembershipWithinAccessScope(scope as never, { site_id: target.siteId || null, category_id: target.categoryId });
  }
  const configurate = new Set(index.targets.map((t) => t.categoryId.toLowerCase()));
  const batchId = UUID.test(asText(options.batchId)) ? asText(options.batchId) : randomUUID();

  const rapporti = new Map<string, MembershipChangeAthleteReport>();
  const piani: Array<{ athleteId: string; plan: MembershipChangePlan }> = [];
  let failed = 0;
  let notAttempted = 0;
  let fermato: string | null = null;

  for (let inizio = 0; inizio < atleti.length; inizio += CHUNK) {
    const lotto = atleti.slice(inizio, inizio + CHUNK);
    if (fermato) {
      for (const atleta of lotto) {
        notAttempted += 1;
        rapporti.set(atleta.id, {
          athleteId: atleta.id,
          name: nomeAtleta(atleta),
          before: [],
          after: [],
          status: "not_attempted",
          signature: "",
          warnings: [],
          summary: RIASSUNTO_VUOTO,
          error: fermato,
        });
      }
      continue;
    }
    try {
      const esiti = await prisma.$transaction(
        async (tx) => {
          const ids = lotto.map((a) => a.id);
          await bloccaSchede(tx, ids);
          const righePerAtleta = await caricaRighe(tx, organizationId, ids);
          const risultati: Array<{ athleteId: string; before: PlannedMembership[]; plan: MembershipChangePlan; righe: RigaArchivio[]; cambiata?: boolean }> = [];
          for (const atleta of lotto) {
            const correnti = righePerAtleta.get(atleta.id) || [];
            const before = daArchivio(correnti);
            const attesa = input.expected && typeof input.expected === "object" ? asText((input.expected as Record<string, unknown>)[atleta.id]) : "";
            let plan = pianoConVaglio(scope, index, configurate, before, command);
            if (attesa && attesa !== firmaAppartenenze(before)) {
              /* Le righe sono cambiate fra l'anteprima e la conferma: cio che il club ha letto non e piu vero per questo atleta. */
              plan = { ...plan, after: [...before], blocked: true, unchanged: true, warnings: [...plan.warnings, "changed_since_preview"] };
            }
            if (plan.blocked || plan.unchanged) {
              risultati.push({ athleteId: atleta.id, before, plan, righe: correnti });
              continue;
            }
            const scritto = await scriviAppartenenze(tx, organizationId, atleta.id, correnti, plan.after, configurate);
            risultati.push({ athleteId: atleta.id, before, plan, righe: scritto.righe, cambiata: scritto.cambiata });
          }
          return risultati;
        },
        { timeout: 30_000, maxWait: 10_000 },
      );

      for (const esito of esiti) {
        const atleta = lotto.find((a) => a.id === esito.athleteId)!;
        const dopo = daArchivio(esito.righe);
        /* Lo stato lo dice cio che e stato scritto, non il piano (D5). */
        const stato: MembershipChangeAthleteReport["status"] = esito.plan.blocked ? "blocked" : esito.plan.unchanged || esito.cambiata === false ? "unchanged" : "updated";
        piani.push({ athleteId: esito.athleteId, plan: stato === "unchanged" && !esito.plan.unchanged ? { ...esito.plan, unchanged: true } : esito.plan });
        rapporti.set(esito.athleteId, {
          athleteId: esito.athleteId,
          name: nomeAtleta(atleta),
          before: esito.before.map((r) => descriviRiga(index, r)),
          after: dopo.map((r) => descriviRiga(index, r)),
          status: stato,
          signature: firmaAppartenenze(dopo),
          warnings: esito.plan.warnings,
          summary: riassumi(esito.plan),
        });
        if (stato === "updated") {
          await recordAuditEvent({
            action: AUDIT_ACTIONS.athleteMembershipsChanged,
            actorUserId: attore.userId || scope.userId || null,
            actorEmail: attore.email || null,
            actorRole: scope.activeRole || null,
            organizationId,
            resource: "athletes",
            resourceId: esito.athleteId,
            request: options.request || undefined,
            metadata: {
              batchId,
              operation: command.kind,
              policy:
                command.kind === "assign"
                  ? { role: command.role, previousPrimary: command.previousPrimaryPolicy, otherSecondaries: command.otherSecondariesPolicy }
                  : { role: "remove" },
              target: target ? { id: target.id, categoryId: target.categoryId, siteId: target.siteId || null } : { categoryId: command.kind === "remove" ? command.categoryId : null },
              before: esito.before.map((r) => ({ categoryId: r.categoryId, isPrimary: r.isPrimary, siteId: r.siteId || null })),
              after: dopo.map((r) => ({ categoryId: r.categoryId, isPrimary: r.isPrimary, siteId: r.siteId || null })),
            },
          });
        }
      }
    } catch (error: any) {
      const messaggio = messaggioDiScrittura(error);
      fermato = messaggio;
      for (const atleta of lotto) {
        failed += 1;
        rapporti.set(atleta.id, {
          athleteId: atleta.id,
          name: nomeAtleta(atleta),
          before: [],
          after: [],
          status: "failed",
          signature: "",
          warnings: [],
          summary: RIASSUNTO_VUOTO,
          error: messaggio,
        });
      }
    }
  }

  const totals = { ...summarizeMembershipPlans(piani), failed, notAttempted };
  if (atleti.length > 1 || failed) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.athleteMembershipsBulk,
      actorUserId: attore.userId || scope.userId || null,
      actorEmail: attore.email || null,
      actorRole: scope.activeRole || null,
      organizationId,
      resource: "athletes",
      resourceId: batchId,
      request: options.request || undefined,
      outcome: failed ? "failure" : "success",
      metadata: {
        batchId,
        operation: command.kind,
        policy:
          command.kind === "assign"
            ? { role: command.role, previousPrimary: command.previousPrimaryPolicy, otherSecondaries: command.otherSecondariesPolicy }
            : { role: "remove" },
        target: target ? { id: target.id, categoryId: target.categoryId, siteId: target.siteId || null } : null,
        count: atleti.length,
        updated: totals.updated,
        unchanged: totals.unchanged,
        blocked: totals.blocked,
        failed,
        ...(fermato ? { reason: fermato } : {}),
      },
    });
  }

  return {
    batchId,
    mode: "apply",
    target: target ? { id: target.id, label: target.label, categoryId: target.categoryId, siteId: target.siteId, siteName: target.siteName } : null,
    command,
    totals,
    athletes: atleti.map((a) => rapporti.get(a.id)!),
  };
};

/* ── L'insieme intero (scheda, creazione, iscrizione, import) ──────────── */

export type MembershipRowInput = {
  categoryId?: unknown;
  category_id?: unknown;
  categoryName?: unknown;
  category_name?: unknown;
  storedCategoryName?: unknown;
  stored_category_name?: unknown;
  isPrimary?: unknown;
  is_primary?: unknown;
  siteId?: unknown;
  site_id?: unknown;
};

/**
 * Scrive **l'insieme** delle appartenenze di un atleta: e la strada di chi
 * ha in mano l'elenco intero (la scheda che salva il cassetto, la creazione
 * con primaria e secondarie, l'iscrizione approvata). Stesse guardie del
 * comando: categorie del catalogo, coppie configurate per cio che cambia,
 * una primaria, nessun doppione, proiezione e audit. Le righe del club che
 * il catalogo non conosce e che l'elenco non nomina **restano** (ADR-0186
 * §8): le toglie una bonifica, non un salvataggio.
 */
export const replaceAthleteMembershipSet = async (
  scope: MembershipScope,
  athleteId: string,
  rows: readonly MembershipRowInput[],
  attore: Attore = {},
  options: { request?: Request | null; client?: any; expectedRowIds?: readonly unknown[] | null } = {},
): Promise<{ rows: RigaArchivio[]; changed: boolean; athlete: { category_id: string | null; category_name: string | null; data: Record<string, unknown> } }> => {
  const organizationId = requireOrganization(scope);
  await assertCanWrite(scope, athleteId);
  const [atleta] = await caricaAtleti(organizationId, scope, [athleteId]);
  const [index, catalogo] = await Promise.all([loadMembershipTargetIndex(organizationId), loadClubCategoryCatalog(organizationId)]);

  const configurate = new Set(catalogo.map((voce) => asText(voce.id).toLowerCase()));
  /*
    Ogni riga si risolve sul catalogo con il vaglio del server (ADR-0186 §1):
    l'identificativo, o un nome che ne nomina una sola. Senza il
    normalizzatore: qui nessuno promuove una primaria che il chiamante non
    ha dichiarato. Due righe sulla stessa categoria si fondono nella prima.
  */
  const richieste: PlannedMembership[] = [];
  for (const riga of rows) {
    const riferimento = { categoryId: riga.categoryId ?? riga.category_id, categoryName: riga.categoryName ?? riga.category_name };
    if (!asText(riferimento.categoryId) && !asText(riferimento.categoryName)) continue;
    const canonico = canonicalizeCategoryReferenceForWrite(riferimento, catalogo, "Appartenenza a una categoria");
    const chiave = canonico.categoryId.toLowerCase();
    const gia = richieste.find((r) => r.categoryId.toLowerCase() === chiave);
    const isPrimary = Boolean(riga.isPrimary ?? riga.is_primary);
    const siteId = asText(riga.siteId ?? riga.site_id);
    if (gia) {
      if (isPrimary) gia.isPrimary = true;
      if (siteId && !gia.siteId) gia.siteId = siteId;
      continue;
    }
    const nomeDiCatalogo = catalogo.find((voce) => asText(voce.id).toLowerCase() === chiave)?.name;
    richieste.push({
      categoryId: canonico.categoryId,
      categoryName: asText(nomeDiCatalogo) || canonico.categoryName,
      storedCategoryName: asText(riga.storedCategoryName ?? riga.stored_category_name) || undefined,
      isPrimary,
      siteId,
      rowId: null,
    });
  }
  if (richieste.filter((r) => r.isPrimary).length > 1) {
    throw new Error("Appartenenze: al massimo una categoria primaria per atleta");
  }

  const esegui = async (tx: any) => {
    await bloccaSchede(tx, [atleta.id]);
    const correnti = (await caricaRighe(tx, organizationId, [atleta.id])).get(atleta.id) || [];
    const before = daArchivio(correnti);
    /*
      Chi manda l'insieme dice quali righe aveva letto: se nel frattempo
      un altro le ha cambiate (un cambio in blocco, un'altra scheda aperta),
      l'insieme stantio non sovrascrive la modifica dell'altro (D2).
    */
    if (Array.isArray(options.expectedRowIds)) {
      const attesi = new Set(options.expectedRowIds.map(asText).filter(Boolean));
      const attuali = new Set(correnti.map((r) => asText(r.id)));
      const diversi = attesi.size !== attuali.size || [...attesi].some((id) => !attuali.has(id));
      if (diversi) {
        throw new Error("Le categorie di questo atleta sono cambiate nel frattempo: ricaricare la scheda e ripetere la modifica");
      }
    }

    const correntiPerChiave = new Map(correnti.map((r) => [asText(r.category_id).toLowerCase(), r] as const));
    const after: PlannedMembership[] = richieste.map((m) => {
      const chiave = asText(m.categoryId).toLowerCase();
      const corrente = correntiPerChiave.get(chiave);
      if (configurate.size && !configurate.has(chiave) && !corrente) {
        throw new Error(`Appartenenza a una categoria: «${m.categoryName || m.categoryId}» non identifica una categoria del club`);
      }
      /*
        La sede si deriva dalla squadra: una riga **nuova** senza sede, su una
        categoria con una squadra sola configurata, va in quella. Una riga
        che c'era gia senza sede resta com'e: il salvataggio non e una
        bonifica (ADR-0185 §8), e la sistema chi la sceglie.
      */
      const candidate = index.forCategory(m.categoryId);
      const siteId =
        m.siteId ||
        (corrente
          ? /* Una riga che c'e gia e arriva senza sede tiene la sua: la sede non e un campo da azzerare, e derivata. */
            asText(corrente.site_id)
          : candidate.length === 1 && !candidate[0].implicit
            ? candidate[0].siteId
            : "");
      return {
        categoryId: m.categoryId,
        categoryName: m.categoryName,
        /* Il nome com'era sulla riga si conserva (ADR-0185 §8); una riga nuova nasce con il nome corrente. */
        storedCategoryName: corrente ? asText(corrente.category_name) || undefined : m.storedCategoryName || m.categoryName,
        isPrimary: m.isPrimary,
        siteId,
        rowId: corrente?.id ?? null,
      };
    });
    /* Le righe storiche che il catalogo non conosce e che l'elenco tace restano (ADR-0186 §8). */
    const nominate = new Set(after.map((r) => r.categoryId.toLowerCase()));
    for (const riga of before) {
      const chiave = riga.categoryId.toLowerCase();
      if (!nominate.has(chiave) && configurate.size && !configurate.has(chiave)) {
        after.push({ ...riga, isPrimary: after.some((r) => r.isPrimary) ? false : riga.isPrimary });
      }
    }
    if (after.filter((r) => r.isPrimary).length > 1) {
      throw new Error("Appartenenze: al massimo una categoria primaria per atleta");
    }
    assertPlacementsAreCanonical(index, after, before);
    for (const riga of righeCheCambiano(after, before)) {
      assertMembershipWithinAccessScope(scope as never, { site_id: riga.siteId || null, category_id: riga.categoryId });
    }
    const esito = await scriviAppartenenze(tx, organizationId, atleta.id, correnti, after, configurate);
    const scheda = await tx.athlete.findUnique({ where: { id: atleta.id }, select: { category_id: true, category_name: true, data: true } });
    return { esito, before, scheda };
  };

  const { esito, before, scheda } = options.client
    ? await esegui(options.client)
    : await prisma.$transaction(esegui, { timeout: 20_000, maxWait: 10_000 });

  if (esito.cambiata) {
    const dopo = daArchivio(esito.righe);
    await recordAuditEvent({
      action: AUDIT_ACTIONS.athleteMembershipsChanged,
      actorUserId: attore.userId || scope.userId || null,
      actorEmail: attore.email || null,
      actorRole: scope.activeRole || null,
      organizationId,
      resource: "athletes",
      resourceId: atleta.id,
      request: options.request || undefined,
      metadata: {
        operation: "replace",
        before: before.map((r) => ({ categoryId: r.categoryId, isPrimary: r.isPrimary, siteId: r.siteId || null })),
        after: dopo.map((r) => ({ categoryId: r.categoryId, isPrimary: r.isPrimary, siteId: r.siteId || null })),
      },
    });
  }
  return {
    rows: esito.righe,
    changed: esito.cambiata,
    /* La proiezione come l'ha scritta il writer: il client la riporta sulla scheda invece di ricalcolarla (D2/B5). */
    athlete: {
      category_id: scheda?.category_id ?? null,
      category_name: scheda?.category_name ?? null,
      data: scheda?.data && typeof scheda.data === "object" && !Array.isArray(scheda.data) ? (scheda.data as Record<string, unknown>) : {},
    },
  };
};
