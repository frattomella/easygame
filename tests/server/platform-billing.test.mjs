import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il **billing di piattaforma**: Cedi Soft incassa dai club.
 *
 * Il vincolo che questi test presidiano e la **separazione dei due denari**.
 * La quota che una societa paga a Cedi Soft entra sull'account centrale di
 * Cedi Soft; la quota che una famiglia paga entra sull'account connesso del
 * club. Mescolarli vorrebbe dire che il fatturato di EasyGame compare nel
 * registro incassi di un club — un errore contabile che nessuno cercherebbe
 * li.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

let billing;
let stripeBilling;
let setPrismaClientForTests;
let fake;

before(async () => {
  billing = await import("../../src/lib/server/platform-billing.ts");
  stripeBilling = await import(
    "../../src/lib/payments/billing/stripe-billing.ts"
  );
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    club: [{ id: CLUB, name: "ASD Alfa", settings: {} }],
  });
  setPrismaClientForTests(fake.client);
});

const evento = (over = {}) => ({
  id: "evt_billing_1",
  type: "customer.subscription.updated",
  createdAt: "2026-08-26T10:00:00.000Z",
  fromConnectedAccount: false,
  /* Stripe lo mette su ogni evento. Qui e sandbox, come l'ambiente di prova. */
  liveMode: false,
  subscription: {
    customerId: "cus_1",
    subscriptionId: "sub_1",
    priceId: "price_plus_mensile",
    status: "active",
    currentPeriodEnd: "2026-09-26T10:00:00.000Z",
    cancelAtPeriodEnd: false,
    organizationId: CLUB,
  },
  ...over,
});

/* ------------------------------------------------- la traduzione di stato */

test("gli stati di Stripe si traducono nel vocabolario di EasyGame", () => {
  const attesi = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    unpaid: "past_due",
    canceled: "cancelled",
    incomplete_expired: "expired",
  };

  for (const [da, a] of Object.entries(attesi)) {
    assert.equal(stripeBilling.translateSubscriptionStatus(da), a, da);
  }
});

test("«incomplete» non e «attivo»", () => {
  /*
    E una sottoscrizione il cui primo pagamento non e ancora andato a buon
    fine. Trattarla come attiva concederebbe il piano superiore a chi non ha
    pagato — il difetto che ADR-0048 ha chiuso dall'altro lato.
  */
  assert.equal(
    stripeBilling.translateSubscriptionStatus("incomplete"),
    "not_active",
  );
});

test("uno stato che Stripe introducesse domani non concede niente", () => {
  assert.equal(
    stripeBilling.translateSubscriptionStatus("qualcosa_di_nuovo"),
    "not_active",
  );
});

/* ------------------------------------------------------- il piano segue */

test("un abbonamento attivo porta il club al piano Plus", async () => {
  await billing.handlePlatformBillingEvent(evento());

  const conto = fake.rows("platformBillingAccount")[0];
  assert.equal(conto.plan, "plus");
  assert.equal(conto.status, "active");
  assert.equal(conto.external_subscription_id, "sub_1");
});

test("una prova in corso da comunque diritto al piano", async () => {
  await billing.handlePlatformBillingEvent(
    evento({
      subscription: { ...evento().subscription, status: "trialing" },
    }),
  );

  assert.equal(fake.rows("platformBillingAccount")[0].plan, "plus");
});

test("un addebito fallito non spegne subito una segreteria", async () => {
  /*
    Sospendere al primo addebito fallito significherebbe fermare una societa
    per una carta scaduta. La sospensione resta una decisione che si prende in
    Platform Admin.
  */
  await billing.handlePlatformBillingEvent(
    evento({
      subscription: { ...evento().subscription, status: "past_due" },
    }),
  );

  const conto = fake.rows("platformBillingAccount")[0];
  assert.equal(conto.status, "past_due");
  assert.equal(conto.plan, "plus");
});

test("una disdetta riporta al piano base", async () => {
  await billing.handlePlatformBillingEvent(
    evento({
      subscription: { ...evento().subscription, status: "cancelled" },
    }),
  );

  assert.equal(fake.rows("platformBillingAccount")[0].plan, "free");
});

/* -------------------------------------------------- i due flussi separati */

test("un abbonamento non tocca il registro incassi di nessun club", async () => {
  await billing.handlePlatformBillingEvent(evento());

  assert.equal(
    fake.rows("paymentTransaction").length,
    0,
    "il fatturato di EasyGame non e un incasso di un club",
  );
});

test("un evento di un account connesso non si elabora come abbonamento", async () => {
  const esito = await billing.handlePlatformBillingEvent(
    evento({ fromConnectedAccount: true }),
  );

  assert.equal(esito.status, "ignored");
  assert.match(esito.message, /quale segreto e configurato su quale endpoint/i);
  assert.equal(fake.rows("platformBillingAccount").length, 0);
});

test("l'evento del billing si registra con il proprio flusso", async () => {
  await billing.handlePlatformBillingEvent(evento());

  const registrato = fake.rows("paymentWebhookEvent")[0];
  assert.equal(registrato.flow, "platform");
  assert.equal(registrato.provider, "stripe");
});

/* --------------------------------------------------------- idempotenza */

test("lo stesso evento consegnato due volte non fa niente due volte", async () => {
  await billing.handlePlatformBillingEvent(evento());
  const secondo = await billing.handlePlatformBillingEvent(evento());

  assert.equal(secondo.duplicate, true);
  assert.equal(fake.rows("paymentWebhookEvent").length, 1);
});

test("un evento senza societa riconoscibile viene ignorato", async () => {
  const esito = await billing.handlePlatformBillingEvent(
    evento({
      subscription: { ...evento().subscription, organizationId: null },
    }),
  );

  assert.equal(esito.status, "ignored");
  assert.equal(fake.rows("platformBillingAccount").length, 0);
});

/* ------------------------------------------------- gli eventi ascoltati */

test("si sottoscrivono solo gli eventi che cambiano un abbonamento", () => {
  assert.deepEqual(
    [...stripeBilling.PLATFORM_BILLING_EVENT_TYPES],
    [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_failed",
    ],
    "sottoscrivere `invoice.*` per intero nasconderebbe gli eventi che contano",
  );
});

/* --------------------------------------------------------- la lettura */

test("un club senza abbonamento si legge senza scrivere una riga", async () => {
  const conto = await billing.getPlatformBillingAccount(CLUB);

  assert.equal(conto.plan, "free");
  assert.equal(conto.status, "not_active");
  assert.equal(
    fake.rows("platformBillingAccount").length,
    0,
    "una lettura che scrive lascia una riga per ogni club mai visitato",
  );
});
