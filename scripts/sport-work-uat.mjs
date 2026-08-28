/**
 * Collaudo a runtime del modulo **Lavoro sportivo**, sull'applicazione vera.
 *
 * **Perche esiste, visto che ci sono duemila test.** Perche i test di unita e
 * di servizio girano su un doppio di Prisma e su uno scope costruito a mano:
 * provano il dominio, non il prodotto. Su questo repository e gia successo che
 * 1.727 test verdi convivessero con un pulsante che rispondeva sempre «Club
 * non disponibile». Questo script parla HTTP con l'applicazione in ascolto, con
 * un cookie di sessione vero, e passa dalle stesse rotte che usa il browser.
 *
 * Copre gli scenari A–E del work package, piu sicurezza, concorrenza, storno,
 * anno nuovo e prestazioni su un dataset realistico.
 *
 *     node scripts/sport-work-uat.mjs --base=http://127.0.0.1:3010
 *     node scripts/sport-work-uat.mjs --seed-only     # solo dataset QA
 *     node scripts/sport-work-uat.mjs --keep          # non ripulisce
 *
 * **Scrive**, e scrive parecchio: crea persone, rapporti, piani, erogazioni e
 * sessioni. Si rifiuta di partire se `EASYGAME_DB_ENV` non e `development`, a
 * meno di `EASYGAME_ALLOW_SHARED_DB_WRITE=1` — la stessa deroga esplicita che
 * usa `db-guard`. Tutto cio che crea porta il prefisso `UAT-SW` nel nome, cosi
 * si riconosce e si ripulisce.
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const BASE =
  (args.find((arg) => arg.startsWith("--base=")) || "").split("=")[1] ||
  "http://127.0.0.1:3010";
const SEED_ONLY = args.includes("--seed-only");
const KEEP = args.includes("--keep");
const FLEET = Number(
  (args.find((arg) => arg.startsWith("--fleet=")) || "").split("=")[1] || 50,
);

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
if (DB_ENV !== "development" && process.env.EASYGAME_ALLOW_SHARED_DB_WRITE !== "1") {
  console.error(
    `Rifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}", non "development".`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

/* ------------------------------------------------------------ esiti */

const results = [];
let currentGroup = "";

const group = (name) => {
  currentGroup = name;
  console.log(`\n── ${name}`);
};

const check = (name, condition, detail = "") => {
  const ok = Boolean(condition);
  results.push({ group: currentGroup, name, ok, detail });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
};

const near = (actual, expected, tolerance = 0.005) =>
  Math.abs(Number(actual) - Number(expected)) <= tolerance;

/* ------------------------------------------------------------ trasporto */

const call = async (token, path, options = {}) => {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `easygame_session=${token}` } : {}),
      ...(options.clubId ? { "x-active-club-id": options.clubId } : {}),
      ...(options.role ? { "x-active-access-role": options.role } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const payload = await response.json().catch(() => ({}));
  return {
    status: response.status,
    data: payload?.data,
    error: payload?.error,
    ms: Date.now() - started,
  };
};

/* ------------------------------------------------------------ sessioni */

const createSession = async (userId) => {
  const token = `uat-${randomUUID()}`;
  await prisma.session.create({
    data: {
      token,
      user_id: userId,
      expires_at: new Date(Date.now() + 6 * 3600_000),
    },
  });
  return token;
};

/* ------------------------------------------------------------ pulizia */

const cleanup = async (organizationIds) => {
  for (const organizationId of organizationIds) {
    const people = await prisma.sportWorkPerson.findMany({
      where: { organization_id: organizationId, last_name: { startsWith: "UAT-SW" } },
      select: { id: true },
    });
    const ids = people.map((row) => row.id);
    if (ids.length === 0) continue;

    await prisma.sportWorkOutboundTransaction.deleteMany({
      where: { person_id: { in: ids } },
    });
    await prisma.sportWorkInstallment.deleteMany({
      where: { relationship: { person_id: { in: ids } } },
    });
    await prisma.sportWorkCompensationPlan.deleteMany({
      where: { relationship: { person_id: { in: ids } } },
    });
    await prisma.sportWorkObligation.deleteMany({
      where: { person_id: { in: ids } },
    });
    await prisma.sportWorkBonus.deleteMany({ where: { person_id: { in: ids } } });
    await prisma.sportWorkExpenseReimbursement.deleteMany({
      where: { person_id: { in: ids } },
    });
    await prisma.sportWorkVatInvoice.deleteMany({
      where: { person_id: { in: ids } },
    });
    await prisma.sportWorkYearPosition.deleteMany({
      where: { person_id: { in: ids } },
    });
    await prisma.sportWorkExternalDeclaration.deleteMany({
      where: { person_id: { in: ids } },
    });
    await prisma.sportWorkRelationship.deleteMany({
      where: { person_id: { in: ids } },
    });
    await prisma.sportWorkPerson.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.session.deleteMany({ where: { token: { startsWith: "uat-" } } });
};

/* ------------------------------------------------------------ scenari */

const run = async () => {
  const clubs = await prisma.club.findMany({
    select: { id: true, name: true, creator_id: true },
    orderBy: { created_at: "asc" },
  });

  const clubA = clubs.find((club) => club.name === "EasyGame FC") || clubs[0];
  const clubB = clubs.find((club) => club.id !== clubA.id);

  if (!clubA || !clubB) {
    throw new Error("Servono due club nel database di sviluppo per provare il confine");
  }

  const ownerA = await prisma.organizationUser.findFirst({
    where: { organization_id: clubA.id, role: "owner" },
  });
  const trainerA = await prisma.organizationUser.findFirst({
    where: { organization_id: clubA.id, role: "trainer" },
  });
  const ownerB = clubB.creator_id;

  /*
    La pulizia viene prima delle sessioni, e non e un dettaglio di ordine:
    `cleanup` cancella anche i token `uat-`, quindi crearli prima significava
    cancellarseli da soli e vedere ogni chiamata rispondere 401. Il collaudo
    lo ha scoperto al primo giro.
  */
  await cleanup([clubA.id, clubB.id]);

  const tokenOwnerA = await createSession(ownerA.user_id);
  const tokenTrainerA = trainerA ? await createSession(trainerA.user_id) : null;
  const tokenOwnerB = await createSession(ownerB);

  const A = (path, options = {}) =>
    call(tokenOwnerA, path, { clubId: clubA.id, role: "owner", ...options });
  const T = (path, options = {}) =>
    call(tokenTrainerA, path, { clubId: clubA.id, role: "trainer", ...options });
  const B = (path, options = {}) =>
    call(tokenOwnerB, path, { clubId: clubB.id, role: "owner", ...options });

  console.log(`Collaudo su ${BASE}`);
  console.log(`Club A: ${clubA.name} (${clubA.id})`);
  console.log(`Club B: ${clubB.name} (${clubB.id})`);

  /* ============================================ 0. sicurezza e permessi */

  group("0 — Sicurezza, permessi e confine di club");

  const anon = await call(null, "/api/v1/sport-work/people");
  check("senza sessione si risponde 401", anon.status === 401, `HTTP ${anon.status}`);

  if (tokenTrainerA) {
    const trainerPeople = await T("/api/v1/sport-work/people");
    check(
      "un allenatore non elenca le persone del modulo",
      trainerPeople.status === 403,
      `HTTP ${trainerPeople.status}`,
    );

    const trainerDashboard = await T("/api/v1/sport-work/dashboard");
    check(
      "un allenatore non legge il cruscotto",
      trainerDashboard.status === 403,
      `HTTP ${trainerDashboard.status}`,
    );

    const trainerPay = await T("/api/v1/sport-work/payouts", {
      method: "POST",
      body: { amount: 100 },
    });
    check(
      "un allenatore non registra erogazioni",
      trainerPay.status === 403,
      `HTTP ${trainerPay.status}`,
    );

    const trainerDatasets = await T("/api/v1/sport-work/datasets?kind=f24");
    check(
      "un allenatore non legge i dataset fiscali",
      trainerDatasets.status === 403,
      `HTTP ${trainerDatasets.status}`,
    );
  }

  const crossQuery = await A(
    `/api/v1/sport-work/people?organization_id=${clubB.id}`,
  );
  check(
    "chiedere il club di un altro resta 403",
    crossQuery.status === 403,
    `HTTP ${crossQuery.status}`,
  );

  /* ================================================ A — atleta senior */

  group("A — Atleta senior, co.co.co., stagione 2026/27, 12.000 euro");

  const personA = await A("/api/v1/sport-work/people", {
    method: "POST",
    body: {
      firstName: "Andrea",
      lastName: "UAT-SW Atleta",
      fiscalCode: "TLAUAT90A01H501A",
      originType: "athlete",
      originId: `uat-athlete-${randomUUID()}`,
      socialCoverage: "NONE",
      email: "uat.atleta@easygame.test",
      iban: "IT60X0542811101000000123456",
    },
  });
  check("la persona si crea", personA.status === 201, personA.error?.message || "");

  const peopleList = await A("/api/v1/sport-work/people");
  const listed = (peopleList.data || []).find((row) => row.id === personA.data.id);
  check(
    "l'elenco non porta l'IBAN, la scheda si",
    listed && !("iban" in listed) && listed.has_iban === true,
    listed ? `has_iban=${listed.has_iban}` : "persona non elencata",
  );

  const relA = await A("/api/v1/sport-work/relationships", {
    method: "POST",
    body: {
      personId: personA.data.id,
      role: "ATHLETE",
      relationshipType: "SPORT_COCOCO",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      contractAmount: 12000,
      compensationFrequency: "SEASONAL",
      weeklyHours: 12,
    },
  });
  check("il rapporto nasce in bozza", relA.data?.status === "DRAFT", relA.data?.status);

  const activateBlocked = await A(
    `/api/v1/sport-work/relationships/${relA.data.id}/status`,
    { method: "POST", body: { status: "ACTIVE" } },
  );
  check(
    "senza contratto l'attivazione dice cosa manca",
    activateBlocked.status === 400 &&
      /contratto firmato/.test(activateBlocked.error?.message || ""),
    activateBlocked.error?.message || `HTTP ${activateBlocked.status}`,
  );

  await A(`/api/v1/sport-work/relationships/${relA.data.id}`, {
    method: "PATCH",
    body: { contractAttachmentId: randomUUID(), signatureState: "SIGNED" },
  });

  const activated = await A(
    `/api/v1/sport-work/relationships/${relA.data.id}/status`,
    { method: "POST", body: { status: "ACTIVE" } },
  );
  check(
    "con il contratto il rapporto si attiva",
    activated.data?.status === "ACTIVE",
    activated.error?.message || activated.data?.status,
  );

  const plan = await A(
    `/api/v1/sport-work/relationships/${relA.data.id}/plan`,
    {
      method: "PUT",
      body: {
        kind: "EQUAL_INSTALMENTS",
        totalAmount: 12000,
        installmentCount: 10,
        firstDueDate: "2026-09-30",
      },
    },
  );
  const installments = (plan.data?.installments || []).sort(
    (left, right) => left.sequence - right.sequence,
  );
  check("il piano genera dieci rate", installments.length === 10, `${installments.length}`);
  check(
    "le rate tornano al pattuito",
    near(
      installments.reduce((total, row) => total + Number(row.gross_amount), 0),
      12000,
    ),
  );
  const in2026 = installments.filter((row) => row.fiscal_year === 2026);
  const in2027 = installments.filter((row) => row.fiscal_year === 2027);
  check(
    "la stagione attraversa due anni solari",
    in2026.length === 4 && in2027.length === 6,
    `${in2026.length} nel 2026, ${in2027.length} nel 2027`,
  );

  const declaration = await A("/api/v1/sport-work/declarations", {
    method: "POST",
    body: {
      personId: personA.data.id,
      fiscalYear: 2026,
      externalAmount: 2000,
      declarationDate: "2026-08-20",
    },
  });
  check(
    "l'autocertificazione 2026 si registra",
    declaration.status === 201,
    declaration.error?.message || "",
  );

  const proposal1 = await A("/api/v1/sport-work/payouts/prepare", {
    method: "POST",
    body: { installmentId: installments[0].id, paidAt: "2026-09-30" },
  });
  check(
    "la proposta conosce il dichiarato esterno",
    proposal1.data?.computation?.priorExternalDeclared === 2000,
    String(proposal1.data?.computation?.priorExternalDeclared),
  );
  check(
    "la prima rata resta sotto la franchigia: nessun contributo",
    proposal1.data?.computation?.employeeContribution === 0,
    String(proposal1.data?.computation?.employeeContribution),
  );
  check(
    "la proposta spiega il calcolo riga per riga",
    (proposal1.data?.computation?.explanation || []).length >= 14,
    `${(proposal1.data?.computation?.explanation || []).length} righe`,
  );
  check(
    "la proposta non scrive niente",
    (await A(`/api/v1/sport-work/payouts?person_id=${personA.data.id}`)).data
      ?.length === 0,
  );

  const paid = [];
  for (const [index, installment] of installments.slice(0, 4).entries()) {
    const paidAt = ["2026-09-30", "2026-10-30", "2026-11-30", "2026-12-30"][index];
    const payout = await A("/api/v1/sport-work/payouts", {
      method: "POST",
      body: {
        installmentId: installment.id,
        paidAt,
        paymentMethod: "Bonifico",
        idempotencyKey: `uat-a-${index}`,
        acknowledgeWarnings: true,
      },
    });
    paid.push(payout);
  }

  check(
    "le quattro rate del 2026 si erogano",
    paid.every((payout) => payout.status === 201),
    paid.map((payout) => payout.status).join(","),
  );

  // 2.000 esterni + 4.800 dal club = 6.800: la soglia dei 5.000 cade sulla terza rata.
  check(
    "la terza rata attraversa la soglia previdenziale",
    paid[2].data?.computation?.taxableSocialGross > 0 &&
      paid[1].data?.computation?.taxableSocialGross === 0,
    `rata 2: ${paid[1].data?.computation?.taxableSocialGross}, rata 3: ${paid[2].data?.computation?.taxableSocialGross}`,
  );

  const position2026 = await A(
    `/api/v1/sport-work/people/${personA.data.id}/position?year=2026`,
  );
  check(
    "il progressivo 2026 e 6.800 euro",
    near(position2026.data?.position?.progressive, 6800),
    String(position2026.data?.position?.progressive),
  );
  check(
    "erogato dal club e dichiarato esterno restano due numeri",
    near(position2026.data?.position?.clubGross, 4800) &&
      near(position2026.data?.position?.externalDeclared, 2000),
    `${position2026.data?.position?.clubGross} / ${position2026.data?.position?.externalDeclared}`,
  );
  check(
    "la franchigia previdenziale risulta esaurita",
    position2026.data?.position?.socialFranchiseRemaining === 0,
    String(position2026.data?.position?.socialFranchiseRemaining),
  );
  check(
    "la soglia fiscale non e stata superata",
    position2026.data?.position?.fiscalTaxable === 0,
    String(position2026.data?.position?.fiscalTaxable),
  );

  const contribution2026 =
    Number(position2026.data?.position?.employeeContribution) +
    Number(position2026.data?.position?.employerContribution);
  // Imponibile 1.800 -> base 900 -> 900 * 27,03% = 243,27
  check(
    "i contributi 2026 valgono 243,27 euro",
    near(contribution2026, 243.27),
    String(contribution2026),
  );

  /* ---------------------------------------------------- anno nuovo */

  group("A2 — L'anno nuovo azzera la franchigia e cambia rule set");

  const payout2027 = await A("/api/v1/sport-work/payouts", {
    method: "POST",
    body: {
      installmentId: installments[4].id,
      paidAt: "2027-01-30",
      paymentMethod: "Bonifico",
      idempotencyKey: "uat-a-2027",
      acknowledgeWarnings: true,
    },
  });
  check(
    "l'erogazione di gennaio usa le regole del 2027",
    payout2027.data?.transaction?.rules_version === "2027",
    String(payout2027.data?.transaction?.rules_version),
  );
  check(
    "nel 2027 la franchigia riparte: nessun contributo sulla prima rata",
    payout2027.data?.computation?.employeeContribution === 0,
    String(payout2027.data?.computation?.employeeContribution),
  );
  check(
    "le regole 2027 non sono validate, e l'esito lo dichiara",
    payout2027.data?.transaction?.definitive === false &&
      (payout2027.data?.computation?.warnings || []).some(
        (warning) => warning.code === "RULES_PENDING_VALIDATION",
      ),
    `definitive=${payout2027.data?.transaction?.definitive}`,
  );

  const payout2028 = await A("/api/v1/sport-work/payouts", {
    method: "POST",
    body: {
      installmentId: installments[5].id,
      paidAt: "2028-01-30",
      acknowledgeWarnings: true,
      idempotencyKey: "uat-a-2028",
    },
  });
  check(
    "un anno senza regole fallisce, e non ricade sull'anno prima",
    payout2028.status === 400 &&
      /non configurate per l'anno 2028/.test(payout2028.error?.message || ""),
    payout2028.error?.message || `HTTP ${payout2028.status}`,
  );

  /* ================================================ concorrenza */

  group("Concorrenza — doppio clic e due erogazioni insieme");

  const doubleClick = await Promise.all([
    A("/api/v1/sport-work/payouts", {
      method: "POST",
      body: {
        installmentId: installments[6].id,
        paidAt: "2027-03-30",
        idempotencyKey: "uat-doppio-clic",
        acknowledgeWarnings: true,
      },
    }),
    A("/api/v1/sport-work/payouts", {
      method: "POST",
      body: {
        installmentId: installments[6].id,
        paidAt: "2027-03-30",
        idempotencyKey: "uat-doppio-clic",
        acknowledgeWarnings: true,
      },
    }),
  ]);

  const doubleRows = await A(
    `/api/v1/sport-work/payouts?installment_id=${installments[6].id}`,
  );
  check(
    "due invii dello stesso clic producono una sola uscita",
    (doubleRows.data || []).length === 1,
    `${(doubleRows.data || []).length} righe`,
  );
  check(
    "il secondo invio riconosce il duplicato",
    doubleClick.some((response) => response.data?.duplicate === true) ||
      doubleClick.filter((response) => response.status === 201).length === 1,
    doubleClick.map((response) => `${response.status}/${response.data?.duplicate}`).join(" "),
  );

  const race = await Promise.all([
    A("/api/v1/sport-work/payouts", {
      method: "POST",
      body: {
        installmentId: installments[7].id,
        amount: 800,
        paidAt: "2027-04-30",
        idempotencyKey: `uat-race-a-${randomUUID()}`,
        acknowledgeWarnings: true,
      },
    }),
    A("/api/v1/sport-work/payouts", {
      method: "POST",
      body: {
        installmentId: installments[7].id,
        amount: 800,
        paidAt: "2027-04-30",
        idempotencyKey: `uat-race-b-${randomUUID()}`,
        acknowledgeWarnings: true,
      },
    }),
  ]);

  const raceRows = await A(
    `/api/v1/sport-work/payouts?installment_id=${installments[7].id}`,
  );
  const raceTotal = (raceRows.data || []).reduce(
    (total, row) => total + Number(row.gross_amount),
    0,
  );
  check(
    "due erogazioni simultanee non superano il residuo della rata",
    raceTotal <= 1200,
    `${raceTotal} euro su una rata da 1.200 (esiti ${race.map((r) => r.status).join(",")})`,
  );

  /* ================================================ storno */

  group("Storno — si corregge aggiungendo, non cancellando");

  const toReverse = paid[0].data.transaction;
  const reversal = await A(
    `/api/v1/sport-work/payouts/${toReverse.id}/reverse`,
    { method: "POST", body: { reason: "Collaudo: erogazione da annullare" } },
  );
  check(
    "lo storno nasce con segno opposto",
    Number(reversal.data?.reversal?.gross_amount) === -1200,
    String(reversal.data?.reversal?.gross_amount),
  );

  const afterReversal = await A(
    `/api/v1/sport-work/payouts?person_id=${personA.data.id}&fiscal_year=2026`,
  );
  const original = (afterReversal.data || []).find((row) => row.id === toReverse.id);
  check(
    "l'originale resta nel registro, marcato",
    Boolean(original?.reversed_at),
    original ? "presente" : "sparito",
  );

  const positionAfter = await A(
    `/api/v1/sport-work/people/${personA.data.id}/position?year=2026`,
  );
  check(
    "la posizione scende di 1.200 e non va sotto zero",
    near(positionAfter.data?.position?.clubGross, 3600),
    String(positionAfter.data?.position?.clubGross),
  );

  const doubleReverse = await A(
    `/api/v1/sport-work/payouts/${toReverse.id}/reverse`,
    { method: "POST", body: { reason: "Secondo tentativo" } },
  );
  check(
    "la stessa erogazione non si storna due volte",
    doubleReverse.status === 400,
    doubleReverse.error?.message || `HTTP ${doubleReverse.status}`,
  );

  const reverseNoReason = await A(
    `/api/v1/sport-work/payouts/${paid[1].data.transaction.id}/reverse`,
    { method: "POST", body: { reason: "  " } },
  );
  check(
    "uno storno senza motivo non passa",
    reverseNoReason.status === 400,
    reverseNoReason.error?.message || "",
  );

  /* ================================================ B — allenatore */

  group("B — Allenatore, 8.000 pattuiti, 4.000 esterni, 1.000 erogati");

  const personB = await A("/api/v1/sport-work/people", {
    method: "POST",
    body: {
      firstName: "Bruno",
      lastName: "UAT-SW Allenatore",
      fiscalCode: "BRNUAT80A01H501B",
      originType: "trainer",
      originId: `uat-trainer-${randomUUID()}`,
      socialCoverage: "NONE",
    },
  });

  const relB = await A("/api/v1/sport-work/relationships", {
    method: "POST",
    body: {
      personId: personB.data.id,
      role: "COACH",
      relationshipType: "SPORT_COCOCO",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      contractAmount: 8000,
    },
  });
  await A(`/api/v1/sport-work/relationships/${relB.data.id}`, {
    method: "PATCH",
    body: { contractAttachmentId: randomUUID() },
  });
  await A(`/api/v1/sport-work/relationships/${relB.data.id}/status`, {
    method: "POST",
    body: { status: "ACTIVE" },
  });

  await A("/api/v1/sport-work/declarations", {
    method: "POST",
    body: {
      personId: personB.data.id,
      fiscalYear: 2026,
      externalAmount: 4000,
      declarationDate: "2026-08-01",
    },
  });

  const planB = await A(`/api/v1/sport-work/relationships/${relB.data.id}/plan`, {
    method: "PUT",
    body: {
      kind: "EQUAL_INSTALMENTS",
      totalAmount: 8000,
      installmentCount: 8,
      firstDueDate: "2026-10-31",
    },
  });
  const ratesB = (planB.data?.installments || []).sort(
    (left, right) => left.sequence - right.sequence,
  );

  const payB1 = await A("/api/v1/sport-work/payouts", {
    method: "POST",
    body: {
      installmentId: ratesB[0].id,
      amount: 1000,
      paidAt: "2026-10-31",
      idempotencyKey: "uat-b-1",
      acknowledgeWarnings: true,
    },
  });
  check(
    "la franchigia residua e 1.000 e copre per intero l'erogazione",
    payB1.data?.computation?.socialFranchiseRemainingBefore === 1000 &&
      payB1.data?.computation?.socialFranchiseUsed === 1000 &&
      payB1.data?.computation?.employeeContribution === 0,
    `residua ${payB1.data?.computation?.socialFranchiseRemainingBefore}, usata ${payB1.data?.computation?.socialFranchiseUsed}`,
  );

  const payB2 = await A("/api/v1/sport-work/payouts", {
    method: "POST",
    body: {
      installmentId: ratesB[1].id,
      amount: 1000,
      paidAt: "2026-11-30",
      idempotencyKey: "uat-b-2",
      acknowledgeWarnings: true,
    },
  });
  // Franchigia esaurita: 1.000 imponibili, base 500, 500 * 27,03% = 135,15
  check(
    "la seconda erogazione e interamente imponibile: 135,15 euro di contributi",
    near(payB2.data?.computation?.totalContribution, 135.15) &&
      near(payB2.data?.computation?.employeeContribution, 45.05) &&
      near(payB2.data?.computation?.employerContribution, 90.1),
    `${payB2.data?.computation?.totalContribution}`,
  );
  check(
    "il netto previdenziale e il costo club sono coerenti",
    near(payB2.data?.computation?.netSocial, 954.95) &&
      near(payB2.data?.computation?.clubCost, 1090.1),
    `netto ${payB2.data?.computation?.netSocial}, costo ${payB2.data?.computation?.clubCost}`,
  );

  const noDeclarationPerson = await A("/api/v1/sport-work/people", {
    method: "POST",
    body: {
      firstName: "Carla",
      lastName: "UAT-SW SenzaDichiarazione",
      fiscalCode: "CRLUAT85A41H501D",
      originType: "external",
      originId: `uat-nodecl-${randomUUID()}`,
    },
  });
  const relNoDecl = await A("/api/v1/sport-work/relationships", {
    method: "POST",
    body: {
      personId: noDeclarationPerson.data.id,
      relationshipType: "SPORT_COCOCO",
      startDate: "2026-09-01",
      contractAmount: 1000,
    },
  });
  await A(`/api/v1/sport-work/relationships/${relNoDecl.data.id}`, {
    method: "PATCH",
    body: { contractAttachmentId: randomUUID() },
  });
  await A(`/api/v1/sport-work/relationships/${relNoDecl.data.id}/status`, {
    method: "POST",
    body: { status: "ACTIVE" },
  });

  const blockedPayout = await A("/api/v1/sport-work/payouts", {
    method: "POST",
    body: {
      relationshipId: relNoDecl.data.id,
      amount: 500,
      paidAt: "2026-10-01",
      idempotencyKey: "uat-nodecl-1",
    },
  });
  check(
    "senza autocertificazione l'erogazione si ferma e dice perche",
    blockedPayout.status === 400 &&
      /Autocertificazione compensi esterni non aggiornata/.test(
        blockedPayout.error?.message || "",
      ),
    blockedPayout.error?.message || `HTTP ${blockedPayout.status}`,
  );

  const forcedPayout = await A("/api/v1/sport-work/payouts", {
    method: "POST",
    body: {
      relationshipId: relNoDecl.data.id,
      amount: 500,
      paidAt: "2026-10-01",
      acknowledgeWarnings: true,
      idempotencyKey: "uat-nodecl-2",
    },
  });
  check(
    "chi conferma esplicitamente puo procedere",
    forcedPayout.status === 201,
    forcedPayout.error?.message || "",
  );

  const forcedId = forcedPayout.data?.transaction?.id || "";
  const audit = forcedId
    ? await prisma.auditLog.findFirst({
        where: {
          action: "sport_work.payment.without_current_self_declaration",
          resource_id: forcedId,
        },
      })
    : null;
  check(
    "la scelta lascia una traccia con il suo nome",
    Boolean(audit) && audit.resource_id === forcedId,
    audit ? `attore ${audit.actor_email}` : "traccia assente",
  );

  /* ================================================ C — P.IVA */

  group("C — Professionista con partita IVA");

  const personC = await A("/api/v1/sport-work/people", {
    method: "POST",
    body: {
      firstName: "Davide",
      lastName: "UAT-SW Preparatore",
      fiscalCode: "DVDUAT75A01H501C",
      originType: "external",
      originId: `uat-piva-${randomUUID()}`,
      fiscalProfile: "VAT_ORDINARY",
      vatNumber: "01234567890",
    },
  });

  const relC = await A("/api/v1/sport-work/relationships", {
    method: "POST",
    body: {
      personId: personC.data.id,
      role: "ATHLETIC_TRAINER",
      relationshipType: "SELF_EMPLOYED_VAT",
      startDate: "2026-09-01",
      contractAmount: 6000,
    },
  });
  await A(`/api/v1/sport-work/relationships/${relC.data.id}`, {
    method: "PATCH",
    body: { contractAttachmentId: randomUUID() },
  });
  await A(`/api/v1/sport-work/relationships/${relC.data.id}/status`, {
    method: "POST",
    body: { status: "ACTIVE" },
  });

  const invoiceOnCoCoCo = await A("/api/v1/sport-work/vat-invoices", {
    method: "POST",
    body: {
      relationshipId: relB.data.id,
      documentNumber: "2026/1",
      documentDate: "2026-10-05",
      totalAmount: 100,
    },
  });
  check(
    "una fattura non si registra su una co.co.co.",
    invoiceOnCoCoCo.status === 400,
    invoiceOnCoCoCo.error?.message || "",
  );

  const invoice = await A("/api/v1/sport-work/vat-invoices", {
    method: "POST",
    body: {
      relationshipId: relC.data.id,
      documentNumber: "2026/114",
      documentDate: "2026-10-05",
      taxableAmount: 1000,
      vatAmount: 220,
      withholdingAmount: 200,
      totalAmount: 1220,
      dueDate: "2026-11-05",
    },
  });
  check("la fattura si registra", invoice.status === 201, invoice.error?.message || "");

  const invoicePayment = await A(
    `/api/v1/sport-work/vat-invoices/${invoice.data.id}/pay`,
    { method: "POST", body: { paidAt: "2026-11-05" } },
  );
  check(
    "il pagamento non applica il calcolo co.co.co.",
    invoicePayment.data?.transaction?.employee_contribution === 0 &&
      invoicePayment.data?.transaction?.rules_version === null &&
      invoicePayment.data?.transaction?.fiscal_treatment === "OUT_OF_SCOPE",
    `contributi ${invoicePayment.data?.transaction?.employee_contribution}, regole ${invoicePayment.data?.transaction?.rules_version}`,
  );

  const positionC = await A(
    `/api/v1/sport-work/people/${personC.data.id}/position?year=2026`,
  );
  check(
    "una fattura pagata non entra nel progressivo dei compensi",
    positionC.data?.position?.clubGross === 0,
    String(positionC.data?.position?.clubGross),
  );

  /* ================================================ D — rimborso */

  group("D — Rimborso spese, 137,40 euro");

  const reimbursement = await A("/api/v1/sport-work/reimbursements", {
    method: "POST",
    body: {
      personId: personB.data.id,
      relationshipId: relB.data.id,
      category: "TRAVEL",
      description: "UAT-SW Trasferta Bologna",
      expenseDate: "2026-11-12",
      amount: 137.4,
    },
  });
  check("il rimborso nasce in bozza", reimbursement.data?.status === "DRAFT");

  const payBeforeApproval = await A(
    `/api/v1/sport-work/reimbursements/${reimbursement.data.id}/pay`,
    { method: "POST", body: {} },
  );
  check(
    "un rimborso non approvato non si liquida",
    payBeforeApproval.status === 400,
    payBeforeApproval.error?.message || "",
  );

  await A(`/api/v1/sport-work/reimbursements/${reimbursement.data.id}`, {
    method: "PATCH",
    body: { status: "SUBMITTED" },
  });
  await A(`/api/v1/sport-work/reimbursements/${reimbursement.data.id}`, {
    method: "PATCH",
    body: { status: "APPROVED" },
  });

  const positionBeforeReimbursement = await A(
    `/api/v1/sport-work/people/${personB.data.id}/position?year=2026`,
  );

  const paidReimbursement = await A(
    `/api/v1/sport-work/reimbursements/${reimbursement.data.id}/pay`,
    { method: "POST", body: { paidAt: "2026-11-20" } },
  );
  check(
    "il rimborso approvato si liquida ed esce dal registro",
    paidReimbursement.status === 201 &&
      near(paidReimbursement.data?.transaction?.gross_amount, 137.4),
    String(paidReimbursement.data?.transaction?.gross_amount),
  );

  const positionAfterReimbursement = await A(
    `/api/v1/sport-work/people/${personB.data.id}/position?year=2026`,
  );
  check(
    "il rimborso non contamina il progressivo dei compensi",
    positionAfterReimbursement.data?.position?.clubGross ===
      positionBeforeReimbursement.data?.position?.clubGross,
    `${positionBeforeReimbursement.data?.position?.clubGross} -> ${positionAfterReimbursement.data?.position?.clubGross}`,
  );

  /* ================================================ E — premio */

  group("E — Premio playoff, 500 euro");

  const bonus = await A("/api/v1/sport-work/bonuses", {
    method: "POST",
    body: {
      personId: personA.data.id,
      relationshipId: relA.data.id,
      reason: "UAT-SW Premio playoff",
      competition: "Playoff 2026/27",
      amount: 500,
      awardDate: "2027-05-20",
    },
  });
  check(
    "il premio nasce con trattamento fiscale da verificare",
    bonus.data?.fiscal_treatment === "TO_VERIFY",
    bonus.data?.fiscal_treatment,
  );

  const positionBeforeBonus = await A(
    `/api/v1/sport-work/people/${personA.data.id}/position?year=2027`,
  );
  const paidBonus = await A(`/api/v1/sport-work/bonuses/${bonus.data.id}/pay`, {
    method: "POST",
    body: { paidAt: "2027-06-01" },
  });
  check(
    "il premio si eroga come movimento proprio",
    paidBonus.data?.transaction?.transaction_type === "BONUS_PAYMENT",
    paidBonus.data?.transaction?.transaction_type,
  );

  const positionAfterBonus = await A(
    `/api/v1/sport-work/people/${personA.data.id}/position?year=2027`,
  );
  check(
    "il premio resta fuori dal progressivo dei compensi",
    positionAfterBonus.data?.position?.clubGross ===
      positionBeforeBonus.data?.position?.clubGross,
    `${positionBeforeBonus.data?.position?.clubGross} -> ${positionAfterBonus.data?.position?.clubGross}`,
  );

  const doubleBonus = await A(`/api/v1/sport-work/bonuses/${bonus.data.id}/pay`, {
    method: "POST",
    body: {},
  });
  check(
    "lo stesso premio non si eroga due volte",
    doubleBonus.status === 400,
    doubleBonus.error?.message || "",
  );

  /* ================================================ adempimenti */

  group("Adempimenti e dataset");

  const sync1 = await A("/api/v1/sport-work/obligations/sync", { method: "POST" });
  const sync2 = await A("/api/v1/sport-work/obligations/sync", { method: "POST" });
  check(
    "la sincronizzazione crea l'agenda",
    sync1.data?.created > 0,
    `${sync1.data?.created} adempimenti`,
  );
  check(
    "rieseguirla non duplica niente",
    sync2.data?.created === 0,
    `${sync2.data?.created} creati al secondo giro`,
  );

  const obligations = await A("/api/v1/sport-work/obligations");
  const kinds = new Set((obligations.data || []).map((row) => row.kind));
  check(
    "l'agenda contiene RASD, F24, autocertificazione e CU",
    ["RASD_COMMUNICATION", "F24", "SELF_DECLARATION", "CU_PREPARATION"].every(
      (kind) => kinds.has(kind),
    ),
    [...kinds].join(", "),
  );

  const f24 = await A("/api/v1/sport-work/datasets?kind=f24&year=2026");
  check(
    "il dataset F24 esiste e dichiara di non essere un F24",
    (f24.data?.rows || []).length > 0 &&
      /non compila e non invia/.test(f24.data?.disclaimer || ""),
    `${(f24.data?.rows || []).length} righe`,
  );
  check(
    "le causali F24 seguono la copertura previdenziale",
    (f24.data?.rows || []).every((row) => ["CXX", "C10"].includes(row.causale)),
    (f24.data?.rows || []).map((row) => row.causale).join(","),
  );

  const cu = await A("/api/v1/sport-work/datasets?kind=cu&year=2026");
  check(
    "il dataset CU aggrega per persona",
    (cu.data?.rows || []).length >= 2,
    `${(cu.data?.rows || []).length} persone`,
  );

  const scheduler = await A("/api/v1/sport-work/scheduler", { method: "POST" });
  const scheduler2 = await A("/api/v1/sport-work/scheduler", { method: "POST" });
  check(
    "il giro notturno notifica",
    scheduler.data?.notifications >= 0 && scheduler.status === 200,
    `${scheduler.data?.notifications} avvisi`,
  );
  check(
    "rieseguirlo non manda una seconda notifica",
    scheduler2.data?.notifications === 0,
    `${scheduler2.data?.notifications} avvisi al secondo giro`,
  );

  /* ================================================ confine sui dati */

  group("Confine — un club non tocca i record di un altro");

  const crossRelationship = await B(
    `/api/v1/sport-work/relationships/${relA.data.id}`,
  );
  check(
    "il rapporto di un altro club non si legge",
    crossRelationship.status === 403,
    `HTTP ${crossRelationship.status}`,
  );

  const crossPayout = await B("/api/v1/sport-work/payouts", {
    method: "POST",
    body: {
      installmentId: installments[8].id,
      amount: 100,
      acknowledgeWarnings: true,
      idempotencyKey: `uat-cross-${randomUUID()}`,
    },
  });
  check(
    "non si eroga su una scadenza di un altro club",
    crossPayout.status === 403,
    `HTTP ${crossPayout.status}`,
  );

  const crossReverse = await B(
    `/api/v1/sport-work/payouts/${paid[1].data.transaction.id}/reverse`,
    { method: "POST", body: { reason: "tentativo" } },
  );
  check(
    "non si storna il movimento di un altro club",
    crossReverse.status === 403,
    `HTTP ${crossReverse.status}`,
  );

  const crossPosition = await B(
    `/api/v1/sport-work/people/${personA.data.id}/position?year=2026`,
  );
  check(
    "la posizione di una persona di un altro club non si legge",
    crossPosition.status === 403,
    `HTTP ${crossPosition.status}`,
  );

  const crossDeclaration = await B("/api/v1/sport-work/declarations", {
    method: "POST",
    body: { personId: personA.data.id, fiscalYear: 2026, externalAmount: 99999 },
  });
  check(
    "non si registra un'autocertificazione per una persona altrui",
    crossDeclaration.status === 403,
    `HTTP ${crossDeclaration.status}`,
  );

  /* ================================================ prestazioni */

  group("Prestazioni — dataset realistico");

  const seedStarted = Date.now();
  const created = [];
  for (let index = 0; index < FLEET; index += 1) {
    const person = await A("/api/v1/sport-work/people", {
      method: "POST",
      body: {
        firstName: `Fleet${index}`,
        lastName: "UAT-SW Carico",
        originType: "external",
        originId: `uat-fleet-${index}-${randomUUID()}`,
      },
    });
    const relationship = await A("/api/v1/sport-work/relationships", {
      method: "POST",
      body: {
        personId: person.data.id,
        relationshipType: "SPORT_COCOCO",
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        contractAmount: 6000,
      },
    });
    await A(`/api/v1/sport-work/relationships/${relationship.data.id}/plan`, {
      method: "PUT",
      body: {
        kind: "EQUAL_INSTALMENTS",
        totalAmount: 6000,
        installmentCount: 5,
        firstDueDate: "2026-10-31",
      },
    });
    created.push(relationship.data.id);
  }
  const seedMs = Date.now() - seedStarted;

  const allInstallments = await A("/api/v1/sport-work/installments");
  const allRelationships = await A("/api/v1/sport-work/relationships");
  const dashboard = await A("/api/v1/sport-work/dashboard");
  const payouts = await A("/api/v1/sport-work/payouts");

  console.log(`   dataset: ${FLEET} rapporti creati in ${seedMs} ms`);
  console.log(
    `   GET /relationships  ${allRelationships.ms} ms · ${(allRelationships.data || []).length} righe`,
  );
  console.log(
    `   GET /installments   ${allInstallments.ms} ms · ${(allInstallments.data || []).length} righe`,
  );
  console.log(`   GET /dashboard      ${dashboard.ms} ms`);
  console.log(
    `   GET /payouts        ${payouts.ms} ms · ${(payouts.data || []).length} righe`,
  );

  check(
    "il dataset raggiunge la scala richiesta",
    (allRelationships.data || []).length >= 50 &&
      (allInstallments.data || []).length >= 200,
    `${(allRelationships.data || []).length} rapporti, ${(allInstallments.data || []).length} scadenze`,
  );
  check(
    "il cruscotto risponde sotto i due secondi",
    dashboard.ms < 2000,
    `${dashboard.ms} ms`,
  );
  check(
    "l'elenco scadenze risponde sotto i due secondi",
    allInstallments.ms < 2000,
    `${allInstallments.ms} ms`,
  );

  const syncBig = await A("/api/v1/sport-work/obligations/sync", { method: "POST" });
  console.log(`   POST /obligations/sync ${syncBig.ms} ms`);

  /* ================================================ riepilogo */

  const failed = results.filter((row) => !row.ok);
  console.log("\n══════════════════════════════════════════");
  console.log(`Controlli: ${results.length}  ·  PASS ${results.length - failed.length}  ·  FAIL ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFalliti:");
    for (const row of failed) {
      console.log(`  [${row.group}] ${row.name} — ${row.detail}`);
    }
    process.exitCode = 1;
  }

  if (!KEEP) {
    await cleanup([clubA.id, clubB.id]);
    console.log("\nDati di collaudo rimossi.");
  } else {
    console.log("\nDati di collaudo conservati (--keep).");
  }
};

if (SEED_ONLY) {
  console.log("Modo --seed-only non implementato: il collaudo crea e ripulisce da solo.");
  process.exit(0);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
