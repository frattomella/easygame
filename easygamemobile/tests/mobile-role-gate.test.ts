import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeMobileAccessRole,
  resolveMobileRoleGate,
} from "../client/lib/mobile-role-gate";

test("trainer canonico apre l'area Trainer", () => {
  assert.equal(resolveMobileRoleGate("trainer"), "trainer");
});

test("alias di trainer (coach, allenatore) aprono l'area Trainer", () => {
  assert.equal(resolveMobileRoleGate("coach"), "trainer");
  assert.equal(resolveMobileRoleGate("allenatore"), "trainer");
  assert.equal(resolveMobileRoleGate("Trainer"), "trainer");
  assert.equal(resolveMobileRoleGate("  TRAINER  "), "trainer");
});

test("parent canonico e i suoi alias aprono l'area Parent", () => {
  assert.equal(resolveMobileRoleGate("parent"), "parent");
  assert.equal(resolveMobileRoleGate("guardian"), "parent");
  assert.equal(resolveMobileRoleGate("genitore"), "parent");
  assert.equal(resolveMobileRoleGate("tutore"), "parent");
  assert.equal(resolveMobileRoleGate("tutor"), "parent");
});

test("i ruoli non supportati nella V1 mobile ricadono su 'unsupported'", () => {
  assert.equal(resolveMobileRoleGate("owner"), "unsupported");
  assert.equal(resolveMobileRoleGate("club_manager"), "unsupported");
  assert.equal(resolveMobileRoleGate("collaborator"), "unsupported");
  assert.equal(resolveMobileRoleGate("staff"), "unsupported");
  assert.equal(resolveMobileRoleGate("athlete"), "unsupported");
  assert.equal(resolveMobileRoleGate(""), "unsupported");
  assert.equal(resolveMobileRoleGate(null), "unsupported");
  assert.equal(resolveMobileRoleGate(undefined), "unsupported");
  assert.equal(resolveMobileRoleGate("qualunque-cosa"), "unsupported");
});

test("un ruolo di club personalizzato con base trainer apre l'area Trainer", () => {
  assert.equal(
    resolveMobileRoleGate(
      "custom:trainer:preparatore#events.manage,events.attendance",
    ),
    "trainer",
  );
  assert.equal(normalizeMobileAccessRole("custom:trainer:vice"), "trainer");
});

test("un ruolo di club personalizzato con base non-trainer resta non supportato", () => {
  assert.equal(
    resolveMobileRoleGate("custom:collaborator:segreteria"),
    "unsupported",
  );
  assert.equal(
    resolveMobileRoleGate("custom:club_manager:direttore"),
    "unsupported",
  );
  assert.equal(
    resolveMobileRoleGate("custom:staff:magazziniere"),
    "unsupported",
  );
});

test("un gettone di ruolo personalizzato malformato non e ne trainer ne parent", () => {
  assert.equal(resolveMobileRoleGate("custom:"), "unsupported");
  assert.equal(resolveMobileRoleGate("custom:trainer"), "unsupported");
  assert.equal(resolveMobileRoleGate("custom:sconosciuto:nome"), "unsupported");
});
