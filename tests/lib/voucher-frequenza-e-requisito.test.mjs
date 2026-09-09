import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **«Frequenza EasyGame undefined ore»** (N10, N11).
 *
 * ---
 *
 * ## Il fatto
 *
 * Il collaudo sullo staging ha letto, dentro il dettaglio di un periodo:
 *
 * ```
 * Frequenza EasyGame  undefined ore
 * Requisito           undefined ore   non raggiunto
 * ```
 *
 * Due frasi, e tutte e due mentivano due volte: il numero non c'era, e il
 * verdetto «non raggiunto» era stato emesso **senza** avere niente da
 * confrontare.
 *
 * ## Perche non bastava sostituire uno zero
 *
 * Perche «zero ore» e un'affermazione: dice che l'atleta non si e presentato.
 * Su un periodo previsto — un mese che deve ancora cominciare — nessuno ha
 * contato niente, e le due cose non sono la stessa. Un club che leggesse «0
 * ore» su marzo a gennaio ne dedurrebbe che marzo e gia perso.
 *
 * E perche `requirement_min` a zero e una **configurazione legittima**: un
 * bando puo riconoscere il periodo a chiunque risulti iscritto, e
 * `calculatePeriodAccrual` lo tratta gia cosi. «Requisito 0 ore» sarebbe un
 * requisito inventato.
 *
 * ## I tre casi che questo file fissa
 *
 * | Caso | Frequenza | Requisito |
 * |---|---|---|
 * | A — configurati e misurati | «8 ore» | «Requisito: 10 ore» + «8 / 10 ore — Non raggiunto» |
 * | B — non ancora misurato | «Frequenza non ancora disponibile» | «Requisito: 10 ore», **senza verdetto** |
 * | C — bando senza soglia | la misura, se c'e | «Nessun requisito di frequenza» |
 *
 * E la proprieta che li tiene insieme: **nessuna funzione di descrizione puo
 * restituire una stringa che contenga `undefined`, `null` o `NaN`**, per
 * nessun ingresso, nemmeno per uno malformato.
 */

let model;

before(async () => {
  model = await import("../../src/lib/funding/funding-model.ts");
});

const PROGRAMMA = {
  id: "programma-1",
  organization_id: "club-1",
  name: "Voucher Sport",
  funder_name: "Regione",
  status: "active",
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_to: "2026-03-31T00:00:00.000Z",
  athlete_plafond: 300,
  period_amount: 50,
  period_frequency: "monthly",
  requirement_unit: "hours",
  requirement_min: 10,
  unmet_behavior: "none",
};

const SENZA_REQUISITO = { ...PROGRAMMA, requirement_min: 0 };

/** Una riga scritta dal ricalcolo: porta una misura vera. */
const rigaCalcolata = (extra = {}) => ({
  id: "maturato-1",
  period_index: 0,
  period_label: "gennaio 2026",
  period_start: "2026-01-01T00:00:00.000Z",
  period_end: "2026-01-31T00:00:00.000Z",
  requirement_min: 10,
  requirement_unit: "hours",
  measured_value: 8,
  requirement_met: false,
  eligible_amount: 50,
  estimated_amount: 0,
  accrued_amount: 0,
  status: "not_accrued",
  data: { attendanceMeasured: true },
  ...extra,
});

/* ------------------------------------------------------------- il caso A */

test("caso A · frequenza e requisito configurati si leggono per quello che sono", () => {
  const righe = model.buildFundingPeriodRows(PROGRAMMA, [rigaCalcolata()]);
  const gennaio = righe[0];

  assert.equal(gennaio.measure.kind, "measured");
  assert.equal(gennaio.measure.value, 8);
  assert.equal(
    model.describeFundingPeriodMeasure(gennaio.measure),
    "8 ore",
  );

  assert.equal(gennaio.requirement.kind, "required");
  assert.equal(
    model.describeFundingPeriodRequirement(gennaio.requirement),
    "Requisito: 10 ore",
  );
  assert.equal(
    model.describeFundingPeriodProgress(gennaio.requirement),
    "8 / 10 ore — Non raggiunto",
  );
});

test("caso A · un requisito raggiunto lo dice", () => {
  const righe = model.buildFundingPeriodRows(PROGRAMMA, [
    rigaCalcolata({
      measured_value: 10,
      requirement_met: true,
      accrued_amount: 50,
      status: "accrued",
    }),
  ]);

  assert.equal(
    model.describeFundingPeriodProgress(righe[0].requirement),
    "10 / 10 ore — Raggiunto",
  );
});

test("caso A · le presenze si leggono con la loro unita", () => {
  const righe = model.buildFundingPeriodRows(
    { ...PROGRAMMA, requirement_unit: "sessions", requirement_min: 6 },
    [
      rigaCalcolata({
        requirement_unit: "sessions",
        requirement_min: 6,
        measured_value: 6,
        requirement_met: true,
      }),
    ],
  );

  assert.equal(
    model.describeFundingPeriodMeasure(righe[0].measure),
    "6 presenze",
  );
  assert.equal(
    model.describeFundingPeriodProgress(righe[0].requirement),
    "6 / 6 presenze — Raggiunto",
  );
});

/* ------------------------------------------------------------- il caso B */

test("caso B · un periodo mai calcolato non ha una frequenza, e lo dice", () => {
  /* Nessuna riga di maturato: tre mesi tutti previsti. */
  const righe = model.buildFundingPeriodRows(PROGRAMMA, []);

  assert.equal(righe.length, 3, "gennaio, febbraio, marzo");

  for (const riga of righe) {
    assert.equal(riga.status, "planned");
    assert.equal(riga.measure.kind, "unknown");
    assert.equal(
      model.describeFundingPeriodMeasure(riga.measure),
      "Frequenza non ancora disponibile",
    );
  }
});

test("caso B · il requisito si conosce anche su un periodo previsto", () => {
  /*
    E la ragione per cui non basta «non disponibile» su tutte e due: la soglia
    sta nella configurazione del bando, non nella riga di maturato, quindi un
    mese futuro sa gia quante ore chiedera.
  */
  const [gennaio] = model.buildFundingPeriodRows(PROGRAMMA, []);

  assert.equal(gennaio.requirement.kind, "required");
  assert.equal(gennaio.requirement.min, 10);
  assert.equal(
    model.describeFundingPeriodRequirement(gennaio.requirement),
    "Requisito: 10 ore",
  );
});

test("caso B · senza misura non si emette nessun verdetto", () => {
  const [gennaio] = model.buildFundingPeriodRows(PROGRAMMA, []);

  assert.equal(
    gennaio.requirement.met,
    null,
    "«non raggiunto» su un mese che non e cominciato e una bugia",
  );
  assert.equal(
    model.describeFundingPeriodProgress(gennaio.requirement),
    null,
    "e non c'e nessuna frase da scrivere",
  );
});

test("caso B · una riga nata da una decisione manuale non finge una misura", () => {
  /*
    N12 materializza il periodo senza contare niente: `measured_value` resta lo
    zero del tipo, e il marcatore impedisce di leggerlo come «zero ore fatte».
  */
  const righe = model.buildFundingPeriodRows(PROGRAMMA, [
    rigaCalcolata({
      measured_value: 0,
      accrued_amount: 50,
      status: "accrued",
      data: { attendanceMeasured: false, manualDecision: true },
    }),
  ]);

  assert.equal(righe[0].measure.kind, "unknown");
  assert.equal(
    model.describeFundingPeriodMeasure(righe[0].measure),
    "Frequenza non ancora disponibile",
  );
  assert.equal(righe[0].manualDecision, true);
});

test("una riga senza marcatore e stata scritta dal ricalcolo: la sua misura e vera", () => {
  /*
    Compatibilita all'indietro, e non e un dettaglio: fino a N12 l'unico
    creatore di righe era il ricalcolo, che misura sempre. Trattare l'assenza
    del marcatore come «non lo so» cancellerebbe la frequenza di ogni periodo
    gia in archivio.
  */
  const righe = model.buildFundingPeriodRows(PROGRAMMA, [
    rigaCalcolata({ data: { reason: "Nessuna frequenza registrata" } }),
  ]);

  assert.equal(righe[0].measure.kind, "measured");
  assert.equal(righe[0].measure.value, 8);
});

/* ------------------------------------------------------------- il caso C */

test("caso C · un bando senza soglia non ne inventa una a zero", () => {
  const righe = model.buildFundingPeriodRows(SENZA_REQUISITO, [
    rigaCalcolata({ requirement_min: 0, measured_value: 3 }),
  ]);

  assert.equal(righe[0].requirement.kind, "none");
  assert.equal(
    model.describeFundingPeriodRequirement(righe[0].requirement),
    "Nessun requisito di frequenza",
  );
  assert.equal(
    model.describeFundingPeriodProgress(righe[0].requirement),
    null,
    "non c'e niente da raggiungere, quindi non c'e niente da dichiarare raggiunto",
  );
});

test("caso C · vale anche sul periodo previsto di un bando senza soglia", () => {
  const [gennaio] = model.buildFundingPeriodRows(SENZA_REQUISITO, []);

  assert.equal(gennaio.requirement.kind, "none");
  assert.equal(
    model.describeFundingPeriodRequirement(gennaio.requirement),
    "Nessun requisito di frequenza",
  );
});

/* -------------------------------------------- la proprieta che li governa */

test("nessuna descrizione contiene mai undefined, null o NaN", () => {
  /*
    **La prova che vale piu delle altre.** I tre casi sopra fissano cio che si
    deve leggere; questa fissa cio che non si deve leggere **mai**, e lo fa su
    ingressi che nessun percorso normale produce — perche il difetto originale
    nasceva proprio da un ingresso che nessuno aveva previsto.
  */
  const veleno = /undefined|null|NaN/;

  const ingressi = [
    [PROGRAMMA, []],
    [SENZA_REQUISITO, []],
    [PROGRAMMA, [rigaCalcolata()]],
    [PROGRAMMA, [rigaCalcolata({ measured_value: null })]],
    [PROGRAMMA, [rigaCalcolata({ measured_value: undefined })]],
    [PROGRAMMA, [rigaCalcolata({ measured_value: "otto" })]],
    [PROGRAMMA, [rigaCalcolata({ requirement_min: null })]],
    [PROGRAMMA, [rigaCalcolata({ requirement_min: undefined })]],
    [PROGRAMMA, [rigaCalcolata({ requirement_unit: undefined })]],
    [PROGRAMMA, [rigaCalcolata({ requirement_unit: "furlong" })]],
    [{}, []],
    [{}, [rigaCalcolata()]],
    [{ ...PROGRAMMA, requirement_min: "otto" }, []],
    [{ ...PROGRAMMA, valid_from: null }, [rigaCalcolata()]],
  ];

  for (const [programma, accruals] of ingressi) {
    for (const riga of model.buildFundingPeriodRows(programma, accruals)) {
      const frasi = [
        model.describeFundingPeriodMeasure(riga.measure),
        model.describeFundingPeriodRequirement(riga.requirement),
        model.describeFundingPeriodProgress(riga.requirement),
      ].filter((frase) => frase !== null);

      for (const frase of frasi) {
        assert.equal(typeof frase, "string");
        assert.equal(
          veleno.test(frase),
          false,
          `«${frase}» arriva all'utente da ${JSON.stringify(programma).slice(0, 60)}`,
        );
      }

      assert.equal(
        Number.isFinite(riga.plannedAmount),
        true,
        "anche l'importo previsto e un numero, sempre",
      );
    }
  }
});

test("una riga orfana conserva il proprio requisito congelato", () => {
  /*
    Le date del bando sono state accorciate dopo un ricalcolo: la riga di marzo
    non ha piu un periodo che la generi, ma porta un importo che forse e stato
    rendicontato. Il suo requisito e quello di **allora**, non quello di adesso.
  */
  const righe = model.buildFundingPeriodRows(
    { ...PROGRAMMA, valid_to: "2026-01-31T00:00:00.000Z", requirement_min: 20 },
    [
      rigaCalcolata({
        id: "maturato-marzo",
        period_index: 2,
        period_label: "marzo 2026",
        requirement_min: 10,
        measured_value: 12,
        requirement_met: true,
        accrued_amount: 50,
        status: "reported",
      }),
    ],
  );

  const marzo = righe.find((riga) => riga.periodIndex === 2);
  assert.ok(marzo, "la riga orfana non si butta");
  assert.equal(marzo.requirement.min, 10);
  assert.equal(
    model.describeFundingPeriodProgress(marzo.requirement),
    "12 / 10 ore — Raggiunto",
  );
});
