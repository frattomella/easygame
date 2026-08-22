#!/usr/bin/env node
/**
 * Guardia sui comandi di scrittura verso il database.
 *
 * Contesto (ADR-0012): fino alla creazione del branch Neon dedicato allo
 * sviluppo, il `.env` locale punta allo stesso database usato da staging.
 * Un `prisma migrate dev`, un `db push` o un `prisma:seed` lanciati per
 * distrazione scrivono quindi sull'ambiente ufficiale del prodotto.
 *
 * Questa guardia rende impossibile eseguire quei comandi senza dichiarare
 * esplicitamente che il target e un database di sviluppo.
 *
 * Uso: `node scripts/db-guard.mjs <etichetta-comando>`
 * Esce con codice 1 se il comando non e consentito.
 *
 * NON va applicata a `prisma migrate deploy` nel build di Vercel: quello e il
 * percorso legittimo con cui gli ambienti ricevono le migrazioni.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const loadEnvFile = (fileName) => {
  const filePath = path.join(projectRoot, fileName);
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
};

loadEnvFile(".env.local");
loadEnvFile(".env");

const commandLabel = process.argv[2] || "comando di scrittura sul database";

const describeTarget = () => {
  const raw = String(process.env.DATABASE_URL || "").trim();
  if (!raw) return "DATABASE_URL non impostata";
  try {
    const url = new URL(raw);
    // Solo host e database: mai utente, password o query string.
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "DATABASE_URL non interpretabile";
  }
};

const dbEnv = String(process.env.EASYGAME_DB_ENV || "").trim().toLowerCase();
const override =
  String(process.env.EASYGAME_ALLOW_SHARED_DB_WRITE || "").trim() === "1";

const fail = (lines) => {
  console.error("");
  console.error("  ┌──────────────────────────────────────────────────────────┐");
  console.error("  │  SCRITTURA SUL DATABASE BLOCCATA                         │");
  console.error("  └──────────────────────────────────────────────────────────┘");
  console.error("");
  console.error(`  Comando:  ${commandLabel}`);
  console.error(`  Target:   ${describeTarget()}`);
  console.error("");
  for (const line of lines) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
};

if (override) {
  console.warn("");
  console.warn(
    `  ATTENZIONE: EASYGAME_ALLOW_SHARED_DB_WRITE=1 — guardia disattivata per: ${commandLabel}`,
  );
  console.warn(`  Target: ${describeTarget()}`);
  console.warn("  Usa questo override solo con autorizzazione esplicita.");
  console.warn("");
  process.exit(0);
}

if (dbEnv === "development") {
  console.log(`  Database target dichiarato: development (${describeTarget()})`);
  process.exit(0);
}

if (dbEnv === "staging" || dbEnv === "production") {
  fail([
    `EASYGAME_DB_ENV vale "${dbEnv}": questo comando modifica i dati di un`,
    "ambiente condiviso e non puo essere eseguito dalla postazione locale.",
    "",
    "Le migrazioni raggiungono staging tramite il deploy Vercel, che esegue",
    "`prisma migrate deploy`. Non serve lanciarle a mano.",
    "",
    "Vedi docs/knowledge-base/13-environments.md e ADR-0012.",
  ]);
}

fail([
  "EASYGAME_DB_ENV non e impostata, quindi non e possibile stabilire su quale",
  "database scriverebbe questo comando.",
  "",
  "Fino alla creazione del branch Neon di sviluppo, il .env locale punta allo",
  "stesso database di staging: un comando di scrittura lo modificherebbe.",
  "",
  "Per procedere:",
  "  1. crea il branch Neon di sviluppo (vedi 13-environments.md);",
  "  2. metti la sua connection string in DATABASE_URL / DIRECT_URL;",
  '  3. aggiungi al .env locale:  EASYGAME_DB_ENV="development"',
  "",
  "Se devi davvero scrivere su un ambiente condiviso, serve autorizzazione",
  "esplicita e poi EASYGAME_ALLOW_SHARED_DB_WRITE=1 per quel singolo comando.",
]);
