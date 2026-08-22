import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const MIN_NODE_VERSION = "18.17.0";
const DEFAULT_PORT = 3001;
const FALLBACK_PORT = 3002;
const LOCAL_HOSTNAME = "127.0.0.1";
const BROWSER_DELAY_MS = 6000;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = findProjectRoot(path.resolve(scriptDir, ".."));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

let devProcess = null;
let shuttingDown = false;
let browserTimer = null;

function printTitle() {
  console.log("");
  console.log("================================");
  console.log(" EasyGame - Avvio locale");
  console.log("================================");
  console.log("");
}

function logStep(message) {
  console.log(`[OK] ${message}`);
}

function logInfo(message) {
  console.log(`[INFO] ${message}`);
}

function logWarn(message) {
  console.log(`[ATTENZIONE] ${message}`);
}

function findProjectRoot(startDirectory) {
  let current = startDirectory;

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    const prismaSchemaPath = path.join(current, "prisma", "schema.prisma");

    if (fs.existsSync(packageJsonPath) && fs.existsSync(prismaSchemaPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        "Non riesco a trovare la root del progetto EasyGame. Avvia lo script dalla cartella del progetto.",
      );
    }

    current = parent;
  }
}

function readPackageJson() {
  const packageJsonPath = path.join(projectRoot, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("package.json non trovato nella cartella del progetto.");
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`package.json non e' valido: ${error.message}`);
  }
}

function parseVersion(version) {
  return String(version)
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function versionAtLeast(actual, minimum) {
  const actualParts = parseVersion(actual);
  const minimumParts = parseVersion(minimum);

  for (let index = 0; index < Math.max(actualParts.length, minimumParts.length); index += 1) {
    const actualPart = actualParts[index] || 0;
    const minimumPart = minimumParts[index] || 0;

    if (actualPart > minimumPart) {
      return true;
    }

    if (actualPart < minimumPart) {
      return false;
    }
  }

  return true;
}

function runCapture(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    ...options,
  });
}

function runInteractive(label, command, args, envValues) {
  logInfo(label);

  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: buildChildEnv(envValues),
    stdio: "inherit",
    windowsHide: false,
  });

  if (result.error) {
    throw new Error(`${label} non riuscito: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label} terminato con codice ${result.status}.`);
  }
}

function checkNode() {
  const currentVersion = process.version;

  if (!versionAtLeast(currentVersion, MIN_NODE_VERSION)) {
    throw new Error(
      `Node.js ${currentVersion} non e' compatibile. Installa Node.js LTS ${MIN_NODE_VERSION} o superiore da https://nodejs.org/`,
    );
  }

  logStep(`Node.js ${currentVersion} rilevato`);
}

function checkNpm() {
  const result = runCapture(npmCommand, ["--version"]);

  if (result.error) {
    throw new Error(
      "npm non trovato. Installa Node.js LTS da https://nodejs.org/ e riavvia questo launcher.",
    );
  }

  if (result.status !== 0) {
    throw new Error("npm non risponde correttamente. Verifica l'installazione di Node.js.");
  }

  logStep(`npm ${String(result.stdout).trim()} rilevato`);
}

function stripQuotes(value) {
  const trimmed = String(value || "").trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function parseEnvFile(envPath) {
  const values = {};
  const content = fs.readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice(7).trim() : line;
    const equalsIndex = normalizedLine.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = normalizedLine.slice(0, equalsIndex).trim();
    const value = normalizedLine.slice(equalsIndex + 1).trim();

    if (/^[A-Z0-9_]+$/.test(key)) {
      values[key] = stripQuotes(value);
    }
  }

  return values;
}

function isPlaceholderValue(value) {
  const normalized = stripQuotes(value);

  if (!normalized) {
    return true;
  }

  return (
    /USER:PASSWORD/i.test(normalized) ||
    /HOST:PORT/i.test(normalized) ||
    /YOUR_|CHANGE_ME|CHANGEME|TODO|INSERISCI/i.test(normalized) ||
    /<[^>]+>/.test(normalized)
  );
}

function ensureEnvFile() {
  const envPath = path.join(projectRoot, ".env");
  const examplePath = path.join(projectRoot, ".env.example");

  if (!fs.existsSync(envPath)) {
    if (!fs.existsSync(examplePath)) {
      throw new Error(
        ".env non trovato e .env.example non esiste. Crea .env con DATABASE_URL e DIRECT_URL.",
      );
    }

    fs.copyFileSync(examplePath, envPath);
    throw new Error(
      "Ho creato .env da .env.example. Inserisci DATABASE_URL e DIRECT_URL, poi riavvia.",
    );
  }

  const envValues = parseEnvFile(envPath);
  const missing = ["DATABASE_URL", "DIRECT_URL"].filter((key) => isPlaceholderValue(envValues[key]));

  if (missing.length > 0) {
    throw new Error(
      `Configurazione .env incompleta. Compila ${missing.join(
        " e ",
      )} con le URL PostgreSQL/Neon, poi riavvia.`,
    );
  }

  warnIfSharedDatabase(envValues);

  logStep(".env trovato e variabili database presenti");
  return envValues;
}

function ensureNodeModules(envValues) {
  const nodeModulesPath = path.join(projectRoot, "node_modules");

  if (fs.existsSync(nodeModulesPath)) {
    logStep("node_modules presente");
    return;
  }

  logWarn("node_modules non trovato. Avvio npm install, puo' richiedere qualche minuto.");
  runInteractive("Installazione dipendenze con npm install", npmCommand, ["install"], envValues);
}

function runPrismaGenerate(envValues) {
  runInteractive("Generazione Prisma Client con npx prisma generate", npxCommand, [
    "prisma",
    "generate",
  ], envValues);
}

function sanitizeOutput(output, envValues) {
  let sanitized = String(output || "");

  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const value = envValues[key];
    if (value) {
      sanitized = sanitized.split(value).join(`[${key} nascosta]`);
    }
  }

  return sanitized
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://***")
    .trim();
}

/**
 * Avvisa quando l'ambiente locale sta per lavorare su un database condiviso.
 *
 * Non blocca l'avvio: leggere staging in locale e talvolta legittimo. Blocca
 * invece la scrittura, tramite scripts/db-guard.mjs. Vedi ADR-0012.
 */
function warnIfSharedDatabase(envValues) {
  const declared = String(envValues.EASYGAME_DB_ENV || "").trim().toLowerCase();

  if (declared === "development") {
    return;
  }

  let target = "sconosciuto";
  try {
    const url = new URL(String(envValues.DATABASE_URL || ""));
    target = `${url.hostname}${url.pathname}`;
  } catch {
    // connection string non interpretabile: si segnala comunque
  }

  logWarn("");
  logWarn("  ATTENZIONE: questo avvio NON usa un database di sviluppo.");
  logWarn(`  Target: ${target}`);
  logWarn(
    declared
      ? `  EASYGAME_DB_ENV vale "${declared}".`
      : "  EASYGAME_DB_ENV non e impostata.",
  );
  logWarn("  I comandi di scrittura Prisma resteranno bloccati.");
  logWarn("  Per un database di sviluppo:");
  logWarn("    docker compose -f docker-compose.dev.yml up -d");
  logWarn('    e imposta EASYGAME_DB_ENV="development" in .env');
  logWarn("");
}

function runDatabaseCheck(envValues) {
  if (process.env.EASYGAME_SKIP_DB_CHECK === "1") {
    logWarn("Controllo connessione database saltato per EASYGAME_SKIP_DB_CHECK=1.");
    return;
  }

  logInfo("Controllo connessione database con SELECT 1 (nessuna migrazione).");

  const result = spawnSync(
    npxCommand,
    ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"],
    {
      cwd: projectRoot,
      env: buildChildEnv(envValues),
      input: "SELECT 1;",
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
    },
  );

  if (result.error) {
    const reason =
      result.error.code === "ETIMEDOUT"
        ? "timeout durante il controllo del database"
        : result.error.message;
    throw new Error(`Connessione al database non verificata: ${reason}.`);
  }

  if (result.status !== 0) {
    const details = sanitizeOutput(`${result.stderr}\n${result.stdout}`, envValues);
    throw new Error(
      [
        "Connessione al database non riuscita con il controllo sicuro SELECT 1.",
        "Verifica DATABASE_URL, DIRECT_URL, accesso Neon e sslmode=require.",
        details ? `Dettaglio Prisma: ${details}` : "",
      ]
        .filter(Boolean)
        .join(os.EOL),
    );
  }

  logStep("Connessione database verificata");
  logInfo("Non applico migrazioni automatiche, db push o reset durante l'avvio locale.");
}

function isLocalUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(stripQuotes(value));
}

function buildChildEnv(envValues, port = undefined) {
  const childEnv = {
    ...process.env,
    ...envValues,
  };

  if (port) {
    const localUrl = `http://localhost:${port}`;
    childEnv.PORT = String(port);

    if (!childEnv.NEXT_PUBLIC_APP_URL || isLocalUrl(childEnv.NEXT_PUBLIC_APP_URL)) {
      childEnv.NEXT_PUBLIC_APP_URL = localUrl;
    }

    if (!childEnv.AUTH_BASE_URL || isLocalUrl(childEnv.AUTH_BASE_URL)) {
      childEnv.AUTH_BASE_URL = localUrl;
    }
  }

  return childEnv;
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, LOCAL_HOSTNAME);
  });
}

async function choosePort() {
  if (await checkPort(DEFAULT_PORT)) {
    return DEFAULT_PORT;
  }

  logWarn(`La porta ${DEFAULT_PORT} e' occupata. Provo la porta ${FALLBACK_PORT}.`);

  if (await checkPort(FALLBACK_PORT)) {
    return FALLBACK_PORT;
  }

  throw new Error(
    `Le porte ${DEFAULT_PORT} e ${FALLBACK_PORT} sono occupate. Chiudi altri server locali e riprova.`,
  );
}

function openBrowser(url) {
  if (process.env.EASYGAME_NO_BROWSER === "1") {
    logInfo(`Apertura browser saltata. Apri manualmente ${url}`);
    return;
  }

  const command =
    process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args =
    process.platform === "win32" ? ["/c", "start", "", url] : [url];

  try {
    const opener = spawn(command, args, {
      cwd: projectRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    opener.unref();
    logStep(`Browser aperto su ${url}`);
  } catch (error) {
    logWarn(`Non riesco ad aprire il browser automaticamente: ${error.message}`);
    logInfo(`Apri manualmente ${url}`);
  }
}

function startDevServer(envValues, port) {
  const url = `http://localhost:${port}`;
  const devScript = "local:dev";
  const args = [
    "run",
    devScript,
    "--",
    "--hostname",
    LOCAL_HOSTNAME,
    "--port",
    String(port),
  ];

  logInfo(`Avvio Next.js su ${url}`);
  logInfo("Per fermare EasyGame premi Ctrl+C in questa finestra.");

  devProcess = spawn(npmCommand, args, {
    cwd: projectRoot,
    env: buildChildEnv(envValues, port),
    stdio: "inherit",
    windowsHide: false,
  });

  devProcess.once("error", async (error) => {
    clearTimeout(browserTimer);
    console.error("");
    console.error(`[ERRORE] Impossibile avviare Next.js: ${error.message}`);
    await pauseOnError();
    process.exit(1);
  });

  devProcess.once("exit", async (code, signal) => {
    clearTimeout(browserTimer);

    if (shuttingDown) {
      process.exit(0);
      return;
    }

    if (signal) {
      process.exit(0);
      return;
    }

    if (code && code !== 0) {
      console.error("");
      console.error(`[ERRORE] Next.js si e' chiuso con codice ${code}.`);
      await pauseOnError();
    }

    process.exit(code || 0);
  });

  browserTimer = setTimeout(() => openBrowser(url), BROWSER_DELAY_MS);
}

function stopDevServer(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearTimeout(browserTimer);
  console.log("");
  logInfo("Arresto EasyGame...");

  if (!devProcess || devProcess.killed) {
    process.exit(0);
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(devProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });

    killer.once("exit", () => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
    return;
  }

  devProcess.kill(signal);
}

function shouldPauseOnError() {
  return process.env.EASYGAME_HOLD_ON_ERROR === "1" || process.argv.includes("--hold-on-error");
}

function pauseOnError() {
  if (!shouldPauseOnError() || !process.stdin.isTTY) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("Premi Invio per chiudere questa finestra...", () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  printTitle();
  process.chdir(projectRoot);

  const packageJson = readPackageJson();
  if (!packageJson.scripts?.["local:dev"]) {
    throw new Error("Script npm local:dev non trovato in package.json.");
  }

  logStep(`Root progetto: ${projectRoot}`);
  checkNode();
  checkNpm();

  const envValues = ensureEnvFile();
  ensureNodeModules(envValues);
  runPrismaGenerate(envValues);
  runDatabaseCheck(envValues);

  const port = await choosePort();
  if (port !== DEFAULT_PORT) {
    logWarn(`EasyGame partira' su http://localhost:${port}`);
  }

  startDevServer(envValues, port);
}

process.on("SIGINT", () => stopDevServer("SIGINT"));
process.on("SIGTERM", () => stopDevServer("SIGTERM"));

main().catch(async (error) => {
  console.error("");
  console.error(`[ERRORE] ${error.message}`);
  console.error("");
  await pauseOnError();
  process.exit(1);
});
