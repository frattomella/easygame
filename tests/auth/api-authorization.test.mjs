import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Verifica di conformita sui route handler.
 *
 * Questi test presidiano un rischio che solo il sorgente puo mostrare: che un
 * endpoint **nuovo** dimentichi l'autenticazione o il filtro per
 * organizzazione. Sono test statici, e lo sono per costruzione — la domanda
 * «esiste una rotta che non chiama la guardia» non si risponde eseguendo le
 * rotte che la chiamano.
 *
 * **Nota corretta il 2026-08-31.** Qui c'era scritto che
 * `src/lib/server/resources.ts` non fosse importabile da questo runner. Non e
 * (piu) vero: si importa, e `tests/server/guardie-di-scrittura-e-cancellazione.test.mjs`
 * ne esercita le guardie a runtime. La nota risaliva a prima di WP-04 ed e
 * costata cara: una guardia scritta in quel file era stata coperta da un test
 * **statico** che contava le chiamate — e ha continuato a passare mentre la
 * guardia si scavalcava omettendo un campo. Quando la KB e il codice non
 * concordano vince il codice (CLAUDE.md §1), e qui la KB stava impedendo il
 * test migliore.
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
  /*
    Il link di pagamento (G-06, W2-B). Non ha sessione **per progetto**: chi
    apre il link e una famiglia che un account nel club puo non averlo. Cio che
    lo difende non e una sessione ma il segreto stesso — 32 byte casuali di cui
    in archivio resta il solo SHA-256, confrontato a tempo costante — piu la
    scadenza, la revoca, un rate limit doppio (per token e per indirizzo) e una
    risposta identica per token sconosciuto, scaduto o revocato. Nessun
    identificativo interno esce da queste due rotte.
  */
  [
    "public/payment-links/[token]",
    "vista pubblica del link di pagamento: token opaco, hashato a riposo, con rate limit",
  ],
  [
    "public/payment-links/[token]/checkout",
    "riscatto del link: apre lo stesso checkout della rotta autenticata, con URL di ritorno costruiti dal server",
  ],
  /*
    I due webhook del PSP. Non hanno sessione e non possono averla: chi
    chiama e Stripe. Cio che li difende e la **firma**, verificata sul corpo
    grezzo prima di guardarci dentro, piu la deduplica sull'identificativo
    dell'evento. Sono due e non uno perche sono due account Stripe con due
    segreti diversi (ADR-0051).
  */
  /*
    Il riscontro dell'iscrizione (Wave 5, 5G). Non ha sessione **per progetto**:
    chi ha compilato il modulo pubblico un account nel club puo non averlo, e
    chiedergliene uno per sapere «a che punto siamo» significherebbe non dare a
    nessuno la risposta che stava aspettando.

    Cio che la difende e lo stesso presidio del link di pagamento: un
    riferimento opaco di cui in archivio resta il solo SHA-256, un rate limit
    doppio (per indirizzo e per impronta del riferimento), e una risposta
    identica — un 404 — per riferimento sconosciuto, malformato o di un'altra
    pratica. Da questa rotta non esce nessun identificativo interno, nessuna
    risposta del modulo e nessun dato di terzi: solo lo stato della domanda.
  */
  [
    "public/enrollment-status/[reference]",
    "stato della propria domanda: riferimento opaco, hashato a riposo, con rate limit",
  ],
  /*
    Il riscatto dell'invito di accesso di un atleta (Wave 6, lane 6C). Non ha
    sessione **per progetto**: l'utenza dell'invitato nasce senza credenziali
    note, perche la password la scegliera lui. Chiedere una sessione qui
    vorrebbe dire chiedergli di accedere prima di avere una password.

    Cio che lo difende e il presidio del link di pagamento: 32 byte casuali di
    cui in archivio resta il solo SHA-256, una scadenza, uno stato che passa a
    `accepted` al primo uso, e una risposta identica per token sconosciuto,
    scaduto, revocato o gia usato. Il legame nasce verso l'utenza **invitata**
    (`athlete_account_invites.user_id`), non verso chi apre il link: non c'e
    niente da dirottare.
  */
  [
    "v1/athlete-accounts/accept",
    "riscatto dell'invito atleta: token opaco, hashato a riposo, monouso e con scadenza",
  ],
  ["payments/webhook", "callback del PSP: firma verificata, evento deduplicato"],
  ["billing/webhook", "callback del billing di piattaforma: firma verificata, evento deduplicato"],
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
  /*
    Wave 5. Le tre superfici nuove della famiglia autorizzano tutte sulla stessa
    relazione — `canParentAccessAthlete` — e non sullo scope di club, per la
    ragione che il §13 nomina: un tutore puo non avere **nessuna** appartenenza
    al club, e uno scope di ruolo lo terrebbe fuori dalla propria area. Il club
    non arriva mai dal client: si legge dalla riga dell'atleta.
  */
  ["parent-dashboard/[athleteId]/board", "legame genitore-atleta"],
  ["parent-dashboard/[athleteId]/checkout", "legame genitore-atleta, e la rata comanda sul club"],
  ["parent-dashboard/[athleteId]/consents", "legame genitore-atleta, verificato nel dominio"],
  /*
    Wave 6. Stessa famiglia, stessa ragione — e con un vincolo in piu che vale
    la pena scrivere: la rotta **non** si fida del legame per sapere di quale
    club parla. Il club lo rilegge dalla riga dell atleta e lo mette nel
    `where`, perche un genitore con figli in due societa che preme «segna
    tutte come lette» non deve chiudere le notifiche dell altra.
  */
  [
    "parent-dashboard/[athleteId]/notifications",
    "legame genitore-atleta; il club si rilegge dalla riga dell atleta",
  ],
  ["public/forms/[publicSlug]", "modulo pubblico per slug"],
]);

/**
 * `sportWorkRoute` e l'involucro delle rotte del lavoro sportivo
 * (`src/lib/server/sport-work-route.ts`): fa **entrambe** le cose che questa
 * guardia cerca — legge la sessione con `requireAuthenticatedUser` e risolve
 * il club con `resolveOrganizationScopeForUser` — piu una terza che nessun'altra
 * rotta fa, cioe verificare il permesso economico e tracciare il diniego.
 *
 * Vale come marcatore per lo stesso motivo per cui esiste: venti rotte che
 * copiano lo stesso preambolo sono venti occasioni di dimenticarne un pezzo.
 * La guardia resta severa — una rotta di quel dominio scritta **senza**
 * l'involucro non ha nessuno dei due marcatori e fallisce qui.
 */
const SPORT_WORK_WRAPPER = "sportWorkRoute";

const requiresAuth = (source) =>
  source.includes("requireAuthenticatedUser") ||
  source.includes("requirePlatformAdmin") ||
  source.includes("getSessionFromRequest") ||
  source.includes(SPORT_WORK_WRAPPER);

const usesPrisma = (source) => /\bprisma\./.test(source);

const enforcesClubScope = (source) =>
  source.includes("resolveOrganizationScopeForUser") ||
  source.includes("requirePlatformAdmin") ||
  source.includes(SPORT_WORK_WRAPPER);

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
  /*
    Se questo numero cresce, qualcuno sta rendendo pubblico un endpoint: deve
    essere una scelta consapevole, non un effetto collaterale.

    Da 15 a 16 nel Blocco D, per `billing/webhook`. E il secondo dei due
    callback di Stripe, e sono due per una ragione precisa: due account con
    due segreti di firma diversi (ADR-0051). Un endpoint solo avrebbe dovuto
    provare entrambi i segreti, e una firma valida «con uno dei due» non dice
    piu quale flusso ha parlato.

    Da 16 a 18 nella Wave 2, per le due rotte del link di pagamento (G-06,
    W2-B). E la deroga piu impegnativa dell'elenco — non un callback firmato
    da un fornitore, ma una pagina che una famiglia apre da un messaggio — e
    per questo le due rotte portano il presidio piu pesante del repository:
    token opaco da 32 byte di cui in archivio resta il solo SHA-256,
    confronto a tempo costante, scadenza, revoca, rate limit doppio (per
    token e per indirizzo), una risposta identica per token sconosciuto,
    scaduto o revocato, e nessun identificativo interno nella risposta. Il
    denaro passa comunque dal checkout gia esistente e dal webhook firmato:
    queste due rotte non incassano niente da sole.

    Sono due e non una perche i due gesti costano in modo diverso — guardare
    e gratuito, aprire un checkout e una chiamata al PSP — e vanno contati a
    parte.
    Da 19 a 20 nella Wave 6, per il riscatto dell'invito di accesso di un
    atleta. La deroga e della stessa famiglia delle due precedenti — una
    pagina che una persona apre da un messaggio — e porta lo stesso presidio:
    32 byte casuali, il solo SHA-256 in archivio, una scadenza, un uso solo, e
    una risposta identica per token sconosciuto, scaduto, revocato o gia
    consumato.

    La ragione per cui **non puo** avere una sessione e piu forte che altrove:
    l'utenza dell'invitato nasce senza credenziali note, perche la password la
    sceglie lui dopo. Chiedere una sessione qui vorrebbe dire chiedergli di
    accedere prima di poterlo fare.
  */
  assert.ok(
    PUBLIC_BY_DESIGN.size <= 20,
    `troppi endpoint pubblici: ${PUBLIC_BY_DESIGN.size}`,
  );
  for (const [id, motivo] of PUBLIC_BY_DESIGN) {
    assert.ok(motivo.length > 5, `motivazione mancante per ${id}`);
  }
});
