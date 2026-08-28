import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * La porta da cui entrano i giri automatici.
 *
 * **Il difetto che questi test chiudono.** Le quattro rotte schedulate in
 * `vercel.json` avevano ognuna la propria copia di questo controllo, e non
 * dicevano la stessa cosa: la manutenzione pretendeva il segreto in ogni
 * ambiente e lo confrontava a tempo costante; le altre tre lasciavano passare
 * **chiunque** quando `CRON_SECRET` non era configurato e `NODE_ENV` non era
 * `production`, con un confronto `!==`.
 *
 * Su una porta che manda email a tutte le famiglie di tutti i club — e su una
 * che cancella righe — «fuori da produzione passa comunque» non e una comodita
 * di sviluppo. Il §5.3 punto 14 del planning della Wave 1 lo diceva gia: «ogni
 * porta cron risponde `503` se `CRON_SECRET` non e configurato e `401` se il
 * `Bearer` non corrisponde. Mai `200` a vuoto».
 */

let authorizeCronRequest;
const SEGRETO_ORIGINALE = process.env.CRON_SECRET;

const richiesta = (authorization) =>
  new Request("http://127.0.0.1/api/v1/qualunque", {
    headers: authorization ? { authorization } : {},
  });

before(async () => {
  ({ authorizeCronRequest } = await import("../../src/lib/server/cron-auth.ts"));
});

beforeEach(() => {
  delete process.env.CRON_SECRET;
});

after(() => {
  if (SEGRETO_ORIGINALE === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = SEGRETO_ORIGINALE;
  }
});

test("senza segreto la porta non si apre, in nessun ambiente", async () => {
  for (const ambiente of ["development", "test", "production", undefined]) {
    const precedente = process.env.NODE_ENV;
    if (ambiente === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ambiente;

    const denied = authorizeCronRequest(richiesta("Bearer qualcosa"), "il giro");

    assert.ok(denied, `con NODE_ENV=${ambiente} la porta si e aperta`);
    assert.equal(denied.response.status, 503);

    const body = await denied.response.json();
    assert.match(body.error.message, /CRON_SECRET/);

    if (precedente === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = precedente;
  }
});

test("un Bearer sbagliato riceve 401 e non esegue niente", async () => {
  process.env.CRON_SECRET = "segreto-giusto";

  for (const intestazione of [
    undefined,
    "",
    "Bearer sbagliato",
    "segreto-giusto",
    "Basic segreto-giusto",
    "bearer segreto-giusto",
  ]) {
    const denied = authorizeCronRequest(richiesta(intestazione), "il giro");

    assert.ok(denied, `«${intestazione}» non doveva passare`);
    assert.equal(denied.response.status, 401);

    const body = await denied.response.json();
    assert.match(body.error.message, /Accesso negato/);
  }
});

test("il Bearer giusto passa", () => {
  process.env.CRON_SECRET = "segreto-giusto";

  assert.equal(
    authorizeCronRequest(richiesta("Bearer segreto-giusto"), "il giro"),
    null,
  );
});

test("uno spazio in piu attorno al segreto non lo invalida", () => {
  process.env.CRON_SECRET = "  segreto-giusto  ";

  assert.equal(
    authorizeCronRequest(richiesta("Bearer segreto-giusto"), "il giro"),
    null,
    "la variabile d'ambiente si trimma: un a capo copiato non deve rompere il cron",
  );
});

test("il confronto non esce al primo carattere diverso", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "lib", "server", "cron-auth.ts"),
    "utf8",
  );

  assert.match(
    source,
    /left\.charCodeAt\(index\) \^ right\.charCodeAt\(index\)/,
    "un confronto che esce al primo carattere diverso racconta quanti ne erano giusti",
  );
  assert.doesNotMatch(
    source,
    /!==\s*`Bearer/,
    "il confronto con il template literal e proprio quello che si voleva evitare",
  );
});

// --- una porta sola ----------------------------------------------------------

const APP = path.join(process.cwd(), "src", "app");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/route\.ts$/.test(entry)) out.push(full);
  }
  return out;
};

test("nessuna rotta si tiene una copia del gate del cron", () => {
  const offenders = walk(APP)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!/CRON_SECRET/.test(source)) return false;
      // Chi usa il gate condiviso e a posto; chi legge il segreto per conto
      // proprio no.
      return !/authorizeCronRequest/.test(source);
    })
    .map((file) => path.relative(process.cwd(), file).replace(/\\/g, "/"));

  assert.deepEqual(
    offenders,
    [],
    "quattro copie della stessa autenticazione erano tre robustezze diverse",
  );
});

test("le porte schedulate sono quelle che passano dal gate", () => {
  const vercel = JSON.parse(
    readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
  );

  for (const cron of vercel.crons) {
    const routeFile = path.join(
      process.cwd(),
      "src",
      "app",
      ...cron.path.replace(/^\//, "").split("/"),
      "route.ts",
    );

    const source = readFileSync(routeFile, "utf8");
    assert.match(
      source,
      /authorizeCronRequest\(/,
      `${cron.path} e schedulata ma non passa dal gate condiviso`,
    );
  }
});
