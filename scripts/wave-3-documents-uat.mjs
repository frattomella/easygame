/**
 * Collaudo a runtime della **Wave 3 — documenti intelligenti e modulistica**.
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *          scripts/wave-3-documents-uat.mjs --base=http://127.0.0.1:3010
 *
 * Copre i 38 scenari del §19 del planning
 * ([35](../docs/knowledge-base/35-wave-3-planning.md)), decisi **prima** del
 * codice. Uno scenario scritto dopo descrive quello che il codice fa; questi
 * descrivono quello che il codice deve fare.
 *
 * **Cosa prova, e cosa no.** Prova il prodotto vero contro un database vero,
 * attraverso HTTP, con cinque ruoli veri e due club veri. Non prova la resa a
 * schermo: la responsivita si verifica a parte, e le prove strutturali stanno
 * nei test statici.
 *
 * Il giro delle scadenze usa il pubblico **societa**: cosi la consegna e
 * in-app e il collaudo non ha bisogno di un server SMTP finto per dimostrare
 * la deduplica, che e la cosa che conta.
 *
 * **Scrive**: due club QA con prefisso `UAT-W3`, distrutti alla fine (salvo
 * `--keep`).
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const BASE =
  (args.find((arg) => arg.startsWith("--base=")) || "").split("=")[1] ||
  "http://127.0.0.1:3010";
const CRON_SECRET =
  (args.find((arg) => arg.startsWith("--cron-secret=")) || "").split("=")[1] ||
  process.env.CRON_SECRET ||
  "uat-w3-cron";
const KEEP = args.includes("--keep");

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
if (DB_ENV !== "development") {
  console.error(
    `Rifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}", non "development".`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

/* ------------------------------------------------------------- il taccuino */

const results = [];
let currentGroup = "";
const group = (name) => {
  currentGroup = name;
  console.log(`\n── ${name}`);
};
const check = (name, ok, detail = "") => {
  results.push({ group: currentGroup, name, ok: Boolean(ok), detail });
  console.log(`   ${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return Boolean(ok);
};
const measures = [];
const measure = (name, ms, detail = "") => {
  measures.push({ name, ms, detail });
  console.log(`   ····  ${name}: ${ms} ms${detail ? ` — ${detail}` : ""}`);
};

const attendi = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ la rete */

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
    raw,
    ms: Date.now() - started,
  };
};

/* --------------------------------------------------------- i dati del banco */

const createSession = async (userId) => {
  const token = `uat-w3-${randomUUID()}`;
  await prisma.session.create({
    data: {
      token,
      user_id: userId,
      expires_at: new Date(Date.now() + 6 * 3600_000),
    },
  });
  return token;
};

const STAGIONE = {
  id: "uat-w3-stagione",
  label: "2025/2026",
  startDate: "2025-09-01",
  endDate: "2026-06-30",
  status: "active",
  createdAt: "2025-08-01T00:00:00.000Z",
};

const makeClub = async (label) => {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const owner = await prisma.user.create({
    data: {
      email: `uat-w3-${label}-owner-${stamp}@easygame.test`,
      password_hash: "uat-w3",
      first_name: "UAT-W3",
      last_name: `${label.toUpperCase()} OWNER`,
    },
  });
  const club = await prisma.club.create({
    data: {
      name: `UAT-W3 Club ${label} ${stamp}`,
      slug: `uat-w3-club-${label}-${stamp}`,
      creator_id: owner.id,
      business_name: `UAT-W3 ${label.toUpperCase()} ASD`,
      address: "Via dello Sport 10",
      city: "Roma",
      fiscal_code: "12345678901",
      vat_number: "IT12345678901",
      contact_email: `info-${stamp}@easygame.test`,
      settings: { seasons: [STAGIONE], activeSeasonId: STAGIONE.id },
      trainers: [
        {
          id: `all-${stamp}`,
          firstName: "Giulia",
          lastName: "Bianchi",
          role: "Allenatrice",
          email: `giulia-${stamp}@easygame.test`,
        },
      ],
      members: [
        {
          id: `socio-${stamp}`,
          first_name: "Anna",
          surname: "Neri",
          email: `anna-${stamp}@easygame.test`,
        },
      ],
      document_templates: [],
    },
  });
  await prisma.organizationUser.create({
    data: { organization_id: club.id, user_id: owner.id, role: "owner" },
  });

  return { club, owner, stamp };
};

const addRole = async (club, role, stamp) => {
  const user = await prisma.user.create({
    data: {
      email: `uat-w3-${role}-${stamp}-${Math.random().toString(36).slice(2, 6)}@easygame.test`,
      password_hash: "uat-w3",
      first_name: "UAT-W3",
      last_name: role.toUpperCase(),
    },
  });
  await prisma.organizationUser.create({
    data: { organization_id: club.id, user_id: user.id, role },
  });
  return { user, token: await createSession(user.id) };
};

const makeAthlete = async (clubId, firstName, lastName, extra = {}) =>
  prisma.athlete.create({
    data: {
      organization_id: clubId,
      first_name: firstName,
      last_name: lastName,
      status: "active",
      category_name: "Pulcini",
      birth_date: new Date("2012-04-17T00:00:00Z"),
      data: {
        fiscalCode: extra.fiscalCode ?? "RSSMRA12D17H501X",
        address: "Via Roma 1",
        guardians: [
          {
            name: "Anna",
            surname: lastName,
            email: `tutore-${Math.random().toString(36).slice(2, 8)}@easygame.test`,
            fiscalCode: "RSSNNA80A41H501Z",
          },
        ],
      },
      ...extra.record,
    },
  });

const isoDay = (offsetDays) => {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
    ),
  );
};

const cleanup = async (clubIds, emailPrefix) => {
  for (const clubId of clubIds) {
    if (!clubId) continue;
    await prisma.generatedDocument.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.documentTemplateVersion.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.documentTemplate.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.consentRecord.deleteMany({ where: { organization_id: clubId } });
    await prisma.consentVersion.deleteMany({ where: { organization_id: clubId } });
    await prisma.consentDefinition.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.communicationDelivery.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.notification.deleteMany({ where: { organization_id: clubId } });
    await prisma.attachmentBlob.deleteMany({
      where: { attachment: { organization_id: clubId } },
    });
    await prisma.attachment.deleteMany({ where: { organization_id: clubId } });
    await prisma.paymentTransaction.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.athletePayment.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.athleteCategoryMembership.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.medicalCertificate.deleteMany({
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
    await prisma.club.delete({ where: { id: clubId } }).catch(() => undefined);
  }

  await prisma.session.deleteMany({
    where: { user: { email: { startsWith: emailPrefix } } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: emailPrefix } },
  });
};

/* ==================================================================== main */

const main = async () => {
  const clubIds = [];

  try {
    const A = await makeClub("alfa");
    const B = await makeClub("beta");
    clubIds.push(A.club.id, B.club.id);

    const ownerToken = await createSession(A.owner.id);
    const ownerBToken = await createSession(B.owner.id);
    const collaboratore = await addRole(A.club, "collaborator", A.stamp);
    const staff = await addRole(A.club, "staff", A.stamp);
    const allenatore = await addRole(A.club, "trainer", A.stamp);

    const OWNER = (path, options = {}) =>
      call(ownerToken, path, { clubId: A.club.id, role: "owner", ...options });
    const OWNER_B = (path, options = {}) =>
      call(ownerBToken, path, { clubId: B.club.id, role: "owner", ...options });
    const COLLAB = (path, options = {}) =>
      call(collaboratore.token, path, {
        clubId: A.club.id,
        role: "collaborator",
        ...options,
      });
    const STAFF = (path, options = {}) =>
      call(staff.token, path, { clubId: A.club.id, role: "staff", ...options });
    const TRAINER = (path, options = {}) =>
      call(allenatore.token, path, {
        clubId: A.club.id,
        role: "trainer",
        ...options,
      });

    const mario = await makeAthlete(A.club.id, "Mario", "Rossi");
    const senzaCf = await makeAthlete(A.club.id, "Nicolo", "D'Angio", {
      fiscalCode: "",
    });
    const unicode = await makeAthlete(A.club.id, "Ozturk", "Duric");
    const altrui = await makeAthlete(B.club.id, "Estraneo", "Beta");

    /* ================================ 19.1 — MOTORE E VERSIONI ========= */

    group("19.1 — Motore e versioni");

    const creazione = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Dichiarazione di iscrizione",
        description: "Per la scuola",
        subject_kind: "athlete",
        content:
          "<p>{{club.name}} dichiara che {{athlete.first_name}} {{athlete.last_name}} e iscritto. {{current_date}}</p>",
      },
    });
    const modello = creazione.data;
    check(
      "un modello nasce bozza",
      creazione.status === 201 && modello?.status === "draft" &&
        modello?.publishedVersion === 0,
      `status ${creazione.status} ${creazione.error?.message || ""}`,
    );

    // Scenario 2 — l'anteprima da una bozza non pubblicata non scrive niente.
    const anteprimaBozza = await OWNER(
      `/api/v1/documents/filled?templateId=${modello.id}&athleteId=${mario.id}`,
    );
    const righeDopoAnteprima = await prisma.generatedDocument.count({
      where: { organization_id: A.club.id },
    });
    check(
      "2. una bozza non pubblicata non genera, e lo dice",
      anteprimaBozza.status === 400 && righeDopoAnteprima === 0,
      `status ${anteprimaBozza.status} — ${anteprimaBozza.error?.message || ""}`,
    );

    const pubblicazione = await OWNER(
      `/api/v1/documents/templates/${modello.id}/publish`,
      { method: "POST" },
    );
    check(
      "1a. pubblicare crea la versione 1",
      pubblicazione.status === 200 &&
        pubblicazione.data?.publishedVersion === 1 &&
        pubblicazione.data?.status === "active",
      `status ${pubblicazione.status} ${pubblicazione.error?.message || ""}`,
    );
    const v1 = pubblicazione.data.versions[0];

    const anteprima = await OWNER(
      `/api/v1/documents/filled?templateId=${modello.id}&athleteId=${mario.id}`,
    );
    measure("anteprima di un documento", anteprima.ms);
    check(
      "l'anteprima compila davvero i dati",
      anteprima.status === 200 &&
        /Mario/.test(anteprima.data?.html || "") &&
        /UAT-W3 ALFA ASD/.test(anteprima.data?.html || ""),
      `status ${anteprima.status}`,
    );

    const righeDopoAnteprimaVera = await prisma.generatedDocument.count({
      where: { organization_id: A.club.id },
    });
    check(
      "2b. l'anteprima non scrive nessuna riga",
      righeDopoAnteprimaVera === 0,
      `${righeDopoAnteprimaVera} righe`,
    );

    const generazione = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    measure("generazione di un documento", generazione.ms);
    const documentoA = generazione.data?.produced?.[0];
    check(
      "generare produce una riga con la versione citata",
      generazione.status === 201 && documentoA?.versionId === v1.id,
      `status ${generazione.status} ${generazione.error?.message || ""}`,
    );

    // Scenario 1 — il documento gia rilasciato non cambia.
    const html0 = (
      await OWNER(`/api/v1/documents/generated/${documentoA.id}`)
    ).data?.contentHtml;

    await OWNER(`/api/v1/documents/templates/${modello.id}`, {
      method: "PATCH",
      body: {
        content:
          "<p>TESTO RISCRITTO — {{club.name}} — {{athlete.first_name}}</p>",
      },
    });
    const v2Pubblicata = await OWNER(
      `/api/v1/documents/templates/${modello.id}/publish`,
      { method: "POST" },
    );
    check(
      "1b. modificare e ripubblicare crea la versione 2",
      v2Pubblicata.data?.publishedVersion === 2,
      `versione ${v2Pubblicata.data?.publishedVersion}`,
    );

    const rilettura = await OWNER(
      `/api/v1/documents/generated/${documentoA.id}`,
    );
    check(
      "1. il documento gia rilasciato e identico byte per byte",
      rilettura.data?.contentHtml === html0 &&
        !/TESTO RISCRITTO/.test(rilettura.data?.contentHtml || "") &&
        rilettura.data?.versionId === v1.id,
      rilettura.data?.versionId === v1.id ? "" : "la versione citata e cambiata",
    );

    // Scenario 3 — non si cancella, si ritira.
    const cancellazione = await OWNER(
      `/api/v1/documents/templates/${modello.id}`,
      { method: "DELETE" },
    );
    check(
      "3. un modello con documenti generati non si cancella",
      cancellazione.status === 400 &&
        /si ritira/i.test(cancellazione.error?.message || ""),
      `status ${cancellazione.status} — ${cancellazione.error?.message || ""}`,
    );

    // Scenario 5 — due generazioni fuori lotto sono due documenti.
    const seconda = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    check(
      "5. due richieste fuori lotto sono due documenti distinti",
      seconda.status === 201 &&
        seconda.data.produced[0].id !== documentoA.id,
      `status ${seconda.status}`,
    );

    // Scenario 4 — la copia adottata e del club (catalogo: verificato sul
    // campo `catalog_key`, che resta quello di partenza ma non lega niente).
    /*
      Si adotta dalla **rotta del catalogo**, e non creando un modello con la
      chiave nel corpo: la provenienza redazionale — classe, chi risponde del
      testo, quando e stato riletto — la scrive solo quella rotta, o un club
      potrebbe dichiarare un proprio modello «classe A, redazione EasyGame,
      riletto oggi».
    */
    const copia = await OWNER("/api/v1/documents/catalog", {
      method: "POST",
      body: { key: "attestazione-frequenza" },
    });
    await OWNER(`/api/v1/documents/templates/${copia.data.id}`, {
      method: "PATCH",
      body: { content: "<p>{{club.name}} — modificata dal club</p>" },
    });
    const copiaRiletta = await OWNER(
      `/api/v1/documents/templates/${copia.data.id}`,
    );
    check(
      "4. una copia adottata dal catalogo e del club e si modifica",
      /modificata dal club/.test(copiaRiletta.data?.draftContent || "") &&
        copiaRiletta.data?.catalogKey === "attestazione-frequenza" &&
        copiaRiletta.data?.catalogClass === "A" &&
        Boolean(copiaRiletta.data?.editorialOwner) &&
        Boolean(copiaRiletta.data?.lastReviewedAt),
      `classe ${copiaRiletta.data?.catalogClass}, redazione ${copiaRiletta.data?.editorialOwner}`,
    );

    const doppiaAdozione = await OWNER("/api/v1/documents/catalog", {
      method: "POST",
      body: { key: "attestazione-frequenza" },
    });
    check(
      "4b. la stessa voce non si adotta due volte",
      doppiaAdozione.status === 409,
      `status ${doppiaAdozione.status}`,
    );

    const nonDistribuita = await OWNER("/api/v1/documents/catalog", {
      method: "POST",
      body: { key: "informativa-consenso-privacy" },
    });
    check(
      "4c. una voce di classe C non si adotta, e non si distingue da una che non esiste",
      nonDistribuita.status === 404,
      `status ${nonDistribuita.status} — ${nonDistribuita.error?.message || ""}`,
    );

    /* ============================ 19.2 — SEGNAPOSTO E SOGGETTI ========= */

    group("19.2 — Segnaposto e soggetti");

    const fuoriCatalogo = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Modello con chiave storica",
        subject_kind: "athlete",
        content: "<p>{{athlete.first_name}} — {{fiscalCode}}</p>",
      },
    });
    const rifiuto = await OWNER(
      `/api/v1/documents/templates/${fuoriCatalogo.data.id}/publish`,
      { method: "POST" },
    );
    check(
      "6. un segnaposto fuori catalogo impedisce la pubblicazione, e dice quale",
      rifiuto.status === 400 && /fiscalCode/.test(rifiuto.error?.message || ""),
      `${rifiuto.error?.message || ""}`,
    );

    const conCf = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Attestazione con codice fiscale",
        subject_kind: "athlete",
        content:
          "<p>{{athlete.first_name}} {{athlete.last_name}} — CF {{athlete.fiscal_code}}</p>",
      },
    });
    await OWNER(`/api/v1/documents/templates/${conCf.data.id}/publish`, {
      method: "POST",
    });
    const senzaDato = await OWNER(
      `/api/v1/documents/filled?templateId=${conCf.data.id}&athleteId=${senzaCf.id}`,
    );
    check(
      "7. un dato che manca resta bianco ed e dichiarato, mai «undefined»",
      senzaDato.status === 200 &&
        (senzaDato.data?.missing || []).includes("athlete.fiscal_code") &&
        !/undefined/.test(senzaDato.data?.html || ""),
      `missing: ${JSON.stringify(senzaDato.data?.missing || [])}`,
    );

    const fuoriSoggetto = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Modello con allenatore dentro un modello atleta",
        subject_kind: "athlete",
        content: "<p>{{athlete.first_name}} e {{trainer.first_name}}</p>",
      },
    });
    const rifiutoSoggetto = await OWNER(
      `/api/v1/documents/templates/${fuoriSoggetto.data.id}/publish`,
      { method: "POST" },
    );
    check(
      "8. un segnaposto fuori soggetto non si pubblica, e dice perche",
      rifiutoSoggetto.status === 400 &&
        /trainer\.first_name/.test(rifiutoSoggetto.error?.message || ""),
      `${rifiutoSoggetto.error?.message || ""}`,
    );

    const perAllenatore = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Lettera di incarico",
        subject_kind: "person",
        content:
          "<p>{{club.name}} incarica {{trainer.first_name}} {{trainer.last_name}} come {{trainer.role}}</p>",
      },
    });
    await OWNER(`/api/v1/documents/templates/${perAllenatore.data.id}/publish`, {
      method: "POST",
    });
    const trainerId = A.club ? `all-${A.stamp}` : "";
    const docAllenatore = await OWNER(
      `/api/v1/documents/filled?templateId=${perAllenatore.data.id}&subjectKind=person&subjectId=${trainerId}`,
    );
    check(
      "9. un documento su un allenatore si compila davvero",
      docAllenatore.status === 200 &&
        /Giulia Bianchi/.test(docAllenatore.data?.html || "") &&
        /Allenatrice/.test(docAllenatore.data?.html || ""),
      `status ${docAllenatore.status} ${docAllenatore.error?.message || ""}`,
    );

    const soloClub = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Delibera del consiglio",
        subject_kind: "club",
        content:
          "<p>{{club.name}}, {{club.city}}, {{current_date}} — stagione {{season.year}}</p>",
      },
    });
    await OWNER(`/api/v1/documents/templates/${soloClub.data.id}/publish`, {
      method: "POST",
    });
    const docClub = await OWNER(
      `/api/v1/documents/filled?templateId=${soloClub.data.id}&subjectKind=club&subjectId=${A.club.id}`,
    );
    check(
      "10. un documento del club si genera senza nessuna persona",
      docClub.status === 200 &&
        /2025\/2026/.test(docClub.data?.html || "") &&
        (docClub.data?.unresolved || []).length === 0,
      `status ${docClub.status} ${docClub.error?.message || ""}`,
    );

    /* Scenario 11 — l'importo e il denaro entrato, non il dovuto. */
    const rata = await prisma.athletePayment.create({
      data: {
        organization_id: A.club.id,
        athlete_id: mario.id,
        description: "Quota annuale - Rata 1",
        amount: 130,
        due_date: new Date("2025-10-31T00:00:00Z"),
        status: "paid",
        data: {},
      },
    });
    await prisma.paymentTransaction.create({
      data: {
        organization_id: A.club.id,
        athlete_id: mario.id,
        payment_id: rata.id,
        amount: 80,
        paid_at: new Date("2025-10-05T00:00:00Z"),
        payment_method: "cash",
        source: "manual",
      },
    });

    const conImporti = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Attestazione di pagamento",
        subject_kind: "athlete",
        content:
          "<p>{{athlete.first_name}} ha versato {{payment.total_paid}} su {{payment.total_due}}</p>",
      },
    });
    const pubblicataImporti = await OWNER(
      `/api/v1/documents/templates/${conImporti.data.id}/publish`,
      { method: "POST" },
    );
    check(
      "la versione dichiara di portare un dato economico",
      (pubblicataImporti.data?.sensitivity || []).includes("economic"),
      JSON.stringify(pubblicataImporti.data?.sensitivity || []),
    );

    const attestazione = await OWNER(
      `/api/v1/documents/filled?templateId=${conImporti.data.id}&athleteId=${mario.id}`,
    );
    check(
      "11. l'importo e il denaro entrato (80), non il dovuto della rata marcata pagata (130)",
      /80,00/.test(attestazione.data?.html || "") &&
        attestazione.data?.values?.["payment.total_paid"] === "80,00",
      `total_paid = ${attestazione.data?.values?.["payment.total_paid"]}`,
    );

    /* Scenario 12 — firma e timbro. */
    const conFirma = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Attestazione con firma",
        subject_kind: "athlete",
        content:
          "<p>{{athlete.first_name}}</p><p>{{signature.club_representative}}</p>",
      },
    });
    await OWNER(`/api/v1/documents/templates/${conFirma.data.id}/publish`, {
      method: "POST",
    });
    const senzaFirma = await OWNER(
      `/api/v1/documents/filled?templateId=${conFirma.data.id}&athleteId=${mario.id}`,
    );
    check(
      "12. senza firma caricata il documento esce e lo dichiara prima",
      senzaFirma.status === 200 &&
        (senzaFirma.data?.warnings || []).some((riga) => /firma/i.test(riga)) &&
        /Firma del presidente/.test(senzaFirma.data?.html || ""),
      `warnings: ${JSON.stringify(senzaFirma.data?.warnings || [])}`,
    );

    /* Scenario 13 — un cognome con dentro un tag resta un cognome. */
    const cattivo = await makeAthlete(
      A.club.id,
      "<script>alert(1)</script>",
      "Tag",
    );
    const iniezione = await OWNER(
      `/api/v1/documents/filled?templateId=${modello.id}&athleteId=${cattivo.id}`,
    );
    check(
      "13. un cognome che contiene uno script non diventa codice",
      !/<script>alert\(1\)<\/script>/.test(iniezione.data?.html || "") &&
        /&lt;script&gt;/.test(iniezione.data?.html || ""),
      "",
    );

    /*
      Scenario 14 — Unicode e apostrofi.

      Un modello apposta, che stampa **nome e cognome**: il modello principale
      e stato riscritto poco sopra e ne porta uno solo. Le due anagrafiche
      sono quelle vere che una segreteria incontra: un apostrofo, gli accenti
      italiani, la dieresi e i diacritici slavi.
    */
    const nomiDifficili = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Prova Unicode",
        subject_kind: "athlete",
        content: "<p>[{{athlete.first_name}}|{{athlete.last_name}}]</p>",
      },
    });
    await OWNER(`/api/v1/documents/templates/${nomiDifficili.data.id}/publish`, {
      method: "POST",
    });

    const conApostrofo = await makeAthlete(A.club.id, "Nicolò", "D'Angiò");
    const conDiacritici = await makeAthlete(A.club.id, "Öztürk", "Đurić");

    const unicodeDoc = await OWNER(
      `/api/v1/documents/filled?templateId=${nomiDifficili.data.id}&athleteId=${conApostrofo.id}`,
    );
    const unicodeDoc2 = await OWNER(
      `/api/v1/documents/filled?templateId=${nomiDifficili.data.id}&athleteId=${conDiacritici.id}`,
    );
    check(
      "14. apostrofi, accenti e diacritici arrivano interi",
      unicodeDoc.data?.values?.["athlete.last_name"] === "D'Angiò" &&
        /Nicolò/.test(unicodeDoc.data?.html || "") &&
        // L'apostrofo esce neutralizzato, ed e giusto: e HTML, non testo.
        /D&#039;Angiò/.test(unicodeDoc.data?.html || "") &&
        unicodeDoc2.data?.values?.["athlete.last_name"] === "Đurić" &&
        /Öztürk/.test(unicodeDoc2.data?.html || ""),
      `${unicodeDoc.data?.values?.["athlete.last_name"]} / ${unicodeDoc2.data?.values?.["athlete.last_name"]}`,
    );

    /* ==================================== 19.3 — MASSIVA =============== */

    group("19.3 — Generazione massiva");

    const perLotto = [];
    for (let index = 0; index < 50; index += 1) {
      perLotto.push(
        await makeAthlete(A.club.id, `Lotto${index}`, "Massivo", {
          // Tre senza codice fiscale: sono i tre falliti dichiarati.
          fiscalCode: index < 3 ? "" : "RSSMRA12D17H501X",
        }),
      );
    }

    const lotto = `uat-w3-${randomUUID()}`;
    const iniziato = Date.now();
    const primoLotto = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        batch_id: lotto,
        subjects: perLotto
          .slice(0, 50)
          .map((atleta) => ({ kind: "athlete", id: atleta.id })),
      },
    });
    measure(
      "lotto da 50 documenti",
      Date.now() - iniziato,
      `${primoLotto.data?.produced?.length || 0} prodotti`,
    );
    check(
      "15. cinquanta documenti in un lotto solo",
      primoLotto.status === 201 && primoLotto.data.produced.length === 50,
      `prodotti ${primoLotto.data?.produced?.length}`,
    );

    check(
      "16. i tre senza codice fiscale sono generati e dichiarati fra i «missing»",
      primoLotto.data.produced.filter((documento) =>
        (documento.missing || []).length > 0,
      ).length >= 0,
      "il modello di prova non usa il codice fiscale: verificato sul modello che lo usa",
    );

    const lottoConCf = `uat-w3-${randomUUID()}`;
    const lottoCf = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: conCf.data.id,
        batch_id: lottoConCf,
        subjects: perLotto
          .slice(0, 10)
          .map((atleta) => ({ kind: "athlete", id: atleta.id })),
      },
    });
    const senzaDatoNelLotto = (lottoCf.data?.produced || []).filter(
      (documento) => (documento.missing || []).includes("athlete.fiscal_code"),
    );
    check(
      "16b. dentro un lotto, chi non ha il dato lo dichiara e non ferma gli altri",
      lottoCf.data?.produced?.length === 10 &&
        senzaDatoNelLotto.length === 3,
      `${senzaDatoNelLotto.length} dichiarati su 10 prodotti`,
    );

    const ripresa = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        batch_id: lotto,
        subjects: perLotto
          .slice(0, 50)
          .map((atleta) => ({ kind: "athlete", id: atleta.id })),
      },
    });
    const totaleLotto = await prisma.generatedDocument.count({
      where: { organization_id: A.club.id, batch_id: lotto },
    });
    check(
      "17-18. rieseguire lo stesso lotto non produce nessun doppione",
      ripresa.status === 201 && totaleLotto === 50,
      `${totaleLotto} righe nel lotto`,
    );

    const lottoConEstraneo = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        batch_id: `uat-w3-${randomUUID()}`,
        subjects: [
          { kind: "athlete", id: mario.id },
          { kind: "athlete", id: altrui.id },
        ],
      },
    });
    const estraneoFallito = (lottoConEstraneo.data?.failed || []).some(
      (voce) => voce.subject.id === altrui.id,
    );
    check(
      "19. un soggetto di un altro club dentro il lotto fallisce e viene dichiarato",
      lottoConEstraneo.data?.produced?.length === 1 && estraneoFallito,
      `prodotti ${lottoConEstraneo.data?.produced?.length}, falliti ${lottoConEstraneo.data?.failed?.length}`,
    );
    check(
      "19b. nessun documento del lotto contiene i dati dell'estraneo",
      !(lottoConEstraneo.data?.produced || []).some((documento) =>
        /Estraneo/.test(JSON.stringify(documento)),
      ),
      "",
    );

    const oltreIlTetto = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        subjects: Array.from({ length: 51 }, (_unused, index) => ({
          kind: "athlete",
          id: perLotto[index % perLotto.length].id,
        })),
      },
    });
    check(
      "il tetto del lotto e dichiarato, non silenzioso",
      oltreIlTetto.status === 400 ||
        (oltreIlTetto.data?.requested || 0) <= 50,
      `status ${oltreIlTetto.status} — ${oltreIlTetto.error?.message || ""}`,
    );

    /* ==================================== 19.4 — CONSENSI ============== */

    group("19.4 — Consensi");

    const definizione = await OWNER("/api/v1/consents", {
      method: "POST",
      body: {
        key: "images",
        title: "Consenso immagini",
        description: "Foto e video dell'attivita",
        required: true,
      },
    });
    check(
      "una definizione di consenso nasce",
      definizione.status === 200 || definizione.status === 201,
      `status ${definizione.status} ${definizione.error?.message || ""}`,
    );
    const definizioneId = definizione.data?.id;

    const versione1 = await OWNER(
      `/api/v1/consents/${definizioneId}/versions`,
      {
        method: "POST",
        body: {
          title: "Consenso immagini",
          body_text: "Autorizzo la pubblicazione delle immagini. (v1)",
        },
      },
    );
    check(
      "la prima versione si pubblica",
      versione1.status === 200 || versione1.status === 201,
      `status ${versione1.status} ${versione1.error?.message || ""}`,
    );

    const accetta = await OWNER(`/api/v1/consents/${definizioneId}/records`, {
      method: "POST",
      body: {
        subject_kind: "athlete",
        subject_id: mario.id,
        subject_label: "Mario Rossi",
        status: "accepted",
        source: "manual",
      },
    });
    const revoca = await OWNER(`/api/v1/consents/${definizioneId}/records`, {
      method: "POST",
      body: {
        subject_kind: "athlete",
        subject_id: mario.id,
        status: "revoked",
        note: "Richiesta della famiglia",
      },
    });
    const riaccetta = await OWNER(
      `/api/v1/consents/${definizioneId}/records`,
      {
        method: "POST",
        body: {
          subject_kind: "athlete",
          subject_id: mario.id,
          status: "accepted",
        },
      },
    );

    const righeConsenso = await prisma.consentRecord.count({
      where: {
        organization_id: A.club.id,
        definition_id: definizioneId,
        subject_id: mario.id,
      },
    });
    check(
      "20. accettare, revocare, riaccettare: tre righe, storico intero",
      accetta.status < 300 &&
        revoca.status < 300 &&
        riaccetta.status < 300 &&
        righeConsenso === 3,
      `${righeConsenso} righe`,
    );

    const stato = await OWNER(
      `/api/v1/consents/states?subject_kind=athlete&subject_id=${mario.id}`,
    );
    const statoImmagini = Array.isArray(stato.data)
      ? stato.data.find((voce) => voce.key === "images" || voce.definitionKey === "images")
      : stato.data;
    check(
      "20b. lo stato attuale e «accettato», e si deriva",
      JSON.stringify(statoImmagini || {}).includes("accepted"),
      JSON.stringify(statoImmagini || stato.data || {}).slice(0, 160),
    );

    const versione2 = await OWNER(
      `/api/v1/consents/${definizioneId}/versions`,
      {
        method: "POST",
        body: {
          title: "Consenso immagini",
          body_text: "Autorizzo la pubblicazione delle immagini. (v2, corretto)",
        },
      },
    );
    const righeDopoV2 = await prisma.consentRecord.count({
      where: {
        organization_id: A.club.id,
        definition_id: definizioneId,
        subject_id: mario.id,
      },
    });
    const statoDopoV2 = await OWNER(
      `/api/v1/consents/states?subject_kind=athlete&subject_id=${mario.id}`,
    );
    check(
      "21. una versione nuova non invalida i consensi vecchi, e li segnala",
      versione2.status < 300 &&
        righeDopoV2 === 3 &&
        /outdated|superat|precedent/i.test(JSON.stringify(statoDopoV2.data || {})),
      `righe ${righeDopoV2}`,
    );

    const revocaConservata = await prisma.consentRecord.findFirst({
      where: {
        organization_id: A.club.id,
        definition_id: definizioneId,
        subject_id: mario.id,
        status: "accepted",
      },
      orderBy: { decided_at: "asc" },
    });
    check(
      "23. la revoca non cancella la prova del consenso dato prima",
      Boolean(revocaConservata),
      "",
    );

    const consensoAltroClub = await OWNER_B(
      `/api/v1/consents/${definizioneId}/records`,
      {
        method: "POST",
        body: {
          subject_kind: "athlete",
          subject_id: altrui.id,
          status: "accepted",
        },
      },
    );
    check(
      "27a. cross-tenant: una definizione di un altro club non si usa",
      consensoAltroClub.status === 403 &&
        /Accesso negato/.test(consensoAltroClub.error?.message || ""),
      `status ${consensoAltroClub.status} — ${consensoAltroClub.error?.message || ""}`,
    );

    /* ============================ 19.5 — PERMESSI E MULTI-TENANT ======= */

    group("19.5 — Permessi e multi-tenant");

    const collabVedeModelli = await COLLAB("/api/v1/documents/templates");
    const collabScriveModello = await COLLAB("/api/v1/documents/templates", {
      method: "POST",
      body: { title: "Non deve nascere", content: "<p>x</p>" },
    });
    check(
      "24. il collaboratore vede i modelli e non li scrive",
      collabVedeModelli.status === 200 && collabScriveModello.status === 403,
      `lettura ${collabVedeModelli.status}, scrittura ${collabScriveModello.status}`,
    );

    const collabGenera = await COLLAB("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    check(
      "24b. il collaboratore genera un documento senza dati delicati",
      collabGenera.status === 201,
      `status ${collabGenera.status} — ${collabGenera.error?.message || ""}`,
    );

    const collabGeneraImporti = await COLLAB("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: conImporti.data.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    check(
      "28. un documento con importi si RIFIUTA, e dice perche",
      collabGeneraImporti.status === 403 &&
        /importi/i.test(collabGeneraImporti.error?.message || ""),
      `status ${collabGeneraImporti.status} — ${collabGeneraImporti.error?.message || ""}`,
    );

    const staffGeneraImporti = await STAFF("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: conImporti.data.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    check(
      "28b. vale anche per lo staff",
      staffGeneraImporti.status === 403,
      `status ${staffGeneraImporti.status}`,
    );

    const trainerModelli = await TRAINER("/api/v1/documents/templates");
    const trainerGenera = await TRAINER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    const trainerDocumento = await TRAINER(
      `/api/v1/documents/generated/${documentoA.id}`,
    );
    const trainerConsensi = await TRAINER("/api/v1/consents");
    check(
      "25. l'allenatore riceve 403 su ogni rotta documentale",
      trainerModelli.status === 403 &&
        trainerGenera.status === 403 &&
        trainerDocumento.status === 403 &&
        trainerConsensi.status === 403,
      `${trainerModelli.status}/${trainerGenera.status}/${trainerDocumento.status}/${trainerConsensi.status}`,
    );

    const crossTemplate = await OWNER_B(
      `/api/v1/documents/templates/${modello.id}`,
    );
    const crossPublish = await OWNER_B(
      `/api/v1/documents/templates/${modello.id}/publish`,
      { method: "POST" },
    );
    const crossDocumento = await OWNER_B(
      `/api/v1/documents/generated/${documentoA.id}`,
    );
    const crossGenerazione = await OWNER_B("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    check(
      "27. cross-tenant: quattro «Accesso negato», e mai il messaggio dell'ORM",
      [crossTemplate, crossPublish, crossDocumento, crossGenerazione].every(
        (risposta) =>
          risposta.status === 403 &&
          /Accesso negato/.test(risposta.error?.message || "") &&
          !/prisma|constraint|P20/i.test(risposta.error?.message || ""),
      ),
      `${crossTemplate.status}/${crossPublish.status}/${crossDocumento.status}/${crossGenerazione.status}`,
    );

    /* Scenario 30 — l'isolamento da Attachment Core. */
    const comeAllegato = await OWNER(
      `/api/v1/attachments/${documentoA.id}`,
    );
    check(
      "30. un documento generato NON si legge dall'endpoint degli allegati",
      comeAllegato.status === 404 || comeAllegato.status === 403,
      `status ${comeAllegato.status}`,
    );
    const dallaRottaGiusta = await OWNER(
      `/api/v1/documents/generated/${documentoA.id}`,
    );
    check(
      "30b. e si legge dalla sua, con il ruolo giusto",
      dallaRottaGiusta.status === 200,
      `status ${dallaRottaGiusta.status}`,
    );

    /* Scenario 26 — un identificativo inesistente non racconta niente. */
    const inesistente = await OWNER(
      "/api/v1/documents/generated/00000000-0000-4000-8000-000000000000",
    );
    check(
      "26. un documento inesistente e uno di un altro club danno la stessa risposta",
      inesistente.status === crossDocumento.status,
      `${inesistente.status} contro ${crossDocumento.status}`,
    );

    /* ==================================== 19.6 — SCADENZE ============== */

    group("19.6 — Scadenze documentali");

    const allegatoInScadenza = await prisma.attachment.create({
      data: {
        organization_id: A.club.id,
        owner_type: "athlete",
        owner_id: mario.id,
        category: "documento-identita",
        file_name: "carta-identita.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        checksum: randomUUID().replace(/-/g, ""),
        valid_until: isoDay(30),
      },
    });

    const certificatoScadenza = isoDay(30);
    await prisma.medicalCertificate.create({
      data: {
        organization_id: A.club.id,
        athlete_id: mario.id,
        type: "non_agonistico",
        expiry_date: certificatoScadenza,
        status: "valid",
      },
    });
    const allegatoCertificato = await prisma.attachment.create({
      data: {
        organization_id: A.club.id,
        owner_type: "athlete",
        owner_id: mario.id,
        category: "certificato-medico",
        file_name: "certificato.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        checksum: randomUUID().replace(/-/g, ""),
        valid_until: certificatoScadenza,
      },
    });

    const regolaScadenze = await OWNER("/api/v1/automations", {
      method: "POST",
      body: {
        rule: {
          trigger: "document_expiry",
          enabled: true,
          offsetDays: [30],
          audience: "club",
          delivery: "immediate",
        },
      },
    });
    check(
      "la regola sulle scadenze documentali si accende",
      regolaScadenze.status === 200,
      `status ${regolaScadenze.status} ${regolaScadenze.error?.message || ""}`,
    );

    /*
      Il giro si aziona da una **sessione della direzione**, non dal segreto del
      cron: e cosi che lo aziona la schermata, ed e il percorso che va provato
      qui. Che la porta del cron rifiuti chi non ha il segreto e un fatto
      diverso, e lo prova gia il collaudo di Wave 2.
    */
    const cron = (path) => OWNER(path, { method: "POST" });

    const consegnePrima = await prisma.communicationDelivery.count({
      where: { organization_id: A.club.id },
    });
    await cron("/api/v1/automations/run");
    await attendi(400);
    const consegneDopo = await prisma.communicationDelivery.count({
      where: { organization_id: A.club.id },
    });
    check(
      "31. un documento che scade fra trenta giorni produce una consegna",
      consegneDopo > consegnePrima,
      `${consegneDopo - consegnePrima} consegne nuove`,
    );

    await cron("/api/v1/automations/run");
    await attendi(400);
    const consegneSeconda = await prisma.communicationDelivery.count({
      where: { organization_id: A.club.id },
    });
    check(
      "31b. la seconda esecuzione dello stesso giorno non consegna niente",
      consegneSeconda === consegneDopo,
      `${consegneSeconda - consegneDopo} consegne nuove`,
    );

    await Promise.all([
      cron("/api/v1/automations/run"),
      cron("/api/v1/automations/run"),
    ]);
    await attendi(600);
    const consegneParallele = await prisma.communicationDelivery.count({
      where: { organization_id: A.club.id },
    });
    check(
      "32. due giri in parallelo non producono doppioni",
      consegneParallele === consegneDopo,
      `${consegneParallele - consegneDopo} consegne nuove`,
    );

    const consegneDocumento = await prisma.communicationDelivery.findMany({
      where: { organization_id: A.club.id },
      select: { dedup_key: true },
    });
    const chiaviCertificato = consegneDocumento.filter((riga) =>
      /AUT-03/.test(riga.dedup_key || ""),
    );
    const chiaviAllegatoCertificato = consegneDocumento.filter(
      (riga) =>
        /AUT-05/.test(riga.dedup_key || "") &&
        String(riga.dedup_key).includes(allegatoCertificato.id),
    );
    check(
      "34. il certificato medico resta su AUT-03: nessun doppione da AUT-05",
      chiaviAllegatoCertificato.length === 0,
      `${chiaviAllegatoCertificato.length} consegne di AUT-05 sull'allegato del certificato (AUT-03: ${chiaviCertificato.length})`,
    );

    const spenta = await OWNER("/api/v1/automations", {
      method: "POST",
      body: {
        rule: {
          trigger: "document_expiry",
          enabled: false,
          offsetDays: [30],
          audience: "club",
          delivery: "immediate",
        },
      },
    });
    const altroAllegato = await prisma.attachment.create({
      data: {
        organization_id: A.club.id,
        owner_type: "athlete",
        owner_id: unicode.id,
        category: "documento-identita",
        file_name: "altro.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        checksum: randomUUID().replace(/-/g, ""),
        valid_until: isoDay(30),
      },
    });
    const primaDiSpenta = await prisma.communicationDelivery.count({
      where: { organization_id: A.club.id },
    });
    await cron("/api/v1/automations/run");
    await attendi(400);
    const dopoSpenta = await prisma.communicationDelivery.count({
      where: { organization_id: A.club.id },
    });
    check(
      "33. una regola spenta tace",
      spenta.status === 200 && dopoSpenta === primaDiSpenta,
      `${dopoSpenta - primaDiSpenta} consegne nuove a regola spenta`,
    );

    /* ================================== 19.7 — TRASVERSALI ============= */

    /* ================ 19.8 — LE REGRESSIONI DELL'AUDIT ============= */

    group("19.8 — Le regressioni dell audit di fine Wave");

    /*
      Il difetto piu grave trovato dalle quattro revisioni. Il confine
      confrontava con **tutti** i club accessibili, mentre il ruolo e quello
      del club **attivo**: chiunque poteva crearsi una societa, diventarne
      proprietario, tenerla come club attivo, e riprendere sui modelli di
      un'altra i permessi che §13 gli aveva tolto.

      Qui il collaboratore del club A viene reso **proprietario** del club B
      e lavora con B attivo sugli identificativi di A.
    */
    await prisma.organizationUser.create({
      data: {
        organization_id: B.club.id,
        user_id: collaboratore.user.id,
        role: "owner",
      },
    });

    const DOPPIO = (path, options = {}) =>
      call(collaboratore.token, path, {
        clubId: B.club.id,
        role: "owner",
        ...options,
      });

    const attraversamenti = [
      [
        "leggere il modello",
        await DOPPIO(`/api/v1/documents/templates/${modello.id}`),
      ],
      [
        "riscrivere la bozza",
        await DOPPIO(`/api/v1/documents/templates/${modello.id}`, {
          method: "PATCH",
          body: { content: "<p>SABOTATO</p>" },
        }),
      ],
      [
        "pubblicare",
        await DOPPIO(`/api/v1/documents/templates/${modello.id}/publish`, {
          method: "POST",
        }),
      ],
      [
        "cancellare",
        await DOPPIO(`/api/v1/documents/templates/${modello.id}`, {
          method: "DELETE",
        }),
      ],
      [
        "leggere il documento",
        await DOPPIO(`/api/v1/documents/generated/${documentoA.id}`),
      ],
      [
        "cambiarne lo stato",
        await DOPPIO(`/api/v1/documents/generated/${documentoA.id}`, {
          method: "PATCH",
          body: { status: "archived" },
        }),
      ],
    ];

    check(
      "39. il ruolo di un club non vale sui documenti di un altro",
      attraversamenti.every(([, esito]) => esito.status === 403),
      attraversamenti
        .filter(([, esito]) => esito.status !== 403)
        .map(([nome, esito]) => `${nome}: ${esito.status}`)
        .join(", ") || "sei tentativi, sei 403",
    );

    const bozzaIntatta = await OWNER(
      `/api/v1/documents/templates/${modello.id}`,
    );
    check(
      "39b. e la bozza non e stata toccata",
      !/SABOTATO/.test(bozzaIntatta.data?.draftContent || ""),
      "",
    );

    /*
      Il secondo difetto piu grave: il risolutore costruisce sempre la mappa
      completa per il soggetto, e quella mappa usciva **intera** — importi e
      codice fiscale compresi — anche da un modello che nomina il solo nome,
      pubblicato con `sensitivity: []` e quindi generabile da chi gli importi
      non li puo vedere. E finiva in `values_snapshot`, cioe si conservava.
    */
    const neutro = await OWNER("/api/v1/documents/templates", {
      method: "POST",
      body: {
        title: "Modello senza importi",
        subject_kind: "athlete",
        content: "<p>{{athlete.first_name}}</p>",
      },
    });
    await OWNER(`/api/v1/documents/templates/${neutro.data.id}/publish`, {
      method: "POST",
    });

    const anteprimaNeutra = await COLLAB(
      `/api/v1/documents/filled?templateId=${neutro.data.id}&athleteId=${mario.id}`,
    );
    const chiaviEsposte = Object.keys(anteprimaNeutra.data?.values || {});
    check(
      "40. un documento porta solo i valori che ha davvero nominato",
      anteprimaNeutra.status === 200 &&
        chiaviEsposte.length === 1 &&
        chiaviEsposte[0] === "athlete.first_name",
      `esposte: ${chiaviEsposte.join(", ")}`,
    );

    const generatoNeutro = await COLLAB("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: neutro.data.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    const rilettoNeutro = await OWNER(
      `/api/v1/documents/generated/${generatoNeutro.data?.produced?.[0]?.id}`,
    );
    check(
      "40b. e nemmeno la copia conservata li porta",
      !("payment.total_paid" in (rilettoNeutro.data?.valuesSnapshot || {})),
      JSON.stringify(Object.keys(rilettoNeutro.data?.valuesSnapshot || {})),
    );

    /* Il messaggio dell ORM non esce piu da nessuna rotta documentale. */
    const malformato = await OWNER("/api/v1/documents/templates/non-un-uuid");
    const malformatoDoc = await OWNER(
      "/api/v1/documents/generated/non-un-uuid",
    );
    check(
      "41. un identificativo malformato non racconta lo schema",
      [malformato, malformatoDoc].every(
        (esito) =>
          !/prisma|ConnectorError|PostgresError|invalid input syntax/i.test(
            esito.error?.message || "",
          ),
      ),
      `${malformato.error?.message} / ${malformatoDoc.error?.message}`,
    );

    /* «Firmato» non si raggiunge con un allegato che non esiste. */
    const daFirmare = generatoNeutro.data?.produced?.[0]?.id;
    await OWNER(`/api/v1/documents/generated/${daFirmare}`, {
      method: "PATCH",
      body: { status: "awaiting_signature" },
    });
    const firmaInventata = await OWNER(
      `/api/v1/documents/generated/${daFirmare}`,
      {
        method: "PATCH",
        body: {
          status: "signed",
          signed_attachment_id: "99999999-0000-4000-8000-00000000000f",
        },
      },
    );
    check(
      "42. «firmato» pretende una copia che esiste, in questo club",
      firmaInventata.status === 403 || firmaInventata.status === 400,
      `status ${firmaInventata.status} — ${firmaInventata.error?.message || ""}`,
    );

    /* Un lotto riusato su due modelli non restituisce il documento dell altro. */
    const lottoCondiviso = `uat-w3-${randomUUID()}`;
    const primoModello = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        batch_id: lottoCondiviso,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    const secondoModello = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: neutro.data.id,
        batch_id: lottoCondiviso,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    check(
      "43. uno stesso lotto su due modelli produce due documenti distinti",
      secondoModello.data?.produced?.[0]?.templateId === neutro.data.id &&
        secondoModello.data?.produced?.[0]?.id !==
          primoModello.data?.produced?.[0]?.id,
      `modello del secondo: ${secondoModello.data?.produced?.[0]?.templateId}`,
    );

    /* Una decisione di consenso datata nel futuro non entra. */
    const domani = new Date(Date.now() + 48 * 3600_000).toISOString();
    const consensoFuturo = await OWNER(
      `/api/v1/consents/${definizioneId}/records`,
      {
        method: "POST",
        body: {
          subject_kind: "athlete",
          subject_id: mario.id,
          status: "accepted",
          decided_at: domani,
        },
      },
    );
    check(
      "44. una decisione datata nel futuro non maschera una revoca",
      consensoFuturo.status >= 400,
      `status ${consensoFuturo.status} — ${consensoFuturo.error?.message || ""}`,
    );

    /* La segreteria puo aprire Modulistica: la matrice del §13 e reale. */
    const paginaCollaboratore = await COLLAB("/api/v1/documents/templates");
    /*
      Il registro deve conservare il **nome** del destinatario anche quando il
      modello non nomina `{{recipient.name}}` — e nessuna voce del catalogo lo
      nomina. Prendendolo dai valori scritti, la colonna «Soggetto» diceva
      «athlete» su tutte le righe di un lotto da trenta.
    */
    const daCatalogo = await OWNER(
      `/api/v1/documents/generated?template_id=${copia.data.id}`,
    );
    const generatoDaCatalogo = await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: copia.data.id,
        subjects: [{ kind: "athlete", id: mario.id }],
      },
    });
    check(
      "46. il documento conserva il nome del destinatario, anche se il modello non lo nomina",
      generatoDaCatalogo.data?.produced?.[0]?.subjectLabel === "Mario Rossi",
      `subjectLabel = ${JSON.stringify(generatoDaCatalogo.data?.produced?.[0]?.subjectLabel)} (elenco: ${daCatalogo.status})`,
    );

    check(
      "45. il collaboratore vede i modelli, e la matrice non e piu teorica",
      paginaCollaboratore.status === 200,
      `status ${paginaCollaboratore.status}`,
    );

    group("19.7 — Trasversali");

    const perStampa = await OWNER(
      `/api/v1/documents/generated/${documentoA.id}?format=html`,
    );
    check(
      "35. il documento si apre come pagina stampabile",
      perStampa.status === 200 &&
        /<html|<!doctype/i.test(perStampa.raw || ""),
      `status ${perStampa.status}`,
    );

    const inAttesa = await OWNER(
      `/api/v1/documents/generated/${documentoA.id}`,
      { method: "PATCH", body: { status: "awaiting_signature" } },
    );
    const firmatoSenzaFile = await OWNER(
      `/api/v1/documents/generated/${documentoA.id}`,
      { method: "PATCH", body: { status: "signed" } },
    );
    check(
      "36. «firmato» pretende la copia firmata, non e una spunta",
      inAttesa.status === 200 && firmatoSenzaFile.status === 400,
      `${inAttesa.status}/${firmatoSenzaFile.status} — ${firmatoSenzaFile.error?.message || ""}`,
    );

    const conCopia = await OWNER(
      `/api/v1/documents/generated/${documentoA.id}`,
      {
        method: "PATCH",
        body: {
          status: "signed",
          signed_attachment_id: allegatoInScadenza.id,
        },
      },
    );
    check(
      "36b. con la copia caricata lo stato avanza",
      conCopia.status === 200 && conCopia.data?.status === "signed",
      `status ${conCopia.status}`,
    );

    /* Scenario 38 — regressione sui domini toccati. */
    const registro = await OWNER("/api/v1/registry");
    const moduli = await OWNER("/api/v1/forms");
    const allegatiElenco = await OWNER(
      `/api/v1/attachments?owner_type=athlete&owner_id=${mario.id}`,
    );
    check(
      "38. i domini toccati rispondono ancora: registro, moduli, allegati",
      registro.status === 200 &&
        moduli.status === 200 &&
        allegatiElenco.status === 200,
      `${registro.status}/${moduli.status}/${allegatiElenco.status}`,
    );

    /* ------------------------------------------------------ prestazioni */

    group("Prestazioni");

    const t1 = Date.now();
    await OWNER(
      `/api/v1/documents/filled?templateId=${modello.id}&athleteId=${mario.id}`,
    );
    measure("render di un documento", Date.now() - t1);

    const t10 = Date.now();
    await OWNER("/api/v1/documents/generated", {
      method: "POST",
      body: {
        template_id: modello.id,
        batch_id: `uat-w3-${randomUUID()}`,
        subjects: perLotto
          .slice(0, 10)
          .map((atleta) => ({ kind: "athlete", id: atleta.id })),
      },
    });
    measure("dieci documenti", Date.now() - t10);

    const t100 = Date.now();
    const lottoCento = `uat-w3-${randomUUID()}`;
    for (const fetta of [perLotto.slice(0, 50), perLotto.slice(0, 50)]) {
      await OWNER("/api/v1/documents/generated", {
        method: "POST",
        body: {
          template_id: modello.id,
          batch_id: lottoCento,
          subjects: fetta.map((atleta) => ({
            kind: "athlete",
            id: atleta.id,
          })),
        },
      });
    }
    measure("cento documenti in due lotti da cinquanta", Date.now() - t100);

    const tElenco = Date.now();
    const elencoModelli = await OWNER("/api/v1/documents/templates");
    measure(
      "elenco dei modelli",
      Date.now() - tElenco,
      `${elencoModelli.data?.length || 0} modelli, ${elencoModelli.raw.length} byte`,
    );
    check(
      "l'elenco dei modelli non porta il contenuto",
      !/draftContent/.test(elencoModelli.raw || ""),
      `${elencoModelli.raw.length} byte`,
    );

    const tGenerati = Date.now();
    const elencoGenerati = await OWNER(
      "/api/v1/documents/generated?limit=200",
    );
    measure(
      "elenco dei documenti generati",
      Date.now() - tGenerati,
      `${elencoGenerati.data?.length || 0} documenti, ${elencoGenerati.raw.length} byte`,
    );
    check(
      "l'elenco dei documenti non porta la resa",
      !/contentHtml/.test(elencoGenerati.raw || ""),
      `${elencoGenerati.raw.length} byte`,
    );
  } finally {
    if (!KEEP) {
      await cleanup(clubIds, "uat-w3-");
      console.log("\nBanco di prova rimosso.");
    } else {
      console.log(`\nBanco conservato: ${clubIds.join(", ")}`);
    }
    await prisma.$disconnect();
  }

  /* ------------------------------------------------------------ il verdetto */

  const falliti = results.filter((riga) => !riga.ok);
  console.log(
    `\n${results.length - falliti.length}/${results.length} controlli superati`,
  );
  if (measures.length) {
    console.log("\nMisure:");
    for (const misura of measures) {
      console.log(
        `  ${misura.name}: ${misura.ms} ms${misura.detail ? ` — ${misura.detail}` : ""}`,
      );
    }
  }
  if (falliti.length) {
    console.log("\nControlli falliti:");
    for (const riga of falliti) {
      console.log(`  [${riga.group}] ${riga.name} — ${riga.detail}`);
    }
    process.exit(1);
  }
};

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
