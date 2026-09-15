import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Parita V1 → V2 di `/medical` (Certificati medici)**
 * (`docs/redesign/audit/wave-b-sport-operations.md` §2, `MIGRATION-BRIEF.md`).
 *
 * L'audit e il contratto: **niente sparisce**. Questo file elenca le capacita
 * che l'audit ha inventariato — etichette, azioni, endpoint, soglie — e le
 * cerca nei sorgenti V2, e prova il modello puro (righe, viste, filtri,
 * esito del promemoria) senza aprire la pagina.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");
const strip = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGINA = "app/medical/page.tsx";
const MODELLO = "components/medical/v2/certificate-grid-model.ts";
const COLONNE = "components/medical/v2/certificate-grid-columns.tsx";
const CASSETTO_PROMEMORIA = "components/medical/v2/reminder-bulk-drawer.tsx";
const FORM = "components/forms/AddCertificateForm.tsx";

const pagina = strip(read(PAGINA));
const colonne = strip(read(COLONNE));
const cassetto = strip(read(CASSETTO_PROMEMORIA));
const form = strip(read(FORM));
const v2 = [PAGINA, MODELLO, COLONNE, CASSETTO_PROMEMORIA].map((f) => strip(read(f))).join("\n");

const modello = () => import("../../src/components/medical/v2/certificate-grid-model.ts");

/* ═══════════════════════════════════════════ §2.1 — i dati e le letture */

test("§2.1 · le stesse letture della V1: atleti (con ripiego legacy), categorie, certificati", () => {
  assert.match(pagina, /\.from\("simplified_athletes"\)[\s\S]{0,80}\.eq\("club_id", clubId\)/);
  assert.match(pagina, /\.from\("athletes"\)[\s\S]{0,80}\.eq\("organization_id", clubId\)/);
  assert.match(pagina, /getClubCategories\(clubId\)/);
  assert.match(pagina, /\.from\("medical_certificates"\)[\s\S]{0,80}\.in\("athlete_id", athleteIds\)/);
  assert.match(pagina, /localStorage\.getItem\("activeClub"\)/, "il ripiego sul club salvato");
  assert.match(pagina, /searchParams\?\.get\("clubId"\)/);
});

test("§2.1 · un certificato per atleta, il piu recente; chi non ne ha riceve la riga sintetica", async () => {
  const { buildCertificateRows, MISSING_CERTIFICATE_TYPE, isMissingRowId } = await modello();
  const oggi = new Date(2026, 8, 15);
  const righe = buildCertificateRows({
    athletes: [
      { id: "a1", first_name: "Marco", last_name: "Ferretti" },
      { id: "a2", first_name: "Luca", last_name: "Bianchi" },
    ],
    certificates: [
      { id: "c-old", athlete_id: "a1", issue_date: "2024-09-01", expiry_date: "2025-09-01", notes: "Agonistico" },
      { id: "c-new", athlete_id: "a1", issue_date: "2026-01-10", expiry_date: "2027-01-10", type: "Agonistico" },
      { id: "c-orfano", athlete_id: "altro-club", issue_date: "2026-01-10", expiry_date: "2027-01-10" },
    ],
    today: oggi,
  });
  assert.equal(righe.length, 2, "una riga per atleta, e i certificati di atleti sconosciuti si ignorano");
  const marco = righe.find((r) => r.athleteId === "a1");
  assert.equal(marco.id, "c-new", "resta il piu recente");
  assert.equal(marco.status, "valid");
  assert.equal(marco.athleteName, "Ferretti Marco", "cognome e nome, come getAthleteDisplayName");
  const luca = righe.find((r) => r.athleteId === "a2");
  assert.equal(luca.status, "missing");
  assert.equal(luca.certificateType, MISSING_CERTIFICATE_TYPE);
  assert.ok(isMissingRowId(luca.id));
  assert.equal(luca.expiryDate, "");
});

test("§2.1 · i quattro numeri dell'intestazione si contano sull'intero elenco", () => {
  assert.match(pagina, /countCertificatesByStatus\(rows\)/);
  for (const label of ['label="validi"', 'label="in scadenza"', 'label="scaduti"', 'label="mancanti"']) {
    assert.ok(pagina.includes(label), `manca il numero ${label}`);
  }
  assert.match(pagina, /<PageHeader/);
  assert.match(pagina, /title="Certificati medici"/);
});

/* ═══════════════════════════════════════════ §2.2 — le azioni */

test("§2.2 · le azioni della V1: registra, apri scheda, visualizza, scarica, promemoria", () => {
  assert.match(pagina, /Registra certificato/);
  assert.match(pagina, /presentation="drawer"/, "la registrazione apre il cassetto, non una modale");
  assert.match(pagina, /\/athletes\/\$\{row\.athleteId\}[\s\S]{0,160}tab=sanitari[\s\S]{0,60}#sanitari/);
  assert.match(pagina, /openClientFileUrl\(row\.fileUrl\)/);
  assert.match(pagina, /downloadAttachment\(row\.fileUrl, \{[\s\S]{0,200}documentType: `Certificato \$\{row\.certificateType \|\| "medico"\}`/);
  assert.match(pagina, /"File del certificato non disponibile"/);
  assert.match(pagina, /"\/api\/medical-certificate-reminders"/);
  assert.match(pagina, /method: "POST"/);
  for (const azione of ['label: "Apri scheda"', 'label: "Registra certificato"', 'label: "Aggiorna certificato"', 'label: "Invia promemoria"', 'label: "Visualizza allegato"', 'label: "Scarica allegato"']) {
    assert.ok(pagina.includes(azione), `manca l'azione di riga ${azione}`);
  }
  assert.doesNotMatch(pagina, /label: "Elimina"/, "la V1 non eliminava certificati da qui: non si inventa");
  assert.doesNotMatch(v2, /window\.confirm/);
});

test("§2.2 · visualizza e scarica sono verbi scritti, mai icone sole, e compaiono solo con un file", async () => {
  assert.match(colonne, /icon=\{<Eye \/>\}[\s\S]{0,80}>\s*Visualizza/);
  assert.match(colonne, /icon=\{<Download \/>\}[\s\S]{0,80}>\s*Scarica/);
  assert.match(colonne, /hasCertificateFile\(row\) \?/);
  const { hasCertificateFile } = await modello();
  assert.equal(hasCertificateFile({ status: "valid", fileUrl: "att:1" }), true);
  assert.equal(hasCertificateFile({ status: "valid", fileUrl: "  " }), false);
  assert.equal(hasCertificateFile({ status: "missing", fileUrl: "att:1" }), false);
});

/* ═══════════════════════════════════════════ §2.3 — il modulo */

test("§2.3 · il modulo resta `AddCertificateForm`, composto nel cassetto da 480 con la guardia", () => {
  assert.match(pagina, /<AddCertificateForm/);
  assert.match(pagina, /onSubmit=\{handleAddCertificate\}/);
  assert.match(form, /presentation === "drawer"/);
  assert.match(form, /<Drawer[\s\S]{0,400}width="default"/);
  assert.match(form, /dirty=\{touched \|\| Boolean\(selectedFile\)\}/);
  assert.match(form, /title=\{isEditing \? "Modifica certificato" : "Registra certificato"\}/);
  // la modale della scheda atleta resta com'era
  assert.match(form, /<Modal[\s\S]{0,100}title=\{isEditing \? "Modifica Certificato" : "Carica Nuovo Certificato"\}/);
  // i campi e le validazioni della V1
  for (const testo of ["Compila tutti i campi obbligatori", "ID del club non disponibile", "Il caricamento del file è obbligatorio", "La data di scadenza deve essere successiva alla data di emissione", "Ricalcola da emissione", "Sostituisci File"]) {
    assert.ok(form.includes(testo), `manca ${testo}`);
  }
});

test("§2.3 · il salvataggio e l'inserimento diretto della V1, con la sincronia della scheda atleta", () => {
  assert.match(pagina, /\.from\("medical_certificates"\)\s*\.insert\(\{/);
  assert.match(pagina, /source: "medical-page"/);
  assert.match(pagina, /status: getMedicalCertificateStatus\(certificateData\.expiryDate\)/);
  assert.match(pagina, /notes: certificateData\.certificateType/);
  assert.match(pagina, /updateAthlete\(certificateData\.athleteId, \{\s*data: \{\s*medicalCertExpiry: nextExpiry/);
  assert.match(pagina, /aggiunto con successo/);
  assert.match(pagina, /"Errore nell'aggiunta del certificato"/);
  // «Registra/Aggiorna certificato» dalla riga: stesso cassetto, atleta gia scelto
  assert.match(pagina, /lockAthleteSelection=\{Boolean\(drawerAthlete\)\}/);
});

/* ═══════════════════════════════════════════ §2.4 — stati e soglie */

test("§2.4 · lo stato resta quello di `/medical` (un mese di calendario), tradotto nelle pillole del sistema", async () => {
  const { buildCertificateRows, CERTIFICATE_ROW_PILL } = await modello();
  const { CERTIFICATE_STATUS } = await import("../../src/lib/web/status.ts");
  const oggi = new Date(2026, 0, 15);
  const righe = buildCertificateRows({
    athletes: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
    certificates: [
      { id: "c1", athlete_id: "a1", issue_date: "2025-01-01", expiry_date: "2026-01-10" },
      { id: "c2", athlete_id: "a2", issue_date: "2025-01-01", expiry_date: "2026-02-10" },
      { id: "c3", athlete_id: "a3", issue_date: "2025-01-01", expiry_date: "2026-03-10" },
    ],
    today: oggi,
  });
  assert.deepEqual(
    righe.map((r) => r.status),
    ["expired", "expiring", "valid"],
  );
  assert.equal(CERTIFICATE_ROW_PILL.valid, CERTIFICATE_STATUS.valid);
  assert.equal(CERTIFICATE_ROW_PILL.expiring, CERTIFICATE_STATUS.expiring);
  assert.equal(CERTIFICATE_ROW_PILL.expired, CERTIFICATE_STATUS.expired);
  assert.equal(CERTIFICATE_ROW_PILL.missing, CERTIFICATE_STATUS.missing);
  // la pillola «in scadenza» porta i giorni
  assert.match(colonne, /formatDaysLabel\(Math\.max\(0, days\)\)/);
  assert.match(strip(read(MODELLO)), /getMedicalCertificateStatus\(cert\.expiry_date, today\)/);
});

/* ═══════════════════════════════════════════ §2.5 — filtri, ricerca, viste */

test("§2.5 · le schede diventano viste, la ricerca e per nome, il filtro categoria confronta per identita", async () => {
  const { CERTIFICATE_VIEWS, buildCertificateFilters, collectCertificateTypeOptions } = await modello();
  assert.deepEqual(
    CERTIFICATE_VIEWS.map((v) => `${v.id}:${v.label}:${v.tone}`),
    ["validi:Validi:neutral", "in-scadenza:In scadenza:amber", "scaduti:Scaduti:red", "mancanti:Mancanti:red"],
  );
  assert.ok(CERTIFICATE_VIEWS.every((v) => v.builtIn));

  const catalogo = [
    { id: "c-formia", name: "Under 15" },
    { id: "c-scauri", name: "Under 15" },
  ];
  const filtri = buildCertificateFilters({
    categoryOptions: catalogo,
    sites: [{ id: "s1", name: "Scauri" }],
  });
  assert.deepEqual(
    filtri.map((f) => `${f.id}:${f.type}`),
    ["stato:select", "categoria:multi", "sede:select", "tipo:select", "scadenza:date-range"],
  );
  assert.equal(filtri[0].pinned, true);

  const riga = {
    status: "expired",
    expiryDate: "2026-03-01",
    certificateType: "Agonistico",
    siteIds: ["s1"],
    athlete: { id: "a", category_id: "c-scauri", data: { category: "Under 15" } },
  };
  assert.equal(filtri[0].apply(riga, "expired"), true);
  assert.equal(filtri[0].apply(riga, "valid"), false);
  assert.equal(filtri[0].apply(riga, null), true);
  assert.equal(filtri[1].apply(riga, ["c-scauri"]), true);
  assert.equal(
    filtri[1].apply(riga, ["c-formia"]),
    false,
    "due «Under 15» di due sedi sono due squadre: il nome non basta (ADR-0155)",
  );
  assert.equal(filtri[2].apply(riga, "s1"), true);
  assert.equal(filtri[2].apply(riga, "s2"), false);
  assert.equal(filtri[2].apply({ ...riga, siteIds: [] }, "s2"), true, "senza sede dichiarata la riga resta visibile");
  assert.equal(filtri[3].apply(riga, "Agonistico"), true);
  assert.equal(filtri[3].apply(riga, "Non Agonistico"), false);
  assert.equal(filtri[4].apply(riga, { from: "2026-02-01", to: "2026-03-31" }), true);
  assert.equal(filtri[4].apply(riga, { from: "2026-03-02" }), false);
  assert.equal(filtri[4].apply({ ...riga, expiryDate: "" }, { to: "2026-12-31" }), false);

  const senzaSedi = buildCertificateFilters({ categoryOptions: [] });
  assert.equal(senzaSedi.some((f) => f.id === "sede"), false, "su un club mono-sede il filtro sede e assente");

  const tipi = collectCertificateTypeOptions([
    { certificateType: "Certificato Medico" },
    { certificateType: "Certificato Medico Mancante" },
    { certificateType: "Agonistico" },
  ]);
  assert.deepEqual(
    tipi.map((t) => t.value),
    ["Agonistico", "Non Agonistico", "Sana e Robusta Costituzione", "Certificato Medico"],
  );

  assert.ok(pagina.includes('placeholder: "Cerca atleti..."'));
  assert.match(pagina, /row\.athleteName\.toLowerCase\(\)\.includes\(query\.toLowerCase\(\)\)/);
  assert.match(pagina, /module="certificati"/);
  assert.match(pagina, /requestedViewId=\{requestedViewId\}/, "i numeri dell'intestazione accendono la vista");
});

/* ═══════════════════════════════════════════ §2.6–2.7 — promemoria, singolo e di massa */

test("§2.7 · il promemoria singolo: stessa porta, stesso corpo, stesse parole", async () => {
  const { buildReminderPayload, classifyReminderResponse, REMINDER_MESSAGES } = await modello();
  assert.deepEqual(buildReminderPayload({ id: "c1", athleteId: "a1" }, "club"), {
    athleteId: "a1",
    certificateId: "c1",
    organizationId: "club",
  });
  assert.equal(
    buildReminderPayload({ id: "missing-a1", athleteId: "a1" }, "club").certificateId,
    undefined,
    "la riga sintetica non ha un certificato da citare",
  );
  assert.equal(classifyReminderResponse({ created: 1 }).kind, "sent");
  assert.equal(classifyReminderResponse({ created: 0, skipped: 1 }).kind, "already");
  assert.equal(classifyReminderResponse({ created: 0, skipped: 0 }).kind, "no_recipients");
  assert.equal(REMINDER_MESSAGES.sent("Marco"), "Promemoria inviato a Marco");
  assert.equal(REMINDER_MESSAGES.already, "Promemoria gia presente per questo certificato");
  assert.equal(REMINDER_MESSAGES.no_recipients, "Nessun parent collegato a questo atleta");
  assert.match(pagina, /REMINDER_MESSAGES\.sent\(row\.athleteName\)/);
});

test("§2.6 · l'azione di massa «Invia promemoria» e guidata: record interessati, conferma, avanzamento, esito riga per riga", async () => {
  assert.match(pagina, /bulkActions: BulkActionDef<CertificateRow>\[\] = \[[\s\S]{0,200}label: "Invia promemoria"/);
  assert.match(pagina, /<ReminderBulkDrawer/);
  assert.match(pagina, /Invia promemoria a tutti/);
  assert.match(pagina, /<AlertBlock[\s\S]{0,60}severity="danger"/);
  assert.match(pagina, /<AlertBlock[\s\S]{0,120}severity="warning"/);
  assert.match(pagina, /non possono essere convocati/);
  for (const passo of ['eyebrow="Record interessati"', 'eyebrow="Conferma"', 'eyebrow="Avanzamento"', 'eyebrow="Esito"']) {
    assert.ok(cassetto.includes(passo), `manca il passo ${passo}`);
  }
  assert.match(cassetto, /<ProgressBar/);
  assert.match(cassetto, /Riprova su/);
  assert.match(cassetto, /Esporta esito CSV/);
  assert.match(cassetto, /Interrompi/);
  assert.match(cassetto, /Certificato valido/, "chi e coperto e escluso, con il motivo scritto");
  assert.match(cassetto, /locked=\{running\}/, "mentre gira non si chiude");
  const { isReminderEligible } = await modello();
  assert.equal(isReminderEligible({ status: "valid" }), false);
  for (const status of ["expiring", "expired", "missing"]) {
    assert.equal(isReminderEligible({ status }), true);
  }
});

/* ═══════════════════════════════════════════ §2.10–2.13 — permessi, stati, navigazione */

test("§2.10 · nessun permesso client oltre la guardia: la V1 non ne aveva e non se ne inventano", () => {
  assert.doesNotMatch(pagina, /canAccessClubResource|hasHealthPermission|clinical\./);
});

test("§2.11 · gli stati: scheletro, vuoto, filtrato-vuoto, errore con riprova, senza club", () => {
  assert.match(pagina, /state=\{loadError \? "error" : isLoading \? "loading" : "ready"\}/);
  assert.match(pagina, /onRetry=/);
  assert.match(pagina, /"Errore nel caricamento dei dati"/);
  assert.match(pagina, /title: "Nessun certificato trovato"/);
  assert.match(pagina, /description: "Prova a modificare i filtri di ricerca"/);
  assert.match(pagina, /title="Club non selezionato"/);
  assert.doesNotMatch(pagina, /animate-spin/, "niente spinner: lo scheletro ha la forma della griglia");
});

test("§2.13 · `?action=new` apre il cassetto e sparisce dall'indirizzo; `?view=` accende una vista", () => {
  assert.match(pagina, /if \(action === "new"\) \{[\s\S]{0,120}setShowCertificateDrawer\(true\)/);
  assert.match(pagina, /params\.delete\("action"\)/);
  assert.match(pagina, /window\.history\.replaceState\(window\.history\.state, "", nextUrl\)/);
  assert.match(pagina, /VIEW_QUERY_IDS\.has\(view\)/);
});

test("il guscio V2: un solo gradiente d'azione, niente chrome V1", () => {
  assert.equal((pagina.match(/variant="primary"/g) || []).length, 1, "il primario di pagina e uno solo");
  assert.doesNotMatch(pagina, /@\/components\/ui\/(card|badge|tabs|input|avatar|button)"/);
  assert.doesNotMatch(pagina, /bg-blue-600|bg-green-500|bg-amber-500/);
  assert.match(pagina, /bg-egw-page/);
});
