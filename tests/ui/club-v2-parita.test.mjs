import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Wave E — parita della scheda Club (`/organization`) dopo la migrazione al
 * Web V2. L'inventario e `docs/redesign/audit/wave-e-club.md`: ogni capacita
 * della V1 deve avere un posto nei sorgenti V2. Test sul sorgente, come le
 * altre regole di UI (15 - Testing).
 */

const SRC = path.join(process.cwd(), "src");
const read = (file) => readFileSync(path.join(SRC, file), "utf8");
const readCode = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGE = "app/organization/page.tsx";
const V2 = "components/organization/v2";
const FILES = {
  page: PAGE,
  model: `${V2}/club-model.ts`,
  sections: `${V2}/club-profile-sections.tsx`,
  federations: `${V2}/club-federations-section.tsx`,
  seasons: `${V2}/season-manager.tsx`,
  signature: `${V2}/club-signature-panel.tsx`,
  fiscal: `${V2}/fiscal-profile-panel.tsx`,
  causali: `${V2}/operation-types-panel.tsx`,
  gate: `${V2}/capability-gate.tsx`,
};

const all = () => Object.values(FILES).map(readCode).join("\n");

test("la pagina e composta con le fondamenta del Web V2", () => {
  const page = readCode(PAGE);
  assert.match(page, /<PageHeader/);
  assert.match(page, /<SectionNav/, "pattern 5: rail di sezione");
  assert.match(page, /<SegmentedControl/, "sotto xl le sezioni restano raggiungibili");
  assert.match(page, /className="flex min-w-0 flex-1 flex-col overflow-hidden"/);
  assert.match(page, /bg-egw-page/);
  assert.doesNotMatch(page, /from "@\/components\/ui\/(card|tabs|table|input|label|select)"/, "nessun componente V1 di layout");
  assert.doesNotMatch(all(), /window\.confirm|alert\(/, "niente conferme native");
});

test("le nove sezioni e gli stessi valori di ?tab= della V1", () => {
  const model = read(FILES.model);
  for (const id of ["generale", "fiscali", "bancari", "contatti", "federazione", "stagioni", "pagamenti", "fatturazione", "social"]) {
    assert.match(model, new RegExp(`id: "${id}"`), `sezione ${id}`);
  }
  for (const alias of ["stagione", "payments", "billing"]) {
    assert.match(model, new RegExp(`"${alias}"`), `alias ${alias} di ?tab=`);
  }
  const page = readCode(PAGE);
  assert.match(page, /resolveClubSection\(searchParams\?\.get\("tab"\)\)/, "il parametro tab resta l'indirizzo della sezione");
  assert.match(page, /query\.set\("tab", next\)/, "cambiare sezione riscrive ?tab=");
});

test("ogni campo della V1 e ancora nel modulo", () => {
  const sections = read(FILES.sections);
  for (const field of [
    "name", "foundingYear", "address", "businessName", "vatNumber", "fiscalCode", "taxRegime", "atecoCode", "sdiCode",
    "legalAddress", "representativeName", "representativeSurname", "representativeFiscalCode", "iban", "bankName",
    "companyEmail", "companyPec", "contact${index}Name", "contact${index}Phone", "contact${index}Email",
    "facebook", "instagram", "twitter", "youtube", "website",
  ]) {
    assert.ok(sections.includes(field), `campo ${field}`);
  }
  assert.match(sections, /<LogoUpload/);
  assert.match(sections, /<CapitalizedInput/, "il blocco condiviso della maiuscola si riusa");
  assert.match(sections, /<PhoneField/);
  assert.match(sections, /idPrefix="club-operational"/);
  assert.match(sections, /idPrefix="club-legal"/);
  assert.match(sections, /<AssistedFiscalCodeField[\s\S]*enableCompute=\{false\}/);
  assert.match(sections, /Inserisci tipologia/);
  assert.match(sections, /Inserisci nome sport/);
  assert.match(sections, /Scrivi il tuo regime fiscale/);
});

test("le liste chiuse della V1 non hanno perso una voce", () => {
  const model = read(FILES.model);
  for (const entry of ["Dilettante", "Professionista", "398/1991 (ASD/SSD)", "Forfettario (L.190/2014)", "Regime dei minimi", "Tiro con l'Arco", "FIGC - Federazione Italiana Giuoco Calcio", "UISP - Unione Italiana Sport Per tutti", "CSEN - Centro Sportivo Educativo Nazionale"]) {
    assert.ok(model.includes(entry), `manca «${entry}»`);
  }
  assert.equal((model.match(/^  "[^"]+",$/gm) || []).filter((line) => line.includes(" - ")).length, 28, "28 federazioni piu «Altro»");
});

test("l'autosave per sezione e intatto e resta un solo indicatore", () => {
  const page = read(PAGE);
  assert.match(page, /for \(const section of AUTOSAVE_SECTIONS\)/);
  assert.match(page, /validateClubProfileSection\(section, clubProfileDraft\)/);
  assert.match(page, /createCoalescingSaver/);
  assert.match(page, /saveClubProfileSection\(clubId, target\.section, payload\)/);
  assert.match(page, /syncClubIdentityLocally\(payload\.name\.trim\(\), payload\.logoUrl\)/);
  assert.match(page, /new CustomEvent\("club-updated"/);
  assert.equal((page.match(/<SaveStatus/g) || []).length, 1);
  assert.match(page, /rememberActiveSeason\(season\.id, season\.label, clubId\)/);
});

test("federazioni: griglia, cassetto e conferma al posto della tabella in linea", () => {
  const source = readCode(FILES.federations);
  assert.match(source, /<DataGrid<ClubFederationEntry>/);
  assert.match(source, /<Drawer/);
  assert.match(source, /useConfirm/);
  assert.match(source, /Nessuna affiliazione registrata/);
  assert.match(source, /Inserisci nome manualmente/);
  assert.match(source, /Es\. 123456/);
  assert.match(source, /todayLocalDateOnly\(\)/, "la data di affiliazione parte da oggi, come nella V1");
  assert.match(source, /SearchableSelect/, "oltre otto opzioni la tendina si cerca");
});

test("stagioni: stessi endpoint, stessi passi, stesse conferme", () => {
  const source = readCode(FILES.seasons);
  for (const fn of ["fetchSeasonsOverview", "createSeason", "updateSeasonStatus", "runSeasonRollover", "fetchSeasonRoster"]) {
    assert.match(source, new RegExp(`\\b${fn}\\(`), fn);
  }
  for (const text of [
    "Nuova stagione", "Rendila subito la stagione attiva", "Indica la data di inizio e la data di fine",
    "La data di fine deve essere successiva a quella di inizio", "Stagione di origine", "Restano disponibili senza copia",
    "Non vengono mai riportati", "Nessun tesserato da riconfermare", "Cerca per nome o squadra", "Calcola anteprima",
    "Conferma riporto", "Cambiare stagione attiva?", "Attiva stagione", "Archivia", "Assegnali", "Ultimo riporto",
    "Riporta dati", "Senza squadra di destinazione", "Riprova",
  ]) {
    assert.ok(source.includes(text), `manca «${text}»`);
  }
  assert.match(source, /preview: true/);
  assert.match(source, /athleteIds: confirmedAthleteIds/);
  assert.match(source, /rosterNonCaricato/, "un elenco che non si e caricato ferma il passo");
  assert.match(source, /StatusPill/);
  assert.match(source, /SEASON_STATUS_SPEC/);
  assert.match(source, /<StepperHeader/, "la procedura ha lo stepper di 08 §8.5");
  assert.match(source, /width="wide"/, "procedura e riporto stanno in un cassetto a 720");
});

test("firma e timbro: stesso trasporto, permesso assente e non spento", () => {
  const source = readCode(FILES.signature);
  assert.match(source, /@\/lib\/api\/club-signature/);
  assert.match(source, /canManageClubConfigurationAsActor/);
  assert.match(source, /\{canManage \? \(/, "senza permesso i comandi non esistono");
  assert.doesNotMatch(source, /disabled=\{!canManage\}/);
  assert.match(source, /Salva prima la scheda del club/);
  assert.match(source, /immagine salvata/);
  assert.match(source, /immagine rimossa/);
  assert.match(source, /tone: "danger"/, "la rimozione e una conferma distruttiva");
});

test("profilo fiscale: stessi campi e stesso endpoint", () => {
  const source = read(FILES.fiscal);
  assert.match(source, /\/api\/v1\/fiscal\/profile/);
  assert.match(source, /method: "PUT"/);
  for (const key of ["legalName", "fiscalCode", "vatNumber", "address", "city", "postalCode", "province", "pec", "recipientCode", "reaOffice", "reaNumber", "legalForm", "taxRegimeCode", "specialRegimes", "stampDuty", "thresholdCents", "amountCents"]) {
    assert.ok(source.includes(key), `manca ${key}`);
  }
  assert.match(source, /Cosa manca/);
  assert.match(source, /fattura elettronica/);
  assert.match(source, /Salva profilo fiscale/);
  assert.match(source, /Profilo fiscale aggiornato/);
});

test("causali: griglia con viste, cassetto a 720, permesso dalla rotta", () => {
  const source = readCode(FILES.causali);
  assert.match(source, /\/api\/v1\/fiscal\/operation-types/);
  assert.match(source, /action=delete/);
  assert.match(source, /permissions\?\.canManage/, "il permesso arriva dalla rotta, non dal ruolo");
  assert.match(source, /<DataGrid<OperationType>/);
  assert.match(source, /id: "da_classificare"/, "«non dichiarato» e una vista con la sua tinta");
  assert.match(source, /hidden: \(voce\) => !canManage \|\| voce\.isSystem/, "una voce di sistema non si elimina");
  for (const text of ["Verso suggerito", "Documento da emettere", "Ambito di attivita", "Detraibile (730)", "Quota associativa", "Voce di rendiconto", "Descrizione predefinita", "Non dichiarato", "Nuova causale", "Es. Affitto della palestra", "Il nome della causale deve contenere delle lettere"]) {
    assert.ok(source.includes(text), `manca «${text}»`);
  }
  assert.match(source, /useConfirm/, "l'eliminazione chiede conferma");
});

test("pagamenti e fatturazione restano dietro il gate e in sola lettura", () => {
  const page = readCode(PAGE);
  assert.match(page, /<CapabilityGate feature="online_payments">/);
  assert.match(page, /<ClubPaymentSettings/);
  assert.match(page, /<ClubBillingSettings[\s\S]{0,240}readOnly/);
  assert.match(page, /<FiscalProfilePanel/);
  assert.match(page, /<OperationTypesPanel/);
  const gate = read(FILES.gate);
  assert.match(gate, /\/api\/v1\/entitlements\?organization_id=/);
  assert.match(gate, /<AlertBlock/);
});

test("la V1 specifica della rotta non esiste piu", () => {
  for (const removed of [
    "components/organization/season-manager.tsx",
    "components/organization/club-signature-panel.tsx",
    "components/fiscal/FiscalProfilePanel.tsx",
    "components/fiscal/OperationTypesPanel.tsx",
    "components/club/capability-gate.tsx",
    "app/organization/payment-methods-config.tsx",
  ]) {
    assert.equal(existsSync(path.join(SRC, removed)), false, `${removed} doveva sparire`);
  }
});

test("niente esclamativi, emoji o gradienti inventati nei sorgenti V2", () => {
  const source = all();
  assert.doesNotMatch(source, /bg-gradient-to-/);
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}]/u, "niente emoji");
  assert.doesNotMatch(source, /[a-zA-Z]!(?!=)/, "niente punti esclamativi nel testo");
});
