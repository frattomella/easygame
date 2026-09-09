import assert from "node:assert/strict";
import test from "node:test";

import {
  getAthleteCategoryRelationship,
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "../../src/lib/athlete-category-memberships.ts";
import { resolveCategoryReference } from "../../src/lib/categories/identity.ts";

/**
 * **N1 — la primaria non puo essere anche una secondaria.**
 *
 * Il caso reale: un atleta di Fortitudo Scauri aveva `Scoiattoli` come
 * categoria primaria e la **stessa** categoria compariva anche fra le
 * secondarie.
 *
 * L'archivio non poteva produrlo da solo: `athlete_category_memberships` ha un
 * indice unico su `(organization_id, athlete_id, category_id)` e un indice
 * unico parziale che ammette **una sola** riga con `is_primary = true`. Il
 * duplicato nasceva percio da due chiavi **diverse** che nominano la stessa
 * categoria — l'identificativo sulla riga, il nome nella colonna storica — e
 * viveva in due punti:
 *
 * * in **lettura**, `normalizeAthleteCategoryMemberships` trattava
 *   `athletes.category_id` / `data.category` come una sesta sorgente invece che
 *   come la **proiezione** che e;
 * * in **scrittura**, `resolveRequestedAthleteMemberships` toglieva la nuova
 *   primaria dalle secondarie confrontando **stringhe grezze**, e
 *   `replaceAthleteMemberships` cancella e reinserisce cio che ne esce: il
 *   fantasma diventava una riga vera al primo salvataggio.
 *
 * Le prove qui sotto coprono i cinque scenari del mandato piu il
 * **controspecchio** di ciascuno — la difesa non deve poter essere soddisfatta
 * chiudendo tutto.
 */

const SCOIATTOLI = "category-1757000000000-scoia";
const PULCINI = "category-1757000000000-pulci";
const U15_FORMIA = "category-1757000000000-u15fo";
const U15_SCAURI = "category-1757000000000-u15sc";

const CATALOGO = [
  { id: SCOIATTOLI, name: "Scoiattoli" },
  { id: PULCINI, name: "Pulcini" },
];

const CATALOGO_OMONIME = [
  { id: U15_FORMIA, name: "Under 15" },
  { id: U15_SCAURI, name: "Under 15" },
];

/** Quante volte questa categoria compare nell'elenco normalizzato. */
const occorrenze = (memberships, categoryId) =>
  memberships.filter((membership) => membership.categoryId === categoryId).length;

/* ------------------------------------------------------------------ */
/* 1. La stessa categoria                                              */
/* ------------------------------------------------------------------ */

test("la colonna storica che nomina la riga non diventa una seconda categoria", () => {
  /*
    La forma esatta del difetto: la riga porta l'identificativo, la colonna
    storica porta il **nome**. Prima uscivano due appartenenze, la seconda
    declassata a secondaria, e a schermo «Scoiattoli» compariva due volte.
  */
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      {
        category_id: SCOIATTOLI,
        category_name: "Scoiattoli",
        is_primary: true,
      },
    ],
    data: { category: "Scoiattoli" },
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta, CATALOGO);

  assert.equal(memberships.length, 1, "la categoria deve comparire una volta sola");
  assert.equal(memberships[0].categoryId, SCOIATTOLI);
  assert.equal(memberships[0].isPrimary, true);
});

test("e vale anche senza il catalogo del club in mano", () => {
  /*
    **Il controspecchio del chiamante.** Sei consumatori su dodici il catalogo
    non lo passano — `getAthleteCategoryRelationship`, la pagina Gare, quella
    Allenamenti, `club-sites`, `audience`, i numeri di maglia. Se la
    riconciliazione dipendesse dal catalogo, li il duplicato resterebbe: e
    infatti restava.
  */
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: SCOIATTOLI, category_name: "Scoiattoli", is_primary: true },
    ],
    data: { category: "Scoiattoli" },
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta);

  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].categoryId, SCOIATTOLI);
});

test("la riga fantasma gia scritta in archivio si richiude in lettura", () => {
  /*
    I dati del pilota **hanno gia** le due righe: il difetto le ha scritte, e
    l'indice unico non le intercetta perche `"Scoiattoli"` e una stringa diversa
    dall'identificativo. La correzione non puo pretendere una migrazione
    distruttiva: deve leggerle come una sola.
  */
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: SCOIATTOLI, category_name: "Scoiattoli", is_primary: true },
      { category_id: "Scoiattoli", category_name: "Scoiattoli", is_primary: false },
    ],
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta);

  assert.equal(memberships.length, 1, "le due righe nominano la stessa categoria");
  assert.equal(
    memberships[0].categoryId,
    SCOIATTOLI,
    "a sopravvivere deve essere l'identificativo, non l'etichetta",
  );
});

test("il controspecchio: due categorie diverse restano due", () => {
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: SCOIATTOLI, category_name: "Scoiattoli", is_primary: true },
      { category_id: PULCINI, category_name: "Pulcini", is_primary: false },
    ],
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta, CATALOGO);

  assert.equal(memberships.length, 2);
  assert.equal(occorrenze(memberships, SCOIATTOLI), 1);
  assert.equal(occorrenze(memberships, PULCINI), 1);
});

test("nessuna categoria e primaria e secondaria insieme, comunque si legga", () => {
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: SCOIATTOLI, category_name: "Scoiattoli", is_primary: true },
      { category_id: "Scoiattoli", category_name: "Scoiattoli", is_primary: false },
      { category_id: PULCINI, category_name: "Pulcini", is_primary: false },
    ],
    data: { category: "Scoiattoli" },
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta, CATALOGO);
  const primarie = memberships.filter((membership) => membership.isPrimary);
  const secondarie = memberships.filter((membership) => !membership.isPrimary);

  assert.equal(primarie.length, 1, "una primaria e una sola");

  const identitaPrimarie = new Set(primarie.map((m) => m.categoryId));
  for (const secondaria of secondarie) {
    assert.equal(
      identitaPrimarie.has(secondaria.categoryId),
      false,
      `«${secondaria.categoryName}» e primaria e secondaria insieme`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 2. Categorie omonime su sedi diverse                                */
/* ------------------------------------------------------------------ */

test("due «Under 15» su due sedi restano due categorie", () => {
  /*
    Il rovescio del difetto, e la ragione per cui la riconciliazione non puo
    essere una fusione per nome: chiudere il duplicato fondendo gli omonimi
    darebbe all'allenatore di Formia gli atleti di Scauri (ADR-0155).
  */
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      {
        category_id: U15_FORMIA,
        category_name: "Under 15",
        site_id: "sede-formia",
        is_primary: true,
      },
      {
        category_id: U15_SCAURI,
        category_name: "Under 15",
        site_id: "sede-scauri",
        is_primary: false,
      },
    ],
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta, CATALOGO_OMONIME);

  assert.equal(memberships.length, 2, "due sedi, due squadre");
  assert.equal(occorrenze(memberships, U15_FORMIA), 1);
  assert.equal(occorrenze(memberships, U15_SCAURI), 1);
});

test("con due omonime la colonna storica ambigua non inventa una terza categoria", () => {
  /*
    `data.category = "Under 15"` non nomina nessuna delle due. La risposta
    onesta non e «la prima» e non e «una nuova»: e **niente**. Le righe hanno
    gia detto in quali squadre sta l'atleta.
  */
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: U15_FORMIA, category_name: "Under 15", is_primary: true },
      { category_id: U15_SCAURI, category_name: "Under 15", is_primary: false },
    ],
    data: { category: "Under 15" },
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta, CATALOGO_OMONIME);

  assert.equal(memberships.length, 2, "la colonna ambigua non aggiunge niente");
  assert.equal(
    memberships.some((membership) => membership.categoryId === "Under 15"),
    false,
    "«Under 15» non e l'identificativo di nessuna categoria",
  );
});

test("la primitiva dichiara l'ambiguita invece di scegliere la prima", () => {
  const ambiguo = resolveCategoryReference("Under 15", "Under 15", CATALOGO_OMONIME);

  assert.equal(ambiguo.ambiguous, true);
  assert.equal(ambiguo.known, false);
  assert.equal(
    ambiguo.id,
    "Under 15",
    "resta il valore com'e: non e l'identificativo di nessuna",
  );

  /* Il controspecchio: un nome che ne nomina una sola risolve. */
  const unico = resolveCategoryReference("", "Scoiattoli", CATALOGO);
  assert.equal(unico.known, true);
  assert.equal(unico.id, SCOIATTOLI);
});

/* ------------------------------------------------------------------ */
/* 3. Multi-categoria                                                  */
/* ------------------------------------------------------------------ */

test("un atleta in tre categorie ne conserva tre, con una sola primaria", () => {
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: SCOIATTOLI, category_name: "Scoiattoli", is_primary: true },
      { category_id: PULCINI, category_name: "Pulcini", is_primary: false },
      { category_id: U15_FORMIA, category_name: "Under 15", is_primary: false },
    ],
    data: { category: "Scoiattoli" },
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta, [
    ...CATALOGO,
    { id: U15_FORMIA, name: "Under 15" },
  ]);

  assert.equal(memberships.length, 3);
  assert.equal(memberships.filter((m) => m.isPrimary).length, 1);
  assert.equal(getPrimaryAthleteCategoryMembership(atleta, CATALOGO).categoryId, SCOIATTOLI);
});

test("la relazione con una categoria e primaria oppure secondaria, mai tutte e due", () => {
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: SCOIATTOLI, category_name: "Scoiattoli", is_primary: true },
      { category_id: PULCINI, category_name: "Pulcini", is_primary: false },
    ],
    data: { category: "Scoiattoli" },
  };

  assert.equal(
    getAthleteCategoryRelationship(atleta, [{ id: SCOIATTOLI, name: "Scoiattoli" }]),
    "primary",
  );
  assert.equal(
    getAthleteCategoryRelationship(atleta, [{ id: PULCINI, name: "Pulcini" }]),
    "secondary",
  );
  assert.equal(
    getAthleteCategoryRelationship(atleta, [{ id: U15_FORMIA, name: "Under 15" }]),
    "none",
  );
});

/* ------------------------------------------------------------------ */
/* 4. Cambio di primaria                                               */
/* ------------------------------------------------------------------ */

test("cambiare primaria non lascia la vecchia due volte", () => {
  /*
    La forma che esce da `resolveRequestedAthleteMemberships`: la nuova primaria
    in testa, **tutte** le appartenenze correnti dietro come secondarie. Se la
    fusione fosse per stringa, la vecchia primaria — che arriva per
    identificativo mentre la nuova arriva per nome — resterebbe duplicata.
  */
  const richiesta = [
    { category_id: "Pulcini", category_name: "Pulcini", is_primary: true },
    { category_id: SCOIATTOLI, category_name: "Scoiattoli", is_primary: false },
    { category_id: PULCINI, category_name: "Pulcini", is_primary: false },
  ];

  const memberships = normalizeAthleteCategoryMemberships(richiesta, CATALOGO);

  assert.equal(memberships.length, 2, "Pulcini e una categoria, non due");
  assert.equal(occorrenze(memberships, PULCINI), 1);

  const primaria = memberships.find((membership) => membership.isPrimary);
  assert.equal(primaria.categoryId, PULCINI, "la primaria e quella nuova");
  assert.equal(
    memberships.find((m) => m.categoryId === SCOIATTOLI).isPrimary,
    false,
    "la vecchia primaria scende a secondaria",
  );
});

test("promuovere una secondaria non la duplica", () => {
  const richiesta = [
    { category_id: PULCINI, category_name: "Pulcini", is_primary: true },
    { category_id: SCOIATTOLI, category_name: "Scoiattoli", is_primary: false },
    { category_id: PULCINI, category_name: "Pulcini", is_primary: false },
  ];

  const memberships = normalizeAthleteCategoryMemberships(richiesta, CATALOGO);

  assert.equal(memberships.length, 2);
  assert.equal(memberships.filter((m) => m.isPrimary).length, 1);
  assert.equal(memberships.find((m) => m.isPrimary).categoryId, PULCINI);
});

/* ------------------------------------------------------------------ */
/* 5. Rimozione della primaria                                         */
/* ------------------------------------------------------------------ */

test("tolta la primaria, una secondaria la sostituisce e non resta un buco", () => {
  const richiesta = [
    { category_id: PULCINI, category_name: "Pulcini", is_primary: false },
    { category_id: U15_FORMIA, category_name: "Under 15", is_primary: false },
  ];

  const memberships = normalizeAthleteCategoryMemberships(richiesta, [
    ...CATALOGO,
    { id: U15_FORMIA, name: "Under 15" },
  ]);

  assert.equal(memberships.length, 2);
  assert.equal(
    memberships.filter((membership) => membership.isPrimary).length,
    1,
    "una primaria c'e sempre",
  );
});

test("tolta l'ultima categoria non ne resta nessuna, e non ne compare una dalla colonna", () => {
  /*
    Il controspecchio della rimozione: se la colonna storica potesse ancora
    generare un'appartenenza, togliere l'ultima categoria non la toglierebbe —
    ricomparirebbe al ricaricamento, che e il modo in cui una cancellazione
    sembra non funzionare.
  */
  const atleta = {
    id: "atleta-1",
    category_memberships: [],
    data: { category: "Scoiattoli" },
  };

  const senzaRighe = normalizeAthleteCategoryMemberships(atleta, CATALOGO);
  assert.equal(
    senzaRighe.length,
    1,
    "senza righe la colonna resta l'unica fonte: nessuna perdita sul dato mai migrato",
  );

  /*
    **Corretta dopo la revisione ostile (C2).**

    Qui si pretendeva che la colonna disallineata sparisse — `length === 1`. La
    revisione ha misurato che quella regola perde un dato vero: su un club
    **migrato a meta** (`athletes.category_id` con la primaria, righe scritte
    solo per le secondarie) la primaria spariva dalla scheda, e il salvataggio
    successivo la cancellava anche dalla colonna, perche la riscrive dalla
    primaria normalizzata. Un difetto che si aggrava da solo.

    La colonna entra percio come **secondaria**: la primaria la dicono le
    righe, che sono la fonte, e niente si perde. Cio che questa prova continua
    a difendere — e che era il difetto N1 — e che la **stessa** categoria non
    compaia due volte, ed e la prova qui sopra.
  */
  const conUnaRiga = normalizeAthleteCategoryMemberships(
    {
      id: "atleta-1",
      category_memberships: [
        { category_id: PULCINI, category_name: "Pulcini", is_primary: true },
      ],
      data: { category: "Scoiattoli" },
    },
    CATALOGO,
  );

  assert.equal(
    conUnaRiga.find((membership) => membership.isPrimary).categoryId,
    PULCINI,
    "la primaria resta quella delle righe: la colonna non la scavalca",
  );
  assert.equal(
    conUnaRiga.find((membership) => membership.categoryId === SCOIATTOLI)
      ?.isPrimary,
    false,
    "e la colonna, se dice una categoria diversa, entra come secondaria invece di sparire",
  );
});

/* ------------------------------------------------------------------ */
/* Il dato mai migrato non si perde                                    */
/* ------------------------------------------------------------------ */

test("un club senza appartenenze e senza catalogo continua a leggersi per nome", () => {
  const atleta = {
    id: "atleta-1",
    category: "Giovanissimi",
  };

  const memberships = normalizeAthleteCategoryMemberships(atleta);

  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].categoryName, "Giovanissimi");
  assert.equal(memberships[0].isPrimary, true);
});
