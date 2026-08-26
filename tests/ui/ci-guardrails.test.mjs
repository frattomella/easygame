import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * I guardrail della CI, rifatti qui.
 *
 * **Il difetto trovato nel Blocco Finale C.** Un test scriveva una chiave
 * Stripe finta con il **prefisso vero**. Il guardrail della CI cerca quel
 * prefisso fra i file tracciati e non puo distinguere una chiave inventata da
 * una vera: e il suo mestiere non farlo. Il job «Guardrail di sicurezza» era
 * quindi rosso dal commit che ha introdotto CediPay, e un allarme di sicurezza
 * sempre rosso e un allarme che si smette di guardare.
 *
 * **Perche rifarli qui.** Un guardrail che si scopre rotto solo dopo un push
 * costa un giro completo di CI per ogni tentativo, e — peggio — si scopre
 * **dopo** che il commit e stato scritto. Qui costano un secondo.
 *
 * Questi test leggono l'elenco dei file **tracciati da Git**, non la cartella:
 * cio che non e committato non puo far fallire la CI, e includerlo
 * produrrebbe falsi allarmi su `.env` locali e artefatti di build.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");

const trackedFiles = () =>
  execFileSync("git", ["ls-files"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split(/\r?\n/)
    .filter(Boolean);

/** Gli stessi esclusi della CI, piu questo file, che contiene i pattern. */
const EXCLUDED = new Set([
  "package-lock.json",
  "easygamemobile/package-lock.json",
  ".github/workflows/ci.yml",
  "tests/ui/ci-guardrails.test.mjs",
]);

const readableFiles = () =>
  trackedFiles()
    .filter((file) => !EXCLUDED.has(file))
    .map((file) => {
      try {
        return { file, content: fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8") };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    /*
      Un binario letto come testo produce corrispondenze casuali. Il carattere
      nullo e il modo in cui `git grep -I` stesso riconosce un binario.
    */
    .filter(({ content }) => !content.includes(String.fromCharCode(0)));

test("nessun file .env reale e tracciato", () => {
  const committed = trackedFiles().filter((file) =>
    /(^|\/)\.env($|\.local$|\.production$)/.test(file),
  );

  assert.deepEqual(committed, [], "solo i template .env*.example vanno committati");
});

test("nessun file tracciato contiene qualcosa che sembri un segreto", () => {
  const pattern = new RegExp(
    [
      "sk_" + "live_",
      "sk_" + "test_",
      "AKIA[0-9A-Z]{16}",
      "ghp_[A-Za-z0-9]{20,}",
      "github_" + "pat_",
      "xox[baprs]-",
      "AIza[0-9A-Za-z_-]{30,}",
      "-----BEGIN [A-Z ]*PRIVATE KEY",
      "SG\\.[A-Za-z0-9_-]{20,}",
    ].join("|"),
  );

  const colpevoli = readableFiles()
    .filter(({ content }) => pattern.test(content))
    .map(({ file }) => file);

  assert.deepEqual(
    colpevoli,
    [],
    "il job «Guardrail di sicurezza» della CI fallirebbe su questi file",
  );
});

test("nessuna connection string con credenziali verso un host remoto", () => {
  const pattern = /postgres(ql)?:\/\/[^:/@\s]+:[^@\s]+@[^\s"']+/g;

  const colpevoli = [];
  for (const { file, content } of readableFiles()) {
    for (const match of content.match(pattern) || []) {
      if (match.includes("://USER:PASSWORD@")) continue;
      if (/@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(match)) continue;
      colpevoli.push(`${file}: ${match.slice(0, 40)}…`);
    }
  }

  assert.deepEqual(
    colpevoli,
    [],
    "solo placeholder e host di loopback possono stare nei file tracciati",
  );
});

test("il mobile non nomina il database", () => {
  const colpevoli = readableFiles()
    .filter(({ file }) => file.startsWith("easygamemobile/"))
    .filter(({ content }) => content.includes("DATABASE_URL"))
    .map(({ file }) => file);

  assert.deepEqual(
    colpevoli,
    [],
    "il mobile deve usare solo le API EasyGame (ADR-0018)",
  );
});
