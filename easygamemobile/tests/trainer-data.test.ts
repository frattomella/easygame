import { test } from "node:test";
import assert from "node:assert/strict";

import { getCategoryIdsFromGroupIds } from "../client/lib/trainer-data";

// Scoperto durante il batch di completamento funzionale (acceptance pass
// autenticata WP13): un trainer assegnato a una categoria via sede porta
// `groupIds: ["group:<categoryId>:<siteId>"]` e `categories: []` (ADR-0155,
// identita categoria+sede). `getTrainerCategoryIds` leggeva solo
// `trainer.categories` — sempre `[]`, quindi sempre truthy, quindi mai
// scavalcato dal resto della catena `||` — e il trainer spariva dal
// proprio roster (Squadre, Presenze, Convocazioni) pur restando assegnato
// sul Web. Questi test coprono solo il nuovo parser: `mobile-backend-
// storage.ts` (`normalizeTrainerProfile`) e gia testato end-to-end sul
// roster reale, non qui.

test("getCategoryIdsFromGroupIds: group:<categoryId>:<siteId> restituisce la sola categoria", () => {
  const ids = getCategoryIdsFromGroupIds([
    "group:category-1787872736514-ggarbjf:site-1787872657553-6f03a0",
  ]);
  assert.deepEqual(ids, ["category-1787872736514-ggarbjf"]);
});

test("getCategoryIdsFromGroupIds: group:<categoryId> senza sede resta valido", () => {
  const ids = getCategoryIdsFromGroupIds(["group:cat-u15"]);
  assert.deepEqual(ids, ["cat-u15"]);
});

test("getCategoryIdsFromGroupIds: piu gruppi sulla stessa categoria (piu sedi) non duplicano l'id", () => {
  const ids = getCategoryIdsFromGroupIds([
    "group:cat-pulcini:site-roma",
    "group:cat-pulcini:site-aprilia",
  ]);
  assert.deepEqual(ids, ["cat-pulcini"]);
});

test("getCategoryIdsFromGroupIds: una stringa senza il prefisso 'group:' viene scartata, non fraintesa", () => {
  const ids = getCategoryIdsFromGroupIds(["cat-pulcini", "site-roma"]);
  assert.deepEqual(ids, []);
});

test("getCategoryIdsFromGroupIds: elenco assente o non un array → nessun id, mai un errore", () => {
  assert.deepEqual(getCategoryIdsFromGroupIds(undefined), []);
  assert.deepEqual(getCategoryIdsFromGroupIds(null), []);
  assert.deepEqual(getCategoryIdsFromGroupIds("group:cat-pulcini"), []);
});
