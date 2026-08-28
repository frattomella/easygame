/**
 * Smoke test di un ambiente distribuito.
 *
 *     node scripts/staging-smoke.mjs --base=https://easygame-staging-xxx.vercel.app
 *
 * **Non scrive niente.** Chiede solo cio che si puo chiedere senza una
 * sessione, e verifica due cose:
 *
 * 1. che l'applicazione risponda — le tre superfici che `CLAUDE.md` §9 elenca
 *    dopo ogni deploy: la radice, il login, il registro delle API;
 * 2. che le **quattro porte periodiche** siano chiuse a chi non ha il segreto.
 *    E la verifica che conta di piu su un ambiente vero: in locale, senza
 *    `CRON_SECRET`, rispondono `503`; qui il segreto c'e, quindi una richiesta
 *    senza `Bearer` deve ricevere `401` e non eseguire niente. Una di queste
 *    porte cancella righe e un'altra manda email a tutte le famiglie.
 */

const args = process.argv.slice(2);
const BASE = (args.find((arg) => arg.startsWith("--base=")) || "").split("=")[1];

if (!BASE) {
  console.error("Serve --base=https://…");
  process.exit(1);
}

const results = [];

const check = (name, condition, detail = "") => {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const call = async (path, options = {}) => {
  const started = Date.now();
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: options.method || "GET",
      redirect: "manual",
      headers: options.headers || {},
    });
    const text = await response.text().catch(() => "");
    return { status: response.status, text, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, text: String(error?.message || error), ms: Date.now() - started };
  }
};

const run = async () => {
  console.log(`Smoke test su ${BASE}\n`);

  console.log("── Le tre superfici del deploy");
  const home = await call("/");
  check(
    "la radice risponde",
    [200, 301, 302, 307, 308].includes(home.status),
    `HTTP ${home.status} in ${home.ms} ms`,
  );

  const login = await call("/login");
  check("la pagina di accesso risponde", login.status === 200, `HTTP ${login.status}`);

  const registry = await call("/api/v1/registry");
  check(
    "il registro delle API risponde",
    registry.status === 200 && registry.text.includes("path"),
    `HTTP ${registry.status}`,
  );

  console.log("\n── Le quattro porte periodiche sono chiuse");
  const porte = [
    "/api/v1/sport-work/scheduler",
    "/api/v1/training-automation",
    "/api/v1/maintenance",
    "/api/medical-certificate-reminders",
  ];

  for (const porta of porte) {
    const senzaSegreto = await call(porta);
    check(
      `${porta} senza Bearer non esegue`,
      senzaSegreto.status === 401 || senzaSegreto.status === 503,
      `HTTP ${senzaSegreto.status}`,
    );

    const sbagliato = await call(porta, {
      headers: { authorization: "Bearer sbagliato" },
    });
    check(
      `${porta} con un Bearer sbagliato non esegue`,
      sbagliato.status === 401 || sbagliato.status === 503,
      `HTTP ${sbagliato.status}`,
    );
  }

  console.log("\n── Nessun messaggio dell'ORM nelle risposte pubbliche");
  const ormLeak = [home, login, registry].some((response) =>
    /Invalid `prisma\.|PrismaClient|PostgresError/i.test(response.text || ""),
  );
  check("nessuna risposta fa uscire il messaggio dell'ORM", !ormLeak);

  const failed = results.filter((row) => !row.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} controlli superati`,
  );
  if (failed.length) {
    console.log("\nFalliti:");
    for (const row of failed) console.log(`  ${row.name} — ${row.detail}`);
  }

  return failed.length;
};

run()
  .then((failed) => process.exit(failed ? 1 : 0))
  .catch((error) => {
    console.error("Smoke test interrotto:", error);
    process.exit(2);
  });
