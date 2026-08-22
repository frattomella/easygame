import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { canAccessPath, getPathAccessArea } from "../../src/lib/access-roles.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const APP_DIR = path.join(PROJECT_ROOT, "src", "app");

/**
 * Aree di gestione: ogni prefisso deve avere un layout che monta
 * AccessAreaGuard, altrimenti la shell resta raggiungibile da un ruolo che non
 * dovrebbe vederla. Vedi 08-roles-and-permissions.md e WP-03.
 */
const MANAGEMENT_ROUTE_DIRS = [
  "athletes",
  "categories",
  "clothing",
  "create-club",
  "dashboard",
  "hub",
  "matches",
  "medical",
  "modulistica",
  "movements",
  "notifications",
  "organization",
  "payments",
  "permissions",
  "procura",
  "registration-management",
  "reports",
  "secretariat",
  "settings",
  "soci",
  "sponsors",
  "staff",
  "structures",
  "trainers",
  "training",
];

const GUARDED_NON_MANAGEMENT_LAYOUTS = [
  path.join("trainer-dashboard", "layout.tsx"),
  path.join("parent-view", "[id]", "layout.tsx"),
  path.join("athletes", "[id]", "profile", "layout.tsx"),
];

const readLayout = (relativePath) => {
  const filePath = path.join(APP_DIR, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
};

const mountsGuard = (source) =>
  source !== null &&
  (source.includes("AccessAreaGuard") ||
    source.includes("management-area-layout"));

test("ogni area di gestione monta un guard di route", () => {
  const senzaGuard = [];

  for (const dir of MANAGEMENT_ROUTE_DIRS) {
    if (!fs.existsSync(path.join(APP_DIR, dir))) continue;
    if (!mountsGuard(readLayout(path.join(dir, "layout.tsx")))) {
      senzaGuard.push(dir);
    }
  }

  assert.deepEqual(
    senzaGuard,
    [],
    `aree di gestione senza AccessAreaGuard: ${senzaGuard.join(", ")}`,
  );
});

test("le aree trainer, genitore e atleta restano protette", () => {
  for (const relativePath of GUARDED_NON_MANAGEMENT_LAYOUTS) {
    assert.equal(
      mountsGuard(readLayout(relativePath)),
      true,
      `manca il guard in ${relativePath}`,
    );
  }
});

test("il middleware protegge tutti i prefissi di gestione", () => {
  const middleware = fs.readFileSync(
    path.join(PROJECT_ROOT, "src", "middleware.ts"),
    "utf8",
  );

  const mancanti = MANAGEMENT_ROUTE_DIRS.filter(
    (dir) => !middleware.includes(`"/${dir}"`),
  );
  assert.deepEqual(
    mancanti,
    [],
    `prefissi assenti dal middleware: ${mancanti.join(", ")}`,
  );

  for (const prefix of ["/trainer-dashboard", "/parent-view", "/account", "/private"]) {
    assert.ok(
      middleware.includes(`"${prefix}"`),
      `il middleware non protegge ${prefix}`,
    );
  }

  // I flussi che devono ancora creare la sessione non vanno intercettati.
  assert.ok(middleware.includes('"/token-verification"'));
  assert.ok(middleware.includes('"/auth/complete"'));

  // Le API devono restituire 401 JSON, non un redirect.
  assert.ok(
    middleware.includes("(?!api|"),
    "il matcher del middleware deve escludere /api",
  );
});

test("il guard di area classifica correttamente ogni prefisso di gestione", () => {
  for (const dir of MANAGEMENT_ROUTE_DIRS) {
    assert.equal(
      getPathAccessArea(`/${dir}`),
      "management",
      `/${dir} non e classificata come area di gestione`,
    );
  }
});

test("montare il guard piu in alto non cambia l'esito: dipende dal pathname", () => {
  // /athletes e area management, ma /athletes/:id/profile resta area atleta.
  assert.equal(getPathAccessArea("/athletes"), "management");
  assert.equal(getPathAccessArea("/athletes/abc/profile"), "athlete");

  // Un atleta non entra nella lista atleti del club...
  assert.equal(canAccessPath("athlete", "/athletes"), false);
  // ...ma entra nel proprio profilo, anche con il guard montato su /athletes.
  assert.equal(
    canAccessPath("athlete", "/athletes/abc/profile", { linkedAthleteId: "abc" }),
    true,
  );
  // e non in quello di un altro.
  assert.equal(
    canAccessPath("athlete", "/athletes/xyz/profile", { linkedAthleteId: "abc" }),
    false,
  );
});

test("i ruoli non di gestione non accedono alle aree di gestione", () => {
  const areeSensibili = [
    "/payments",
    "/movements",
    "/reports",
    "/soci",
    "/sponsors",
    "/secretariat",
    "/registration-management",
  ];

  for (const area of areeSensibili) {
    for (const role of ["trainer", "parent", "athlete", ""]) {
      assert.equal(
        canAccessPath(role, area),
        false,
        `${role || "(nessun ruolo)"} non deve accedere a ${area}`,
      );
    }
    for (const role of ["owner", "club_manager", "collaborator", "staff"]) {
      assert.equal(
        canAccessPath(role, area),
        true,
        `${role} deve accedere a ${area}`,
      );
    }
  }
});

test("le aree riservate restano solo a owner e club manager", () => {
  const soloAdmin = [
    "/organization",
    "/permissions",
    "/settings",
    "/create-club",
    "/dashboard/access-management",
  ];

  for (const area of soloAdmin) {
    assert.equal(canAccessPath("owner", area), true, `owner su ${area}`);
    assert.equal(
      canAccessPath("club_manager", area),
      true,
      `club_manager su ${area}`,
    );
    assert.equal(
      canAccessPath("collaborator", area),
      false,
      `collaborator non deve accedere a ${area}`,
    );
    assert.equal(
      canAccessPath("staff", area),
      false,
      `staff non deve accedere a ${area}`,
    );
  }
});
