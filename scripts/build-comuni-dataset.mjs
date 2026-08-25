#!/usr/bin/env node
/**
 * Rigenera `src/data/comuni-istat.json` dalla fonte ufficiale ISTAT.
 *
 * Perche uno script e non un file scritto a mano: ADR-0027 vieta di inventare
 * la tabella dei comuni, perche un codice catastale sbagliato produce un
 * codice fiscale formalmente valido e sostanzialmente falso. L'unico modo di
 * tenere fede a quel divieto nel tempo e poter **rifare** il file dalla fonte
 * e confrontarlo, invece di fidarsi di come e nato.
 *
 * La fonte e l'elenco dei codici delle unita amministrative territoriali
 * pubblicato da ISTAT, che nella stessa riga porta denominazione, sigla della
 * provincia, regione e **codice catastale (Belfiore)** del comune — lo stesso
 * codice usato dall'Agenzia delle Entrate per il codice fiscale.
 *
 * Uso:
 *
 *   node scripts/build-comuni-dataset.mjs            # scarica e rigenera
 *   node scripts/build-comuni-dataset.mjs --check    # verifica senza scrivere
 *   node scripts/build-comuni-dataset.mjs --from x.csv
 *
 * Lo script **non** ha una modalita che scrive un file che non ha superato i
 * controlli: se la fonte cambia forma, fallisce e lascia il dataset com'era.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SOURCE_URL =
  "https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv";

const OUTPUT = path.join(process.cwd(), "src", "data", "comuni-istat.json");

/** Colonne usate, per indice nel CSV ISTAT. */
const COLUMN = {
  nameItalian: 6,
  nameOther: 7,
  region: 10,
  provinceCode: 14,
  belfiore: 19,
};

/**
 * Soglie di sanita. Non sono decorative: se la fonte cambia formato le colonne
 * scivolano e senza questi controlli il file uscirebbe pieno di stringhe
 * plausibili e sbagliate.
 */
const MIN_ROWS = 7000;
const MAX_ROWS = 8600;

const parseCsv = (text, separator) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === separator) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
};

const fail = (message) => {
  console.error(`build-comuni-dataset: ${message}`);
  process.exit(1);
};

const loadSource = async (fromFile) => {
  if (fromFile) {
    return readFileSync(fromFile);
  }

  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    fail(`la fonte ISTAT ha risposto ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const build = (buffer) => {
  // Il file ISTAT e in ISO-8859-1: letto come UTF-8 diventa "Aglie'" con il
  // carattere di sostituzione, e il nome del comune finisce sbagliato.
  const rows = parseCsv(buffer.toString("latin1"), ";");
  const header = rows[0] || [];

  if (!/Codice Catastale/i.test(header[COLUMN.belfiore] || "")) {
    fail(
      `la colonna ${COLUMN.belfiore} non e piu il codice catastale ` +
        `(trovato: "${header[COLUMN.belfiore]}"). La fonte ha cambiato forma.`,
    );
  }

  const comuni = [];
  const seenBelfiore = new Set();

  for (const row of rows.slice(1)) {
    const belfiore = String(row[COLUMN.belfiore] || "").trim().toUpperCase();
    const name = String(row[COLUMN.nameItalian] || "").trim();
    const provinceCode = String(row[COLUMN.provinceCode] || "")
      .trim()
      .toUpperCase();

    if (!belfiore && !name) continue;

    if (!/^[A-Z]\d{3}$/.test(belfiore)) {
      fail(`codice catastale malformato per "${name}": "${belfiore}"`);
    }
    if (!name) fail(`comune senza denominazione (catastale ${belfiore})`);
    if (!/^[A-Z]{2}$/.test(provinceCode)) {
      fail(`sigla provincia malformata per "${name}": "${provinceCode}"`);
    }
    if (seenBelfiore.has(belfiore)) {
      fail(`codice catastale duplicato: ${belfiore} (${name})`);
    }
    seenBelfiore.add(belfiore);

    const other = String(row[COLUMN.nameOther] || "").trim();
    const entry = [name, provinceCode, belfiore];
    if (other && other !== name) entry.push(other);

    comuni.push(entry);
  }

  if (comuni.length < MIN_ROWS || comuni.length > MAX_ROWS) {
    fail(
      `${comuni.length} comuni: fuori dall'intervallo atteso ` +
        `${MIN_ROWS}-${MAX_ROWS}. Controlla la fonte prima di scrivere.`,
    );
  }

  comuni.sort((left, right) => left[0].localeCompare(right[0], "it"));

  return {
    source: {
      name: "ISTAT — Codici delle unita amministrative territoriali",
      url: SOURCE_URL,
      license: "CC BY 4.0",
      sha256: createHash("sha256").update(buffer).digest("hex"),
      rows: comuni.length,
    },
    /** Ogni comune e `[denominazione, siglaProvincia, catastale, altroNome?]`. */
    fields: ["name", "province", "belfiore", "otherName"],
    comuni,
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const fromIndex = args.indexOf("--from");
  const fromFile = fromIndex >= 0 ? args[fromIndex + 1] : null;

  const built = build(await loadSource(fromFile));
  const serialized = `${JSON.stringify(built, null, 0)}\n`;

  if (checkOnly) {
    const current = readFileSync(OUTPUT, "utf8");
    const currentRows = JSON.parse(current).comuni.length;
    if (current === serialized) {
      console.log(`invariato: ${built.comuni.length} comuni`);
      return;
    }
    fail(
      `il dataset in repo (${currentRows} comuni) differisce dalla fonte ` +
        `(${built.comuni.length}). Rigenera senza --check e leggi il diff.`,
    );
  }

  writeFileSync(OUTPUT, serialized);
  console.log(
    `scritto ${path.relative(process.cwd(), OUTPUT)}: ` +
      `${built.comuni.length} comuni, sha256 fonte ${built.source.sha256.slice(0, 12)}`,
  );
};

main().catch((error) => fail(error?.message || String(error)));
