import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ATHLETE_PROFILE_TABS,
  resolveAthleteProfileTab,
} from "../../src/lib/athlete-profile-tabs.ts";

/**
 * **Le sezioni della scheda atleta hanno un nome anche da telefono.**
 *
 * Il difetto, trovato aprendo la scheda a 375 px nel Blocco E: cinque delle
 * sette sezioni mostravano la sola icona, con l'etichetta chiusa in uno
 * `<span className="hidden sm:inline">`. `display: none` non nasconde soltanto
 * alla vista: toglie il testo dall'albero di accessibilita, quindi il nome
 * accessibile della scheda spariva insieme all'etichetta. Da uno smartphone
 * restavano cinque schede senza nome — un utente vedeva un cuore, un dollaro
 * e una maglietta, uno screen reader non sentiva niente — e fra quelle c'era
 * **Iscrizione**, cioe il posto dove si guardano le rate.
 *
 * Non serviva nemmeno a far stare la barra nello schermo: il contenitore ha
 * `overflow-x-auto` e le schede hanno `whitespace-nowrap`, quindi la barra
 * scorre. Che le etichette ci stiano lo dimostravano gia le due sezioni che
 * la tenevano sempre visibile.
 */

const BARRA = path.join(
  process.cwd(),
  "src/components/athletes/profile/athlete-profile-tabs.tsx",
);

const sorgente = () => readFileSync(BARRA, "utf8");

test("nessuna etichetta di sezione e nascosta dietro un breakpoint", () => {
  assert.doesNotMatch(
    sorgente(),
    /hidden\s+[a-z]{2}:inline/,
    "un'etichetta con `display: none` sparisce anche dal nome accessibile della scheda",
  );
});

test("la barra continua a scorrere invece di mandare a capo", () => {
  /*
    L'alternativa sbagliata alla correzione sarebbe stata far andare a capo le
    sette sezioni: a 375 px due righe di schede spingono il contenuto sotto la
    piega prima che la pagina cominci.
  */
  const source = sorgente();

  assert.match(source, /overflow-x-auto/);
  assert.match(source, /flex-nowrap/);
  assert.match(source, /whitespace-nowrap/);
});

test("ogni sezione ha un'etichetta, e l'icona non la sostituisce", () => {
  for (const tab of ATHLETE_PROFILE_TABS) {
    assert.ok(
      tab.label && tab.label.trim().length > 0,
      `la sezione ${tab.value} deve avere un'etichetta`,
    );
  }

  assert.equal(ATHLETE_PROFILE_TABS.length, 7);
  assert.ok(
    ATHLETE_PROFILE_TABS.some((tab) => tab.label === "Iscrizione"),
    "la sezione dove si guardano le rate si chiama Iscrizione",
  );
});

test("un indirizzo con una sezione sconosciuta atterra su Generale", () => {
  assert.equal(resolveAthleteProfileTab("pagamenti"), "pagamenti");
  assert.equal(resolveAthleteProfileTab("inesistente"), "generale");
  assert.equal(resolveAthleteProfileTab(null), "generale");
});

/**
 * **I comandi a sola icona hanno un nome.**
 *
 * Sempre nel Blocco E, contando i controlli senza nome accessibile a schermo:
 * la scheda atleta aveva sei matite identiche — informazioni generali,
 * contatti, tutore, indirizzo, dati sanitari, documento — tutte senza
 * etichetta; e l'elenco atleti aveva **una** riga di puntini per atleta,
 * duecento pulsanti indistinguibili su una pagina sola.
 */

const SCHEDA = path.join(process.cwd(), "src/app/athletes/[id]/page.tsx");
const ELENCO = path.join(process.cwd(), "src/app/athletes/page.tsx");

test("le matite della scheda atleta dicono cosa modificano", () => {
  const source = readFileSync(SCHEDA, "utf8");

  const sezioni = ["general", "contact", "address", "medical", "identity"];
  for (const sezione of sezioni) {
    const indice = source.indexOf(`handleEditSection("${sezione}")`);
    assert.ok(indice > 0, `manca il comando di modifica per ${sezione}`);
    assert.match(
      source.slice(Math.max(0, indice - 260), indice),
      /aria-label=/,
      `il comando di modifica di ${sezione} e una icona senza nome`,
    );
  }

  const tutore = source.indexOf("openEditGuardianModal(idx)");
  assert.ok(tutore > 0);
  assert.match(source.slice(Math.max(0, tutore - 260), tutore), /aria-label=/);
});

test("la riga di un atleta dice di quale atleta sono le azioni", () => {
  const source = readFileSync(ELENCO, "utf8");
  const indice = source.indexOf("<MoreVertical className=\"h-4 w-4\" />");

  assert.ok(indice > 0, "il comando di riga non c'e piu");
  assert.match(
    source.slice(Math.max(0, indice - 300), indice),
    /aria-label=\{`Azioni per \$\{athlete\.name\}`\}/,
    "duecento pulsanti chiamati tutti «button» non si distinguono",
  );
});

test("la riga di una categoria dice di quale categoria sono le azioni", () => {
  /*
    Stesso comando, stesso difetto, altra pagina: il menu «...» di ogni
    categoria era senza nome. Uno per categoria, quindi meno rumoroso di
    quello dell'elenco atleti e ugualmente muto.
  */
  const source = readFileSync(
    path.join(process.cwd(), "src/app/categories/page.tsx"),
    "utf8",
  );
  const indice = source.indexOf("<MoreVertical className=\"h-4 w-4\" />");

  assert.ok(indice > 0);
  assert.match(
    source.slice(Math.max(0, indice - 300), indice),
    /aria-label=\{`Azioni per \$\{category\.name\}`\}/,
  );
});
