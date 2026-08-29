import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il dominio del libro soci, senza database (Wave 4, W4-F, §19).
 *
 * Quattro cose vanno dimostrate, non affermate:
 *
 * 1. **lo stato si deriva**, e non e un flag: e l'ultimo evento efficace;
 * 2. **la derivazione risponde a una data**. «Chi era socio il 12 marzo 2026»
 *    e la domanda per cui il registro esiste — la decommercializzazione di
 *    un'entrata dipende dalla qualifica della controparte al momento
 *    dell'operazione, non da quella di oggi (§32.5);
 * 3. **un socio si ammette una volta sola**, e chi rientra viene riammesso:
 *    la regola e detta prima, con una frase leggibile, e non lasciata al
 *    vincolo del database;
 * 4. **il numero non porta l'anno**: identifica la persona, non l'esercizio.
 */

let model;

before(async () => {
  model = await import("../../src/lib/members/model.ts");
});

const AMMISSIONE = {
  id: "evento-1",
  eventType: "ADMISSION",
  effectiveDate: "2024-09-01",
  resolutionReference: "Delibera 12/2024",
  resolutionDate: "2024-08-28",
  membershipNumber: "0007",
  createdAt: "2024-09-01T10:00:00.000Z",
};

const DIMISSIONE = {
  id: "evento-2",
  eventType: "RESIGNATION",
  effectiveDate: "2026-06-30",
  reason: "Trasferimento in altra citta",
  createdAt: "2026-07-02T09:00:00.000Z",
};

/* ------------------------------------------------------- la derivazione */

test("nessun evento: la persona non e socia, e non e un errore", () => {
  const stato = model.deriveMemberStatus([]);

  assert.equal(stato.status, "mai_ammesso");
  assert.equal(stato.isMember, false);
  assert.equal(stato.qualification, "non_socio");
  assert.equal(stato.membershipNumber, null);
  assert.equal(stato.eventCount, 0);
});

test("lo stato e l'ultimo evento efficace, e il numero resta quello dell'ammissione", () => {
  const stato = model.deriveMemberStatus([DIMISSIONE, AMMISSIONE]);

  assert.equal(stato.status, "dimesso");
  assert.equal(stato.isMember, false);
  assert.equal(stato.qualification, "cessato");
  assert.equal(stato.reason, "Trasferimento in altra citta");
  assert.equal(stato.endedOn, new Date("2026-06-30").toISOString());
  assert.equal(stato.admittedOn, new Date("2024-09-01").toISOString());
  assert.equal(
    stato.membershipNumber,
    "0007",
    "una dimissione non cancella il numero con cui quella persona compare nei verbali",
  );
  assert.equal(stato.eventCount, 2);
});

test("«chi era socio il 12 marzo 2026»: la data cambia la risposta", () => {
  const eventi = [AMMISSIONE, DIMISSIONE];

  const durante = model.deriveMemberStatus(eventi, "2026-03-12");
  assert.equal(durante.isMember, true, "il 12 marzo 2026 era socio");
  assert.equal(durante.status, "ammesso");
  assert.equal(durante.eventCount, 1, "la dimissione di giugno non era accaduta");

  const dopo = model.deriveMemberStatus(eventi, "2026-12-31");
  assert.equal(dopo.isMember, false);
  assert.equal(dopo.status, "dimesso");

  const prima = model.deriveMemberStatus(eventi, "2024-01-01");
  assert.equal(prima.status, "mai_ammesso");
  assert.equal(
    prima.isMember,
    false,
    "prima dell'ammissione non era socio, e il libro non puo dire il contrario",
  );

  // Lo stato **corrente** resta quello di oggi: `atDate` non lo sostituisce.
  assert.equal(model.deriveMemberStatus(eventi).status, "dimesso");
});

test("riammissione: torna socio, e il libro dice che e un rientro", () => {
  const riammissione = {
    id: "evento-3",
    eventType: "REINSTATEMENT",
    effectiveDate: "2026-09-01",
    resolutionReference: "Delibera 3/2026",
    createdAt: "2026-09-01T08:00:00.000Z",
  };

  const stato = model.deriveMemberStatus([AMMISSIONE, DIMISSIONE, riammissione]);

  assert.equal(stato.status, "riammesso");
  assert.equal(stato.isMember, true);
  assert.equal(stato.qualification, "attivo");
  assert.equal(
    stato.admittedOn,
    new Date("2024-09-01").toISOString(),
    "la data di ingresso resta quella dell'ammissione originaria",
  );
  assert.equal(stato.membershipNumber, "0007");
  assert.equal(stato.resolutionReference, "Delibera 3/2026");
});

test("a parita di data l'ordine e deterministico: created_at, poi id", () => {
  const stessaData = [
    {
      id: "b",
      eventType: "EXPULSION",
      effectiveDate: "2026-05-01",
      reason: "Morosita",
      createdAt: "2026-05-02T10:00:00.000Z",
    },
    {
      id: "a",
      eventType: "ADMISSION",
      effectiveDate: "2026-05-01",
      createdAt: "2026-05-01T10:00:00.000Z",
    },
  ];

  assert.equal(model.deriveMemberStatus(stessaData).status, "espulso");
  assert.equal(
    model.deriveMemberStatus([...stessaData].reverse()).status,
    "espulso",
    "l'ordine di arrivo non deve poter cambiare la risposta",
  );
});

test("un evento con data illeggibile resta nel libro invece di sparire", () => {
  const rotto = {
    id: "evento-x",
    eventType: "LAPSE",
    effectiveDate: "data-sbagliata",
    reason: "Import legacy",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const stato = model.deriveMemberStatus([AMMISSIONE, rotto]);
  assert.equal(stato.status, "decaduto");
  assert.equal(stato.eventCount, 2);
});

test("un evento di tipo sconosciuto non entra nella derivazione", () => {
  const stato = model.deriveMemberStatus([
    AMMISSIONE,
    { id: "evento-y", eventType: "SOSPENSIONE", effectiveDate: "2026-01-01" },
  ]);

  assert.equal(stato.status, "ammesso");
  assert.equal(stato.eventCount, 1);
});

/* ------------------------------------------------------- le transizioni */

test("un socio si ammette una volta sola, e il rifiuto dice cosa fare", () => {
  assert.equal(model.canApplyMembershipEvent("ammesso", "ADMISSION"), false);
  assert.match(
    model.explainMembershipEventDenial("ammesso", "ADMISSION"),
    /gia socia/i,
  );
  assert.match(
    model.explainMembershipEventDenial("dimesso", "ADMISSION"),
    /riammissione/i,
    "a chi e uscito si propone la riammissione, non un secondo ingresso",
  );

  assert.equal(model.canApplyMembershipEvent("dimesso", "REINSTATEMENT"), true);
  assert.equal(model.canApplyMembershipEvent("mai_ammesso", "ADMISSION"), true);
});

test("non si dimette chi non risulta socio", () => {
  for (const tipo of ["RESIGNATION", "EXPULSION", "LAPSE"]) {
    assert.equal(model.canApplyMembershipEvent("mai_ammesso", tipo), false);
    assert.match(
      model.explainMembershipEventDenial("mai_ammesso", tipo),
      /nessuna ammissione/i,
    );
  }

  assert.match(
    model.explainMembershipEventDenial("espulso", "RESIGNATION"),
    /gia chiusa/i,
  );
  assert.match(
    model.explainMembershipEventDenial("ammesso", "REINSTATEMENT"),
    /gia socia/i,
  );
  assert.match(
    model.explainMembershipEventDenial("ammesso", "SOSPENSIONE"),
    /Evento sconosciuto/i,
  );
});

/* --------------------------------------------------------- la validazione */

test("l'ammissione chiede la delibera, la cessazione chiede il motivo", () => {
  const senzaDelibera = model.validateMembershipEventDraft({
    eventType: "ADMISSION",
    effectiveDate: "2026-01-10",
  });
  assert.equal(senzaDelibera.ok, false);
  assert.equal(senzaDelibera.issues[0].field, "resolutionReference");

  const senzaMotivo = model.validateMembershipEventDraft({
    eventType: "RESIGNATION",
    effectiveDate: "2026-01-10",
  });
  assert.equal(senzaMotivo.ok, false);
  assert.equal(senzaMotivo.issues[0].field, "reason");

  const senzaData = model.validateMembershipEventDraft({
    eventType: "REINSTATEMENT",
  });
  assert.equal(senzaData.ok, false);
  assert.equal(senzaData.issues[0].field, "effectiveDate");

  assert.equal(
    model.validateMembershipEventDraft({
      eventType: "RESIGNATION",
      effectiveDate: "2026-01-10",
      reason: "Dimissioni volontarie",
    }).ok,
    true,
  );
});

/* ------------------------------------------------------------- il numero */

test("il numero e progressivo, con quattro cifre, e non porta l'anno", () => {
  assert.equal(model.formatMembershipNumber(1), "0001");
  assert.equal(model.formatMembershipNumber(42), "0042");
  assert.equal(model.formatMembershipNumber(12345), "12345");

  assert.equal(
    model.MEMBERSHIP_SEQUENCE_YEAR,
    0,
    "la sequenza dei soci non si azzera a gennaio: un numero identifica la persona",
  );
  assert.notEqual(
    model.MEMBERSHIP_SEQUENCE_KIND,
    "receipt",
    "il socio non e un documento fiscale: condivide solo il contatore",
  );
});

/* ------------------------------------------------------------ il prodotto */

test("la classificazione del prodotto non promette una conformita che non esiste", () => {
  const testo = model.MEMBERSHIP_REGISTER_DISCLAIMER.toLowerCase();

  /*
    Il libro soci per una ASD non-ETS e obbligo statutario o elemento
    probatorio, non obbligo di legge autonomo (§19, §31): un'etichetta come
    «conforme» o «a norma» prometterebbe una conformita che nessuna norma
    definisce, e chi la legge smetterebbe di chiedere al proprio consulente.
  */
  for (const promessa of ["conforme", "a norma", "legalmente", "per il deposito"]) {
    assert.equal(
      testo.includes(promessa),
      false,
      `la frase non deve promettere «${promessa}»`,
    );
  }

  assert.match(testo, /non e un modello ufficiale/);
  assert.match(testo, /statuto/);
  assert.ok(model.MEMBERSHIP_INVARIANTS.length >= 8);
});
