import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * La scheda atleta dopo l'integrazione dei tre workstream.
 *
 * Perche questo test esiste. Pagamenti V2, multi-sede e Modulistica V2 hanno
 * toccato tutti e tre, indirettamente, la stessa pagina — la piu grande del
 * repository. Nessuno dei tre poteva vedere gli altri due. Il rischio non era
 * il conflitto, che Git segnala: era la **convergenza silenziosa**, cioe due
 * rami che aggiungono la stessa cosa in due punti diversi e un merge pulito
 * che monta due volte lo stesso pannello.
 *
 * Il secondo rischio e la crescita. La regola di CLAUDE.md e che la logica di
 * dominio non sta in `page.tsx`: quando tre workstream aggiungono funzioni a
 * una pagina da ottomila righe, la strada corta e scriverle li dentro. Il
 * test fissa la direzione: la pagina **monta** componenti e **legge** valori
 * gia calcolati, non li ricalcola.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const PAGE = path.join(PROJECT_ROOT, "src/app/athletes/[id]/page.tsx");

// I fine riga sono normalizzati: nessuna asserzione deve dipendere dal
// checkout (D30, e `.gitattributes`).
const source = readFileSync(PAGE, "utf8").replace(/\r\n/g, "\n");
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Le otto aree che l'audit di integrazione deve trovare montate. */
const AREE = [
  ["pagamenti", /<AthletePaymentLedger\b/],
  ["voucher e contributi", /<AthleteFundingSummary\b/],
  ["modulistica", /<CompileFormDialog\b/],
  ["categorie, sede e gruppo", /<AthleteCategoriesPanel\b/],
  ["documenti", /<CardTitle>Altri Documenti<\/CardTitle>/],
  ["allegati", /<CertificateAttachmentField\b/],
  ["genitori", /getGuardianDisplayName\b/],
  ["kit e taglie", /<CardTitle>Assegnazioni kit<\/CardTitle>/],
];

test("le otto aree toccate dai tre workstream sono tutte montate", () => {
  const mancanti = AREE.filter(([, pattern]) => !pattern.test(code)).map(
    ([nome]) => nome,
  );

  assert.deepEqual(
    mancanti,
    [],
    "un'area sparita in un merge non si nota finche non la cerca un utente",
  );
});

test("nessun pannello nuovo e montato due volte", () => {
  /*
    Il rischio vero di tre rami paralleli sulla stessa pagina non e il
    conflitto — quello Git lo segnala — ma il merge pulito che monta due
    volte lo stesso riquadro perche due rami lo hanno aggiunto in due punti
    diversi.
  */
  const doppioni = [
    "AthletePaymentLedger",
    "AthleteFundingSummary",
    "AthleteCategoriesPanel",
    "CompileFormDialog",
    "AthletePaymentDialogs",
  ].filter((componente) => {
    const occorrenze = code.match(new RegExp(`<${componente}\\b`, "g")) || [];
    return occorrenze.length > 1;
  });

  assert.deepEqual(doppioni, [], "un pannello montato due volte e un merge riuscito male");
});

test("nessun import e dichiarato due volte", () => {
  const simboli = [];
  for (const m of source.matchAll(/^import \{([^}]+)\}/gm)) {
    for (const parte of m[1].split(",")) {
      const nome = parte.trim().split(/\s+as\s+/)[0].trim();
      if (nome && nome !== "type") simboli.push(nome);
    }
  }

  const duplicati = [...new Set(simboli.filter((s, i) => simboli.indexOf(s) !== i))];

  assert.deepEqual(duplicati, [], "due import dello stesso simbolo sono un residuo di merge");
});

test("lo stato di una rata si legge, non si ricalcola nella pagina", () => {
  /*
    ADR-0036: lo stato di una rata e un calcolo del registro incassi, non un
    dato che l'interfaccia decide. La pagina puo leggere `statusKey`, che
    `athlete-payment-utils` ha gia derivato; non puo confrontare importi per
    dedurne uno proprio.
  */
  assert.equal(
    /resolveInstallmentLedger\s*\(/.test(code),
    false,
    "il registro incassi si risolve nel dominio o nel componente, non nella pagina",
  );

  const sommeSospette =
    /const\s+\w*(paid|settled|outstanding|residu)\w*\s*=\s*[^;\n]*\.reduce\(/i.test(
      code,
    );
  assert.equal(
    sommeSospette,
    false,
    "sommare gli incassi nella pagina reintrodurrebbe il difetto che ADR-0036 chiude",
  );
});

test("la pagina non e cresciuta rispetto alla baseline del Blocco 8", () => {
  /*
    8480 righe era la scheda alla fine del Blocco 8. Tre workstream hanno
    aggiunto rate e incassi, voucher, sede sull'appartenenza e «Compila
    modulo», e la pagina e **diminuita**: ogni funzione nuova e entrata come
    componente. Il numero non e un obiettivo estetico — e la prova che la
    direzione e quella giusta. Se un giorno risale sopra la baseline, la cosa
    da fare non e alzare la soglia: e estrarre.
  */
  const righe = source.split("\n").length;

  assert.ok(
    righe <= 8480,
    `la scheda atleta ha ${righe} righe: sopra le 8480 della baseline, estrarre invece di aggiungere`,
  );
});

test("i contributi non stanno nello stesso riquadro degli incassi", () => {
  /*
    ADR-0037: una rata e denaro della famiglia, un voucher e un credito verso
    un ente. Il momento in cui finiscono nella stessa somma e il momento in
    cui smettono di essere leggibili.
  */
  const incassi = code.indexOf("<AthletePaymentLedger");
  const contributi = code.indexOf("<AthleteFundingSummary");

  assert.ok(incassi > 0 && contributi > 0, "servono montati entrambi");

  const fraIDue = code.slice(
    Math.min(incassi, contributi),
    Math.max(incassi, contributi),
  );

  assert.match(
    fraIDue,
    /<\/Card>/,
    "fra i due deve chiudersi una Card: sono due riquadri, non due meta dello stesso",
  );
});
