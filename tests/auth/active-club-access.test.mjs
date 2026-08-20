import assert from "node:assert/strict";
import test from "node:test";
import {
  findStoredAccessMembership,
  getMembershipAccessKey,
} from "../../src/lib/auth/active-club-access.ts";
import { normalizeAccessRole } from "../../src/lib/access-roles.ts";

const memberships = [
  {
    id: "membership-trainer",
    organization_id: "club-a",
    role: "trainer",
    access_kind: "membership",
  },
  {
    id: "membership-parent",
    organization_id: "club-a",
    role: "parent",
    access_kind: "membership",
  },
  {
    id: "ownership:club-a",
    organization_id: "club-a",
    role: "owner",
    access_kind: "ownership",
    is_ownership_record: true,
  },
];

test("seleziona la membership esatta quando lo stesso club ha più ruoli", () => {
  const selected = findStoredAccessMembership(memberships, {
    id: "club-a",
    role: "parent",
    membershipId: "membership-parent",
    accessKind: "membership",
  });

  assert.equal(selected?.id, "membership-parent");
});

test("non riutilizza un ruolo rimosso solo perché il club coincide", () => {
  const selected = findStoredAccessMembership(
    memberships.filter((membership) => membership.role !== "trainer"),
    {
      id: "club-a",
      role: "trainer",
      membershipId: "membership-trainer",
      accessKind: "membership",
    },
  );

  assert.equal(selected, null);
});

test("riconosce ownership tramite access key", () => {
  const ownership = memberships[2];
  assert.equal(getMembershipAccessKey(ownership), "ownership:club-a");
  assert.equal(
    findStoredAccessMembership(memberships, {
      id: "club-a",
      accessKey: "ownership:club-a",
    })?.role,
    "owner",
  );
});

test("supporta cache legacy che contengono soltanto il club id", () => {
  assert.equal(
    findStoredAccessMembership(memberships, { id: "club-a" })?.id,
    "membership-trainer",
  );
});

test("normalizza i ruoli legacy in italiano", () => {
  const selected = findStoredAccessMembership(
    [
      {
        id: "membership-collaborator",
        organization_id: "club-b",
        role: "collaborator",
      },
    ],
    { id: "club-b", role: "collaboratore", accessKind: "membership" },
    normalizeAccessRole,
  );

  assert.equal(selected?.id, "membership-collaborator");
});
