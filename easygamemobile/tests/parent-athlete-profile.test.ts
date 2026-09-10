import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateAge,
  resolveMedicalVisitDate,
  resolveMedicalVisitLabel,
} from "../client/lib/parent-athlete-profile";

test("calcola l'eta da una data di nascita valida", () => {
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const age = calculateAge(tenYearsAgo.toISOString().slice(0, 10));
  assert.equal(age, 10);
});

test("nessuna data -> nessuna eta, mai inventata", () => {
  assert.equal(calculateAge(null), null);
  assert.equal(calculateAge(undefined), null);
  assert.equal(calculateAge("data-non-valida"), null);
});

test("l'eta non conta il compleanno non ancora arrivato quest'anno", () => {
  const birth = new Date();
  birth.setFullYear(birth.getFullYear() - 12);
  birth.setDate(birth.getDate() + 5); // compleanno fra 5 giorni
  assert.equal(calculateAge(birth.toISOString().slice(0, 10)), 11);
});

test("etichetta visita medica: accetta type o title, altrimenti un'etichetta generica", () => {
  assert.equal(
    resolveMedicalVisitLabel({ type: "Idoneità agonistica" }),
    "Idoneità agonistica",
  );
  assert.equal(
    resolveMedicalVisitLabel({ title: "Controllo cardiologico" }),
    "Controllo cardiologico",
  );
  assert.equal(resolveMedicalVisitLabel({}), "Visita");
});

test("data visita medica: accetta date o visitDate", () => {
  assert.equal(resolveMedicalVisitDate({ date: "2026-05-01" }), "2026-05-01");
  assert.equal(
    resolveMedicalVisitDate({ visitDate: "2026-06-01" }),
    "2026-06-01",
  );
  assert.equal(resolveMedicalVisitDate({}), undefined);
});
