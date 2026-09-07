import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **I tre difetti del giro conclusivo** (PP-03 §17).
 *
 * Il sesto round ha riattaccato le correzioni del quinto da tre angolazioni
 * nuove e ha vinto tre volte. Le prove qui sotto misurano il **verso opposto**
 * di ciascuna, cioe cosa deve continuare a funzionare: una correzione di
 * perimetro che nega troppo non si vede da una sonda che cerca solo le fughe,
 * ed e il modo in cui questa lane ha gia sbagliato due volte (§15.3, §16.2).
 */

let eventi;
let ruoli;

before(async () => {
  eventi = await import("../../src/lib/server/events.ts");
  ruoli = await import("../../src/lib/access-roles.ts");
});

/* ------------------------------------- §17.1 — l'asse dei gruppi ------- */

const perimetro = (categorie, gruppi) => ({
  categoryIds: categorie,
  categoryTokens: categorie,
  groupIds: gruppi,
});

const evento = (campi) => ({
  category_id: null,
  category_name: null,
  category_ids: [],
  group_ids: [],
  ...campi,
});

test("PP-03 §17.1 · chi non ha gruppi non scrive nel gruppo di un altro", () => {
  /*
    Carlo allena `alfa` e non ha **nessun** gruppo assegnato. L'evento dichiara
    il gruppo di Bruno e la categoria di Carlo: prima l'asse dei gruppi taceva
    — perche a tacere era il **perimetro** — e restavano le sole categorie.
  */
  const carlo = perimetro(["alfa"], []);
  const dentroIlGruppoDiBruno = evento({
    category_id: "alfa",
    category_ids: ["alfa"],
    group_ids: ["grp-beta"],
  });

  assert.equal(
    eventi.eventWithinTrainerPerimeter(carlo, dentroIlGruppoDiBruno, "scrittura"),
    false,
    "l'asse che l'evento dichiara e che il perimetro non copre deve fallire chiuso",
  );

  /*
    E la simmetria che mancava: Aldo, che i gruppi ce li ha, riceveva gia il
    diniego per lo stesso identico atto. La difesa valeva contro chi era gia
    recintato su quell'asse, cioe contro tutti tranne chi non lo era affatto.
  */
  const aldo = perimetro(["alfa"], ["grp-alfa"]);
  assert.equal(
    eventi.eventWithinTrainerPerimeter(aldo, dentroIlGruppoDiBruno, "scrittura"),
    false,
    "e per Aldo era gia cosi: le due risposte devono coincidere",
  );
});

test("PP-03 §17.1 · e in lettura non cambia niente, che e ADR-0055", () => {
  /*
    Il rischio della correzione, misurato. In lettura il gruppo e la risposta
    piu precisa e la scorciatoia resta: un allenatore **senza** gruppi legge il
    proprio calendario per categoria, e un evento della sua categoria che
    dichiara anche un gruppo non deve sparirgli.
  */
  const carlo = perimetro(["alfa"], []);
  const suoConGruppo = evento({
    category_id: "alfa",
    category_ids: ["alfa"],
    group_ids: ["grp-beta"],
  });

  assert.equal(
    eventi.eventWithinTrainerPerimeter(carlo, suoConGruppo, "lettura"),
    true,
    "in lettura un perimetro senza gruppi ricade sulle categorie",
  );
});

test("PP-03 §17.1 · l'atto legittimo resta legittimo nei tre casi che contano", () => {
  const carlo = perimetro(["alfa"], []);
  const aldo = perimetro(["alfa"], ["grp-alfa"]);

  /* 1. Carlo scrive un evento della propria categoria, senza gruppi. */
  assert.equal(
    eventi.eventWithinTrainerPerimeter(
      carlo,
      evento({ category_id: "alfa", category_ids: ["alfa"] }),
      "scrittura",
    ),
    true,
  );

  /* 2. Aldo scrive un evento del proprio gruppo e della propria categoria. */
  assert.equal(
    eventi.eventWithinTrainerPerimeter(
      aldo,
      evento({
        category_id: "alfa",
        category_ids: ["alfa"],
        group_ids: ["grp-alfa"],
      }),
      "scrittura",
    ),
    true,
  );

  /* 3. Aldo scrive un evento di **soli** gruppi, tutti suoi (§15.2). */
  assert.equal(
    eventi.eventWithinTrainerPerimeter(
      aldo,
      evento({ group_ids: ["grp-alfa"] }),
      "scrittura",
    ),
    true,
  );
});

test("PP-03 §17.1 · un evento di soli gruppi resta chiuso a chi gruppi non ne ha", () => {
  /*
    Carlo non ha gruppi e l'evento non ha categorie: non c'e nessun asse su cui
    Carlo possa dire di essere dentro. Falliva chiuso gia prima — per la via
    delle categorie vuote — e deve continuare a farlo per la via dei gruppi,
    altrimenti la correzione avrebbe spostato il difetto invece di chiuderlo.
  */
  const carlo = perimetro(["alfa"], []);
  for (const modo of ["lettura", "scrittura"]) {
    assert.equal(
      eventi.eventWithinTrainerPerimeter(
        carlo,
        evento({ group_ids: ["grp-alfa"] }),
        modo,
      ),
      false,
      `in ${modo} un evento di soli gruppi non e di chi gruppi non ne ha`,
    );
  }
});

/* --------------------------------- §17.3 — il tipo della riga singola -- */

test("PP-03 §17.3 · l'allenatore non ha titolo ai sei tipi che il contenitore consegnava", () => {
  /*
    I sei tipi che il sesto round ha letto per identificativo da
    `/api/v1/club_resource_items/<id>` mentre la rotta per nome rispondeva 403.
    La prova sta sul **predicato**, che e la nozione che le due porte adesso
    condividono: se un domani uno di questi entrasse fra i leggibili
    dell'allenatore, la guardia lo lascerebbe passare e questa riga lo dice.
  */
  for (const tipo of [
    "discounts",
    "procure",
    "sponsors",
    "payment_plans",
    "clothing_inventory",
    "opening_hours",
  ]) {
    assert.equal(
      ruoli.canAccessClubResource("trainer", tipo, "read"),
      false,
      `un allenatore non legge ${tipo}`,
    );
  }
});

test("PP-03 §17.3 · una grafia che il registro non conosce fallisce chiusa", () => {
  /*
    Il tipo scritto al **singolare**. Il nome non e elencato da nessuna parte
    nel prodotto: e il punto: `canAccessClubResource` risponde per allenatore,
    collaboratore e segreteria su un elenco di **ammessi**, quindi a una grafia
    che non conosce risponde «no» senza che nessuno debba prevederla.

    Il nome qui e inventato sul momento, come le prove di §15.4 e §16.2:
    elencare le grafie note verificherebbe l'elenco, cioe la cosa che si e
    smesso di usare.
  */
  for (const grafia of [
    "secretariat_note",
    "grafia-che-nessuno-ha-mai-scritto",
  ]) {
    for (const ruolo of ["trainer", "collaborator", "staff"]) {
      assert.equal(
        ruoli.canAccessClubResource(ruolo, grafia, "read"),
        false,
        `${ruolo} non legge la grafia ${grafia}`,
      );
    }
  }
});

test("PP-03 §17.3 · e il verso opposto: cio che l'allenatore legge davvero", () => {
  /*
    Una guardia che negasse tutto passerebbe le prove qui sopra e spegnerebbe
    l'area allenatore. Questi sono i quattro tipi di `club_resource_items` da
    cui l'area vive — le categorie che disegnano il calendario, i colleghi, lo
    staff e la bacheca — e tutti e quattro sono **dichiarati** in
    `CLUB_RESOURCE_TYPES`, che e la ragione per cui l'elenco di ammessi di
    §17.3 non gli toglie niente.

    `club_sites` **non** e fra questi, e non per effetto di §17.3: un
    allenatore non legge il registro delle sedi nemmeno dalla porta per nome,
    da prima di questa lane. Sta scritto qui perche e la cosa che una prova di
    non-regressione deve dire — la sede la riconosce dal perimetro e dalle
    appartenenze dell'atleta (§16.2), non dal registro.
  */
  for (const tipo of [
    "categories",
    "trainers",
    "staff_members",
    "secretariat_notes",
  ]) {
    assert.equal(
      ruoli.canAccessClubResource("trainer", tipo, "read"),
      true,
      `l'allenatore deve continuare a leggere ${tipo}`,
    );
  }
});
