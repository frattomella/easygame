import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Fortitudo Scauri: la creazione/modifica di un allenamento non seleziona
 * categorie, seleziona gruppi operativi — e sempre gli stessi.**
 *
 * ---
 *
 * `tests/lib/categoria-omonima-programma-allenamenti.test.mjs` misura la
 * regola (il conteggio e per nome, non per `categoryId`); questa misura che
 * le superfici la applichino davvero, e che nessuna delle due sia rimasta
 * indietro rispetto all'altra.
 *
 * Il secondo difetto qui accertato e diverso dal primo: nel dialogo
 * "Modifica Allenamento Programma" di `WeeklyTrainingSchedulePanel.tsx` la
 * tendina "Gruppo" leggeva le sue `<option>` da `categories` — l'anagrafica
 * canonica del club, non filtrata per rilevanza — mentre il valore legato e
 * l'`onChange` interpretavano quello stesso valore come un id di **gruppo**
 * (`group:categoryId:siteId`). I due non potevano mai incontrarsi: la
 * selezione appariva vuota e cambiarla non cambiava niente. Il dialogo
 * "Aggiungi Nuovo Allenamento" dello stesso pannello non aveva questo
 * difetto: leggeva gia `groupOptions`. Le prove sotto lo dicono per i due
 * dialoghi insieme, cosi una futura divergenza fra "aggiungi" e "modifica"
 * si vede qui prima che a schermo.
 */

const SRC = path.join(process.cwd(), "src");
const senzaCommenti = (testo) =>
  readFileSync(testo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

/* ------------------------------------------------------------------ */
/* Creazione ed modifica allenamento (calendario): TrainingGroupSelector */
/* ------------------------------------------------------------------ */

test("il selettore condiviso conta le omonime per nome, non per categoryId", () => {
  const codice = senzaCommenti(
    path.join(SRC, "components", "training", "TrainingGroupSelector.tsx"),
  );

  assert.match(
    codice,
    /groupsPerCategoryName/,
    "il conteggio deve chiamarsi ed essere per nome, non per categoryId",
  );
  assert.match(
    codice,
    /group\.categoryName\.trim\(\)\.toLowerCase\(\)/,
    "la chiave del conteggio e il nome normalizzato",
  );
  assert.doesNotMatch(
    codice,
    /counts\.set\(group\.categoryId,/,
    "non deve essere rimasto il conteggio per categoryId",
  );
});

for (const file of [
  "components/forms/AddTrainingForm.tsx",
  "components/forms/EditTrainingForm.tsx",
]) {
  test(`${file} usa il selettore condiviso di gruppi`, () => {
    const codice = senzaCommenti(path.join(SRC, ...file.split("/")));
    assert.match(codice, /<TrainingGroupSelector/);
  });
}

/* ------------------------------------------------------------------ */
/* Programma settimanale: WeeklyTrainingSchedulePanel.tsx               */
/* ------------------------------------------------------------------ */

test("il programma settimanale conta le omonime per nome, non per categoryId", () => {
  const codice = senzaCommenti(
    path.join(SRC, "components", "dashboard", "WeeklyTrainingSchedulePanel.tsx"),
  );

  assert.match(codice, /groupsPerCategoryName/);
  assert.doesNotMatch(
    codice,
    /counts\.set\(group\.categoryId,/,
    "non deve essere rimasto il conteggio per categoryId",
  );
});

test("il dialogo di modifica del programma settimanale sceglie un gruppo, non una categoria grezza", () => {
  const codice = senzaCommenti(
    path.join(SRC, "components", "dashboard", "WeeklyTrainingSchedulePanel.tsx"),
  );

  /*
    Il difetto riprodotto: dentro la select "Gruppo" del dialogo di modifica
    le opzioni venivano da `categories.map`, con `value={category.id}` — un
    identificativo di categoria, non di gruppo. Non deve tornare.
  */
  assert.doesNotMatch(
    codice,
    /\{categories\.map\(\(category\) => \(\s*<option key=\{category\.id\} value=\{category\.id\}>/,
    "la select «Gruppo» non deve tornare a leggere le categorie grezze",
  );

  /*
    Entrambi i dialoghi (aggiungi e modifica) devono mappare `groupOptions`
    con la stessa etichetta canonica: due copie che divergono sono il
    difetto, non la correzione.
  */
  const occorrenzeGroupOptionsMap = codice.match(
    /\{groupOptions\.map\(\(group\) => \(\s*<option key=\{group\.id\} value=\{group\.id\}>\s*\{getGroupLabel\(group\)\}/g,
  );
  assert.equal(
    occorrenzeGroupOptionsMap?.length,
    2,
    "sia «Aggiungi» sia «Modifica» devono elencare gli stessi gruppi con la stessa etichetta",
  );
});
