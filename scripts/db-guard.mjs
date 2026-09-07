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

/**
 * **L'etichetta e l'host devono dire la stessa cosa.**
 *
 * Fino a qui la guardia autorizzava guardando **soltanto** `EASYGAME_DB_ENV`.
 * `describeTarget()` sapeva gia estrarre l'host da `DATABASE_URL` — e lo
 * stampava — ma quel valore non entrava in nessuna decisione: veniva passato
 * all'operatore perche lo guardasse lui.
 *
 * Lo scenario che apre, in tre mosse tutte ordinarie:
 *
 * 1. serve leggere un dato su staging, e si mette la connection string Neon in
 *    `DATABASE_URL`;
 * 2. `EASYGAME_DB_ENV` resta `"development"`, perche per **leggere** nessuno
 *    chiede di cambiarla;
 * 3. il giorno dopo si lancia `npm run db:push` per allineare uno schema
 *    locale. La guardia legge `development`, stampa l'host di Neon nella riga
 *    di conferma, ed **esce zero**.
 *
 * Una guardia che ha l'host davanti e non lo guarda protegge solo chi era gia
 * attento. E la finestra di migrazione e esattamente il momento in cui una
 * connection string di staging vive nel `.env` di qualcuno.
 *
 * La regola: `development` vale solo se il database e **locale**. Ogni altro
 * host va nominato per quello che e, e passa solo dall'override esplicito —
 * che stampa gia il proprio avviso.
 */
const HOST_LOCALI = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
  "postgres",
  "db",
]);

const hostDelTarget = () => {
  const raw = String(process.env.DATABASE_URL || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const eLocale = (host) => {
  if (!host) return false;
  if (HOST_LOCALI.has(host)) return true;
  /* Un indirizzo di rete privata: il Postgres in container, o una VM di casa. */
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
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
  const host = hostDelTarget();

  if (!eLocale(host)) {
    fail([
      `EASYGAME_DB_ENV dice "development", ma DATABASE_URL punta a ${host || "un host che non si riesce a leggere"}.`,
      "",
      "Le due cose non possono contraddirsi: l'etichetta dice dove *credi* di",
      "scrivere, l'host dice dove *scriveresti*. Quando divergono vince",
      "l'host, perche e quello che riceve le righe.",
      "",
      "Succede per una ragione sola e del tutto normale: la connection string",
      "di un ambiente condiviso e finita nel .env per **leggere** qualcosa, e",
      "l'etichetta e rimasta indietro perche per leggere nessuno la cambia.",
      "",
      "Per procedere:",
      "  - rimetti in DATABASE_URL il database di sviluppo locale; oppure",
      "  - se devi davvero scrivere su un ambiente condiviso, serve",
      "    autorizzazione esplicita e poi EASYGAME_ALLOW_SHARED_DB_WRITE=1",
      "    per quel singolo comando.",
    ]);
  }

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
