import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before } from "node:test";

import {
  UNKNOWN_CATEGORY_LABEL,
  buildCategoryDisplayIndex,
  membershipRoleLabel,
} from "../../src/lib/categories/display.ts";
import {
  buildAthleteCategoryProjection,
  normalizeAthleteCategoryMemberships,
  serializeAthleteMemberships,
} from "../../src/lib/athlete-category-memberships.ts";
import { findCategoryForBirthDate } from "../../src/lib/category-utils.ts";
import { resolveCategoryLabelForTraining } from "../../src/lib/training-utils.ts";
import { canonicalizeCategoryReferenceForWrite } from "../../src/lib/server/category-write-guard.ts";

/*
  D-RD-17 — i residui di ADR-0185 e la revisione dei writer.

  Il difetto di Fortitudo (213 righe con l'etichetta al posto
  dell'identificativo) e stato bonificato da D-RD-16; queste prove impediscono
  che un writer lo riscriva e che una schermata torni a mostrare un
  identificativo o a risolvere due omonime per nome.
*/

const PULCINI_SC = "category-1787321890187-j8liup8";
const PULCINI_SCAURI = "category-1787322040142-mbawy4c";
const AQUILOTTI = "category-1787322161361-2ugcyol";
const CATALOGO = [
  { id: PULCINI_SC, name: "Pulcini", birthYearFrom: 2016, birthYearTo: 2017 },
  { id: PULCINI_SCAURI, name: "Pulcini", birthYearFrom: 2016, birthYearTo: 2017 },
  { id: AQUILOTTI, name: "Aquilotti", birthYearFrom: 2014, birthYearTo: 2015 },
];
const GRUPPI = [
  { id: "g1", categoryId: PULCINI_SC, siteId: "site-sc", siteName: "S. Cosma", active: true },
  { id: "g2", categoryId: PULCINI_SCAURI, siteId: "site-scauri", siteName: "Scauri", active: true },
];

/* ---------- (a) nessun identificativo grezzo a schermo ---------- */

test("(a) un riferimento nudo che il catalogo non conosce e «Categoria non disponibile», mai l'identificativo", () => {
  const indice = buildCategoryDisplayIndex({ categories: CATALOGO, groups: GRUPPI });
  assert.equal(indice.label("category-1757000000000-spari"), UNKNOWN_CATEGORY_LABEL);
  assert.equal(indice.label({ categoryId: "category-1757000000000-spari", categoryName: "Giovanissimi" }), "Giovanissimi", "il nome del chiamante si legge");
  assert.equal(buildCategoryDisplayIndex().label("Under 15"), "Under 15", "senza catalogo il riferimento resta com'e: il club che lavora con i soli nomi");
});

test("(a) l'etichetta di un allenamento passa dall'indice: due omonime con la sede, un riferimento stantio senza identificativo", () => {
  const indice = buildCategoryDisplayIndex({ categories: CATALOGO, groups: GRUPPI });
  assert.equal(
    resolveCategoryLabelForTraining({ categoryId: PULCINI_SC, title: "x" }, CATALOGO, indice),
    "Pulcini · S. Cosma",
  );
  assert.equal(
    resolveCategoryLabelForTraining({ categoryIds: [PULCINI_SC, AQUILOTTI], title: "x" }, CATALOGO, indice),
    "Pulcini · S. Cosma, Aquilotti",
  );
  assert.equal(
    resolveCategoryLabelForTraining({ categoryId: "category-1757000000000-spari", title: "x" }, CATALOGO),
    UNKNOWN_CATEGORY_LABEL,
  );
  assert.equal(
    resolveCategoryLabelForTraining({ category: "Giovanissimi", title: "x" }, []),
    "Giovanissimi",
    "chi chiama senza catalogo per derivare un nome ha ancora il riferimento",
  );
});

test("(a) le schermate non ripiegano piu sul riferimento grezzo", () => {
  const pannello = readFileSync("src/components/dashboard/WeeklyTrainingSchedulePanel.tsx", "utf8");
  assert.match(pannello, /const categoryDisplay = React\.useMemo\(\s*\(\) => buildCategoryDisplayIndex\(\{ categories, groups: groupOptions \}\)/);
  assert.doesNotMatch(pannello, /resolveCategoryLabel\(/, "il pannello non usa piu il risolutore con ripiego grezzo");
  assert.doesNotMatch(pannello, /resolveCategoryLabelForTraining\(item, categories\) \|\|/, "un'etichetta derivata non finisce nello stato del programma");
  const allenatore = readFileSync("src/components/trainer/trainer-weekly-schedule-panel.tsx", "utf8");
  assert.match(allenatore, /const categoryName = categoryLabel\s*\?\s*categoryLabel\(\{/);
});

/* ---------- (b) un nome che ne nomina due non ne nomina nessuna ---------- */

test("(b) la data di nascita non sceglie fra due categorie con la stessa fascia", () => {
  assert.equal(findCategoryForBirthDate("2016-05-01", CATALOGO), null);
  assert.equal(findCategoryForBirthDate("2014-05-01", CATALOGO)?.id, AQUILOTTI);
});

test("(b) l'import atleti segnala la riga ambigua invece di assegnarla, e la riga della modulistica non prende la prima", () => {
  const pagina = readFileSync("src/app/athletes/page.tsx", "utf8");
  assert.doesNotMatch(pagina, /categoryIdByKey\.get\(normalizeCategoryKey\(row\.categoryLabel/, "niente mappa per nome a ultimo-vince");
  assert.match(pagina, /const riferimento = resolveCategoryReference\(\s*row\.categoryId,\s*row\.categoryLabel,\s*currentCategories,\s*\);\s*if \(riferimento\?\.ambiguous\)/);
  assert.match(pagina, /nomina piu squadre/);
  const moduli = readFileSync("src/lib/server/form-submissions.ts", "utf8");
  /* ADR-0194: prima la squadra (categoria · sede) sull'indice delle collocazioni, poi il nome che ne nomina una sola. */
  assert.match(moduli, /options\.targets\.fromLabel\(answeredCategory\)/);
  assert.match(moduli, /resolveCategoryReference\(answeredCategory, answeredCategory, options\.categories\)/);
  assert.doesNotMatch(moduli, /entry\.name\.toLowerCase\(\) === answeredCategory/);
});

/* ---------- (c) il ruolo non e una sede ---------- */

test("(c) «Primaria» / «Secondaria» hanno un elemento loro e non il glifo della sede", () => {
  assert.equal(membershipRoleLabel(true), "Primaria");
  assert.equal(membershipRoleLabel(false), "Secondaria");
  for (const file of [
    "src/components/athletes/profile/v2/AthleteProfileSections.tsx",
    "src/components/athletes/profile/v2/AthleteRecordHeader.tsx",
    "src/components/trainer/trainer-athlete-profile-page.tsx",
    "src/components/athletes/AthleteCategoryAnalyticsSection.tsx",
    "src/components/trainer/trainer-athletes-dashboard-page.tsx",
  ]) {
    const codice = readFileSync(file, "utf8");
    assert.doesNotMatch(codice, /· (Primaria|Secondaria)/, `${file}: il ruolo non usa il separatore della sede`);
    assert.doesNotMatch(codice, /\? "Primaria" : "Secondaria"|\? "Secondaria"\s*: "Primaria"/, `${file}: il testo del ruolo viene dal dominio`);
  }
  assert.match(readFileSync("src/components/categories/category-label.tsx", "utf8"), /export function MembershipRoleBadge/);
});

/* ---------- (d) un indice per la card ---------- */

test("(d) le sezioni V2 costruiscono l'indice una volta e lo passano ai chip", () => {
  for (const file of [
    "src/components/athletes/profile/v2/AthleteProfileSections.tsx",
    "src/components/athletes/profile/v2/AthleteActivitySections.tsx",
  ]) {
    const codice = readFileSync(file, "utf8");
    assert.match(codice, /const categoryDisplay = React\.useMemo\(/, file);
    assert.match(codice, /index=\{categoryDisplay\}/, file);
    assert.doesNotMatch(codice, /categories=\{categoryCatalog\}\s*groups=\{categoryGroups\}/, `${file}: nessun indice ricostruito per chip`);
  }
});

/* ---------- writer: l'etichetta non diventa mai category_id ---------- */

test("writer · il vaglio del server canonizza per nome unico e rifiuta ambiguo e sconosciuto", () => {
  assert.deepEqual(
    canonicalizeCategoryReferenceForWrite({ categoryId: "Aquilotti" }, CATALOGO, "prova"),
    { categoryId: AQUILOTTI, categoryName: "Aquilotti" },
  );
  assert.deepEqual(
    canonicalizeCategoryReferenceForWrite({ categoryId: PULCINI_SC, categoryName: "Pulcini - S. Cosma" }, CATALOGO, "prova"),
    { categoryId: PULCINI_SC, categoryName: "Pulcini - S. Cosma" },
    "il nome storico resta al writer",
  );
  assert.throws(() => canonicalizeCategoryReferenceForWrite({ categoryId: "Pulcini" }, CATALOGO, "prova"), /nomina piu di una categoria/);
  assert.throws(() => canonicalizeCategoryReferenceForWrite({ categoryId: "Pulcini - S. Cosma" }, CATALOGO, "prova"), /non identifica una categoria/);
  assert.deepEqual(
    canonicalizeCategoryReferenceForWrite({ categoryId: "Pulcini" }, [], "prova"),
    { categoryId: "Pulcini", categoryName: "Pulcini" },
    "senza catalogo il nome e l'identita",
  );
});

test("writer · il registro generico passa dal vaglio in creazione e in modifica, per le righe e per la colonna", () => {
  const risorse = readFileSync("src/lib/server/resources.ts", "utf8");
  assert.equal((risorse.match(/await assertMembershipCategoryIsCanonical\(/g) || []).length, 2);
  assert.equal((risorse.match(/await assertAthleteCategoryColumnIsCanonical\(/g) || []).length, 2);
  assert.match(risorse, /if \(resource === "athletes" \|\| resource === "simplified_athletes"\) \{\s*const club = String\([\s\S]*?await assertAthleteCategoryColumnIsCanonical\(club, normalized/);
});

test("writer · la proiezione in athletes.data si deriva 1:1 dalle appartenenze, con una funzione sola", () => {
  const memberships = normalizeAthleteCategoryMemberships(
    [
      { id: "r1", category_id: PULCINI_SC, category_name: "Pulcini - S. Cosma", is_primary: true, site_id: null },
      { id: "r2", category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: false, site_id: "site-x" },
    ],
    CATALOGO,
  );
  const proiezione = buildAthleteCategoryProjection(memberships, { clubId: "club", athleteId: "atleta" });
  assert.equal(proiezione.category, PULCINI_SC);
  assert.equal(proiezione.categoryName, "Pulcini");
  assert.deepEqual(proiezione.categories, ["Pulcini", "Aquilotti"]);
  assert.deepEqual(proiezione.categoryMemberships, serializeAthleteMemberships(memberships, { clubId: "club", athleteId: "atleta" }));
  assert.equal(proiezione.categoryMemberships[0].category_name, "Pulcini - S. Cosma", "il nome com'era sulla riga");
  assert.equal(proiezione.categoryMemberships[1].site_id, "site-x");
  const db = readFileSync("src/lib/simplified-db.ts", "utf8");
  assert.equal((db.match(/\.\.\.buildAthleteCategoryProjection\(normalizedMemberships/g) || []).length, 2, "creazione e modifica scrivono la stessa proiezione");
});

/* ---------- il writer client con il catalogo in mano ---------- */

let risolvi;
before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  const modulo = await import("../../src/lib/simplified-db.ts");
  risolvi = modulo.__resolveRequestedAthleteMembershipsForTests;
});

const atleta = () => ({
  id: "a1",
  category_memberships: [
    { category_id: AQUILOTTI, category_name: "Aquilotti", is_primary: true, site_id: null },
  ],
});

test("writer · un cambio per nome inequivocabile diventa l'identificativo del catalogo, non l'etichetta", () => {
  const atletaSenzaRighe = { id: "a2", category_memberships: [] };
  const risultato = risolvi(atletaSenzaRighe, { category: "Aquilotti" }, CATALOGO);
  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].categoryId, AQUILOTTI);
  assert.equal(risultato[0].isPrimary, true);
});

test("writer · un nome che ne nomina due non tocca niente", () => {
  const risultato = risolvi(atleta(), { category: "Pulcini" }, CATALOGO);
  assert.deepEqual(risultato.map((m) => m.categoryId), [AQUILOTTI]);
});

test("writer · un riferimento che il catalogo non conosce non nasce come riga: si rifiuta", () => {
  assert.throws(() => risolvi(atleta(), { category: "Pulcini - S. Cosma" }, CATALOGO), /non identifica una categoria del club/);
});

test("writer · le appartenenze esplicite si risolvono sul catalogo: l'etichetta storica diventa identificativo", () => {
  const risultato = risolvi(atleta(), {
    categoryMemberships: [
      { category_id: "Aquilotti", category_name: "Aquilotti", is_primary: true },
      { category_id: PULCINI_SCAURI, category_name: "Pulcini", is_primary: false },
    ],
  }, CATALOGO);
  assert.deepEqual(risultato.map((m) => [m.categoryId, m.isPrimary]), [[AQUILOTTI, true], [PULCINI_SCAURI, false]]);
});

test("writer · senza catalogo il comportamento resta quello del club con i soli nomi", () => {
  const risultato = risolvi({ id: "a3", category_memberships: [] }, { category: "Esordienti" });
  assert.equal(risultato[0].categoryId, "Esordienti");
});

test("writer · il client rifiuta prima di cancellare, e carica il catalogo una volta per salvataggio", () => {
  const db = readFileSync("src/lib/simplified-db.ts", "utf8");
  assert.match(db, /const assertMembershipsAreCanonical = \(/);
  assert.match(db, /righeCorrenti: readonly Record<string, any>\[\] = \[\],\n\) => \{[\s\S]{0,200}assertMembershipsAreCanonical\(memberships, catalogo, chiaviCategoria\(correnti\)\);/, "replaceAthleteMemberships controlla prima di scrivere");
  assert.equal((db.match(/await loadCatalogoPerScrittura\(clubId\)/g) || []).length, 3, "creazione, import a scaglioni e modifica");
});

/* ---------- revisione ostile (seconda passata) ---------- */

test("revisione · creare un atleta senza categoria non e una categoria sconosciuta", () => {
  const risultato = risolvi({ id: "nuovo", category_memberships: [] }, { category: null, categoryName: null }, CATALOGO);
  assert.deepEqual(risultato, []);
  const conRighe = risolvi(atleta(), { category: null, categoryName: null }, CATALOGO);
  assert.deepEqual(conRighe.map((m) => m.categoryId), [AQUILOTTI], "le appartenenze correnti restano");
});

test("revisione · un nome uguale al riferimento non e un nome: l'identificativo stantio non esce dalla porta di servizio", () => {
  const indice = buildCategoryDisplayIndex({ categories: CATALOGO, groups: GRUPPI });
  assert.equal(indice.label({ categoryId: "category-OLD", categoryName: "category-OLD" }), UNKNOWN_CATEGORY_LABEL);
  assert.equal(indice.label({ categoryId: "", categoryName: PULCINI_SC }), "Pulcini · S. Cosma", "un nome che e un identificativo del catalogo si risolve come tale");
});

test("revisione · l'etichetta di un allenamento: il nome scritto resta un nome, un'omonima non prende una sede", () => {
  const indice = buildCategoryDisplayIndex({ categories: CATALOGO, groups: GRUPPI });
  assert.equal(resolveCategoryLabelForTraining({ category: "Pulcini", title: "x" }, CATALOGO, indice), "Pulcini", "ambigua: nome nudo, nessuna sede inventata");
  assert.equal(resolveCategoryLabelForTraining({ category: "Giovanissimi", title: "x" }, CATALOGO, indice), "Giovanissimi", "il nome che il modulo ha scritto si legge anche se la categoria non c'e piu");
  assert.equal(resolveCategoryLabelForTraining({ categoryId: "category-OLD", title: "x" }, CATALOGO, indice), UNKNOWN_CATEGORY_LABEL, "un identificativo stantio, senza nome, si dice non disponibile");
  assert.equal(resolveCategoryLabelForTraining({ category: PULCINI_SC, title: "x" }, CATALOGO, indice), "Pulcini · S. Cosma", "un nome che e un identificativo del catalogo si risolve come tale");
});

test("revisione · il writer non cancella cio che il catalogo non conosce e non riscrive la colonna quando non dichiara le appartenenze", () => {
  const db = readFileSync("src/lib/simplified-db.ts", "utf8");
  /* ADR-0194: le righe le scrive il server, per differenza, nella stessa transazione della proiezione. */
  const writer = readFileSync("src/lib/server/athlete-category-memberships.ts", "utf8");
  assert.match(db, /replaceAthleteMembershipsOnServer\(/, "il client manda l'insieme al writer del dominio");
  assert.match(writer, /if \(configurate\.size && !configurate\.has\(chiave\)\) continue;/, "una riga fuori dal catalogo non si cancella da un salvataggio");
  /*
    L'archivio ammette una primaria sola per atleta (indice parziale): l'ordine
    e discesa → cancellazione → inserimento → salita (revisione ostile N1).
  */
  assert.match(writer, /for \(const riga of discese\)[\s\S]*?for \(const riga of cancellazioni\)[\s\S]*?for \(const voluta of inserimenti\)[\s\S]*?for \(const voluta of salite\)/, "prima si scende la primaria, poi si cancella, poi si inserisce, per ultimo si sale");

  const paginaAllenamenti = readFileSync("src/app/training/page.tsx", "utf8");
  assert.match(paginaAllenamenti, /editingTraining\.categoryName \|\|\n\s*"Categoria",/, "in archivio torna il nome salvato, non l'etichetta a schermo (N2)");
  assert.doesNotMatch(paginaAllenamenti, /\.join\(", "\) \|\| editingTraining\.category,/);
  assert.doesNotMatch(db, /console\.warn\("Error syncing athlete memberships:"/, "un rifiuto non si inghiotte");
  assert.match(db, /giaInArchivio: ReadonlySet<string> = new Set\(\)/, "le righe gia in archivio passano");
  assert.match(db, /const nextCategoryId = !membershipsDeclared\s*\?\s*currentAthlete\.category_id \?\? null/);
  assert.match(db, /Catalogo delle categorie non leggibile/, "un catalogo non letto ferma il salvataggio, non lo lascia passare");
  const scheda = readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.match(scheda, /\.\.\.atletaSenzaCategorie,\n\s*\.\.\.athleteOverrides,/, "le raccolte della scheda non dichiarano le appartenenze");
});

test("revisione · il vaglio del server: una modifica senza category_id non lo riscrive; la proiezione in data segue la colonna", () => {
  const guardia = readFileSync("src/lib/server/category-write-guard.ts", "utf8");
  assert.match(guardia, /if \(riga\.category_id === undefined\) return;\n\n  const catalogo = await loadClubCategoryCatalog\(organizationId\);\n  const canonico = canonicalizeCategoryReferenceForWrite\(\n    \{ categoryId: riga\.category_id, categoryName: riga\.category_name \},\n    catalogo,\n    "Appartenenza a una categoria"/);
  assert.match(guardia, /export const assertAthleteDataProjectionIsCanonical/);
  const risorse = readFileSync("src/lib/server/resources.ts", "utf8");
  assert.equal((risorse.match(/await assertAthleteDataProjectionIsCanonical\(/g) || []).length, 2);
});

test("revisione · l'automazione degli allenamenti non genera con un'etichetta al posto dell'identificativo", () => {
  const codice = readFileSync("src/lib/server/training-automation.ts", "utf8");
  assert.match(codice, /const riferimentoRisolto = resolveCategoryReference\(/);
  assert.match(codice, /unresolvedCategorySlots\.push\(/);
  assert.doesNotMatch(codice, /String\(category\?\.name \|\| ""\)\.trim\(\) === resolvedCategoryLabel,/, "niente prima omonima per nome");
});

test("revisione · l'anteprima dell'import dice la stessa cosa dell'import", () => {
  const codice = readFileSync("src/lib/athlete-import.ts", "utf8");
  assert.match(codice, /resolveCategoryReference\(rawCategory, rawCategory, categories\)/);
  assert.match(codice, /nomina piu squadre del club: indicare quale/);
  assert.doesNotMatch(readFileSync("src/app/athletes/page.tsx", "utf8"), /categoryIdByKey\./, "la mappa per nome non esiste piu");
});
