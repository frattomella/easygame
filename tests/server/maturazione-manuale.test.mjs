import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La maturazione di un periodo, decisa da una persona** (N12).
 *
 * ---
 *
 * ## Il fatto
 *
 * La frequenza registrata in EasyGame era diventata **l'autorita** su cio che
 * un ente riconosce, e non lo e. Su un bando a fonte `easygame_attendance`
 * l'unico modo di far maturare un mese era registrare abbastanza presenze; su
 * un bando a fonte esterna esisteva `confirmAccrualPeriods`, che pero rifiuta i
 * programmi EasyGame per costruzione. Un club che sapeva — da una
 * comunicazione dell'ente, da una deroga, da un appello ormai chiuso — che quel
 * mese valeva, non aveva **nessuna riga da premere**.
 *
 * ## Le sei proprieta che questo file presidia
 *
 * 1. **Non nasce cassa.** Nessun `payment_transaction`, nessuna copertura,
 *    nessun tocco a `payments`. Un maturato e un credito verso un ente, e
 *    resta tale (ADR-0037, ADR-0158).
 * 2. **Non liquida.** `funding_settlements` e `funding_settlement_lines`
 *    restano intatte: quelle le scrive `createFundingSettlement`.
 * 3. **Materializza il periodo previsto.** Si decide anche di un mese che non
 *    ha ancora una riga, e la riga nasce dichiarando di **non** portare una
 *    misura (N10).
 * 4. **E idempotente.** Il doppio clic e un gesto solo (scenario 11).
 * 5. **Il concorrente perde, e lo sa** (scenario 12).
 * 6. **Sopravvive al ricalcolo.** Una decisione che dura fino al prossimo
 *    ricalcolo non e una decisione: e un'illusione che dura un minuto.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const PROGRAMMA = "cccccccc-0000-4000-8000-000000000003";
const BOZZA = "cccccccc-0000-4000-8000-000000000008";
const ANNA = "dddddddd-0000-4000-8000-000000000004";

let funding;
let setPrismaClientForTests;
let fake;

before(async () => {
  funding = await import("../../src/lib/server/funding.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (overrides = {}) => ({
  userId: "utente-1",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  ...overrides,
});

const programma = (extra = {}) => ({
  id: PROGRAMMA,
  organization_id: CLUB,
  name: "Voucher Sport 2026",
  funder_name: "Regione",
  status: "active",
  valid_from: new Date("2026-01-01T00:00:00.000Z"),
  valid_to: new Date("2026-03-31T00:00:00.000Z"),
  athlete_plafond: 300,
  period_amount: 50,
  period_frequency: "monthly",
  requirement_unit: "hours",
  requirement_min: 8,
  unmet_behavior: "none",
  accrual_source: "easygame_attendance",
  ...extra,
});

const ADESIONE = "eeeeeeee-0000-4000-8000-000000000001";

const seed = () => ({
  club: [
    { id: CLUB, name: "ASD Alfa" },
    { id: ALTRO_CLUB, name: "ASD Beta" },
  ],
  athlete: [{ id: ANNA, organization_id: CLUB, first_name: "Anna" }],
  fundingProgram: [
    programma(),
    programma({ id: BOZZA, status: "draft" }),
  ],
  fundingEnrollment: [
    {
      id: ADESIONE,
      organization_id: CLUB,
      program_id: PROGRAMMA,
      athlete_id: ANNA,
      assigned_amount: 150,
      status: "active",
      enrolled_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  paymentTransaction: [],
  paymentCoverageAllocation: [],
  athletePayment: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const decidi = (decision, extra = {}) =>
  funding.decideAccrualPeriod(
    { enrollmentId: ADESIONE, periodIndex: 0, decision, ...extra },
    scope(),
  );

/* --------------------------------------------- il periodo che non c'e ancora */

test("si decide anche di un periodo che non ha ancora una riga", async () => {
  assert.equal(fake.rows("fundingAccrual").length, 0);

  const esito = await decidi("accrued");

  const righe = fake.rows("fundingAccrual");
  assert.equal(righe.length, 1, "la riga nasce quando qualcuno preme");
  assert.equal(righe[0].period_index, 0);
  assert.equal(righe[0].period_label, "gennaio 2026");
  assert.equal(righe[0].status, "accrued");
  assert.equal(righe[0].accrued_amount, 50, "la mensilita intera del bando");
  assert.equal(esito.unchanged, false);
});

test("la riga materializzata dichiara di non portare una misura", async () => {
  /*
    N10. Nessuno ha contato le ore di questo periodo: `measured_value` resta lo
    zero del tipo, e il marcatore impedisce alla schermata di leggerlo come
    «zero ore fatte».
  */
  await decidi("accrued");

  const riga = fake.rows("fundingAccrual")[0];
  assert.equal(riga.measured_value, 0);
  assert.equal(riga.data.attendanceMeasured, false);
  assert.equal(riga.data.manualDecision, true);
});

test("un periodo fuori dalla validita del bando non si decide", async () => {
  await assert.rejects(
    () =>
      funding.decideAccrualPeriod(
        { enrollmentId: ADESIONE, periodIndex: 99, decision: "accrued" },
        scope(),
      ),
    /non appartiene a questo programma/,
  );
});

/* --------------------------------------------------- niente cassa, mai */

test("decidere un periodo non scrive nessun incasso", async () => {
  await decidi("accrued");

  assert.equal(fake.rows("paymentTransaction").length, 0);
  assert.equal(fake.rows("paymentCoverageAllocation").length, 0);
  assert.equal(fake.rows("athletePayment").length, 0);

  const scritture = fake.calls.filter(
    (chiamata) =>
      ["paymentTransaction", "athletePayment", "paymentCoverageAllocation"].includes(
        chiamata.delegate,
      ) && ["create", "update", "updateMany", "delete"].includes(chiamata.method),
  );
  assert.deepEqual(
    scritture,
    [],
    "un maturato e un credito verso un ente: in cassa non entra niente",
  );
});

test("decidere un periodo non liquida niente", async () => {
  await decidi("accrued");

  assert.equal(fake.rows("fundingSettlement").length, 0);
  assert.equal(
    fake.rows("fundingSettlementLine").length,
    0,
    "la liquidazione e un altro atto, e ha un altro scrittore",
  );
});

test("il modulo non importa il dominio dei pagamenti per farlo", async () => {
  const { readFileSync } = await import("node:fs");
  const sorgente = readFileSync("src/lib/server/funding.ts", "utf8");

  assert.equal(
    /from "\.\/payment-transactions"/.test(sorgente),
    false,
    "ADR-0037 §5 resta letterale",
  );
});

/* -------------------------------------------------------- i due gesti */

test("segnare non maturato azzera l'importo e conserva la riga", async () => {
  await decidi("accrued");
  await decidi("not_accrued");

  const riga = fake.rows("fundingAccrual")[0];
  assert.equal(riga.status, "not_accrued");
  assert.equal(riga.accrued_amount, 0);
  assert.equal(riga.unaccrued_amount, 50, "quanto e andato perso resta scritto");
  assert.equal(riga.data.manualDecision, true);
});

test("un maturato a zero non e «maturato»", async () => {
  /*
    Un periodo che vale zero e un periodo non maturato: chiamarlo altrimenti
    farebbe comparire nel rendiconto all'ente una riga da zero euro.
  */
  await assert.rejects(
    () => decidi("accrued", { amount: 0 }),
    /vale piu di zero/,
  );
});

test("l'importo si puo scegliere, e non supera la mensilita", async () => {
  await decidi("accrued", { amount: 30 });
  assert.equal(fake.rows("fundingAccrual")[0].accrued_amount, 30);

  await decidi("accrued", { amount: 900 });
  assert.equal(
    fake.rows("fundingAccrual")[0].accrued_amount,
    50,
    "non si matura piu di quanto il periodo valga",
  );
});

/* ----------------------------------------------------------- il tetto */

test("il maturato non supera l'importo assegnato al club", async () => {
  /*
    Assegnato 150, mensilita 50: il quarto periodo non ha niente da maturare.
    Senza questo limite dodici clic porterebbero un voucher da 150 a 600.
  */
  for (const periodo of [0, 1, 2]) {
    await funding.decideAccrualPeriod(
      { enrollmentId: ADESIONE, periodIndex: periodo, decision: "accrued" },
      scope(),
    );
  }

  const totale = fake
    .rows("fundingAccrual")
    .reduce((somma, riga) => somma + Number(riga.accrued_amount), 0);
  assert.equal(totale, 150);
});

test("esaurito l'assegnato, il rifiuto lo dice", async () => {
  fake.rows("fundingAccrual").push({
    id: "maturato-0",
    organization_id: CLUB,
    enrollment_id: ADESIONE,
    period_index: 1,
    period_label: "febbraio 2026",
    accrued_amount: 150,
    eligible_amount: 50,
    status: "accrued",
    data: {},
  });

  await assert.rejects(
    () => decidi("accrued"),
    /gia tutto maturato/,
  );
});

/* ------------------------------------------------------- idempotenza */

test("scenario 11 · il doppio clic e una transizione sola", async () => {
  const primo = await decidi("accrued");
  const secondo = await decidi("accrued");

  assert.equal(primo.unchanged, false);
  assert.equal(secondo.unchanged, true, "la seconda volta non scrive");

  assert.equal(fake.rows("fundingAccrual").length, 1);
  assert.equal(
    fake.rows("fundingAccrual")[0].data.manualDecisions.length,
    1,
    "e non allunga lo storico: e un gesto solo",
  );
});

test("un cambio di stato reale, invece, si registra", async () => {
  await decidi("accrued");
  await decidi("not_accrued");

  assert.equal(fake.rows("fundingAccrual")[0].data.manualDecisions.length, 2);
});

/* ------------------------------------------------------ la concorrenza */

test("scenario 12 · chi guardava un altro stato non sovrascrive in silenzio", async () => {
  await decidi("accrued");

  /*
    La seconda operatrice aveva aperto la scheda quando il periodo era
    `planned`, e preme «non maturato» adesso. La sua decisione si fonda su una
    fotografia vecchia: la si respinge, e le si dice cosa e cambiato.
  */
  await assert.rejects(
    () =>
      funding.decideAccrualPeriod(
        {
          enrollmentId: ADESIONE,
          periodIndex: 0,
          decision: "not_accrued",
          expectedStatus: "planned",
        },
        scope(),
      ),
    /cambiato mentre lo stavi guardando/,
  );

  assert.equal(
    fake.rows("fundingAccrual")[0].status,
    "accrued",
    "la decisione della prima resta",
  );
});

test("con lo stato atteso giusto la decisione passa", async () => {
  await funding.decideAccrualPeriod(
    {
      enrollmentId: ADESIONE,
      periodIndex: 0,
      decision: "accrued",
      expectedStatus: "planned",
    },
    scope(),
  );

  assert.equal(fake.rows("fundingAccrual")[0].status, "accrued");
});

test("l'adesione si blocca prima di leggere le somme", async () => {
  /*
    **Il doppio di Prisma non emula la concorrenza** e restituisce `[]` per ogni
    `$queryRaw`: la correttezza vera la misura la sonda su Postgres. Qui si
    blocca la **forma**, come fa `revisione-ostile-copertura` per la copertura —
    il blocco esiste, sta dentro la transazione, e precede la lettura delle
    somme che decidono il tetto.
  */
  const { readFileSync } = await import("node:fs");
  const sorgente = readFileSync("src/lib/server/funding.ts", "utf8");

  const corpo = sorgente.slice(sorgente.indexOf("export const decideAccrualPeriod"));
  const blocco = corpo.indexOf("FROM funding_enrollments WHERE id =");
  const lettura = corpo.indexOf("client.fundingAccrual.findMany");

  assert.ok(blocco > 0, "l'adesione si deve bloccare: il tetto e una somma");
  assert.ok(
    blocco < lettura,
    "e prima di leggere le righe: una somma letta fuori dal blocco e una somma vecchia",
  );
  assert.ok(
    corpo.indexOf("$transaction") < blocco,
    "e dentro la transazione, altrimenti il blocco si rilascia subito",
  );
});

/* ------------------------------------------- la decisione dura nel tempo */

test("un ricalcolo non riscrive un periodo deciso a mano", async () => {
  await decidi("accrued");

  const esito = await funding.recomputeEnrollmentAccruals(ADESIONE, scope());

  assert.equal(esito.skippedManualPeriods, 1);
  const riga = fake
    .rows("fundingAccrual")
    .find((voce) => Number(voce.period_index) === 0);
  assert.equal(riga.status, "accrued");
  assert.equal(riga.accrued_amount, 50);
});

test("vale anche al contrario: «non maturato» resiste alle presenze", async () => {
  await decidi("not_accrued");

  await funding.recomputeEnrollmentAccruals(ADESIONE, scope());

  const riga = fake
    .rows("fundingAccrual")
    .find((voce) => Number(voce.period_index) === 0);
  assert.equal(riga.status, "not_accrued");
  assert.equal(riga.data.manualDecision, true);
});

test("il maturato deciso a mano consuma comunque l'assegnato", async () => {
  /*
    Saltarlo lascerebbe ai periodi successivi un residuo che non esiste: e la
    stessa ragione per cui un periodo gia liquidato viene contato pur non
    essendo riscritto.
  */
  await decidi("accrued");

  const esito = await funding.recomputeEnrollmentAccruals(ADESIONE, scope());
  const totale = esito.accruals.reduce(
    (somma, riga) => somma + Number(riga.accrued_amount || 0),
    0,
  );

  assert.ok(totale <= 150, `maturato ${totale} su un assegnato di 150`);
});

test("F1 · un periodo deciso fuori dalla finestra consuma comunque l'assegnato", async () => {
  /*
    **Il reperto F1 della revisione ostile contabile.**

    Il ricalcolo si ferma a **oggi**; la decisione manuale genera **tutti** i
    periodi, ed e il suo scopo — si decide anche di un mese che deve ancora
    cominciare (N12). Una riga su un periodo futuro sedeva percio in archivio
    senza essere mai visitata dal ciclo del ricalcolo, e il residuo ripartiva
    dall'importo pieno: tre mensilita decise in avanti su un voucher da 150,
    poi un ricalcolo, e il maturato arrivava a 300. Un credito verso un ente
    che ne ha assegnati 150, e il riepilogo gestionale lo leggeva come tale.

    Qui la finestra si accorcia esplicitamente — e la stessa condizione, resa
    deterministica — e il bando riconosce il periodo anche senza frequenza,
    cosi il ricalcolo avrebbe davvero qualcosa da far maturare.
  */
  fake.rows("fundingProgram")[0].unmet_behavior = "full";
  fake.rows("fundingProgram")[0].valid_to = new Date("2026-12-31T00:00:00.000Z");

  for (const indice of [9, 10, 11]) {
    await funding.decideAccrualPeriod(
      { enrollmentId: ADESIONE, periodIndex: indice, decision: "accrued" },
      scope(),
    );
  }

  const primaDelRicalcolo = fake
    .rows("fundingAccrual")
    .reduce((somma, riga) => somma + Number(riga.accrued_amount), 0);
  assert.equal(primaDelRicalcolo, 150, "tre mensilita, e il tetto tiene");

  await funding.recomputeEnrollmentAccruals(ADESIONE, scope(), {
    until: "2026-03-31T00:00:00.000Z",
  });

  const dopoIlRicalcolo = fake
    .rows("fundingAccrual")
    .reduce((somma, riga) => somma + Number(riga.accrued_amount), 0);

  assert.equal(
    dopoIlRicalcolo,
    150,
    `maturati ${dopoIlRicalcolo} su un assegnato di 150: il ricalcolo ha ignorato cio che sta fuori dalla sua finestra`,
  );
});

test("F9 · il ricalcolo non cancella la traccia di chi aveva deciso", async () => {
  await decidi("accrued");
  await decidi("auto");

  await funding.recomputeEnrollmentAccruals(ADESIONE, scope());

  const riga = fake
    .rows("fundingAccrual")
    .find((voce) => Number(voce.period_index) === 0);

  assert.ok(
    Array.isArray(riga.data.manualDecisions) &&
      riga.data.manualDecisions.length >= 2,
    "la spiegazione di come il periodo e arrivato dov'e non si butta",
  );
  assert.equal(riga.data.manualDecision, false, "ma il governo torna al calcolo");
});

test("F10 · un periodo che vale zero non fa maturare una mensilita intera", async () => {
  fake.rows("fundingAccrual").push({
    id: "maturato-zero",
    organization_id: CLUB,
    enrollment_id: ADESIONE,
    period_index: 0,
    period_label: "gennaio 2026",
    accrued_amount: 0,
    eligible_amount: 0,
    unaccrued_amount: 0,
    status: "not_accrued",
    data: {},
  });

  await assert.rejects(
    () => decidi("accrued"),
    /vale piu di zero/,
    "zero e un valore, non un campo mancante su cui ripiegare",
  );
});

test("«torna al calcolo automatico» ritira la decisione", async () => {
  await decidi("accrued");
  await decidi("auto");

  const riga = fake.rows("fundingAccrual")[0];
  assert.equal(riga.data.manualDecision, false);
  assert.equal(
    riga.data.manualDecisions.at(-1).decision,
    "auto",
    "e resta scritto chi l'ha ritirata",
  );

  const esito = await funding.recomputeEnrollmentAccruals(ADESIONE, scope());
  assert.equal(esito.skippedManualPeriods, 0, "adesso il calcolo lo governa");
});

test("ritirare una decisione che non c'e non e un errore", async () => {
  const esito = await decidi("auto");
  assert.equal(esito.unchanged, true);
});

/* --------------------------------------------------------- i divieti */

test("un periodo gia liquidato non si tocca", async () => {
  fake.rows("fundingAccrual").push({
    id: "maturato-liquidato",
    organization_id: CLUB,
    enrollment_id: ADESIONE,
    period_index: 0,
    period_label: "gennaio 2026",
    accrued_amount: 50,
    eligible_amount: 50,
    status: "settled",
    data: {},
  });

  await assert.rejects(
    () => decidi("not_accrued"),
    /gia liquidat[oa]|gia versato/,
    "l'ente ha versato su quell'importo: si corregge stornando la liquidazione",
  );
});

test("su un bando in bozza non si decide niente", async () => {
  fake.rows("fundingEnrollment").push({
    id: "adesione-bozza",
    organization_id: CLUB,
    program_id: BOZZA,
    athlete_id: ANNA,
    assigned_amount: 150,
    status: "active",
    enrolled_at: new Date("2026-01-01T00:00:00.000Z"),
  });

  await assert.rejects(
    () =>
      funding.decideAccrualPeriod(
        {
          enrollmentId: "adesione-bozza",
          periodIndex: 0,
          decision: "accrued",
        },
        scope(),
      ),
    /in bozza/,
  );
});

test("su un'adesione revocata non si decide niente", async () => {
  fake.rows("fundingEnrollment")[0].status = "closed";

  await assert.rejects(() => decidi("accrued"), /non e attiva/);
});

test("una decisione non riconosciuta viene rifiutata", async () => {
  await assert.rejects(() => decidi("liquidato"), /non riconosciuta/);
});

/* ------------------------------------------------------- il perimetro */

test("l'allenatore non decide la maturazione di un periodo", async () => {
  await assert.rejects(
    () =>
      funding.decideAccrualPeriod(
        { enrollmentId: ADESIONE, periodIndex: 0, decision: "accrued" },
        scope({ activeRole: "trainer" }),
      ),
    /Accesso negato/,
  );

  assert.equal(fake.rows("fundingAccrual").length, 0);
});

test("il genitore nemmeno", async () => {
  await assert.rejects(
    () =>
      funding.decideAccrualPeriod(
        { enrollmentId: ADESIONE, periodIndex: 0, decision: "accrued" },
        scope({ activeRole: "parent" }),
      ),
    /Accesso negato/,
  );
});

test("un ruolo personalizzato con la chiave decide, uno senza no", async () => {
  /*
    **N12/N13.** Le rotte chiedevano `canManageClubConfigurationAsActor`, che
    rifiuta ogni ruolo personalizzato per costruzione: una «Segreteria
    contributi» costruita su gestore non poteva premere niente, e nessuna
    casella dell'editor poteva rimediare perche la chiave non esisteva.
  */
  const { encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts");

  /*
    `accounting.read` serve comunque: la **lettura** dei contributi passa da
    `payments`, e questa lane non l'ha spostata. Cio che cambia e la scrittura.
  */
  const conChiave = encodeCustomRoleToken("custom:club_manager:contributi", [
    "accounting.read",
    "funding.manage",
  ]);
  const senzaChiave = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "accounting.read",
  ]);

  assert.ok(conChiave && senzaChiave, "i gettoni di prova devono essere validi");

  await funding.decideAccrualPeriod(
    { enrollmentId: ADESIONE, periodIndex: 0, decision: "accrued" },
    scope({ activeRole: conChiave }),
  );
  assert.equal(fake.rows("fundingAccrual").length, 1);

  await assert.rejects(
    () =>
      funding.decideAccrualPeriod(
        { enrollmentId: ADESIONE, periodIndex: 1, decision: "accrued" },
        scope({ activeRole: senzaChiave }),
      ),
    /Accesso negato/,
    "senza la casella non si decide",
  );

  assert.equal(
    fake.rows("fundingAccrual").length,
    1,
    "e il rifiuto non lascia niente dietro di se",
  );
});

test("un'adesione di un altro club non si tocca", async () => {
  await assert.rejects(
    () =>
      funding.decideAccrualPeriod(
        { enrollmentId: ADESIONE, periodIndex: 0, decision: "accrued" },
        scope({
          activeOrganizationId: ALTRO_CLUB,
          allowedOrganizationIds: [ALTRO_CLUB],
        }),
      ),
    /Accesso negato|non trovato/,
  );
});

/* ------------------------------------------------------------- l'audit */

test("la decisione lascia scritto chi, quando e da quale stato", async () => {
  await decidi("accrued", { notes: "Deroga comunicata dall'ente" });

  const traccia = fake.rows("fundingAccrual")[0].data.manualDecisions.at(-1);
  assert.equal(traccia.decision, "accrued");
  assert.equal(traccia.fromStatus, "planned");
  assert.equal(traccia.toStatus, "accrued");
  assert.equal(traccia.toAmount, 50);
  assert.equal(traccia.decidedBy, "utente-1");
  assert.equal(traccia.notes, "Deroga comunicata dall'ente");
  assert.ok(traccia.decidedAt, "e quando");
});

test("una decisione smentisce cio che era stato dichiarato all'ente", async () => {
  fake.rows("fundingAccrual").push({
    id: "maturato-rendicontato",
    organization_id: CLUB,
    enrollment_id: ADESIONE,
    period_index: 0,
    period_label: "gennaio 2026",
    accrued_amount: 50,
    eligible_amount: 50,
    status: "reported",
    reported_at: new Date("2026-02-01T00:00:00.000Z"),
    reported_by: "utente-2",
    data: {},
  });

  await decidi("not_accrued");

  const riga = fake.rows("fundingAccrual")[0];
  assert.equal(riga.reported_at, null, "va rendicontato di nuovo");
  assert.equal(riga.reported_by, null);
});

test("F8 · la conferma dell'ente supera la decisione della societa", async () => {
  /*
    **Il reperto F8.** Il marcatore della decisione manuale sopravviveva alla
    conferma esterna: il periodo continuava a portare l'etichetta «deciso dalla
    societa» — falsa, perche nel frattempo l'ente aveva dichiarato lui
    l'importo — e a essere saltato da ogni ricalcolo, per sempre. Un
    congelamento che non aveva deciso nessuno.
  */
  const ESTERNO = "cccccccc-0000-4000-8000-00000000000e";
  fake.rows("fundingProgram").push(
    programma({ id: ESTERNO, accrual_source: "external_confirmation" }),
  );
  fake.rows("fundingEnrollment").push({
    id: "adesione-esterna",
    organization_id: CLUB,
    program_id: ESTERNO,
    athlete_id: ANNA,
    assigned_amount: 150,
    status: "active",
    enrolled_at: new Date("2026-01-01T00:00:00.000Z"),
  });

  await funding.decideAccrualPeriod(
    { enrollmentId: "adesione-esterna", periodIndex: 0, decision: "accrued" },
    scope(),
  );

  const riga = fake
    .rows("fundingAccrual")
    .find((voce) => voce.enrollment_id === "adesione-esterna");
  assert.equal(riga.data.manualDecision, true);

  await funding.confirmAccrualPeriods(
    {
      enrollmentId: "adesione-esterna",
      confirmations: [{ accrualId: riga.id, amount: 40 }],
    },
    scope(),
  );

  const confermata = fake
    .rows("fundingAccrual")
    .find((voce) => voce.enrollment_id === "adesione-esterna");

  assert.equal(Number(confermata.accrued_amount), 40);
  assert.equal(
    confermata.data.manualDecision,
    false,
    "la provenienza mostrata all'operatore deve essere quella vera",
  );
});
