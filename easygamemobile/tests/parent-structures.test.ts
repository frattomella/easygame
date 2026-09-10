import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bookableFields,
  computeBookingEnd,
  lowestFieldPrice,
} from "../client/lib/parent-structures";
import type { ParentStructure } from "../client/services/api";

const structure = (
  fields: ParentStructure["fields"] = [],
): ParentStructure => ({
  id: "s1",
  name: "Centro Sportivo",
  address: "Via Roma 1",
  city: "Milano",
  type: "Campo",
  isPublic: true,
  isVisibleToMembers: true,
  fields,
});

test("filtra solo i campi prenotabili e visibili", () => {
  const s = structure([
    {
      id: "f1",
      name: "Campo 1",
      ownership: "Pubblica",
      isBookable: true,
      isVisible: true,
      availability: {},
      pricing: [],
    },
    {
      id: "f2",
      name: "Campo 2",
      ownership: "Pubblica",
      isBookable: false,
      isVisible: true,
      availability: {},
      pricing: [],
    },
    {
      id: "f3",
      name: "Campo 3",
      ownership: "Pubblica",
      isBookable: true,
      isVisible: false,
      availability: {},
      pricing: [],
    },
  ]);
  assert.deepEqual(
    bookableFields(s).map((f) => f.id),
    ["f1"],
  );
});

test("il prezzo piu basso di un campo senza tariffe e' null, mai inventato", () => {
  const field: ParentStructure["fields"][number] = {
    id: "f1",
    name: "Campo 1",
    ownership: "Pubblica",
    isBookable: true,
    isVisible: true,
    availability: {},
    pricing: [],
  };
  assert.equal(lowestFieldPrice(field), null);
});

test("il prezzo piu basso sceglie la tariffa minima fra quelle disponibili", () => {
  const field: ParentStructure["fields"][number] = {
    id: "f1",
    name: "Campo 1",
    ownership: "Pubblica",
    isBookable: true,
    isVisible: true,
    availability: {},
    pricing: [
      { id: "p1", durationMinutes: 60, price: 40 },
      { id: "p2", durationMinutes: 90, price: 55 },
    ],
  };
  assert.equal(lowestFieldPrice(field), 40);
});

test("calcola l'orario di fine da inizio + durata", () => {
  const end = computeBookingEnd("2026-09-20T18:00:00.000Z", 90);
  assert.equal(end, "2026-09-20T19:30:00.000Z");
});
