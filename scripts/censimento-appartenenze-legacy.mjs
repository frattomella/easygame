/**
 * **Censimento delle appartenenze storiche. Legge e basta: non scrive niente.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * `athlete_category_memberships` porta righe con `category_id` che non e un
 * identificativo ma un'**etichetta** — `"Pulcini - S. Cosma"`, `"Aquilotti"`,
 * `"Under 15 Gold"` — scritte da un difetto gia corretto (N1: la proiezione
 * `athletes.category_id` trattata come sesta sorgente e poi riscritta come
 * riga vera). Il lettore le riconosce e non ne fa piu categorie né secondarie
 * fantasma (ADR-0185), ma le righe restano in archivio, e prima o poi vanno
 * bonificate.
 *
 * Questo file dice **riga per riga** che cosa sono e verso quale categoria
 * vera puntano, con quale grado di certezza. Non decide e non ripara.
 *
 * ## Cosa fa
 *
 * Per ogni club (o per il club indicato) legge catalogo, sedi, gruppi e
 * atleti; costruisce il catalogo con le stesse funzioni della Web
 * (`buildClubCategoryOptions`) e chiede al normalizzatore quali riferimenti
 * **non** sono diventati appartenenze
 * (`collectDanglingAthleteCategoryReferences`). Poi classifica:
 *
 * * `DETERMINISTIC` — il riferimento risolve a **una sola** categoria del
 *   catalogo, per nome corrente o per alias appreso dalle righe gemelle
 *   (`{ id vero, category_name stantio }`); oppure e la copia con il solo
 *   nome di una riga identificata dello stesso atleta;
 * * `AMBIGUOUS` — il nome ne nomina due (due «Pulcini» su due sedi):
 *   nessuna migrazione automatica puo scegliere;
 * * `UNRESOLVABLE` — il catalogo non lo conosce con nessun nome.
 *
 * ```bash
 * node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *   scripts/censimento-appartenenze-legacy.mjs [--club <organization_id>]
 * ```
 *
 * ## Cosa NON fa
 *
 * Nessuna `UPDATE`, nessuna `DELETE`. Una bonifica e una scrittura di massa e
 * richiede autorizzazione esplicita (CLAUDE.md §8); questo censimento e cio
 * che serve per chiederla con i numeri in mano.
 */

import { PrismaClient } from "@prisma/client";

import { buildClubCategoryOptions } from "../src/lib/category-utils.ts";
import {
  collectDanglingAthleteCategoryReferences,
  normalizeAthleteCategoryMemberships,
} from "../src/lib/athlete-category-memberships.ts";
import { resolveCategoryReference } from "../src/lib/categories/identity.ts";

const URL_SCELTA = String(
  process.env.DIAGNOSI_DATABASE_URL || process.env.DATABASE_URL || "",
).trim();

if (!URL_SCELTA) {
  console.error("Nessuna connection string: DIAGNOSI_DATABASE_URL o DATABASE_URL.");
  process.exit(1);
}

const senzaSegreti = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(connection string non interpretabile)";
  }
};

const argomenti = process.argv.slice(2);
const indiceClub = argomenti.indexOf("--club");
const CLUB_RICHIESTO = indiceClub >= 0 ? String(argomenti[indiceClub + 1] || "") : "";

const prisma = new PrismaClient({ datasources: { db: { url: URL_SCELTA } } });

const normalizza = (value) => String(value ?? "").trim().toLowerCase();

const classifica = (riferimento, catalogo, righeIdentificateDelloStessoAtleta) => {
  /* La copia con il solo nome di una riga identificata dello stesso atleta. */
  const gemella = righeIdentificateDelloStessoAtleta.find(
    (riga) =>
      normalizza(riga.storedCategoryName) === normalizza(riferimento.categoryId) ||
      normalizza(riga.categoryName) === normalizza(riferimento.categoryId),
  );
  if (gemella) {
    return {
      classe: "DETERMINISTIC",
      confidenza: "HIGH",
      target: gemella.categoryId,
      perche: `copia con il solo nome della riga identificata ${gemella.categoryId} dello stesso atleta`,
    };
  }

  const risolto = resolveCategoryReference(
    riferimento.categoryId,
    riferimento.storedCategoryName || riferimento.categoryName,
    catalogo,
  );

  if (risolto?.known) {
    return {
      classe: "DETERMINISTIC",
      confidenza: "MEDIUM",
      target: risolto.id,
      perche: "risolve a una sola categoria del catalogo, per nome corrente o per alias appreso dalle righe gemelle di altri atleti",
    };
  }

  if (risolto?.ambiguous) {
    return {
      classe: "AMBIGUOUS",
      confidenza: "NONE",
      target: "",
      perche: "il nome ne nomina due nel catalogo (ADR-0155)",
    };
  }

  return {
    classe: "UNRESOLVABLE",
    confidenza: "NONE",
    target: "",
    perche: "nessuna categoria del catalogo risponde a questo nome",
  };
};

const clubs = await prisma.club.findMany({
  where: CLUB_RICHIESTO ? { id: CLUB_RICHIESTO } : {},
  select: { id: true, name: true, categories: true, club_sites: true, category_groups: true },
  orderBy: { name: "asc" },
});

console.log(`Database: ${senzaSegreti(URL_SCELTA)} — sola lettura`);

const totali = { DETERMINISTIC: 0, AMBIGUOUS: 0, UNRESOLVABLE: 0 };

for (const club of clubs) {
  const [risorse, atleti] = await Promise.all([
    prisma.clubResourceItem.findMany({
      where: { organization_id: club.id, resource_type: "categories" },
      orderBy: { created_at: "asc" },
      select: { id: true, name: true, payload: true },
    }),
    prisma.athlete.findMany({
      where: { organization_id: club.id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        category_id: true,
        category_name: true,
        data: true,
        category_memberships: {
          select: { id: true, category_id: true, category_name: true, is_primary: true, site_id: true },
        },
      },
    }),
  ]);

  const resourceCategories = risorse.map((item) => ({
    ...(item.payload && typeof item.payload === "object" ? item.payload : {}),
    id: item.payload?.id || item.id,
    name: item.payload?.name || item.name,
  }));

  const catalogo = buildClubCategoryOptions({
    clubCategories: club.categories,
    resourceCategories,
    athletes: atleti,
  });
  const configurate = catalogo.filter((voce) => voce.configured !== false);
  if (configurate.length === 0) continue;

  const righe = [];
  for (const atleta of atleti) {
    const pendenti = collectDanglingAthleteCategoryReferences(atleta, catalogo);
    const righeGrezzeSoloNome = atleta.category_memberships.filter(
      (riga) => normalizza(riga.category_id) === normalizza(riga.category_name) ||
        !configurate.some((voce) => normalizza(voce.id) === normalizza(riga.category_id)),
    );
    if (pendenti.length === 0 && righeGrezzeSoloNome.length === 0) continue;

    const identificate = normalizeAthleteCategoryMemberships(atleta, catalogo);

    for (const riga of righeGrezzeSoloNome) {
      const esito = classifica(
        { categoryId: riga.category_id, categoryName: riga.category_name, storedCategoryName: riga.category_name },
        catalogo,
        identificate,
      );
      totali[esito.classe] += 1;
      righe.push({
        atleta: `${atleta.last_name} ${atleta.first_name}`.trim(),
        athlete_id: atleta.id,
        riga: riga.id,
        campo: "athlete_category_memberships.category_id",
        valore: riga.category_id,
        primaria: riga.is_primary,
        ...esito,
      });
    }

    const colonna = String(atleta.category_id || "").trim();
    if (colonna && !configurate.some((voce) => normalizza(voce.id) === normalizza(colonna))) {
      const esito = classifica(
        { categoryId: colonna, categoryName: atleta.category_name, storedCategoryName: atleta.category_name },
        catalogo,
        identificate,
      );
      totali[esito.classe] += 1;
      righe.push({
        atleta: `${atleta.last_name} ${atleta.first_name}`.trim(),
        athlete_id: atleta.id,
        riga: "(colonna)",
        campo: "athletes.category_id",
        valore: colonna,
        primaria: true,
        ...esito,
      });
    }
  }

  if (righe.length === 0) continue;

  console.log(`\n=== ${club.name} (${club.id}) — ${righe.length} riferimenti storici`);
  const perValore = new Map();
  for (const riga of righe) {
    const chiave = `${riga.valore} → ${riga.classe}${riga.target ? ` ${riga.target}` : ""}`;
    perValore.set(chiave, (perValore.get(chiave) || 0) + 1);
  }
  for (const [chiave, quante] of Array.from(perValore.entries()).sort()) {
    console.log(`  ${String(quante).padStart(4)}  ${chiave}`);
  }

  if (argomenti.includes("--righe")) {
    for (const riga of righe) {
      console.log(
        `  LEGACY ROW ${riga.riga} | ATHLETE ${riga.atleta} (${riga.athlete_id}) | FIELD ${riga.campo} | ` +
          `CURRENT ${JSON.stringify(riga.valore)} | PRIMARY ${riga.primaria} | ${riga.classe} (${riga.confidenza}) ` +
          `→ ${riga.target || "—"} | ${riga.perche}`,
      );
    }
  }
}

console.log(
  `\nTotale: DETERMINISTIC ${totali.DETERMINISTIC}, AMBIGUOUS ${totali.AMBIGUOUS}, UNRESOLVABLE ${totali.UNRESOLVABLE}. Nessun dato toccato.`,
);

await prisma.$disconnect();
