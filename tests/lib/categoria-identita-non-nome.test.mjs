/**
 * **L'identita di una categoria e il suo identificativo, non il suo nome.**
 *
 * ---
 *
 * ## Perche questo file esiste
 *
 * `recordMatchesCategory` ha otto consumatori — le tre bacheche
 * dell'allenatore, il pannello settimanale, gli avvisi operativi, le
 * statistiche per categoria e i report di club — e **nessun test**. Il difetto
 * P0-4 del pilota Fortitudo Scauri viveva li dentro: l'insieme dei token
 * mescolava identificativi ed etichette, e due categorie omonime su due sedi
 * diverse si intersecavano **sul nome**.
 *
 * Il pilota lo ha misurato dalla schermata: l'allenatore dell'Under 15 di
 * Formia apriva la propria bacheca e vedeva gli allenamenti dell'Under 15 di
 * Scauri, e nessun filtro li separava.
 *
 * ## Cosa misura
 *
 * Le tre proprieta della regola, piu i due controlli che la rendono capace di
 * dire rosso:
 *
 * 1. due categorie omonime con identificativi diversi **non** si fondono;
 * 2. il ripiego sul nome resta per i club senza catalogo;
 * 3. un nome che ne nomina due non ne nomina nessuna.
 */

import test from "node:test";
import assert from "node:assert/strict";

const helpers = await import("../../src/lib/trainer-dashboard-helpers.ts");
const utils = await import("../../src/lib/category-utils.ts");

const U15_SCAURI = "11111111-1111-4111-8111-111111111111";
const U15_FORMIA = "22222222-2222-4222-8222-222222222222";
const U17_SCAURI = "33333333-3333-4333-8333-333333333333";

/* Il catalogo vero di una societa multi-sede: due squadre, un nome solo. */
const CATALOGO = [
  { id: U15_SCAURI, name: "Under 15" },
  { id: U15_FORMIA, name: "Under 15" },
  { id: U17_SCAURI, name: "Under 17" },
];

/* ==================================================================== *
 *  1. Due categorie omonime restano due
 * ==================================================================== */

test("un allenamento dell'Under 15 di Scauri non e dell'Under 15 di Formia", () => {
  const allenamento = { category_id: U15_SCAURI, category_name: "Under 15" };

  assert.equal(
    helpers.recordMatchesCategory(allenamento, { id: U15_SCAURI }, CATALOGO),
    true,
    "la propria categoria deve corrispondere",
  );

  assert.equal(
    helpers.recordMatchesCategory(allenamento, { id: U15_FORMIA }, CATALOGO),
    false,
    "prima di P0-4: il nome «Under 15» faceva combaciare le due sedi",
  );
});

test("e vale anche quando la categoria arriva con il nome scritto accanto", () => {
  /*
    E la forma vera dei record del prodotto: la colonna denormalizzata
    `category_name` viaggia insieme all'identificativo. Se il nome bastasse a
    far combaciare, questa prova sarebbe verde per il motivo sbagliato.
  */
  const gara = { categoryId: U15_FORMIA, categoryName: "Under 15" };
  const scauri = { id: U15_SCAURI, name: "Under 15" };

  assert.equal(helpers.recordMatchesCategory(gara, scauri, CATALOGO), false);
});

test("un atleta con due appartenenze corrisponde a tutte e due, e solo a quelle", () => {
  const atleta = {
    category_memberships: [
      { category_id: U15_FORMIA, category_name: "Under 15" },
      { category_id: U17_SCAURI, category_name: "Under 17" },
    ],
  };

  assert.equal(helpers.recordMatchesCategory(atleta, { id: U15_FORMIA }, CATALOGO), true);
  assert.equal(helpers.recordMatchesCategory(atleta, { id: U17_SCAURI }, CATALOGO), true);
  assert.equal(
    helpers.recordMatchesCategory(atleta, { id: U15_SCAURI }, CATALOGO),
    false,
    "l'omonima dell'altra sede non e una sua appartenenza",
  );
});

/* ==================================================================== *
 *  2. Il ripiego sul nome resta per chi non ha un catalogo
 * ==================================================================== */

test("senza catalogo due record che nominano la stessa categoria combaciano", () => {
  /*
    **Il controllo che impedisce di chiudere tutto.** Un club che non ha mai
    aperto la pagina delle categorie non ha un catalogo, e i suoi record
    portano solo etichette: se la regola nuova chiudesse anche qui, spegnerebbe
    la bacheca invece di separare due squadre.
  */
  const allenamento = { category_name: "Pulcini" };

  assert.equal(helpers.recordMatchesCategory(allenamento, { name: "Pulcini" }, []), true);
  assert.equal(helpers.recordMatchesCategory(allenamento, { name: "Esordienti" }, []), false);
});

test("e resta anche quando il catalogo esiste ma non conosce quel nome", () => {
  const allenamento = { category_name: "Amatori" };

  assert.equal(
    helpers.recordMatchesCategory(allenamento, { name: "Amatori" }, CATALOGO),
    true,
    "una categoria fuori catalogo non deve sparire dalla bacheca",
  );
});

/* ==================================================================== *
 *  3. Un nome che ne nomina due non ne nomina nessuna
 * ==================================================================== */

test("un riferimento per solo nome a una categoria omonima non ne apre nessuna", () => {
  /*
    Un record storico che porta «Under 15» e basta non dice quale delle due
    sia. La risposta onesta non e «la prima»: sceglierla sarebbe la fusione di
    prima, con un passaggio in meno.
  */
  const storico = { category_name: "Under 15" };

  assert.equal(helpers.recordMatchesCategory(storico, { id: U15_SCAURI }, CATALOGO), false);
  assert.equal(helpers.recordMatchesCategory(storico, { id: U15_FORMIA }, CATALOGO), false);
});

test("e due riferimenti per solo nome, tutti e due ambigui, non combaciano", () => {
  /*
    **La prova che rende load-bearing il `continue` sull'ambiguita.**

    Qui nessuno dei due lati porta un identificativo: senza quel `continue`
    entrambi finirebbero fra i **nomi**, il ripiego scatterebbe — perche il
    ripiego vale proprio quando gli identificativi mancano — e le due «Under
    15» tornerebbero a essere la stessa. E la fusione di P0-4 per la porta di
    servizio, e non la vedrebbe nessun'altra prova di questo file.

    Con il catalogo che ne conosce due, la risposta e no: non si sa di quale si
    stia parlando, e due «non lo so» non fanno un «e la stessa».
  */
  assert.equal(
    helpers.recordMatchesCategory(
      { category_name: "Under 15" },
      { name: "Under 15" },
      CATALOGO,
    ),
    false,
  );

  /* Il controspecchio: se il nome ne nomina una sola, i due combaciano. */
  assert.equal(
    helpers.recordMatchesCategory(
      { category_name: "Under 17" },
      { name: "Under 17" },
      CATALOGO,
    ),
    true,
  );
});

test("un'etichetta fuori catalogo non unisce due categorie che sanno chi sono", () => {
  /*
    **La prova che rende load-bearing il ritorno anticipato.**

    Due categorie diverse, tutte e due riconosciute dal catalogo, e tutte e due
    con accanto la stessa etichetta libera che il catalogo **non** conosce —
    la forma che prende una colonna storica mai bonificata, o un `data.category`
    scritto a mano anni fa.

    Senza il ritorno anticipato il ripiego sui nomi scatterebbe lo stesso, e le
    due si unirebbero su una parola che non e l'identita di nessuna delle due.
    Chi sa dire chi e ha gia risposto.
  */
  const record = { category_id: U15_SCAURI, data: { category: "Prima squadra" } };
  const altra = { id: U17_SCAURI, data: { category: "Prima squadra" } };

  assert.equal(helpers.recordMatchesCategory(record, altra, CATALOGO), false);

  /* Il controspecchio: senza catalogo l'etichetta e tutto cio che si ha. */
  assert.equal(
    helpers.recordMatchesCategory(
      { data: { category: "Prima squadra" } },
      { data: { category: "Prima squadra" } },
      [],
    ),
    true,
  );
});

test("`resolveCategoryId` non sceglie piu la prima fra due omonime", () => {
  assert.equal(
    utils.resolveCategoryId("Under 17", CATALOGO),
    U17_SCAURI,
    "un nome che ne nomina una sola risolve, e deve continuare a farlo",
  );

  assert.equal(
    utils.resolveCategoryId("Under 15", CATALOGO),
    "Under 15",
    "prima di P0-4: rispondeva sempre l'identificativo della prima delle due",
  );

  assert.equal(
    utils.resolveCategoryId(U15_FORMIA, CATALOGO),
    U15_FORMIA,
    "l'identificativo resta la strada che non e mai ambigua",
  );
});

/* ==================================================================== *
 *  4. Il catalogo non deve fondere cio che la regola tiene separato
 * ==================================================================== */

test("`buildClubCategoryOptions` non fonde due omonime con identificativi veri", () => {
  /*
    **La stessa fusione, un piano piu su.**

    Una revisione indipendente sul ramo integrato ha misurato che correggere
    `recordMatchesCategory` non bastava: `buildClubCategoryOptions` riuniva le
    due «Under 15» in **una voce sola** prima ancora che la regola le vedesse.
    Da li il danno era doppio, e il secondo peggiore del primo:

    * la difesa di `extractCategoryIdentity` non poteva accendersi, perche il
      catalogo che riceveva non conteneva piu due omonime;
    * un allenamento che dichiarava la categoria **sparita** veniva attribuito
      all'altra, perche il suo nome risolveva sull'unica voce rimasta. Non una
      fusione: uno scambio.
  */
  const catalogo = utils.buildClubCategoryOptions({
    clubCategories: [
      { id: U15_SCAURI, name: "Under 15" },
      { id: U15_FORMIA, name: "Under 15" },
      { id: U17_SCAURI, name: "Under 17" },
    ],
  });

  assert.equal(catalogo.length, 3, "prima: le due omonime diventavano una");
  assert.deepEqual(
    catalogo.map((voce) => voce.id).sort(),
    [U15_SCAURI, U15_FORMIA, U17_SCAURI].sort(),
  );
});

test("ma continua a riunire la stessa categoria che arriva da due fonti", () => {
  /*
    **Il controspecchio.** La funzione esiste per questo: una fonte porta
    l'identificativo, un'altra solo il nome. Se la correzione chiudesse anche
    qui, ogni catalogo composto da piu fonti si sdoppierebbe.
  */
  const catalogo = utils.buildClubCategoryOptions({
    clubCategories: [{ id: U17_SCAURI, name: "Under 17" }, { name: "Under 17" }],
  });

  assert.equal(catalogo.length, 1);
  assert.equal(catalogo[0].id, U17_SCAURI);
});

test("e il catalogo vero fa accendere la difesa di ADR-0155", () => {
  /*
    Le due correzioni vanno misurate **insieme**: e la composizione a reggere
    la proprieta, e ognuna delle due da sola non la regge.
  */
  const catalogo = utils.buildClubCategoryOptions({
    clubCategories: [
      { id: U15_SCAURI, name: "Under 15" },
      { id: U15_FORMIA, name: "Under 15" },
    ],
  });

  const allenamento = { category_id: U15_SCAURI, category_name: "Under 15" };

  assert.equal(
    helpers.recordMatchesCategory(allenamento, { id: U15_SCAURI }, catalogo),
    true,
  );
  assert.equal(
    helpers.recordMatchesCategory(allenamento, { id: U15_FORMIA }, catalogo),
    false,
    "prima: il catalogo fuso mandava l'allenamento sull'unica voce rimasta",
  );
});

/* ==================================================================== *
 *  5. L'eleggibilita: chi e convocabile, chi e all'appello (D-INT-2)
 * ==================================================================== */

test("`athleteMatchesAnyCategory` con il catalogo separa le due sedi", () => {
  /*
    **E la porta di appello e convocazioni.**

    Le due erano risposte canoniche **diverse** alla stessa domanda: questa
    serviva RSVP, convocazioni, statistiche e cinque schermate; l'altra le
    bacheche dell'allenatore. Adesso sono la stessa funzione, e questa prova
    misura che lo siano davvero — non che si somiglino.
  */
  const diFormia = {
    category_memberships: [{ category_id: U15_FORMIA, category_name: "Under 15" }],
  };

  assert.equal(
    utils.athleteMatchesAnyCategory(diFormia, [{ id: U15_FORMIA }], CATALOGO),
    true,
    "l'atleta e convocabile per la propria squadra",
  );
  assert.equal(
    utils.athleteMatchesAnyCategory(diFormia, [{ id: U15_SCAURI }], CATALOGO),
    false,
    "prima: compariva nell'appello dell'altra sede, e «Segna tutti presenti» lo scriveva",
  );
});

test("senza catalogo si comporta come prima: nessuna regressione per chi non ne ha uno", () => {
  const senzaCatalogo = {
    category_memberships: [{ category_id: U15_FORMIA, category_name: "Under 15" }],
  };

  assert.equal(
    utils.athleteMatchesAnyCategory(senzaCatalogo, [{ id: U15_FORMIA }]),
    true,
  );
  assert.equal(
    utils.athleteMatchesAnyCategory(senzaCatalogo, [{ name: "Under 15" }]),
    true,
    "il ripiego per nome resta dove il catalogo non c'e",
  );
});

test("le due risposte canoniche danno la stessa risposta, sugli stessi ingressi", () => {
  /*
    **La prova che le tiene una sola.**

    `athleteMatchesCategory` e `recordMatchesCategory` erano due funzioni con
    due idee. Se un giorno divergessero di nuovo — perche qualcuno «corregge»
    una delle due — questa prova lo direbbe prima che lo dica un allenatore.
  */
  const casi = [
    [{ category_id: U15_SCAURI }, { id: U15_FORMIA }],
    [{ category_id: U15_SCAURI }, { id: U15_SCAURI }],
    [{ category_name: "Under 15" }, { id: U15_SCAURI }],
    [{ category_name: "Amatori" }, { name: "Amatori" }],
    [{ category_memberships: [{ category_id: U17_SCAURI }] }, { id: U17_SCAURI }],
  ];

  for (const [record, categoria] of casi) {
    assert.equal(
      utils.athleteMatchesCategory(record, categoria, CATALOGO),
      helpers.recordMatchesCategory(record, categoria, CATALOGO),
      `le due divergono su ${JSON.stringify(record)} / ${JSON.stringify(categoria)}`,
    );
  }
});

/* ==================================================================== *
 *  6. La forma della risposta: identificativi e nomi separati
 * ==================================================================== */

test("l'identita separa cio che il catalogo riconosce da cio che non riconosce", () => {
  const misto = { category_id: U17_SCAURI, categoryName: "Amatori" };
  const identita = helpers.extractCategoryIdentity(misto, CATALOGO);

  assert.equal(
    identita.identificativi.has(U17_SCAURI.toLowerCase()),
    true,
    "cio che il catalogo riconosce diventa un identificativo",
  );
  assert.equal(
    identita.nomi.has("amatori"),
    true,
    "cio che non riconosce resta un nome, e vale come ripiego",
  );
  assert.equal(
    identita.identificativi.has("amatori"),
    false,
    "un nome sconosciuto non diventa un'identita",
  );
});

/* ==================================================================== *
 *  7. Un riferimento vecchio non e una categoria nuova
 * ==================================================================== */

test("una scheda con un `category_id` che il catalogo non conosce non crea un'omonima", () => {
  /*
    **La regressione che la remediation aveva introdotto**, trovata da una
    revisione indipendente sulla remediation stessa.

    Un club rinomina — o ricrea, o importa — una categoria: il catalogo porta
    `c-new`, e le schede atleta portano ancora `c-old` con lo stesso nome.

    `buildClubCategoryOptions` alimenta il catalogo **anche con le categorie
    ricavate dalle schede**. Con la regola nuova — due identita vere non si
    fondono — `c-old` entrava come **seconda** «Under 15», e da li la regola
    dell'ambiguita cancellava il nome da tutti e due i lati: quell'atleta
    spariva da appello, calendario di famiglia, RSVP e report.

    La scheda si avvelenava da sola: era lei a produrre l'omonima che poi la
    escludeva.
  */
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: "c-old", category_name: "Under 15" },
    ],
  };

  const catalogo = utils.buildClubCategoryOptions({
    clubCategories: [{ id: "c-new", name: "Under 15" }],
    athletes: [atleta],
  });

  assert.equal(
    catalogo.length,
    1,
    "un riferimento vecchio si riunisce alla voce configurata, non la sdoppia",
  );
  assert.equal(
    catalogo[0].id,
    "c-new",
    "e non le ruba l'identificativo: il catalogo resta quello del club",
  );

  assert.equal(
    helpers.recordMatchesCategory(atleta, { id: "c-new" }, catalogo),
    true,
    "prima: l'atleta spariva da ogni elenco della propria categoria",
  );
});

test("ma due categorie che il club ha configurato restano due", () => {
  /*
    **Il controspecchio, ed e P0-4.** L'indulgenza vale solo per cio che si
    ricava da una scheda: due voci scritte dal club nell'anagrafica sono due
    squadre, e nessuna coincidenza di nome le unisce.
  */
  const catalogo = utils.buildClubCategoryOptions({
    clubCategories: [
      { id: U15_SCAURI, name: "Under 15" },
      { id: U15_FORMIA, name: "Under 15" },
    ],
    athletes: [
      {
        id: "atleta-2",
        category_memberships: [
          { category_id: U15_FORMIA, category_name: "Under 15" },
        ],
      },
    ],
  });

  assert.equal(catalogo.length, 2);
  assert.deepEqual(
    catalogo.map((voce) => voce.id).sort(),
    [U15_SCAURI, U15_FORMIA].sort(),
  );
});

/* ==================================================================== *
 *  6. Un riferimento puo essere una stringa, e la stringa e il riferimento
 * ==================================================================== */

test("un identificativo nudo nomina la propria categoria", () => {
  /*
    **La porta che non si apriva** (P0-6).

    `collectCategoryTokens` leggeva solo le **chiavi** di un oggetto: su
    `sameCategory(atleta, "<identificativo>")` non trovava niente da nessuna
    parte e il confronto rispondeva sempre no. Non e un caso limite: e la forma
    con cui una schermata chiede «gli atleti di questa categoria» quando ha in
    mano l'identificativo e non la voce di catalogo, ed e cio che la pagina
    Gare passa — `[match.categoryId, match.category]`.

    Misurato sul club di prova: la finestra delle convocazioni si apriva su
    **zero** atleti con quindici iscritti a quella squadra. Falliva chiuso,
    quindi non e mai stata una fusione fra omonime: era una porta chiusa.
  */
  const atleta = {
    id: "atleta-9",
    category_memberships: [
      { category_id: U15_SCAURI, category_name: "Under 15" },
    ],
  };

  assert.equal(
    utils.athleteMatchesCategory(atleta, U15_SCAURI, CATALOGO),
    true,
    "l'identificativo nudo e un riferimento come la voce di catalogo",
  );
  assert.equal(
    utils.athleteMatchesAnyCategory(atleta, [U15_SCAURI, "Under 15"], CATALOGO),
    true,
    "ed e la forma che la pagina Gare usa per aprire le convocazioni",
  );
});

test("una stringa non scavalca il catalogo: due omonime restano due", () => {
  /*
    Il controspecchio. La stringa passa dalla **stessa** risoluzione: diventa
    identificativo solo se il catalogo la riconosce, e un nome che ne nomina
    due non ne nomina nessuna (ADR-0155).
  */
  const diScauri = {
    id: "atleta-10",
    category_memberships: [
      { category_id: U15_SCAURI, category_name: "Under 15" },
    ],
  };

  assert.equal(
    utils.athleteMatchesCategory(diScauri, U15_FORMIA, CATALOGO),
    false,
    "l'identificativo dell'altra sede non lo riguarda",
  );
  assert.equal(
    utils.athleteMatchesCategory(diScauri, "Under 15", CATALOGO),
    false,
    "e il nome ne nomina due: non ne nomina nessuna",
  );
});

test("senza catalogo la stringa resta l'unica strada, e funziona", () => {
  /*
    Un club che non ha mai aperto la pagina delle categorie non ha catalogo, e
    i suoi record portano solo etichette: li il ripiego sul nome e tutto cio
    che c'e, e deve continuare a rispondere.
  */
  const atleta = { id: "atleta-11", category_name: "Under 15" };

  assert.equal(
    utils.athleteMatchesCategory(atleta, "Under 15", []),
    true,
    "senza catalogo due etichette uguali sono la stessa squadra",
  );
  assert.equal(
    utils.athleteMatchesCategory(atleta, "Under 17", []),
    false,
    "e due etichette diverse no",
  );
});
