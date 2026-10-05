import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Dal dominio alla pagina pubblicata, senza cache** (D-WS-5).
 *
 * `resolveHostUncached` e `resolveSitePage` vivevano dentro `public-site.ts`,
 * che le avvolge in `unstable_cache` di Next: nessun test le importava, e il
 * tratto host → sito → revisione → pagina non era coperto. Ora stanno in
 * `public-routing.ts`. Qui si misura che un host sconosciuto, un dominio non
 * pronto, un servizio sospeso o un sito ritirato non mostrino niente, e che
 * gli indirizzi vecchi reindirizzino.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-00000000000a";
const SITE = "11111111-0000-4000-8000-0000000000a1";
const REVISION = "22222222-0000-4000-8000-0000000000a2";
const TEAM = "33333333-0000-4000-8000-0000000000a3";

const website = (billingStatus = "active", enabled = true) => ({ extraServices: [{ key: "website", enabled, billingStatus }] });

let routing;
let setPrisma;
let fake;

const seed = (overrides = {}) => ({
  club: [{ id: CLUB, name: "Fortitudo", settings: overrides.clubSettings || website() }],
  websiteSite: [
    {
      id: SITE,
      organization_id: CLUB,
      status: overrides.siteStatus || "published",
      current_revision_id: REVISION,
      settings: { identity: { displayName: "Fortitudo Basket" } },
      organization: { name: "Fortitudo", settings: overrides.clubSettings || website() },
    },
  ],
  websiteDomain: [
    { id: "d1", site_id: SITE, organization_id: CLUB, hostname: "fortitudo.it", role: "primary", state: overrides.domainState || "active", tls_state: overrides.tlsState || "active" },
    { id: "d2", site_id: SITE, organization_id: CLUB, hostname: "www.fortitudo.it", role: "redirect", state: "active", tls_state: "active" },
  ],
  websiteRedirect: [{ id: "r1", site_id: SITE, organization_id: CLUB, from_path: "/chi-siamo", to_path: "/societa" }],
  clubTeam: [{ id: TEAM, organization_id: CLUB, active: true, slug: "serie-c", previous_slugs: ["prima-squadra"] }],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ({ __setPrismaClientForTests: setPrisma } = await import("../../src/lib/server/prisma.ts"));
  routing = await import("../../src/lib/server/website/public-routing.ts");
});

const use = (overrides) => {
  fake = createFakePrisma(seed(overrides));
  setPrisma(fake.client);
};

beforeEach(() => use({}));

test("un host sconosciuto o malformato non mostra niente", async () => {
  assert.deepEqual(await routing.resolveHostUncached("altro.it"), { status: "not_found" });
  assert.deepEqual(await routing.resolveHostUncached("fortitudo.it/../x"), { status: "not_found" });
  assert.equal(routing.normalizeRequestHost("FORTITUDO.it.:443"), "fortitudo.it");
});

test("il dominio primario attivo risolve il sito e la revisione pubblicata; un secondario indica il primario", async () => {
  const ok = await routing.resolveHostUncached("fortitudo.it");
  assert.equal(ok.status, "ok");
  assert.equal(ok.revisionId, REVISION);
  assert.equal(ok.primaryHostname, "fortitudo.it");
  const www = await routing.resolveHostUncached("www.fortitudo.it");
  assert.equal(www.status, "ok");
  assert.equal(www.primaryHostname, "fortitudo.it");
});

test("dominio non pronto, servizio sospeso, sito ritirato o mai pubblicato: «non disponibile»", async () => {
  use({ domainState: "verifying" });
  assert.equal((await routing.resolveHostUncached("fortitudo.it")).reason, "domain_not_ready");
  use({ clubSettings: website("suspended", false) });
  assert.equal((await routing.resolveHostUncached("fortitudo.it")).reason, "suspended");
  use({ siteStatus: "offline" });
  assert.equal((await routing.resolveHostUncached("fortitudo.it")).reason, "offline");
  use({ siteStatus: "draft" });
  assert.equal((await routing.resolveHostUncached("fortitudo.it")).reason, "not_published");
});

const page = (id, kind, path, slug) => ({ id, kind, path, slug, title: id, seo: {}, document: { sections: [] } });
const snapshot = {
  pages: [page("home", "home", "/", ""), page("societa", "standard", "/societa", "societa"), page("squadra", "team_detail", "/squadre/*", "squadre")],
};

test("un percorso trova la sua pagina; uno vecchio reindirizza; uno sconosciuto non esiste", async () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const home = await routing.resolveSitePage(CLUB, SITE, snapshot, [], now);
  assert.equal(home.status, "ok");
  assert.equal(home.page.id, "home");
  const old = await routing.resolveSitePage(CLUB, SITE, snapshot, ["chi-siamo"], now);
  assert.deepEqual(old, { status: "redirect", location: "/societa" });
  assert.deepEqual(await routing.resolveSitePage(CLUB, SITE, snapshot, ["nessuna"], now), { status: "not_found" });
});

test("una squadra dallo slug, e da uno slug vecchio con un reindirizzamento", async () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const team = await routing.resolveSitePage(CLUB, SITE, snapshot, ["squadre", "serie-c"], now);
  assert.equal(team.status, "ok");
  assert.deepEqual(team.pageContext, { teamId: TEAM });
  const renamed = await routing.resolveSitePage(CLUB, SITE, snapshot, ["squadre", "prima-squadra"], now);
  assert.deepEqual(renamed, { status: "redirect", location: "/squadre/serie-c" });
  assert.deepEqual(await routing.resolveSitePage(CLUB, SITE, snapshot, ["squadre", "under-99"], now), { status: "not_found" });
});
