import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il risolutore dei segnaposto (W1-G, PP-5).
 *
 * **Il difetto che chiude.** Il catalogo dei segnaposto esisteva, la
 * generazione esisteva, e in mezzo non c'era niente: `renderBlankTemplateForPdf`
 * svuota **ogni** segnaposto, anche con un atleta selezionato. EasyGame
 * stampava il modulo vuoto avendo il dato in mano.
 *
 * Sei cose vanno dimostrate, non affermate:
 *
 * 1. **i dati entrano davvero**: nome, club e stagione finiscono nel foglio;
 * 2. **`{{payment.total_paid}}` e la cassa**, non il dovuto di una rata
 *    marcata pagata (ADR-0068). Una rata da 130 con 80 incassati vale 80: e la
 *    ragione per cui questo foglio si puo firmare;
 * 3. **il documento non inventa**: un segnaposto sconosciuto resta bianco ed e
 *    elencato, un dato che manca resta bianco ed e elencato. Mai «undefined»;
 * 4. **niente HTML iniettabile**: un cognome che contiene `<script>` e un
 *    cognome, non codice;
 * 5. **la firma mancante non blocca**: il documento esce e lo dichiara
 *    (§5.5.25);
 * 6. **il confine multi-tenant**: l'atleta di un'altra societa risponde
 *    «Accesso negato», e il messaggio dell'ORM non esce mai.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ATLETA_A = "11111111-0000-4000-8000-00000000000a";
const ATLETA_B = "22222222-0000-4000-8000-00000000000b";
const ATT_FIRMA = "33333333-0000-4000-8000-00000000000c";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_A],
});

let service;
let setPrismaClientForTests;
let fake;

const STAGIONE = {
  id: "s-2025",
  label: "2025/2026",
  startDate: "2025-09-01",
  endDate: "2026-06-30",
  status: "active",
  createdAt: "2025-08-01T00:00:00.000Z",
};

const club = (id, name, overrides = {}) => ({
  id,
  slug: `slug-${id}`,
  name,
  business_name: `${name} ASD`,
  address: "Via dello Sport 10",
  city: "Roma",
  postal_code: "00100",
  province: "RM",
  fiscal_code: "12345678901",
  vat_number: "IT12345678901",
  contact_email: "info@example.com",
  contact_phone: "+39 06 1234567",
  logo_url: null,
  payment_plans: [],
  document_templates: [],
  settings: { seasons: [STAGIONE], activeSeasonId: STAGIONE.id },
  ...overrides,
});

const atleta = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  first_name: "Mario",
  last_name: "Rossi",
  birth_date: new Date("2012-04-17T00:00:00Z"),
  status: "active",
  category_name: "Pulcini",
  jersey_number: "7",
  data: {
    fiscalCode: "RSSMRA12D17H501X",
    address: "Via Roma 1",
    email: "famiglia@example.com",
    phone: "+39 333 1112223",
    guardians: [
      {
        name: "Anna",
        surname: "Rossi",
        email: "anna@example.com",
        phone: "+39 333 4445556",
        fiscalCode: "RSSNNA80A41H501Z",
        address: "Via Roma 1",
        city: "Roma",
        postalCode: "00100",
        province: "RM",
      },
    ],
  },
  ...overrides,
});

/** Una rata da 130 euro, dentro la stagione. */
const rata = (id, organizationId, athleteId, amount = 130) => ({
  id,
  organization_id: organizationId,
  athlete_id: athleteId,
  description: "Quota annuale - Rata 1",
  amount,
  due_date: new Date("2025-10-31T00:00:00Z"),
  paid_at: null,
  status: "pending",
  method: null,
  data: { installmentId: `${id}-plan`, installmentLabel: "Rata 1" },
});

/** Un incasso: e questo che fa muovere `{{payment.total_paid}}`. */
const incasso = (id, organizationId, athleteId, paymentId, amount) => ({
  id,
  organization_id: organizationId,
  athlete_id: athleteId,
  payment_id: paymentId,
  amount,
  paid_at: new Date("2025-10-05T00:00:00Z"),
  payment_method: "cash",
  source: "manual",
  reversed_at: null,
  reverses_transaction_id: null,
  data: {},
});

const allenamento = (id, organizationId, date, start, end) => ({
  id: `row-${id}`,
  organization_id: organizationId,
  resource_type: "trainings",
  payload: { id, date, startTime: start, endTime: end },
  date,
});

const presenza = (trainingId, organizationId, athleteId = ATLETA_A) => ({
  id: `att-${trainingId}`,
  organization_id: organizationId,
  training_id: trainingId,
  athlete_id: athleteId,
  status: "present",
});

const seed = () => ({
  club: [club(CLUB_A, "EasyGame FC"), club(CLUB_B, "Altro Club")],
  athlete: [atleta(ATLETA_A, CLUB_A), atleta(ATLETA_B, CLUB_B)],
  athletePayment: [rata("rata-1", CLUB_A, ATLETA_A)],
  paymentTransaction: [
    incasso("inc-1", CLUB_A, ATLETA_A, "rata-1", 80),
  ],
  clubResourceItem: [
    allenamento("t1", CLUB_A, "2025-10-01", "18:00", "19:30"),
    allenamento("t2", CLUB_A, "2025-10-08", "18:00", "19:30"),
  ],
  trainingAttendance: [presenza("t1", CLUB_A), presenza("t2", CLUB_A)],
  athleteCategoryMembership: [],
  attachment: [],
  attachmentBlob: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/document-placeholders.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const genera = (content, overrides = {}) =>
  service.resolveDocumentPlaceholders({
    template: { id: "modello-1", title: "Attestazione", content },
    organizationId: CLUB_A,
    athleteId: ATLETA_A,
    scope: scopeA(),
    now: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  });

/* ------------------------------------------------------- i dati entrano */

test("nome, club e stagione finiscono davvero nel foglio", async () => {
  const esito = await genera(
    "<p>{{athlete.first_name}} {{athlete.last_name}} — {{club.name}} — {{season.year}}</p>",
  );

  assert.match(esito.html, /Mario Rossi/);
  assert.match(esito.html, /EasyGame FC ASD/);
  assert.match(esito.html, /2025\/2026/);
  assert.equal(esito.values["athlete.first_name"], "Mario");
  assert.equal(esito.values["season.year"], "2025/2026");
  assert.deepEqual(esito.unresolved, []);
});

test("la data di nascita esce in italiano, non in ISO", async () => {
  const esito = await genera("<p>{{athlete.birth_date}}</p>");
  assert.equal(esito.values["athlete.birth_date"], "17/04/2012");
});

test("l'intestatario fiscale e il genitore, non il bambino", async () => {
  const esito = await genera(
    "<p>{{fiscal_recipient.name}} — {{fiscal_recipient.fiscal_code}}</p>",
  );

  assert.equal(esito.values["fiscal_recipient.name"], "Anna Rossi");
  assert.equal(
    esito.values["fiscal_recipient.fiscal_code"],
    "RSSNNA80A41H501Z",
  );
});

/* --------------------------------------------------- gli importi: cassa */

test("il totale pagato e il denaro incassato, non il dovuto della rata", async () => {
  const esito = await genera(
    "<p>{{payment.total_due}} | {{payment.total_paid}} | {{payment.remaining}}</p>",
  );

  assert.equal(esito.values["payment.total_due"], "130,00");
  assert.equal(
    esito.values["payment.total_paid"],
    "80,00",
    "in cassa ci sono 80, non i 130 dovuti",
  );
  assert.equal(esito.values["payment.remaining"], "50,00");
});

test("una rata senza incassi non attesta nessun versamento", async () => {
  fake.rows("paymentTransaction").length = 0;

  const esito = await genera("<p>{{payment.total_paid}}</p>");
  assert.equal(esito.values["payment.total_paid"], "0,00");
});

test("una rata marcata pagata a fronte di 80 incassati ne attesta 80", async () => {
  const riga = fake.rows("athletePayment")[0];
  riga.status = "paid";
  riga.paid_at = new Date("2025-10-05T00:00:00Z");

  const esito = await genera("<p>{{payment.total_paid}}</p>");
  assert.equal(
    esito.values["payment.total_paid"],
    "80,00",
    "lo stato della rata non e denaro: lo e il registro incassi (ADR-0068)",
  );
});

test("lo storno di un incasso torna indietro anche nell'attestazione", async () => {
  fake.rows("paymentTransaction").push({
    ...incasso("inc-storno", CLUB_A, ATLETA_A, "rata-1", -80),
    reverses_transaction_id: "inc-1",
  });
  fake.rows("paymentTransaction")[0].reversed_at = new Date(
    "2025-11-01T00:00:00Z",
  );

  const esito = await genera("<p>{{payment.total_paid}}</p>");
  assert.equal(esito.values["payment.total_paid"], "0,00");
});

test("le rate di un'altra stagione non entrano nel periodo attestato", async () => {
  fake.rows("athletePayment").push({
    ...rata("rata-vecchia", CLUB_A, ATLETA_A, 200),
    due_date: new Date("2024-10-31T00:00:00Z"),
  });

  const esito = await genera("<p>{{payment.total_due}}</p>");
  assert.equal(esito.values["payment.total_due"], "130,00");
});

/* ------------------------------------------------------- la frequenza */

test("la frequenza arriva dal dominio contributi, non da un secondo conteggio", async () => {
  const esito = await genera(
    "<p>{{attendance.sessions}} sedute, {{attendance.hours}} ore</p>",
  );

  assert.equal(esito.values["attendance.sessions"], "2");
  assert.equal(esito.values["attendance.hours"], "3,00");
  assert.match(esito.html, /2 sedute, 3,00 ore/);
});

test("un allenamento senza appello non diventa una presenza", async () => {
  fake.rows("clubResourceItem").push(
    allenamento("t3", CLUB_A, "2025-10-15", "18:00", "19:30"),
  );

  const esito = await genera("<p>{{attendance.sessions}}</p>");
  assert.equal(esito.values["attendance.sessions"], "2");
});

/* ------------------------------------------- il documento non inventa */

test("un segnaposto sconosciuto resta vuoto ed e elencato", async () => {
  const esito = await genera(
    "<p>{{pippo.pluto}} e {{sponsor.name}} e {{athlete.first_name}}</p>",
  );

  assert.deepEqual(esito.unresolved, ["pippo.pluto", "sponsor.name"]);
  assert.match(esito.html, /<span class="blank-field"><\/span>/);
  assert.doesNotMatch(esito.html, /undefined/);
  assert.doesNotMatch(esito.html, /pippo\.pluto/);
});

test("un dato mancante resta vuoto, e elencato, e non produce «undefined»", async () => {
  const record = fake.rows("athlete").find((row) => row.id === ATLETA_A);
  record.data = { ...record.data, fiscalCode: "" };

  const esito = await genera(
    "<p>CF: {{athlete.fiscal_code}} — {{athlete.first_name}}</p>",
  );

  assert.deepEqual(esito.missing, ["athlete.fiscal_code"]);
  assert.deepEqual(esito.unresolved, []);
  assert.equal(esito.values["athlete.fiscal_code"], "");
  assert.doesNotMatch(esito.html, /undefined/);
  assert.match(esito.html, /CF: <span class="blank-field"><\/span>/);
});

test("i segnaposto che il modello non usa non finiscono negli elenchi", async () => {
  const esito = await genera("<p>{{athlete.first_name}}</p>");

  assert.deepEqual(esito.missing, []);
  assert.deepEqual(esito.unresolved, []);
});

/* -------------------------------------------------------- l'iniezione */

test("un valore che contiene HTML viene neutralizzato", async () => {
  const record = fake.rows("athlete").find((row) => row.id === ATLETA_A);
  record.last_name = "<script>alert('x')</script>";

  const esito = await genera("<p>{{athlete.last_name}}</p>");

  assert.doesNotMatch(esito.html, /<script>/);
  assert.match(esito.html, /&lt;script&gt;/);
});

test("il chip dell'editor visuale viene sostituito, etichetta compresa", async () => {
  const esito = await genera(
    '<p><span data-template-placeholder="{{athlete.first_name}}" class="chip">Nome atleta</span></p>',
  );

  assert.match(esito.html, /<p>Mario<\/p>/);
  assert.doesNotMatch(esito.html, /Nome atleta/);
});

/* ---------------------------------------------------- firma e timbro */

test("senza firma caricata il documento si genera lo stesso e lo dichiara", async () => {
  const esito = await genera(
    "<p>{{signature.club_representative}}{{stamp.club}}</p>",
  );

  assert.ok(esito.html.length > 0);
  assert.equal(esito.warnings.length, 2);
  assert.match(esito.warnings.join(" "), /firma del presidente/i);
  assert.match(esito.warnings.join(" "), /timbro/i);
  assert.match(esito.html, /Firma del presidente/);
  assert.deepEqual(
    esito.missing,
    ["signature.club_representative", "stamp.club"],
    "restano dichiarati: lo spazio c'e, l'immagine no",
  );
});

test("con la firma caricata il documento la porta come immagine incorporata", async () => {
  const record = fake.rows("club").find((row) => row.id === CLUB_A);
  record.settings = {
    ...record.settings,
    presidentSignature: `attachment:${ATT_FIRMA}`,
  };
  fake.rows("attachment").push({
    id: ATT_FIRMA,
    organization_id: CLUB_A,
    owner_type: "club",
    owner_id: CLUB_A,
    category: "president_signature",
    file_name: "firma.png",
    mime_type: "image/png",
    size_bytes: 12,
    checksum: "checksum-firma",
    storage_driver: "database",
    storage_key: null,
    created_by: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
  });
  fake.rows("attachmentBlob").push({
    attachment_id: ATT_FIRMA,
    content: Buffer.from("firma-del-presidente"),
  });

  const esito = await genera("<p>{{signature.club_representative}}</p>");

  assert.match(esito.html, /<img src="data:image\/png;base64,/);
  assert.deepEqual(esito.warnings, []);
});

/* -------------------------------------------------------- multi-tenant */

test("un atleta di un altro club non produce nessun documento", async () => {
  await assert.rejects(
    genera("<p>{{athlete.first_name}}</p>", { athleteId: ATLETA_B }),
    (error) => {
      assert.match(String(error.message), /Accesso negato/);
      return true;
    },
  );
});

test("un club fuori dallo scope non produce nessun documento", async () => {
  await assert.rejects(
    genera("<p>{{athlete.first_name}}</p>", {
      organizationId: CLUB_B,
      athleteId: ATLETA_B,
    }),
    (error) => {
      assert.match(String(error.message), /Accesso negato/);
      return true;
    },
  );
});

test("un identificativo inesistente non racconta lo schema del database", async () => {
  await assert.rejects(
    genera("<p>{{athlete.first_name}}</p>", { athleteId: "non-esiste" }),
    (error) => {
      const message = String(error.message);
      assert.match(message, /Accesso negato/);
      assert.doesNotMatch(message, /prisma|Invalid|Argument/i);
      return true;
    },
  );
});

/* --------------------------------------------------- il modello vero */

test("il modello dell'attestazione non contiene segnaposto orfani", async () => {
  const { buildAttestationTemplate } = await import(
    "../../src/lib/documents/attestation-template.ts"
  );
  const modello = buildAttestationTemplate("2026-01-01T00:00:00.000Z");

  const esito = await service.resolveDocumentPlaceholders({
    template: modello,
    organizationId: CLUB_A,
    athleteId: ATLETA_A,
    scope: scopeA(),
    now: new Date("2026-01-15T10:00:00Z"),
  });

  assert.deepEqual(
    esito.unresolved,
    [],
    "il modello che EasyGame semina deve saper riempire ogni suo campo",
  );
  // Firma e timbro: il club del test non li ha caricati, e va detto.
  assert.deepEqual(esito.missing, ["signature.club_representative", "stamp.club"]);
  assert.match(esito.html, /Mario Rossi/);
  assert.match(esito.html, /80,00 euro/);
  assert.match(esito.html, /<strong>2<\/strong> sedute di allenamento/);
  assert.match(esito.html, /<strong>3,00<\/strong> ore/);
  assert.doesNotMatch(esito.html, /\{\{/, "nessun segnaposto sopravvive alla stampa");
});

/* ------------------------------------------- il catalogo resta uno solo */

test("ogni segnaposto che il risolutore produce e nel catalogo condiviso", () => {
  assert.deepEqual(
    service.PLACEHOLDER_KEYS_OUTSIDE_CATALOG,
    [],
    "un segnaposto risolvibile che l'editor non propone e un dato che nessuno puo chiedere",
  );
});
