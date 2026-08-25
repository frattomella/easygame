import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  personExportColumns,
  personExportValue,
} from "../../src/lib/person-export.ts";

import {
  clothingOptionsFor,
  deriveClothingProfile,
  formatClothingSizes,
  normalizeClothingSizes,
  resolveClothingProfile,
} from "../../src/lib/clothing-sizes.ts";

/**
 * Blocco 7, punti 12 e 13 — taglie ed export per allenatori, staff e soci.
 *
 * Entrambi i punti avevano lo stesso rischio: scrivere tre implementazioni
 * quasi uguali. Le taglie potevano nascere incompatibili con quelle del
 * magazzino, e l'export in tre versioni con tre modi di formattare una data.
 */

// --- taglie ------------------------------------------------------------------

test("le taglie sono le stesse dell'abbigliamento, per tutti i profili", () => {
  for (const profile of ["BAMBINO", "BAMBINA", "UOMO", "DONNA"]) {
    const options = clothingOptionsFor(profile);
    assert.ok(options.shirt.length, `${profile}: maglia`);
    assert.ok(options.pants.length, `${profile}: pantalone`);
    assert.ok(options.shoes.length, `${profile}: scarpe`);
  }

  assert.ok(clothingOptionsFor("UOMO").shirt.includes("XL"));
  assert.ok(clothingOptionsFor("BAMBINO").shirt.includes("9-10A"));
});

test("il profilo si deduce da sesso ed eta", () => {
  const child = new Date();
  child.setFullYear(child.getFullYear() - 10);
  const childIso = child.toISOString().slice(0, 10);

  assert.equal(deriveClothingProfile("M", childIso), "BAMBINO");
  assert.equal(deriveClothingProfile("F", childIso), "BAMBINA");
  assert.equal(deriveClothingProfile("F", "1980-01-01"), "DONNA");
  assert.equal(deriveClothingProfile("M", "1980-01-01"), "UOMO");
});

/**
 * Allenatori, staff e soci spesso non hanno la data di nascita in archivio:
 * senza, la risposta deve essere «adulto», non «bambino».
 */
test("senza data di nascita il profilo e adulto", () => {
  assert.equal(deriveClothingProfile("M", ""), "UOMO");
  assert.equal(deriveClothingProfile("F", null), "DONNA");
  assert.equal(deriveClothingProfile("", "non-una-data"), "UOMO");
});

test("un profilo scelto a mano batte quello dedotto", () => {
  assert.equal(
    resolveClothingProfile({ profile: "BAMBINO" }, { gender: "M", birthDate: "1980-01-01" }),
    "BAMBINO",
    "un adulto puo portare una taglia bambino",
  );
  assert.equal(
    resolveClothingProfile({ profile: "" }, { gender: "M", birthDate: "1980-01-01" }),
    "UOMO",
  );
  assert.equal(resolveClothingProfile({ profile: "INESISTENTE" }, null), "UOMO");
});

test("le taglie si normalizzano senza inventare valori", () => {
  assert.deepEqual(normalizeClothingSizes(null), {
    profile: "",
    shirtSize: "",
    pantsSize: "",
    shoeSize: "",
  });
  assert.equal(
    formatClothingSizes({ shirtSize: "M", pantsSize: "48", shoeSize: "42" }),
    "M · 48 · 42",
  );
  assert.equal(formatClothingSizes({ shirtSize: "M" }), "M");
  assert.equal(formatClothingSizes(null), "");
});

// --- export ------------------------------------------------------------------

test("ogni entita ha le colonne comuni piu le sue", () => {
  const trainers = personExportColumns("trainers").map((column) => column.key);
  const staff = personExportColumns("staff").map((column) => column.key);
  const members = personExportColumns("members").map((column) => column.key);

  for (const columns of [trainers, staff, members]) {
    for (const shared of ["lastName", "firstName", "email", "phone", "fiscalCode"]) {
      assert.ok(columns.includes(shared), `manca ${shared}`);
    }
  }

  assert.ok(trainers.includes("categories"));
  assert.ok(staff.includes("department"));
  assert.ok(members.includes("type"));
});

test("le colonne nascoste in elenco non finiscono nel PDF", () => {
  const columns = personExportColumns("staff", {
    name: true,
    email: false,
    phone: true,
    department: false,
    role: true,
    status: true,
    hireDate: true,
  }).map((column) => column.key);

  assert.equal(columns.includes("email"), false);
  assert.equal(columns.includes("department"), false);
  assert.ok(columns.includes("phone"));
});

/**
 * Codice fiscale e taglie non stanno in tabella ma servono in un PDF: sono
 * colonne senza interruttore, e restano sempre.
 */
test("le colonne senza interruttore restano sempre", () => {
  const columns = personExportColumns("members", {
    name: false,
    email: false,
    phone: false,
    membershipDate: false,
    status: false,
  }).map((column) => column.key);

  assert.ok(columns.includes("fiscalCode"));
  assert.ok(columns.includes("clothingSizes"));
  assert.ok(columns.includes("type"));
});

test("i valori si leggono da record senza schema", () => {
  const person = {
    surname: "Rossi",
    name: "Mario",
    email: "mario@example.org",
    phone: "+39 3331234567",
    fiscal_code: "RSSMRA80A01F205X",
    clothingSizes: { shirtSize: "L", shoeSize: "43" },
    status: "active",
  };

  assert.equal(personExportValue(person, "lastName"), "Rossi");
  assert.equal(personExportValue(person, "firstName"), "Mario");
  assert.equal(personExportValue(person, "fiscalCode"), "RSSMRA80A01F205X");
  assert.equal(personExportValue(person, "clothingSizes"), "L · 43");
  assert.equal(personExportValue(person, "status"), "Attivo");
  assert.equal(personExportValue(person, "colonna-inesistente"), "");
});

test("un record con il solo nome intero si scompone", () => {
  const person = { fullName: "Anna Maria Bianchi" };

  assert.equal(personExportValue(person, "lastName"), "Bianchi");
  assert.equal(personExportValue(person, "firstName"), "Anna Maria");
});

test("le categorie di un allenatore si leggono come oggetti o come stringhe", () => {
  assert.equal(
    personExportValue({ categories: [{ name: "Under 15" }, { name: "Under 17" }] }, "categories"),
    "Under 15, Under 17",
  );
  assert.equal(
    personExportValue({ categories: ["Prima squadra"] }, "categories"),
    "Prima squadra",
  );
  assert.equal(personExportValue({ categories: null }, "categories"), "");
});

test("il tipo socio ha un default, gli altri campi no", () => {
  assert.equal(personExportValue({}, "type"), "Socio Ordinario");
  assert.equal(personExportValue({}, "email"), "");
});

// --- una implementazione sola ------------------------------------------------

const SRC = path.join(process.cwd(), "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

test("le taglie sono definite in un posto solo", () => {
  const offenders = walk(SRC)
    .filter((file) => !file.endsWith(path.join("lib", "clothing-sizes.ts")))
    .filter((file) => /const CLOTHING_SIZE_OPTIONS\s*=/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(SRC, file).replace(/\\/g, "/"));

  assert.deepEqual(
    offenders,
    [],
    "un secondo elenco di taglie non si parlerebbe con il magazzino",
  );
});

test("esiste un solo generatore di PDF per gli elenchi di persone", () => {
  const offenders = walk(SRC)
    .filter((file) => !file.endsWith(path.join("lib", "people-pdf-export.ts")))
    .filter((file) => /printWindow\.document\.write/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(SRC, file).replace(/\\/g, "/"))
    // Questi generano documenti diversi (modulistica, movimenti, ordini
    // fornitore), non elenchi di persone.
    .filter(
      (file) =>
        ![
          "app/modulistica/page.tsx",
          "app/movements/page.tsx",
          "app/private/api-docs/api-docs-client.tsx",
          "components/forms/FormShareDialog.tsx",
          "lib/clothing-supplier-order-pdf.ts",
        ].includes(file),
    );

  assert.deepEqual(offenders, [], "gli elenchi di persone passano da printPeoplePdf");
});
