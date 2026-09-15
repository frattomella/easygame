import assert from "node:assert/strict";
import test from "node:test";

import {
  ATHLETE_PROFILE_TABS,
  ATHLETE_RECORD_AREAS,
  ATHLETE_RECORD_SECTIONS,
  ATHLETE_TAB_TO_AREA,
  resolveAthleteRecordTarget,
} from "../../src/lib/athlete-profile-tabs.ts";
import {
  countAlertsByArea,
  deriveAthleteRecordAlerts,
} from "../../src/components/athletes/profile/v2/athlete-record-alerts.ts";

/**
 * **Le quattro aree della scheda atleta e la striscia degli avvisi**
 * (Web V2, guideline 09 §9.8).
 *
 * Due moduli puri: la mappa dalle otto schede della V1 alle aree — che tiene
 * vivi i `?tab=` dei segnalibri — e la regola che decide quali problemi
 * meritano una riga sotto il nome.
 */

test("ci sono quattro aree, e ogni scheda della V1 finisce in una sola", () => {
  assert.equal(ATHLETE_RECORD_AREAS.length, 4);
  const aree = new Set(ATHLETE_RECORD_AREAS.map((area) => area.value));
  for (const tab of ATHLETE_PROFILE_TABS) {
    const target = ATHLETE_TAB_TO_AREA[tab.value];
    assert.ok(target, `la scheda ${tab.value} deve avere un'area`);
    assert.ok(aree.has(target.area), `${tab.value} → ${target.area} non e un'area`);
    assert.ok(
      Object.values(ATHLETE_RECORD_SECTIONS).includes(target.section),
      `${tab.value} deve atterrare su una sezione che esiste`,
    );
  }
});

test("«Iscrizione» (value pagamenti) e «Lavoro e compensi» stanno in Amministrazione", () => {
  assert.equal(ATHLETE_TAB_TO_AREA.pagamenti.area, "amministrazione");
  assert.equal(ATHLETE_TAB_TO_AREA.lavoro.area, "amministrazione");
  assert.equal(ATHLETE_TAB_TO_AREA.sanitari.area, "documenti");
  assert.equal(ATHLETE_TAB_TO_AREA.documenti.area, "documenti");
  assert.equal(ATHLETE_TAB_TO_AREA.abbigliamento.area, "attivita");
  assert.equal(ATHLETE_TAB_TO_AREA.analitiche.area, "attivita");
  assert.equal(ATHLETE_TAB_TO_AREA.generale.area, "profilo");
  assert.equal(ATHLETE_TAB_TO_AREA.contatti.area, "profilo");
});

test("un `?tab=` vecchio, nuovo o sconosciuto atterra sempre da qualche parte", () => {
  assert.deepEqual(resolveAthleteRecordTarget("pagamenti"), {
    area: "amministrazione",
    section: ATHLETE_RECORD_SECTIONS.iscrizione,
  });
  assert.deepEqual(resolveAthleteRecordTarget(" SANITARI "), {
    area: "documenti",
    section: ATHLETE_RECORD_SECTIONS.certificati,
  });
  assert.deepEqual(resolveAthleteRecordTarget("attivita"), { area: "attivita", section: null });
  assert.deepEqual(resolveAthleteRecordTarget("inesistente"), { area: "profilo", section: null });
  assert.deepEqual(resolveAthleteRecordTarget(null), { area: "profilo", section: null });
});

const today = new Date(2026, 8, 15);
const clean = {
  certificates: [{ status: "valid", expiryDate: "2027-06-30" }],
  payments: [{ statusKey: "paid", dueDate: "2026-08-31" }],
  enrollmentStatus: true,
  guardians: [{ id: "g1" }],
  isMinor: true,
  today,
};

test("una scheda pulita non ha avvisi: niente «tutto a posto» verde", () => {
  assert.deepEqual(deriveAthleteRecordAlerts(clean), []);
});

test("il certificato conta quello che scade piu tardi", () => {
  const alerts = deriveAthleteRecordAlerts({
    ...clean,
    certificates: [
      { status: "expired", expiryDate: "2025-01-01" },
      { status: "valid", expiryDate: "2027-06-30" },
    ],
  });
  assert.deepEqual(alerts, []);

  const scaduto = deriveAthleteRecordAlerts({
    ...clean,
    certificates: [{ status: "expired", expiryDate: "2026-09-09" }],
  });
  assert.equal(scaduto.length, 1);
  assert.equal(scaduto[0].id, "certificato-scaduto");
  assert.equal(scaduto[0].severity, "danger");
  assert.match(scaduto[0].text, /9 set 2026/);
  assert.equal(scaduto[0].target.section, ATHLETE_RECORD_SECTIONS.certificati);

  const mancante = deriveAthleteRecordAlerts({ ...clean, certificates: [] });
  assert.equal(mancante[0].id, "certificato-mancante");
  assert.equal(mancante[0].action, "Aggiungi certificato");
});

test("le rate scadute si leggono dallo stato derivato dal server, mai ricalcolate", () => {
  const alerts = deriveAthleteRecordAlerts({
    ...clean,
    payments: [
      { statusKey: "pending", dueDate: "2026-08-31" },
      { statusKey: "pending", dueDate: "2026-12-31" },
      { statusKey: "pending", dueDate: "2026-01-31", data: { excludedFromTotals: true } },
      { statusKey: "paid", dueDate: "2026-01-31" },
      { statusKey: "cancelled", dueDate: "2026-01-31" },
    ],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, "rate-scadute");
  assert.match(alerts[0].text, /Una rata è scaduta/);
  assert.equal(alerts[0].action, "Registra pagamento");
  assert.equal(alerts[0].target.area, "amministrazione");
});

test("iscrizione non attiva e minore senza tutore sono avvisi, non blocchi", () => {
  const alerts = deriveAthleteRecordAlerts({
    ...clean,
    enrollmentStatus: false,
    guardians: [],
  });
  assert.deepEqual(
    alerts.map((alert) => [alert.id, alert.severity]),
    [
      ["iscrizione-non-attiva", "warning"],
      ["nessun-genitore", "warning"],
    ],
  );
  /* Un maggiorenne senza tutore non e un problema. */
  assert.equal(
    deriveAthleteRecordAlerts({ ...clean, guardians: [], isMinor: false }).length,
    0,
  );
});

test("il contatore rosso dello switcher conta solo i problemi bloccanti", () => {
  const alerts = deriveAthleteRecordAlerts({
    ...clean,
    certificates: [],
    payments: [{ statusKey: "pending", dueDate: "2026-08-31" }],
    enrollmentStatus: false,
  });
  assert.deepEqual(countAlertsByArea(alerts), { documenti: 1, amministrazione: 1 });
});
