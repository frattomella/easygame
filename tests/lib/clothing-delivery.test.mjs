import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAssignmentStatus,
  describeAssignedSize,
  getItemState,
  getKitDeliveryProgress,
  proposeSizeForItem,
  proposeSizesForItems,
  resolveItemSizeSource,
  setAssignmentItemState,
} from "../../src/lib/clothing-delivery.ts";
import {
  normalizeClothingItem,
  normalizeClothingAssignment,
} from "../../src/lib/clothing-inventory-utils.ts";

/**
 * Consegne di kit.
 *
 * Il caso descritto qui e quello di ottobre: «maglia e pantaloncino
 * consegnati, felpa in arrivo, borsa esaurita». Prima l'assegnazione aveva un
 * solo stato e l'operatore doveva scegliere fra dire una cosa falsa
 * («consegnato») e non dire niente («assegnato»).
 */

const KIT_ITEMS = [
  { id: "i1", itemId: "maglia", name: "Maglia", quantity: 1, status: "delivered" },
  {
    id: "i2",
    itemId: "pantaloncino",
    name: "Pantaloncino",
    quantity: 1,
    status: "delivered",
  },
  { id: "i3", itemId: "felpa", name: "Felpa", quantity: 1, status: "ready" },
  {
    id: "i4",
    itemId: "borsa",
    name: "Borsa",
    quantity: 1,
    status: "unavailable",
  },
];

const assignmentWith = (items, status = "assigned") =>
  normalizeClothingAssignment({
    id: "as-1",
    athleteId: "a1",
    status,
    items,
  });

test("gli articoli di un kit hanno stati indipendenti", () => {
  const assignment = assignmentWith(KIT_ITEMS);

  assert.deepEqual(
    assignment.items.map((item) => getItemState(item)),
    ["delivered", "delivered", "ready", "unavailable"],
  );
});

test("una consegna parziale si legge «2/4 consegnati»", () => {
  const progress = getKitDeliveryProgress(assignmentWith(KIT_ITEMS));

  assert.equal(progress.state, "partial");
  assert.equal(progress.total, 4);
  assert.equal(progress.delivered, 2);
  assert.equal(progress.unavailable, 1);
  assert.equal(progress.label, "2/4 consegnati · 1 non disponibile");
});

test("senza niente di consegnato il kit e da preparare", () => {
  const progress = getKitDeliveryProgress(
    assignmentWith([
      { id: "i1", itemId: "maglia", name: "Maglia", status: "assigned" },
      { id: "i2", itemId: "felpa", name: "Felpa", status: "ready" },
    ]),
  );

  assert.equal(progress.state, "to_prepare");
  assert.equal(progress.label, "0/2 consegnati");
});

test("consegnato tutto il consegnabile il kit e completato, anche con un articolo esaurito", () => {
  const progress = getKitDeliveryProgress(
    assignmentWith([
      { id: "i1", itemId: "maglia", name: "Maglia", status: "delivered" },
      { id: "i2", itemId: "felpa", name: "Felpa", status: "delivered" },
      { id: "i3", itemId: "borsa", name: "Borsa", status: "unavailable" },
    ]),
  );

  assert.equal(progress.state, "completed");
  assert.equal(progress.label, "2/3 consegnati · 1 non disponibile");
});

test("consegnare un articolo alla volta porta il kit da «da preparare» a «completato»", () => {
  let assignment = assignmentWith([
    { id: "i1", itemId: "maglia", name: "Maglia", status: "assigned" },
    { id: "i2", itemId: "felpa", name: "Felpa", status: "assigned" },
  ]);

  assert.equal(getKitDeliveryProgress(assignment).state, "to_prepare");

  assignment = setAssignmentItemState({
    assignment,
    itemId: "i1",
    state: "delivered",
    deliveredAt: "2026-10-01T10:00:00.000Z",
  });

  assert.equal(getKitDeliveryProgress(assignment).state, "partial");
  assert.equal(assignment.items[0].deliveredAt, "2026-10-01T10:00:00.000Z");
  assert.equal(assignment.items[0].delivered, true);
  assert.equal(
    assignment.items[1].delivered,
    false,
    "consegnare la maglia non consegna la felpa",
  );

  assignment = setAssignmentItemState({
    assignment,
    itemId: "i2",
    state: "delivered",
    deliveredAt: "2026-10-08T10:00:00.000Z",
  });

  assert.equal(getKitDeliveryProgress(assignment).state, "completed");
  assert.equal(assignment.status, "delivered");
});

test("segnare un articolo non disponibile non lo consegna e non blocca il resto", () => {
  let assignment = assignmentWith([
    { id: "i1", itemId: "maglia", name: "Maglia", status: "delivered" },
    { id: "i2", itemId: "borsa", name: "Borsa", status: "assigned" },
  ]);

  assignment = setAssignmentItemState({
    assignment,
    itemId: "i2",
    state: "unavailable",
    notes: "Taglia esaurita dal fornitore",
  });

  assert.equal(assignment.items[1].delivered, false);
  assert.equal(assignment.items[1].deliveredAt, null);
  assert.equal(assignment.items[1].notes, "Taglia esaurita dal fornitore");
  assert.equal(getKitDeliveryProgress(assignment).state, "completed");
});

test("lo stato del kit e derivato, non scritto", () => {
  const assignment = assignmentWith(KIT_ITEMS, "to_order");

  // Con due articoli consegnati l'assegnazione non puo piu essere «da
  // ordinare»: il riassunto segue gli articoli.
  assert.equal(deriveAssignmentStatus(assignment), "assigned");

  const untouched = assignmentWith(
    [{ id: "i1", itemId: "maglia", name: "Maglia", status: "to_order" }],
    "to_order",
  );

  assert.equal(
    deriveAssignmentStatus(untouched),
    "to_order",
    "un ordine fornitore non retrocede solo perche lo si e riletto",
  );
});

test("la taglia si propone dall'anagrafica, per il capo giusto", () => {
  const sizes = { shirtSize: "M", pantsSize: "48", shoeSize: "42" };

  const maglia = normalizeClothingItem({
    id: "maglia",
    name: "Maglia gara",
    type: "maglia",
    sizes: ["S", "M", "L"],
  });
  const pantaloncino = normalizeClothingItem({
    id: "pant",
    name: "Pantaloncino",
    type: "pantaloncino",
    sizes: ["46", "48", "50"],
  });
  const scarpe = normalizeClothingItem({
    id: "scarpe",
    name: "Scarpe",
    type: "scarpe",
    sizes: ["41", "42", "43"],
  });

  assert.equal(proposeSizeForItem({ sizes, item: maglia }), "M");
  assert.equal(proposeSizeForItem({ sizes, item: pantaloncino }), "48");
  assert.equal(proposeSizeForItem({ sizes, item: scarpe }), "42");

  assert.deepEqual(
    proposeSizesForItems({ sizes, items: [maglia, pantaloncino, scarpe] }),
    { maglia: "M", pant: "48", scarpe: "42" },
  );
});

test("la configurazione dell'articolo vince sulla deduzione dal tipo", () => {
  const item = normalizeClothingItem({
    id: "borsa",
    name: "Borsone",
    type: "maglia",
    sizeSource: "shoes",
    sizes: ["42"],
  });

  assert.equal(resolveItemSizeSource(item), "shoes");
  assert.equal(
    proposeSizeForItem({
      sizes: { shirtSize: "M", shoeSize: "42" },
      item,
    }),
    "42",
  );
});

test("un articolo senza taglia non riceve proposte", () => {
  const borsa = normalizeClothingItem({
    id: "borsa",
    name: "Borsa",
    type: "borsa",
  });

  assert.equal(resolveItemSizeSource(borsa), "none");
  assert.equal(
    proposeSizeForItem({ sizes: { shirtSize: "M" }, item: borsa }),
    "",
  );
});

test("non si propone una taglia che l'articolo non prevede", () => {
  const maglia = normalizeClothingItem({
    id: "maglia",
    name: "Maglia",
    type: "maglia",
    sizes: ["46", "48", "50"],
  });

  assert.equal(
    proposeSizeForItem({ sizes: { shirtSize: "M" }, item: maglia }),
    "",
    "proporre una M per un capo che si vende in 46/48 confonde",
  );
});

test("l'override della taglia si riconosce e non tocca l'anagrafica", () => {
  const sizes = { shirtSize: "M" };
  const maglia = normalizeClothingItem({
    id: "maglia",
    name: "Maglia",
    type: "maglia",
    sizes: ["S", "M", "L"],
  });
  const proposed = proposeSizeForItem({ sizes, item: maglia });

  const conforme = describeAssignedSize({
    assignedSize: "M",
    proposedSize: proposed,
  });
  assert.equal(conforme.isOverride, false);
  assert.equal(conforme.size, "M");

  const override = describeAssignedSize({
    assignedSize: "L",
    proposedSize: proposed,
  });
  assert.equal(override.isOverride, true);
  assert.equal(override.size, "L");
  assert.equal(override.proposed, "M");

  // L'anagrafica e un oggetto a parte e nessuna di queste funzioni la scrive.
  assert.deepEqual(sizes, { shirtSize: "M" });
});

test("senza taglia assegnata vale quella proposta", () => {
  const result = describeAssignedSize({ assignedSize: "", proposedSize: "M" });

  assert.equal(result.size, "M");
  assert.equal(result.isOverride, false);
});
