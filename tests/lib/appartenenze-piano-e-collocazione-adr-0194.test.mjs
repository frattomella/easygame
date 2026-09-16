import test from "node:test";
import assert from "node:assert/strict";

/**
 * ADR-0194 — il piano di un cambio di appartenenza (§9 casi A–H, §32) e la
 * collocazione membership → gruppo → sede (§33), a livello puro.
 */

const { planMembershipChange, summarizeMembershipPlans } = await import(
  "../../src/lib/categories/membership-change.ts"
);
const { buildMembershipTargetIndex, describeMembershipPlacement, explainUnresolvedPlacement } = await import(
  "../../src/lib/categories/placement.ts"
);

const riga = (categoryId, isPrimary, siteId = "", extra = {}) => ({
  categoryId,
  categoryName: categoryId.toUpperCase(),
  isPrimary,
  siteId,
  rowId: `row-${categoryId}`,
  ...extra,
});
const assegna = (categoryId, role = "primary", previousPrimaryPolicy = "remove", otherSecondariesPolicy = "keep", siteId = "") => ({
  kind: "assign",
  target: { categoryId, categoryName: categoryId.toUpperCase(), siteId },
  role,
  previousPrimaryPolicy,
  otherSecondariesPolicy,
});
const insieme = (plan) => plan.after.map((r) => `${r.categoryId}:${r.isPrimary ? "P" : "S"}`).sort();

test("caso A — U15 primaria → U17 primaria: U17 [P], U15 rimossa, non declassata a secondaria", () => {
  const plan = planMembershipChange([riga("u15", true)], assegna("u17"));
  assert.deepEqual(insieme(plan), ["u17:P"]);
  assert.equal(plan.summary.primaryChanged, true);
  assert.equal(plan.summary.added, true);
  assert.deepEqual(plan.summary.removed.map((r) => r.categoryId), ["u15"]);
  assert.equal(plan.summary.keptAsSecondary, null);
  assert.equal(plan.blocked, false);
  assert.equal(plan.unchanged, false);
});

test("caso B — U15 [P] + U17 [S] → U17 primaria: U17 [P] promossa, nessun doppione", () => {
  const plan = planMembershipChange([riga("u15", true), riga("u17", false)], assegna("u17"));
  assert.deepEqual(insieme(plan), ["u17:P"]);
  assert.equal(plan.summary.promoted, true, "la riga esistente si promuove");
  assert.equal(plan.summary.added, false, "non nasce una seconda riga");
  assert.equal(plan.after.filter((r) => r.categoryId === "u17").length, 1);
  assert.equal(plan.after[0].rowId, "row-u17", "e la stessa riga di prima");
});

test("caso C — U15 [P] + U17 [S] + U19 [S] → U17 primaria: U19 resta, U15 esce", () => {
  const plan = planMembershipChange([riga("u15", true), riga("u17", false), riga("u19", false)], assegna("u17"));
  assert.deepEqual(insieme(plan), ["u17:P", "u19:S"]);
  assert.deepEqual(plan.summary.keptSecondaries.map((r) => r.categoryId), ["u19"]);
});

test("caso D — mantieni la vecchia primaria come secondaria: U17 [P], U15 [S], U19 [S]", () => {
  const plan = planMembershipChange([riga("u15", true, "sede-a"), riga("u19", false)], assegna("u17", "primary", "keep_as_secondary"));
  assert.deepEqual(insieme(plan), ["u15:S", "u17:P", "u19:S"]);
  assert.equal(plan.summary.keptAsSecondary?.categoryId, "u15");
  assert.equal(plan.summary.keptAsSecondary?.siteId, "sede-a", "la vecchia primaria tiene la sua sede");
  assert.equal(plan.summary.removed.length, 0);
});

test("caso E — nuova secondaria: la primaria non cambia", () => {
  const plan = planMembershipChange([riga("u15", true), riga("u19", false)], assegna("u17", "secondary"));
  assert.deepEqual(insieme(plan), ["u15:P", "u17:S", "u19:S"]);
  assert.equal(plan.summary.primaryChanged, false);
  assert.equal(plan.summary.added, true);
});

test("caso F — rimuovi tutte le altre categorie: U17 [P] e basta", () => {
  const plan = planMembershipChange([riga("u15", true), riga("u17", false), riga("u19", false)], assegna("u17", "primary", "remove", "remove"));
  assert.deepEqual(insieme(plan), ["u17:P"]);
  assert.deepEqual(plan.summary.removed.map((r) => r.categoryId).sort(), ["u15", "u19"]);
});

test("caso G — destinazione gia primaria con la stessa sede: idempotente, niente da scrivere", () => {
  const plan = planMembershipChange([riga("u17", true, "sede-a"), riga("u19", false)], assegna("u17", "primary", "remove", "keep", "sede-a"));
  assert.equal(plan.unchanged, true);
  assert.equal(plan.blocked, false);
  assert.ok(plan.warnings.includes("already_primary"));
  assert.deepEqual(insieme(plan), ["u17:P", "u19:S"]);
});

test("caso G bis — gia primaria ma con «rimuovi le altre»: le altre escono, la primaria resta", () => {
  const plan = planMembershipChange([riga("u17", true), riga("u19", false)], assegna("u17", "primary", "remove", "remove"));
  assert.equal(plan.unchanged, false);
  assert.deepEqual(insieme(plan), ["u17:P"]);
  assert.equal(plan.summary.primaryChanged, false);
});

test("caso H — senza primaria ma con secondarie: si segnala e si assegna in modo deterministico; due primarie: si blocca", () => {
  const senza = planMembershipChange([riga("u19", false)], assegna("u17"));
  assert.ok(senza.warnings.includes("missing_primary"));
  assert.equal(senza.blocked, false);
  assert.deepEqual(insieme(senza), ["u17:P", "u19:S"]);

  const due = planMembershipChange([riga("u15", true), riga("u17", true)], assegna("u19"));
  assert.equal(due.blocked, true);
  assert.ok(due.warnings.includes("multiple_primaries"));
  assert.deepEqual(insieme(due), ["u15:P", "u17:P"], "non si tocca niente");
});

test("una secondaria promossa prende la sede della squadra scelta; il nome storico della riga si conserva", () => {
  const plan = planMembershipChange(
    [riga("u15", true, "sede-a"), riga("u17", false, "sede-a", { storedCategoryName: "Under 17 vecchio" })],
    assegna("u17", "primary", "remove", "keep", "sede-b"),
  );
  const u17 = plan.after.find((r) => r.categoryId === "u17");
  assert.equal(u17.siteId, "sede-b");
  assert.equal(u17.storedCategoryName, "Under 17 vecchio");
});

test("destinazione secondaria che e gia la primaria: bloccato, non si declassa da qui", () => {
  const plan = planMembershipChange([riga("u15", true)], assegna("u15", "secondary"));
  assert.equal(plan.blocked, true);
  assert.ok(plan.warnings.includes("already_primary"));
});

test("rimuovi: una secondaria esce; la primaria non si rimuove; chi non c'e non cambia niente", () => {
  const via = planMembershipChange([riga("u15", true), riga("u19", false)], { kind: "remove", categoryId: "u19" });
  assert.deepEqual(insieme(via), ["u15:P"]);
  assert.deepEqual(via.summary.removed.map((r) => r.categoryId), ["u19"]);

  const primaria = planMembershipChange([riga("u15", true), riga("u19", false)], { kind: "remove", categoryId: "u15" });
  assert.equal(primaria.blocked, true);
  assert.ok(primaria.warnings.includes("removing_primary"));

  const assente = planMembershipChange([riga("u15", true)], { kind: "remove", categoryId: "u99" });
  assert.equal(assente.unchanged, true);
  assert.ok(assente.warnings.includes("not_a_member"));
});

test("il piano non muta le righe correnti e non produce mai due primarie", () => {
  const correnti = [riga("u15", true), riga("u17", false)];
  const copia = JSON.parse(JSON.stringify(correnti));
  const casi = [
    assegna("u17"),
    assegna("u19"),
    assegna("u19", "primary", "keep_as_secondary", "remove"),
    assegna("u15", "primary", "keep_as_secondary"),
    assegna("u21", "secondary"),
  ];
  for (const comando of casi) {
    const plan = planMembershipChange(correnti, comando);
    assert.ok(plan.after.filter((r) => r.isPrimary).length <= 1, JSON.stringify(comando));
    assert.equal(new Set(plan.after.map((r) => r.categoryId)).size, plan.after.length, "nessun doppione");
  }
  assert.deepEqual(correnti, copia);
});

test("il riepilogo del blocco conta cio che l'anteprima mostra (§27)", () => {
  const piani = [
    { athleteId: "a", plan: planMembershipChange([riga("u15", true)], assegna("u17")) },
    { athleteId: "b", plan: planMembershipChange([riga("u15", true), riga("u17", false)], assegna("u17")) },
    { athleteId: "c", plan: planMembershipChange([riga("u17", true)], assegna("u17")) },
    { athleteId: "d", plan: planMembershipChange([riga("u15", true), riga("u17", true)], assegna("u17")) },
    { athleteId: "e", plan: planMembershipChange([riga("u15", true), riga("u19", false)], assegna("u17")) },
  ];
  const totali = summarizeMembershipPlans(piani);
  assert.equal(totali.athletes, 5);
  assert.equal(totali.updated, 3);
  assert.equal(totali.unchanged, 1);
  assert.equal(totali.blocked, 1);
  assert.equal(totali.newPrimaries, 3);
  assert.equal(totali.promoted, 1);
  assert.equal(totali.added, 2);
  assert.equal(totali.removedMemberships, 3, "tre vecchie primarie tolte");
  assert.equal(totali.keptSecondaries, 1, "la U19 di e resta");
});

/* ── Collocazione (§33) ────────────────────────────────────────────────── */

const club = () =>
  buildMembershipTargetIndex({
    categories: [
      { id: "pulcini-a", name: "Pulcini" },
      { id: "pulcini-b", name: "Pulcini" },
      { id: "u17", name: "Under 17" },
      { id: "fantasma", name: "Pulcini - S. Cosma", configured: false },
    ],
    groups: [
      { categoryId: "pulcini-a", siteId: "scauri", active: true },
      { categoryId: "pulcini-b", siteId: "cosma", active: true },
      { categoryId: "pulcini-b", siteId: "scauri", active: false },
    ],
    sites: [
      { id: "scauri", name: "Scauri" },
      { id: "cosma", name: "S. Cosma" },
    ],
  });

test("le collocazioni scegliibili: una per gruppo attivo, una per categoria senza gruppi; niente fantasmi, niente gruppi disattivati", () => {
  const index = club();
  assert.deepEqual(
    index.targets.map((t) => t.label),
    ["Pulcini · S. Cosma", "Pulcini · Scauri", "Under 17"],
  );
  assert.equal(index.byId("group:pulcini-b:scauri"), null, "il gruppo disattivato non si sceglie (§33.14)");
  assert.equal(index.forCategory("fantasma").length, 0, "la voce nata da una scheda non e una scelta");
  assert.equal(index.forCategory("u17")[0].implicit, true);
});

test("membership → gruppo → sede: risolta, senza sede configurata, non risolta con il motivo", () => {
  const index = club();
  const ok = index.place({ categoryId: "pulcini-b", siteId: "cosma" });
  assert.equal(ok.status, "resolved");
  assert.equal(ok.target.siteName, "S. Cosma");
  assert.equal(describeMembershipPlacement(ok).label, "Pulcini · S. Cosma");

  const senza = index.place({ categoryId: "u17", siteId: "" });
  assert.equal(senza.status, "no_site_configured");
  assert.equal(describeMembershipPlacement(senza).label, "Under 17");

  const sbagliata = index.place({ categoryId: "pulcini-b", siteId: "scauri" });
  assert.equal(sbagliata.status, "unresolved");
  assert.equal(sbagliata.reason, "site_not_configured_for_category");
  assert.match(explainUnresolvedPlacement(sbagliata), /non si svolge nella sede «Scauri»/);
  assert.equal(describeMembershipPlacement(sbagliata).valid, false);

  const ignota = index.place({ categoryId: "u17", siteId: "roma" });
  assert.equal(ignota.reason, "unknown_site");
  assert.equal(describeMembershipPlacement(ignota).siteName, "Sede non disponibile", "mai un identificativo grezzo (§33.13)");

  const nonCollocata = index.place({ categoryId: "pulcini-a", siteId: "" });
  assert.equal(nonCollocata.reason, "category_without_sites");
  assert.match(explainUnresolvedPlacement(nonCollocata), /indicare quale/);

  const estranea = index.place({ categoryId: "u99", siteId: "", categoryName: "Sconosciuta" });
  assert.equal(estranea.reason, "unknown_category");
  assert.equal(describeMembershipPlacement(estranea).label, "Sconosciuta", "si legge il nome dato, e resta leggibile");
});

test("un'etichetta scritta a mano si riconosce solo se nomina una squadra sola (import, modulistica)", () => {
  const index = club();
  assert.equal(index.fromLabel("Pulcini · S. Cosma").target?.id, "group:pulcini-b:cosma");
  assert.equal(index.fromLabel("pulcini · scauri").target?.id, "group:pulcini-a:scauri");
  assert.equal(index.fromLabel("Under 17").target?.id, "group:u17");
  const ambigua = index.fromLabel("Pulcini");
  assert.equal(ambigua.target, null);
  assert.equal(ambigua.ambiguous, true, "due Pulcini: non se ne sceglie una");
  assert.deepEqual(index.fromLabel("Giovanissimi"), { target: null, ambiguous: false });
});
