import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  normalizeTrainerList,
  getTrainerGroupIds,
} from "../../src/lib/trainer-utils.ts";
import {
  personExportScopeLabel,
  personExportValue,
} from "../../src/lib/person-export.ts";

/**
 * I difetti che si sono visti solo usando l'applicazione su staging.
 *
 * RC Fix 1 aveva imparato che i difetti veri si vedono aprendo la pagina.
 * RC Fix 2 lo aveva confermato. Questa terza tornata lo conferma una volta di
 * piu, e in modo piu scomodo: **nessuno dei difetti qui sotto era visibile
 * leggendo il codice della funzione che li conteneva.**
 *
 * L'assegnazione di massa a un gruppo, letta nel suo file, unisce l'elenco
 * esistente con il nuovo gruppo — e la riga di codice dice proprio «si
 * aggiunge, non si sostituisce». Il difetto stava **due moduli piu in la**,
 * nel modello di lettura che quell'elenco non lo portava: la unione era fra
 * un insieme vuoto e un elemento, cioe una sostituzione.
 *
 * Lo stesso vale per le colonne del PDF: la funzione che le risolve e
 * corretta per gli atleti, dove `name` e il nome di battesimo. E sbagliata
 * per allenatori e soci, dove `name` e il nome intero. Nessuna delle due
 * cose si vede senza guardare un dato vero.
 */

const read = (relative) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

// --- il modello di lettura dell'allenatore -----------------------------------

/**
 * Il difetto: un modello che perde per strada i campi che servono dopo.
 *
 * `normalizeTrainerList` costruisce la riga che la pagina Allenatori tiene in
 * memoria. Teneva solo il nome intero e le categorie, e ogni funzione a valle
 * doveva indovinare il resto: il cognome spezzando la stringa, i gruppi
 * leggendo un campo che non c'era.
 */
test("il modello dell'allenatore porta nome, cognome e gruppi dichiarati", () => {
  const [trainer] = normalizeTrainerList([
    {
      id: "trainer-1",
      name: "Anna Rossi Uat",
      firstName: "Anna",
      lastName: "Rossi Uat",
      email: "anna@example.invalid",
      groupIds: ["group:pulcini:roma"],
    },
  ]);

  assert.equal(trainer.name, "Anna Rossi Uat");
  assert.equal(trainer.firstName, "Anna");
  assert.equal(
    trainer.lastName,
    "Rossi Uat",
    "un cognome di due parole non si ricava dall'ultima parola del nome intero",
  );
  assert.deepEqual(trainer.groupIds, ["group:pulcini:roma"]);
});

/**
 * Lo stesso allenatore arriva da `clubs.trainers` e dalla riga risorsa: i
 * gruppi delle due copie si uniscono, come gia facevano le categorie.
 */
test("le due origini dello stesso allenatore uniscono i gruppi", () => {
  const [trainer] = normalizeTrainerList([
    [{ id: "trainer-1", name: "Anna Rossi Uat", groupIds: ["group:a"] }],
    [{ id: "trainer-1", name: "Anna Rossi Uat", groupIds: ["group:b"] }],
  ]);

  assert.deepEqual(trainer.groupIds.slice().sort(), ["group:a", "group:b"]);
});

/**
 * **Il difetto grave di questa tornata.**
 *
 * Assegnata Anna a «UAT Pulcini · Roma», poi ad «Aprilia», su staging il suo
 * elenco gruppi era `[Aprilia]`: Roma era stata tolta senza dirlo. La riga
 * che assegna fa `new Set([...getTrainerGroupIds(trainer), group.id])` — ed e
 * corretta. Era `trainer` a non avere `groupIds`.
 *
 * Il test riproduce l'unione **sul modello normalizzato**, che e cio che la
 * pagina passa davvero.
 */
test("assegnare un secondo gruppo aggiunge, non sostituisce", () => {
  const [trainer] = normalizeTrainerList([
    { id: "trainer-1", name: "Anna Rossi Uat", groupIds: ["group:roma"] },
  ]);

  const assegnato = Array.from(
    new Set([...getTrainerGroupIds(trainer), "group:aprilia"]),
  );

  assert.deepEqual(assegnato, ["group:roma", "group:aprilia"]);
});

// --- le colonne Cognome e Nome del PDF ---------------------------------------

/**
 * Il difetto a schermo: nell'export Allenatori la colonna «Cognome» diceva
 * «Uat» e la colonna «Nome» diceva «Anna Rossi Uat».
 */
test("l'export di un allenatore separa cognome e nome", () => {
  const trainer = {
    id: "trainer-1",
    name: "Anna Rossi Uat",
    firstName: "Anna",
    lastName: "Rossi Uat",
  };

  assert.equal(personExportValue(trainer, "lastName"), "Rossi Uat");
  assert.equal(personExportValue(trainer, "firstName"), "Anna");
});

/**
 * Nei Soci `name` contiene il nome intero **in ordine inverso** — l'etichetta
 * dell'elenco e «Cognome Nome» — e il cognome va tolto dalla testa, non dalla
 * coda.
 */
test("l'export di un socio separa cognome e nome, in entrambi gli ordini", () => {
  const conNome = {
    id: "socio-1",
    name: "Della Valle Uat Chiara",
    surname: "Della Valle Uat",
    firstName: "Chiara",
  };
  assert.equal(personExportValue(conNome, "lastName"), "Della Valle Uat");
  assert.equal(personExportValue(conNome, "firstName"), "Chiara");

  // Lo stesso record senza `firstName`: il nome e cio che resta togliendo il
  // cognome, che qui sta in testa.
  const senzaNome = {
    id: "socio-2",
    name: "Della Valle Uat Chiara",
    surname: "Della Valle Uat",
  };
  assert.equal(personExportValue(senzaNome, "firstName"), "Chiara");

  // E con il cognome in coda, che e la forma degli allenatori.
  const inCoda = {
    id: "socio-3",
    name: "Chiara Della Valle Uat",
    surname: "Della Valle Uat",
  };
  assert.equal(personExportValue(inCoda, "firstName"), "Chiara");
});

/**
 * Lo staff scrive `name` = nome e `surname` = cognome, come gli atleti: il
 * cambio di ordine delle chiavi non deve toccarlo.
 */
test("l'export dello staff non cambia comportamento", () => {
  const membro = {
    id: "staff-1",
    name: "Giovanni",
    surname: "De Santis Uat",
    firstName: "Giovanni",
    lastName: "De Santis Uat",
  };

  assert.equal(personExportValue(membro, "lastName"), "De Santis Uat");
  assert.equal(personExportValue(membro, "firstName"), "Giovanni");
});

/** Il ripiego sui record che hanno solo il nome intero resta quello di prima. */
test("un record con il solo nome intero si spezza sull'ultima parola", () => {
  const persona = { id: "x", name: "Mario Rossi" };

  assert.equal(personExportValue(persona, "lastName"), "Rossi");
  assert.equal(personExportValue(persona, "firstName"), "Mario");
});

// --- cosa dice il PDF di se stesso -------------------------------------------

/**
 * Il difetto a schermo: la barra diceva «1 allenatore selezionato» e il PDF
 * generato da quella stessa selezione diceva «1 allenatori selezionati».
 */
test("l'intestazione del PDF concorda il plurale, per tutte e tre le entita", () => {
  assert.equal(
    personExportScopeLabel("trainers", "selected", 1),
    "1 allenatore selezionato",
  );
  assert.equal(
    personExportScopeLabel("trainers", "selected", 2),
    "2 allenatori selezionati",
  );
  assert.equal(
    personExportScopeLabel("staff", "selected", 1),
    "1 membro dello staff selezionato",
  );
  assert.equal(
    personExportScopeLabel("members", "selected", 1),
    "1 socio selezionato",
  );
});

/**
 * Nei Soci il ramo del risultato filtrato non c'era: un export filtrato si
 * dichiarava «in elenco», cioe diceva di contenere piu di quel che conteneva.
 */
test("ogni ambito ha la sua frase, anche nei Soci", () => {
  assert.equal(
    personExportScopeLabel("members", "filtered", 3),
    "3 soci nel risultato filtrato",
  );
  assert.equal(personExportScopeLabel("members", "all", 3), "3 soci in elenco");
  assert.equal(
    personExportScopeLabel("trainers", "filtered", 1),
    "1 allenatore nel risultato filtrato",
  );
});

/**
 * Il conteggio in cima al PDF diceva «Atleti esportati» **su tutti e quattro**
 * gli elenchi, perche era scritto dentro il generatore condiviso.
 */
test("il generatore condiviso non nomina gli atleti", () => {
  const source = read("src/lib/people-pdf-export.ts");

  assert.doesNotMatch(
    source,
    /<strong>Atleti esportati<\/strong>/,
    "il generatore non sa di che entita si tratti: l'etichetta gliela passa chi lo chiama",
  );
  assert.match(source, /countLabel/, "l'etichetta del conteggio e un parametro");
});

/**
 * Le tre schermate passano l'**ambito**, non la frase: la frase la costruisce
 * il modulo condiviso, una volta sola.
 */
test("le pagine non riscrivono a mano l'intestazione del PDF", () => {
  for (const file of [
    "src/app/trainers/page.tsx",
    "src/app/staff/page.tsx",
    "src/app/soci/page.tsx",
  ]) {
    const source = read(file);

    assert.doesNotMatch(
      source,
      /scopeLabel:/,
      `${file}: la frase la decide person-export, non la pagina`,
    );
    assert.match(source, /^\s*scope,\s*$/m, `${file}: passa l'ambito`);
  }

  assert.match(
    read("src/app/athletes/page.tsx"),
    /countLabel: "Atleti esportati"/,
    "l'elenco Atleti dichiara il nome delle sue righe",
  );
});

// --- l'assegnazione si deve vedere -------------------------------------------

/**
 * Su staging l'assegnazione di massa a un gruppo riusciva, scriveva il dato e
 * lasciava la colonna «Categorie» a «-». Un'operazione senza conseguenze
 * visibili e indistinguibile da una che non e avvenuta.
 */
test("l'elenco Allenatori mostra i gruppi assegnati, non solo le categorie", () => {
  const source = read("src/app/trainers/page.tsx");

  assert.match(
    source,
    /trainerAssignmentLabels/,
    "la colonna deve risolvere i gruppi prima delle categorie",
  );
  assert.match(
    source,
    /groupNameById/,
    "un id di gruppo non e un'etichetta: va tradotto in nome",
  );
});
