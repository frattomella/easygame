import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Integrazione Web V1: i tre domini nuovi messi in una stanza sola.
 *
 * I test dei singoli workstream provano ciascuno il proprio dominio. Questi
 * provano cio che nessuno di loro poteva provare, perche i tre rami sono
 * stati sviluppati in parallelo e non si sono mai visti:
 *
 * 1. **pagamenti e contributi non si sommano.** Sono due contabilita
 *    ([ADR-0037](../../docs/knowledge-base/18-decision-log.md)): una rata e
 *    denaro che la famiglia deve, un voucher e un credito verso un ente.
 *    Liquidare un voucher non deve saldare niente;
 * 2. **la sede non rompe cio che la ignora.** Multi-sede (ADR-0038) e
 *    arrivato dopo pagamenti e moduli: entrambi devono continuare a
 *    funzionare su un atleta che ha una sede, e su uno che non ce l'ha;
 * 3. **un modulo pubblico non sceglie il tenant.** L'organizzazione la
 *    decide lo slug, cioe il server. Se la decidesse la richiesta, un
 *    modulo pubblico sarebbe una porta su qualunque club.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ATLETA = "33333333-0000-4000-8000-00000000000c";
const PROGRAMMA = "11111111-0000-4000-8000-00000000000a";
const RATA = "44444444-0000-4000-8000-00000000000d";
const SEDE_NORD = "sede-nord";
const SEDE_SUD = "sede-sud";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = () => ({
  userId: "user-b",
  activeOrganizationId: CLUB_B,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_B],
});

let pagamenti;
let contributi;
let forms;
let compilazioni;
let sedi;
let consegne;
let setPrismaClientForTests;
let fake;

const rata = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  athlete_id: ATLETA,
  description: "Quota annuale - Rata 1",
  amount: 130,
  due_date: new Date("2026-09-30T00:00:00Z"),
  paid_at: null,
  status: "pending",
  method: null,
  reference: null,
  notes: null,
  data: { installmentId: "plan-rata-1", installmentLabel: "Rata 1" },
  created_at: new Date("2026-08-01T10:00:00Z"),
  updated_at: new Date("2026-08-01T10:00:00Z"),
  ...overrides,
});

const programma = (id, organizationId) => ({
  id,
  organization_id: organizationId,
  name: "Voucher per lo Sport 2025",
  funder_name: "Regione",
  status: "active",
  valid_from: new Date("2025-09-01T00:00:00Z"),
  valid_to: new Date("2025-11-30T00:00:00Z"),
  athlete_plafond: 500,
  period_amount: 60,
  period_frequency: "monthly",
  period_length_days: null,
  requirement_unit: "hours",
  requirement_min: 8,
  unmet_behavior: "none",
  max_periods: null,
  max_total_amount: null,
  notes: null,
  data: {},
  created_at: new Date("2025-08-01T00:00:00Z"),
  updated_at: new Date("2025-08-01T00:00:00Z"),
});

const allenamento = (id, organizationId, date) => ({
  id: `row-${id}`,
  organization_id: organizationId,
  resource_type: "trainings",
  payload: { id, date, startTime: "17:00", endTime: "19:00" },
  date,
});

const presenza = (trainingId, organizationId) => ({
  id: `att-${trainingId}`,
  organization_id: organizationId,
  training_id: trainingId,
  athlete_id: ATLETA,
  status: "present",
});

const seed = () => ({
  club: [
    {
      id: CLUB_A,
      name: "ASD Alfa",
      logo_url: null,
      contact_email: "alfa@example.it",
      creator_id: scopeA().userId,
      organization_users: [],
      club_sites: [
        { id: SEDE_NORD, name: "Palestra Nord", city: "Roma", active: true },
        { id: SEDE_SUD, name: "Palestra Sud", city: "Roma", active: true },
      ],
      category_groups: [],
    },
    {
      id: CLUB_B,
      name: "ASD Beta",
      logo_url: null,
      contact_email: null,
      creator_id: scopeB().userId,
      organization_users: [],
      club_sites: [],
      category_groups: [],
    },
  ],
  athletePayment: [rata(RATA, CLUB_A)],
  paymentTransaction: [],
  fundingProgram: [programma(PROGRAMMA, CLUB_A)],
  fundingEnrollment: [],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  clubResourceItem: [
    allenamento("s1", CLUB_A, "2025-09-02"),
    allenamento("s2", CLUB_A, "2025-09-09"),
    allenamento("s3", CLUB_A, "2025-09-16"),
    allenamento("s4", CLUB_A, "2025-09-23"),
  ],
  trainingAttendance: [
    presenza("s1", CLUB_A),
    presenza("s2", CLUB_A),
    presenza("s3", CLUB_A),
    presenza("s4", CLUB_A),
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  pagamenti = await import("../../src/lib/server/payment-transactions.ts");
  contributi = await import("../../src/lib/server/funding.ts");
  forms = await import("../../src/lib/server/forms.ts");
  compilazioni = await import("../../src/lib/server/form-submissions.ts");
  sedi = await import("../../src/lib/club-sites.ts");
  consegne = await import("../../src/lib/clothing-delivery.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/*
  Il doppio di Prisma non implementa le chiavi composte. Le poche letture che
  le usano vengono servite qui, cosi il test prova il codice vero invece di un
  percorso alternativo.
*/
const teachCompositeVersionLookup = () => {
  const delegate = fake.client.formTemplateVersion;
  const original = delegate.findUnique;
  delegate.findUnique = async (args = {}) => {
    const composite = args.where?.template_id_version;
    if (!composite) return original(args);
    return (
      fake
        .rows("formTemplateVersion")
        .find(
          (row) =>
            row.template_id === composite.template_id &&
            row.version === composite.version,
        ) || null
    );
  };
};

const rataRow = () => fake.rows("athletePayment").find((r) => r.id === RATA);

const beneficiarioConMaturato = async () => {
  const enrollment = await contributi.createFundingEnrollment(
    { programId: PROGRAMMA, athleteId: ATLETA, assignedAmount: 300 },
    scopeA(),
  );
  await contributi.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });
  return enrollment;
};

// --- 1. pagamento parziale e voucher sullo stesso atleta ---------------------

test("un incasso parziale e un voucher convivono senza sommarsi", async () => {
  await pagamenti.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 50,
      paymentMethod: "Contanti",
      paidAt: "2026-08-05T10:00:00.000Z",
    },
    scopeA(),
  );

  await beneficiarioConMaturato();

  const dopo = rataRow();

  assert.equal(
    dopo.status,
    "partially_paid",
    "50 su 130 e una rata parzialmente pagata",
  );
  assert.equal(
    dopo.data.ledger.paidAmount,
    50,
    "l'incassato e solo il denaro della famiglia",
  );
  assert.equal(
    dopo.data.ledger.residualAmount,
    80,
    "il residuo non tiene conto del voucher: sono due contabilita",
  );

  const overview = await contributi.getAthleteFundingOverview(
    ATLETA,
    scopeA(),
    CLUB_A,
  );

  assert.equal(overview.length, 1, "il contributo esiste sullo stesso atleta");
  assert.ok(
    overview[0].summary.accruedAmount > 0,
    "il maturato si calcola dalle presenze, non dagli incassi",
  );
});

test("registrare un incasso non tocca nessuna tabella dei contributi", async () => {
  await beneficiarioConMaturato();
  const maturatoPrima = fake.rows("fundingAccrual").map((r) => ({ ...r }));

  fake.reset();
  await pagamenti.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 30,
      paymentMethod: "Bonifico",
      paidAt: "2026-08-06T10:00:00.000Z",
    },
    scopeA(),
  );

  const delegateToccati = new Set(fake.calls.map((c) => c.delegate));
  for (const delegate of delegateToccati) {
    assert.equal(
      /^funding/.test(delegate),
      false,
      `registrare un incasso non deve leggere ne scrivere ${delegate}`,
    );
  }

  assert.deepEqual(
    fake.rows("fundingAccrual").map((r) => ({ ...r })),
    maturatoPrima,
    "il maturato non cambia perche la famiglia ha pagato",
  );
});

// --- 2. voucher liquidato senza modificare la rata ---------------------------

test("liquidare un voucher non crea un pagamento e non tocca la rata", async () => {
  const enrollment = await beneficiarioConMaturato();
  const accruals = await contributi.listFundingAccruals(
    { enrollmentId: enrollment.id },
    scopeA(),
  );
  const maturato = accruals.find((a) => a.accrued_amount > 0);
  assert.ok(maturato, "serve almeno un periodo maturato per liquidare");

  await contributi.markAccrualsReported([maturato.id], scopeA());

  const rataPrima = JSON.parse(JSON.stringify(rataRow()));
  const incassiPrima = fake.rows("paymentTransaction").length;

  await contributi.createFundingSettlement(
    {
      programId: PROGRAMMA,
      amount: maturato.accrued_amount,
      settledAt: "2026-01-15T00:00:00.000Z",
      reference: "Mandato 42",
      lines: [{ accrualId: maturato.id, amount: maturato.accrued_amount }],
    },
    scopeA(),
  );

  assert.equal(
    fake.rows("paymentTransaction").length,
    incassiPrima,
    "una liquidazione dell'ente non e un incasso della famiglia",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(rataRow())),
    rataPrima,
    "la rata resta identica: nessuna compensazione automatica (ADR-0037)",
  );
  assert.equal(
    rataRow().status,
    "pending",
    "la rata non si salda perche l'ente ha versato",
  );
});

test("i cinque importi di un contributo restano cinque numeri distinti", async () => {
  const enrollment = await beneficiarioConMaturato();
  const accruals = await contributi.listFundingAccruals(
    { enrollmentId: enrollment.id },
    scopeA(),
  );
  const maturato = accruals.find((a) => a.accrued_amount > 0);

  await contributi.markAccrualsReported([maturato.id], scopeA());
  await contributi.createFundingSettlement(
    {
      programId: PROGRAMMA,
      amount: maturato.accrued_amount,
      lines: [{ accrualId: maturato.id, amount: maturato.accrued_amount }],
    },
    scopeA(),
  );

  const [overview] = await contributi.getAthleteFundingOverview(
    ATLETA,
    scopeA(),
    CLUB_A,
  );

  const { summary } = overview;

  assert.equal(summary.assignedAmount, 300, "l'assegnato e il plafond deciso");
  assert.ok(summary.accruedAmount > 0, "il maturato viene dalla frequenza");
  assert.ok(summary.reportedAmount > 0, "il rendicontato e una marcatura interna");
  assert.ok(summary.settledAmount > 0, "il liquidato e il denaro versato dall'ente");
  assert.notEqual(
    summary.assignedAmount,
    summary.settledAmount,
    "assegnato e liquidato non sono lo stesso numero e non vanno confusi",
  );
});

// --- 3. atleta multi-sede e piano pagamento ---------------------------------

test("un atleta con due sedi ha una rata sola: la rata non ha sede", async () => {
  const appartenenze = [
    { category_id: "cat-u14", site_id: SEDE_NORD, is_primary: true },
    { category_id: "cat-u16", site_id: SEDE_SUD, is_primary: false },
  ];

  const sediAtleta = sedi.getAthleteSiteIds({
    categoryMemberships: appartenenze,
  });

  assert.deepEqual(
    [...sediAtleta].sort(),
    [SEDE_NORD, SEDE_SUD],
    "l'atleta risulta in entrambe le sedi",
  );

  await pagamenti.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 130,
      paymentMethod: "Contanti",
      paidAt: "2026-08-05T10:00:00.000Z",
    },
    scopeA(),
  );

  assert.equal(
    fake.rows("athletePayment").filter((r) => r.athlete_id === ATLETA).length,
    1,
    "due sedi non duplicano il piano di pagamento",
  );
  assert.equal(rataRow().status, "paid", "la rata si salda una volta sola");
});

test("un atleta senza sede resta visibile a ogni filtro di sede", () => {
  const senzaSede = { categoryMemberships: [{ category_id: "cat-u14" }] };

  assert.equal(
    sedi.athleteMatchesSite(senzaSede, SEDE_NORD),
    true,
    "sede non dichiarata significa visibile ovunque, non invisibile",
  );
  assert.equal(
    sedi.athleteMatchesSite(senzaSede, null),
    true,
    "senza filtro di sede si vede tutto",
  );
});

// --- 4. modulo online che crea un atleta, e la sede -------------------------

const ATHLETE_FIELDS = [
  {
    id: "f_nome",
    type: "short_text",
    label: "Nome",
    binding: "athlete.firstName",
    required: true,
  },
  {
    id: "f_cognome",
    type: "short_text",
    label: "Cognome",
    binding: "athlete.lastName",
    required: true,
  },
];

const impostazioni = {
  successMessage: "Grazie",
  closeAt: "",
  collectRespondentEmail: false,
  notifyOnSubmit: false,
};

const moduloPubblicato = async (scope = scopeA(), campi = ATHLETE_FIELDS) => {
  teachCompositeVersionLookup();
  const creato = await forms.createFormTemplate(scope, { starter: "blank" });
  await forms.updateFormTemplateDraft(scope, creato.id, {
    title: "Iscrizione",
    description: "",
    fields: campi,
    settings: impostazioni,
  });
  return forms.publishFormTemplate(scope, creato.id);
};

test("un modulo pubblico non sceglie il club: lo decide lo slug", async () => {
  const modulo = await moduloPubblicato(scopeA());

  await compilazioni.submitPublicForm(modulo.publicSlug, {
    answers: {
      f_nome: "Mario",
      f_cognome: "Rossi",
      // Un client malevolo prova a dichiararsi di un altro club.
      organizationId: CLUB_B,
      organization_id: CLUB_B,
      site_id: SEDE_SUD,
    },
    files: [],
  });

  const compilazione = fake.rows("formSubmission")[0];

  assert.equal(
    compilazione.organization_id,
    CLUB_A,
    "il tenant viene dal modulo trovato per slug, non dalla richiesta",
  );
  assert.notEqual(
    compilazione.organization_id,
    CLUB_B,
    "una risposta non deve poter spostare la compilazione su un altro club",
  );
});

test("una compilazione pubblica non scrive in anagrafica prima dell'approvazione", async () => {
  const modulo = await moduloPubblicato(scopeA());

  await compilazioni.submitPublicForm(modulo.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [],
  });

  assert.equal(
    fake.rows("athlete").length,
    0,
    "l'anagrafica la tocca la segreteria approvando, non chi compila",
  );
  assert.equal(fake.rows("formSubmission")[0].status, "pending");
});

test("il dominio dei moduli non conosce le sedi, e va bene cosi", async () => {
  const modulo = await moduloPubblicato(scopeA());

  await compilazioni.submitPublicForm(modulo.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [],
  });

  const compilazione = fake.rows("formSubmission")[0];
  const risposte = JSON.stringify(compilazione.answers || compilazione.data || {});

  assert.equal(
    /site_id|siteId/.test(risposte),
    false,
    "nessun campo sede arriva dal modulo pubblico",
  );

  /*
    Un atleta creato da un modulo nasce senza sede, e `null` significa «sede
    non dichiarata»: resta visibile a ogni filtro (ADR-0038). E la
    degradazione giusta — l'alternativa, far scegliere la sede a chi compila,
    darebbe a un modulo pubblico il potere di collocare una persona in una
    struttura del club.
  */
  assert.equal(
    sedi.athleteMatchesSite({ categoryMemberships: [] }, SEDE_NORD),
    true,
    "un atleta nato da modulo non sparisce quando il club filtra per sede",
  );
});

// --- 5. modulo compilato dalla scheda atleta --------------------------------

test("una compilazione interna cita l'atleta da cui e partita", async () => {
  const modulo = await moduloPubblicato(scopeA());

  await compilazioni.submitInternalForm(scopeA(), {
    templateId: modulo.id,
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [],
    subjects: [{ subject: "athlete", recordId: ATLETA }],
  });

  const compilazione = fake.rows("formSubmission")[0];

  assert.equal(compilazione.organization_id, CLUB_A);
  assert.equal(
    JSON.stringify(compilazione.subjects || []).includes(ATLETA),
    true,
    "«Compila modulo» dalla scheda deve arrivare con l'atleta gia scelto",
  );
});

// --- 6. kit e consegne su un atleta multi-sede ------------------------------

test("lo stato di un kit si deriva dagli articoli, non dalla sede", () => {
  const assegnazione = {
    items: [
      { itemId: "maglia", status: "delivered" },
      { itemId: "pantaloncini", status: "assigned" },
    ],
  };

  assert.equal(
    consegne.getKitDeliveryProgress(assegnazione).state,
    "partial",
    "un kit consegnato a meta e parziale",
  );

  const completo = {
    items: [
      { itemId: "maglia", status: "delivered" },
      { itemId: "pantaloncini", status: "delivered" },
    ],
  };

  assert.equal(consegne.getKitDeliveryProgress(completo).state, "completed");
});

test("un atleta in due sedi ha un kit solo, non uno per sede", () => {
  const atleta = {
    categoryMemberships: [
      { category_id: "cat-u14", site_id: SEDE_NORD, is_primary: true },
      { category_id: "cat-u16", site_id: SEDE_SUD, is_primary: false },
    ],
  };

  const assegnazioni = [
    { id: "ass-1", athleteId: ATLETA, items: [{ itemId: "maglia", status: "delivered" }] },
  ];

  const suoi = assegnazioni.filter((a) => a.athleteId === ATLETA);

  assert.equal(suoi.length, 1, "il kit segue la persona, non la struttura");
  assert.equal([...sedi.getAthleteSiteIds(atleta)].length, 2);
  assert.equal(
    consegne.getKitDeliveryProgress(suoi[0]).state,
    "completed",
    "la consegna si valuta sugli articoli, indipendentemente dalle sedi",
  );
});

// --- 7. allegati dentro una compilazione ------------------------------------

test("un allegato di un modulo passa dal servizio allegati", async () => {
  const modulo = await moduloPubblicato(scopeA(), [
    ...ATHLETE_FIELDS,
    { id: "f_certificato", type: "file_upload", label: "Certificato medico" },
  ]);

  await compilazioni.submitPublicForm(modulo.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [
      {
        fieldId: "f_certificato",
        fileName: "certificato.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.4 test"),
      },
    ],
  });

  const allegati = fake.rows("attachment");

  assert.equal(
    allegati.length,
    1,
    "l'allegato deve nascere come Attachment V2, non come blob dentro la compilazione",
  );
  assert.equal(
    allegati[0].organization_id,
    CLUB_A,
    "l'allegato eredita il club dal modulo, non dalla richiesta",
  );
});

// --- 8. isolamento multi-tenant su tutti i domini nuovi ---------------------

const rifiuta = (promise) =>
  assert.rejects(promise, (error) => {
    assert.match(String(error.message), /Accesso negato|non trovat|non disponibile/i);
    return true;
  });

test("nessun dominio nuovo si lascia attraversare da un club all'altro", async () => {
  const enrollment = await beneficiarioConMaturato();
  const modulo = await moduloPubblicato(scopeA());

  // Contributi
  await rifiuta(contributi.getFundingProgramById(PROGRAMMA, scopeB()));
  await rifiuta(contributi.getFundingEnrollmentById(enrollment.id, scopeB()));
  await rifiuta(
    contributi.createFundingEnrollment(
      { programId: PROGRAMMA, athleteId: ATLETA, assignedAmount: 100 },
      scopeB(),
    ),
  );

  // Incassi
  await rifiuta(
    pagamenti.createPaymentTransaction(
      { paymentId: RATA, amount: 10, paymentMethod: "Contanti" },
      scopeB(),
    ),
  );

  // Moduli
  await rifiuta(forms.getFormTemplate(scopeB(), modulo.id));
  await rifiuta(forms.publishFormTemplate(scopeB(), modulo.id));
});

test("un club non vede le compilazioni di un altro", async () => {
  const modulo = await moduloPubblicato(scopeA());
  await compilazioni.submitPublicForm(modulo.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [],
  });

  const codaB = await compilazioni.listFormSubmissions(scopeB(), {});
  const elencoB = Array.isArray(codaB) ? codaB : codaB.items || [];

  assert.equal(
    elencoB.length,
    0,
    "la coda della segreteria e per club, non per installazione",
  );
});

test("un club non vede i contributi di un altro", async () => {
  await beneficiarioConMaturato();

  const overviewB = await contributi.getAthleteFundingOverview(
    ATLETA,
    scopeB(),
    CLUB_B,
  );

  assert.deepEqual(
    overviewB,
    [],
    "lo stesso atleta letto da un altro club non porta con se i suoi voucher",
  );
});
