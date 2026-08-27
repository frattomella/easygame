import assert from "node:assert/strict";
import test, { before } from "node:test";
import { createHmac } from "node:crypto";

/**
 * La firma di un webhook: l'unica cosa che distingue il PSP da chiunque.
 *
 * L'endpoint del webhook e pubblico. Senza verifica, «il pagamento e
 * riuscito» e una frase che puo scrivere chiunque conosca l'indirizzo, e un
 * incasso mai avvenuto entra in contabilita. Questi test costruiscono le
 * firme a mano, con la stessa procedura documentata da Stripe, e provano ogni
 * modo in cui una firma puo essere sbagliata — perche e l'unico pezzo
 * dell'integrazione che si puo collaudare davvero senza un account.
 */

let signature;
let stripe;

before(async () => {
  signature = await import(
    "../../src/lib/payments/gateway/providers/stripe-signature.ts"
  );
  stripe = await import("../../src/lib/payments/gateway/providers/stripe.ts");
});

const SECRET = "whsec_prova_non_e_un_segreto_vero";

const sign = (rawBody, { secret = SECRET, timestamp = 1_700_000_000 } = {}) => {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  return { header: `t=${timestamp},v1=${digest}`, timestamp };
};

const at = (timestamp) => new Date(timestamp * 1000);

const EVENT = JSON.stringify({
  id: "evt_1",
  type: "checkout.session.completed",
  created: 1_700_000_000,
  data: {
    object: {
      object: "checkout.session",
      id: "cs_1",
      status: "complete",
      payment_status: "paid",
      amount_total: 5000,
      created: 1_700_000_000,
      metadata: {
        easygame_organization_id: "club-1",
        easygame_payment_id: "rata-1",
        easygame_platform_fee_cents: "125",
      },
    },
  },
});

/* ---------------------------------------------------- l'intestazione */

test("l'intestazione si scompone in momento e firme", () => {
  const parsed = signature.parseStripeSignatureHeader(
    "t=1492774577,v1=aaa,v0=bbb",
  );

  assert.equal(parsed.timestamp, 1492774577);
  assert.deepEqual(
    parsed.signatures,
    ["aaa"],
    "v0 e uno schema finto per i test: accettarlo e un attacco di downgrade",
  );
});

test("piu firme v1 convivono: e la rotazione del segreto", () => {
  const parsed = signature.parseStripeSignatureHeader("t=1,v1=aaa,v1=bbb");
  assert.deepEqual(parsed.signatures, ["aaa", "bbb"]);
});

test("un'intestazione senza firme v1 non e un'intestazione", () => {
  assert.throws(
    () => signature.parseStripeSignatureHeader("t=1,v0=bbb"),
    /firme v1/,
  );
});

test("un'intestazione senza momento non e un'intestazione", () => {
  assert.throws(
    () => signature.parseStripeSignatureHeader("v1=aaa"),
    /momento valido/,
  );
});

/* ------------------------------------------------------- la verifica */

test("una firma costruita con il segreto giusto passa", () => {
  const { header, timestamp } = sign(EVENT);

  const esito = signature.verifyStripeSignature({
    rawBody: EVENT,
    header,
    secret: SECRET,
    now: at(timestamp),
  });

  assert.equal(esito.valid, true);
});

test("un corpo modificato di un carattere non passa piu", () => {
  const { header, timestamp } = sign(EVENT);

  const esito = signature.verifyStripeSignature({
    rawBody: EVENT.replace('"amount_total":5000', '"amount_total":500000'),
    header,
    secret: SECRET,
    now: at(timestamp),
  });

  assert.equal(esito.valid, false);
  assert.equal(esito.reason, "mismatch");
});

test("un segreto diverso non passa", () => {
  const { header, timestamp } = sign(EVENT, { secret: "whsec_altro" });

  const esito = signature.verifyStripeSignature({
    rawBody: EVENT,
    header,
    secret: SECRET,
    now: at(timestamp),
  });

  assert.equal(esito.valid, false);
  assert.equal(esito.reason, "mismatch");
});

test("una firma valida ma vecchia non passa: e un replay", () => {
  const { header, timestamp } = sign(EVENT);

  const esito = signature.verifyStripeSignature({
    rawBody: EVENT,
    header,
    secret: SECRET,
    now: at(timestamp + 3600),
  });

  assert.equal(esito.valid, false);
  assert.equal(esito.reason, "stale");
});

test("un evento firmato nel futuro oltre tolleranza non passa", () => {
  const { header, timestamp } = sign(EVENT);

  const esito = signature.verifyStripeSignature({
    rawBody: EVENT,
    header,
    secret: SECRET,
    now: at(timestamp - 3600),
  });

  assert.equal(esito.valid, false);
  assert.equal(esito.reason, "stale");
});

test("la tolleranza predefinita e cinque minuti", () => {
  assert.equal(signature.STRIPE_WEBHOOK_TOLERANCE_SECONDS, 300);

  const { header, timestamp } = sign(EVENT);

  assert.equal(
    signature.verifyStripeSignature({
      rawBody: EVENT,
      header,
      secret: SECRET,
      now: at(timestamp + 299),
    }).valid,
    true,
  );
  assert.equal(
    signature.verifyStripeSignature({
      rawBody: EVENT,
      header,
      secret: SECRET,
      now: at(timestamp + 301),
    }).valid,
    false,
  );
});

test("tolleranza zero non disabilita il controllo", () => {
  const { header, timestamp } = sign(EVENT);

  const esito = signature.verifyStripeSignature({
    rawBody: EVENT,
    header,
    secret: SECRET,
    now: at(timestamp + 600),
    toleranceSeconds: 0,
  });

  assert.equal(
    esito.valid,
    false,
    "zero e il valore con cui si spegne per sbaglio la protezione dal replay",
  );
});

test("senza segreto non si verifica niente", () => {
  const { header, timestamp } = sign(EVENT);

  const esito = signature.verifyStripeSignature({
    rawBody: EVENT,
    header,
    secret: "",
    now: at(timestamp),
  });

  assert.equal(esito.valid, false);
});

/* --------------------------------------------- l'evento, tradotto */

test("un evento firmato diventa un evento del gateway", () => {
  const { header, timestamp } = sign(EVENT);

  const evento = stripe.stripeProvider.parseWebhook({
    rawBody: EVENT,
    signature: header,
    secret: SECRET,
    now: at(timestamp),
  });

  assert.equal(evento.provider, "stripe");
  assert.equal(evento.id, "evt_1");
  assert.equal(evento.type, "checkout.session.completed");
  assert.equal(evento.payment.status, "succeeded");
  assert.equal(evento.payment.money.amountCents, 5000);
  assert.equal(evento.payment.platformFeeCents, 125);
  assert.equal(evento.payment.reference.organizationId, "club-1");
  assert.equal(evento.payment.reference.paymentId, "rata-1");
});

test("un evento non firmato non diventa niente", () => {
  assert.throws(
    () =>
      stripe.stripeProvider.parseWebhook({
        rawBody: EVENT,
        signature: "t=1700000000,v1=00",
        secret: SECRET,
        now: at(1_700_000_000),
      }),
    /Firma webhook non valida/,
  );
});

test("una sessione compilata ma non pagata non e un incasso", () => {
  const body = JSON.stringify({
    id: "evt_2",
    type: "checkout.session.completed",
    created: 1_700_000_000,
    data: {
      object: {
        object: "checkout.session",
        id: "cs_2",
        status: "complete",
        payment_status: "unpaid",
        amount_total: 5000,
        metadata: {},
      },
    },
  });
  const { header, timestamp } = sign(body);

  const evento = stripe.stripeProvider.parseWebhook({
    rawBody: body,
    signature: header,
    secret: SECRET,
    now: at(timestamp),
  });

  assert.equal(
    evento.payment.status,
    "pending",
    "con SEPA o bonifico il modulo e compilato ma il denaro non e arrivato",
  );
});

test("un PaymentIntent si legge con i suoi campi, non con quelli di una sessione", () => {
  const body = JSON.stringify({
    id: "evt_3",
    type: "payment_intent.succeeded",
    created: 1_700_000_000,
    data: {
      object: {
        object: "payment_intent",
        id: "pi_1",
        status: "succeeded",
        amount: 7500,
        application_fee_amount: 188,
        created: 1_700_000_000,
        metadata: { easygame_payment_id: "rata-2" },
      },
    },
  });
  const { header, timestamp } = sign(body);

  const evento = stripe.stripeProvider.parseWebhook({
    rawBody: body,
    signature: header,
    secret: SECRET,
    now: at(timestamp),
  });

  assert.equal(evento.payment.status, "succeeded");
  assert.equal(
    evento.payment.money.amountCents,
    7500,
    "un intent porta `amount`, non `amount_total`: leggerlo male darebbe zero",
  );
  assert.equal(evento.payment.platformFeeCents, 188);
  assert.equal(evento.payment.reference.paymentId, "rata-2");
});

test("un evento di un tipo sconosciuto non fa esplodere il webhook", () => {
  const body = JSON.stringify({
    id: "evt_4",
    type: "una.cosa.che.non.esisteva",
    created: 1_700_000_000,
    data: { object: { object: "qualcosa" } },
  });
  const { header, timestamp } = sign(body);

  const evento = stripe.stripeProvider.parseWebhook({
    rawBody: body,
    signature: header,
    secret: SECRET,
    now: at(timestamp),
  });

  assert.equal(evento.type, "una.cosa.che.non.esisteva");
  assert.equal(evento.payment, null);
});

/* ------------------------------- l'identita dell'incasso, dai due eventi */

const eventoFirmato = (corpo) => {
  const rawBody = JSON.stringify(corpo);
  return stripe.stripeProvider.parseWebhook({
    rawBody,
    signature: sign(rawBody).header,
    secret: SECRET,
    now: at(1_700_000_000),
  });
};

test("una sessione identifica l'incasso con il proprio intent", () => {
  /*
    **Il difetto trovato al secondo pagamento del collaudo sandbox.** I due
    eventi di un pagamento riuscito hanno in comune l'intent e nient'altro: un
    PaymentIntent non porta un riferimento alla sessione che lo ha creato, e
    non esiste un campo che lo riporti indietro.

    Finche la sessione si registrava con il proprio identificativo, la
    deduplica dipendeva dall'**ordine di arrivo** dei due eventi — e nel
    collaudo si sono presentati entrambi gli ordini, a un minuto di distanza.
  */
  const evento = eventoFirmato({
    id: "evt_s",
    type: "checkout.session.completed",
    created: 1_700_000_000,
    data: {
      object: {
        object: "checkout.session",
        id: "cs_1",
        payment_intent: "pi_1",
        status: "complete",
        payment_status: "paid",
        amount_total: 5000,
        metadata: {},
      },
    },
  });

  assert.equal(evento.payment.externalId, "pi_1");
  assert.ok(
    evento.payment.relatedExternalIds.includes("cs_1"),
    "la sessione resta un nome valido dello stesso denaro",
  );
});

test("una sessione senza intent conserva il proprio identificativo", () => {
  /*
    Con i metodi differiti la sessione si completa prima che l'intent esista.
    Restare senza identificativo vorrebbe dire un incasso che non si sa come
    chiamare.
  */
  const evento = eventoFirmato({
    id: "evt_s2",
    type: "checkout.session.completed",
    created: 1_700_000_000,
    data: {
      object: {
        object: "checkout.session",
        id: "cs_2",
        status: "complete",
        payment_status: "paid",
        amount_total: 5000,
        metadata: {},
      },
    },
  });

  assert.equal(evento.payment.externalId, "cs_2");
});

test("un intent identifica l'incasso con se stesso, e cita il proprio charge", () => {
  const evento = eventoFirmato({
    id: "evt_i",
    type: "payment_intent.succeeded",
    created: 1_700_000_000,
    data: {
      object: {
        object: "payment_intent",
        id: "pi_1",
        status: "succeeded",
        amount: 5000,
        latest_charge: "ch_1",
        metadata: {},
      },
    },
  });

  assert.equal(evento.payment.externalId, "pi_1");
  assert.ok(evento.payment.relatedExternalIds.includes("ch_1"));
});

test("sessione e intent dello stesso pagamento arrivano allo stesso nome", () => {
  /*
    L'invariante che chiude il difetto: comunque arrivino, i due eventi
    identificano l'incasso allo stesso modo.
  */
  const daSessione = eventoFirmato({
    id: "evt_a",
    type: "checkout.session.completed",
    created: 1_700_000_000,
    data: {
      object: {
        object: "checkout.session",
        id: "cs_9",
        payment_intent: "pi_9",
        status: "complete",
        payment_status: "paid",
        amount_total: 8000,
        metadata: {},
      },
    },
  });

  const daIntent = eventoFirmato({
    id: "evt_b",
    type: "payment_intent.succeeded",
    created: 1_700_000_000,
    data: {
      object: {
        object: "payment_intent",
        id: "pi_9",
        status: "succeeded",
        amount: 8000,
        latest_charge: "ch_9",
        metadata: {},
      },
    },
  });

  assert.equal(daSessione.payment.externalId, daIntent.payment.externalId);
});
