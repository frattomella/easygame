import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CREATE_CLUB_REQUIRED_FIELDS,
  CREATE_CLUB_TABS,
} from "../../src/components/account/account-shared.ts";

/**
 * Il pannello con cui nasce un club.
 *
 * E la prima schermata complessa che un cliente nuovo incontra, ed e a schede.
 * Le schede di questo pannello **smontano** il contenuto: cio che non e sotto
 * gli occhi non esiste nel DOM. Da questo discendono i due difetti fissati
 * qui, e non si vedono leggendo una scheda per volta.
 */

const ROOT = process.cwd();
const read = (relative) =>
  readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");

const dialog = () => read("src/components/account/account-create-club-dialog.tsx");

/**
 * `InputWithLabel` ricavava l'id dal testo dell'etichetta. Nel pannello ci
 * sono due «Nome contatto», due «Telefono», due «Email» e una coppia di campi
 * per **ogni** federazione aggiunta: con id ripetuti, `htmlFor` porta sempre
 * al primo, e cliccare l'etichetta del secondo contatto sposta il cursore nel
 * campo del primo.
 */
test("gli id dei campi del pannello non si possono ripetere", () => {
  const source = dialog();

  assert.equal(
    /label\s*\n?\s*\.toLowerCase\(\)/.test(source),
    false,
    "l'id non deve piu derivare dal testo dell'etichetta",
  );
  assert.match(source, /const generatedId = useId\(\);/);
  assert.match(source, /const inputId = id \|\| `campo-\$\{generatedId\}`;/);

  /*
    E le etichette ripetute devono restare ripetute: sono corrette — il
    secondo contatto ha davvero un nome, un telefono e un'email. Il difetto
    era l'id, non la parola.
  */
  const labels = [...source.matchAll(/<InputWithLabel label="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    labels.filter((label) => label === "Nome contatto").length === 2,
    "i due contatti restano due",
  );
});

/**
 * `required` su un campo di una scheda chiusa non viene valutato dal browser:
 * il modulo risultava valido e il controllo restava solo quello applicativo,
 * che nominava campi invisibili.
 */
test("ogni campo obbligatorio dichiara la scheda in cui si trova", () => {
  const tabs = new Set(CREATE_CLUB_TABS.map((tab) => tab.value));

  assert.ok(CREATE_CLUB_REQUIRED_FIELDS.length > 0);
  for (const entry of CREATE_CLUB_REQUIRED_FIELDS) {
    assert.ok(
      tabs.has(entry.tab),
      `${entry.field}: la scheda «${entry.tab}» non esiste nel pannello`,
    );
    assert.ok(entry.label.trim(), `${entry.field}: manca il nome leggibile`);
  }

  /*
    Il caso che ha prodotto il difetto: due obbligatori vivono fuori dalla
    scheda che si apre per prima. Finche e cosi, la correzione serve.
  */
  const firstTab = CREATE_CLUB_TABS[0].value;
  assert.ok(
    CREATE_CLUB_REQUIRED_FIELDS.some((entry) => entry.tab !== firstTab),
    "il test ha senso solo se un obbligatorio sta in un'altra scheda",
  );
});

test("il controllo porta alla scheda del primo dato mancante", () => {
  const screen = read("src/components/account/account-home-screen.tsx");

  assert.match(
    screen,
    /const missing = CREATE_CLUB_REQUIRED_FIELDS\.filter\(/,
  );
  assert.match(screen, /setCreateClubTab\(missing\[0\]\.tab\);/);
  assert.equal(
    /Compila almeno nome, tipologia, indirizzo, citta, provincia, email e telefono\./.test(
      screen,
    ),
    false,
    "il messaggio non deve piu elencare campi che non mancano",
  );

  /*
    E il messaggio dice quanti e quali: «mancano ancora 2 dati obbligatori»
    con l'elenco, non una formula fissa che vale per sette campi sempre.
  */
  assert.match(screen, /missing\.length === 1/);
  assert.match(screen, /\.map\(\(entry\) => entry\.label\)/);
});

/**
 * L'ordine dei sei dati anagrafici e un componente da ADR-0066. La griglia di
 * inserimento rapido dell'onboarding non lo monta — chiede tre dati su sei —
 * ma li chiedeva anche in un ordine suo.
 */
test("l'inserimento rapido dell'onboarding chiede Nome prima di Cognome", () => {
  const source = read("src/app/onboarding/page.tsx");

  const first = source.indexOf("onboarding-athlete-first-${index}");
  const last = source.indexOf("onboarding-athlete-last-${index}");
  const birth = source.indexOf("onboarding-athlete-birth-${index}");

  assert.ok(first > 0 && last > 0 && birth > 0, "i tre campi devono esistere");
  assert.ok(first < last, "Nome viene prima di Cognome");
  assert.ok(last < birth, "Data di nascita viene dopo Cognome");

  /*
    E la maiuscola si vede mentre si scrive, come in ogni altra anagrafica:
    prima compariva solo dopo il salvataggio, perche la metteva il server.
  */
  assert.match(
    source,
    /<CapitalizedInput\s*\n\s*id=\{`onboarding-athlete-first-\$\{index\}`\}/,
  );
  assert.match(
    source,
    /<CapitalizedInput\s*\n\s*id=\{`onboarding-athlete-last-\$\{index\}`\}/,
  );
});
