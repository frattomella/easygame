import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **ADR-0200 §2 — un host del gestionale, ogni altro host e il sito di un club.**
 *
 * Il middleware decide per host: sul gestionale tutto resta com'e (e il
 * renderer interno `/site-render` non si apre per indirizzo); sul dominio di
 * un club la richiesta si riscrive verso il renderer del sito, e delle API
 * passano solo quelle pubbliche del sito, con l'host dichiarato dal server.
 */

let middleware;

const richiesta = (url, host, extraHeaders = {}) => {
  const headers = { ...extraHeaders };
  if (host) headers["x-forwarded-host"] = host;
  const request = new Request(url, { headers });
  /* `NextRequest.nextUrl` sa clonarsi: il middleware lo fa prima di riscrivere. */
  const nextUrl = Object.assign(new URL(url), { clone: () => new URL(url) });
  return Object.assign(request, { nextUrl, cookies: { get: () => undefined } });
};

before(async () => {
  process.env.EASYGAME_APP_HOSTS = "app.easygame.it";
  middleware = await import("../../src/middleware.ts");
});

test("gli host del gestionale e le anteprime di deploy sono il gestionale", () => {
  assert.equal(middleware.isAppHost("app.easygame.it"), true);
  assert.equal(middleware.isAppHost("localhost"), true);
  assert.equal(middleware.isAppHost("easygame-git-feat.vercel.app"), true);
  assert.equal(middleware.isAppHost(""), true);
  assert.equal(middleware.isAppHost("www.fortitudo.it"), false);
});

test("sul dominio di un club una pagina si riscrive verso il renderer del sito", () => {
  const response = middleware.middleware(richiesta("https://www.fortitudo.it/squadre/serie-c", "www.fortitudo.it"));
  const rewrite = response.headers.get("x-middleware-rewrite");
  assert.ok(rewrite, "manca la riscrittura");
  assert.equal(new URL(rewrite).pathname, "/site-render/www.fortitudo.it/squadre/serie-c");
  assert.equal(response.headers.get("x-middleware-request-x-easygame-site-host"), "www.fortitudo.it");

  const home = middleware.middleware(richiesta("https://Fortitudo.it:443/", "Fortitudo.it:443"));
  assert.equal(new URL(home.headers.get("x-middleware-rewrite")).pathname, "/site-render/fortitudo.it");
});

test("robots e sitemap del club arrivano al renderer del sito", () => {
  for (const file of ["/robots.txt", "/sitemap.xml"]) {
    const response = middleware.middleware(richiesta(`https://www.fortitudo.it${file}`, "www.fortitudo.it"));
    assert.equal(new URL(response.headers.get("x-middleware-rewrite")).pathname, `/site-render/www.fortitudo.it${file}`);
  }
  const matcher = middleware.config.matcher.join(" ");
  assert.match(matcher, /robots\.txt/);
  assert.match(matcher, /sitemap\.xml/);
});

test("sul dominio di un club le API del gestionale non esistono; quelle pubbliche del sito si", () => {
  const blocked = middleware.middleware(richiesta("https://www.fortitudo.it/api/v1/athletes", "www.fortitudo.it"));
  assert.equal(blocked.status, 404);
  const login = middleware.middleware(richiesta("https://www.fortitudo.it/api/v1/auth/login", "www.fortitudo.it"));
  assert.equal(login.status, 404);

  const media = middleware.middleware(richiesta("https://www.fortitudo.it/api/public/website/media/abc", "www.fortitudo.it"));
  assert.notEqual(media.status, 404);
  assert.equal(media.headers.get("x-middleware-rewrite"), null);
  assert.equal(media.headers.get("x-middleware-request-x-easygame-site-host"), "www.fortitudo.it");
});

test("un host dichiarato dal visitatore non si puo spacciare per un altro: lo riscrive il middleware", () => {
  const response = middleware.middleware(
    richiesta("https://www.fortitudo.it/api/public/website/inquiries", "www.fortitudo.it", { "x-easygame-site-host": "www.altro-club.it" }),
  );
  assert.equal(response.headers.get("x-middleware-request-x-easygame-site-host"), "www.fortitudo.it");
});

test("sul gestionale un host di sito dichiarato dal visitatore non arriva alle rotte", () => {
  const response = middleware.middleware(
    richiesta("https://app.easygame.it/api/public/website/inquiries", "app.easygame.it", { "x-easygame-site-host": "www.fortitudo.it" }),
  );
  assert.equal(response.headers.get("x-middleware-request-x-easygame-site-host"), null);
});

test("il secondo passaggio della riscrittura arriva al renderer; dal gestionale senza il segreto no", () => {
  /*
    Trovato nel collaudo a browser: Next ripassa dal middleware il percorso
    riscritto con l'host del gestionale, e ogni pagina tranne la home
    rispondeva «Not found». Il secondo passaggio porta il segreto della prima.
  */
  const first = middleware.middleware(richiesta("https://www.fortitudo.it/squadre/serie-c", "www.fortitudo.it"));
  const internal = {};
  for (const [name, value] of first.headers) {
    if (name.startsWith("x-middleware-request-")) internal[name.slice("x-middleware-request-".length)] = value;
  }
  assert.ok(internal["x-easygame-site-render"], "la riscrittura porta il segreto");
  const second = middleware.middleware(
    richiesta("https://app.easygame.it/site-render/www.fortitudo.it/squadre/serie-c", "app.easygame.it", {
      "x-easygame-site-host": internal["x-easygame-site-host"],
      "x-easygame-site-render": internal["x-easygame-site-render"],
    }),
  );
  assert.notEqual(second.status, 404);

  const forged = middleware.middleware(
    richiesta("https://app.easygame.it/site-render/www.fortitudo.it/squadre", "app.easygame.it", {
      "x-easygame-site-host": "www.fortitudo.it",
      "x-easygame-site-render": "indovinato",
    }),
  );
  assert.equal(forged.status, 404);

  const otherHost = middleware.middleware(
    richiesta("https://app.easygame.it/site-render/www.altro-club.it/", "app.easygame.it", {
      "x-easygame-site-host": internal["x-easygame-site-host"],
      "x-easygame-site-render": internal["x-easygame-site-render"],
    }),
  );
  assert.equal(otherHost.status, 404, "il segreto vale solo per l'host della riscrittura");
});

test("sul gestionale il renderer interno non si apre per indirizzo, e l'area del sito chiede la sessione", () => {
  const hidden = middleware.middleware(richiesta("https://app.easygame.it/site-render/www.fortitudo.it", "app.easygame.it"));
  assert.equal(hidden.status, 404);
  for (const path of ["/website", "/website/editor", "/website-preview/abc"]) {
    const response = middleware.middleware(richiesta(`https://app.easygame.it${path}`, "app.easygame.it"));
    assert.equal(response.status, 307, `${path} senza sessione va al login`);
    assert.match(response.headers.get("location"), /\/login\?next=/);
  }
});
