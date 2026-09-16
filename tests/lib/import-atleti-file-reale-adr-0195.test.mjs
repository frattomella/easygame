import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import { readWorkbook, guessAthleteImportMapping, parseCsvTextWithRows } from "../../src/lib/athlete-import.ts";
import { buildAthleteImportPlan, buildAthleteImportRequest, flattenImportPlan } from "../../src/lib/athletes/import/plan.ts";
import { buildMembershipTargetIndex } from "../../src/lib/categories/placement.ts";

/**
 * ADR-0195 — il file vero, anonimizzato nella **struttura** che ha causato il
 * 113 → 97: un foglio «Atleti» con intervallo usato A1:E200, 113 righe
 * atleta, 86 righe vuote in coda (celle stub), colonne COGNOME · NOME ·
 * NUMERO MAGLIA · ANNO DI NASCITA · CATEGORIA, l'anno come testo, 5 righe
 * senza anno, 2 nominativi ripetuti (uno con l'anno solo da una parte),
 * 13 etichette di categoria in maiuscolo di cui 2 con due sedi nel club e
 * 9 che il club non ha.
 *
 * Con il vecchio importer: 199 righe lette (le 86 vuote fra gli scarti),
 * 16 righe scartate senza via d'uscita (4 senza anno + 11 ambigue + 1
 * doppione), e 9 categorie **create da sole** all'import. Qui ogni riga ha
 * uno stato, i totali tornano, nessuna categoria nasce senza decisione.
 */

const SITE_A = "site-a";
const SITE_B = "site-b";
const CATEGORIE = [
  { id: "cat-pulcini", name: "Pulcini" },
  { id: "cat-scoiattoli", name: "Scoiattoli" },
  { id: "cat-aquilotti", name: "Aquilotti" },
  { id: "cat-esordienti", name: "Esordienti" },
  { id: "cat-u14-gold", name: "Under 14 Gold" },
  { id: "cat-u17-gold", name: "Under 17 Gold" },
];
const GRUPPI = [
  { categoryId: "cat-pulcini", siteId: SITE_A, active: true },
  { categoryId: "cat-pulcini", siteId: SITE_B, active: true },
  { categoryId: "cat-scoiattoli", siteId: SITE_A, active: true },
  { categoryId: "cat-scoiattoli", siteId: SITE_B, active: true },
  { categoryId: "cat-aquilotti", siteId: SITE_A, active: true },
  { categoryId: "cat-esordienti", siteId: SITE_A, active: true },
  { categoryId: "cat-u14-gold", siteId: SITE_A, active: true },
  { categoryId: "cat-u17-gold", siteId: SITE_A, active: true },
];
const SEDI = [
  { id: SITE_A, name: "Sede A" },
  { id: SITE_B, name: "Sede B" },
];
const targets = () => buildMembershipTargetIndex({ categories: CATEGORIE, groups: GRUPPI, sites: SEDI });

/** Le 13 etichette del file vero e quante righe portano, nell'ordine del file. */
const BLOCCHI = [
  ["PULCINI", 4, 2018],
  ["SCOIATTOLI", 7, 2018],
  ["AQUILOTTI", 9, 2016],
  ["ESORDIENTI", 10, 2015],
  ["UNDER13 REG.", 7, 2014],
  ["UNDER14 GOLD", 12, 2013],
  ["UNDER14 REG.", 7, 2013],
  ["UNDER15 ECC", 9, 2012],
  ["PRIMA SQUADRA", 12, 2004],
  ["UNDER17 GOLD", 10, 2010],
  ["U19 GOLD", 10, 2008],
  ["U19 REG.", 10, 2008],
  ["UNDER17 REG", 6, 2011],
];

const righeFile = () => {
  const righe = [];
  let n = 0;
  for (const [categoria, quante, anno] of BLOCCHI) {
    for (let i = 0; i < quante; i += 1) {
      n += 1;
      righe.push({ cognome: `Cognome${n}`, nome: `Nome${n}`, maglia: String((n % 30) + 1), anno: String(anno + (i % 3)), categoria });
    }
  }
  assert.equal(righe.length, 113);
  /* Come nel file vero: la riga 2 e quattro della prima squadra senza anno. */
  for (const indice of [0, 65, 66, 67, 68]) righe[indice].anno = "";
  /* Due nominativi ripetuti: uno con lo stesso anno (riga 78 = riga 90), uno con l'anno solo da una parte (riga 69 = riga 94). */
  righe[88] = { ...righe[88], cognome: righe[76].cognome, nome: righe[76].nome, anno: righe[76].anno };
  righe[92] = { ...righe[92], cognome: righe[67].cognome, nome: righe[67].nome };
  return righe;
};

/** Il foglio com'e nel file: intestazione, 113 righe, poi 86 righe di celle stub fino alla 200. */
const fixtureWorkbook = () => {
  const aoa = [["COGNOME", "NOME", "NUMERO MAGLIA", "ANNO DI NASCITA", "CATEGORIA"], ...righeFile().map((r) => [r.cognome, r.nome, r.maglia, r.anno, r.categoria])];
  /* Le 86 righe in coda: celle presenti e vuote, come le lascia Excel dopo una cancellazione. */
  for (let r = 0; r < 86; r += 1) aoa.push(["", "", "", "", ""]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  assert.equal(ws["!ref"], "A1:E200");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Atleti");
  return wb;
};

const leggi = () => {
  const parsed = readWorkbook(fixtureWorkbook(), XLSX.utils);
  const mapping = guessAthleteImportMapping(parsed.headers);
  return { parsed, mapping };
};

test("1 · il lettore conta 113 righe atleta e 86 vuote, non 199 righe", () => {
  const { parsed, mapping } = leggi();
  assert.equal(parsed.diagnostics.physicalRows, 200);
  assert.equal(parsed.diagnostics.candidateRows, 113);
  assert.equal(parsed.diagnostics.emptyRows, 86);
  assert.equal(parsed.diagnostics.headerRow, 1);
  assert.equal(parsed.sourceRows[0].sourceRowNumber, 2, "la riga porta il suo numero nel file");
  assert.equal(parsed.sourceRows[112].sourceRowNumber, 114);
  /* Il vecchio lettore: sheet_to_json con defval restituiva anche le 86 righe vuote. */
  const vecchio = XLSX.utils.sheet_to_json(fixtureWorkbook().Sheets.Atleti, { defval: "" });
  assert.equal(vecchio.length, 199, "il difetto del vecchio lettore, riprodotto");
  assert.deepEqual(mapping, { firstName: "NOME", lastName: "COGNOME", birthYear: "ANNO DI NASCITA", category: "CATEGORIA" }, "l'anno di nascita e l'anno, non la data");
});

test("2 · nessuna riga sparisce: 113 = pronte + da verificare + da correggere + duplicati + escluse", () => {
  const { parsed, mapping } = leggi();
  const plan = buildAthleteImportPlan({ rows: parsed.sourceRows, mapping, targets: targets() });
  assert.equal(plan.totals.candidates, 113);
  assert.equal(plan.totalsConsistent, true);
  assert.equal(plan.rows.length, 113);
  const { ready, warning, error, duplicate, excluded } = plan.totals;
  assert.equal(ready + warning + error + duplicate + excluded, 113);
});

test("3 · l'anno di nascita mancante e un avviso con la correzione a portata di mano, non uno scarto", () => {
  const { parsed, mapping } = leggi();
  const plan = buildAthleteImportPlan({ rows: parsed.sourceRows, mapping, targets: targets() });
  const senzaAnno = plan.rows.filter((row) => row.normalized.birthDateKind === "missing");
  assert.equal(senzaAnno.length, 5);
  for (const row of senzaAnno) {
    assert.ok(row.issues.some((issue) => issue.code === "missing_birth_date" && issue.severity === "warning"));
    assert.equal(row.validation.errors.some((issue) => issue.code === "missing_birth_date"), false);
  }
  /* Le quattro della prima squadra (categoria decisa) si importano; la riga 2 resta ferma solo per la categoria ambigua. */
  const primaSquadra = senzaAnno.filter((row) => row.normalized.categoryLabel === "PRIMA SQUADRA");
  assert.equal(primaSquadra.length, 4);
  const conDecisione = buildAthleteImportPlan({
    rows: parsed.sourceRows,
    mapping,
    targets: targets(),
    decisions: { categories: { primasquadra: { kind: "skip", athletes: "import_without_category" } } },
  });
  for (const row of conDecisione.rows.filter((r) => r.normalized.categoryLabel === "PRIMA SQUADRA" && r.normalized.birthDateKind === "missing")) {
    assert.equal(row.state, "warning");
    assert.equal(row.finalAction, "create");
  }
  /* La correzione: l'anno scritto nel wizard vale, e la riga diventa pronta senza toccare il file. */
  const corretta = buildAthleteImportPlan({
    rows: parsed.sourceRows,
    mapping,
    targets: targets(),
    decisions: { categories: { primasquadra: { kind: "skip", athletes: "import_without_category" } }, corrections: { 67: { birthDate: "2001" } } },
  });
  const riga67 = corretta.rows.find((row) => row.sourceRowNumber === 67);
  assert.equal(riga67.normalized.birthDate, "2001-01-01");
  assert.deepEqual(riga67.correctedFields, ["birthDate"]);
  assert.equal(riga67.issues.some((issue) => issue.code === "missing_birth_date"), false);
});

test("4 · i duplicati nel file restano visibili con la riga a cui somigliano, e il club decide", () => {
  const { parsed, mapping } = leggi();
  /* Le categorie si decidono prima (passo 4), i duplicati dopo (passo 5). */
  const categories = { u19gold: { kind: "create", name: "Under 19 Gold", siteId: SITE_A } };
  const plan = buildAthleteImportPlan({ rows: parsed.sourceRows, mapping, targets: targets(), decisions: { categories } });
  const doppione = plan.rows.find((row) => row.sourceRowNumber === 90);
  assert.equal(doppione.state, "duplicate_candidate");
  assert.deepEqual(doppione.duplicateCandidates.inFile, [{ row: 78, strength: "strong" }]);
  const omonimo = plan.rows.find((row) => row.sourceRowNumber === 94);
  assert.deepEqual(omonimo.duplicateCandidates.inFile, [{ row: 69, strength: "weak" }], "stesso nome, anno solo da una parte: un avviso, non un blocco");
  assert.notEqual(omonimo.state, "duplicate_candidate");
  const deciso = buildAthleteImportPlan({ rows: parsed.sourceRows, mapping, targets: targets(), decisions: { categories, duplicates: { 90: { kind: "skip" } } } });
  assert.equal(deciso.rows.find((row) => row.sourceRowNumber === 90).state, "ignored_by_user");
  const comunque = buildAthleteImportPlan({ rows: parsed.sourceRows, mapping, targets: targets(), decisions: { categories, duplicates: { 90: { kind: "new" } } } });
  assert.notEqual(comunque.rows.find((row) => row.sourceRowNumber === 90).state, "duplicate_candidate");
});

test("5 · le 13 categorie del file sono 13 decisioni: nessuna si crea da sola, l'ambigua non si risolve da sola", () => {
  const { parsed, mapping } = leggi();
  const plan = buildAthleteImportPlan({ rows: parsed.sourceRows, mapping, targets: targets() });
  assert.equal(plan.categories.length, 13);
  const per = Object.fromEntries(plan.categories.map((c) => [c.label, c]));
  /* Due sedi: ambigua, nessuna decisione proposta. */
  for (const label of ["PULCINI", "SCOIATTOLI"]) {
    assert.equal(per[label].suggestion.ambiguous, true, label);
    assert.equal(per[label].decision, null, `${label} non si sceglie per prima`);
    assert.equal(per[label].suggestion.targets.length, 2);
  }
  /* Una squadra sola con quel nome: proposta gia scelta, dichiarata come tale. */
  for (const label of ["AQUILOTTI", "ESORDIENTI"]) {
    assert.equal(per[label].decision?.kind, "map", label);
    assert.equal(per[label].suggested, true);
  }
  /* «UNDER14 GOLD» ↔ «Under 14 Gold»: la chiave normalizzata la **propone** («Usa questa»), non la decide (revisione ostile B11). */
  for (const label of ["UNDER14 GOLD", "UNDER17 GOLD"]) {
    assert.equal(per[label].decision, null, label);
    assert.equal(per[label].suggestion.targets.length, 1);
    assert.equal(per[label].suggestion.exact, true);
    assert.equal(per[label].suggestion.ambiguous, false);
  }
  /* Le nove che il club non ha: pending, e le loro righe non sono pronte. */
  const ignote = ["UNDER13 REG.", "UNDER14 REG.", "UNDER15 ECC", "PRIMA SQUADRA", "U19 GOLD", "U19 REG.", "UNDER17 REG"];
  for (const label of ignote) {
    assert.equal(per[label].decision, null, label);
    for (const n of per[label].rowNumbers) {
      const row = plan.rows.find((r) => r.sourceRowNumber === n);
      assert.equal(row.state, "error", `riga ${n}`);
      assert.ok(row.issues.some((issue) => issue.code === "category_unknown" || issue.code === "category_pending"));
    }
  }
  assert.equal(plan.totals.pendingCategories, 11, "9 sconosciute + 2 proposte per chiave da confermare");
  /* Il carico per il server non porta nessuna categoria da creare finche il club non lo decide. */
  const richiesta = buildAthleteImportRequest(plan, "b0b0b0b0-0000-4000-8000-000000000001");
  assert.deepEqual(richiesta.categoriesToCreate, []);
  assert.ok(richiesta.rows.every((row) => row.category?.kind !== "create"));
});

test("6 · con le decisioni prese: 112 atleti si importano, 1 doppione escluso, le nuove categorie sono nel carico solo perche decise", () => {
  const { parsed, mapping } = leggi();
  const decisions = {
    categories: {
      pulcini: { kind: "map", targetId: `group:cat-pulcini:${SITE_B}` },
      scoiattoli: { kind: "map", targetId: `group:cat-scoiattoli:${SITE_A}` },
      u13reg: { kind: "create", name: "Under 13 Regionale", siteId: SITE_A },
      u14reg: { kind: "create", name: "Under 14 Regionale", siteId: SITE_A },
      u15ecc: { kind: "create", name: "Under 15 Eccellenza", siteId: SITE_A },
      primasquadra: { kind: "create", name: "Prima Squadra", siteId: "" },
      u19gold: { kind: "create", name: "Under 19 Gold", siteId: SITE_A },
      u19reg: { kind: "skip", athletes: "import_without_category" },
      u17reg: { kind: "skip", athletes: "exclude" },
      u14gold: { kind: "map", targetId: `group:cat-u14-gold:${SITE_A}` },
      u17gold: { kind: "map", targetId: `group:cat-u17-gold:${SITE_A}` },
    },
    duplicates: { 90: { kind: "skip" } },
  };
  const plan = buildAthleteImportPlan({ rows: parsed.sourceRows, mapping, targets: targets(), decisions });
  assert.equal(plan.totalsConsistent, true);
  assert.equal(plan.totals.pendingCategories, 0);
  assert.equal(plan.totals.pendingDuplicates, 0);
  assert.equal(plan.totals.error, 0);
  assert.equal(plan.totals.excluded, 7, "1 doppione + 6 di UNDER17 REG esclusi");
  assert.equal(plan.totals.toCreate, 106);
  assert.equal(plan.totals.toCreate + plan.totals.excluded, 113);
  assert.equal(plan.totals.categoriesToCreate, 5);
  const richiesta = buildAthleteImportRequest(plan, "b0b0b0b0-0000-4000-8000-000000000001");
  assert.equal(richiesta.rows.length, 106);
  assert.deepEqual(richiesta.categoriesToCreate.map((c) => c.key).sort(), ["primasquadra", "u13reg", "u14reg", "u15ecc", "u19gold"]);
  const pulcini = richiesta.rows.filter((row) => row.category?.kind === "target" && row.category.targetId === `group:cat-pulcini:${SITE_B}`);
  assert.equal(pulcini.length, 4, "la sede e quella della squadra scelta");
  const senzaCategoria = richiesta.rows.filter((row) => row.category === null);
  assert.equal(senzaCategoria.length, 10, "U19 REG. importati senza categoria");
  /* Il rapporto piatto ha una riga per riga del file, con lo stato a parole. */
  const piatto = flattenImportPlan(plan);
  assert.equal(piatto.length, 113);
  assert.ok(piatto.every((row) => row.state && row.row >= 2 && row.row <= 114));
});

test("7 · un CSV con righe vuote in mezzo conserva i numeri di riga del file", () => {
  const parsed = parseCsvTextWithRows("Cognome;Nome;Anno di nascita\nRossi;Mario;2012\n\n;;\nBianchi;Anna;2013\n");
  assert.deepEqual(parsed.sourceRows.map((row) => row.sourceRowNumber), [2, 5]);
  assert.equal(parsed.emptyRows, 2);
});
