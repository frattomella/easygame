import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Due schermate dell'allenatore che disegnavano il contenitore e non il
 * contenuto** (PP-03 §8).
 *
 * Non sono difetti di permesso: il vaglio dei destinatari funzionava, la rotta
 * rispondeva, la riga arrivava. Quello che mancava era l'ultimo metro — la
 * chiave con cui la si legge, e l'etichetta con cui la si scrive a schermo. E
 * la forma dell'errore n. 8 di CLAUDE.md §11 nella sua versione piu silenziosa:
 * nessun errore, nessun elenco vuoto, un riquadro che compare e non dice
 * niente.
 *
 * Sono test sul sorgente perche la proprieta da difendere e proprio un accordo
 * fra due file: chi **scrive** la nota e chi la **legge** devono nominare lo
 * stesso campo, e chi mostra una qualifica deve passare dal vocabolario che la
 * definisce. Le due prove comportamentali corrispondenti stanno nel collaudo a
 * schermo (`scripts/pp-03-uat-seed.mjs`), che semina la nota con la grafia del
 * club e la ritrova nella bacheca.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* --------------------------------------------- §8.1 la nota della segreteria */

test("PP-03 §8.1 · la bacheca dell'allenatore legge il campo che la segreteria scrive", () => {
  /*
    La grafia non si scrive a mano nel test: si **ricava dal produttore**. Se
    domani `/secretariat` rinominasse il campo, questa prova fallirebbe
    chiedendo di allineare il lettore, invece di restare verde su una costante
    che non corrisponde piu a niente.
  */
  const segreteria = senzaCommenti(leggi("app/secretariat/page.tsx"));
  const nota = segreteria.match(
    /const note = \{\s*id: `note-\$\{Date\.now\(\)\}`,\s*([a-zA-Z_]+):/,
  );

  assert.ok(
    nota,
    "non si trova piu la nota composta da /secretariat: se la forma e cambiata, questo test va riscritto insieme al lettore",
  );

  const campoScritto = nota[1];
  assert.equal(
    campoScritto,
    "content",
    "la segreteria scrive il corpo della nota in `content`",
  );

  const bacheca = senzaCommenti(
    leggi("components/trainer/trainer-board-dashboard-page.tsx"),
  );

  assert.ok(
    bacheca.includes(`reminder?.${campoScritto}`),
    `la bacheca dell'allenatore non legge \`${campoScritto}\`: il riquadro compare con intestazione, scadenza e destinatario, e senza testo`,
  );
});

test("PP-03 §8.1 · le grafie storiche restano dietro a quella canonica", () => {
  /*
    Una colonna JSON conserva cio che ci e stato scritto in passato. Togliere
    le grafie vecchie svuoterebbe le note gia in archivio invece di riempire
    quelle nuove: il ripiego non e prudenza generica, e la ragione per cui la
    correzione **aggiunge** una chiave in testa e non ne sostituisce una.
  */
  const bacheca = senzaCommenti(
    leggi("components/trainer/trainer-board-dashboard-page.tsx"),
  );

  for (const grafia of ["description", "note"]) {
    assert.ok(
      bacheca.includes(`reminder?.${grafia}`),
      `la grafia storica \`${grafia}\` non e piu letta: le note gia scritte si svuoterebbero`,
    );
  }

  const posizioneCanonica = bacheca.indexOf("reminder?.content");
  const posizioneStorica = bacheca.indexOf("reminder?.description");
  assert.ok(
    posizioneCanonica >= 0 && posizioneCanonica < posizioneStorica,
    "la grafia canonica deve venire prima delle storiche: e quella che il prodotto scrive oggi",
  );
});

/* ------------------------------------------------- §8.2 la qualifica a schermo */

test("PP-03 §8.2 · «I miei compensi» non stampa il gettone grezzo della qualifica", async () => {
  const pagina = senzaCommenti(
    leggi("components/trainer/trainer-compensation-dashboard-page.tsx"),
  );

  assert.ok(
    /SPORT_WORK_ROLE_LABELS/.test(pagina),
    "la qualifica del rapporto usciva grezza: la scheda diceva «COACH», e «OTHER» a chi il club non aveva saputo classificare",
  );

  assert.ok(
    !/\{relationship\.role\}/.test(pagina),
    "`{relationship.role}` stampa il gettone del vocabolario, non la sua etichetta",
  );

  assert.ok(
    /from "@\/lib\/sport-work\/model"/.test(pagina),
    "l'etichetta si prende dal proprietario del vocabolario, non da una quarta copia locale",
  );
});

test("PP-03 §8.2 · ogni qualifica del vocabolario ha un'etichetta leggibile", async () => {
  const modello = await import(
    `file://${path.join(SRC, "lib", "sport-work", "model.ts").replace(/\\/g, "/")}`
  );

  const senzaEtichetta = modello.SPORT_WORK_ROLES.filter(
    (ruolo) => !modello.SPORT_WORK_ROLE_LABELS[ruolo],
  );

  assert.deepEqual(
    senzaEtichetta,
    [],
    "una qualifica senza etichetta ricadrebbe sul gettone, cioe sul difetto che §8.2 chiude",
  );
});
