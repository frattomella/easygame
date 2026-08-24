import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Verifica di conformita sui route handler.
 *
 * `src/lib/server/resources.ts` non e importabile da questo runner (usa import
 * senza estensione e costruisce PrismaClient a livello di modulo: vedi
 * ADR-0008 e WP-04), quindi l'isolamento multi-tenant non e testabile a
 * runtime senza un refactor.
 *
 * Nel frattempo questi test presidiano il rischio concreto: che un endpoint
 * nuovo dimentichi l'autenticazione o il filtro per organizzazione. Sono test
 * statici sul sorgente, non sul comportamento.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const API_DIR = path.join(PROJECT_ROOT, "src", "app", "api");

const listRouteFiles = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listRouteFiles(full, acc);
    else if (entry.name === "route.ts") acc.push(full);
  }
  return acc;
};

const routeId = (file) =>
  path
    .relative(API_DIR, file)
    .split(path.sep)
    .join("/")
    .replace(/\/route\.ts$/, "");

/**
 * Sorgente da ispezionare per un route handler: il file piu i moduli **dentro
 * `src/app/api`** che importa con un percorso relativo.
 *
 * Un handler puo delegare la guardia a un contesto condiviso colocato (e cosi
 * fanno le rotte `v1/seasons/**`). Seguire quegli import tiene il controllo
 * vero: la guardia continua a essere letta, solo in un file dichiarato dalla
 * rotta stessa. Un import verso `@/lib/...` non viene seguito, quindi non
 * esiste modo di nascondere l'assenza di autenticazione dietro un alias.
 */
const readRouteSource = (file, seen = new Set()) => {
  const resolved = path.resolve(file);
  if (seen.has(resolved) || !fs.existsSync(resolved)) {
    return "";
  }
  seen.add(resolved);

  const source = fs.readFileSync(resolved, "utf8");
  const localImports = [...source.matchAll(/from\s+"(\.[^"]+)"/g)].map(
    (match) => match[1],
  );

  const dependencies = localImports
    .map((specifier) =>
      path.resolve(path.dirname(resolved), `${specifier}.ts`),
    )
    .filter((candidate) => candidate.startsWith(API_DIR));

  return [source, ...dependencies.map((dep) => readRouteSource(dep, seen))].join(
    "\n",
  );
};

const ROUTES = listRouteFiles(API_DIR).map((file) => ({
  id: routeId(file),
  source: readRouteSource(file),
}));

/**
 * Endpoint volutamente raggiungibili senza sessione: fanno parte dei flussi
 * che una sessione la devono ancora creare, oppure sono pubblici per contratto.
 * Aggiungere una voce qui e una decisione di sicurezza: motivala.
 */
const PUBLIC_BY_DESIGN = new Map([
  ["v1/auth/login", "apre la sessione"],
  ["v1/auth/logout", "chiude la sessione, tollera l'assenza di sessione"],
  ["v1/auth/register", "crea l'account"],
  ["v1/auth/providers", "espone solo le capability di auth abilitate"],
  ["v1/auth/verify/email/send", "OTP pre-sessione"],
  ["v1/auth/verify/email/confirm", "OTP pre-sessione"],
  ["v1/auth/verify/phone/send", "OTP pre-sessione"],
  ["v1/auth/verify/phone/confirm", "OTP pre-sessione"],
  ["v1/auth/oauth/[provider]/start", "avvio OAuth"],
  ["v1/auth/oauth/[provider]/callback", "ritorno OAuth"],
  [
    "v1/auth/password/forgot",
    "reset pre-sessione: risposta identica anche se l'account non esiste",
  ],
  [
    "v1/auth/password/reset",
    "reset pre-sessione: autorizza il token monouso, non la sessione",
  ],
  ["v1/registry", "catalogo endpoint per il client mobile"],
  ["public/forms/[publicSlug]", "modulo online pubblico, per contratto"],
  ["payments/webhook", "callback del PSP; non processa eventi (WP-13)"],
]);

/**
 * Endpoint che usano Prisma ma non lo scope di club, perche autorizzano su una
 * relazione diversa. Ognuno deve comunque dimostrare un controllo esplicito.
 */
const NON_CLUB_SCOPED = new Map([
  ["v1/auth/login", "opera sull'utente che si sta autenticando"],
  ["v1/auth/register", "crea l'utente"],
  ["v1/auth/user", "profilo dell'utente in sessione"],
  ["v1/auth/memberships", "membership dell'utente in sessione"],
  ["v1/auth/memberships/activate", "membership dell'utente in sessione"],
  ["v1/auth/memberships/delete", "membership dell'utente in sessione"],
  ["v1/auth/access/redeem", "collega l'utente tramite token condiviso"],
  ["v1/auth/athlete-profile/[athleteId]", "verifica il legame utente-atleta"],
  ["parent-dashboard/[athleteId]", "verifica il legame genitore-atleta"],
  ["parent-dashboard/[athleteId]/appointments", "legame genitore-atleta"],
  ["parent-dashboard/[athleteId]/documents", "legame genitore-atleta"],
  ["parent-dashboard/[athleteId]/documents/[assetId]", "legame genitore-atleta"],
  ["parent-dashboard/[athleteId]/structures", "legame genitore-atleta"],
  ["public/forms/[publicSlug]", "modulo pubblico per slug"],
]);

const requiresAuth = (source) =>
  source.includes("requireAuthenticatedUser") ||
  source.includes("requirePlatformAdmin") ||
  source.includes("getSessionFromRequest");

const usesPrisma = (source) => /\bprisma\./.test(source);

const enforcesClubScope = (source) =>
  source.includes("resolveOrganizationScopeForUser") ||
  source.includes("requirePlatformAdmin");

test("gli endpoint non pubblici richiedono una sessione", () => {
  const senzaAuth = ROUTES.filter(
    (route) => !PUBLIC_BY_DESIGN.has(route.id) && !requiresAuth(route.source),
  ).map((route) => route.id);

  assert.deepEqual(
    senzaAuth,
    [],
    `endpoint senza controllo di sessione: ${senzaAuth.join(", ")}`,
  );
});

test("gli endpoint che leggono il database applicano uno scope esplicito", () => {
  const senzaScope = ROUTES.filter(
    (route) =>
      usesPrisma(route.source) &&
      !enforcesClubScope(route.source) &&
      !NON_CLUB_SCOPED.has(route.id),
  ).map((route) => route.id);

  assert.deepEqual(
    senzaScope,
    [],
    `endpoint con accesso Prisma senza scope di club ne deroga motivata: ${senzaScope.join(", ")}`,
  );
});

test("gli endpoint autorizzati su relazione dichiarano un controllo esplicito", () => {
  const senzaControllo = [];

  for (const route of ROUTES) {
    const deroga = NON_CLUB_SCOPED.get(route.id);
    if (!deroga) continue;
    if (PUBLIC_BY_DESIGN.has(route.id)) continue;

    // Deve comunque esistere un rifiuto esplicito nel sorgente.
    const nega =
      route.source.includes("403") ||
      route.source.includes("401") ||
      route.source.includes("Accesso negato");
    if (!nega) senzaControllo.push(route.id);
  }

  assert.deepEqual(
    senzaControllo,
    [],
    `endpoint in deroga senza rifiuto esplicito: ${senzaControllo.join(", ")}`,
  );
});

test("il CRUD generico applica la matrice dei permessi su lettura e scrittura", () => {
  const collection = ROUTES.find((route) => route.id === "v1/[resource]");
  const detail = ROUTES.find((route) => route.id === "v1/[resource]/[id]");

  assert.ok(collection, "manca src/app/api/v1/[resource]/route.ts");
  assert.ok(detail, "manca src/app/api/v1/[resource]/[id]/route.ts");

  for (const route of [collection, detail]) {
    assert.ok(
      route.source.includes("assertClubResourceAccess"),
      `${route.id} non applica assertClubResourceAccess`,
    );
    assert.ok(
      route.source.includes("resolveOrganizationScopeForUser"),
      `${route.id} non risolve lo scope organizzativo`,
    );
    assert.ok(
      route.source.includes("requireAuthenticatedUser"),
      `${route.id} non richiede una sessione`,
    );
  }

  for (const action of ["read", "create"]) {
    assert.ok(
      collection.source.includes(`"${action}"`),
      `il CRUD di collezione non verifica l'azione ${action}`,
    );
  }
  for (const action of ["read", "update", "delete"]) {
    assert.ok(
      detail.source.includes(`"${action}"`),
      `il CRUD di dettaglio non verifica l'azione ${action}`,
    );
  }
});

test("gli endpoint di amministrazione piattaforma sono riservati", () => {
  const adminRoutes = ROUTES.filter((route) => route.id.startsWith("v1/admin/"));
  assert.ok(adminRoutes.length >= 4, "attesi almeno 4 endpoint admin");

  for (const route of adminRoutes) {
    assert.ok(
      route.source.includes("requirePlatformAdmin"),
      `${route.id} non usa requirePlatformAdmin`,
    );
  }
});

test("nessun endpoint restituisce hash, credenziali o token di sessione", () => {
  const perdite = [];

  for (const route of ROUTES) {
    // `select` che includono esplicitamente campi sensibili.
    if (/password_hash:\s*true/.test(route.source)) perdite.push(`${route.id}: password_hash`);
    if (/password_ciphertext:\s*true/.test(route.source)) perdite.push(`${route.id}: password_ciphertext`);
    if (/code_hash:\s*true/.test(route.source)) perdite.push(`${route.id}: code_hash`);
  }

  assert.deepEqual(perdite, [], `possibile esposizione: ${perdite.join(", ")}`);
});

test("la deroga pubblica resta piccola e giustificata", () => {
  // Se questo numero cresce, qualcuno sta rendendo pubblico un endpoint:
  // deve essere una scelta consapevole, non un effetto collaterale.
  assert.ok(
    PUBLIC_BY_DESIGN.size <= 15,
    `troppi endpoint pubblici: ${PUBLIC_BY_DESIGN.size}`,
  );
  for (const [id, motivo] of PUBLIC_BY_DESIGN) {
    assert.ok(motivo.length > 5, `motivazione mancante per ${id}`);
  }
});
