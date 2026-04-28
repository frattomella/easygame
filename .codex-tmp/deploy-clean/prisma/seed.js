const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const DEMO_IDS = {
  clubCreator: "3b9d31c4-5d3e-47bc-9e9b-0f205adc7c01",
  trainer: "3b9d31c4-5d3e-47bc-9e9b-0f205adc7c02",
  athleteUser: "3b9d31c4-5d3e-47bc-9e9b-0f205adc7c03",
  parent: "3b9d31c4-5d3e-47bc-9e9b-0f205adc7c04",
  organization: "61b0cb79-e17c-47e3-9eca-352e3d5ec801",
  dashboard: "c2542d67-f2ff-44e4-aa77-8b4434ef5a01",
  categoryUnder15: "89b77cc9-c4d8-4c86-b1c9-1fa84f1f0901",
  categoryUnder17: "89b77cc9-c4d8-4c86-b1c9-1fa84f1f0902",
  athleteOne: "9a7678b5-286d-43cb-8f89-7c2e4f3f3c01",
  athleteTwo: "9a7678b5-286d-43cb-8f89-7c2e4f3f3c02",
  athleteThree: "9a7678b5-286d-43cb-8f89-7c2e4f3f3c03",
  paymentOne: "449f3b4d-b751-4c7f-a7ef-81cd74f6f101",
  paymentTwo: "449f3b4d-b751-4c7f-a7ef-81cd74f6f102",
  invoiceOne: "7d4375d1-4e20-449e-a6ca-d15d2732f101",
  receiptOne: "7d4375d1-4e20-449e-a6ca-d15d2732f102",
  resourceTrainingOne: "6ecb25a5-3d32-4e89-a13a-2c6390ab2001",
  resourceTrainingTwo: "6ecb25a5-3d32-4e89-a13a-2c6390ab2002",
  resourceBankOne: "6ecb25a5-3d32-4e89-a13a-2c6390ab2003",
  resourceTransactionOne: "6ecb25a5-3d32-4e89-a13a-2c6390ab2004",
  resourceExpectedIncomeOne: "6ecb25a5-3d32-4e89-a13a-2c6390ab2005",
  resourceTransferOne: "6ecb25a5-3d32-4e89-a13a-2c6390ab2006",
  resourceTrainerOne: "6ecb25a5-3d32-4e89-a13a-2c6390ab2007",
  resourceStaffOne: "6ecb25a5-3d32-4e89-a13a-2c6390ab2008",
  resourceDocumentTemplateOne: "6ecb25a5-3d32-4e89-a13a-2c6390ab2009",
};

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function upsertUser(user) {
  return prisma.user.upsert({
    where: { email: user.email },
    update: user,
    create: user,
  });
}

async function main() {
  const password_hash = await bcrypt.hash("password123", 10);

  const owner = await upsertUser({
    id: DEMO_IDS.clubCreator,
    email: "demo@easygame.it",
    password_hash,
    email_verified_at: new Date(),
    first_name: "Demo",
    last_name: "Club",
    role: "club_creator",
    is_club_creator: true,
    organization_name: "EasyGame FC",
    token_verification_id: "token-demo-club",
    user_metadata: {
      name: "Demo Club",
      firstName: "Demo",
      lastName: "Club",
      role: "club_creator",
      isClubCreator: true,
      organizationName: "EasyGame FC",
    },
  });

  const trainer = await upsertUser({
    id: DEMO_IDS.trainer,
    email: "trainer@easygame.it",
    password_hash,
    email_verified_at: new Date(),
    first_name: "Luca",
    last_name: "Trainer",
    role: "trainer",
    token_verification_id: "token-demo-trainer",
    user_metadata: {
      name: "Luca Trainer",
      firstName: "Luca",
      lastName: "Trainer",
      role: "trainer",
    },
  });

  const athleteUser = await upsertUser({
    id: DEMO_IDS.athleteUser,
    email: "athlete@easygame.it",
    password_hash,
    email_verified_at: new Date(),
    first_name: "Giulia",
    last_name: "Athlete",
    role: "athlete",
    token_verification_id: "token-demo-athlete",
    user_metadata: {
      name: "Giulia Athlete",
      firstName: "Giulia",
      lastName: "Athlete",
      role: "athlete",
    },
  });

  const parent = await upsertUser({
    id: DEMO_IDS.parent,
    email: "parent@easygame.it",
    password_hash,
    email_verified_at: new Date(),
    first_name: "Paolo",
    last_name: "Parent",
    role: "parent",
    token_verification_id: "token-demo-parent",
    user_metadata: {
      name: "Paolo Parent",
      firstName: "Paolo",
      lastName: "Parent",
      role: "parent",
    },
  });

  const club = await prisma.club.upsert({
    where: { slug: "easygame-fc" },
    update: {
      name: "EasyGame FC",
      creator_id: owner.id,
      address: "Via dello Sport 10",
      city: "Roma",
      postal_code: "00100",
      region: "Lazio",
      province: "RM",
      country: "Italia",
      contact_email: "info@easygame.it",
      contact_phone: "+39 06 1234567",
      business_name: "EasyGame FC ASD",
      vat_number: "IT12345678901",
      fiscal_code: "12345678901",
      pec: "easygamefc@pec.it",
      sdi_code: "ABC1234",
      tax_regime: "398/1991 (ASD/SSD)",
      bank_name: "Banca Sportiva Italiana",
      iban: "IT60X0542811101000000123456",
      legal_address: "Via dello Sport 10",
      legal_city: "Roma",
      legal_postal_code: "00100",
      legal_region: "Lazio",
      legal_province: "RM",
      legal_country: "Italia",
      representative_name: "Demo",
      representative_surname: "Club",
      representative_fiscal_code: "DMOCLB80A01H501X",
      payment_pin: "1234",
      settings: {
        theme: "default",
        layout: "standard",
      },
      categories: [
        { id: DEMO_IDS.categoryUnder15, name: "Under 15", color: "#2563eb" },
        { id: DEMO_IDS.categoryUnder17, name: "Under 17", color: "#16a34a" },
      ],
      trainings: [
        {
          id: "training-demo-1",
          title: "Allenamento Under 15",
          date: new Date(Date.now() + 86400000).toISOString(),
          start_time: "18:00",
          end_time: "19:30",
          time: "18:00",
          location: "Campo Centrale",
          status: "scheduled",
          category_id: DEMO_IDS.categoryUnder15,
          category: "Under 15",
          trainer_id: trainer.id,
          expected_attendees: 18,
          attendance_status: "pending",
        },
        {
          id: "training-demo-2",
          title: "Allenamento Under 17",
          date: new Date(Date.now() + 172800000).toISOString(),
          start_time: "19:00",
          end_time: "20:30",
          time: "19:00",
          location: "Campo Secondario",
          status: "scheduled",
          category_id: DEMO_IDS.categoryUnder17,
          category: "Under 17",
          trainer_id: trainer.id,
          expected_attendees: 20,
          attendance_status: "none",
        },
      ],
      trainers: [
        {
          id: trainer.id,
          first_name: "Luca",
          last_name: "Trainer",
          email: trainer.email,
        },
      ],
      staff_members: [
        {
          id: "staff-resource-1",
          first_name: "Anna",
          last_name: "Segreteria",
          role: "Segreteria",
          email: "segreteria@easygame.it",
        },
      ],
      members: [
        {
          user_id: owner.id,
          role: "owner",
          is_primary: true,
        },
      ],
      bank_accounts: [
        {
          id: "bank-1",
          name: "Conto Principale",
          bank_name: "Banca Sportiva Italiana",
          iban: "IT60X0542811101000000123456",
          current_balance: 12450.8,
          currency: "EUR",
        },
      ],
      transactions: [
        {
          id: "txn-1",
          date: "2026-04-02",
          description: "Incasso quota aprile Giulia Rossi",
          category: "Quote",
          amount: 150,
          type: "income",
          paymentMethod: "Bonifico",
          reference: "APR-2026-001",
          bankAccountId: "bank-1",
        },
      ],
      expected_income: [
        {
          id: "expected-income-1",
          date: "2026-04-10",
          description: "Quote aprile da incassare",
          category: "Quote",
          amount: 820,
          reference: "APR-2026-PENDING",
          status: "pending",
          bankAccountId: "bank-1",
        },
      ],
      transfers: [
        {
          id: "transfer-1",
          date: "2026-03-28",
          description: "Giroconto tesoreria",
          fromAccount: "bank-1",
          toAccount: "bank-1",
          amount: 0,
          status: "completed",
        },
      ],
      document_templates: [
        {
          id: "document-template-1",
          name: "Ricevuta standard",
          description: "Template base per ricevute pagamenti",
        },
      ],
    },
    create: {
      id: DEMO_IDS.organization,
      slug: "easygame-fc",
      name: "EasyGame FC",
      creator_id: owner.id,
      address: "Via dello Sport 10",
      city: "Roma",
      postal_code: "00100",
      region: "Lazio",
      province: "RM",
      country: "Italia",
      contact_email: "info@easygame.it",
      contact_phone: "+39 06 1234567",
      business_name: "EasyGame FC ASD",
      vat_number: "IT12345678901",
      fiscal_code: "12345678901",
      pec: "easygamefc@pec.it",
      sdi_code: "ABC1234",
      tax_regime: "398/1991 (ASD/SSD)",
      bank_name: "Banca Sportiva Italiana",
      iban: "IT60X0542811101000000123456",
      legal_address: "Via dello Sport 10",
      legal_city: "Roma",
      legal_postal_code: "00100",
      legal_region: "Lazio",
      legal_province: "RM",
      legal_country: "Italia",
      representative_name: "Demo",
      representative_surname: "Club",
      representative_fiscal_code: "DMOCLB80A01H501X",
      payment_pin: "1234",
      settings: {
        theme: "default",
        layout: "standard",
      },
      categories: [
        { id: DEMO_IDS.categoryUnder15, name: "Under 15", color: "#2563eb" },
        { id: DEMO_IDS.categoryUnder17, name: "Under 17", color: "#16a34a" },
      ],
      trainings: [
        {
          id: "training-demo-1",
          title: "Allenamento Under 15",
          date: new Date(Date.now() + 86400000).toISOString(),
          start_time: "18:00",
          end_time: "19:30",
          time: "18:00",
          location: "Campo Centrale",
          status: "scheduled",
          category_id: DEMO_IDS.categoryUnder15,
          category: "Under 15",
          trainer_id: trainer.id,
          expected_attendees: 18,
          attendance_status: "pending",
        },
        {
          id: "training-demo-2",
          title: "Allenamento Under 17",
          date: new Date(Date.now() + 172800000).toISOString(),
          start_time: "19:00",
          end_time: "20:30",
          time: "19:00",
          location: "Campo Secondario",
          status: "scheduled",
          category_id: DEMO_IDS.categoryUnder17,
          category: "Under 17",
          trainer_id: trainer.id,
          expected_attendees: 20,
          attendance_status: "none",
        },
      ],
      trainers: [
        {
          id: trainer.id,
          first_name: "Luca",
          last_name: "Trainer",
          email: trainer.email,
        },
      ],
      staff_members: [
        {
          id: "staff-resource-1",
          first_name: "Anna",
          last_name: "Segreteria",
          role: "Segreteria",
          email: "segreteria@easygame.it",
        },
      ],
      members: [
        {
          user_id: owner.id,
          role: "owner",
          is_primary: true,
        },
      ],
      bank_accounts: [
        {
          id: "bank-1",
          name: "Conto Principale",
          bank_name: "Banca Sportiva Italiana",
          iban: "IT60X0542811101000000123456",
          current_balance: 12450.8,
          currency: "EUR",
        },
      ],
      transactions: [
        {
          id: "txn-1",
          date: "2026-04-02",
          description: "Incasso quota aprile Giulia Rossi",
          category: "Quote",
          amount: 150,
          type: "income",
          paymentMethod: "Bonifico",
          reference: "APR-2026-001",
          bankAccountId: "bank-1",
        },
      ],
      expected_income: [
        {
          id: "expected-income-1",
          date: "2026-04-10",
          description: "Quote aprile da incassare",
          category: "Quote",
          amount: 820,
          reference: "APR-2026-PENDING",
          status: "pending",
          bankAccountId: "bank-1",
        },
      ],
      transfers: [
        {
          id: "transfer-1",
          date: "2026-03-28",
          description: "Giroconto tesoreria",
          fromAccount: "bank-1",
          toAccount: "bank-1",
          amount: 0,
          status: "completed",
        },
      ],
      document_templates: [
        {
          id: "document-template-1",
          name: "Ricevuta standard",
          description: "Template base per ricevute pagamenti",
        },
      ],
    },
  });

  await prisma.dashboard.upsert({
    where: { slug: "easygame-fc-dashboard" },
    update: {
      organization_id: club.id,
      creator_id: owner.id,
      settings: {
        theme: "default",
        layout: "standard",
        widgets: ["metrics", "activities", "trainings", "certifications"],
      },
    },
    create: {
      id: DEMO_IDS.dashboard,
      organization_id: club.id,
      creator_id: owner.id,
      slug: "easygame-fc-dashboard",
      settings: {
        theme: "default",
        layout: "standard",
        widgets: ["metrics", "activities", "trainings", "certifications"],
      },
    },
  });

  await prisma.organizationUser.upsert({
    where: {
      organization_id_user_id: {
        organization_id: club.id,
        user_id: owner.id,
      },
    },
    update: { role: "owner", is_primary: true },
    create: {
      organization_id: club.id,
      user_id: owner.id,
      role: "owner",
      is_primary: true,
    },
  });

  for (const access of [
    { user_id: trainer.id, role: "trainer" },
    { user_id: athleteUser.id, role: "athlete" },
    { user_id: parent.id, role: "parent" },
  ]) {
    await prisma.organizationUser.upsert({
      where: {
        organization_id_user_id: {
          organization_id: club.id,
          user_id: access.user_id,
        },
      },
      update: { role: access.role, is_primary: true },
      create: {
        organization_id: club.id,
        user_id: access.user_id,
        role: access.role,
        is_primary: true,
      },
    });
  }

  const athletes = [
    {
      id: DEMO_IDS.athleteOne,
      user_id: athleteUser.id,
      first_name: "Giulia",
      last_name: "Rossi",
      birth_date: new Date("2010-05-12"),
      category_id: DEMO_IDS.categoryUnder17,
      category_name: "Under 17",
      access_code: "U17GROSSI",
      jersey_number: "10",
      data: {
        category: "Under 17",
        medicalCertExpiry: "2026-09-15",
        avatar: null,
        status: "active",
      },
    },
    {
      id: DEMO_IDS.athleteTwo,
      first_name: "Marco",
      last_name: "Bianchi",
      birth_date: new Date("2011-02-03"),
      category_id: DEMO_IDS.categoryUnder15,
      category_name: "Under 15",
      access_code: "U15MBIAN",
      jersey_number: "7",
      data: {
        category: "Under 15",
        medicalCertExpiry: "2026-07-20",
        avatar: null,
        status: "active",
      },
    },
    {
      id: DEMO_IDS.athleteThree,
      first_name: "Sara",
      last_name: "Verdi",
      birth_date: new Date("2012-08-27"),
      category_id: DEMO_IDS.categoryUnder15,
      category_name: "Under 15",
      access_code: "U15SVERD",
      jersey_number: "4",
      data: {
        category: "Under 15",
        medicalCertExpiry: "2026-04-10",
        avatar: null,
        status: "active",
      },
    },
  ];

  for (const athlete of athletes) {
    await prisma.athlete.upsert({
      where: { id: athlete.id },
      update: {
        organization_id: club.id,
        user_id: athlete.user_id || null,
        first_name: athlete.first_name,
        last_name: athlete.last_name,
        birth_date: athlete.birth_date,
        category_id: athlete.category_id,
        category_name: athlete.category_name,
        access_code: athlete.access_code,
        jersey_number: athlete.jersey_number,
        status: "active",
        data: athlete.data,
      },
      create: {
        ...athlete,
        organization_id: club.id,
        status: "active",
      },
    });
  }

  await prisma.medicalCertificate.upsert({
    where: { id: "a8f51b8c-0479-41cb-a79c-9b2868f6a001" },
    update: {
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteOne,
      type: "Certificato Medico Agonistico",
      issue_date: new Date("2025-09-15"),
      expiry_date: new Date("2026-09-15"),
      status: "valid",
    },
    create: {
      id: "a8f51b8c-0479-41cb-a79c-9b2868f6a001",
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteOne,
      type: "Certificato Medico Agonistico",
      issue_date: new Date("2025-09-15"),
      expiry_date: new Date("2026-09-15"),
      status: "valid",
    },
  });

  for (const method of [
    {
      id: "2fdc7d58-8d01-4e82-a7d6-1c8fe90ff101",
      name: "Carta di Credito",
      type: "credit_card",
      is_enabled: true,
      processing_fee_percentage: 1.5,
      processing_fee_fixed: 0.3,
      display_order: 1,
    },
    {
      id: "2fdc7d58-8d01-4e82-a7d6-1c8fe90ff102",
      name: "PayPal",
      type: "paypal",
      is_enabled: true,
      processing_fee_percentage: 2.9,
      processing_fee_fixed: 0.3,
      display_order: 2,
    },
    {
      id: "2fdc7d58-8d01-4e82-a7d6-1c8fe90ff103",
      name: "Apple Pay",
      type: "apple_pay",
      is_enabled: false,
      processing_fee_percentage: 1,
      processing_fee_fixed: 0,
      display_order: 3,
    },
    {
      id: "2fdc7d58-8d01-4e82-a7d6-1c8fe90ff104",
      name: "Bonifico Bancario",
      type: "bank_transfer",
      is_enabled: true,
      processing_fee_percentage: 0,
      processing_fee_fixed: 0,
      display_order: 4,
    },
  ]) {
    await prisma.paymentMethod.upsert({
      where: { id: method.id },
      update: { ...method, organization_id: club.id },
      create: { ...method, organization_id: club.id, config: {} },
    });
  }

  await prisma.athletePayment.upsert({
    where: { id: DEMO_IDS.paymentOne },
    update: {
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteOne,
      description: "Quota mensile aprile 2026",
      amount: 150,
      due_date: new Date("2026-04-05"),
      paid_at: new Date("2026-04-02"),
      status: "paid",
      method: "Bonifico",
      reference: "APR-2026-001",
      notes: "Pagamento registrato da segreteria",
      data: {
        athlete_name: "Giulia Rossi",
      },
    },
    create: {
      id: DEMO_IDS.paymentOne,
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteOne,
      description: "Quota mensile aprile 2026",
      amount: 150,
      due_date: new Date("2026-04-05"),
      paid_at: new Date("2026-04-02"),
      status: "paid",
      method: "Bonifico",
      reference: "APR-2026-001",
      notes: "Pagamento registrato da segreteria",
      data: {
        athlete_name: "Giulia Rossi",
      },
    },
  });

  await prisma.athletePayment.upsert({
    where: { id: DEMO_IDS.paymentTwo },
    update: {
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteTwo,
      description: "Quota mensile aprile 2026",
      amount: 130,
      due_date: new Date("2026-04-10"),
      status: "pending",
      method: "Carta di Credito",
      reference: "APR-2026-002",
      data: {
        athlete_name: "Marco Bianchi",
      },
    },
    create: {
      id: DEMO_IDS.paymentTwo,
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteTwo,
      description: "Quota mensile aprile 2026",
      amount: 130,
      due_date: new Date("2026-04-10"),
      status: "pending",
      method: "Carta di Credito",
      reference: "APR-2026-002",
      data: {
        athlete_name: "Marco Bianchi",
      },
    },
  });

  await prisma.invoice.upsert({
    where: { invoice_number: "2026/001" },
    update: {
      id: DEMO_IDS.invoiceOne,
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteOne,
      payment_id: DEMO_IDS.paymentOne,
      issue_date: new Date("2026-04-02"),
      amount: 150,
      description: "Quota mensile aprile 2026",
      payment_method: "bonifico",
      status: "issued",
      is_electronic: true,
      recipient_code: "0000000",
      vat_number: "IT12345678901",
      fiscal_code: "RSSGLI10E52H501Q",
      address: "Via dello Sport 10",
      city: "Roma",
      postal_code: "00100",
      province: "RM",
      country: "Italia",
      notes: "Fattura collegata al pagamento aprile 2026",
    },
    create: {
      id: DEMO_IDS.invoiceOne,
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteOne,
      payment_id: DEMO_IDS.paymentOne,
      invoice_number: "2026/001",
      issue_date: new Date("2026-04-02"),
      amount: 150,
      description: "Quota mensile aprile 2026",
      payment_method: "bonifico",
      status: "issued",
      is_electronic: true,
      recipient_code: "0000000",
      vat_number: "IT12345678901",
      fiscal_code: "RSSGLI10E52H501Q",
      address: "Via dello Sport 10",
      city: "Roma",
      postal_code: "00100",
      province: "RM",
      country: "Italia",
      notes: "Fattura collegata al pagamento aprile 2026",
    },
  });

  await prisma.receipt.upsert({
    where: { receipt_number: "R-2026-001" },
    update: {
      id: DEMO_IDS.receiptOne,
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteOne,
      payment_id: DEMO_IDS.paymentOne,
      invoice_id: DEMO_IDS.invoiceOne,
      issue_date: new Date("2026-04-02"),
      amount: 150,
      description: "Ricevuta pagamento quota mensile aprile 2026",
      status: "issued",
      method: "Bonifico",
    },
    create: {
      id: DEMO_IDS.receiptOne,
      organization_id: club.id,
      athlete_id: DEMO_IDS.athleteOne,
      payment_id: DEMO_IDS.paymentOne,
      invoice_id: DEMO_IDS.invoiceOne,
      receipt_number: "R-2026-001",
      issue_date: new Date("2026-04-02"),
      amount: 150,
      description: "Ricevuta pagamento quota mensile aprile 2026",
      status: "issued",
      method: "Bonifico",
    },
  });

  await prisma.trainerPayment.upsert({
    where: { id: "0fe3f4f4-593f-4b0d-a48d-1b7d8b66f001" },
    update: {
      organization_id: club.id,
      trainer_id: trainer.id,
      trainer_name: "Luca Trainer",
      month: "Marzo 2026",
      amount: 1500,
      date: new Date("2026-03-31"),
      status: "paid",
    },
    create: {
      id: "0fe3f4f4-593f-4b0d-a48d-1b7d8b66f001",
      organization_id: club.id,
      trainer_id: trainer.id,
      trainer_name: "Luca Trainer",
      month: "Marzo 2026",
      amount: 1500,
      date: new Date("2026-03-31"),
      status: "paid",
    },
  });

  for (const item of [
    {
      id: DEMO_IDS.categoryUnder15,
      resource_type: "categories",
      name: "Under 15",
      payload: { id: DEMO_IDS.categoryUnder15, name: "Under 15", color: "#2563eb" },
    },
    {
      id: DEMO_IDS.categoryUnder17,
      resource_type: "categories",
      name: "Under 17",
      payload: { id: DEMO_IDS.categoryUnder17, name: "Under 17", color: "#16a34a" },
    },
    {
      id: DEMO_IDS.resourceTrainingOne,
      resource_type: "trainings",
      name: "Allenamento Under 15",
      date: new Date(Date.now() + 86400000),
      status: "scheduled",
      payload: {
        id: "training-demo-1",
        title: "Allenamento Under 15",
        date: new Date(Date.now() + 86400000).toISOString(),
        start_time: "18:00",
        end_time: "19:30",
        time: "18:00",
        location: "Campo Centrale",
        status: "scheduled",
        category_id: DEMO_IDS.categoryUnder15,
        category: "Under 15",
        trainer_id: trainer.id,
        expected_attendees: 18,
        attendance_status: "pending",
      },
    },
    {
      id: DEMO_IDS.resourceTrainingTwo,
      resource_type: "trainings",
      name: "Allenamento Under 17",
      date: new Date(Date.now() + 172800000),
      status: "scheduled",
      payload: {
        id: "training-demo-2",
        title: "Allenamento Under 17",
        date: new Date(Date.now() + 172800000).toISOString(),
        start_time: "19:00",
        end_time: "20:30",
        time: "19:00",
        location: "Campo Secondario",
        status: "scheduled",
        category_id: DEMO_IDS.categoryUnder17,
        category: "Under 17",
        trainer_id: trainer.id,
        expected_attendees: 20,
        attendance_status: "none",
      },
    },
    {
      id: DEMO_IDS.resourceBankOne,
      resource_type: "bank_accounts",
      name: "Conto Principale",
      payload: {
        id: "bank-1",
        name: "Conto Principale",
        bank_name: "Banca Sportiva Italiana",
        iban: "IT60X0542811101000000123456",
        current_balance: 12450.8,
        currency: "EUR",
      },
    },
    {
      id: DEMO_IDS.resourceTransactionOne,
      resource_type: "transactions",
      name: "Incasso quota aprile",
      date: new Date("2026-04-02"),
      payload: {
        id: "txn-1",
        date: "2026-04-02",
        description: "Incasso quota aprile Giulia Rossi",
        category: "Quote",
        amount: 150,
        type: "income",
        paymentMethod: "Bonifico",
        reference: "APR-2026-001",
        bankAccountId: "bank-1",
      },
    },
    {
      id: DEMO_IDS.resourceExpectedIncomeOne,
      resource_type: "expected_income",
      name: "Quote aprile residue",
      date: new Date("2026-04-10"),
      status: "pending",
      payload: {
        id: "expected-income-1",
        date: "2026-04-10",
        description: "Quote aprile da incassare",
        category: "Quote",
        amount: 820,
        reference: "APR-2026-PENDING",
        status: "pending",
        bankAccountId: "bank-1",
      },
    },
    {
      id: DEMO_IDS.resourceTransferOne,
      resource_type: "transfers",
      name: "Giroconto tesoreria",
      date: new Date("2026-03-28"),
      status: "completed",
      payload: {
        id: "transfer-1",
        date: "2026-03-28",
        description: "Giroconto tesoreria",
        fromAccount: "bank-1",
        toAccount: "bank-1",
        amount: 0,
        status: "completed",
      },
    },
    {
      id: DEMO_IDS.resourceTrainerOne,
      resource_type: "trainers",
      name: "Luca Trainer",
      payload: {
        id: trainer.id,
        first_name: "Luca",
        last_name: "Trainer",
        email: trainer.email,
        phone: trainer.phone,
      },
    },
    {
      id: DEMO_IDS.resourceStaffOne,
      resource_type: "staff_members",
      name: "Anna Segreteria",
      payload: {
        id: "staff-resource-1",
        first_name: "Anna",
        last_name: "Segreteria",
        role: "Segreteria",
        email: "segreteria@easygame.it",
        phone: "+39 333 000 0000",
      },
    },
    {
      id: DEMO_IDS.resourceDocumentTemplateOne,
      resource_type: "document_templates",
      name: "Ricevuta standard",
      payload: {
        id: "document-template-1",
        name: "Ricevuta standard",
        description: "Template base per ricevute pagamenti",
      },
    },
  ]) {
    await prisma.clubResourceItem.upsert({
      where: { id: item.id },
      update: {
        organization_id: club.id,
        resource_type: item.resource_type,
        name: item.name,
        status: item.status || null,
        date: item.date || null,
        payload: item.payload,
      },
      create: {
        id: item.id,
        organization_id: club.id,
        resource_type: item.resource_type,
        name: item.name,
        status: item.status || null,
        date: item.date || null,
        payload: item.payload,
      },
    });
  }

  await prisma.notification.upsert({
    where: { id: "a7f0aeb1-c0fc-47db-a7db-f34fa896f001" },
    update: {
      organization_id: club.id,
      user_id: owner.id,
      title: "Nuovo pagamento registrato",
      message: "La quota mensile di Giulia Rossi e stata registrata correttamente.",
      type: "system",
      read: false,
      data: {
        payment_id: DEMO_IDS.paymentOne,
      },
    },
    create: {
      id: "a7f0aeb1-c0fc-47db-a7db-f34fa896f001",
      organization_id: club.id,
      user_id: owner.id,
      title: "Nuovo pagamento registrato",
      message: "La quota mensile di Giulia Rossi e stata registrata correttamente.",
      type: "system",
      read: false,
      data: {
        payment_id: DEMO_IDS.paymentOne,
      },
    },
  });

  console.log(`Seed completato per ${club.name} (${slugify(club.name)})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
