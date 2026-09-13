import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSiteIndex,
  isCrossSiteEvent,
  isSameSite,
  resolveRecommendedStructures,
} from "../../src/lib/club-sites.ts";

/**
 * Categoria → sede → struttura consigliata, e l'avviso cross-site.
 *
 * Issue UAT: quando l'utente sceglie una categoria, EasyGame deve preferire e
 * suggerire una struttura della **stessa sede**, senza mai renderla
 * obbligatoria; una struttura di un'altra sede resta selezionabile, ma la
 * conferma finale deve avvisare (il warning e sull'**evento**, non sulla
 * categoria: nessuna auto-migrazione).
 *
 * Identita sempre per **id**, mai per nome (invariante del mandato): tutte le
 * prove qui usano id di sede distinti, mai etichette.
 */

const SITE_SCAURI = "site-scauri";
const SITE_SCOSMA = "site-s-cosma";

const struttura = (id, siteId) => ({ id, name: id, siteId });

test("resolveRecommendedStructures · nessuna sede da confrontare → nessuna consigliata, ordine invariato", () => {
  const strutture = [struttura("A", SITE_SCAURI), struttura("B", SITE_SCOSMA)];
  const risultato = resolveRecommendedStructures(strutture, "");

  assert.deepEqual(
    risultato.map((voce) => voce.structure.id),
    ["A", "B"],
    "senza siteId l'ordine di ingresso non cambia",
  );
  assert.ok(risultato.every((voce) => voce.recommended === false));
});

test("resolveRecommendedStructures · le strutture della sede della categoria sono consigliate e in cima", () => {
  const strutture = [
    struttura("Arena-Scosma", SITE_SCOSMA),
    struttura("Palazzetto-Scauri", SITE_SCAURI),
    struttura("Palestra-Scauri", SITE_SCAURI),
    struttura("Senza-Sede", ""),
  ];

  const risultato = resolveRecommendedStructures(strutture, SITE_SCAURI);

  assert.deepEqual(
    risultato.map((voce) => voce.structure.id),
    ["Palazzetto-Scauri", "Palestra-Scauri", "Arena-Scosma", "Senza-Sede"],
    "le due strutture di Scauri vengono prima, nell'ordine di ingresso originale",
  );
  assert.equal(
    risultato.find((voce) => voce.structure.id === "Palazzetto-Scauri")
      ?.recommended,
    true,
  );
  assert.equal(
    risultato.find((voce) => voce.structure.id === "Arena-Scosma")
      ?.recommended,
    false,
  );
  assert.equal(
    risultato.find((voce) => voce.structure.id === "Senza-Sede")?.recommended,
    false,
    "una struttura senza sede non e 'consigliata': non si sa se e la stessa sede",
  );
});

test("resolveRecommendedStructures · risolve alias id/nome tramite un SiteIndex", () => {
  const indice = buildSiteIndex([
    { id: SITE_SCAURI, name: "Scauri", city: "Scauri", address: "", notes: "", active: true },
  ]);
  const strutture = [struttura("Palazzetto", "Scauri")]; // riferimento per nome

  const risultato = resolveRecommendedStructures(strutture, SITE_SCAURI, indice);
  assert.equal(risultato[0].recommended, true);
});

test("isSameSite · vuoto contro qualunque cosa non e mai la stessa sede", () => {
  assert.equal(isSameSite("", SITE_SCAURI), false);
  assert.equal(isSameSite(SITE_SCAURI, ""), false);
  assert.equal(isSameSite("", ""), false);
});

test("isCrossSiteEvent · categoria senza sede → nessun avviso (comportamento attuale)", () => {
  assert.equal(isCrossSiteEvent("", SITE_SCAURI), false);
});

test("isCrossSiteEvent · struttura senza sede → nessun avviso", () => {
  assert.equal(isCrossSiteEvent(SITE_SCAURI, ""), false);
});

test("isCrossSiteEvent · stessa sede → nessun avviso", () => {
  assert.equal(isCrossSiteEvent(SITE_SCAURI, SITE_SCAURI), false);
});

test("isCrossSiteEvent · sedi diverse → avviso (ma resta selezionabile: qui si prova solo il predicato)", () => {
  assert.equal(isCrossSiteEvent(SITE_SCAURI, SITE_SCOSMA), true);
});
