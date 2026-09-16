import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **Il marchio che si legge a schermo e CediSoft.**
 *
 * «powered by Francesco srl» stava nel piede della pagina di accesso e in
 * fondo alla barra dell'allenatore: due superfici user-facing con il vecchio
 * nome. Il nuovo e uno solo, e vive nella pagina di accesso — il piede dentro
 * l'applicazione non esiste (guideline 06 §6.1: nessun «powered by» nella
 * barra laterale).
 *
 * Il presidio guarda **solo** cio che l'utente legge: i sorgenti Web sotto
 * `src/`, esclusi gli endpoint. Autori git, metadati tecnici e dati storici
 * non sono superfici e non entrano qui.
 */
const RADICE = process.cwd();
const SRC = path.join(RADICE, "src");

const raccogli = (cartella, trovati = []) => {
  for (const voce of readdirSync(cartella)) {
    const completo = path.join(cartella, voce);
    if (statSync(completo).isDirectory()) {
      if (completo.includes(`${path.sep}app${path.sep}api`)) continue;
      raccogli(completo, trovati);
      continue;
    }
    if (/\.(tsx|ts|css)$/.test(completo)) trovati.push(completo);
  }
  return trovati;
};

const FILE = raccogli(SRC);
const VECCHIO = /francesco\s*srl|powered\s+by\s+francesco/i;

test("nessuna superficie user-facing nomina il vecchio marchio", () => {
  const colpevoli = FILE.filter((file) => VECCHIO.test(readFileSync(file, "utf8"))).map((file) =>
    path.relative(RADICE, file).split(path.sep).join("/"),
  );
  assert.deepEqual(colpevoli, [], "il marchio visibile e CediSoft");
});

test("il credito «powered by CediSoft» sta nel guscio fuori dal club, e solo li", () => {
  const conCredito = FILE.filter((file) => /powered by CediSoft/.test(readFileSync(file, "utf8"))).map((file) =>
    path.relative(RADICE, file).split(path.sep).join("/"),
  );
  assert.deepEqual(conCredito, ["src/components/web/shell/OutsideShell.tsx"]);
});

test("il centro assistenza punta al dominio CediSoft", () => {
  const nav = readFileSync(path.join(SRC, "components/web/shell/navigation.ts"), "utf8");
  assert.match(nav, /HELP_URL = "https:\/\/www\.cedisoft\.it\//);
});
