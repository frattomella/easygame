/**
 * **Il vaglio del server su cio che si scrive come categoria.**
 *
 * D-RD-17, revisione dei writer. Il difetto di Fortitudo — 213 righe di
 * `athlete_category_memberships` con l'**etichetta** al posto
 * dell'identificativo, bonificate da D-RD-16 — e nato da writer che hanno
 * persistito cio che ricevevano. Il registro generico (`resources.ts`) e la
 * porta da cui passano tutti: la Web corrente, il redesign, l'import, la
 * scheda dell'allenatore, i moduli di iscrizione. Qui si controlla una volta,
 * per tutti.
 *
 * ## La regola
 *
 * 1. Il catalogo del club e `club_resource_items` con
 *    `resource_type = 'categories'` (con `clubs.categories` di riserva). Se e
 *    **vuoto**, il club lavora con i soli nomi e il nome e l'identita
 *    (ADR-0185 §9): non c'e niente con cui confrontare, e si passa.
 * 2. Con il catalogo in mano, il riferimento si risolve con
 *    `resolveCategoryReference` (ADR-0155): l'identificativo, o un nome che
 *    ne nomina **una sola**. Risolto → si scrive **l'identificativo**, mai
 *    l'etichetta.
 * 3. Un nome che ne nomina due, o che nessuna voce riconosce, **non si
 *    scrive**: l'errore torna a chi chiama, e la riga non nasce.
 *
 * ## Cosa non fa
 *
 * Non tocca `category_name`: e il nome com'era, e resta al writer decidere
 * se conservarlo (ADR-0185 §8). Non conosce le sedi: `site_id` e un altro
 * asse. Non riscrive cio che era gia in archivio: sulla colonna
 * `athletes.category_id` un valore **uguale a quello esistente** passa, cosi
 * un club non ancora bonificato continua a salvare le schede (il difetto
 * vecchio non peggiora, e la bonifica e un passo a se).
 */

import { prisma } from "./prisma";
import { buildClubCategoryOptions } from "@/lib/category-utils";
import { resolveCategoryReference } from "@/lib/categories/identity";

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Il catalogo **configurato** del club: le voci con un identificativo. Le
 * voci derivate dagli atleti non entrano: sono cio che la bonifica toglie,
 * non un'identita con cui scrivere.
 */
export const loadClubCategoryCatalog = async (organizationId: string) => {
  const id = asText(organizationId);
  if (!id) return [];

  const [club, items] = await Promise.all([
    prisma.club.findUnique({ where: { id }, select: { categories: true } }),
    prisma.clubResourceItem.findMany({
      where: { organization_id: id, resource_type: "categories" },
      select: { payload: true, name: true, id: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const resourceCategories = items.map((item) => {
    const payload =
      item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
        ? (item.payload as Record<string, unknown>)
        : {};
    return {
      ...payload,
      id: asText(payload.id) || item.id,
      name: asText(payload.name) || asText(item.name),
    };
  });

  return buildClubCategoryOptions({
    clubCategories: Array.isArray(club?.categories) ? (club!.categories as unknown[]) : [],
    resourceCategories,
  }).filter((voce) => voce.configured !== false);
};

export type CanonicalCategoryReference = {
  categoryId: string;
  categoryName: string;
};

/**
 * Il riferimento **canonico** da scrivere, o un errore che spiega perche non
 * si scrive. `categoryName` e il nome che il chiamante ha dato, o quello del
 * catalogo se non ne ha dato nessuno.
 */
export const canonicalizeCategoryReferenceForWrite = (
  reference: { categoryId?: unknown; categoryName?: unknown },
  catalogo: readonly { id?: string | null; name?: string | null }[],
  contesto: string,
): CanonicalCategoryReference => {
  const categoryId = asText(reference.categoryId);
  const categoryName = asText(reference.categoryName);

  if (!categoryId && !categoryName) {
    throw new Error(`${contesto}: la categoria non e indicata`);
  }

  /* Club senza catalogo: il nome e l'identita, si scrive com'e. */
  if (!catalogo.length) {
    return { categoryId: categoryId || categoryName, categoryName: categoryName || categoryId };
  }

  const risolto = resolveCategoryReference(categoryId, categoryName, catalogo);

  if (risolto?.ambiguous) {
    throw new Error(
      `${contesto}: «${categoryName || categoryId}» nomina piu di una categoria del club, indicare l'identificativo`,
    );
  }

  if (!risolto?.known) {
    throw new Error(
      `${contesto}: «${categoryName || categoryId}» non identifica una categoria del club`,
    );
  }

  return {
    categoryId: risolto.id,
    categoryName: categoryName || risolto.name,
  };
};

/**
 * Il vaglio sulla riga di `athlete_category_memberships` che sta per essere
 * scritta: riscrive `category_id` con l'identificativo vero, o rifiuta.
 */
export const assertMembershipCategoryIsCanonical = async (
  organizationId: string,
  riga: Record<string, any>,
) => {
  /*
    Si vaglia **l'identificativo che arriva**. Una modifica che porta solo il
    nome o la sede (`{ site_id, category_name }`) non cambia identita: non si
    risolve il nome da solo, che su due omonime rifiuterebbe una riga
    legittima o la sposterebbe su un'altra categoria (revisione ostile B8).
  */
  if (riga.category_id === undefined) return;

  const catalogo = await loadClubCategoryCatalog(organizationId);
  const canonico = canonicalizeCategoryReferenceForWrite(
    { categoryId: riga.category_id, categoryName: riga.category_name },
    catalogo,
    "Appartenenza a una categoria",
  );

  riga.category_id = canonico.categoryId;
  if (riga.category_name === undefined || riga.category_name === null || asText(riga.category_name) === "") {
    riga.category_name = canonico.categoryName;
  }
};

/**
 * Il vaglio sulla colonna `athletes.category_id`: e una proiezione della
 * primaria, ma e anche cio che un lettore senza righe legge come identita
 * (C2). Un valore nuovo si canonizza o si rifiuta; un valore **uguale a
 * quello in archivio** passa, per non bloccare le schede di un club che
 * aspetta ancora la sua bonifica.
 */
export const assertAthleteCategoryColumnIsCanonical = async (
  organizationId: string,
  riga: Record<string, any>,
  esistente?: { category_id?: string | null } | null,
) => {
  if (riga.category_id === undefined) return;
  const valore = asText(riga.category_id);
  if (!valore) return;
  if (esistente && asText(esistente.category_id) === valore) return;

  const catalogo = await loadClubCategoryCatalog(organizationId);
  const canonico = canonicalizeCategoryReferenceForWrite(
    { categoryId: riga.category_id, categoryName: riga.category_name },
    catalogo,
    "Categoria dell'atleta",
  );

  riga.category_id = canonico.categoryId;
  if (asText(riga.category_name) === "") {
    riga.category_name = canonico.categoryName;
  }
};

/**
 * La proiezione in `athletes.data` (`category`, `categoryId`, `category_id`,
 * `categoryMemberships[]`, `category_memberships[]`) segue la stessa regola
 * della colonna: con il catalogo in mano un riferimento si scrive canonico o
 * non si scrive. Per un atleta **senza righe** la proiezione e cio che il
 * lettore usa come sorgente (C2), e un'etichetta li dentro sarebbe
 * un'identita a tutti gli effetti (revisione ostile B11/C11). Un valore
 * **uguale a quello in archivio** passa, come per la colonna.
 */
export const assertAthleteDataProjectionIsCanonical = async (
  organizationId: string,
  riga: Record<string, any>,
  esistente?: { data?: unknown } | null,
) => {
  const data = riga.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const prima = esistente?.data && typeof esistente.data === "object" && !Array.isArray(esistente.data)
    ? (esistente.data as Record<string, any>)
    : {};

  const chiaviScalari = ["category", "categoryId", "category_id"] as const;
  const elenchi = ["categoryMemberships", "category_memberships"] as const;
  const valoriNuovi: string[] = [];
  for (const chiave of chiaviScalari) {
    const valore = asText((data as any)[chiave]);
    if (valore && asText(prima[chiave]) !== valore) valoriNuovi.push(chiave);
  }
  const vociNuove: Array<Record<string, any>> = [];
  for (const chiave of elenchi) {
    const elenco = (data as any)[chiave];
    if (!Array.isArray(elenco)) continue;
    const primaElenco = Array.isArray(prima[chiave]) ? (prima[chiave] as any[]) : [];
    const giaPresenti = new Set(primaElenco.map((voce) => asText(voce?.category_id ?? voce?.categoryId)));
    for (const voce of elenco) {
      if (!voce || typeof voce !== "object") continue;
      const id = asText(voce.category_id ?? voce.categoryId);
      if (id && !giaPresenti.has(id)) vociNuove.push(voce);
    }
  }
  if (!valoriNuovi.length && !vociNuove.length) return;

  const catalogo = await loadClubCategoryCatalog(organizationId);
  if (!catalogo.length) return;

  for (const chiave of valoriNuovi) {
    const canonico = canonicalizeCategoryReferenceForWrite(
      { categoryId: (data as any)[chiave], categoryName: (data as any).categoryName ?? (data as any).category_name },
      catalogo,
      "Categoria dell'atleta (proiezione)",
    );
    (data as any)[chiave] = canonico.categoryId;
  }
  for (const voce of vociNuove) {
    const canonico = canonicalizeCategoryReferenceForWrite(
      { categoryId: voce.category_id ?? voce.categoryId, categoryName: voce.category_name ?? voce.categoryName },
      catalogo,
      "Appartenenza a una categoria (proiezione)",
    );
    if (voce.category_id !== undefined) voce.category_id = canonico.categoryId;
    if (voce.categoryId !== undefined) voce.categoryId = canonico.categoryId;
  }
};
