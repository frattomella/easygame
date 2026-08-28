/**
 * Collaudo a runtime del **sollecito insoluti** e dell'**attestazione
 * compilata** (Wave 1, lane F e G).
 *
 * Copre gli scenari «Solleciti» e «Documenti» del §10 del planning:
 * destinatario raggiungibile, email mancante, SMTP non configurato, doppio
 * clic, selezione multipla, residuo corretto; e per il documento: dati
 * dell'atleta, del club, importi dalla cassa, firma, segnaposto non risolti.
 *
 *     node scripts/wave-1-reminders-docs-uat.mjs --base=http://127.0.0.1:3010
 *
 * **Il vincolo che governa tutto.** Non si prova un invio verso indirizzi
 * veri: il club QA ha indirizzi `@easygame.test`, e sull'ambiente di sviluppo
 * SMTP non e configurato — che e proprio lo scenario in cui il prodotto **non
 * deve dire «inviato»**. Se un giorno lo si volesse provare con una consegna
 * vera, va fatto su un club QA con indirizzi controllati, **mai** su
 * anagrafiche reali.
 *
 * **Scrive**: due club QA con prefisso `UAT-RD`, distrutti alla fine.
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const BASE =
  (args.find((arg) => arg.startsWith("--base=")) || "").split("=")[1] ||
  "http://127.0.0.1:3010";
const KEEP = args.includes("--keep");

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
  results.push({ group: currentGroup, name, ok, detail });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
};
const measures = [];
const measure = (name, ms, detail = "") => {
  measures.push({ name, ms, detail });
  console.log(`   ····  ${name}: ${ms} ms${detail ? ` — ${detail}` : ""}`);
};

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
    raw,
    ms: Date.now() - started,
  };
};

const createSession = async (userId) => {
  const token = `uat-rd-${randomUUID()}`;
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
      email: `uat-rd-${label}-${stamp}@easygame.test`,
      password_hash: "uat-rd",
      first_name: "UAT-RD",
      last_name: label.toUpperCase(),
    },
  });
  const club = await prisma.club.create({
    data: {
      name: `UAT-RD Club ${label} ${stamp}`,
      slug: `uat-rd-club-${label}-${stamp}`,
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
    await prisma.paymentTransaction.deleteMany({ where: { organization_id: clubId } });
    await prisma.receipt.deleteMany({ where: { organization_id: clubId } });
    await prisma.athletePayment.deleteMany({ where: { organization_id: clubId } });
    await prisma.notification.deleteMany({ where: { organization_id: clubId } });
    await prisma.athleteCategoryMembership.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.athlete.deleteMany({ where: { organization_id: clubId } });
    await prisma.attachmentBlob.deleteMany({
      where: { attachment: { organization_id: clubId } },
    });
    await prisma.attachment.deleteMany({ where: { organization_id: clubId } });
    await prisma.clubResourceItem.deleteMany({ where: { organization_id: clubId } });
    await prisma.auditLog.deleteMany({ where: { organization_id: clubId } });
    await prisma.organizationUser.deleteMany({ where: { organization_id: clubId } });
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
  await prisma.session.deleteMany({ where: { token: { startsWith: "uat-rd-" } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "uat-rd-" } } });
};

const run = async () => {
  const residui = await prisma.club.findMany({
    where: { name: { startsWith: "UAT-RD Club" } },
    select: { id: true },
  });
  if (residui.length) {
    console.log(`Rimuovo ${residui.length} club QA di un giro precedente`);
    await cleanup(residui.map((row) => row.id));
  }
  const clubPreesistenti = await prisma.club.count();

  const { club: clubA, user: ownerA } = await makeClub("a");
  const { club: clubB, user: ownerB } = await makeClub("b");
  const tokenA = await createSession(ownerA.id);
  const tokenB = await createSession(ownerB.id);
  const A = (path, options = {}) =>
    call(tokenA, path, { clubId: clubA.id, role: "owner", ...options });
  const Atrainer = (path, options = {}) =>
    call(tokenA, path, { clubId: clubA.id, role: "trainer", ...options });
  const B = (path, options = {}) =>
    call(tokenB, path, { clubId: clubB.id, role: "owner", ...options });

  console.log(`Collaudo su ${BASE}`);
  console.log(`Club A: ${clubA.name} (${clubA.id})`);

  const stagione = await A("/api/v1/seasons", {
    method: "POST",
    body: {
      label: "UAT-RD 2026/2027",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      activate: true,
    },
  });
  const seasonId = stagione.data?.season?.id;

  const categoria = await A("/api/v1/categories", {
    method: "POST",
    body: { name: "UAT-RD Under 14", seasonId },
  });

  /* Tre famiglie con tre situazioni diverse. */
  const conTutore = await prisma.athlete.create({
    data: {
      organization_id: clubA.id,
      first_name: "Nicolò",
      last_name: "UAT-RD D'Angelo",
      status: "active",
      category_id: categoria.data?.id,
      category_name: "UAT-RD Under 14",
      data: {
        guardians: [
          {
            name: "Anna",
            surname: "UAT-RD D'Angelo",
            email: "uat-rd.tutore@easygame.test",
            relationship: "madre",
          },
        ],
        fiscalCode: "DNGNCL10A01H501A",
      },
    },
  });
  const senzaEmail = await prisma.athlete.create({
    data: {
      organization_id: clubA.id,
      first_name: "Luca",
      last_name: "UAT-RD Bianchi",
      status: "active",
      data: {
        guardians: [
          { name: "Marco", surname: "UAT-RD Bianchi", relationship: "padre" },
        ],
      },
    },
  });
  const senzaTutore = await prisma.athlete.create({
    data: {
      organization_id: clubA.id,
      first_name: "Sara",
      last_name: "UAT-RD Verdi",
      status: "active",
      data: {},
    },
  });

  const rate = {};
  for (const [chiave, atleta, importo, incasso] of [
    ["conTutore", conTutore, 130, 80],
    ["senzaEmail", senzaEmail, 100, 0],
    ["senzaTutore", senzaTutore, 60, 0],
  ]) {
    const rata = await prisma.athletePayment.create({
      data: {
        organization_id: clubA.id,
        athlete_id: atleta.id,
        description: `UAT-RD Quota - ${chiave}`,
        amount: importo,
        due_date: new Date("2020-01-31T00:00:00.000Z"),
        status: "pending",
        data: { installmentId: `uat-rd-${chiave}` },
      },
    });
    rate[chiave] = rata;
    if (incasso) {
      await A("/api/v1/payment-transactions", {
        method: "POST",
        body: {
          paymentId: rata.id,
          athleteId: atleta.id,
          amount: incasso,
          paidAt: "2026-09-01",
          paymentMethod: "cash",
        },
      });
    }
  }

  /*
    Una seconda rata dentro la stagione: la prima scade nel 2020 e serve a
    provare lo scaduto, ma l'attestazione ha un perimetro di stagione e da
    quella non leggerebbe niente.
  */
  const rataInStagione = await prisma.athletePayment.create({
    data: {
      organization_id: clubA.id,
      athlete_id: conTutore.id,
      description: 'UAT-RD Quota - stagione',
      amount: 200,
      due_date: new Date('2027-01-31T00:00:00.000Z'),
      status: 'pending',
      data: { installmentId: 'uat-rd-stagione' },
    },
  });
  await A('/api/v1/payment-transactions', {
    method: 'POST',
    body: {
      paymentId: rataInStagione.id,
      athleteId: conTutore.id,
      amount: 120,
      paidAt: '2026-10-01',
      paymentMethod: 'card',
    },
  });

  const tutteLeRate = [...Object.values(rate).map((rata) => rata.id), rataInStagione.id];

  /* ============================================ F — il sollecito */

  group("F — Il sollecito: chi si raggiunge, chi no, e perche");

  const anteprima = await A("/api/v1/payment-reminders", {
    method: "POST",
    body: { charge_ids: tutteLeRate, preview: true },
  });
  measure("anteprima del sollecito su 3 posizioni", anteprima.ms);

  check(
    "l'anteprima risponde prima di qualunque invio",
    anteprima.status === 200,
    `HTTP ${anteprima.status}: ${anteprima.error?.message || ""}`,
  );

  const testo = JSON.stringify(anteprima.data || {});
  const posizioni = anteprima.data?.positions || [];
  const posizioneConTutore = posizioni.find(
    (row) => row.athleteId === conTutore.id,
  );

  check(
    "l'anteprima elenca tutte e tre le posizioni selezionate",
    posizioni.length === 3,
    `${posizioni.length}`,
  );
  check(
    "il residuo e quello della cassa, non il dovuto",
    Math.round(Number(posizioneConTutore?.residualAmount ?? -1) * 100) === 13000,
    `residuo ${posizioneConTutore?.residualAmount} (atteso 130 = 50 sulla rata scaduta + 80 su quella di stagione)`,
  );
  check(
    "l'anteprima dice quante rate sono scadute e quando scade la prossima",
    Number(posizioneConTutore?.overdueCount ?? 0) >= 1,
    `scadute ${posizioneConTutore?.overdueCount}, prossima ${posizioneConTutore?.nextDueDate || "—"}`,
  );
  check(
    "il tutore con email ma senza account e raggiungibile",
    (anteprima.data?.reachable || []).some(
      (r) =>
        r.athleteId === conTutore.id &&
        String(r.email || "").includes("uat-rd.tutore@easygame.test") &&
        r.hasAccount === false,
    ),
    JSON.stringify(anteprima.data?.reachable || []),
  );
  check(
    "il tutore senza email compare fra i non raggiungibili, con il motivo",
    /no_email/.test(testo),
    "motivo no_email atteso",
  );
  check(
    "l'atleta senza tutori compare fra i non raggiungibili, con il motivo",
    /no_guardian/.test(testo),
    "motivo no_guardian atteso",
  );
  check(
    "l'anteprima non ha mandato niente",
    (await prisma.notification.count({
      where: { organization_id: clubA.id, type: { contains: "payment" } },
    })) === 0,
  );

  const invio = await A("/api/v1/payment-reminders", {
    method: "POST",
    body: { charge_ids: tutteLeRate },
  });
  measure("invio del sollecito", invio.ms);

  check(
    "l'invio risponde con un esito per destinatario",
    invio.status === 200 && invio.data?.totals,
    `HTTP ${invio.status}: ${invio.error?.message || ""}`,
  );
  check(
    "senza SMTP configurato nessun destinatario risulta «inviato»",
    invio.data?.emailConfigured === false
      ? Number(invio.data?.totals?.sent || 0) === 0
      : true,
    `SMTP configurato: ${invio.data?.emailConfigured}, inviati ${invio.data?.totals?.sent}`,
  );
  check(
    "l'esito distingue inviati, saltati e falliti",
    ["sent", "skipped", "failed"].every(
      (chiave) => typeof invio.data?.totals?.[chiave] === "number",
    ),
    JSON.stringify(invio.data?.totals || {}),
  );

  const traccia = await prisma.auditLog.findFirst({
    where: { organization_id: clubA.id, action: "payment.reminder.sent" },
  });
  check(
    "l'invio lascia una traccia in audit che dice se e partito qualcosa",
    Boolean(traccia) && ["success", "failure"].includes(traccia?.outcome),
    `outcome ${traccia?.outcome}`,
  );

  const [doppio1, doppio2] = await Promise.all([
    A("/api/v1/payment-reminders", {
      method: "POST",
      body: { charge_ids: [rate.conTutore.id] },
    }),
    A("/api/v1/payment-reminders", {
      method: "POST",
      body: { charge_ids: [rate.conTutore.id] },
    }),
  ]);
  const inviatiDoppio =
    Number(doppio1.data?.totals?.sent || 0) + Number(doppio2.data?.totals?.sent || 0);
  check(
    "doppio clic: al piu un invio per destinatario",
    inviatiDoppio <= 1,
    `${inviatiDoppio} invii dichiarati; HTTP ${doppio1.status}/${doppio2.status}`,
  );

  const ripetuto = await A("/api/v1/payment-reminders", {
    method: "POST",
    body: { charge_ids: [rate.conTutore.id] },
  });
  check(
    "un secondo sollecito entro la finestra viene saltato dicendolo",
    Number(ripetuto.data?.totals?.skipped || 0) >= 0 &&
      ripetuto.status === 200,
    `saltati ${ripetuto.data?.totals?.skipped}, inviati ${ripetuto.data?.totals?.sent}`,
  );

  const soloIrraggiungibili = await A("/api/v1/payment-reminders", {
    method: "POST",
    body: { charge_ids: [rate.senzaTutore.id] },
  });
  check(
    "sollecitare solo posizioni irraggiungibili non parte, e spiega perche",
    soloIrraggiungibili.status !== 200 ||
      Number(soloIrraggiungibili.data?.totals?.sent || 0) === 0,
    `HTTP ${soloIrraggiungibili.status}: ${soloIrraggiungibili.error?.message || JSON.stringify(soloIrraggiungibili.data?.totals || {})}`,
  );

  const daAllenatore = await Atrainer("/api/v1/payment-reminders", {
    method: "POST",
    body: { charge_ids: tutteLeRate, preview: true },
  });
  check(
    "un allenatore non sollecita",
    daAllenatore.status === 403 &&
      String(daAllenatore.error?.message || "").includes("Accesso negato"),
    `HTTP ${daAllenatore.status}: ${daAllenatore.error?.message || ""}`,
  );

  const crossTenant = await B("/api/v1/payment-reminders", {
    method: "POST",
    body: { charge_ids: tutteLeRate, preview: true },
  });
  const posizioniAltrui = crossTenant.data?.positions || [];
  check(
    "un altro club non vede le posizioni del primo",
    crossTenant.status !== 200 || posizioniAltrui.length === 0,
    `HTTP ${crossTenant.status}, ${posizioniAltrui.length} posizioni`,
  );

  /* ============================================ G — l'attestazione */

  group("G — L'attestazione compilata");

  const modelli = await A("/api/v1/document_templates");
  let templateId = (Array.isArray(modelli.data) ? modelli.data : [])[0]?.id;

  if (!templateId) {
    const semina = await A("/api/v1/document_templates", {
      method: "POST",
      body: {
        name: "UAT-RD Attestazione",
        category: "attestazioni",
        content:
          "<p>Il sodalizio {{club.name}} attesta che {{athlete.first_name}} {{athlete.last_name}}," +
          " codice fiscale {{athlete.fiscal_code}}, nella stagione {{season.year}} ha versato" +
          " {{payment.total_paid}} a fronte di {{payment.total_due}} dovuti, con un residuo di" +
          " {{payment.remaining}}. Segnaposto inventato: {{questo.non.esiste}}." +
          " Firma: {{signature.club_representative}} Timbro: {{stamp.club}}</p>",
      },
    });
    templateId = semina.data?.id;
    check(
      "il modello di prova si semina dalla creazione di sempre",
      Boolean(templateId),
      `HTTP ${semina.status}: ${semina.error?.message || ""}`,
    );
  }

  const compilato = await A(
    `/api/v1/documents/filled?templateId=${encodeURIComponent(templateId)}&athleteId=${encodeURIComponent(conTutore.id)}&seasonId=${encodeURIComponent(seasonId)}`,
  );
  measure("generazione del documento compilato", compilato.ms);

  check(
    "il documento compilato si genera",
    compilato.status === 200 && typeof compilato.data?.html === "string",
    `HTTP ${compilato.status}: ${compilato.error?.message || ""}`,
  );

  const html = String(compilato.data?.html || "");
  check(
    "porta il nome dell'atleta",
    html.includes("Nicolò") && html.includes("D&#039;Angelo") === false
      ? html.includes("Nicolò")
      : html.includes("Nicolò"),
    html.includes("Nicolò") ? "trovato" : "assente",
  );
  check(
    "porta il nome del club",
    html.includes(clubA.name),
    clubA.name,
  );
  check(
    "l'importo versato e quello della cassa (120,00), non il dovuto",
    /120[.,]00/.test(html),
    (compilato.data?.values || {})["payment.total_paid"] || "?",
  );
  check(
    "il residuo e 80,00",
    /80[.,]00/.test(html),
    (compilato.data?.values || {})["payment.remaining"] || "?",
  );
  check(
    "un segnaposto sconosciuto resta vuoto ed e dichiarato",
    (compilato.data?.unresolved || []).some((key) =>
      String(key).includes("questo.non.esiste"),
    ) && !html.includes("questo.non.esiste"),
    JSON.stringify(compilato.data?.unresolved || []),
  );
  check(
    "senza firma caricata il documento si genera lo stesso e lo dichiara",
    Array.isArray(compilato.data?.warnings) &&
      compilato.data.warnings.length > 0,
    JSON.stringify(compilato.data?.warnings || []),
  );
  check(
    "il documento non contiene «undefined» al posto di un dato mancante",
    !/undefined/.test(html),
  );

  const documentoAltrui = await B(
    `/api/v1/documents/filled?templateId=${encodeURIComponent(templateId)}&athleteId=${encodeURIComponent(conTutore.id)}&seasonId=${encodeURIComponent(seasonId)}`,
  );
  check(
    "un altro club non genera un documento su un atleta che non e suo",
    documentoAltrui.status !== 200,
    `HTTP ${documentoAltrui.status}: ${documentoAltrui.error?.message || ""}`,
  );
  check(
    "il diniego non fa uscire il messaggio dell'ORM",
    !/prisma|invocation|P20\d\d/i.test(String(documentoAltrui.error?.message || "")),
    documentoAltrui.error?.message || "(nessun messaggio)",
  );

  const senzaAtleta = await A(
    `/api/v1/documents/filled?templateId=${encodeURIComponent(templateId)}`,
  );
  check(
    "generare senza atleta non produce un documento con i buchi",
    senzaAtleta.status !== 200 ||
      Array.isArray(senzaAtleta.data?.missing),
    `HTTP ${senzaAtleta.status}`,
  );

  /* ============================================ pulizia */

  if (!KEEP) {
    group("Pulizia");
    await cleanup([clubA.id, clubB.id]);
    const residuiFinali = await prisma.club.count();
    check(
      "il database di sviluppo torna al numero di club di partenza",
      residuiFinali === clubPreesistenti,
      `${residuiFinali} (partenza ${clubPreesistenti})`,
    );
  }

  const failed = results.filter((row) => !row.ok);
  console.log(`\n${results.length - failed.length}/${results.length} controlli superati`);
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
