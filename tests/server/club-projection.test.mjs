import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  projectClubResponse,
  resolveClubProjection,
} from "../../src/lib/server/resources.ts";

/**
 * `?fields=` sul club: cosa promette e cosa deve mantenere.
 *
 * **Il difetto trovato in RC Fix 1.** L'elenco dei campi proiettabili non
 * comprendeva l'anagrafica scalare: indirizzo, CAP, regione, paese, dati
 * fiscali, IBAN. Un chiamante che li chiedeva non riceveva un errore — li
 * riceveva **vuoti**. E chi legge il profilo per riscriverne una sezione —
 * l'avvio guidato, e da RC Fix 1 l'autosave della scheda Club — li avrebbe
 * riscritti a `null`.
 *
 * Una proiezione che tace un campo richiesto non e una proiezione: e una
 * perdita di dati. Da qui l'invariante: **ogni campo che il caricatore del
 * profilo chiede deve essere proiettabile.**
 */

const params = (fields) => new URLSearchParams(fields ? { fields } : {});

const CLUB_PROFILE_SOURCE = readFileSync(
  path.join(process.cwd(), "src/lib/club-profile.ts"),
  "utf8",
);

/** I campi che `loadClubProfile` chiede davvero, letti dal sorgente. */
const requestedProfileFields = () => {
  const block = /const CLUB_PROFILE_FIELDS = \[([\s\S]*?)\];/.exec(
    CLUB_PROFILE_SOURCE,
  );
  assert.ok(block, "CLUB_PROFILE_FIELDS non trovato");

  return block[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^"|"$/g, ""))
    .filter((entry) => /^[a-z_]+$/.test(entry));
};

test("il caricatore del profilo chiede un elenco non banale", () => {
  const fields = requestedProfileFields();
  assert.equal(fields.length > 15, true, `trovati solo ${fields.length} campi`);
  assert.equal(fields.includes("iban"), true);
  assert.equal(fields.includes("address"), true);
});

test("ogni campo chiesto dal profilo del club e proiettabile", () => {
  const fields = requestedProfileFields();
  const projection = resolveClubProjection("clubs", params(fields.join(",")));

  const missing = fields.filter((field) => !projection?.[field]);
  assert.deepEqual(
    missing,
    [],
    "un campo chiesto e non proiettato torna vuoto, e chi risalva lo azzera",
  );
});

test("la stessa proiezione vale per l'alias organizations", () => {
  const projection = resolveClubProjection(
    "organizations",
    params("iban,legal_city"),
  );

  assert.equal(projection?.iban, true);
  assert.equal(projection?.legal_city, true);
});

test("i campi di servizio arrivano sempre, anche se non richiesti", () => {
  const projection = resolveClubProjection("clubs", params("city"));

  for (const mandatory of ["id", "slug", "name", "settings"]) {
    assert.equal(
      projection?.[mandatory],
      true,
      `${mandatory} serve a chiunque legga un club`,
    );
  }
});

test("un campo sconosciuto viene ignorato, non fatto arrivare al database", () => {
  const projection = resolveClubProjection(
    "clubs",
    params("password_hash,nome_inventato,city"),
  );

  assert.equal(Object.hasOwn(projection, "password_hash"), false);
  assert.equal(Object.hasOwn(projection, "nome_inventato"), false);
  assert.equal(projection.city, true);
});

test("senza `fields` la risposta resta completa", () => {
  assert.equal(resolveClubProjection("clubs", params()), undefined);
  assert.equal(resolveClubProjection("athletes", params("id")), undefined);
});

test("la risposta di una scrittura porta la stessa proiezione", () => {
  const record = { id: "c1", name: "ASD", iban: "IT60X", settings: {}, slug: "asd" };

  assert.deepEqual(projectClubResponse("clubs", record, params("iban")), {
    id: "c1",
    name: "ASD",
    iban: "IT60X",
    settings: {},
    slug: "asd",
  });

  assert.deepEqual(
    projectClubResponse("clubs", record, params("name")),
    { id: "c1", name: "ASD", settings: {}, slug: "asd" },
    "l'IBAN non richiesto non torna indietro",
  );
});
