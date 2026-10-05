import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * **Il gestionale e il sito pubblico sono due alberi** (ADR-0200 §4).
 *
 * Il sito di un club non deve scaricare la sessione, il guscio, i toast, il
 * tema o l'editor del gestionale. La garanzia e strutturale — due root layout
 * in due gruppi di rotte — e questo file la tiene ferma: se qualcuno rimette un
 * root layout comune, o importa un provider del gestionale nel renderer del
 * sito, fallisce qui e non in un audit di performance.
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const APP_DIR = path.join(ROOT, "src", "app");
const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), "utf8");
/* I commenti spiegano cosa NON si importa, e nominarlo non e importarlo. */
const code = (...segments) =>
  read(...segments)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
};

test("non esiste piu un root layout comune ai due alberi", () => {
  assert.equal(
    fs.existsSync(path.join(APP_DIR, "layout.tsx")),
    false,
    "src/app/layout.tsx imporrebbe i provider del gestionale anche al sito pubblico",
  );
});

test("in src/app ci sono solo le API e i due gruppi di rotte", () => {
  const voci = fs
    .readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(voci, ["(app)", "(site)", "api"]);
});

test("il gestionale monta i suoi provider e il suo CSS", () => {
  const layout = read("src", "app", "(app)", "layout.tsx");
  assert.match(layout, /AppClientProviders/);
  assert.match(layout, /globals\.css/);
  assert.match(layout, /<html/);
});

test("il sito pubblico ha un root layout suo, senza nulla del gestionale", () => {
  const layout = code("src", "app", "(site)", "layout.tsx");
  assert.match(layout, /<html/);
  assert.match(layout, /styles\/website\/site\.css/);
  for (const vietato of [
    "AppClientProviders",
    "AuthProvider",
    "ShellProvider",
    "ToastProvider",
    "Toaster",
    "ThemeProvider",
    "globals.css",
    "egw-",
  ]) {
    assert.equal(
      layout.includes(vietato),
      false,
      `il layout del sito non deve contenere «${vietato}»`,
    );
  }
});

test("il CSS del sito non importa i token del gestionale", () => {
  const css = code("src", "styles", "website", "site.css");
  assert.equal(/egw-|globals\.css/.test(css), false);
  assert.match(css, /@config "\.\.\/\.\.\/\.\.\/tailwind\.website\.config\.ts"/);
});

const IMPORT_VIETATI = [
  /@\/components\/providers\//,
  /@\/components\/web\/shell\//,
  /@\/components\/website\/editor\//,
  /@\/components\/ui\//,
  /@\/components\/auth\//,
  /@\/lib\/simplified-db/,
  /@\/lib\/api\/client/,
];

test("il renderer del sito non importa il gestionale ne l'editor", () => {
  const files = [
    ...walk(path.join(APP_DIR, "(site)")),
    ...walk(path.join(ROOT, "src", "components", "website", "render")),
  ];
  const violazioni = [];
  for (const file of files) {
    const source = fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const pattern of IMPORT_VIETATI) {
      if (pattern.test(source)) {
        violazioni.push(`${path.relative(ROOT, file)} → ${pattern}`);
      }
    }
  }
  assert.deepEqual(violazioni, [], violazioni.join("\n"));
});

test("le aree storiche del gestionale sono tutte dentro (app), con gli stessi URL", () => {
  for (const area of [
    "athletes",
    "dashboard",
    "matches",
    "sponsors",
    "forms",
    "login",
    "organization",
    "hub",
    "private",
  ]) {
    assert.ok(
      fs.existsSync(path.join(APP_DIR, "(app)", area)),
      `manca src/app/(app)/${area}`,
    );
  }
  assert.ok(fs.existsSync(path.join(APP_DIR, "(app)", "page.tsx")), "la home del gestionale");
});
