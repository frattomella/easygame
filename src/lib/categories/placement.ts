/**
 * **La collocazione di un'appartenenza: da dove viene la sede** (ADR-0194).
 *
 * Un atleta non sceglie una sede: sceglie una **squadra**, e la squadra e
 * la coppia (categoria, sede) che il club ha configurato come gruppo
 * operativo (`clubs.category_groups`, ADR-0055 / ADR-0185). La sede di
 * un'appartenenza si **deriva** da quella coppia, e una coppia che il club
 * non ha configurato non e una scelta: «Pulcini · S. Cosma» con la sede
 * Scauri non esiste, e non si scrive.
 *
 * Questo modulo e puro e ha un compito solo: dire quali sono le collocazioni
 * **scegliibili** di un club e riconoscere in quale di esse cade
 * un'appartenenza. Lo consumano il selettore di ogni scheda (creazione,
 * modifica, cambio in blocco, prova, iscrizione online, import) e il vaglio
 * del server: una regola sola, non dieci `resolveSite()` sparsi.
 *
 * Tre risposte, e ognuna e un fatto diverso:
 *
 * - `resolved`: l'appartenenza cade su una collocazione del club — la sede e
 *   quella del gruppo;
 * - `no_site_configured`: la categoria non ha gruppi operativi e
 *   l'appartenenza non dichiara una sede — e il club mono-sede, o il dato
 *   precedente alle sedi; niente da derivare e niente di sbagliato;
 * - `unresolved`: la coppia non esiste — la sede non e del club, la categoria
 *   ha i suoi gruppi altrove, o la categoria non e nel catalogo. Si mostra
 *   con un nome onesto (`UNKNOWN_SITE_LABEL`, «Sede non assegnata»), e non si
 *   sceglie.
 */

import {
  buildCategoryDisplayIndex,
  CATEGORY_SITE_SEPARATOR,
  UNKNOWN_SITE_LABEL,
  type CategoryDisplayEntry,
  type SiteDisplayEntry,
} from "@/lib/categories/display";
import { normalizeCategoryToken } from "@/lib/categories/identity";

const trim = (value: unknown) => String(value ?? "").trim();

/**
 * Una collocazione scegliibile: la squadra concreta. L'identificativo e
 * quello del gruppo operativo (`group:<categoria>:<sede>`, o `group:<categoria>`
 * per la categoria senza sedi), lo stesso che usano elenchi e allenamenti.
 */
export type MembershipTarget = {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly siteId: string;
  readonly siteName: string;
  /** «Pulcini · S. Cosma», o il nome nudo quando la categoria non ha sedi. */
  readonly label: string;
  /** Vero quando il gruppo e dedotto dalla sola categoria (nessuna sede configurata). */
  readonly implicit: boolean;
};

export type PlacementGroupLike = {
  categoryId?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  active?: boolean;
};

export type PlacementCategoryLike = CategoryDisplayEntry & {
  configured?: boolean | null;
};

export type MembershipPlacement =
  | { readonly status: "resolved"; readonly target: MembershipTarget }
  | {
      readonly status: "no_site_configured";
      readonly categoryId: string;
      readonly categoryName: string;
    }
  | {
      readonly status: "unresolved";
      readonly reason: "unknown_category" | "unknown_site" | "site_not_configured_for_category" | "category_without_sites";
      readonly categoryId: string;
      readonly categoryName: string;
      readonly siteId: string;
      /** Il nome della sede se il club la conosce, altrimenti `UNKNOWN_SITE_LABEL`. */
      readonly siteName: string;
    };

export type MembershipTargetIndex = {
  readonly targets: readonly MembershipTarget[];
  /** Le collocazioni di una categoria (vuoto se la categoria non e configurata). */
  readonly forCategory: (categoryId: unknown) => readonly MembershipTarget[];
  /** La collocazione con questo identificativo di gruppo, se scegliibile. */
  readonly byId: (targetId: unknown) => MembershipTarget | null;
  /** Dove cade un'appartenenza (categoria + sede), e perche. */
  readonly place: (membership: { categoryId?: unknown; siteId?: unknown; categoryName?: unknown }) => MembershipPlacement;
  /** Il nome leggibile di una sede del club, o `UNKNOWN_SITE_LABEL`; vuoto per la sede vuota. */
  readonly siteName: (siteId: unknown) => string;
  /**
   * Riconosce un'etichetta scritta a mano («Pulcini · S. Cosma», «Pulcini»)
   * come collocazione: serve all'import e alla modulistica, che ricevono
   * testo. Un'etichetta che ne nomina due non ne nomina nessuna
   * (`ambiguous`); una che non nomina niente e `null`.
   */
  readonly fromLabel: (label: unknown) => { target: MembershipTarget | null; ambiguous: boolean };
};

const buildTargetId = (categoryId: string, siteId: string) =>
  siteId ? `group:${categoryId}:${siteId}` : `group:${categoryId}`;

/**
 * Le collocazioni scegliibili di un club: una per ogni gruppo operativo
 * attivo, e — per le categorie configurate senza gruppi — una per categoria,
 * senza sede. Le voci `configured: false` del catalogo (nate solo da una
 * scheda) non entrano: non si sceglie fra cio che il club non ha (ADR-0185 §4).
 * Un gruppo disattivato non e una scelta (§33.14).
 */
export const buildMembershipTargetIndex = ({
  categories = [],
  groups = [],
  sites = [],
}: {
  categories?: readonly PlacementCategoryLike[];
  groups?: readonly PlacementGroupLike[];
  sites?: readonly SiteDisplayEntry[];
}): MembershipTargetIndex => {
  const configurate = (Array.isArray(categories) ? categories : []).filter(
    (voce) => trim(voce?.id) && voce?.configured !== false,
  );
  const display = buildCategoryDisplayIndex({ categories: configurate, groups, sites });

  const nomiSedi = new Map<string, string>();
  for (const site of Array.isArray(sites) ? sites : []) {
    const id = trim(site?.id);
    const nome = trim(site?.name);
    if (id) nomiSedi.set(id, nome);
  }
  const nomeSede = (siteId: unknown) => {
    const id = trim(siteId);
    if (!id) return "";
    return nomiSedi.get(id) || UNKNOWN_SITE_LABEL;
  };

  const perCategoria = new Map<string, MembershipTarget[]>();
  const perId = new Map<string, MembershipTarget>();
  const idsCategorie = new Map<string, PlacementCategoryLike>();
  for (const voce of configurate) idsCategorie.set(normalizeCategoryToken(voce.id), voce);

  const aggiungi = (target: MembershipTarget) => {
    if (perId.has(target.id)) return;
    perId.set(target.id, target);
    const chiave = normalizeCategoryToken(target.categoryId);
    const bucket = perCategoria.get(chiave) || [];
    bucket.push(target);
    perCategoria.set(chiave, bucket);
  };

  for (const group of Array.isArray(groups) ? groups : []) {
    if (group?.active === false) continue;
    const categoria = idsCategorie.get(normalizeCategoryToken(group?.categoryId));
    if (!categoria) continue;
    const siteId = trim(group?.siteId);
    if (!siteId) continue;
    const categoryId = trim(categoria.id);
    const categoryName = trim(categoria.name) || categoryId;
    /* Il nome del gruppo, se il catalogo delle sedi non lo porta: e l'evidenza che il gruppo aveva. */
    const siteName = nomiSedi.get(siteId) || trim(group?.siteName) || UNKNOWN_SITE_LABEL;
    aggiungi({
      id: buildTargetId(categoryId, siteId),
      categoryId,
      categoryName,
      siteId,
      siteName,
      label: `${categoryName}${CATEGORY_SITE_SEPARATOR}${siteName}`,
      implicit: false,
    });
  }

  for (const voce of configurate) {
    const categoryId = trim(voce.id);
    if (perCategoria.has(normalizeCategoryToken(categoryId))) continue;
    const categoryName = trim(voce.name) || categoryId;
    aggiungi({
      id: buildTargetId(categoryId, ""),
      categoryId,
      categoryName,
      siteId: "",
      siteName: "",
      /* Senza sede l'etichetta e quella del catalogo: la sede compare solo se serve a distinguere (ADR-0185 §2). */
      label: display.label(categoryId),
      implicit: true,
    });
  }

  const ordinati = Array.from(perId.values()).sort(
    (a, b) =>
      a.categoryName.localeCompare(b.categoryName, "it", { sensitivity: "base" }) ||
      a.siteName.localeCompare(b.siteName, "it", { sensitivity: "base" }),
  );

  const forCategory = (categoryId: unknown) =>
    perCategoria.get(normalizeCategoryToken(categoryId)) || [];

  const place = (membership: { categoryId?: unknown; siteId?: unknown; categoryName?: unknown }): MembershipPlacement => {
    const categoryId = trim(membership?.categoryId);
    const siteId = trim(membership?.siteId);
    const categoria = idsCategorie.get(normalizeCategoryToken(categoryId));
    const categoryName = trim(categoria?.name) || trim(membership?.categoryName) || categoryId;
    if (!categoria) {
      return { status: "unresolved", reason: "unknown_category", categoryId, categoryName, siteId, siteName: nomeSede(siteId) };
    }
    const candidate = forCategory(categoryId);
    const trovato = candidate.find((target) => target.siteId === siteId);
    if (trovato) {
      return trovato.implicit
        ? { status: "no_site_configured", categoryId: trovato.categoryId, categoryName: trovato.categoryName }
        : { status: "resolved", target: trovato };
    }
    if (!siteId) {
      /* La categoria ha le sue sedi e l'appartenenza non ne dichiara nessuna: «Sede non assegnata». */
      return { status: "unresolved", reason: "category_without_sites", categoryId, categoryName, siteId, siteName: "" };
    }
    if (!nomiSedi.has(siteId)) {
      return { status: "unresolved", reason: "unknown_site", categoryId, categoryName, siteId, siteName: UNKNOWN_SITE_LABEL };
    }
    return {
      status: "unresolved",
      reason: "site_not_configured_for_category",
      categoryId,
      categoryName,
      siteId,
      siteName: nomeSede(siteId),
    };
  };

  const fromLabel = (label: unknown) => {
    const testo = normalizeCategoryToken(label);
    if (!testo) return { target: null, ambiguous: false };
    const esatte = ordinati.filter((target) => normalizeCategoryToken(target.label) === testo);
    if (esatte.length === 1) return { target: esatte[0], ambiguous: false };
    if (esatte.length > 1) return { target: null, ambiguous: true };
    /* Il solo nome della categoria: vale se nomina una categoria sola con una collocazione sola. */
    const perNome = ordinati.filter((target) => normalizeCategoryToken(target.categoryName) === testo);
    if (perNome.length === 1) return { target: perNome[0], ambiguous: false };
    return { target: null, ambiguous: perNome.length > 1 };
  };

  return {
    targets: ordinati,
    forCategory,
    byId: (targetId) => perId.get(trim(targetId)) || null,
    place,
    siteName: nomeSede,
    fromLabel,
  };
};

/**
 * L'etichetta con cui si **legge** un'appartenenza: «Pulcini · S. Cosma»
 * quando la sede c'e, il nome quando non c'e, «Sede non disponibile» quando
 * la sede e un identificativo che il club non sa leggere. Mai un
 * identificativo grezzo (ADR-0185 §2, §33.13).
 */
export const describeMembershipPlacement = (placement: MembershipPlacement) => {
  if (placement.status === "resolved") {
    return { label: placement.target.label, siteName: placement.target.siteName, valid: true };
  }
  if (placement.status === "no_site_configured") {
    return { label: placement.categoryName, siteName: "", valid: true };
  }
  const siteName = placement.siteId ? placement.siteName : "";
  return {
    label: siteName ? `${placement.categoryName}${CATEGORY_SITE_SEPARATOR}${siteName}` : placement.categoryName,
    siteName,
    valid: false,
  };
};

/**
 * La ragione, in italiano, per cui una collocazione non e scegliibile.
 */
export const explainUnresolvedPlacement = (
  placement: Extract<MembershipPlacement, { status: "unresolved" }>,
) => {
  switch (placement.reason) {
    case "unknown_category":
      return `«${placement.categoryName}» non e una categoria del club`;
    case "unknown_site":
      return `la sede indicata per «${placement.categoryName}» non esiste nel club`;
    case "category_without_sites":
      return `«${placement.categoryName}» si svolge in una sede precisa: indicare quale`;
    default:
      return `«${placement.categoryName}» non si svolge nella sede «${placement.siteName}»: scegliere una squadra del club`;
  }
};
