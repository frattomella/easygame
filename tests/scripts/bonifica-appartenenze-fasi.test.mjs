import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  applicaFaseInMemoria,
  applicaInversaFaseInMemoria,
  canonico,
  invertiFase,
  misuraFasi,
  pianificaNomiStantii,
  pianificaProiezioni,
} from "../../scripts/lib/bonifica-fasi.mjs";
import { buildAthleteCategoryProjection, normalizeAthleteCategoryMemberships } from "../../src/lib/athlete-category-memberships.ts";
import { motiviDiRifiutoDelBersaglio } from "../../scripts/lib/bonifica-guardie.mjs";

/*
  D-RD-16, fasi B e C, su fixture. La fase C allinea il solo nome di una riga
  identificata; la fase B ricostruisce la proiezione in `athletes.data` con la
  stessa funzione del writer. Nessun database.
*/

const ORG = "11111111-1111-4111-8111-111111111111";
const PULCINI = "category-1-pulcini";
const AQUILOTTI = "category-2-aquilotti";
const catalogo = [{ id: PULCINI, name: "Pulcini" }, { id: AQUILOTTI, name: "Aquilotti" }];
const clubCategories = catalogo.map((c) => ({ ...c, color: "x" }));

const riga = (id, athlete, category_id, category_name, is_primary = false) => ({
  id, organization_id: ORG, athlete_id: athlete, category_id, category_name, is_primary, site_id: null,
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
});

test("fase C · allinea il nome di una riga identificata e lascia stare tutto il resto", () => {
  const righe = [
    riga("r1", "a", PULCINI, "Pulcini - S. Cosma", true),
    riga("r2", "a", AQUILOTTI, "Aquilotti"),
    riga("r3", "b", "Pulcini", "Pulcini", true), // fuori catalogo: fase A, non C
    { ...riga("r4", "c", PULCINI, "Pulcini - S. Cosma", true), organization_id: "22222222-2222-4222-8222-222222222222" },
  ];
  const piano = pianificaNomiStantii({ organizationId: ORG, catalogo, righe });
  assert.equal(piano.mutazioni.length, 1);
  assert.equal(piano.mutazioni[0].riga, "r1");
  assert.deepEqual(piano.mutazioni[0].campi, { category_name: "Pulcini" });
  assert.equal(piano.mutazioni[0].prima.category_id, PULCINI, "l'identificativo non si tocca");
  assert.equal(piano.mutazioni[0].dopo.category_id, PULCINI);
  assert.equal(piano.mutazioni[0].determinismo, "HIGH");
  assert.equal(piano.revisione.length, 0);
  const dopo = applicaFaseInMemoria({ righe, atleti: [] }, piano.mutazioni);
  assert.equal(pianificaNomiStantii({ organizationId: ORG, catalogo, righe: dopo.righe }).mutazioni.length, 0, "idempotente");
  const tornato = applicaInversaFaseInMemoria(dopo, invertiFase(piano.mutazioni));
  assert.equal(canonico(tornato.righe), canonico(righe), "il ritorno restituisce il nome com'era");
});

test("fase C · una categoria senza nome nel catalogo e REVIEW, non un nome vuoto scritto", () => {
  const piano = pianificaNomiStantii({ organizationId: ORG, catalogo: [{ id: PULCINI, name: "" }], righe: [riga("r1", "a", PULCINI, "Pulcini", true)] });
  assert.equal(piano.mutazioni.length, 0);
  assert.equal(piano.revisione.length, 1);
});

test("fase B · la proiezione attesa e quella del writer, derivata dalle righe canoniche", () => {
  const righe = [riga("r1", "a", PULCINI, "Pulcini - S. Cosma", true), riga("r2", "a", AQUILOTTI, "Aquilotti")];
  const atleti = [{
    id: "a", category_id: PULCINI, category_name: "Pulcini",
    data: {
      category: "Pulcini - S. Cosma", categoryName: "Pulcini - S. Cosma",
      categoryMemberships: [{ id: "Pulcini - S. Cosma:membership", category_id: "Pulcini - S. Cosma", category_name: "Pulcini - S. Cosma", is_primary: true, site_id: null, athlete_id: "a", organization_id: ORG }],
      categories: ["Pulcini - S. Cosma", "Pulcini - S. Cosma"],
      altro: "resta",
    },
  }];
  const piano = pianificaProiezioni({ organizationId: ORG, clubCategories, righe, atleti });
  assert.equal(piano.mutazioni.length, 1);
  const m = piano.mutazioni[0];
  assert.equal(m.colonna, "data");
  const attesa = buildAthleteCategoryProjection(
    normalizeAthleteCategoryMemberships({ ...atleti[0], category_memberships: righe }, clubCategories),
    { clubId: ORG, athleteId: "a" },
  );
  assert.equal(canonico(m.dopo), canonico(attesa), "la stessa funzione del writer");
  assert.equal(m.dopo.category, PULCINI);
  assert.equal(m.dopo.categoryName, "Pulcini");
  assert.deepEqual(m.dopo.categories, ["Pulcini", "Aquilotti"]);
  assert.equal(m.dopo.categoryMemberships[0].id, "r1", "l'identificativo della riga vera, non quello sintetico");
  assert.equal(m.dopo.categoryMemberships[0].category_name, "Pulcini - S. Cosma", "il nome com'e sulla riga: per questo la fase C va prima");

  const dopo = applicaFaseInMemoria({ righe, atleti }, piano.mutazioni);
  assert.equal(dopo.atleti[0].data.altro, "resta", "le altre chiavi di data non si toccano");
  assert.equal(pianificaProiezioni({ organizationId: ORG, clubCategories, righe, atleti: dopo.atleti }).mutazioni.length, 0, "idempotente");
  const tornato = applicaInversaFaseInMemoria(dopo, invertiFase(piano.mutazioni));
  assert.equal(canonico(tornato.atleti), canonico(atleti), "il ritorno rimette le quattro chiavi com'erano");
});

test("fase B · un atleta senza righe non si tocca e si conta; uno gia allineato non produce mutazioni", () => {
  const righe = [riga("r1", "a", PULCINI, "Pulcini", true)];
  const allineato = buildAthleteCategoryProjection(normalizeAthleteCategoryMemberships({ id: "a", category_memberships: righe }, clubCategories), { clubId: ORG, athleteId: "a" });
  const atleti = [{ id: "a", category_id: PULCINI, category_name: "Pulcini", data: { ...allineato } }, { id: "b", category_id: "Pulcini", category_name: "Pulcini", data: {} }];
  const piano = pianificaProiezioni({ organizationId: ORG, clubCategories, righe, atleti });
  assert.equal(piano.mutazioni.length, 0);
  assert.equal(piano.conteggi.giaAllineati, 1);
  assert.equal(piano.conteggi.senzaRighe, 1);
});

test("fase B · un riferimento pendente (fase A non finita) e REVIEW, non una proiezione inventata", () => {
  const righe = [riga("r1", "a", PULCINI, "Pulcini", true), riga("r2", "a", "Giovanissimi", "Giovanissimi", false)];
  const piano = pianificaProiezioni({ organizationId: ORG, clubCategories, righe, atleti: [{ id: "a", data: {} }] });
  assert.equal(piano.mutazioni.length, 0);
  assert.equal(piano.revisione.length, 1);
  assert.match(piano.revisione[0].motivo, /pendenti: Giovanissimi/);
});

test("misura di fase: nomi stantii e proiezioni stantie si contano insieme", () => {
  const righe = [riga("r1", "a", PULCINI, "Pulcini - S. Cosma", true)];
  const m = misuraFasi({ organizationId: ORG, clubCategories, catalogo, righe, atleti: [{ id: "a", data: {} }] });
  assert.deepEqual(m, { nomiStantii: 1, proiezioniStantie: 1, revisioni: 0 });
});

test("le guardie comuni rifiutano ogni branch che non sia quello ammesso", () => {
  const ok = "postgresql://u:p@ep-dry-block-alkxdiiu.c-3.eu-central-1.aws.neon.tech/neondb";
  assert.deepEqual(motiviDiRifiutoDelBersaglio({ url: ok, ambiente: "web-redesign-staging", scrive: false }), []);
  assert.deepEqual(motiviDiRifiutoDelBersaglio({ url: ok, ambiente: "web-redesign-staging", scrive: true, env: { EASYGAME_DB_ENV: "web-redesign-staging" } }), []);
  assert.ok(motiviDiRifiutoDelBersaglio({ url: ok.replace("ep-dry-block-alkxdiiu", "ep-shy-pine-alt2mp60"), ambiente: "web-redesign-staging", scrive: false }).length);
  assert.ok(motiviDiRifiutoDelBersaglio({ url: ok.replace("alkxdiiu.", "alkxdiiu-pooler."), ambiente: "web-redesign-staging", scrive: true, env: { EASYGAME_DB_ENV: "web-redesign-staging" } }).length);
  assert.ok(motiviDiRifiutoDelBersaglio({ url: ok, ambiente: "web-redesign-staging", scrive: true, env: { EASYGAME_DB_ENV: "development" } }).length);
  assert.ok(motiviDiRifiutoDelBersaglio({ url: ok, ambiente: "staging", scrive: false }).length, "lo staging Fortitudo non e un ambiente ammesso");
});

test("lo script delle fasi: dry-run per default, scrittura solo con tutte le guardie, mai un branch diverso", () => {
  const sorgente = fs.readFileSync(path.join(process.cwd(), "scripts", "bonifica-appartenenze-fasi.mjs"), "utf8");
  assert.match(sorgente, /motiviDiRifiutoDelBersaglio\(\{ url: URL_DB, ambiente: AMBIENTE, scrive: SCRIVE \}\)/);
  assert.doesNotMatch(sorgente, /ep-[a-z]+-[a-z]+-[a-z0-9]{8}/, "nessun endpoint scritto qui: l'elenco e uno solo");
  assert.match(sorgente, /BONIFICA_APPARTENENZE_AUTORIZZATA/);
  assert.match(sorgente, /pianoDryRun\.fase !== FASE/, "il dry-run approvato deve essere della stessa fase");
  assert.match(sorgente, /ORDER BY id FOR UPDATE/);
  assert.match(sorgente, /firma\(piano\.mutazioni\) !== firma\(pianoDryRun\.mutazioni\)/);
  assert.match(sorgente, /Invarianti D-RD-16 cambiati/, "gli invarianti della fase A si ricontrollano prima del COMMIT");
  const dryRun = sorgente.slice(sorgente.indexOf("const dryRun = async"), sorgente.indexOf("/* ---------- esecuzione"));
  assert.doesNotMatch(dryRun, /"BEGIN"|`\s*UPDATE |FOR UPDATE/);
});

/* ---------- revisione ostile (seconda passata) ---------- */

test("fase B · il soggetto sono le sole righe: colonna discorde o due primarie sono REVIEW, non una proiezione ricostruita", () => {
  const righe = [riga("r1", "a", PULCINI, "Pulcini", true), riga("r2", "b", PULCINI, "Pulcini", true), riga("r3", "b", AQUILOTTI, "Aquilotti", true)];
  const atleti = [
    { id: "a", category_id: AQUILOTTI, category_name: "Aquilotti", data: {} }, // colonna ≠ primaria delle righe
    { id: "b", category_id: PULCINI, category_name: "Pulcini", data: {} }, // due primarie
  ];
  const piano = pianificaProiezioni({ organizationId: ORG, clubCategories, righe, atleti });
  assert.equal(piano.mutazioni.length, 0);
  assert.equal(piano.revisione.length, 2);
  assert.match(piano.revisione[0].motivo, /non e la primaria delle righe/);
  assert.match(piano.revisione[1].motivo, /2 primarie/);
});

test("fase B · ordine e identificativi sintetici non sono una differenza: la stessa semantica non si tocca", () => {
  const righe = [riga("r1", "a", PULCINI, "Pulcini", true), riga("r2", "a", AQUILOTTI, "Aquilotti")];
  const allineata = buildAthleteCategoryProjection(normalizeAthleteCategoryMemberships({ id: "a", category_memberships: righe }, clubCategories), { clubId: ORG, athleteId: "a" });
  const scrittaDalWriter = {
    ...allineata,
    categoryMemberships: [...allineata.categoryMemberships].reverse().map((m) => ({ ...m, id: `${m.category_id}:membership` })),
    categories: [...allineata.categories].reverse(),
  };
  const piano = pianificaProiezioni({ organizationId: ORG, clubCategories, righe, atleti: [{ id: "a", category_id: PULCINI, data: scrittaDalWriter }] });
  assert.equal(piano.mutazioni.length, 0);
  assert.equal(piano.conteggi.giaAllineati, 1);
});

test("fase B · il ritorno toglie le chiavi che prima mancavano invece di scrivere null, e porta lo stato atteso per il controllo", () => {
  const righe = [riga("r1", "a", PULCINI, "Pulcini", true)];
  const atleti = [{ id: "a", category_id: PULCINI, data: { altro: 1 } }];
  const piano = pianificaProiezioni({ organizationId: ORG, clubCategories, righe, atleti });
  assert.equal(piano.mutazioni.length, 1);
  assert.deepEqual(piano.mutazioni[0].assenti.sort(), ["categories", "category", "categoryMemberships", "categoryName"].sort());
  const inverso = invertiFase(piano.mutazioni);
  assert.deepEqual(inverso[0].rimuovi.sort(), ["categories", "category", "categoryMemberships", "categoryName"].sort());
  assert.deepEqual(inverso[0].campi, {});
  assert.equal(canonico(inverso[0].attesoOra), canonico(piano.mutazioni[0].dopo));
  const dopo = applicaFaseInMemoria({ righe, atleti }, piano.mutazioni);
  const tornato = applicaInversaFaseInMemoria(dopo, inverso);
  assert.deepEqual(tornato.atleti[0].data, { altro: 1 });
});
