import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NAV_GROUPS,
  QUICK_ACTIONS,
  buildBreadcrumb,
  findNavItemForPath,
  visibleNavGroups,
  visibleQuickActions,
} from "../../src/components/web/shell/navigation.ts";
import { preferenceKey, readPreference, writePreference } from "../../src/lib/web/preferences.ts";

/**
 * Il guscio Web V2 (guideline 06): sei gruppi, mai piu di otto voci, ogni
 * modulo del prodotto raggiungibile, le voci negate assenti e non in grigio.
 */

test("sei gruppi nell'ordine del sistema, mai piu di otto voci per gruppo", () => {
  assert.deepEqual(
    NAV_GROUPS.map((g) => g.id),
    ["overview", "people", "sport", "office", "finance", "settings"],
  );
  for (const group of NAV_GROUPS) {
    assert.ok(group.items.length >= 1 && group.items.length <= 8, `${group.label}: ${group.items.length} voci`);
  }
});

test("nessuna destinazione della barra V1 e sparita", () => {
  const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  for (const href of [
    "/dashboard", "/reports", "/hub", "/athletes", "/trainers", "/staff", "/soci", "/categories",
    "/medical", "/procura", "/calendar", "/training", "/matches", "/structures", "/clothing",
    "/registration-management", "/modulistica", "/consensi", "/secretariat", "/documenti",
    "/notifications", "/communications", "/movements", "/sponsors", "/sport-work",
    "/organization", "/settings", "/permissions", "/dashboard/access-management", "/audit",
  ]) {
    assert.ok(hrefs.includes(href), `${href} deve restare una voce di menu`);
  }
  assert.equal(new Set(hrefs).size, hrefs.length, "nessuna rotta compare due volte");
});

test("ogni voce ha una pagina reale", () => {
  const root = process.cwd();
  for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
    const segments = item.href.replace(/^\//, "").split("/");
    const page = path.join(root, "src", "app", ...segments, "page.tsx");
    assert.doesNotThrow(() => readFileSync(page), `${item.href}: nessuna pagina`);
  }
});

test("le voci negate al ruolo sono assenti, e un gruppo vuoto sparisce", () => {
  const owner = visibleNavGroups({ role: "owner" });
  assert.equal(owner.length, 6);
  const staff = visibleNavGroups({ role: "staff" });
  const staffHrefs = staff.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(staffHrefs.includes("/athletes"), true);
  assert.equal(staffHrefs.includes("/organization"), false, "le impostazioni sono della direzione");
  const trainer = visibleNavGroups({ role: "trainer" });
  assert.deepEqual(trainer, [], "l'allenatore ha il proprio guscio, non questo menu");
  const parent = visibleNavGroups({ role: "parent" });
  assert.deepEqual(parent, []);
});

test("la voce Prima nota segue la matrice contabile", () => {
  const collaborator = visibleNavGroups({ role: "collaborator" }).flatMap((g) => g.items.map((i) => i.href));
  assert.equal(collaborator.includes("/movements"), true);
  const trainerQuick = visibleQuickActions({ role: "trainer" });
  assert.equal(trainerQuick.some((a) => a.href.startsWith("/movements")), false);
});

test("le azioni rapide sono quelle del prodotto, nell'ordine «bisogno prima, routine dopo»", () => {
  assert.deepEqual(
    QUICK_ACTIONS.map((a) => a.id),
    ["new-athlete", "register-certificate", "new-training", "new-match", "new-payment"],
  );
  for (const action of QUICK_ACTIONS) {
    assert.ok(action.fields.length > 0, `${action.id}: dice quali campi chiedera`);
  }
  const owner = visibleQuickActions({ role: "owner" });
  assert.equal(owner.length, 5);
  assert.equal(visibleQuickActions({ role: "parent" }).length, 0, "il ruolo che non puo creare niente non ha il cassetto");
});

test("il percorso trova la voce piu specifica", () => {
  assert.equal(findNavItemForPath("/dashboard/access-management")?.item.id, "access");
  assert.equal(findNavItemForPath("/dashboard")?.item.id, "dashboard");
  assert.equal(findNavItemForPath("/athletes/abc-123")?.item.id, "athletes");
  assert.equal(findNavItemForPath("/nessuna"), null);
});

test("il breadcrumb e Club / Gruppo / Voce, e la scheda porta il nome del record", () => {
  assert.deepEqual(
    buildBreadcrumb("/athletes", { clubName: "Fortitudo Scauri" }).map((c) => c.label),
    ["Fortitudo Scauri", "Persone", "Atleti"],
  );
  const scheda = buildBreadcrumb("/athletes/3b9d31c4-5d3e-47bc-9e9b-0f205adc7c01", {
    clubName: "Fortitudo Scauri",
    currentLabel: "Marco Ferretti",
  });
  assert.deepEqual(scheda.map((c) => c.label), ["Fortitudo Scauri", "Persone", "Atleti", "Marco Ferretti"]);
  assert.equal(scheda[2].href, "/athletes");
  assert.equal(scheda[3].href, undefined, "l'ultimo segmento e la pagina corrente");
  const nuovo = buildBreadcrumb("/athletes/new", { clubName: "Club" });
  assert.deepEqual(nuovo.map((c) => c.label), ["Club", "Persone", "Atleti", "Nuovo"]);
});

test("il breadcrumb non supera quattro livelli", () => {
  const deep = buildBreadcrumb("/trainers/abc/contracts/upload", { clubName: "Club" });
  assert.ok(deep.length <= 4);
  assert.equal(deep[1].label, "…");
});

test("le preferenze usano chiavi egw.<modulo>.<impostazione> e tollerano l'assenza", () => {
  assert.equal(preferenceKey("atleti", "density"), "egw.atleti.density");
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  assert.equal(readPreference("atleti", "density", "medium", storage), "medium");
  writePreference("atleti", "density", "compact", storage);
  assert.equal(readPreference("atleti", "density", "medium", storage), "compact");
  writePreference("atleti", "density", null, storage);
  assert.equal(readPreference("atleti", "density", "medium", storage), "medium");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
  assert.equal(readPreference("x", "y", 1, broken), 1);
  assert.doesNotThrow(() => writePreference("x", "y", 2, broken));
});
