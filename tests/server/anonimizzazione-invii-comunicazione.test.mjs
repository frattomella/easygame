import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **L'invio che restava con l'indirizzo di chi non c'e piu** (ADR-0019, §13).
 *
 * Il dominio della cancellazione dell'interessato dichiarava le consegne come
 * `anonymize` e le anonimizzava a meta: toglieva nome, indirizzo e account, e
 * lasciava in chiaro **`recipient_key`** — che porta l'email normalizzata, non
 * un identificativo interno — e **`subject`**, che e testo composto da un
 * modello e puo nominare chiunque. Dopo la cancellazione l'indirizzo della
 * famiglia era ancora leggibile in archivio, su una riga che nessuno guardava
 * piu.
 *
 * Questi test presidiano le due meta della regola, che sono una sola cosa:
 * il **destinatario** se ne va, il **fatto** resta. Una consegna e anche la
 * prova che una comunicazione dovuta e partita, e quando.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const MINORE = "bbbbbbbb-0000-4000-8000-000000000001";
const FRATELLO = "bbbbbbbb-0000-4000-8000-000000000002";
const ESTRANEO = "bbbbbbbb-0000-4000-8000-000000000003";
const ADESSO = new Date("2026-09-01T10:00:00Z");
const PARTITA_IL = new Date("2026-03-14T08:30:00Z");

const ETICHETTA = "[dato cancellato]";

let registro;
let dominio;
let setPrismaClientForTests;
let fake;

const consegna = (overrides = {}) => ({
  organization_id: CLUB,
  source_kind: "bulk",
  source_id: "com-1",
  dedup_key: "bulk:com-1",
  channel: "email",
  recipient_key: "maria@example.com",
  recipient_user_id: "dddddddd-0000-4000-8000-00000000000f",
  recipient_name: "Maria Bianchi",
  recipient_email: "maria@example.com",
  athlete_ids: [MINORE],
  status: "sent",
  reason: null,
  subject: "Convocazione di Luca Rossi",
  read_at: null,
  created_at: PARTITA_IL,
  updated_at: PARTITA_IL,
  ...overrides,
});

const seed = () => ({
  club: [{ id: CLUB, name: "ASD Alfa" }],
  athlete: [
    {
      id: MINORE,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Rossi",
      birth_date: new Date("2015-04-02T00:00:00Z"),
      status: "active",
      data: {},
    },
  ],
  communicationDelivery: [
    consegna({ id: "del-sola" }),
    /* Un'altra famiglia, stessa occorrenza: non deve essere toccata. */
    consegna({
      id: "del-altrui",
      recipient_key: "anna@example.com",
      recipient_email: "anna@example.com",
      recipient_name: "Anna Neri",
      athlete_ids: [ESTRANEO],
    }),
  ],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  registro = await import("../../src/lib/server/communication-deliveries.ts");
  dominio = await import("../../src/lib/server/data-subject.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const righe = () => fake.rows("communicationDelivery");
const per = (id) => righe().find((row) => row.id === id);

const anonimizza = (overrides = {}) =>
  registro.anonymizeDeliveriesForSubject({
    organizationId: CLUB,
    athleteId: MINORE,
    label: ETICHETTA,
    ...overrides,
  });

/* ------------------------------------------------ il destinatario se ne va */

test("l'indirizzo non resta da nessuna parte, nemmeno nella chiave", async () => {
  const rapporto = await anonimizza();

  assert.equal(rapporto.anonymized, 1);

  const riga = per("del-sola");
  assert.equal(riga.recipient_email, null);
  assert.equal(riga.recipient_user_id, null);
  assert.equal(riga.recipient_name, ETICHETTA);

  /*
    La colonna che l'anonimizzazione scritta dentro `data-subject.ts` non
    toccava: `recipient_key` **e** l'indirizzo, normalizzato in minuscolo.
  */
  assert.equal(
    riga.recipient_key.includes("@"),
    false,
    "recipient_key porta l'email: non puo restare in archivio",
  );
  assert.equal(
    riga.recipient_key,
    `${registro.ANONYMOUS_RECIPIENT_PREFIX}del-sola`,
    "lo pseudonimo e per riga, e riconoscibile",
  );

  const serializzata = JSON.stringify(righe().filter((row) => row.id === "del-sola"));
  assert.equal(
    serializzata.includes("maria@example.com"),
    false,
    "l'indirizzo sopravviveva in una seconda colonna",
  );
});

test("l'oggetto del messaggio e testo di un modello, e puo nominare la persona", async () => {
  await anonimizza();

  assert.equal(
    per("del-sola").subject,
    ETICHETTA,
    "«Convocazione di Luca Rossi» e il nome del minore dentro una colonna",
  );
});

/* -------------------------------------------------------- il fatto resta */

test("resta la prova che la comunicazione e partita, e con quale esito", async () => {
  await anonimizza();

  const riga = per("del-sola");
  assert.equal(riga.status, "sent");
  assert.equal(riga.source_kind, "bulk");
  assert.equal(riga.source_id, "com-1");
  assert.equal(riga.dedup_key, "bulk:com-1");
  assert.equal(riga.channel, "email");
  assert.deepEqual(riga.athlete_ids, [MINORE]);
  assert.deepEqual(riga.created_at, PARTITA_IL);
});

test("il momento non si sposta: la consegna non risulta chiusa oggi", async () => {
  await anonimizza();

  /*
    `updated_at` e `@updatedAt`: senza riscriverla con il suo stesso valore,
    Prisma la timbrerebbe con l'istante dell'anonimizzazione e la riga direbbe
    che la comunicazione si e chiusa il giorno della cancellazione. Il momento
    e meta della prova.
  */
  assert.deepEqual(per("del-sola").updated_at, PARTITA_IL);
});

/* ------------------------------------------------------ la chiave unica */

test("due destinatari della stessa occorrenza non collidono", async () => {
  /*
    Il caso della comunicazione massiva: due tutori dello stesso atleta, stessa
    `dedup_key` e stesso canale. Un'etichetta costante su `recipient_key`
    violerebbe `communication_deliveries_dedup_unique` e la cancellazione
    fallirebbe a meta, proprio nel caso piu comune.
  */
  righe().push(
    consegna({
      id: "del-secondo-tutore",
      recipient_key: "paolo@example.com",
      recipient_email: "paolo@example.com",
      recipient_name: "Paolo Rossi",
    }),
  );

  const rapporto = await anonimizza();

  assert.equal(rapporto.anonymized, 2);
  assert.notEqual(
    per("del-sola").recipient_key,
    per("del-secondo-tutore").recipient_key,
  );
});

test("ripetere l'operazione non cambia l'esito", async () => {
  await anonimizza();
  const primaVolta = { ...per("del-sola") };

  const rapporto = await anonimizza();

  assert.equal(rapporto.anonymized, 1, "la riga si ritrova ancora: athlete_ids resta");
  assert.deepEqual(per("del-sola"), primaVolta);
});

/* ---------------------------------------------------------- il perimetro */

test("le consegne di un'altra persona non si toccano", async () => {
  await anonimizza();

  const altrui = per("del-altrui");
  assert.equal(altrui.recipient_email, "anna@example.com");
  assert.equal(altrui.recipient_key, "anna@example.com");
  assert.equal(altrui.subject, "Convocazione di Luca Rossi");
});

test("una consegna di un altro club non si tocca", async () => {
  righe().push(
    consegna({ id: "del-altro-club", organization_id: ALTRO_CLUB }),
  );

  await anonimizza();

  assert.equal(per("del-altro-club").recipient_email, "maria@example.com");

  for (const chiamata of fake.calls.filter(
    (call) => call.delegate === "communicationDelivery",
  )) {
    assert.equal(
      chiamata.args?.where?.organization_id,
      CLUB,
      `${chiamata.method} tocca il registro senza perimetro di club`,
    );
  }
});

test("senza club il registro non si tocca affatto", async () => {
  await assert.rejects(
    registro.anonymizeDeliveriesForSubject({
      organizationId: "",
      athleteId: MINORE,
      label: ETICHETTA,
    }),
    /Accesso negato/,
  );

  assert.equal(per("del-sola").recipient_email, "maria@example.com");
});

test("senza persona non si riscrive niente", async () => {
  const rapporto = await anonimizza({ athleteId: "  " });

  assert.deepEqual(rapporto, { anonymized: 0, manualReview: [] });
  assert.equal(per("del-sola").recipient_email, "maria@example.com");
});

/* --------------------------------------------- la riga che nomina anche altri */

test("la consegna che riguardava anche un fratello finisce in revisione", async () => {
  righe().push(
    consegna({
      id: "del-famiglia",
      dedup_key: "bulk:com-2",
      source_id: "com-2",
      athlete_ids: [MINORE, FRATELLO],
    }),
  );

  const rapporto = await anonimizza();

  assert.equal(rapporto.anonymized, 2);
  assert.deepEqual(
    rapporto.manualReview.map((row) => row.id),
    ["del-famiglia"],
  );
  assert.match(rapporto.manualReview[0].why, /altre persone/i);

  /* Anonimizzata lo stesso: il recapito e di chi ha chiesto di sparire. */
  assert.equal(per("del-famiglia").recipient_email, null);
  assert.deepEqual(
    per("del-famiglia").athlete_ids,
    [MINORE, FRATELLO],
    "le posizioni restano: sono la cosa che la prova riguardava",
  );
});

/* ------------------------------------------------------------ il cablaggio */

test("la cancellazione dei dati della persona passa di qui", async () => {
  const inventario = await dominio.previewDataSubjectErasure(
    { userId: "u", activeOrganizationId: CLUB, allowedOrganizationIds: [CLUB], activeRole: "owner" },
    { subjectId: MINORE },
    ADESSO,
  );

  assert.equal(
    inventario.slices.find((slice) => slice.table === "communication_deliveries")
      .count,
    1,
  );

  const rapporto = await dominio.eraseDataSubject(
    { userId: "u", activeOrganizationId: CLUB, allowedOrganizationIds: [CLUB], activeRole: "owner" },
    {
      subjectId: MINORE,
      confirmationToken: inventario.confirmationToken,
      acknowledgeMinor: true,
    },
    ADESSO,
  );

  assert.equal(rapporto.anonymized.communication_deliveries, 1);

  const riga = per("del-sola");
  assert.equal(riga.recipient_email, null);
  assert.equal(riga.recipient_name, dominio.ANONYMIZED_LABEL);
  assert.equal(riga.subject, dominio.ANONYMIZED_LABEL);
  assert.equal(riga.recipient_key.includes("@"), false);
  assert.equal(riga.status, "sent", "il fatto resta anche dopo la cancellazione");
});
