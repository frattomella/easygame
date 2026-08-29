import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAudienceSet,
  normalizeRecipientKey,
} from "../../src/lib/audience/recipients.ts";
import {
  criteriaRevealEconomicData,
  describeAudienceCriteria,
  normalizeAudienceCriteria,
} from "../../src/lib/audience/criteria.ts";

/**
 * L'insieme canonico dei destinatari (W2-C).
 *
 * Le due cose che questo modulo esiste per garantire, e che prima della Wave 2
 * erano scritte due volte con politiche diverse:
 *
 * 1. **una email, un messaggio** — anche quando la stessa famiglia ha due
 *    figli, e senza perdere per chi era;
 * 2. **chi non si raggiunge compare, con il motivo** — un invio che non
 *    raggiunge nessuno non e un successo.
 */

const contatto = (overrides = {}) => ({
  guardianId: "g1",
  guardianName: "Maria Bianchi",
  email: "maria@example.com",
  userId: null,
  ...overrides,
});

const soggetto = (overrides = {}) => ({
  athleteId: "atleta-1",
  athleteName: "Luca Bianchi",
  contacts: [contatto()],
  ...overrides,
});

// --- una email, un messaggio ----------------------------------------------

test("la stessa email su due atleti produce un destinatario con due posizioni", () => {
  const set = buildAudienceSet({
    subjects: [
      soggetto(),
      soggetto({
        athleteId: "atleta-2",
        athleteName: "Marco Bianchi",
        contacts: [contatto({ guardianId: "g2" })],
      }),
    ],
  });

  assert.equal(set.recipients.length, 1);
  assert.equal(set.counts.positions, 2);
  assert.deepEqual(
    set.recipients[0].positions.map((position) => position.athleteName),
    ["Luca Bianchi", "Marco Bianchi"],
  );
  assert.equal(
    set.exclusions.length,
    0,
    "una famiglia con due figli non e un'esclusione",
  );
});

test("l'indirizzo si normalizza: maiuscole e spazi non fanno due destinatari", () => {
  assert.equal(normalizeRecipientKey("  Maria.Bianchi@Example.COM "), "maria.bianchi@example.com");

  const set = buildAudienceSet({
    subjects: [
      soggetto({ contacts: [contatto({ email: "Maria@Example.com" })] }),
      soggetto({
        athleteId: "atleta-2",
        contacts: [contatto({ guardianId: "g2", email: " maria@example.com " })],
      }),
    ],
  });

  assert.equal(set.recipients.length, 1);
});

test("l'account trovato su una seconda posizione vale per tutte", () => {
  const set = buildAudienceSet({
    subjects: [
      soggetto({ contacts: [contatto({ userId: null })] }),
      soggetto({
        athleteId: "atleta-2",
        contacts: [contatto({ guardianId: "g2", userId: "utente-1" })],
      }),
    ],
  });

  assert.equal(set.recipients.length, 1);
  assert.equal(set.recipients[0].userId, "utente-1");
});

test("due tutori dello stesso atleta con lo stesso indirizzo: uno solo, e il doppione si dichiara", () => {
  const set = buildAudienceSet({
    subjects: [
      soggetto({
        contacts: [contatto(), contatto({ guardianId: "g2", guardianName: "Paolo Bianchi" })],
      }),
    ],
  });

  assert.equal(set.recipients.length, 1);
  assert.deepEqual(
    set.exclusions.map((row) => row.reason),
    ["duplicate"],
  );
});

// --- chi non si raggiunge compare -----------------------------------------

test("un atleta senza tutori compare fra gli esclusi", () => {
  const set = buildAudienceSet({ subjects: [soggetto({ contacts: [] })] });

  assert.equal(set.recipients.length, 0);
  assert.deepEqual(
    set.exclusions.map((row) => row.reason),
    ["no_guardian"],
  );
  assert.equal(set.counts.unreachableSubjects, 1);
});

test("«nessuna email» e «account introvabile» restano due motivi diversi", () => {
  const set = buildAudienceSet({
    subjects: [
      soggetto({ contacts: [contatto({ email: "" })] }),
      soggetto({
        athleteId: "atleta-2",
        contacts: [
          contatto({ guardianId: "g2", email: "", declaresMissingAccount: true }),
        ],
      }),
    ],
  });

  assert.deepEqual(
    set.exclusions.map((row) => row.reason).sort(),
    ["no_account", "no_email"],
  );
});

test("un'anagrafica non attiva resta fuori, e lo dice", () => {
  const set = buildAudienceSet({ subjects: [soggetto({ active: false })] });

  assert.equal(set.recipients.length, 0);
  assert.deepEqual(
    set.exclusions.map((row) => row.reason),
    ["not_active"],
  );
});

test("chi e gia stato raggiunto compare fra gli esclusi, non sparisce", () => {
  const set = buildAudienceSet({
    subjects: [soggetto()],
    alreadySent: new Set(["maria@example.com"]),
  });

  assert.equal(set.recipients.length, 0);
  assert.deepEqual(
    set.exclusions.map((row) => row.reason),
    ["already_sent"],
  );
});

test("l'ordine e deterministico: anteprima e invio elencano le stesse persone", () => {
  const soggetti = [
    soggetto({
      athleteId: "atleta-2",
      contacts: [contatto({ email: "zeta@example.com" })],
    }),
    soggetto({ contacts: [contatto({ email: "alfa@example.com" })] }),
  ];

  const primo = buildAudienceSet({ subjects: soggetti });
  const secondo = buildAudienceSet({ subjects: [...soggetti].reverse() });

  assert.deepEqual(
    primo.recipients.map((row) => row.key),
    ["alfa@example.com", "zeta@example.com"],
  );
  assert.deepEqual(
    primo.recipients.map((row) => row.key),
    secondo.recipients.map((row) => row.key),
  );
});

// --- i criteri -------------------------------------------------------------

test("un criterio sconosciuto fa fallire invece di allargare il pubblico in silenzio", () => {
  assert.throws(
    () => normalizeAudienceCriteria([{ kind: "tutti_quelli_che_mi_piacciono" }]),
    /sconosciuto/i,
  );
});

test("un criterio a elenco vuoto fa fallire", () => {
  assert.throws(
    () => normalizeAudienceCriteria([{ kind: "category_ids", values: [] }]),
    /nessun elemento/i,
  );
});

test("nessun criterio significa nessun messaggio, non tutti", () => {
  assert.throws(() => normalizeAudienceCriteria([]), /Nessun criterio/);
});

test("«tutte le famiglie» non si combina con un filtro", () => {
  assert.throws(
    () =>
      normalizeAudienceCriteria([
        { kind: "all_families" },
        { kind: "category_ids", values: ["under-14"] },
      ]),
    /non si combina/,
  );
});

test("un criterio ripetuto fa fallire", () => {
  assert.throws(
    () =>
      normalizeAudienceCriteria([
        { kind: "site_ids", values: ["a"] },
        { kind: "site_ids", values: ["b"] },
      ]),
    /ripetuto/,
  );
});

test("solo «insoluti» rivela dati economici", () => {
  assert.equal(
    criteriaRevealEconomicData(normalizeAudienceCriteria([{ kind: "overdue_payments" }])),
    true,
  );
  assert.equal(
    criteriaRevealEconomicData(
      normalizeAudienceCriteria([{ kind: "category_ids", values: ["u14"] }]),
    ),
    false,
  );
});

test("la selezione si racconta in italiano, per l'anteprima e per l'audit", () => {
  const criteri = normalizeAudienceCriteria([
    { kind: "category_ids", values: ["u14", "u16"] },
    { kind: "certificate_missing_or_expiring", withinDays: 7 },
  ]);

  assert.equal(
    describeAudienceCriteria(criteri),
    "Per categoria (2) + Certificato mancante o in scadenza entro 7 giorni",
  );
});
