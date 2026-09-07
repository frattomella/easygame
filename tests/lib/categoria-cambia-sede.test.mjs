/**
 * **Quando una categoria cambia sede** (P0-8, pilota Fortitudo Scauri).
 *
 * ---
 *
 * ## Cosa misurano queste prove
 *
 * Il modello dei gruppi operativi tratta bene la **configurazione**: spostare
 * una categoria da Scauri a Formia archivia il gruppo vecchio invece di
 * cancellarlo — lo storico continua a citarlo — e ne apre uno nuovo.
 *
 * Cio che il modello **non** fa e riportare gli atleti. La loro appartenenza
 * porta il proprio `site_id`, e nessuno lo tocca: da quel momento
 * l'identificativo di gruppo che ne esce (`group:cat:scauri`) non corrisponde
 * a nessun gruppo attivo, e quegli atleti spariscono da ogni elenco operativo
 * della propria categoria.
 *
 * Le prove qui sotto **descrivono il comportamento attuale**, compreso quello
 * che e sbagliato: la riga che lo dichiara sbagliato porta accanto il motivo
 * per cui non e stata corretta qui. Vedi `D-INT-8`.
 *
 * ## Perche non e stato corretto in questa tornata
 *
 * Perche la risposta giusta e una **decisione di prodotto**, non una riga:
 *
 * * gli atleti **si spostano** con la categoria? Allora un atleta di Scauri
 *   diventa un atleta di Formia senza che nessuno glielo abbia detto, e la
 *   sede e cio con cui il club decide dove si allena;
 * * **restano dove sono**, senza categoria? Allora la categoria perde
 *   l'organico e va ricomposta a mano, che e cio che succede oggi ma in
 *   silenzio;
 * * **il cambio si rifiuta** finche l'organico non e stato spostato? E la
 *   scelta piu onesta e la piu scomoda.
 *
 * Sceglierne una di nascosto dentro un commit di integrazione sarebbe decidere
 * per il club come si chiamano le sue squadre.
 */

import test from "node:test";
import assert from "node:assert/strict";

const sedi = await import("../../src/lib/club-sites.ts");

const SCAURI = "sede-scauri";
const FORMIA = "sede-formia";
const CAT = "cat-under15";

const SEDI = [
  { id: SCAURI, name: "Scauri", active: true },
  { id: FORMIA, name: "Formia", active: true },
];

const atletaDi = (siteId) => ({
  id: "atleta-1",
  category_memberships: [
    { category_id: CAT, category_name: "Under 15", site_id: siteId },
  ],
});

const gruppiPerSedi = (siteIds, existing = []) =>
  sedi.buildCategoryGroupsForSites({
    categoryId: CAT,
    categoryName: "Under 15",
    siteIds,
    sites: SEDI,
    existing,
  });

/* ==================================================================== *
 *  1. La configurazione: il gruppo vecchio non sopravvive come attivo
 * ==================================================================== */

test("A -> B: il gruppo della sede vecchia si archivia, non resta attivo", () => {
  const prima = gruppiPerSedi([SCAURI]);
  assert.deepEqual(
    prima.map((gruppo) => [gruppo.siteId, gruppo.active]),
    [[SCAURI, true]],
  );

  const dopo = gruppiPerSedi([FORMIA], prima);
  const attivi = sedi.getActiveCategoryGroups(dopo);

  assert.deepEqual(
    attivi.map((gruppo) => gruppo.siteId),
    [FORMIA],
    "la vecchia relazione non deve sopravvivere fra le attive",
  );

  /*
    Ma non sparisce: lo storico la cita, e un gruppo cancellato lascerebbe
    allenamenti che si riferiscono al nulla.
  */
  assert.equal(dopo.length, 2);
  assert.equal(
    dopo.find((gruppo) => gruppo.siteId === SCAURI)?.active,
    false,
  );
});

test("A+B -> B: si archivia solo quella tolta", () => {
  const prima = gruppiPerSedi([SCAURI, FORMIA]);
  const dopo = gruppiPerSedi([FORMIA], prima);

  assert.deepEqual(
    sedi.getActiveCategoryGroups(dopo).map((gruppo) => gruppo.siteId),
    [FORMIA],
  );
  assert.equal(
    dopo.find((gruppo) => gruppo.siteId === SCAURI)?.active,
    false,
  );
});

test("B -> nessuna sede: non resta nessun gruppo attivo", () => {
  const prima = gruppiPerSedi([FORMIA]);
  const dopo = gruppiPerSedi([], prima);

  assert.deepEqual(sedi.getActiveCategoryGroups(dopo), []);
});

test("una sede disattivata non e piu una sede su cui aprire un gruppo", () => {
  const spente = [
    { id: SCAURI, name: "Scauri", active: false },
    { id: FORMIA, name: "Formia", active: true },
  ];

  const gruppi = sedi.buildCategoryGroupsForSites({
    categoryId: CAT,
    categoryName: "Under 15",
    siteIds: [SCAURI, FORMIA],
    sites: sedi.getActiveClubSites
      ? sedi.getActiveClubSites(spente)
      : spente.filter((sede) => sede.active),
    existing: [],
  });

  assert.deepEqual(
    gruppi.map((gruppo) => gruppo.siteId),
    [FORMIA],
  );
});

/* ==================================================================== *
 *  2. Gli atleti: qui il modello non arriva, ed e D-INT-8
 * ==================================================================== */

test("l'atleta della sede vecchia esce da ogni gruppo attivo della sua categoria", () => {
  /*
    **Questa prova descrive un difetto, e lo dice.**
    Non e un'invariante che si vuole: e la misura di cio che succede oggi, per
    non doverla riscoprire da una segreteria che chiede dove sono finiti
    quindici atleti.

    L'appartenenza porta `site_id: scauri` e nessuno la tocca quando la
    categoria si sposta. L'identificativo di gruppo che ne esce non corrisponde
    piu a nessun gruppo attivo, e l'atleta sparisce dagli elenchi operativi
    della propria categoria: appello, convocazioni, avvisi.
  */
  const dopo = gruppiPerSedi([FORMIA], gruppiPerSedi([SCAURI]));
  const attivi = sedi.getActiveCategoryGroups(dopo);
  const indice = sedi.buildSiteIndex(SEDI);

  const orfano = atletaDi(SCAURI);

  assert.equal(
    attivi.some((gruppo) => sedi.athleteMatchesGroup(orfano, gruppo, indice)),
    false,
    "D-INT-8: l'atleta resta agganciato alla sede vecchia e sparisce",
  );

  /* Il controspecchio: chi e sulla sede nuova continua a esserci. */
  assert.equal(
    attivi.some((gruppo) =>
      sedi.athleteMatchesGroup(atletaDi(FORMIA), gruppo, indice),
    ),
    true,
  );
});

test("e non e un problema di nome: la sede si riconosce per identificativo", () => {
  /*
    **Il controllo che separa questo difetto da P0-4.** Non c'entra
    l'omonimia: l'atleta orfano non sparisce perche due sedi si chiamano
    uguale, ma perche la sua appartenenza nomina una sede che la categoria non
    serve piu. Le due cose si correggono in due posti diversi.
  */
  const indice = sedi.buildSiteIndex(SEDI);
  const gruppo = gruppiPerSedi([FORMIA])[0];

  assert.equal(
    sedi.athleteMatchesGroup(atletaDi(FORMIA), gruppo, indice),
    true,
  );
  assert.equal(
    sedi.athleteMatchesGroup(atletaDi(SCAURI), gruppo, indice),
    false,
    "nessuna indulgenza sulla sede: e voluta, ed e giusta",
  );
});
