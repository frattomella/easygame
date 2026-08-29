import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * I soggetti oltre l'atleta (W3-B).
 *
 * **Il debito che chiude.** `DOC-04`: l'editor proponeva ottantatre chiavi e
 * il risolutore ne sapeva produrre una cinquantina, perche staff, allenatori e
 * soci non avevano un soggetto a cui riferirsi dentro un documento intestato a
 * un atleta. Chi le usava otteneva un campo bianco — dichiarato, quindi
 * onesto, ma pur sempre una promessa non mantenuta.
 *
 * Quattro cose vanno dimostrate:
 *
 * 1. **un documento del club esiste senza nessuna persona**: prima era
 *    impossibile, perche il risolutore pretendeva un atleta;
 * 2. **una persona del club si compila davvero**, e le due famiglie di chiavi
 *    (`trainer.*` e `staff.*`) dicono la stessa cosa perche il soggetto e uno;
 * 3. **il confine regge anche qui**: una persona che non sta nelle collezioni
 *    di questo club risponde «Accesso negato»;
 * 4. **`{{recipient.name}}` funziona per tutti e quattro i soggetti**, che e la
 *    ragione per cui il catalogo lo marca `system` e non «atleta».
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A],
});

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
  fiscal_code: "12345678901",
  vat_number: "IT12345678901",
  contact_email: "info@example.com",
  contact_phone: "+39 06 1234567",
  logo_url: null,
  settings: { seasons: [STAGIONE], activeSeasonId: STAGIONE.id },
  trainers: [],
  staff_members: [],
  members: [],
  ...overrides,
});

let service;
let setPrismaClientForTests;
let fake;

before(async () => {
  service = await import("../../src/lib/server/document-placeholders.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    club: [
      club(CLUB_A, "Alfa", {
        trainers: [
          {
            id: "all-1",
            firstName: "Giulia",
            lastName: "Bianchi",
            role: "Allenatrice",
            email: "giulia@example.com",
            phone: "+39 333 0000001",
          },
        ],
        staff_members: [
          {
            id: "staff-1",
            name: "Luca Verdi",
            ruolo: "Dirigente",
            mail: "luca@example.com",
          },
        ],
        members: [
          {
            id: "socio-1",
            first_name: "Anna",
            surname: "Neri",
            email: "anna@example.com",
            telefono: "+39 333 0000002",
          },
        ],
      }),
      club(CLUB_B, "Beta", {
        trainers: [{ id: "all-b", firstName: "Marco", lastName: "Gialli" }],
      }),
    ],
  });
  setPrismaClientForTests(fake.client);
});

const risolvi = (content, subject, title = "Documento") =>
  service.resolveDocumentForSubject({
    template: { id: "t-1", title, content },
    organizationId: CLUB_A,
    subject,
    scope: scopeA(),
    now: new Date("2026-03-15T10:00:00Z"),
  });

test("un documento del club esiste senza nessuna persona", async () => {
  const esito = await risolvi(
    "<p>{{club.name}} — {{current_date}} — {{season.year}}</p>",
    { kind: "club" },
  );

  assert.match(esito.html, /Alfa ASD/);
  assert.match(esito.html, /15\/03\/2026/);
  assert.match(esito.html, /2025\/2026/);
  assert.deepEqual(esito.unresolved, []);
  assert.deepEqual(esito.missing, []);
});

test("un modello del club che nomina un atleta lascia il campo bianco e lo dichiara", async () => {
  const esito = await risolvi(
    "<p>{{club.name}} — {{athlete.first_name}}</p>",
    { kind: "club" },
  );

  // Il documento non mente: dice cosa non e riuscito a scrivere.
  assert.ok(esito.unresolved.includes("athlete.first_name"));
  assert.match(esito.html, /blank-field/);
});

test("una persona del club si compila, e trainer e staff dicono la stessa cosa", async () => {
  const esito = await risolvi(
    "<p>{{trainer.first_name}} {{trainer.last_name}} — {{trainer.role}} — {{staff.first_name}} {{staff.email}}</p>",
    { kind: "person", id: "all-1" },
  );

  assert.match(esito.html, /Giulia Bianchi/);
  assert.match(esito.html, /Allenatrice/);
  // La stessa persona, chiamata con l'altra famiglia di chiavi.
  assert.equal(esito.values["staff.first_name"], "Giulia");
  assert.equal(esito.values["staff.email"], "giulia@example.com");
  assert.deepEqual(esito.unresolved, []);
});

test("una persona scritta con un'altra grafia si legge lo stesso", async () => {
  // `staff_members` porta `name` e `ruolo`, non `firstName` e `role`: e la
  // stessa collezione, scritta da una schermata diversa in un anno diverso.
  const esito = await risolvi(
    "<p>{{staff.first_name}} {{staff.last_name}} — {{staff.role}}</p>",
    { kind: "person", id: "staff-1" },
  );

  assert.equal(esito.values["staff.first_name"], "Luca");
  assert.equal(esito.values["staff.last_name"], "Verdi");
  assert.equal(esito.values["staff.role"], "Dirigente");
});

test("un socio si compila", async () => {
  const esito = await risolvi(
    "<p>{{member.first_name}} {{member.last_name}} — {{member.phone}}</p>",
    { kind: "member", id: "socio-1" },
  );

  assert.equal(esito.values["member.first_name"], "Anna");
  assert.equal(esito.values["member.last_name"], "Neri");
  assert.equal(esito.values["member.phone"], "+39 333 0000002");
});

test("il destinatario e il soggetto, per tutti e quattro i soggetti", async () => {
  const perClub = await risolvi("<p>{{recipient.name}}</p>", { kind: "club" });
  assert.equal(perClub.values["recipient.name"], "Alfa ASD");

  const perPersona = await risolvi("<p>{{recipient.name}}</p>", {
    kind: "person",
    id: "all-1",
  });
  assert.equal(perPersona.values["recipient.name"], "Giulia Bianchi");

  const perSocio = await risolvi("<p>{{recipient.name}}</p>", {
    kind: "member",
    id: "socio-1",
  });
  assert.equal(perSocio.values["recipient.name"], "Anna Neri");
});

test("una persona di un altro club non si compila", async () => {
  await assert.rejects(
    () => risolvi("<p>{{trainer.first_name}}</p>", { kind: "person", id: "all-b" }),
    /Accesso negato/,
  );

  await assert.rejects(
    () =>
      risolvi("<p>{{member.first_name}}</p>", {
        kind: "member",
        id: "socio-inesistente",
      }),
    /Accesso negato/,
  );
});

test("un cognome con dentro un tag resta un cognome", async () => {
  fake.rows("club")[0].trainers = [
    { id: "all-x", firstName: "<script>alert(1)</script>", lastName: "Neri" },
  ];

  const esito = await risolvi("<p>{{trainer.first_name}}</p>", {
    kind: "person",
    id: "all-x",
  });

  assert.ok(!esito.html.includes("<script>"));
  assert.match(esito.html, /&lt;script&gt;/);
});

test("il risolutore dichiara cosa sa produrre per ogni soggetto", () => {
  const perSoggetto = service.RESOLVED_KEYS_BY_SUBJECT;

  // Il club c'e sempre.
  for (const soggetto of ["club", "athlete", "person", "member"]) {
    assert.ok(
      perSoggetto[soggetto].includes("club.name"),
      `${soggetto} deve saper scrivere il nome del club`,
    );
    assert.ok(perSoggetto[soggetto].includes("recipient.name"));
  }

  // E ognuno sa il suo, e non quello degli altri.
  assert.ok(perSoggetto.athlete.includes("payment.total_paid"));
  assert.ok(!perSoggetto.club.includes("payment.total_paid"));
  assert.ok(perSoggetto.person.includes("trainer.role"));
  assert.ok(!perSoggetto.athlete.includes("trainer.role"));
  assert.ok(perSoggetto.member.includes("member.first_name"));
  assert.ok(!perSoggetto.person.includes("member.first_name"));
});
