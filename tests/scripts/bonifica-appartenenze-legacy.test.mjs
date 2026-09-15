import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  applicaInMemoria,
  applicaInversaInMemoria,
  atteseDaConteggi,
  invertiMutazioni,
  leggiAttese,
  pianificaBonifica,
  validaStato,
} from "../../scripts/lib/bonifica-appartenenze.mjs";

/*
  D-RD-16: il pianificatore della bonifica, su fixture. Le regole sono quelle
  del piano (`docs/redesign/D-RD-16-piano-bonifica-appartenenze.md` §3): R1
  nome corrente, R2 alias, R3 contesto dell'atleta (mai approvata da sola),
  R0 non si tocca. Nessun database qui: il database lo vede solo lo script,
  e solo in lettura finche nessuno autorizza.
*/

const ORG = "11111111-1111-4111-8111-111111111111";
const PULCINI_SC = "category-1-pulcini-scosma";
const PULCINI_SCAURI = "category-2-pulcini-scauri";
const AQUILOTTI = "category-3-aquilotti";
const U15 = "category-4-under15";

const catalogo = [
  { id: PULCINI_SC, name: "Pulcini" },
  { id: PULCINI_SCAURI, name: "Pulcini" },
  { id: AQUILOTTI, name: "Aquilotti" },
  { id: U15, name: "Under 15 Eccellenza" },
];

let n = 0;
const riga = (athlete, category_id, extra = {}) => ({
  id: `r${String(++n).padStart(3, "0")}`,
  organization_id: ORG,
  athlete_id: athlete,
  category_id,
  category_name: extra.category_name ?? catalogo.find((c) => c.id === category_id)?.name ?? category_id,
  is_primary: extra.is_primary ?? false,
  site_id: extra.site_id ?? null,
  created_at: `2026-01-01T00:00:0${n % 10}.000Z`,
  updated_at: "2026-01-01T00:00:00.000Z",
});

const atleta = (id, category_id = null, category_name = null) => ({ id, category_id, category_name });

const pianoDi = (righe, atleti = []) => pianificaBonifica({ organizationId: ORG, catalogo, righe, atleti });

test("R1: il nome corrente unico risolve; con la gemella e DELETE, senza e UPDATE", () => {
  const righe = [
    riga("a1", AQUILOTTI, { is_primary: true }),
    riga("a1", "Aquilotti"),
    riga("a2", "Aquilotti", { is_primary: true }),
  ];
  const piano = pianoDi(righe);
  assert.equal(piano.distribuzione.R1, 2);
  const [copia, sola] = [piano.mutazioni.find((m) => m.riga === righe[1].id), piano.mutazioni.find((m) => m.riga === righe[2].id)];
  assert.equal(copia.operazione, "DELETE");
  assert.equal(copia.gemella, righe[0].id);
  assert.equal(copia.determinismo, "HIGH");
  assert.equal(sola.operazione, "UPDATE");
  assert.deepEqual(sola.campi, { category_id: AQUILOTTI });
  assert.equal(sola.dopo.category_name, "Aquilotti", "il nome resta com'era");
  assert.equal(sola.dopo.is_primary, true, "la bandiera resta");
  assert.equal(piano.conteggi.delete, 1);
  assert.equal(piano.conteggi.update, 1);
  assert.equal(piano.daConfermare.length, 0);
});

test("R2: l'alias letto dalle righe identificate risolve quando nessun nome corrente risponde", () => {
  const righe = [
    riga("a1", U15, { is_primary: true, category_name: "Under 15 Gold" }),
    riga("a1", "Under 15 Gold"),
    riga("a2", "Under 15 Gold", { is_primary: true }),
  ];
  const piano = pianoDi(righe);
  assert.equal(piano.distribuzione.R2, 2);
  assert.equal(piano.mutazioni.find((m) => m.riga === righe[1].id).operazione, "DELETE");
  const agg = piano.mutazioni.find((m) => m.riga === righe[2].id);
  assert.equal(agg.operazione, "UPDATE");
  assert.equal(agg.target, U15);
});

test("R2 non impara da una riga storica: senza righe identificate il nome e R0", () => {
  const righe = [riga("a1", "Under 15 Gold", { is_primary: true })];
  const piano = pianoDi(righe);
  assert.equal(piano.mutazioni.length, 0);
  assert.equal(piano.revisione.length, 1);
  assert.equal(piano.revisione[0].regola, "R0");
  assert.equal(piano.distribuzione.R0, 1);
});

test("R3: il nome ambiguo si decide con cio che l'atleta possiede dopo R1/R2, e chiede conferma", () => {
  /* Il caso del pilota: primaria storica «Pulcini - S. Cosma» (alias), secondaria «Pulcini» (ambigua). */
  const righe = [
    riga("altro", PULCINI_SC, { is_primary: true, category_name: "Pulcini - S. Cosma" }),
    riga("m", "Pulcini - S. Cosma", { is_primary: true }),
    riga("m", "Pulcini"),
    riga("m", U15),
  ];
  const piano = pianoDi(righe, [atleta("m", "Pulcini - S. Cosma", "Pulcini - S. Cosma")]);
  assert.deepEqual(piano.distribuzione, { R1: 0, R2: 1, R3: 1, R0: 0 });
  const primaria = piano.mutazioni.find((m) => m.riga === righe[1].id);
  assert.equal(primaria.operazione, "UPDATE");
  assert.equal(primaria.target, PULCINI_SC);
  assert.equal(primaria.regola, "R2");
  const ambigua = piano.mutazioni.find((m) => m.riga === righe[2].id);
  assert.equal(ambigua.operazione, "DELETE");
  assert.equal(ambigua.regola, "R3");
  assert.equal(ambigua.determinismo, "MEDIUM");
  assert.equal(ambigua.confermaManuale, true);
  assert.equal(ambigua.gemella, righe[1].id, "la gemella e la primaria appena aggiornata");
  assert.deepEqual(piano.daConfermare, [righe[2].id]);
  const colonna = piano.mutazioni.find((m) => m.tabella === "athletes");
  assert.deepEqual(colonna.campi, { category_id: PULCINI_SC, category_name: "Pulcini" });
  assert.equal(atteseDaConteggi(piano.conteggi), "update=1,delete=1,colonne=1");
});

test("R0: il nome ambiguo senza contesto, o con tutto il contesto, non si tocca", () => {
  const nessuna = pianoDi([riga("a", "Pulcini", { is_primary: true })]);
  assert.equal(nessuna.mutazioni.length, 0);
  assert.equal(nessuna.revisione[0].regola, "R0");
  assert.match(nessuna.revisione[0].motivo, /non ne possiede nessuna/);

  const tutte = pianoDi([riga("b", PULCINI_SC, { is_primary: true }), riga("b", PULCINI_SCAURI), riga("b", "Pulcini")]);
  assert.equal(tutte.mutazioni.length, 0);
  assert.match(tutte.revisione[0].motivo, /le possiede tutte/);
});

test("R0: un alias che risponde a due categorie non sceglie", () => {
  const righe = [
    riga("x", PULCINI_SC, { is_primary: true, category_name: "Pulcini vecchio nome" }),
    riga("y", AQUILOTTI, { is_primary: true, category_name: "Pulcini vecchio nome" }),
    riga("z", "Pulcini vecchio nome", { is_primary: true }),
  ];
  const piano = pianoDi(righe);
  assert.equal(piano.mutazioni.length, 0);
  assert.match(piano.revisione[0].motivo, /2 categorie/);
});

test("una copia primaria trasferisce la bandiera (e la sede) alla gemella prima di sparire", () => {
  const righe = [riga("a", "Aquilotti", { is_primary: true, site_id: "site-1" }), riga("a", AQUILOTTI)];
  const piano = pianoDi(righe);
  const trasferimento = piano.mutazioni.find((m) => m.riga === righe[1].id);
  assert.equal(trasferimento.operazione, "UPDATE");
  assert.deepEqual(trasferimento.campi, { is_primary: true, site_id: "site-1" });
  assert.equal(piano.mutazioni.find((m) => m.riga === righe[0].id).operazione, "DELETE");
  assert.equal(piano.conteggi.updateGemella, 1);
  const dopo = applicaInMemoria({ righe, atleti: [] }, piano.mutazioni);
  assert.equal(dopo.righe.length, 1);
  assert.equal(dopo.righe[0].is_primary, true);
  assert.equal(validaStato({ organizationId: ORG, catalogo, ...dopo }).find((v) => v.nome.startsWith("V3b")).valore, 0);
});

test("la colonna athletes.category_id segue la primaria dopo la fase A; senza primaria e R0", () => {
  const righe = [riga("a", AQUILOTTI, { is_primary: true }), riga("a", "Aquilotti")];
  const piano = pianoDi(righe, [atleta("a", "Aquilotti", "Aquilotti"), atleta("senza", "Aquilotti", "Aquilotti"), atleta("ok", AQUILOTTI, "Aquilotti")]);
  const colonne = piano.mutazioni.filter((m) => m.tabella === "athletes");
  assert.equal(colonne.length, 1);
  assert.equal(colonne[0].riga, "a");
  assert.equal(colonne[0].regola, "colonna");
  assert.equal(piano.revisione.length, 1);
  assert.equal(piano.revisione[0].tabella, "athletes");
  assert.equal(piano.revisione[0].riga, "senza");
});

test("una riga di un altro club non entra nel piano", () => {
  const estranea = { ...riga("a", "Aquilotti", { is_primary: true }), organization_id: "22222222-2222-4222-8222-222222222222" };
  const piano = pianoDi([estranea]);
  assert.equal(piano.mutazioni.length, 0);
  assert.equal(piano.revisione.length, 0);
  assert.equal(piano.conteggi.righePrima, 0);
});

test("idempotenza: il piano sullo stato dopo e vuoto", () => {
  const righe = [
    riga("altro", PULCINI_SC, { is_primary: true, category_name: "Pulcini - S. Cosma" }),
    riga("m", "Pulcini - S. Cosma", { is_primary: true }),
    riga("m", "Pulcini"),
    riga("a", AQUILOTTI, { is_primary: true }),
    riga("a", "Aquilotti"),
  ];
  const atleti = [atleta("m", "Pulcini - S. Cosma", "Pulcini - S. Cosma"), atleta("a", AQUILOTTI, "Aquilotti")];
  const piano = pianoDi(righe, atleti);
  const dopo = applicaInMemoria({ righe, atleti }, piano.mutazioni);
  const secondo = pianificaBonifica({ organizationId: ORG, catalogo, ...dopo });
  assert.equal(secondo.mutazioni.length, 0);
  assert.equal(secondo.revisione.length, 0);
  assert.equal(secondo.conteggi.storiche, 0);
});

test("ritorno: l'inverso applicato allo stato dopo restituisce lo stato prima, riga per riga", () => {
  const righe = [
    riga("altro", PULCINI_SC, { is_primary: true, category_name: "Pulcini - S. Cosma" }),
    riga("m", "Pulcini - S. Cosma", { is_primary: true }),
    riga("m", "Pulcini"),
    riga("p", "Aquilotti", { is_primary: true, site_id: "site-9" }),
    riga("p", AQUILOTTI),
  ];
  const atleti = [atleta("m", "Pulcini - S. Cosma", "Pulcini - S. Cosma"), atleta("p", AQUILOTTI, "Aquilotti")];
  const piano = pianoDi(righe, atleti);
  const dopo = applicaInMemoria({ righe, atleti }, piano.mutazioni);
  const inverso = invertiMutazioni(piano.mutazioni);
  assert.equal(inverso.length, piano.mutazioni.length);
  assert.ok(inverso.every((op) => op.operazione === "INSERT" || Object.keys(op.campi).length > 0));
  const tornato = applicaInversaInMemoria(dopo, inverso);
  const ordina = (rs) => [...rs].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(ordina(tornato.righe), ordina(righe));
  assert.deepEqual(ordina(tornato.atleti), ordina(atleti));
});

test("le validazioni V1–V5 leggono lo stato dopo come il piano lo attende", () => {
  const righe = [riga("a", AQUILOTTI, { is_primary: true }), riga("a", "Aquilotti"), riga("b", "Aquilotti", { is_primary: true })];
  const atleti = [atleta("a", AQUILOTTI, "Aquilotti"), atleta("b", "Aquilotti", "Aquilotti")];
  const piano = pianoDi(righe, atleti);
  const dopo = applicaInMemoria({ righe, atleti }, piano.mutazioni);
  const esiti = validaStato({ organizationId: ORG, catalogo, ...dopo }, { V1: 0, V2: 2, V3: 2, V4: 0, V5: 0 });
  assert.ok(esiti.every((v) => v.ok), JSON.stringify(esiti));
  const prima = validaStato({ organizationId: ORG, catalogo, righe, atleti });
  assert.equal(prima.find((v) => v.nome.startsWith("V1")).valore, 2);
  assert.equal(prima.find((v) => v.nome.startsWith("V4")).valore, 1);
});

test("le attese si leggono e si scrivono in una forma sola", () => {
  assert.deepEqual(leggiAttese("update=1,delete=212,colonne=2"), { update: 1, delete: 212, colonne: 2 });
  assert.throws(() => leggiAttese("update=1,delete=x,colonne=2"), /non numerico/);
  assert.throws(() => leggiAttese("update=1"), /manca/);
});

test("lo script: dry-run per default, scrittura solo con tutte le guardie, un branch solo", () => {
  const sorgente = fs.readFileSync(path.join(process.cwd(), "scripts", "bonifica-appartenenze-legacy.mjs"), "utf8");
  assert.match(sorgente, /const ESEGUI = flag\("--esegui"\);/);
  assert.match(sorgente, /"web-redesign-staging": "ep-dry-block-alkxdiiu",/);
  assert.doesNotMatch(sorgente, /ep-(?!dry-block-alkxdiiu)[a-z]+-[a-z]+-[a-z0-9]{8}/, "nessun altro endpoint Neon nel codice");
  assert.match(sorgente, /if \(SCRIVE\) \{[\s\S]*?-pooler[\s\S]*?EASYGAME_DB_ENV/);
  assert.match(sorgente, /BONIFICA_APPARTENENZE_AUTORIZZATA/);
  assert.match(sorgente, /--conferma-r3/);
  assert.match(sorgente, /--snapshot/);
  assert.match(sorgente, /ORDER BY id FOR UPDATE/, "i blocchi delle schede sono un lotto crescente (ADR-0138)");
  assert.match(sorgente, /firma\(piano\.mutazioni\) !== firma\(pianoDryRun\.mutazioni\)/, "il piano eseguito e quello approvato");
  assert.match(sorgente, /await client\.query\("ROLLBACK"\)/);
  /* In dry-run non c'e un BEGIN: la funzione dryRun non apre transazioni. */
  const dryRun = sorgente.slice(sorgente.indexOf("const dryRun = async"), sorgente.indexOf("/* ---------- esecuzione"));
  assert.doesNotMatch(dryRun, /"BEGIN"|`\s*(UPDATE|DELETE|INSERT)\s|FOR UPDATE/);
  assert.match(dryRun, /await q\(`select /, "legge, e basta");
});
