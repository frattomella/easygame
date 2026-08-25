import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  STAFF_ROLES,
  collectStaffRoles,
  countStaffByDepartment,
  findStaffDepartment,
  makeDepartmentFromName,
  makeDepartmentId,
  mergeStaffDepartments,
  readStaffDepartments,
  removeStaffDepartment,
  upsertStaffDepartment,
} from "../../src/lib/staff-directory.ts";

/**
 * Blocco 7 — i reparti dello staff hanno una fonte sola.
 *
 * Il difetto: un reparto creato con «Altro» durante la creazione di un membro
 * finiva **solo sul membro**. L'elenco staff lo mostrava lo stesso, perche lo
 * deduceva dai membri, quindi sembrava salvato; ma i form di creazione e
 * modifica leggevano `settings.staffDepartments`, dove non era mai arrivato.
 * Da qui «compare nell'archivio ma non nelle select successive».
 */

test("i ruoli predefiniti includono le cariche sociali", () => {
  for (const role of ["Presidente", "Vicepresidente", "Dirigente"]) {
    assert.ok(
      STAFF_ROLES.includes(role),
      `${role} deve essere un ruolo predefinito`,
    );
  }
});

test("«Altro» non e un ruolo: e un comando", () => {
  assert.equal(
    STAFF_ROLES.includes("Altro"),
    false,
    "era nell'elenco e finiva salvato come ruolo di un membro",
  );
});

test("i ruoli in tendina sono i predefiniti piu quelli davvero in uso", () => {
  const roles = collectStaffRoles([
    { role: "Responsabile Logistica" },
    { role: "presidente" },
    { role: "" },
  ]);

  assert.ok(roles.includes("Responsabile Logistica"));
  assert.equal(
    roles.filter((role) => role.toLowerCase() === "presidente").length,
    1,
    "un ruolo gia predefinito non si duplica per differenza di maiuscole",
  );
});

test("l'id di un reparto deriva dal nome, non dall'orologio", () => {
  assert.equal(makeDepartmentId("Area Tecnica"), "dept-area-tecnica");
  assert.equal(makeDepartmentId("Segreteria"), makeDepartmentId("Segreteria"));
  assert.equal(makeDepartmentId("Attività Giovanile"), "dept-attivita-giovanile");
});

test("i reparti si leggono da settings, normalizzati e ordinati", () => {
  const departments = readStaffDepartments({
    staffDepartments: [
      { id: "dept-z", name: " Zona Nord " },
      { name: "Area Tecnica" },
      { name: "   " },
      null,
    ],
  });

  assert.deepEqual(
    departments.map((department) => department.name),
    ["Area Tecnica", "Zona Nord"],
  );
  assert.equal(
    departments[0].id,
    "dept-area-tecnica",
    "a un reparto senza id se ne assegna uno derivato dal nome",
  );
});

test("settings senza reparti non fa esplodere niente", () => {
  assert.deepEqual(readStaffDepartments(null), []);
  assert.deepEqual(readStaffDepartments({}), []);
  assert.deepEqual(readStaffDepartments({ staffDepartments: "no" }), []);
});

/**
 * La deduzione dai membri resta, ma come **recupero** dei reparti orfani gia
 * in archivio: non e un secondo canale di creazione.
 */
test("un reparto presente solo sui membri viene recuperato", () => {
  const merged = mergeStaffDepartments(
    [makeDepartmentFromName("Segreteria")],
    [{ department: "Area Medica" }, { department: "segreteria" }],
  );

  assert.deepEqual(
    merged.map((department) => department.name),
    ["Area Medica", "Segreteria"],
    "l'omonimo con maiuscole diverse non crea un secondo reparto",
  );
});

test("upsert sostituisce per nome, non solo per id", () => {
  const initial = [makeDepartmentFromName("Segreteria")];
  const next = upsertStaffDepartment(initial, {
    id: "dept-altro-id",
    name: "segreteria",
    color: "red",
  });

  assert.equal(next.length, 1, "due righe con lo stesso nome sono un difetto");
  assert.equal(next[0].color, "red");
});

test("upsert rifiuta un nome vuoto invece di creare un reparto senza nome", () => {
  const initial = [makeDepartmentFromName("Segreteria")];
  assert.deepEqual(upsertStaffDepartment(initial, { id: "x", name: "  " }), initial);
});

test("la ricerca per nome ignora maiuscole e spazi", () => {
  const departments = [makeDepartmentFromName("Area Tecnica")];
  assert.ok(findStaffDepartment(departments, "  area tecnica "));
  assert.equal(findStaffDepartment(departments, "Area Medica"), null);
  assert.equal(findStaffDepartment(departments, ""), null);
});

test("la cancellazione toglie solo il reparto indicato", () => {
  const departments = [
    makeDepartmentFromName("Segreteria"),
    makeDepartmentFromName("Area Tecnica"),
  ];

  const next = removeStaffDepartment(departments, "dept-segreteria");
  assert.deepEqual(
    next.map((department) => department.name),
    ["Area Tecnica"],
  );
});

test("il conteggio per reparto ignora i membri senza reparto", () => {
  const counts = countStaffByDepartment([
    { department: "Segreteria" },
    { department: "segreteria" },
    { department: "" },
    {},
  ]);

  assert.deepEqual(counts, { segreteria: 2 });
});

// --- il difetto, verificato sul sorgente ------------------------------------

const SRC = path.join(process.cwd(), "src");
const read = (file) => readFileSync(path.join(SRC, file), "utf8");

/**
 * Un reparto nuovo deve essere **persistito** da chi salva il membro, non solo
 * dalla dialog di gestione. E la riga che chiude il difetto: se sparisce, il
 * reparto torna a esistere solo come stringa su un membro.
 */
test("ogni schermata che salva un membro persiste il suo reparto", () => {
  for (const file of ["app/staff/new/page.tsx", "app/staff/[id]/page.tsx"]) {
    assert.match(
      read(file),
      /ensureStaffDepartment\(/,
      `${file} deve persistere il reparto del membro che salva`,
    );
  }
});

/**
 * `settings` e una colonna JSON unica: riscriverla dallo snapshot letto al
 * montaggio della pagina riportava indietro stagioni, listini e onboarding.
 */
test("le schermate staff non riscrivono l'intero blob settings", () => {
  for (const file of ["app/staff/page.tsx", "app/staff/[id]/page.tsx"]) {
    const source = read(file);
    assert.equal(
      /settings:\s*(clubSettings|nextSettings)/.test(source),
      false,
      `${file}: le chiavi di settings si toccano con patchClubSettings`,
    );
  }
});

test("il modello dei reparti e definito in un posto solo", () => {
  for (const file of [
    "app/staff/page.tsx",
    "app/staff/[id]/page.tsx",
    "app/staff/new/page.tsx",
    "components/staff/DepartmentManagement.tsx",
  ]) {
    assert.equal(
      /interface Department \{|interface StaffDepartment \{/.test(read(file)),
      false,
      `${file}: il tipo viene da lib/staff-directory.ts`,
    );
  }
});
