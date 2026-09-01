import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  accessScopeAllows,
  accessScopeValues,
  normalizeAccessScopes,
} from "../../src/lib/roles/access-scope.ts";

/**
 * **W6 §11.3 — lo scope diventa un confine.**
 *
 * ## Cosa c'era prima, e perché non bastava
 *
 * Prima della Wave 6 la sede **non era un confine di sicurezza**, e la
 * documentazione lo diceva a chiare lettere in due punti
 * ([03](../../docs/knowledge-base/03-architecture-overview.md),
 * [09](../../docs/knowledge-base/09-api-conventions.md)). Il motivo è
 * strutturale: `site_id` arriva come **parametro della richiesta**, quindi chi
 * non lo passa vede tutto. Un filtro che si toglie togliendo un pezzo di
 * indirizzo non è un confine, è una comodità.
 *
 * La lane 6G ha costruito `club_access_scopes`: le righe si creano, si
 * revocano e si audita. Ma nessuno le leggeva, e un perimetro che non
 * restringe è una configurazione che non configura — la stessa promessa vuota
 * che questa Wave ha smontato quattordici volte.
 *
 * ## Le due proprietà che contano
 *
 * **Vuoto significa tutto il club.** È ciò che hanno tutte le tessere che
 * esistono oggi, ed è la scelta che rende il perimetro *additivo*: nessun club
 * si sveglia con qualcuno che vede meno di ieri.
 *
 * **Su un atto è un confine, non un filtro.** Un elenco più corto non è un
 * rifiuto; convocare un atleta che non è nel proprio perimetro sì. È la stessa
 * regola che la lane 6C1 ha scritto per l'allenatore, e per la stessa ragione.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const sede = (value) => ({ kind: "site", value });
const categoria = (value) => ({ kind: "category", value });

/* ------------------------------------------------------------- il dominio */

test("un perimetro vuoto non restringe niente", () => {
  for (const vuoto of [null, undefined, []]) {
    assert.equal(
      accessScopeAllows(vuoto, { siteId: "sede-nord", categoryId: "u15" }),
      true,
    );
    assert.equal(accessScopeAllows(vuoto, {}), true);
  }
});

test("una sede dichiarata esclude le altre", () => {
  const perimetro = [sede("nord")];

  assert.equal(accessScopeAllows(perimetro, { siteId: "nord" }), true);
  assert.equal(accessScopeAllows(perimetro, { siteId: "sud" }), false);
});

test("i due assi si sommano: servono entrambi", () => {
  /*
    «Sede Nord **e** Under 15» non e «Sede Nord **o** Under 15». Un ruolo che
    dichiara due assi li vuole entrambi: e cosi che si descrive un
    responsabile di un settore in una sede.
  */
  const perimetro = [sede("nord"), categoria("u15")];

  assert.equal(
    accessScopeAllows(perimetro, { siteId: "nord", categoryId: "u15" }),
    true,
  );
  assert.equal(
    accessScopeAllows(perimetro, { siteId: "nord", categoryId: "u17" }),
    false,
  );
  assert.equal(
    accessScopeAllows(perimetro, { siteId: "sud", categoryId: "u15" }),
    false,
  );
});

test("una riga senza sede non passa un perimetro di sede", () => {
  /*
    Nel **dominio** una riga muta non passa: e il verso giusto in cui sbagliare
    su un evento, che una sede ce l'ha sempre.

    L'elenco degli atleti fa deliberatamente il contrario, e il perche sta in
    `resources.ts`: «sede vuota» su un atleta significa «non dichiarata», non
    «di un'altra sede», e nasconderlo lascerebbe scoperte proprio le schede che
    qualcuno deve completare (ADR-0038).
  */
  assert.equal(accessScopeAllows([sede("nord")], {}), false);
  assert.equal(accessScopeAllows([sede("nord")], { siteId: "" }), false);
});

test("il perimetro si normalizza: niente vuoti, niente duplicati", () => {
  const normalizzato = normalizeAccessScopes([
    sede("nord"),
    sede("nord"),
    sede("  "),
    { kind: "inventato", value: "x" },
    categoria("u15"),
  ]);

  assert.deepEqual(accessScopeValues(normalizzato, "site"), ["nord"]);
  assert.deepEqual(accessScopeValues(normalizzato, "category"), ["u15"]);
});

/* ---------------------------------------------------- e dove viene applicato */

test("§11.3 · il perimetro arriva fino allo scope della richiesta", () => {
  const auth = leggi("lib/server/auth.ts");

  assert.ok(
    auth.includes("accessScopes: AccessScopeEntry[];"),
    "senza il campo sullo scope nessuna guardia puo leggerlo",
  );
  assert.ok(
    auth.includes("prisma.clubAccessScope.findMany"),
    "e qualcuno deve leggerlo dall archivio, non dal client",
  );
  assert.ok(
    auth.includes("selectedMembership?.customSlug && selectedMembership.id"),
    "la lettura in piu si fa solo per le tessere che un perimetro possono averlo",
  );
});

test("§11.3 · l'elenco degli atleti lo applica dentro il `where`", () => {
  const resources = leggi("lib/server/resources.ts");

  assert.ok(
    resources.includes("const buildAccessScopeFilter = ("),
    "il perimetro deve diventare una condizione della query",
  );
  assert.ok(
    resources.includes("where.AND = [...(where.AND || []), ...perimetro];"),
    "si somma con AND: chi cerca per nome deve vedere meno, non di piu",
  );

  /*
    Dentro il `where` e non dopo: un filtro applicato in memoria darebbe un
    conteggio che non corrisponde all'elenco, e la pagina direbbe «212 atleti»
    mostrandone trenta.
  */
  const posizioneFiltro = resources.indexOf("const perimetro = buildAccessScopeFilter");
  const posizioneCount = resources.indexOf("delegate.count(", posizioneFiltro);
  assert.ok(
    posizioneFiltro > 0 && posizioneCount > posizioneFiltro,
    "il perimetro deve entrare nel `where` prima del conteggio",
  );
});

test("§11.3 · sugli eventi vale su ogni atto, non solo sull'elenco", () => {
  const events = leggi("lib/server/events.ts");

  assert.ok(
    events.includes("const assertAccessScopeOnEvent = async ("),
    "serve una guardia, non solo un filtro di elenco",
  );

  /*
    Il presidio che chiude la classe: tante guardie di perimetro del ruolo
    quante ne ha l'allenatore. Se domani nascesse una decima funzione con il
    perimetro dell'allenatore e senza questo, il conteggio lo direbbe.
  */
  const attiAllenatore = (
    events.match(/await assertTrainerEventPerimeter\(/g) || []
  ).length;
  const attiRuolo = (events.match(/await assertAccessScopeOnEvent\(/g) || [])
    .length;

  assert.equal(
    attiRuolo,
    attiAllenatore,
    `${attiAllenatore} atti proteggono il perimetro dell'allenatore e ${attiRuolo} quello del ruolo: un atto scoperto e un atto su persone che non sono nel proprio perimetro`,
  );

  assert.ok(
    events.includes("candidato?.siteId ?? candidato?.site_id"),
    "le righe di Prisma e i candidati costruiti in memoria hanno due grafie: un punto che si dimentica di convertire fallirebbe **aperto**",
  );
});

test("§11.3 · il diniego lo dice, e lascia traccia", () => {
  const events = leggi("lib/server/events.ts");
  const inizio = events.indexOf("const assertAccessScopeOnEvent = async (");
  const corpo = events.slice(inizio, inizio + 1800);

  assert.ok(
    corpo.includes("recordPermissionDenied"),
    "un rifiuto senza traccia non permette a un club di capire perche un suo collaboratore non riesce a fare una cosa",
  );
  assert.ok(
    corpo.includes("Accesso negato"),
    "la stringa e la convenzione con cui il route handler mappa il 403",
  );
});
