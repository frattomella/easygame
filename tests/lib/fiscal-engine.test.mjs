import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il **motore fiscale**: cosa EasyGame propone, e cosa non decide.
 *
 * La regola piu importante del Blocco D si prova qui: **un incasso non diventa
 * una fattura.** Se il motore trasformasse ogni movimento di denaro in un
 * adempimento produrrebbe fatture che nessuno doveva emettere — per la
 * maggioranza delle ASD, tutte — e lo farebbe con l'aria della competenza.
 *
 * La seconda regola e speculare: EasyGame **propone**, non impedisce. Da «non
 * so cosa sia questo incasso» non segue «non si puo fatturare»: chi emette sa,
 * e resta libero di scegliere.
 */

let engine;
let operations;
let profileLib;

before(async () => {
  engine = await import("../../src/lib/fiscal/engine.ts");
  operations = await import("../../src/lib/fiscal/operation-types.ts");
  profileLib = await import("../../src/lib/fiscal/fiscal-profile.ts");
});

const PROFILO_COMPLETO = () =>
  profileLib.normalizeFiscalProfile({
    legalForm: "asd",
    legalName: "ASD Alfa",
    vatNumber: "12345678903",
    taxRegimeCode: "RF01",
    address: "Via Roma 1",
    city: "Roma",
    postalCode: "00100",
    province: "RM",
  });

const INTESTATARIO_COMPLETO = {
  name: "Anna Rossi",
  fiscalCode: "RSSNNA80A41H501K",
  address: "Via Milano 4",
  city: "Roma",
  postalCode: "00185",
  province: "RM",
};

const tipo = (code) =>
  operations.normalizeOperationType(
    operations.OPERATION_TYPE_SEEDS.find((seed) => seed.code === code),
  );

/* --------------------------------------- un incasso non e una fattura */

test("una quota di attivita propone una ricevuta, non una fattura", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO_COMPLETO(),
    operationType: tipo("quota_attivita"),
    recipient: INTESTATARIO_COMPLETO,
  });

  assert.equal(decisione.suggested, "receipt");
  assert.deepEqual(decisione.allowed, ["receipt"]);
});

test("un contributo non produce nessun documento fiscale", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO_COMPLETO(),
    operationType: tipo("contributo"),
    recipient: INTESTATARIO_COMPLETO,
  });

  assert.equal(decisione.route, "none");
  assert.equal(decisione.suggested, null);
  assert.deepEqual(decisione.allowed, []);
});

test("una sponsorizzazione richiede una fattura: e verso un altro soggetto economico", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO_COMPLETO(),
    operationType: tipo("sponsorizzazione"),
    recipient: {
      ...INTESTATARIO_COMPLETO,
      name: "Rossi & Figli S.r.l.",
      vatNumber: "12345678903",
    },
  });

  assert.equal(decisione.suggested, "invoice");
  assert.deepEqual(decisione.allowed, ["invoice"]);
});

test("una vendita di abbigliamento ammette entrambi, e propone la ricevuta", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO_COMPLETO(),
    operationType: tipo("vendita_abbigliamento"),
    recipient: INTESTATARIO_COMPLETO,
  });

  assert.deepEqual(decisione.allowed, ["receipt", "invoice"]);
  assert.equal(
    decisione.suggested,
    "receipt",
    "fra i due si propone quello che non afferma nulla di piu di quel che si sa",
  );
});

/* --------------------------------- «non lo so» non significa «non si puo» */

test("un incasso non classificato propone la ricevuta ma non vieta la fattura", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO_COMPLETO(),
    operationType: null,
    recipient: INTESTATARIO_COMPLETO,
  });

  assert.equal(decisione.suggested, "receipt");
  assert.ok(decisione.allowed.includes("invoice"));
  assert.equal(decisione.needsConfiguration, true);
});

/* --------------------------------------------------- cosa blocca la fattura */

test("senza i dati dell'emittente la fattura non si emette, e si dice quali mancano", () => {
  const decisione = engine.decideDocument({
    profile: profileLib.createEmptyFiscalProfile(),
    operationType: tipo("sponsorizzazione"),
    recipient: INTESTATARIO_COMPLETO,
  });

  assert.equal(decisione.suggested, null);
  assert.ok(decisione.blockers.some((entry) => entry.startsWith("emittente:")));
});

test("senza i dati dell'intestatario la fattura non si emette", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO_COMPLETO(),
    operationType: tipo("sponsorizzazione"),
    recipient: { name: "Anna Rossi" },
  });

  assert.ok(
    decisione.blockers.some((entry) => entry.startsWith("intestatario:")),
  );
});

test("i requisiti della fattura valgono su tutte le diramazioni", () => {
  /*
    Un requisito controllato in un ramo e dimenticato nell'altro e esattamente
    il modo in cui una fattura senza codice fiscale finisce emessa.
  */
  const incompleto = { name: "Anna Rossi" };

  for (const codice of [
    "sponsorizzazione",
    "vendita_abbigliamento",
    "corso_servizio",
  ]) {
    const decisione = engine.decideDocument({
      profile: PROFILO_COMPLETO(),
      operationType: tipo(codice),
      recipient: incompleto,
    });

    assert.ok(
      decisione.blockers.length > 0,
      `${codice} deve dichiarare cosa manca per la fattura`,
    );
  }
});

test("la ricevuta non ha requisiti: un incasso avvenuto si documenta comunque", () => {
  const decisione = engine.decideDocument({
    profile: profileLib.createEmptyFiscalProfile(),
    operationType: tipo("quota_attivita"),
    recipient: { name: "" },
  });

  assert.equal(decisione.suggested, "receipt");
  assert.deepEqual(decisione.blockers, []);
});

/* ------------------------------------- niente conclusioni non configurate */

test("nessun tipo di operazione porta con se un'aliquota inventata", () => {
  for (const seed of operations.OPERATION_TYPE_SEEDS) {
    const normalizzato = operations.normalizeOperationType(seed);

    assert.equal(
      normalizzato.vatRate,
      null,
      `${seed.code}: un'aliquota proposta da un software e un'aliquota che nessuno ha letto`,
    );
    assert.equal(normalizzato.vatNature, null);
  }
});

test("«non dichiarata» e «zero» sono due cose diverse", () => {
  assert.equal(operations.normalizeOperationType({ vatRate: null }).vatRate, null);
  assert.equal(operations.normalizeOperationType({ vatRate: 0 }).vatRate, 0);
  assert.equal(operations.normalizeOperationType({ vatRate: 22 }).vatRate, 22);
});

test("l'ambito resta «non dichiarato» dove dipende dal soggetto", () => {
  assert.equal(tipo("quota_associativa").activityScope, "unspecified");
  assert.equal(
    tipo("vendita_abbigliamento").activityScope,
    "commercial",
    "una cessione di beni e commerciale per definizione, non per regime",
  );
});

/* -------------------------------------------------------------- il bollo */

test("il bollo non si applica se il club non lo ha configurato", () => {
  const esito = engine.resolveStampDuty({
    profile: PROFILO_COMPLETO(),
    amountCents: 20000,
  });

  assert.equal(esito.applies, false);
  assert.equal(esito.amountCents, 0);
});

test("configurato, il bollo si applica sopra la soglia", () => {
  const profilo = profileLib.normalizeFiscalProfile({
    ...PROFILO_COMPLETO(),
    stampDuty: { enabled: true, thresholdCents: 7745, amountCents: 200 },
  });

  /*
    **L'aliquota si dichiara.** Il campo `vatRate` ha tre stati e non due:
    `0` e un'aliquota dichiarata — esente, non imponibile, fuori campo — ed e
    cosa diversa da `null`, che vuol dire «nessuno l'ha classificata». Prima
    il chiamante passava `Boolean(vatRate)`, e `Boolean(0)` e falso: le due
    cose finivano nello stesso ramo.
  */
  assert.equal(
    engine.resolveStampDuty({ profile: profilo, amountCents: 5000, vatRate: 0 }).applies,
    false,
  );
  assert.equal(
    engine.resolveStampDuty({ profile: profilo, amountCents: 20000, vatRate: 0 })
      .amountCents,
    200,
  );
});

test("senza aliquota dichiarata il motore non decide: lo dice", () => {
  /*
    Un bollo silenziosamente omesso e un bollo silenziosamente applicato sono
    due errori, e nessuno dei due si vede. ADR-0073: il motore propone e
    spiega; cio che non e classificato non produce un numero definitivo.
  */
  const profilo = profileLib.normalizeFiscalProfile({
    ...PROFILO_COMPLETO(),
    stampDuty: { enabled: true, thresholdCents: 7745, amountCents: 200 },
  });

  const esito = engine.resolveStampDuty({ profile: profilo, amountCents: 20000 });

  assert.equal(esito.applies, false);
  assert.equal(esito.amountCents, 0);
  assert.equal(esito.undetermined, true, "e una domanda senza risposta, non un no");
  assert.match(esito.reason, /non e dichiarata|Configurare la causale/i);
});

test("un'aliquota positiva esclude il bollo, e non e indeterminata", () => {
  const profilo = profileLib.normalizeFiscalProfile({
    ...PROFILO_COMPLETO(),
    stampDuty: { enabled: true, thresholdCents: 7745, amountCents: 200 },
  });

  const esito = engine.resolveStampDuty({
    profile: profilo,
    amountCents: 20000,
    vatRate: 22,
  });

  assert.equal(esito.applies, false);
  assert.equal(esito.undetermined, false);
});

test("il bollo non si applica su un'operazione imponibile IVA", () => {
  const profilo = profileLib.normalizeFiscalProfile({
    ...PROFILO_COMPLETO(),
    stampDuty: { enabled: true, thresholdCents: 7745, amountCents: 200 },
  });

  assert.equal(
    engine.resolveStampDuty({
      profile: profilo,
      amountCents: 20000,
      vatApplied: true,
    }).applies,
    false,
  );
});
