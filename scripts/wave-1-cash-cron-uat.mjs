/**
 * Collaudo a runtime della **cassa** e delle **funzioni periodiche** (Wave 1).
 *
 * Copre gli scenari 9-11 (la cassa), 13 e 36 (i giri automatici) e 14-17
 * (multi-tenant) del §10 di `docs/knowledge-base/31-wave-1-planning.md`.
 *
 *     node scripts/wave-1-cash-cron-uat.mjs --base=http://127.0.0.1:3010
 *
 * **Perche non bastano i test.** Sulla cassa i test di unita costruiscono le
 * righe a mano; qui le righe le scrive il **servizio incassi vero**, passando
 * dalle stesse rotte del browser, e le due formule — quella di `/reports` e
 * quella di `/movements` — leggono cio che il database contiene davvero. Sui
 * giri automatici, un cron che gira a vuoto non prova niente: il dataset QA e
 * costruito perche i promemoria vengano **generati**, e la seconda esecuzione
 * deve produrne zero.
 *
 * **Scrive**: un club QA per la cassa, uno per i certificati, uno per il
 * confine multi-tenant. Si rifiuta di partire se `EASYGAME_DB_ENV` non e
 * `development`. Tutto porta il prefisso `UAT-WC` e viene distrutto alla fine.
 *
 * Per gli scenari dei cron serve che il server sia stato avviato con
 * `CRON_SECRET` e `EASYGAME_MAINTENANCE_TOKEN` in ambiente: se mancano, quei
 * controlli vengono dichiarati SALTATI, non finti verdi.
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { aggregateClubPayments, summarizeClubMovements } from "../src/lib/club-financial-summary.ts";
import {
  calculatePaymentReport,
  isAthletePaymentMovement,
} from "../src/lib/club-report-utils.ts";

const args = process.argv.slice(2);
const BASE =
  (args.find((arg) => arg.startsWith("--base=")) || "").split("=")[1] ||
  "http://127.0.0.1:3010";
const KEEP = args.includes("--keep");
const CRON_SECRET = String(process.env.CRON_SECRET || "uat-cron-secret");

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
if (DB_ENV !== "development") {
  console.error(
    `Rifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}", non "development".`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const results = [];
let currentGroup = "";

const group = (name) => {
  currentGroup = name;
  console.log(`\n── ${name}`);
};

const check = (name, condition, detail = "") => {
  const ok = Boolean(condition);
  results.push({ group: currentGroup, name, ok, skipped: false, detail });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
};

const skip = (name, why) => {
  results.push({ group: currentGroup, name, ok: true, skipped: true, detail: why });
  console.log(`   SKIP  ${name} — ${why}`);
};

const measures = [];
const measure = (name, ms, detail = "") => {
  measures.push({ name, ms, detail });
  console.log(`   ····  ${name}: ${ms} ms${detail ? ` — ${detail}` : ""}`);
};

const euro = (value) => Math.round(Number(value) * 100) / 100;

const call = async (token, path, options = {}) => {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `easygame_session=${token}` } : {}),
      ...(options.clubId ? { "x-active-club-id": options.clubId } : {}),
      ...(options.role ? { "x-active-access-role": options.role } : {}),
      ...(options.headers || {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  return {
    status: response.status,
    data: payload?.data,
    error: payload?.error,
    ms: Date.now() - started,
  };
};

const createSession = async (userId) => {
  const token = `uat-wc-${randomUUID()}`;
  await prisma.session.create({
    data: {
      token,
      user_id: userId,
      expires_at: new Date(Date.now() + 6 * 3600_000),
    },
  });
  return token;
};

const makeClub = async (label) => {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const user = await prisma.user.create({
    data: {
      email: `uat-wc-${label}-${stamp}@easygame.test`,
      password_hash: "uat-wc-non-una-password",
      first_name: "UAT-WC",
      last_name: label.toUpperCase(),
    },
  });
  const club = await prisma.club.create({
    data: {
      name: `UAT-WC Club ${label} ${stamp}`,
      slug: `uat-wc-club-${label}-${stamp}`,
      creator_id: user.id,
      settings: {},
    },
  });
  await prisma.organizationUser.create({
    data: { organization_id: club.id, user_id: user.id, role: "owner" },
  });
  return { club, user };
};

const cleanup = async (clubIds) => {
  for (const clubId of clubIds) {
    if (!clubId) continue;
    await prisma.paymentTransaction.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.receipt.deleteMany({ where: { organization_id: clubId } });
    await prisma.athletePayment.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.medicalCertificate.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.notification.deleteMany({ where: { organization_id: clubId } });
    await prisma.athleteCategoryMembership.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.athlete.deleteMany({ where: { organization_id: clubId } });
    await prisma.clubResourceItem.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.auditLog.deleteMany({ where: { organization_id: clubId } });
    await prisma.organizationUser.deleteMany({
      where: { organization_id: clubId },
    });
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { creator_id: true },
    });
    await prisma.club.delete({ where: { id: clubId } }).catch(() => {});
    if (club?.creator_id) {
      await prisma.session.deleteMany({ where: { user_id: club.creator_id } });
      await prisma.user.delete({ where: { id: club.creator_id } }).catch(() => {});
    }
  }
  await prisma.user.deleteMany({
    where: { email: { startsWith: "uat-wc-" } },
  });
  await prisma.session.deleteMany({ where: { token: { startsWith: "uat-wc-" } } });
};

/** Le due letture del denaro, sulle **stesse** righe. */
const dueLetture = (payments) => {
  const movimenti = aggregateClubPayments({ payments });
  const report = calculatePaymentReport(movimenti);
  const cassa = summarizeClubMovements(movimenti.filter(isAthletePaymentMovement));
  return { report, cassa };
};

const run = async () => {
  const residui = await prisma.club.findMany({
    where: { name: { startsWith: "UAT-WC Club" } },
    select: { id: true },
  });
  if (residui.length) {
    console.log(`Rimuovo ${residui.length} club QA di un giro precedente`);
    await cleanup(residui.map((row) => row.id));
  }

  const clubPreesistenti = await prisma.club.count();

  const { club: clubA, user: ownerA } = await makeClub("cassa");
  const { club: clubB } = await makeClub("confine");
  const { club: clubC, user: ownerC } = await makeClub("cert");

  const clubsQA = [clubA.id, clubB.id, clubC.id];
  const tokenA = await createSession(ownerA.id);
  const tokenC = await createSession(ownerC.id);
  const A = (path, options = {}) =>
    call(tokenA, path, { clubId: clubA.id, role: "owner", ...options });

  console.log(`Collaudo su ${BASE}`);
  console.log(`Club cassa: ${clubA.name} (${clubA.id})`);

  /* ================================================= la cassa */

  group("A — La cassa: Report e Movimenti sullo stesso denaro");

  const vuoto = dueLetture([]);
  check(
    "un club senza incassi dice zero da entrambe le parti, e non NaN",
    vuoto.report.totalPaid === 0 &&
      vuoto.cassa.totalIncome === 0 &&
      Number.isFinite(vuoto.report.totalPaid) &&
      Number.isFinite(vuoto.report.totalDue) &&
      vuoto.report.hasPayments === false,
    `report ${vuoto.report.totalPaid}, movimenti ${vuoto.cassa.totalIncome}`,
  );

  const atleta = await prisma.athlete.create({
    data: {
      organization_id: clubA.id,
      first_name: "Nicolò",
      last_name: "UAT-WC D'Angelo",
      status: "active",
    },
  });

  const rata = await prisma.athletePayment.create({
    data: {
      organization_id: clubA.id,
      athlete_id: atleta.id,
      description: "UAT-WC Quota annuale - Rata 1",
      amount: 130,
      due_date: new Date("2026-09-30T00:00:00.000Z"),
      status: "pending",
      data: { installmentId: "uat-wc-rata-1", installmentLabel: "Rata 1" },
    },
  });

  const incasso1 = await A("/api/v1/payment-transactions", {
    method: "POST",
    body: {
      paymentId: rata.id,
      athleteId: atleta.id,
      amount: 50,
      paidAt: "2026-09-01",
      paymentMethod: "cash",
    },
  });
  const incasso2 = await A("/api/v1/payment-transactions", {
    method: "POST",
    body: {
      paymentId: rata.id,
      athleteId: atleta.id,
      amount: 30,
      paidAt: "2026-09-05",
      paymentMethod: "card",
    },
  });
  check(
    "i due incassi si registrano dalle rotte vere",
    incasso1.status === 201 && incasso2.status === 201,
    `HTTP ${incasso1.status}/${incasso2.status} ${incasso1.error?.message || incasso2.error?.message || ""}`,
  );

  const leggiRate = async () => {
    const rows = await prisma.athletePayment.findMany({
      where: { organization_id: clubA.id },
    });
    // Le stesse righe che l'API restituisce al browser, con la fotografia
    // `data.ledger` scritta dal servizio incassi.
    return rows.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      athlete_id: row.athlete_id,
      description: row.description,
      amount: row.amount,
      due_date: row.due_date?.toISOString() || null,
      paid_at: row.paid_at?.toISOString() || null,
      status: row.status,
      method: row.method,
      data: row.data,
    }));
  };

  const dopoIncassi = dueLetture(await leggiRate());
  check(
    "lo scenario 9: 130 dovuti, 50 in contanti e 30 con carta → 80,00 incassati",
    euro(dopoIncassi.report.totalPaid) === 80,
    `report ${euro(dopoIncassi.report.totalPaid)}`,
  );
  check(
    "Report e Movimenti dicono lo stesso incassato",
    euro(dopoIncassi.report.totalPaid) === euro(dopoIncassi.cassa.totalIncome),
    `report ${euro(dopoIncassi.report.totalPaid)} · movimenti ${euro(dopoIncassi.cassa.totalIncome)}`,
  );
  check(
    "il residuo e 50,00 da entrambe le parti",
    euro(dopoIncassi.report.totalPending + dopoIncassi.report.totalOverdue) === 50 &&
      euro(dopoIncassi.cassa.totalPendingIncome) === 50,
    `report ${euro(dopoIncassi.report.totalPending + dopoIncassi.report.totalOverdue)} · movimenti ${euro(dopoIncassi.cassa.totalPendingIncome)}`,
  );
  check(
    "la rata incassata a meta e contata come parziale, non come «in attesa» per intero",
    dopoIncassi.report.partialCount === 1 && dopoIncassi.report.paidCount === 0,
    `parziali ${dopoIncassi.report.partialCount}, saldate ${dopoIncassi.report.paidCount}`,
  );

  // Lo storno passa dalla sua rotta: non si cancella una riga, si registra il
  // movimento che la compensa (ADR-0036).
  const daStornareId = incasso2.data?.transaction?.id;
  const storno = await A(
    `/api/v1/payment-transactions/${encodeURIComponent(daStornareId || "")}`,
    {
      method: "POST",
      body: { action: "reverse", reason: "UAT-WC storno" },
    },
  );
  check(
    "lo storno si registra dalla sua rotta",
    storno.status === 200 || storno.status === 201,
    `HTTP ${storno.status}: ${storno.error?.message || ""}`,
  );

  const dopoStorno = dueLetture(await leggiRate());
  check(
    "lo scenario 10: stornati i 30, restano 50,00 incassati e 80,00 di residuo",
    euro(dopoStorno.report.totalPaid) === 50 &&
      euro(dopoStorno.report.totalPending + dopoStorno.report.totalOverdue) === 80,
    `incassato ${euro(dopoStorno.report.totalPaid)}, residuo ${euro(dopoStorno.report.totalPending + dopoStorno.report.totalOverdue)}; storno HTTP ${storno.status}`,
  );
  check(
    "anche dopo lo storno le due pagine chiudono sullo stesso numero",
    euro(dopoStorno.report.totalPaid) === euro(dopoStorno.cassa.totalIncome),
    `report ${euro(dopoStorno.report.totalPaid)} · movimenti ${euro(dopoStorno.cassa.totalIncome)}`,
  );

  // Piu rate e piu stati sulla stessa lettura.
  await prisma.athletePayment.createMany({
    data: [
      {
        organization_id: clubA.id,
        athlete_id: atleta.id,
        description: "UAT-WC Quota annuale - Rata 2",
        amount: 45,
        due_date: new Date("2020-01-31T00:00:00.000Z"),
        status: "pending",
        data: { installmentId: "uat-wc-rata-2" },
      },
      {
        organization_id: clubA.id,
        athlete_id: atleta.id,
        description: "UAT-WC Quota annuale - Rata 3",
        amount: 300,
        status: "cancelled",
        data: { installmentId: "uat-wc-rata-3" },
      },
      {
        organization_id: clubA.id,
        athlete_id: atleta.id,
        description: "UAT-WC Quota vecchia",
        amount: 20,
        status: "paid",
        paid_at: new Date("2025-10-01T00:00:00.000Z"),
        data: { installmentId: "uat-wc-rata-4" },
      },
    ],
  });

  const misto = dueLetture(await leggiRate());
  check(
    "con non pagato, parziale, saldato, stornato e annullato le due letture coincidono",
    euro(misto.report.totalPaid) === euro(misto.cassa.totalIncome) &&
      euro(misto.report.totalPending + misto.report.totalOverdue) ===
        euro(misto.cassa.totalPendingIncome),
    `incassato ${euro(misto.report.totalPaid)}/${euro(misto.cassa.totalIncome)} · residuo ${euro(misto.report.totalPending + misto.report.totalOverdue)}/${euro(misto.cassa.totalPendingIncome)}`,
  );
  check(
    "la rata annullata non entra nel dovuto",
    euro(misto.report.totalDue) === 195,
    `dovuto ${euro(misto.report.totalDue)} (130 + 45 + 20, la annullata da 300 esclusa)`,
  );
  check(
    "la rata scaduta porta al «Scaduto» il residuo, non l'importo intero",
    euro(misto.report.totalOverdue) === 45,
    `scaduto ${euro(misto.report.totalOverdue)}`,
  );

  /* ================================================= confine di club */

  group("B — Il confine fra due organizzazioni");

  const altrui = await A(`/api/v1/payment-transactions?organization_id=${clubB.id}`);
  check(
    "chiedere gli incassi di un altro club non li restituisce",
    altrui.status === 403 ||
      (Array.isArray(altrui.data) ? altrui.data.length === 0 : true),
    `HTTP ${altrui.status}`,
  );

  const righeDiB = await prisma.athletePayment.count({
    where: { organization_id: clubB.id },
  });
  check("nessuna riga economica e finita nel club B", righeDiB === 0, `${righeDiB}`);

  /* ================================================= funzioni periodiche */

  group("C — I giri automatici: girano, e la seconda volta non duplicano");

  const senzaBearer = await call(null, "/api/medical-certificate-reminders");
  check(
    "la porta cron dei certificati senza segreto non esegue",
    senzaBearer.status === 401 || senzaBearer.status === 503,
    `HTTP ${senzaBearer.status}`,
  );

  const bearerSbagliato = await call(null, "/api/medical-certificate-reminders", {
    headers: { authorization: "Bearer sbagliato" },
  });
  check(
    "un Bearer sbagliato non esegue",
    bearerSbagliato.status === 401 || bearerSbagliato.status === 503,
    `HTTP ${bearerSbagliato.status}`,
  );

  const sondaCron = await call(null, "/api/medical-certificate-reminders", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });

  if (sondaCron.status === 503) {
    skip(
      "il giro dei certificati genera promemoria",
      "CRON_SECRET non configurato sul server: riavvialo con la variabile per provare i cron",
    );
    skip("la seconda esecuzione non duplica", "come sopra");
  } else if (sondaCron.status !== 200) {
    check(
      "la porta cron dei certificati risponde",
      false,
      `HTTP ${sondaCron.status}: ${sondaCron.error?.message || ""}`,
    );
  } else {
    // Dataset QA che fa davvero scattare i promemoria: un tutore con account
    // collegato, e due atleti con certificato scaduto.
    const tutore = await prisma.user.create({
      data: {
        email: `uat-wc-tutore-${Date.now().toString(36)}@easygame.test`,
        password_hash: "uat-wc-non-una-password",
        first_name: "UAT-WC",
        last_name: "Tutore",
      },
    });
    await prisma.organizationUser.create({
      data: { organization_id: clubC.id, user_id: tutore.id, role: "parent" },
    });

    const scaduti = [];
    for (const nome of ["Uno", "Due"]) {
      const figlio = await prisma.athlete.create({
        data: {
          organization_id: clubC.id,
          first_name: nome,
          last_name: "UAT-WC Figlio",
          status: "active",
          data: {
            guardians: [
              {
                firstName: "UAT-WC",
                lastName: "Tutore",
                email: tutore.email,
                linkedUserId: tutore.id,
                relationship: "padre",
              },
            ],
          },
        },
      });
      await prisma.medicalCertificate.create({
        data: {
          organization_id: clubC.id,
          athlete_id: figlio.id,
          type: "agonistico",
          expiry_date: new Date("2025-01-31T00:00:00.000Z"),
          status: "expired",
        },
      });
      scaduti.push(figlio.id);
    }

    const primoGiro = await call(null, "/api/medical-certificate-reminders", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    measure("giro dei certificati su tutti i club", primoGiro.ms);

    const dopoPrimo = await prisma.notification.count({
      where: {
        organization_id: clubC.id,
        type: "medical_certificate_reminder",
      },
    });
    check(
      "il giro genera davvero i promemoria sul dataset QA",
      primoGiro.status === 200 && dopoPrimo > 0,
      `HTTP ${primoGiro.status}, ${dopoPrimo} notifiche`,
    );

    const secondoGiro = await call(null, "/api/medical-certificate-reminders", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const dopoSecondo = await prisma.notification.count({
      where: {
        organization_id: clubC.id,
        type: "medical_certificate_reminder",
      },
    });
    check(
      "la seconda esecuzione non manda un secondo promemoria",
      secondoGiro.status === 200 && dopoSecondo === dopoPrimo,
      `${dopoPrimo} → ${dopoSecondo}`,
    );

    const notificheAltrove = await prisma.notification.count({
      where: {
        organization_id: { not: clubC.id },
        type: "medical_certificate_reminder",
        created_at: { gte: new Date(Date.now() - 10 * 60_000) },
      },
    });
    check(
      "il promemoria di un club non raggiunge un altro club",
      notificheAltrove === 0,
      `${notificheAltrove}`,
    );

    const tracce = await prisma.auditLog.count({
      where: {
        organization_id: clubC.id,
        action: "medical_certificate_reminder.run",
      },
    });
    check("il giro lascia una traccia in audit", tracce > 0, `${tracce}`);
  }

  const allenamentiSenzaSegreto = await call(null, "/api/v1/training-automation", {
    headers: { authorization: "Bearer sbagliato" },
  });
  check(
    "la porta cron degli allenamenti rifiuta un Bearer sbagliato",
    allenamentiSenzaSegreto.status === 401 || allenamentiSenzaSegreto.status === 503,
    `HTTP ${allenamentiSenzaSegreto.status}`,
  );

  const manutenzioneSenzaSegreto = await call(null, "/api/v1/maintenance", {
    headers: { authorization: "Bearer sbagliato" },
  });
  check(
    "la porta cron della manutenzione rifiuta un Bearer sbagliato, e non cancella niente",
    manutenzioneSenzaSegreto.status === 401 ||
      manutenzioneSenzaSegreto.status === 503,
    `HTTP ${manutenzioneSenzaSegreto.status}`,
  );

  const manutenzione = await call(null, "/api/v1/maintenance", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  if (manutenzione.status === 503) {
    skip("la manutenzione gira da cron", "CRON_SECRET non configurato sul server");
  } else {
    check(
      "la manutenzione gira da cron e riporta i suoi passi",
      manutenzione.status === 200 && Array.isArray(manutenzione.data?.steps),
      `HTTP ${manutenzione.status}, ${manutenzione.data?.steps?.length || 0} passi, ${manutenzione.data?.failed ?? "?"} falliti`,
    );
    measure("manutenzione periodica", manutenzione.ms);
  }

  /*
    Il giro degli allenamenti su un dataset che lo fa **davvero** generare: un
    cron che gira a vuoto non prova niente. Il club QA ha una categoria, un
    allenatore, un impianto e una riga di programma settimanale nel giorno di
    oggi, con l'automazione dovuta.
  */
  const { club: clubT, user: ownerT } = await makeClub("allenamenti");
  clubsQA.push(clubT.id);
  const tokenT = await createSession(ownerT.id);
  const T = (path, options = {}) =>
    call(tokenT, path, { clubId: clubT.id, role: "owner", ...options });

  const oggi = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][new Date().getDay()];

  const categoriaT = await T("/api/v1/categories", {
    method: "POST",
    body: { name: "UAT-WC Under 15" },
  });
  const allenatoreT = await T("/api/v1/trainers", {
    method: "POST",
    body: { name: "UAT-WC Allenatore", email: "uat-wc.allenatore@easygame.test" },
  });
  const impiantoT = await T("/api/v1/club_sites", {
    method: "POST",
    body: { name: "UAT-WC Palestra", city: "Bologna" },
  });
  const programmaT = await T("/api/v1/weekly_schedule", {
    method: "POST",
    body: {
      day: oggi,
      startTime: "18:00",
      endTime: "19:30",
      categoryId: categoriaT.data?.id,
      trainerIds: [allenatoreT.data?.id],
      locationId: impiantoT.data?.id,
      location: "UAT-WC Palestra",
    },
  });
  check(
    "il dataset QA degli allenamenti e completo",
    Boolean(categoriaT.data?.id && allenatoreT.data?.id && programmaT.data?.id),
    `categoria ${categoriaT.status}, allenatore ${allenatoreT.status}, programma ${programmaT.status}`,
  );

  const impostazioniDovute = {
    enabled: true,
    frequency: "weekly",
    day: oggi,
    time: "00:01",
    generateDaysAhead: 21,
    lastRunAt: null,
  };
  const armaAutomazione = async () => {
    const club = await prisma.club.findUnique({
      where: { id: clubT.id },
      select: { settings: true },
    });
    await prisma.club.update({
      where: { id: clubT.id },
      data: {
        settings: {
          ...(club?.settings || {}),
          trainingAutomation: impostazioniDovute,
        },
      },
    });
  };

  await armaAutomazione();

  const allenamenti = await call(null, "/api/v1/training-automation", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  if (allenamenti.status === 503) {
    skip("il giro degli allenamenti genera allenamenti", "CRON_SECRET non configurato");
    skip("rieseguirlo non duplica un allenamento", "come sopra");
  } else {
    measure("giro degli allenamenti su tutti i club", allenamenti.ms);
    const contaAllenamenti = async () => {
      const row = await prisma.club.findUnique({
        where: { id: clubT.id },
        select: { trainings: true },
      });
      return Array.isArray(row?.trainings) ? row.trainings.length : 0;
    };
    const generatiPrimo = await contaAllenamenti();
    check(
      "il giro genera davvero gli allenamenti sul dataset QA",
      allenamenti.status === 200 && generatiPrimo > 0,
      `HTTP ${allenamenti.status}, ${generatiPrimo} allenamenti; esito club QA: ${JSON.stringify((allenamenti.data?.results || []).find((row) => row.clubId === clubT.id) || null)}`,
    );

    // Si riarma l'automazione, altrimenti il secondo giro non sarebbe nemmeno
    // dovuto e proverebbe la finestra oraria invece della deduplica.
    await armaAutomazione();
    const secondo = await call(null, "/api/v1/training-automation", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const generatiSecondo = await contaAllenamenti();
    check(
      "rieseguirlo non duplica un allenamento",
      secondo.status === 200 && generatiSecondo === generatiPrimo,
      `${generatiPrimo} → ${generatiSecondo}`,
    );
  }

  /* ================================================= pulizia */

  if (!KEEP) {
    group("D — Pulizia");
    await cleanup(clubsQA);
    const residuiFinali = await prisma.club.count();
    check(
      "il database di sviluppo torna al numero di club di partenza",
      residuiFinali === clubPreesistenti,
      `${residuiFinali} (partenza ${clubPreesistenti})`,
    );
    const notificheResidue = await prisma.notification.count({
      where: { type: "medical_certificate_reminder" },
    });
    check(
      "nessuna notifica QA residua",
      notificheResidue === 0,
      `${notificheResidue}`,
    );
  }

  const failed = results.filter((row) => !row.ok);
  const skipped = results.filter((row) => row.skipped);
  console.log(
    `\n${results.length - failed.length - skipped.length}/${results.length - skipped.length} controlli superati` +
      (skipped.length ? `, ${skipped.length} saltati` : ""),
  );
  if (measures.length) {
    console.log("\nMisure:");
    for (const row of measures) {
      console.log(`  ${row.name}: ${row.ms} ms${row.detail ? ` (${row.detail})` : ""}`);
    }
  }
  if (failed.length) {
    console.log("\nFalliti:");
    for (const row of failed) {
      console.log(`  [${row.group}] ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
    }
  }

  return failed.length;
};

run()
  .then(async (failed) => {
    await prisma.$disconnect();
    process.exit(failed ? 1 : 0);
  })
  .catch(async (error) => {
    console.error("\nCollaudo interrotto:", error);
    await prisma.$disconnect();
    process.exit(2);
  });
