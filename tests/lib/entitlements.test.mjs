import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Chi puo usare cosa.
 *
 * Il valore di questo modulo non e il calcolo — e semplice — ma il fatto che
 * il calcolo stia in **un posto solo**. Cio che i test presidiano e allora
 * duplice: che le regole siano quelle giuste, e che la risposta sia sempre
 * **motivata**, perche una funzione spenta senza motivo costringe ogni
 * schermata a reinventarsi la spiegazione, ed e cosi che nascono dieci
 * spiegazioni diverse della stessa cosa.
 */

let entitlements;

before(async () => {
  entitlements = await import("../../src/lib/entitlements/index.ts");
});

const resolve = (input = {}) =>
  entitlements.resolveEntitlements({
    plan: "free",
    subscriptionStatus: "active",
    ...input,
  });

/* ---------------------------------------------------------- il catalogo */

test("ogni funzione del catalogo ha un'etichetta e un'area", () => {
  for (const key of entitlements.ENTITLEMENT_KEYS) {
    const definizione = entitlements.ENTITLEMENTS[key];
    assert.ok(definizione.label, `${key} senza etichetta`);
    assert.ok(definizione.description, `${key} senza descrizione`);
    assert.ok(definizione.area, `${key} senza area`);
  }
});

test("le funzioni gia in uso restano nel piano di base", () => {
  const base = resolve({ plan: "free" });

  for (const key of ["multi_site", "forms_v2", "funding_programs", "document_scanner"]) {
    assert.equal(
      base.has(key),
      true,
      `${key} e in uso presso club veri: metterla dietro un piano sarebbe toglierla`,
    );
  }
});

test("il catalogo non conosce i prezzi", () => {
  for (const key of entitlements.ENTITLEMENT_KEYS) {
    assert.equal(
      "priceCents" in entitlements.ENTITLEMENTS[key],
      false,
      "il prezzo e fatturazione, questo e autorizzazione: cambiano per ragioni diverse",
    );
  }
});

/* -------------------------------------------------------------- i piani */

test("una funzione del piano Plus non c'e nel piano base", () => {
  const esito = resolve({ plan: "free" }).explain("online_payments");

  assert.equal(esito.allowed, false);
  assert.equal(esito.reason, "requires_plan");
  assert.match(esito.message, /Plus/);
});

test("con il piano Plus la funzione c'e", () => {
  const esito = resolve({ plan: "plus" }).explain("online_payments");

  assert.equal(esito.allowed, true);
  assert.equal(esito.reason, "included_in_plan");
});

test("un abbonamento scaduto riporta al piano di base, non spegne tutto", () => {
  const scaduto = resolve({ plan: "plus", subscriptionStatus: "expired" });

  assert.equal(scaduto.effectivePlan, "free");
  assert.equal(
    scaduto.has("forms_v2"),
    true,
    "cio che e sempre stato disponibile non si toglie con l'abbonamento",
  );
  assert.equal(scaduto.has("online_payments"), false);
  assert.equal(
    scaduto.explain("online_payments").reason,
    "subscription_inactive",
    "il problema e l'abbonamento, non il listino: la persona deve rinnovare, non comprare",
  );
});

test("un pagamento in ritardo non spegne il gestionale", () => {
  const inRitardo = resolve({ plan: "plus", subscriptionStatus: "past_due" });

  assert.equal(
    inRitardo.has("online_payments"),
    true,
    "spegnere il gestionale il giorno in cui scade una carta perde il cliente, non l'insoluto",
  );
});

/* ------------------------------------------------------ i servizi extra */

test("un servizio attivo sblocca la funzione anche nel piano base", () => {
  const esito = resolve({
    plan: "free",
    activeExtras: ["advanced_reports"],
  }).explain("advanced_reports");

  assert.equal(esito.allowed, true);
  assert.equal(esito.reason, "unlocked_by_extra");
});

test("una funzione che esiste solo come servizio lo dice", () => {
  const esito = resolve({ plan: "plus" }).explain("sms_notifications");

  assert.equal(esito.allowed, false);
  assert.equal(esito.reason, "requires_extra");
});

/* -------------------------------------------------------- le eccezioni */

test("un'eccezione della piattaforma concede anche fuori piano", () => {
  const esito = resolve({
    plan: "free",
    overrides: { online_payments: true },
  }).explain("online_payments");

  assert.equal(esito.allowed, true);
  assert.equal(esito.reason, "granted_by_platform");
});

test("un'eccezione della piattaforma revoca anche cio che il piano comprende", () => {
  const esito = resolve({
    plan: "plus",
    overrides: { online_payments: false },
  }).explain("online_payments");

  assert.equal(
    esito.allowed,
    false,
    "una revoca deve poter fermare anche cio che il listino include",
  );
  assert.equal(esito.reason, "revoked_by_platform");
});

test("un'eccezione vince anche sul platform admin", () => {
  const esito = resolve({
    plan: "plus",
    isPlatformAdmin: true,
    overrides: { online_payments: false },
  }).explain("online_payments");

  assert.equal(esito.allowed, false);
});

test("le eccezioni scritte male non concedono niente", () => {
  const ripulite = entitlements.normalizeEntitlementOverrides({
    online_payments: true,
    funzione_inventata: true,
    forms_v2: "si",
    multi_site: false,
  });

  assert.deepEqual(ripulite, { online_payments: true, multi_site: false });
});

/* ---------------------------------------------------- il platform admin */

test("chi amministra la piattaforma vede tutto", () => {
  const admin = resolve({ plan: "free", isPlatformAdmin: true });

  for (const key of entitlements.ENTITLEMENT_KEYS) {
    assert.equal(admin.has(key), true, `${key} non visibile all'amministratore`);
  }
});

test("e si vede che lo sta facendo", () => {
  const esito = resolve({ plan: "free", isPlatformAdmin: true }).explain(
    "online_payments",
  );

  assert.equal(esito.reason, "platform_admin");
  assert.match(
    esito.message,
    /potrebbe non averla/,
    "senza questo, l'assistenza crederebbe che il club abbia cio che vede",
  );
});

/* ------------------------------------------------------------ i confini */

test("una funzione inventata non concede niente, nemmeno all'amministratore", () => {
  const esito = resolve({ isPlatformAdmin: true }).explain("accesso_totale");

  assert.equal(esito.allowed, false);
  assert.equal(esito.reason, "unknown_feature");
});

test("senza nessun dato il club sta nel piano di base", () => {
  const vuoto = entitlements.resolveEntitlements();

  assert.equal(vuoto.plan, "free");
  assert.equal(vuoto.effectivePlan, "free");
  assert.equal(vuoto.has("online_payments"), false);
  assert.equal(vuoto.has("forms_v2"), true);
});

test("l'elenco completo copre ogni funzione del catalogo", () => {
  const tutte = resolve().all();

  assert.equal(tutte.length, entitlements.ENTITLEMENT_KEYS.length);
  for (const verdetto of tutte) {
    assert.ok(verdetto.message, `${verdetto.key} senza messaggio`);
  }
});
