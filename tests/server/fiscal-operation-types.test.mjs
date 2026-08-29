import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le **causali** e la loro classificazione (Wave 4, lane W4-A).
 *
 * Il documento 30 chiama i due flag nuovi «il perno», e la disciplina che
 * questo file difende e una sola, scritta nel modulo delle causali dal Blocco
 * D:
 *
 * > Un valore non dichiarato e visibilmente da compilare; un valore sbagliato
 * > sembra compilato.
 *
 * Da qui le quattro cose da dimostrare:
 *
 * 1. **i due flag nascono `null`**, non `false`, e **nessuna** delle sette voci
 *    `unspecified` del seme nasce classificata;
 * 2. **una classificazione ha un autore e una data**, perche e una decisione;
 * 3. **una voce di sistema non si cancella**: si disattiva. E una voce gia
 *    citata da un movimento nemmeno;
 * 4. **il confine multi-tenant tiene**: la causale di un altro club non si
 *    legge e non si modifica.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const AUTORE = "cccccccc-0000-4000-8000-00000000000f";

let service;
let seeds;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/fiscal-config.ts");
  ({ OPERATION_TYPE_SEEDS: seeds } = await import(
    "../../src/lib/fiscal/operation-types.ts"
  ));
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    fiscalOperationType: [],
    accountingEntry: [],
    paymentTransaction: [],
  });
  setPrismaClientForTests(fake.client);
});

const rejects = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.match(String(error.message), pattern);
    return true;
  });

const trova = (elenco, code) => elenco.find((voce) => voce.code === code);

const rigaDi = (code, organizationId = CLUB_A) =>
  fake
    .rows("fiscalOperationType")
    .find((row) => row.code === code && row.organization_id === organizationId);

// --- il seme ----------------------------------------------------------------

test("il catalogo si semina al primo accesso, e una volta sola", async () => {
  const primo = await service.listOperationTypes(CLUB_A);
  assert.equal(primo.length, seeds.length);

  const secondo = await service.listOperationTypes(CLUB_A);
  assert.equal(secondo.length, seeds.length);
  assert.equal(fake.rows("fiscalOperationType").length, seeds.length);
});

test("i due flag nascono null, mai false", async () => {
  const elenco = await service.listOperationTypes(CLUB_A);

  for (const voce of elenco) {
    assert.equal(
      voce.deductible,
      null,
      `${voce.code}: la detraibilita non e stata dichiarata da nessuno`,
    );
    assert.equal(
      voce.isMembershipFee,
      null,
      `${voce.code}: la natura di quota associativa non e stata dichiarata`,
    );
  }
});

test("nessuna voce del seme nasce con un autore della classificazione", async () => {
  const elenco = await service.listOperationTypes(CLUB_A);

  for (const voce of elenco) {
    assert.equal(voce.classifiedBy, null);
    assert.equal(voce.classifiedAt, null);
  }
});

test("le sette voci non classificate restano non classificate", async () => {
  const elenco = await service.listOperationTypes(CLUB_A);

  const nonClassificate = elenco.filter(
    (voce) => voce.activityScope === "unspecified",
  );
  assert.equal(nonClassificate.length, 7);

  // Le due sole classificate lo sono per una ragione scritta nel seme.
  assert.equal(trova(elenco, "vendita_abbigliamento").activityScope, "commercial");
  assert.equal(trova(elenco, "sponsorizzazione").activityScope, "commercial");
});

test("il seme suggerisce un verso, e non lo impone su «altra operazione»", async () => {
  const elenco = await service.listOperationTypes(CLUB_A);

  assert.equal(trova(elenco, "quota_associativa").directionHint, "IN");
  assert.equal(trova(elenco, "altra_operazione").directionHint, null);
});

// --- la classificazione ha un autore ----------------------------------------

test("dichiarare l'ambito registra chi lo ha dichiarato, e quando", async () => {
  await service.listOperationTypes(CLUB_A);

  const prima = new Date();
  const voce = await service.saveOperationType({
    organizationId: CLUB_A,
    code: "quota_associativa",
    updates: { activityScope: "institutional" },
    actorUserId: AUTORE,
  });

  assert.equal(voce.activityScope, "institutional");
  assert.equal(voce.classifiedBy, AUTORE);
  assert.ok(voce.classifiedAt);
  assert.ok(new Date(voce.classifiedAt).getTime() >= prima.getTime() - 1_000);
});

test("dichiarare la detraibilita o la quota associativa registra l'autore", async () => {
  await service.listOperationTypes(CLUB_A);

  const detraibile = await service.saveOperationType({
    organizationId: CLUB_A,
    code: "quota_attivita",
    updates: { deductible: true },
    actorUserId: AUTORE,
  });
  assert.equal(detraibile.deductible, true);
  assert.equal(detraibile.classifiedBy, AUTORE);

  const quota = await service.saveOperationType({
    organizationId: CLUB_A,
    code: "quota_iscrizione",
    updates: { isMembershipFee: false },
    actorUserId: AUTORE,
  });
  /*
    `false` **dichiarato** e una risposta, e vale quanto un si: ha un autore e
    una data. E `null` che non e una risposta.
  */
  assert.equal(quota.isMembershipFee, false);
  assert.equal(quota.classifiedBy, AUTORE);
  assert.ok(quota.classifiedAt);
});

test("una modifica che non tocca la classificazione non riscrive l'autore", async () => {
  await service.listOperationTypes(CLUB_A);
  await service.saveOperationType({
    organizationId: CLUB_A,
    code: "corso_servizio",
    updates: { activityScope: "commercial" },
    actorUserId: AUTORE,
  });

  const primaData = rigaDi("corso_servizio").classified_at;

  const dopo = await service.saveOperationType({
    organizationId: CLUB_A,
    code: "corso_servizio",
    updates: { label: "Corsi e stage" },
    actorUserId: "un-altro-utente",
  });

  assert.equal(dopo.label, "Corsi e stage");
  assert.equal(dopo.classifiedBy, AUTORE);
  assert.equal(rigaDi("corso_servizio").classified_at, primaData);
});

test("ritirare ogni dichiarazione cancella anche la firma", async () => {
  await service.listOperationTypes(CLUB_A);
  await service.saveOperationType({
    organizationId: CLUB_A,
    code: "tesseramento",
    updates: { activityScope: "institutional", deductible: true },
    actorUserId: AUTORE,
  });

  const ritirata = await service.saveOperationType({
    organizationId: CLUB_A,
    code: "tesseramento",
    updates: { activityScope: "unspecified", deductible: null },
    actorUserId: AUTORE,
  });

  assert.equal(ritirata.activityScope, "unspecified");
  assert.equal(ritirata.deductible, null);
  assert.equal(ritirata.classifiedBy, null);
  assert.equal(ritirata.classifiedAt, null);
});

// --- l'aggiornamento parziale non distrugge -------------------------------

test("aggiornare l'etichetta non azzera aliquota, ambito e verso", async () => {
  await service.listOperationTypes(CLUB_A);
  await service.saveOperationType({
    organizationId: CLUB_A,
    code: "vendita_abbigliamento",
    updates: { vatRate: 22, vatNature: null, reportingBucket: "Merchandising" },
    actorUserId: AUTORE,
  });

  const dopo = await service.saveOperationType({
    organizationId: CLUB_A,
    code: "vendita_abbigliamento",
    updates: { label: "Vendita materiale sportivo" },
    actorUserId: AUTORE,
  });

  assert.equal(dopo.label, "Vendita materiale sportivo");
  assert.equal(dopo.vatRate, 22);
  assert.equal(dopo.activityScope, "commercial");
  assert.equal(dopo.reportingBucket, "Merchandising");
  assert.equal(dopo.directionHint, "IN");
  assert.equal(dopo.documentRoute, "invoice_or_receipt");
});

test("il verso si puo togliere dichiarandolo, non dimenticandolo", async () => {
  await service.listOperationTypes(CLUB_A);

  const tolto = await service.saveOperationType({
    organizationId: CLUB_A,
    code: "quota_attivita",
    updates: { directionHint: null },
    actorUserId: AUTORE,
  });
  assert.equal(tolto.directionHint, null);
});

test("una causale nuova del club nasce senza classificazione", async () => {
  await service.listOperationTypes(CLUB_A);

  const nuova = await service.saveOperationType({
    organizationId: CLUB_A,
    code: "affitto_palestra",
    updates: { label: "Affitto della palestra", directionHint: "OUT" },
    actorUserId: AUTORE,
  });

  assert.equal(nuova.activityScope, "unspecified");
  assert.equal(nuova.deductible, null);
  assert.equal(nuova.isMembershipFee, null);
  assert.equal(nuova.classifiedBy, null);
  assert.equal(nuova.directionHint, "OUT");
  assert.equal(nuova.isSystem, false);
});

// --- le voci di sistema non si cancellano -----------------------------------

test("una voce di sistema non si cancella", async () => {
  await service.listOperationTypes(CLUB_A);

  await rejects(
    service.deleteOperationType({
      organizationId: CLUB_A,
      code: "quota_associativa",
    }),
    /non si cancella/,
  );

  assert.ok(rigaDi("quota_associativa"));
  assert.equal(
    fake.calls.filter(
      (call) =>
        call.delegate === "fiscalOperationType" &&
        ["delete", "deleteMany"].includes(call.method),
    ).length,
    0,
  );
});

test("una voce di sistema si disattiva, e resta leggibile", async () => {
  await service.listOperationTypes(CLUB_A);

  const spenta = await service.setOperationTypeActive({
    organizationId: CLUB_A,
    code: "sponsorizzazione",
    isActive: false,
  });

  assert.equal(spenta.isActive, false);
  assert.equal(spenta.label, "Sponsorizzazione e pubblicita");
  assert.ok(rigaDi("sponsorizzazione"));

  const riaccesa = await service.setOperationTypeActive({
    organizationId: CLUB_A,
    code: "sponsorizzazione",
    isActive: true,
  });
  assert.equal(riaccesa.isActive, true);
});

test("una causale del club mai usata si cancella davvero", async () => {
  await service.listOperationTypes(CLUB_A);
  await service.saveOperationType({
    organizationId: CLUB_A,
    code: "errore_di_battitura",
    updates: { label: "Erore di batitura" },
  });

  const esito = await service.deleteOperationType({
    organizationId: CLUB_A,
    code: "errore_di_battitura",
  });

  assert.equal(esito.deleted, true);
  assert.equal(rigaDi("errore_di_battitura"), undefined);
});

test("una causale gia citata da un movimento si disattiva invece di sparire", async () => {
  await service.listOperationTypes(CLUB_A);
  await service.saveOperationType({
    organizationId: CLUB_A,
    code: "affitto_palestra",
    updates: { label: "Affitto della palestra" },
  });

  fake.rows("accountingEntry").push({
    id: "movimento-1",
    organization_id: CLUB_A,
    operation_type_code: "affitto_palestra",
    direction: "OUT",
    amount_cents: 40_000,
  });

  const esito = await service.deleteOperationType({
    organizationId: CLUB_A,
    code: "affitto_palestra",
  });

  assert.equal(esito.deleted, false);
  assert.equal(esito.operationType.isActive, false);
  assert.ok(rigaDi("affitto_palestra"));
});

test("una causale citata da un incasso si disattiva invece di sparire", async () => {
  await service.listOperationTypes(CLUB_A);
  await service.saveOperationType({
    organizationId: CLUB_A,
    code: "campo_estivo",
    updates: { label: "Campo estivo" },
  });

  fake.rows("paymentTransaction").push({
    id: "incasso-1",
    organization_id: CLUB_A,
    operation_type_code: "campo_estivo",
    amount: 150,
  });

  const esito = await service.deleteOperationType({
    organizationId: CLUB_A,
    code: "campo_estivo",
  });

  assert.equal(esito.deleted, false);
  assert.ok(rigaDi("campo_estivo"));
});

test("una causale che non esiste non si cancella e non si disattiva", async () => {
  await service.listOperationTypes(CLUB_A);

  await rejects(
    service.deleteOperationType({ organizationId: CLUB_A, code: "inventata" }),
    /non trovata/,
  );
  await rejects(
    service.setOperationTypeActive({
      organizationId: CLUB_A,
      code: "inventata",
      isActive: false,
    }),
    /non trovata/,
  );
});

// --- multi-tenant -----------------------------------------------------------

test("il catalogo di un club non contiene le causali di un altro", async () => {
  await service.listOperationTypes(CLUB_A);
  await service.saveOperationType({
    organizationId: CLUB_B,
    code: "causale_segreta",
    updates: { label: "Causale del club B" },
  });

  const elencoA = await service.listOperationTypes(CLUB_A);
  assert.equal(trova(elencoA, "causale_segreta"), undefined);

  assert.equal(
    fake.lastCall("fiscalOperationType", "findMany").args.where.organization_id,
    CLUB_A,
  );
});

test("una causale si legge, si modifica e si cancella solo dentro il proprio club", async () => {
  await service.listOperationTypes(CLUB_A);
  await service.saveOperationType({
    organizationId: CLUB_B,
    code: "causale_segreta",
    updates: { label: "Causale del club B", activityScope: "commercial" },
    actorUserId: "utente-b",
  });

  assert.equal(
    await service.getOperationType({
      organizationId: CLUB_A,
      code: "causale_segreta",
    }),
    null,
  );

  /*
    Modificare «la stessa causale» dal club sbagliato non tocca quella
    dell'altro: ne nasce una nuova nel proprio catalogo. La chiave e
    `(organization_id, code)`, e il codice da solo non individua niente.
  */
  await service.saveOperationType({
    organizationId: CLUB_A,
    code: "causale_segreta",
    updates: { label: "Tentativo" },
    actorUserId: AUTORE,
  });

  assert.equal(rigaDi("causale_segreta", CLUB_B).label, "Causale del club B");
  assert.equal(rigaDi("causale_segreta", CLUB_B).activity_scope, "commercial");
  assert.equal(rigaDi("causale_segreta", CLUB_A).label, "Tentativo");

  const esito = await service.deleteOperationType({
    organizationId: CLUB_A,
    code: "causale_segreta",
  });
  assert.equal(esito.deleted, true);
  assert.ok(rigaDi("causale_segreta", CLUB_B));
});

test("nessuna operazione sulle causali passa senza un club", async () => {
  await rejects(
    service.listOperationTypes(""),
    /Accesso negato/,
  );
  await rejects(
    service.saveOperationType({ organizationId: "", code: "x", updates: {} }),
    /Accesso negato/,
  );
  await rejects(
    service.deleteOperationType({ organizationId: "", code: "x" }),
    /Accesso negato/,
  );
  await rejects(
    service.setOperationTypeActive({
      organizationId: "",
      code: "x",
      isActive: false,
    }),
    /Accesso negato/,
  );
});
