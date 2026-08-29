import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **FatturaPA**: cosa EasyGame prepara, e cosa non dichiara mai.
 *
 * Il vincolo che questi test presidiano e uno solo, e non e tecnico: **nessun
 * documento puo risultare trasmesso allo SdI se non e transitato dallo SdI.**
 * Marcarlo «inviato» farebbe credere a una societa di aver adempiuto, e se ne
 * accorgerebbe da una sanzione. Finche non e stato scelto un intermediario
 * accreditato, gli stati che presuppongono un invio sono **irraggiungibili**,
 * e il registro degli adapter e vuoto per costruzione.
 */

let builder;
let states;
let provider;
let profileLib;

before(async () => {
  builder = await import("../../src/lib/fiscal/fatturapa/builder.ts");
  states = await import("../../src/lib/fiscal/fatturapa/states.ts");
  provider = await import("../../src/lib/fiscal/fatturapa/provider.ts");
  profileLib = await import("../../src/lib/fiscal/fiscal-profile.ts");
});

const PROFILO = () =>
  profileLib.normalizeFiscalProfile({
    legalForm: "asd",
    legalName: "ASD Alfa",
    vatNumber: "12345678903",
    taxRegimeCode: "RF01",
    address: "Via Roma 1",
    city: "Roma",
    postalCode: "00100",
    province: "RM",
    country: "IT",
  });

const INTESTATARIO = {
  name: "Rossi & Figli S.r.l.",
  vatNumber: "00743110157",
  recipientCode: "ABC1234",
  address: "Via Milano 4",
  city: "Roma",
  postalCode: "00185",
  province: "RM",
  country: "IT",
};

const DOCUMENTO = {
  documentType: "TD01",
  number: "FT-2026-0007",
  date: "2026-08-26",
  currency: "EUR",
  lines: [
    {
      description: "Sponsorizzazione stagione 2026/27",
      quantity: 1,
      unitPriceCents: 100000,
      vatRate: 22,
      vatNature: null,
    },
  ],
};

const costruisci = (over = {}) =>
  builder.buildEInvoiceXml({
    profile: PROFILO(),
    document: DOCUMENTO,
    recipient: INTESTATARIO,
    progressive: 7,
    ...over,
  });

/* ------------------------------------------- niente falsi invii allo SdI */

test("nessun intermediario e collegato, e lo si dice a chiare lettere", () => {
  const capability = provider.describeEInvoiceCapability({ providerKey: null });

  assert.equal(capability.canTransmit, false);
  assert.match(capability.message, /non configurato/i);
  assert.match(capability.message, /non e attiva/i);
});

test("scegliere un provider non lo collega: manca l'adapter, e si dice quale", () => {
  const capability = provider.describeEInvoiceCapability({
    providerKey: "aruba",
  });

  assert.equal(capability.canTransmit, false);
  assert.match(capability.message, /Aruba/);
  assert.match(capability.message, /non e ancora collegato/i);
});

test("nessun provider del catalogo ha un adapter scritto", () => {
  /*
    Un adapter finto che risponde «trasmessa» e peggio di nessun adapter:
    produce esattamente lo stato che non si deve poter raggiungere, e lo
    produce in modo indistinguibile da quello vero.
  */
  for (const chiave of provider.EINVOICE_PROVIDER_KEYS) {
    assert.equal(provider.getEInvoiceProvider(chiave), null, chiave);
    assert.equal(provider.EINVOICE_PROVIDERS[chiave].hasAdapter, false);
  }
});

test("senza intermediario non si passa a «trasmessa»", () => {
  const esito = states.canTransition("ready_to_send", "sent", {
    providerConfigured: false,
  });

  assert.equal(esito.allowed, false);
  assert.match(esito.reason, /non e attiva/i);
});

test("senza intermediario nessuno stato di consegna e raggiungibile", () => {
  for (const stato of ["sent", "delivered", "not_delivered", "rejected"]) {
    assert.equal(
      states.EINVOICE_STATE_DEFINITIONS[stato].reachableWithoutProvider,
      false,
      stato,
    );
  }
});

test("«pronta per la trasmissione» e il piu avanti che si arriva", () => {
  assert.equal(states.MAX_STATE_WITHOUT_PROVIDER, "ready_to_send");
  assert.equal(
    states.EINVOICE_STATE_DEFINITIONS.ready_to_send.reachableWithoutProvider,
    true,
  );
});

test("preparare il tracciato resta possibile senza intermediario", () => {
  for (const [da, a] of [
    ["draft", "generated"],
    ["generated", "ready_to_send"],
  ]) {
    assert.equal(
      states.canTransition(da, a, { providerConfigured: false }).allowed,
      true,
      `${da} -> ${a}`,
    );
  }
});

test("una transizione non prevista si rifiuta anche con l'intermediario", () => {
  const esito = states.canTransition("draft", "delivered", {
    providerConfigured: true,
  });

  assert.equal(esito.allowed, false);
});

test("una fattura consegnata non torna indietro", () => {
  assert.equal(
    states.canTransition("delivered", "draft", { providerConfigured: true })
      .allowed,
    false,
  );
});

test("una fattura scartata si corregge e si ricomincia dal tracciato", () => {
  assert.equal(
    states.canTransition("rejected", "draft", { providerConfigured: true })
      .allowed,
    true,
  );
});

/* --------------------------------------------------------- il tracciato */

test("il tracciato porta emittente, intestatario e importi", () => {
  const costruito = costruisci();

  assert.match(costruito.xml, /<Denominazione>ASD Alfa<\/Denominazione>/);
  assert.match(costruito.xml, /<IdCodice>12345678903<\/IdCodice>/);
  assert.match(costruito.xml, /<RegimeFiscale>RF01<\/RegimeFiscale>/);
  assert.match(costruito.xml, /<Numero>FT-2026-0007<\/Numero>/);
  /*
    **1.220,00 e non 1.000,00.** Questo test asseriva il difetto: una riga da
    1.000 EUR al 22% dichiarava come totale del documento l'imponibile netto,
    mentre il <DatiRiepilogo> accanto esponeva 220 EUR di imposta. Il documento
    contraddiceva se stesso.

    Non si manifestava solo perche l'unica classificazione raggiungibile aveva
    aliquota nulla: ogni documento nasceva senza IVA. La Wave 4 rende
    raggiungibile una causale con un'aliquota, e il difetto sarebbe diventato
    attivo.
  */
  assert.match(costruito.xml, /<ImportoTotaleDocumento>1220.00</);
  assert.match(costruito.xml, /<ImponibileImporto>1000.00</);
  assert.match(costruito.xml, /<Imposta>220.00</);
  assert.equal(costruito.totalCents, 122000);
  assert.equal(costruito.formallyValid, true);
});

test("senza imposta il totale resta l'imponibile, e con il bollo lo comprende", () => {
  const esente = costruisci({
    document: {
      ...DOCUMENTO,
      lines: [{ ...DOCUMENTO.lines[0], vatRate: 0, vatNature: "N2.2" }],
    },
  });
  assert.equal(esente.totalCents, 100000);

  const conBollo = costruisci({
    document: {
      ...DOCUMENTO,
      stampDutyCents: 200,
      lines: [{ ...DOCUMENTO.lines[0], vatRate: 0, vatNature: "N2.2" }],
    },
  });
  assert.equal(conBollo.totalCents, 100200);
});

test("con due aliquote l'imposta si arrotonda per riepilogo, non per riga", () => {
  /*
    Sommare imposte arrotondate riga per riga darebbe un totale diverso da
    quello che il documento stesso dichiara nei suoi riepiloghi.
  */
  const costruito = costruisci({
    document: {
      ...DOCUMENTO,
      lines: [
        { description: "A", quantity: 1, unitPriceCents: 3333, vatRate: 22, vatNature: null },
        { description: "B", quantity: 1, unitPriceCents: 3333, vatRate: 22, vatNature: null },
        { description: "C", quantity: 1, unitPriceCents: 5000, vatRate: 10, vatNature: null },
      ],
    },
  });

  /* 6.666 al 22% = 1.466,52 -> 1.467 centesimi; 5.000 al 10% = 500. */
  assert.equal(costruito.totalCents, 6666 + 5000 + 1467 + 500);
});

test("il nome file segue la convenzione dello SdI", () => {
  assert.equal(
    builder.buildEInvoiceFileName({
      country: "IT",
      identifier: "12345678903",
      progressive: 7,
    }),
    "IT12345678903_00007.xml",
  );
});

test("il progressivo del nome file e alfanumerico, non decimale", () => {
  /*
    Cinque caratteri decimali si esauriscono a centomila documenti, e un
    emittente che li esaurisce si trova con un nome file duplicato — che lo SdI
    rifiuta.
  */
  const nome = builder.buildEInvoiceFileName({
    country: "IT",
    identifier: "12345678903",
    progressive: 100000,
  });

  assert.equal(nome, "IT12345678903_0255S.xml");
});

test("una ragione sociale con la e commerciale non rompe l'XML", () => {
  const costruito = costruisci();

  assert.match(costruito.xml, /Rossi &amp; Figli/);
  assert.doesNotMatch(costruito.xml, /Rossi & Figli/);
});

/* -------------------------------------------------------- la validazione */

test("aliquota zero senza natura IVA e uno scarto annunciato", () => {
  const costruito = costruisci({
    document: {
      ...DOCUMENTO,
      lines: [{ ...DOCUMENTO.lines[0], vatRate: 0, vatNature: null }],
    },
  });

  assert.equal(costruito.formallyValid, false);
  assert.ok(
    costruito.issues.some((issue) => issue.path.endsWith("vatNature")),
    "lo SdI vuole sapere perche non c'e IVA: «non c'e» non e una risposta",
  );
});

test("aliquota zero con natura IVA passa", () => {
  const costruito = costruisci({
    document: {
      ...DOCUMENTO,
      lines: [{ ...DOCUMENTO.lines[0], vatRate: 0, vatNature: "N2.2" }],
    },
  });

  assert.equal(costruito.formallyValid, true);
  assert.match(costruito.xml, /<Natura>N2.2<\/Natura>/);
});

test("un intestatario senza canale ne PEC viene segnalato", () => {
  const costruito = costruisci({
    recipient: { ...INTESTATARIO, recipientCode: null, pec: null },
  });

  assert.equal(costruito.formallyValid, false);
  assert.ok(
    costruito.issues.some((issue) => /0000000/.test(issue.message)),
    "per un privato senza canale il tracciato prevede 0000000: si dice, non si indovina",
  );
});

test("un emittente senza regime fiscale non produce un tracciato valido", () => {
  const costruito = costruisci({
    profile: profileLib.normalizeFiscalProfile({
      ...PROFILO(),
      taxRegimeCode: "",
    }),
  });

  assert.equal(costruito.formallyValid, false);
  assert.ok(costruito.issues.some((issue) => issue.path === "profile"));
});

test("il tracciato si produce comunque, anche con dei rilievi", () => {
  /*
    Un file incompleto che si puo leggere aiuta chi deve capire cosa manca
    molto piu di un errore che non produce niente. Quel che i rilievi
    impediscono e il passaggio a «pronta», non la generazione.
  */
  const costruito = costruisci({
    recipient: { ...INTESTATARIO, address: "" },
  });

  assert.ok(costruito.xml.length > 0);
  assert.equal(costruito.formallyValid, false);
});
