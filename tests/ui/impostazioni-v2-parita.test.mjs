import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Wave E — parita di `/settings` dopo la migrazione al Web V2. L'inventario
 * e `docs/redesign/audit/wave-e-impostazioni.md`. Le preferenze della V1
 * restano tutte; il modulo «Sicurezza» sparisce perche non cambiava nessuna
 * password (difetto V1 dichiarato) e lascia il posto alle due porte vere.
 */

const SRC = path.join(process.cwd(), "src");
const read = (file) => readFileSync(path.join(SRC, file), "utf8");
const readCode = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGE = "app/settings/page.tsx";
const MODEL = "components/settings/v2/settings-model.ts";
const SECTIONS = "components/settings/v2/settings-sections.tsx";

test("la pagina e composta con le fondamenta del Web V2", () => {
  const page = readCode(PAGE);
  assert.match(page, /<PageHeader/);
  assert.match(page, /<SectionNav/);
  assert.match(page, /<SegmentedControl/);
  assert.match(page, /className="flex min-w-0 flex-1 flex-col overflow-hidden"/);
  assert.match(page, /bg-egw-page/);
  assert.doesNotMatch(page, /from "@\/components\/ui\/(card|tabs|input|label|switch)"/);
  assert.doesNotMatch(page + readCode(SECTIONS), /window\.confirm|alert\(|window\.location\.reload/);
});

test("stessa lettura e stessa scrittura della V1", () => {
  const page = readCode(PAGE);
  assert.match(page, /getClubSettings\(activeClub\.id\)/);
  assert.match(page, /saveClubSettings\(clubId, \{ notifications: preferences\.notifications \}\)/);
  assert.match(page, /saveClubSettings\(clubId, \{ system: preferences\.system \}\)/);
  assert.match(page, /localStorage\.getItem\("activeClub"\)/);
  assert.match(page, /document\.documentElement\.lang = preferences\.system\.language/);
  assert.match(page, /localStorage\.setItem\("app-language"/);
  assert.match(page, /new CustomEvent\("language-change"/);
  for (const toast of [
    "Preferenze notifiche salvate con successo",
    "Errore nel salvataggio delle preferenze notifiche",
    "Impostazioni sistema salvate con successo",
    "Errore nel salvataggio delle impostazioni sistema",
    "Errore nel caricamento delle impostazioni",
    "ID club non disponibile",
    "ID Club non trovato",
  ]) {
    assert.ok(page.includes(toast), `manca «${toast}»`);
  }
});

test("le preferenze, i default e le opzioni sono quelli della V1", () => {
  const model = read(MODEL);
  assert.match(model, /certificates: true, trainings: true, athletes: true, email: true/);
  assert.match(model, /language: "it", dateFormat: "dd\/mm\/yyyy", backup: true/);
  for (const option of ['"it"', '"en"', '"es"', '"fr"', '"dd/mm/yyyy"', '"mm/dd/yyyy"', '"yyyy-mm-dd"']) {
    assert.ok(model.includes(option), `manca l'opzione ${option}`);
  }
  for (const label of ["Certificati in scadenza", "Allenamenti", "Nuovi atleti", "Notifiche email", "Ricevi notifiche anche via email"]) {
    assert.ok(model.includes(label), `manca «${label}»`);
  }
  const sections = read(SECTIONS);
  for (const text of ["Salva preferenze", "Salva impostazioni", "Lingua", "Formato data", "Backup automatico", "Esegui backup automatici dei dati"]) {
    assert.ok(sections.includes(text), `manca «${text}»`);
  }
  assert.match(sections, /<Toggle/);
  assert.match(sections, /Attiva" : "Non attiva/, "lo stato di un interruttore e detto a parole");
});

test("le tre sezioni sono raggiungibili con ?tab=", () => {
  const model = read(MODEL);
  for (const id of ["notifiche", "sistema", "sicurezza"]) {
    assert.match(model, new RegExp(`id: "${id}"`));
  }
  const page = readCode(PAGE);
  assert.match(page, /resolveSettingsSection\(searchParams\?\.get\("tab"\)\)/);
  assert.match(page, /router\.replace\(`\/settings\?tab=\$\{next\}`/);
});

test("il modulo Sicurezza che fingeva un invio e sparito: restano le porte vere", () => {
  const sections = readCode(SECTIONS);
  const page = readCode(PAGE);
  assert.doesNotMatch(page + sections, /lastPasswordChange|lastPinChange|type="password"|maxLength=\{4\}/);
  assert.match(sections, /href="\/auth\/forgot-password"/);
  assert.match(sections, /href="\/account"/);
  assert.match(sections, /Password e accessi/);
});

test("niente esclamativi, emoji o gradienti inventati", () => {
  const source = readCode(PAGE) + readCode(SECTIONS);
  assert.doesNotMatch(source, /bg-gradient-to-/);
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}]/u);
  assert.doesNotMatch(source, /[a-zA-Z]!(?!=)/, "niente punti esclamativi nel testo");
});
