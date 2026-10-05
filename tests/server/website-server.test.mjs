import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **ADR-0200 — il sito sul server: stato del servizio, concorrenza,
 * pubblicazione, domini, confine del club.**
 *
 * Contro il doppio di Prisma: misura **quali vincoli il codice applica**
 * prima di toccare il database. I vaglii che vivono nell'archivio (il
 * trigger che rifiuta l'`UPDATE` di una revisione, l'indice parziale «un solo
 * dominio primario») sono nella migrazione e si provano contro PostgreSQL.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-00000000000a";
const ALTRO = "bbbbbbbb-0000-4000-8000-00000000000b";
const SENZA = "cccccccc-0000-4000-8000-00000000000c";
const SOSPESO = "dddddddd-0000-4000-8000-00000000000d";
const OWNER = "11111111-0000-4000-8000-000000000001";

const extra = (billingStatus, enabled = true) => ({ extraServices: [{ key: "website", enabled, billingStatus }] });

const scope = (organizationId = CLUB, activeRole = "owner") => ({
  userId: OWNER,
  activeOrganizationId: organizationId,
  activeRole,
  allowedOrganizationIds: [organizationId],
  isPlatformAdmin: false,
});

let fake;
let sites;
let pages;
let publishing;
let domains;
let providers;
let access;
let clubTeams;
let setPrisma;

const seed = () => ({
  club: [
    { id: CLUB, name: "Fortitudo", settings: extra("trialing"), logo_url: null },
    { id: ALTRO, name: "Altro club", settings: extra("active"), logo_url: null },
    { id: SENZA, name: "Senza servizio", settings: {}, logo_url: null },
    { id: SOSPESO, name: "Sospeso", settings: extra("suspended", false), logo_url: null },
  ],
});

before(async () => {
  ({ __setPrismaClientForTests: setPrisma } = await import("../../src/lib/server/prisma.ts"));
  sites = await import("../../src/lib/server/website/sites.ts");
  pages = await import("../../src/lib/server/website/pages.ts");
  publishing = await import("../../src/lib/server/website/publishing.ts");
  domains = await import("../../src/lib/server/website/domains.ts");
  providers = await import("../../src/lib/server/website/domain-providers/index.ts");
  access = await import("../../src/lib/server/website/access.ts");
  clubTeams = await import("../../src/lib/server/club-teams.ts");
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrisma(fake.client);
  providers.__setDomainProviderForTests(null);
  domains.__setDnsResolverForTests(null);
});

after(() => {
  providers.__setDomainProviderForTests(null);
  domains.__setDnsResolverForTests(null);
});

const createSite = async (organizationId = CLUB) => {
  const overview = await sites.createWebsite(scope(organizationId), { templateKey: "club-modern", displayName: "Fortitudo" });
  return overview;
};

test("senza il servizio il sito non si crea; da sospeso si legge ma non si modifica", async () => {
  await assert.rejects(() => sites.createWebsite(scope(SENZA), { templateKey: "club-modern" }), /Accesso negato/);

  const overview = await sites.getWebsiteOverview(scope(SOSPESO));
  assert.equal(overview.access.state, "suspended");
  assert.equal(overview.site, null);
  await assert.rejects(() => sites.createWebsite(scope(SOSPESO), { templateKey: "club-modern" }), /Accesso negato/);
});

test("la prova crea il sito dal template, una volta sola", async () => {
  const overview = await createSite();
  assert.ok(overview.site, "il sito esiste");
  assert.ok(overview.pages.some((page) => page.kind === "home"), "c'e la home");
  assert.ok(overview.pages.length >= 6, "il template porta le pagine predefinite");
  await assert.rejects(() => createSite(), (error) => access.isWebsiteConflict(error));
});

test("un allenatore non tocca il sito, un genitore nemmeno lo vede", async () => {
  await createSite();
  await assert.rejects(() => sites.getWebsiteOverview(scope(CLUB, "parent")), /Accesso negato/);
  const overview = await sites.getWebsiteOverview(scope(CLUB, "owner"));
  const home = overview.pages.find((page) => page.kind === "home");
  await assert.rejects(
    () => pages.savePageDocument(scope(CLUB, "trainer"), home.id, { expectedVersion: home.version, document: { sections: [] } }),
    /Accesso negato/,
  );
});

test("salvare una pagina con la versione vecchia e un conflitto, non una sovrascrittura", async () => {
  const overview = await createSite();
  const home = overview.pages.find((page) => page.kind === "home");
  const document = {
    sections: [
      {
        id: "s1",
        layout: "one",
        columns: [{ id: "c1", blocks: [{ id: "b1", type: "rich-text", props: { html: "<p>Ciao</p><script>alert(1)</script>" } }] }],
      },
    ],
  };
  const saved = await pages.savePageDocument(scope(), home.id, { expectedVersion: home.version, document });
  assert.equal(saved.page.version, home.version + 1);
  const html = saved.page.document.sections[0].columns[0].blocks[0].props.html;
  assert.ok(!html.includes("<script"), "il testo formattato si ripulisce sul server");

  await assert.rejects(
    () => pages.savePageDocument(scope(), home.id, { expectedVersion: home.version, document }),
    (error) => access.isWebsiteConflict(error) && error.currentVersion === home.version + 1,
  );
});

test("la configurazione del sito ha la sua versione ottimistica", async () => {
  const overview = await createSite();
  const version = overview.site.draftVersion;
  const updated = await sites.updateSiteConfig(scope(), { theme: { ...overview.site.theme, radius: "xl" }, expectedVersion: version });
  assert.equal(updated.draftVersion, version + 1);
  assert.equal(updated.theme.radius, "xl");
  await assert.rejects(
    () => sites.updateSiteConfig(scope(), { theme: overview.site.theme, expectedVersion: version }),
    (error) => access.isWebsiteConflict(error),
  );
});

test("una pagina di un altro club non si apre e non si scrive dal club attivo", async () => {
  await createSite(CLUB);
  const altro = await createSite(ALTRO);
  const altraHome = altro.pages.find((page) => page.kind === "home");
  await assert.rejects(() => pages.getPage(scope(CLUB), altraHome.id), /non trovata|Accesso negato/);
  await assert.rejects(
    () => pages.savePageDocument(scope(CLUB), altraHome.id, { expectedVersion: altraHome.version, document: { sections: [] } }),
    /non trovata|Accesso negato/,
  );
  const scritta = fake.rows("websitePage").find((row) => row.id === altraHome.id);
  assert.equal(scritta.version, altraHome.version, "la riga dell'altro club non e cambiata");
});

test("cambiare lo slug lascia un reindirizzamento dal vecchio indirizzo", async () => {
  const overview = await createSite();
  const page = overview.pages.find((item) => item.kind === "standard");
  await pages.updatePageMeta(scope(), page.id, { expectedVersion: page.version, slug: "la-societa-nuova" });
  const redirects = fake.rows("websiteRedirect").filter((row) => row.organization_id === CLUB);
  assert.ok(redirects.some((row) => row.from_path === page.path && row.to_path === "/la-societa-nuova"));
  await assert.rejects(() => pages.updatePageMeta(scope(), page.id, { expectedVersion: page.version + 1, slug: "api" }), /riservato/);
});

const stubProvider = (tls = "active") => ({
  key: "mock",
  label: "Prova",
  isConfigured: () => true,
  routingTarget: () => ({ cname: "cname.test.invalid", ipv4: ["192.0.2.1"] }),
  register: async () => ({ providerRef: "ref-1", records: [] }),
  verify: async () => ({ attached: true, tls, records: [], message: null }),
  status: async () => ({ attached: true, tls, records: [], message: null }),
  remove: async () => undefined,
});

test("il dominio lo collega solo il proprietario, e mai un indirizzo EasyGame", async () => {
  await createSite();
  providers.__setDomainProviderForTests(stubProvider());
  await assert.rejects(() => domains.addDomain(scope(CLUB, "club_manager"), { hostname: "www.fortitudo.it" }), /Accesso negato/);
  const previous = process.env.EASYGAME_APP_HOSTS;
  process.env.EASYGAME_APP_HOSTS = "app.easygame.it,easygame.it";
  try {
    await assert.rejects(() => domains.addDomain(scope(), { hostname: "fortitudo.easygame.it" }), /appartiene a EasyGame/);
  } finally {
    if (previous === undefined) delete process.env.EASYGAME_APP_HOSTS;
    else process.env.EASYGAME_APP_HOSTS = previous;
  }
  const domain = await domains.addDomain(scope(), { hostname: "https://www.fortitudo.it/" });
  assert.equal(domain.hostname, "www.fortitudo.it");
  assert.equal(domain.state, "pending_dns");
  assert.equal(domain.role, "primary");
  assert.deepEqual(domain.records.map((record) => record.type), ["TXT", "CNAME"]);
});

test("verifica: senza il TXT resta in attesa; con il TXT e il certificato diventa attivo", async () => {
  await createSite();
  providers.__setDomainProviderForTests(stubProvider("active"));
  const domain = await domains.addDomain(scope(), { hostname: "www.fortitudo.it" });
  const token = domain.records.find((record) => record.type === "TXT").value;

  domains.__setDnsResolverForTests({ resolveTxt: async () => [["un altro valore"]] });
  const waiting = await domains.verifyDomain(scope(), domain.id);
  assert.equal(waiting.state, "pending_dns");
  assert.match(waiting.lastError, /non contiene il codice atteso/);

  domains.__setDnsResolverForTests({ resolveTxt: async () => [[token]] });
  const active = await domains.verifyDomain(scope(), domain.id);
  assert.equal(active.state, "active");
  assert.equal(active.tlsState, "active");
});

test("pubblicare: serve il dominio attivo; la stessa chiave non pubblica due volte; il ripristino e una revisione nuova", async () => {
  await createSite();
  await assert.rejects(() => publishing.publishSite(scope(), { idempotencyKey: "chiave-0001" }), /Pubblicazione non possibile/);

  providers.__setDomainProviderForTests(stubProvider("active"));
  const domain = await domains.addDomain(scope(), { hostname: "www.fortitudo.it" });
  const token = domain.records.find((record) => record.type === "TXT").value;
  domains.__setDnsResolverForTests({ resolveTxt: async () => [[token]] });
  await domains.verifyDomain(scope(), domain.id);

  const first = await publishing.publishSite(scope(), { idempotencyKey: "chiave-0001" });
  assert.equal(first.revision.revisionNumber, 1);
  assert.equal(first.reused, false);
  const again = await publishing.publishSite(scope(), { idempotencyKey: "chiave-0001" });
  assert.equal(again.reused, true);
  assert.equal(again.revision.id, first.revision.id);
  const second = await publishing.publishSite(scope(), { idempotencyKey: "chiave-0002" });
  assert.equal(second.revision.revisionNumber, 2);

  const rollback = await publishing.rollbackToRevision(scope(), { revisionId: first.revision.id, idempotencyKey: "chiave-0003" });
  assert.equal(rollback.revision.revisionNumber, 3);
  assert.equal(rollback.revision.origin, "rollback");
  assert.equal(rollback.revision.sourceRevisionId, first.revision.id);
  const revisions = fake.rows("websiteRevision").filter((row) => row.organization_id === CLUB);
  assert.equal(revisions.length, 3, "nessuna revisione riscritta: il ripristino aggiunge");
  const site = fake.rows("websiteSite").find((row) => row.organization_id === CLUB);
  assert.equal(site.current_revision_id, rollback.revision.id);

  await assert.rejects(() => publishing.publishSite(scope(CLUB, "staff"), { idempotencyKey: "chiave-0004" }), /Accesso negato/);
  await assert.rejects(() => publishing.publishSite(scope(), { idempotencyKey: "corta" }), /chiave/);
});

test("le squadre stabili le scrive chi dirige il club, non un ruolo personalizzato costruito sul club manager", async () => {
  const team = await clubTeams.createClubTeam(scope(CLUB, "club_manager"), { name: "Serie C" });
  assert.equal(team.slug, "serie-c");
  await assert.rejects(() => clubTeams.createClubTeam(scope(CLUB, "custom:club_manager:segreteria"), { name: "Under 15" }), /Accesso negato/);
  await assert.rejects(() => clubTeams.createClubTeam(scope(CLUB, "trainer"), { name: "Under 17" }), /Accesso negato/);
});
