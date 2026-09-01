import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessClubResource,
  canAccessPath,
  getAccessRedirectPath,
  normalizeAccessRole,
} from "../../src/lib/access-roles.ts";
import {
  getPostLoginPath,
  PLATFORM_ADMIN_PRIVATE_PATH,
} from "../../src/lib/platform-admin.ts";

test("indirizza i platform admin direttamente alla dashboard applicativa", () => {
  assert.equal(
    getPostLoginPath({ email: "admin@example.invalid", role: "platform_admin" }),
    PLATFORM_ADMIN_PRIVATE_PATH,
  );
  assert.equal(
    getPostLoginPath({ email: "user@example.invalid", role: "parent" }),
    "/account",
  );
});

test("normalizza i sette ruoli applicativi e i relativi alias", () => {
  assert.equal(normalizeAccessRole("owner"), "owner");
  assert.equal(normalizeAccessRole("club_creator"), "owner");
  assert.equal(normalizeAccessRole("admin"), "club_manager");
  assert.equal(normalizeAccessRole("manager"), "club_manager");
  assert.equal(normalizeAccessRole("collaboratore"), "collaborator");
  assert.equal(normalizeAccessRole("segreteria"), "staff");
  assert.equal(normalizeAccessRole("allenatore"), "trainer");
  assert.equal(normalizeAccessRole("genitore"), "parent");
  assert.equal(normalizeAccessRole("atleta"), "athlete");
  assert.equal(normalizeAccessRole("ruolo-inventato"), "");
});

test("risolve la dashboard corretta senza fallback atleta su parent-view", () => {
  assert.equal(
    getAccessRedirectPath("owner", { organizationId: "club-a" }),
    "/dashboard?clubId=club-a",
  );
  assert.equal(
    getAccessRedirectPath("club_manager", { organizationId: "club-a" }),
    "/dashboard?clubId=club-a",
  );
  assert.equal(getAccessRedirectPath("trainer"), "/trainer-dashboard");
  assert.equal(
    getAccessRedirectPath("parent", { linkedAthleteId: "athlete-a" }),
    "/parent-view/athlete-a",
  );
  /*
    W6-33. **L'atleta entra nella sua area, non nella scheda gestionale.**
    L'ingresso era `/athletes/<id>/profile`, che montava la sidebar del club:
    trenta voci cliccabili che poi rimbalzavano sulla guardia. L'area atleta
    non porta un identificativo nel percorso perche l'atleta e **se stesso**:
    il legame lo risolve il server da `athletes.user_id`, e non c'e un
    parametro da cambiare per farlo diventare un altro.
  */
  assert.equal(
    getAccessRedirectPath("athlete", { linkedAthleteId: "athlete-a" }),
    "/athlete-dashboard",
  );
  assert.equal(getAccessRedirectPath("athlete"), "/account");
  assert.equal(getAccessRedirectPath("unknown"), "/account");
});

test("impedisce l'accesso alle aree appartenenti a un altro ruolo", () => {
  assert.equal(canAccessPath("trainer", "/trainer-dashboard"), true);
  assert.equal(canAccessPath("trainer", "/dashboard"), false);
  assert.equal(
    canAccessPath("parent", "/parent-view/athlete-a", {
      linkedAthleteId: "athlete-a",
    }),
    true,
  );
  assert.equal(
    canAccessPath("parent", "/parent-view/athlete-b", {
      linkedAthleteId: "athlete-a",
    }),
    false,
  );
  assert.equal(
    canAccessPath("athlete", "/athletes/athlete-a/profile", {
      linkedAthleteId: "athlete-a",
    }),
    true,
  );
  assert.equal(
    canAccessPath("athlete", "/parent-view/athlete-a", {
      linkedAthleteId: "athlete-a",
    }),
    false,
  );
  assert.equal(canAccessPath("collaborator", "/permissions"), false);
  assert.equal(canAccessPath("staff", "/settings"), false);
  assert.equal(canAccessPath("club_manager", "/permissions"), true);
});

test("applica i permessi API in base al ruolo attivo", () => {
  assert.equal(canAccessClubResource("owner", "users", "delete"), true);
  assert.equal(
    canAccessClubResource("club_manager", "organization_users", "create"),
    true,
  );
  assert.equal(
    canAccessClubResource("collaborator", "organization_users", "read"),
    false,
  );
  assert.equal(canAccessClubResource("staff", "athletes", "update"), true);
  assert.equal(canAccessClubResource("trainer", "athletes", "read"), true);
  assert.equal(canAccessClubResource("trainer", "athletes", "delete"), false);
  assert.equal(
    canAccessClubResource("trainer", "training_attendance", "update"),
    true,
  );
  assert.equal(canAccessClubResource("parent", "athletes", "read"), false);
  assert.equal(canAccessClubResource("athlete", "athletes", "read"), false);
});
