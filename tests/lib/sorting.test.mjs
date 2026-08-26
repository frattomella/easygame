import assert from "node:assert/strict";
import test from "node:test";

import {
  compareNameValues,
  sortByName,
  sortByNameKeys,
} from "../../src/lib/sorting.ts";
import {
  compareAthletesByLastName,
  sortPeopleByLastName,
} from "../../src/lib/athlete-name-utils.ts";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const readSource = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

/**
 * Regressione Web V1 Blocco 5 - ordinamento nominale centralizzato.
 *
 * Prima ogni pagina si scriveva il proprio `localeCompare`: locale, opzioni e
 * trattamento dei valori vuoti cambiavano da elenco a elenco.
 */

test("l'ordinamento ignora le maiuscole", () => {
  assert.deepEqual(
    sortByName(
      [{ name: "rossi" }, { name: "Bianchi" }, { name: "aMATO" }],
      (item) => item.name,
    ).map((item) => item.name),
    ["aMATO", "Bianchi", "rossi"],
  );
});

test("i numeri nei nomi si ordinano come numeri", () => {
  assert.deepEqual(
    sortByName(
      [{ name: "Under 10" }, { name: "Under 9" }, { name: "Under 15" }],
      (item) => item.name,
    ).map((item) => item.name),
    ["Under 9", "Under 10", "Under 15"],
  );
});

test("i valori vuoti finiscono in fondo, non in testa", () => {
  assert.deepEqual(
    sortByName(
      [{ name: "" }, { name: "Zeta" }, { name: null }, { name: "Alfa" }],
      (item) => item.name,
    ).map((item) => item.name),
    ["Alfa", "Zeta", "", null],
  );

  assert.ok(compareNameValues("", "Alfa") > 0);
  assert.ok(compareNameValues("Alfa", "") < 0);
  assert.equal(compareNameValues("", ""), 0);
});

test("l'ordinamento e stabile a parita di nome", () => {
  const input = [
    { name: "Rossi", id: 1 },
    { name: "rossi", id: 2 },
    { name: "ROSSI", id: 3 },
  ];

  assert.deepEqual(
    sortByName(input, (item) => item.name).map((item) => item.id),
    [1, 2, 3],
  );
});

test("sortByName non muta la collezione di partenza", () => {
  const input = [{ name: "Zeta" }, { name: "Alfa" }];
  const sorted = sortByName(input, (item) => item.name);

  assert.equal(input[0].name, "Zeta");
  assert.notEqual(sorted, input);
});

test("sortByNameKeys usa la seconda chiave solo a parita di prima", () => {
  assert.deepEqual(
    sortByNameKeys(
      [
        { last: "Rossi", first: "Marco" },
        { last: "Rossi", first: "Anna" },
        { last: "Bianchi", first: "Zeno" },
      ],
      (item) => [item.last, item.first],
    ).map((item) => `${item.last} ${item.first}`),
    ["Bianchi Zeno", "Rossi Anna", "Rossi Marco"],
  );
});

test("le persone si ordinano per Cognome poi Nome", () => {
  const people = [
    { first_name: "Marco", last_name: "Rossi" },
    { first_name: "Anna", last_name: "rossi" },
    { first_name: "Zeno", last_name: "Bianchi" },
  ];

  assert.deepEqual(
    sortPeopleByLastName(people).map(
      (person) => `${person.last_name} ${person.first_name}`,
    ),
    ["Bianchi Zeno", "rossi Anna", "Rossi Marco"],
  );
});

test("il comparatore persone accetta anche camelCase e il solo nome completo", () => {
  assert.ok(
    compareAthletesByLastName(
      { firstName: "Anna", lastName: "Bianchi" },
      { first_name: "Marco", last_name: "Rossi" },
    ) < 0,
  );

  // Senza cognome separato resta l'etichetta: non si indovina dove finisca il
  // cognome dentro un campo unico.
  assert.ok(
    compareAthletesByLastName({ name: "Anna Bianchi" }, { name: "Zeno Verdi" }) <
      0,
  );
});

/* ------------------------------- l'ordine non e alfabetico dappertutto */

/**
 * Dove l'ordine ha un significato, l'alfabetico lo distrugge.
 *
 * Le persone si ordinano per Cognome, Nome; i gruppi per Categoria, Sede
 * (ADR-0055). Ma rate, periodi di un contributo, movimenti e documenti hanno
 * un ordine **loro** — cronologico, o quello del piano — e riordinarli per
 * nome li renderebbe illeggibili: la «Rata 10» verrebbe prima della «Rata 2»,
 * e una ricevuta di gennaio dopo una di dicembre.
 *
 * Questo test non guarda un modulo: guarda le superfici che quell'ordine lo
 * producono, e verifica che non abbiano cominciato a ordinare per nome.
 */
test("le sequenze che hanno un ordine proprio non passano dall'alfabetico", () => {
  const offenders = [];

  const superfici = [
    // Le rate seguono il piano, e i loro incassi la cronologia.
    ["components/payments/InstallmentLedgerList.tsx", /sortByName|localeCompare/],
    // I periodi di un contributo seguono il calendario del bando.
    ["components/funding/FundingPeriodsTable.tsx", /sortByName|localeCompare/],
    // Il registro incassi ordina per data, e lo fa nel dominio.
    ["components/payments/use-athlete-payment-ledger.ts", /sortByName/],
  ];

  for (const [file, pattern] of superfici) {
    if (pattern.test(readSource(file))) offenders.push(file);
  }

  assert.deepEqual(
    offenders,
    [],
    "un ordine cronologico riordinato per nome smette di essere leggibile",
  );
});

test("i documenti fiscali si leggono dal piu recente", () => {
  const source = readSource(
    "components/athletes/enrollment/AthleteEnrollmentTab.tsx",
  );

  assert.match(
    source,
    /String\(right\.issueDate \|\| ""\)\.localeCompare\(/,
    "una cronologia si legge dal fondo, non dalla A",
  );
});

/**
 * Gli elenchi di persone e di gruppi, invece, l'alfabetico ce l'hanno.
 */
test("gli elenchi nominali passano dai comparatori condivisi", () => {
  const missing = [];

  const superfici = [
    ["app/athletes/page.tsx", /compareCategoryGroups\(/],
    ["app/trainers/[id]/page.tsx", /compareCategoryGroups\)/],
    ["app/athletes/new/page.tsx", /sortByName\(/],
  ];

  for (const [file, pattern] of superfici) {
    if (!pattern.test(readSource(file))) missing.push(file);
  }

  assert.deepEqual(
    missing,
    [],
    "ogni elenco nominale deve usare il comparatore condiviso, non un ordinamento suo",
  );
});
