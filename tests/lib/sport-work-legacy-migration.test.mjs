import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacyMigrationReport,
  classifyDirectoryPerson,
  classifyProcura,
  classifyTrainerPayment,
  listImportCandidates,
} from "../../src/lib/sport-work/legacy-migration.ts";

/**
 * La classificazione dei dati che assomigliano a questo dominio e non lo sono.
 *
 * **La proprieta principale e una cosa che il codice NON fa.** Nessuna riga
 * ambigua viene convertita: `trainer_payments` non diventa un'erogazione e
 * `clubs.procure` non diventa un rapporto. Un test che accettasse la
 * conversione starebbe approvando l'invenzione di dati contributivi che
 * quelle righe non hanno mai avuto.
 *
 * Si importa solo cio che non richiede una scelta: le anagrafiche.
 */

// --- anagrafiche: si importano ------------------------------------------------

test("un allenatore con nome e cognome si importa", () => {
  const finding = classifyDirectoryPerson(
    {
      id: "trainer-1",
      firstName: "Marco",
      lastName: "Rossi",
      fiscalCode: "rssmrc90a01h501a",
      email: "MARCO@Example.test",
      iban: "IT60 X054 2811 1010 0000 0123 456",
    },
    "clubs.trainers",
  );

  assert.equal(finding.outcome, "MIGRATED");
  assert.equal(finding.candidate.originType, "trainer");
  assert.equal(finding.candidate.originId, "trainer-1");
  assert.equal(finding.candidate.fiscalCode, "RSSMRC90A01H501A");
  assert.equal(finding.candidate.email, "marco@example.test");
  assert.equal(finding.candidate.iban, "IT60X0542811101000000123456");
});

test("un nome completo in un campo solo si spezza", () => {
  const finding = classifyDirectoryPerson(
    { id: "staff-1", fullName: "Anna Maria Bianchi" },
    "clubs.staff_members",
  );

  assert.equal(finding.outcome, "MIGRATED");
  assert.equal(finding.candidate.firstName, "Anna Maria");
  assert.equal(finding.candidate.lastName, "Bianchi");
  assert.equal(finding.candidate.originType, "staff_member");
});

test("senza cognome non si importa: in un elenco di compensi sarebbe irriconoscibile", () => {
  const finding = classifyDirectoryPerson(
    { id: "trainer-2", firstName: "Marco" },
    "clubs.trainers",
  );

  assert.equal(finding.outcome, "NEEDS_CLASSIFICATION");
  assert.match(finding.reason, /Nome o cognome mancante/);
  assert.equal(finding.candidate, undefined);
});

test("senza identificativo non si importa: il collegamento non si potrebbe scrivere", () => {
  const finding = classifyDirectoryPerson(
    { firstName: "Marco", lastName: "Rossi" },
    "clubs.trainers",
  );

  assert.equal(finding.outcome, "NEEDS_CLASSIFICATION");
  assert.match(finding.reason, /identificativo/);
});

// --- promemoria pagamenti: mai convertiti ---------------------------------------

test("un pagamento storico non diventa mai un'erogazione", () => {
  const finding = classifyTrainerPayment({
    id: "tp-1",
    trainer_name: "Marco Rossi",
    month: "2026-09",
    amount: 1200,
    status: "paid",
  });

  assert.equal(finding.outcome, "NEEDS_CLASSIFICATION");
  assert.equal(finding.amount, 1200);
  assert.match(finding.reason, /inventerebbe dati contributivi/);
  assert.equal(finding.candidate, undefined);
});

test("nemmeno un pagamento apparentemente completo si converte", () => {
  const finding = classifyTrainerPayment({
    id: "tp-2",
    trainer_name: "Anna Bianchi",
    month: "2026-10",
    amount: 900,
    status: "paid",
    date: "2026-10-31",
    receipt_id: "r-1",
  });

  assert.equal(
    finding.outcome,
    "NEEDS_CLASSIFICATION",
    "avere data e ricevuta non aggiunge i contributi che la riga non ha",
  );
});

// --- procure: sempre legacy -------------------------------------------------------

test("una procura resta dov'e: la parola significa quattro cose", () => {
  const finding = classifyProcura({
    id: "proc-1",
    name: "Agenzia Alfa",
    payments: [{ amount: 500 }, { amount: 300 }],
  });

  assert.equal(finding.outcome, "LEGACY_ONLY");
  assert.equal(finding.amount, 800);
  assert.match(finding.reason, /quattro fattispecie/);
});

// --- il rapporto --------------------------------------------------------------------

test("il rapporto conta i tre esiti e dice quanto denaro c'e in mezzo", () => {
  const report = buildLegacyMigrationReport({
    organizationId: "club-a",
    trainers: [
      { id: "t1", firstName: "Marco", lastName: "Rossi" },
      { id: "t2", firstName: "Solo" },
    ],
    staffMembers: [{ id: "s1", fullName: "Anna Bianchi" }],
    trainerPayments: [
      { id: "tp1", trainer_name: "Marco Rossi", month: "2026-09", amount: 1200 },
      { id: "tp2", trainer_name: "Marco Rossi", month: "2026-10", amount: 1200 },
    ],
    procure: [{ id: "p1", name: "Agenzia Alfa", payments: [{ amount: 500 }] }],
  });

  assert.equal(report.summary.MIGRATED, 2);
  assert.equal(report.summary.NEEDS_CLASSIFICATION, 3);
  assert.equal(report.summary.LEGACY_ONLY, 1);
  assert.equal(report.amountsAtStake.trainerPayments, 2400);
  assert.equal(report.amountsAtStake.procure, 500);
  assert.equal(report.findings.length, 6);
});

test("i candidati non si duplicano sullo stesso codice fiscale", () => {
  const report = buildLegacyMigrationReport({
    organizationId: "club-a",
    trainers: [
      {
        id: "t1",
        firstName: "Marco",
        lastName: "Rossi",
        fiscalCode: "RSSMRC90A01H501A",
      },
    ],
    staffMembers: [
      {
        id: "s9",
        firstName: "Marco",
        lastName: "Rossi",
        fiscalCode: "rssmrc90a01h501a",
      },
    ],
  });

  const candidates = listImportCandidates(report);
  assert.equal(
    candidates.length,
    1,
    "due righe per la stessa persona spezzerebbero il progressivo annuo in due meta",
  );
});

test("senza codice fiscale la deduplica non fonde persone diverse", () => {
  const report = buildLegacyMigrationReport({
    organizationId: "club-a",
    trainers: [
      { id: "t1", firstName: "Marco", lastName: "Rossi" },
      { id: "t2", firstName: "Marco", lastName: "Rossi" },
    ],
  });

  assert.equal(listImportCandidates(report).length, 2);
});

test("un rapporto vuoto e un rapporto valido, non un errore", () => {
  const report = buildLegacyMigrationReport({ organizationId: "club-a" });

  assert.deepEqual(report.summary, {
    MIGRATED: 0,
    NEEDS_CLASSIFICATION: 0,
    LEGACY_ONLY: 0,
  });
  assert.deepEqual(report.findings, []);
});
