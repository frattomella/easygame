import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildRegistrationFederationReference,
  isFederationOfClub,
  listClubFederations,
  readRegistrationFederationLabel,
  resolveClubFederation,
} from "../../src/lib/club-federations.ts";
import { normalizeClubFederations } from "../../src/lib/athlete-profile-fields.ts";

/**
 * **N2 — un tesseramento nomina un ente del club, per identificativo.**
 *
 * La federazione era una **stringa libera**: la tendina della scheda offriva i
 * nomi configurati e cio che finiva nel record era il nome. Tre conseguenze,
 * tutte silenziose — rinominare un'affiliazione orfanava ogni tesseramento
 * gia registrato; la maschera di creazione aveva un campo di testo con
 * `placeholder="Es. FIP"`, quindi «FIP», «F.I.P.» e «Fip» erano tre enti; e
 * niente impediva di scrivere un ente che il club non ha, perche la domanda
 * «e uno dei tuoi?» non veniva posta da nessuna parte.
 *
 * `ClubFederationEntry` un `id` ce l'aveva gia, e nessuno lo usava.
 */

const CLUB_CON_DUE = {
  settings: {
    federations: [
      { id: "fed-1", name: "FIP", registrationNumber: "12345" },
      { id: "fed-2", name: "CSEN", registrationNumber: "999" },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Il registro                                                         */
/* ------------------------------------------------------------------ */

test("le federazioni si leggono dai due percorsi storici", () => {
  assert.equal(listClubFederations(CLUB_CON_DUE).length, 2);

  /* La colonna, per i club che la usavano. */
  const daColonna = listClubFederations({
    federations: [{ id: "fed-9", name: "FIGC" }],
  });
  assert.equal(daColonna.length, 1);
  assert.equal(daColonna[0].name, "FIGC");
});

test("una voce storica senza id ne riceve uno stabile, non uno nuovo a ogni lettura", () => {
  /*
    `fed-${Date.now()}` — che e cio che la pagina usa per le voci nuove — su una
    **lettura** darebbe un'identita diversa a ogni caricamento, e nessun
    tesseramento ritroverebbe piu il proprio ente.
  */
  const club = { settings: { federations: ["FIP", { name: "CSEN" }] } };

  const prima = listClubFederations(club);
  const dopo = listClubFederations(club);

  assert.equal(prima.length, 2);
  assert.deepEqual(
    prima.map((voce) => voce.id),
    dopo.map((voce) => voce.id),
    "due letture devono dare le stesse identita",
  );
  assert.equal(prima[0].id, "fed:fip");
});

test("i duplicati si tolgono sull'identificativo", () => {
  const club = {
    settings: {
      federations: [
        { id: "fed-1", name: "FIP" },
        { id: "fed-1", name: "FIP" },
      ],
    },
  };

  assert.equal(listClubFederations(club).length, 1);
});

test("il vecchio lettore per nome resta, e delega", () => {
  /*
    `normalizeClubFederations` restituiva i nomi e lo fa ancora: quel contratto
    e usato altrove. Cio che non deve piu esistere e una **seconda**
    implementazione che legge il registro a modo suo.
  */
  assert.deepEqual(normalizeClubFederations(CLUB_CON_DUE), ["FIP", "CSEN"]);

  const sorgente = readFileSync("src/lib/athlete-profile-fields.ts", "utf8");
  assert.match(
    sorgente,
    /listClubFederations\(clubData\)/,
    "il proprietario del dominio e uno solo",
  );
});

/* ------------------------------------------------------------------ */
/* La risoluzione                                                      */
/* ------------------------------------------------------------------ */

test("un riferimento si risolve per identificativo", () => {
  const federations = listClubFederations(CLUB_CON_DUE);
  assert.equal(resolveClubFederation("fed-2", federations).name, "CSEN");
});

test("e per un nome che ne nomina una sola", () => {
  const federations = listClubFederations(CLUB_CON_DUE);
  assert.equal(resolveClubFederation("FIP", federations).id, "fed-1");
});

test("un nome che ne nomina due non ne nomina nessuna", () => {
  /*
    La stessa regola delle categorie (ADR-0155), sul secondo registro del club:
    scegliere la prima sarebbe legare un tesseramento a un ente a caso.
  */
  const federations = listClubFederations({
    settings: {
      federations: [
        { id: "fed-1", name: "Comitato" },
        { id: "fed-2", name: "Comitato" },
      ],
    },
  });

  assert.equal(resolveClubFederation("Comitato", federations), null);
  assert.equal(resolveClubFederation("fed-2", federations).id, "fed-2");
});

test("un ente che il club non ha non passa", () => {
  const federations = listClubFederations(CLUB_CON_DUE);

  assert.equal(isFederationOfClub("fed-999", federations), false);
  assert.equal(isFederationOfClub("FIGC", federations), false);
  assert.equal(isFederationOfClub("", federations), false);
  assert.equal(isFederationOfClub("fed-1", federations), true);
});

test("un club senza federazioni non riconosce niente", () => {
  assert.equal(isFederationOfClub("fed-1", listClubFederations({})), false);
});

/* ------------------------------------------------------------------ */
/* Cosa si scrive sul tesseramento                                     */
/* ------------------------------------------------------------------ */

test("si scrivono tutti e due: l'identificativo e l'etichetta congelata", () => {
  const federations = listClubFederations(CLUB_CON_DUE);
  const riferimento = buildRegistrationFederationReference("fed-1", federations);

  assert.deepEqual(riferimento, { federationId: "fed-1", federation: "FIP" });
});

test("un riferimento estraneo non produce niente da scrivere", () => {
  const federations = listClubFederations(CLUB_CON_DUE);

  assert.equal(
    buildRegistrationFederationReference("fed-999", federations),
    null,
    "chi scrive deve rifiutare, non ripiegare su una stringa",
  );
});

/* ------------------------------------------------------------------ */
/* Come si legge, anche dopo                                           */
/* ------------------------------------------------------------------ */

test("rinominare l'ente non orfana il tesseramento", () => {
  /*
    E il difetto principale: prima il record portava il **nome**, quindi dopo la
    rinomina la scheda mostrava una federazione che il club non aveva piu, e
    nessuno collegava le due cose.
  */
  const tesseramento = { federationId: "fed-1", federation: "FIP" };

  const dopoRinomina = listClubFederations({
    settings: {
      federations: [{ id: "fed-1", name: "FIP - Federazione Italiana Pallacanestro" }],
    },
  });

  assert.equal(
    readRegistrationFederationLabel(tesseramento, dopoRinomina),
    "FIP - Federazione Italiana Pallacanestro",
    "il legame regge la rinomina",
  );
});

test("un ente tolto dal club lascia la scritta congelata", () => {
  /*
    Uno storico deve poter dire cosa fu vero. Cancellare la scritta perche la
    configurazione e cambiata riscriverebbe il passato.
  */
  const tesseramento = { federationId: "fed-1", federation: "FIP" };

  assert.equal(
    readRegistrationFederationLabel(tesseramento, listClubFederations({})),
    "FIP",
  );
});

test("un tesseramento storico senza identificativo si legge ancora", () => {
  const federations = listClubFederations(CLUB_CON_DUE);

  assert.equal(
    readRegistrationFederationLabel({ federation: "CSEN" }, federations),
    "CSEN",
  );
  assert.equal(
    readRegistrationFederationLabel({}, federations),
    "",
    "senza niente da nominare non si inventa un ente",
  );
});

/* ------------------------------------------------------------------ */
/* Le due maschere offrono la stessa scelta                            */
/* ------------------------------------------------------------------ */

/**
 * I commenti si tolgono prima di guardare: un vaglio che diventa rosso perche
 * qualcuno ha **spiegato** cosa non si fa piu insegna a non spiegarlo, che e il
 * verso opposto di cio che questo repository chiede a chi corregge. Stessa
 * lezione di `E1` nel censimento dell'eleggibilita.
 */
const senzaCommenti = (testo) =>
  testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

test("ne la scheda ne la creazione accettano piu testo libero", () => {
  const creazione = senzaCommenti(
    readFileSync("src/components/forms/AthleteCreateForm.tsx", "utf8"),
  );

  assert.doesNotMatch(
    creazione,
    /placeholder="Es\. FIP"/,
    "un campo libero rende «FIP», «F.I.P.» e «Fip» tre enti diversi",
  );
  assert.match(creazione, /federations\.map\(\(federation\) => \(/);
  assert.match(creazione, /buildRegistrationFederationReference/);

  const dialogo = readFileSync(
    "src/components/athletes/profile/athlete-registration-dialog.tsx",
    "utf8",
  );
  assert.match(
    dialogo,
    /value:\s*federation\.id/,
    "il valore della tendina e l'identificativo, non la scritta",
  );
});
