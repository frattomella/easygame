import assert from "node:assert/strict";
import test from "node:test";

import { RESERVED_SLUGS, detailSlug, detailSlugId, slugify, splitRequestPath, uniqueSlug, validatePageSlug } from "../../src/lib/website/slug.ts";
import { normalizeLink, resolveLinkHref, sanitizeExternalUrl } from "../../src/lib/website/links.ts";
import { buildMapEmbedSrc, parseEmbedUrl } from "../../src/lib/website/embed.ts";
import {
  canTransitionDomain,
  companionHostname,
  expectedDnsRecords,
  isDomainServing,
  normalizeHostname,
  registrableDomain,
} from "../../src/lib/website/domains/model.ts";
import { matchSnapshotRoute, pagePathFor } from "../../src/lib/website/publishing/snapshot.ts";
import { DEFAULT_THEME, normalizeTheme, themeToCssVariables } from "../../src/lib/website/theme/theme.ts";
import { checkPaletteContrast, contrastRatio } from "../../src/lib/website/theme/palette.ts";
import { normalizeNavigation, pruneNavigationForPage, reorderNavItems, validateNavigation } from "../../src/lib/website/navigation.ts";
import { getSportAdapter, normalizePeriodScores, normalizePlayerStats, resolveSportKey, resultFromPeriods, clubPrimarySport } from "../../src/lib/sports/adapters.ts";
import { nextSlugHistory } from "../../src/lib/sports/teams.ts";
import { parseEditorMessage } from "../../src/lib/website/editor-protocol.ts";
import { siteDayKey } from "../../src/lib/website/dates.ts";

/**
 * **ADR-0200 — le regole che stanno fra l'operatore e il pubblico.**
 *
 * Slug e indirizzi riservati, collegamenti tipizzati che non diventano mai
 * `javascript:`, incorporamenti solo dai servizi ammessi, domini solo del club
 * (mai un sottodominio EasyGame), record DNS attesi, instradamento verso i
 * modelli di dettaglio, contrasto del tema, menu, adattatori sportivi e il
 * protocollo dell'editor che scarta ogni messaggio di forma sconosciuta.
 */

test("slug: normalizzati, unici, mai un indirizzo del sistema", () => {
  assert.equal(slugify("Prima Squadra – Serie C!"), "prima-squadra-serie-c");
  assert.equal(slugify("L'Àquila"), "laquila");
  assert.equal(validatePageSlug("Chi Siamo").ok, true);
  assert.equal(validatePageSlug("api").ok, false);
  assert.equal(validatePageSlug("").ok, false);
  assert.equal(validatePageSlug("", { allowHome: true }).ok, true);
  for (const reserved of ["api", "_next", "site-render", "website-preview", "sitemap.xml"]) assert.ok(RESERVED_SLUGS.has(reserved));
  assert.equal(uniqueSlug("News", ["news", "news-2"]), "news-3");
  assert.deepEqual(splitRequestPath(["Squadre", "%20Serie-C ", ""]), ["squadre", "serie-c"]);
});

test("slug di dettaglio: il testo cambia, l'identita resta la coda", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const slug = detailSlug(id, "Fortitudo vs Stella");
  assert.equal(slug, "fortitudo-vs-stella-0f8fad5bd9cb469fa16570867728950e");
  assert.equal(detailSlugId(slug), id);
  assert.equal(detailSlugId("altro-testo-0f8fad5bd9cb469fa16570867728950e"), id);
  assert.equal(detailSlugId("serie-c"), null);
});

test("collegamenti: una pagina per identificativo, URL solo http(s), niente javascript:", () => {
  const context = { pagePaths: { p1: "/squadre", home: "/" }, formsOrigin: "https://app.easygame.it/" };
  assert.deepEqual(resolveLinkHref({ kind: "page", pageId: "p1" }, context), { href: "/squadre", external: false, newTab: false });
  assert.equal(resolveLinkHref({ kind: "page", pageId: "sparita" }, context), null);
  assert.equal(resolveLinkHref({ kind: "page", pageId: "home" }, { ...context, pathPrefix: "/website-preview/s1" }).href, "/website-preview/s1");
  assert.equal(resolveLinkHref({ kind: "url", url: "javascript:alert(1)" }, context), null);
  assert.equal(sanitizeExternalUrl("data:text/html,x"), null);
  assert.equal(sanitizeExternalUrl("https://esempio.it/a"), "https://esempio.it/a");
  assert.equal(resolveLinkHref({ kind: "form", formSlug: "iscrizioni 2026" }, context).href, "https://app.easygame.it/forms/iscrizioni%202026");
  assert.equal(resolveLinkHref({ kind: "email", email: "non una mail" }, context), null);
  assert.equal(normalizeLink({ kind: "boh" }).kind, "none");
});

test("incorporamenti: solo i servizi ammessi, sempre nelle forme sicure", () => {
  const youtube = parseEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(youtube.provider, "youtube");
  assert.match(youtube.src, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.equal(parseEmbedUrl("https://vimeo.com/76979871").provider, "vimeo");
  assert.equal(parseEmbedUrl("https://evil.example/embed"), null);
  assert.equal(parseEmbedUrl("javascript:alert(1)"), null);
  assert.equal(parseEmbedUrl("https://vimeo.com/76979871", ["youtube"]), null, "un servizio fuori dall'elenco del blocco non passa");
  assert.match(buildMapEmbedSrc("Via Roma 1, Scauri", 40), /z=19/);
});

test("domini: solo del club, mai EasyGame, mai un IP o un dominio locale in produzione", () => {
  assert.deepEqual(normalizeHostname("https://WWW.Fortitudo.it/chi-siamo"), { ok: true, hostname: "www.fortitudo.it" });
  assert.equal(normalizeHostname("fortitudo.easygame.it", { reservedSuffixes: ["easygame.it"] }).ok, false);
  assert.equal(normalizeHostname("easygame.it", { reservedSuffixes: ["easygame.it"] }).ok, false);
  assert.equal(normalizeHostname("192.168.1.1").ok, false);
  assert.equal(normalizeHostname("localhost").ok, false);
  assert.equal(normalizeHostname("fortitudo.localhost").ok, false);
  assert.equal(normalizeHostname("fortitudo.localhost", { allowLocalDevelopment: true }).ok, true);
  assert.equal(normalizeHostname("user:pass@club.it").ok, false);
  assert.equal(registrableDomain("basket.club.co.uk"), "club.co.uk");
  assert.equal(companionHostname("club.it"), "www.club.it");
  assert.equal(companionHostname("www.club.it"), "club.it");
  assert.equal(companionHostname("basket.club.it"), null);
});

test("record DNS: TXT di proprieta sempre, CNAME per un sottodominio, A per il dominio nudo", () => {
  const target = { cname: "cname.easygame.it", ipv4: ["76.76.21.21"] };
  const sub = expectedDnsRecords("www.club.it", "tok", target);
  assert.deepEqual(sub.map((record) => [record.type, record.name, record.value]), [
    ["TXT", "_easygame-verify.www", "tok"],
    ["CNAME", "www", "cname.easygame.it"],
  ]);
  const apex = expectedDnsRecords("club.it", "tok", target);
  assert.deepEqual(apex.map((record) => [record.type, record.name]), [
    ["TXT", "_easygame-verify"],
    ["A", "@"],
  ]);
});

test("stati del dominio: il sito si serve solo con dominio attivo e certificato attivo", () => {
  assert.equal(isDomainServing("active", "active"), true);
  assert.equal(isDomainServing("active", "pending"), false);
  assert.equal(isDomainServing("verifying", "active"), false);
  assert.equal(canTransitionDomain("pending_dns", "verifying"), true);
  assert.equal(canTransitionDomain("removed", "active"), false);
});

test("instradamento: pagina esatta, poi modello di dettaglio, mai piu di due livelli", () => {
  const page = (id, kind, slug) => ({ id, kind, slug, path: pagePathFor(kind, slug), title: id, seo: {}, document: { schemaVersion: 1, sections: [] } });
  const pages = [page("home", "home", ""), page("teams", "standard", "squadre"), page("team", "team_detail", "squadra")];
  assert.equal(pagePathFor("team_detail", "squadra"), "/squadra/*");
  assert.equal(matchSnapshotRoute(pages, []).page.id, "home");
  assert.equal(matchSnapshotRoute(pages, ["squadre"]).page.id, "teams");
  const detail = matchSnapshotRoute(pages, ["squadra", "serie-c"]);
  assert.deepEqual([detail.kind, detail.detail, detail.item], ["detail", "team", "serie-c"]);
  assert.equal(matchSnapshotRoute(pages, ["squadra"]).kind, "not_found", "il modello da solo non e una pagina");
  assert.equal(matchSnapshotRoute(pages, ["squadra", "a", "b"]).kind, "not_found");
});

test("tema: valori fuori catalogo tornano al predefinito, il contrasto si misura", () => {
  const theme = normalizeTheme({ colors: { primary: "rosso", accent: "#FFAA00" }, radius: "enorme", fonts: { heading: "comic-sans" } });
  assert.equal(theme.colors.primary, DEFAULT_THEME.colors.primary);
  assert.equal(theme.colors.accent, "#ffaa00");
  assert.equal(theme.radius, DEFAULT_THEME.radius);
  assert.equal(theme.fonts.heading, DEFAULT_THEME.fonts.heading);
  const css = themeToCssVariables(theme);
  assert.ok(Object.keys(css).some((key) => key.startsWith("--ws-")));
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  const checks = checkPaletteContrast({ ...DEFAULT_THEME.colors, foreground: "#eeeeee", background: "#ffffff" });
  assert.equal(checks.find((check) => check.pair === "foreground/background").passes, false);
});

test("menu: voci verso pagine sparite si segnalano e si potano, il riordino sposta", () => {
  const navigation = normalizeNavigation({
    header: [
      { id: "1", label: "Home", kind: "page", link: { pageId: "home" } },
      { id: "2", label: "Vecchia", kind: "page", link: { pageId: "sparita" } },
      { id: "3", label: "Gruppo", kind: "group", children: [] },
      { id: "4", label: "", kind: "page" },
    ],
  });
  assert.equal(navigation.header.length, 3, "una voce senza etichetta cade");
  const issues = validateNavigation(navigation, new Set(["home"]));
  assert.deepEqual(issues.map((issue) => issue.itemId), ["2", "3"]);
  assert.deepEqual(pruneNavigationForPage(navigation, "sparita").header.map((item) => item.id), ["1", "3"]);
  assert.deepEqual(reorderNavItems(navigation.header, "3", "1").map((item) => item.id), ["3", "1", "2"]);
});

test("sport: alias, periodi, risultato dai parziali, set vinti nella pallavolo, solo statistiche dello sport", () => {
  assert.equal(resolveSportKey("Pallacanestro"), resolveSportKey("basket"));
  assert.equal(resolveSportKey("curling"), "generic");
  assert.equal(clubPrimarySport({ sports: ["volley"] }), "volleyball");
  const basket = getSportAdapter("basketball");
  const periods = normalizePeriodScores([{ home: 20, away: 18 }, { home: 15, away: 22 }, { home: "x", away: 3 }], basket);
  assert.equal(periods[0].label, basket.periodName(1));
  assert.equal(periods[2].home, null);
  assert.equal(resultFromPeriods(periods, basket), null, "periodi incompleti non danno un risultato");
  assert.deepEqual(resultFromPeriods(periods.slice(0, 2), basket), { home: 35, away: 40 });
  const volley = getSportAdapter("volleyball");
  assert.deepEqual(
    resultFromPeriods(normalizePeriodScores([{ home: 25, away: 20 }, { home: 22, away: 25 }, { home: 25, away: 18 }, { home: 25, away: 23 }], volley), volley),
    { home: 3, away: 1 },
  );
  assert.deepEqual(normalizePlayerStats({ points: 12.4, rebounds: -1, hacking: 5 }, basket), { points: 12 });
  assert.equal(basket.allowsDraw, false);
});

test("squadre stabili: lo slug vecchio resta per i reindirizzamenti", () => {
  assert.deepEqual(nextSlugHistory("serie-c", "serie-b", []), ["serie-c"]);
  assert.deepEqual(nextSlugHistory("serie-b", "serie-c", ["serie-c"]), ["serie-b"]);
  assert.deepEqual(nextSlugHistory("serie-c", "serie-c", ["serie-d"]), ["serie-d"]);
});

test("protocollo dell'editor: solo forme note, identificativi puliti, percorsi interni", () => {
  assert.deepEqual(parseEditorMessage({ type: "eg-website:select", target: { kind: "block", id: "abc_1" } }), {
    type: "eg-website:select",
    target: { kind: "block", id: "abc_1" },
  });
  assert.equal(parseEditorMessage({ type: "eg-website:select", target: { kind: "block", id: "<img>" } }), null);
  assert.equal(parseEditorMessage({ type: "eg-website:action", action: "rm -rf", target: { kind: "block", id: "a" } }), null);
  assert.equal(parseEditorMessage({ type: "eg-website:navigate", path: "//evil.example" }), null);
  assert.equal(parseEditorMessage({ type: "eg-website:navigate", path: "https://evil.example" }), null);
  assert.deepEqual(parseEditorMessage({ type: "eg-website:navigate", path: "/squadre" }), { type: "eg-website:navigate", path: "/squadre" });
  assert.equal(parseEditorMessage({ type: "altro" }), null);
  assert.equal(parseEditorMessage("eg-website:refresh"), null);
});

test("il giorno del sito e quello di Roma, non quello UTC", () => {
  assert.equal(siteDayKey(new Date("2026-10-04T22:30:00Z")), "2026-10-05");
  assert.equal(siteDayKey(new Date("2026-10-05T10:00:00Z")), "2026-10-05");
});
