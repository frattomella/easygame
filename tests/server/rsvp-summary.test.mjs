import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il riepilogo che vede lo staff: si, no e **senza risposta**.
 *
 * La terza colonna e la ragione per cui l'RSVP esiste — l'allenatore non ha
 * bisogno di sapere chi manca, ha bisogno di sapere chi non ha risposto — e
 * per questo si prova che i silenzi si contano anche quando in
 * `training_attendance` non c'e nessuna riga.
 *
 * Si prova anche il perimetro: un allenatore legge le risposte **dei suoi
 * gruppi operativi** (ADR-0055), e su un allenamento altrui riceve un rifiuto,
 * non un elenco vuoto — un elenco vuoto si confonde con «nessuno ha risposto».
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000010";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000011";
const OWNER = "cccccccc-0000-4000-8000-000000000010";
const ALLENATORE_SCAURI = "cccccccc-0000-4000-8000-000000000011";

const A1 = "bbbbbbbb-0000-4000-8000-000000000011";
const A2 = "bbbbbbbb-0000-4000-8000-000000000012";
const A3 = "bbbbbbbb-0000-4000-8000-000000000013";

const GRUPPO_SCAURI = "group:cat-pulcini:sede-scauri";
const GRUPPO_SANTI = "group:cat-pulcini:sede-santi";

const T_SCAURI = "training-scauri";
const T_SANTI = "training-santi";
const T_LEGACY = "training-legacy";

const ADESSO = new Date("2026-09-01T10:00:00Z");

let service;
let setPrismaClientForTests;
let fake;

const scope = (userId, role) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole: role,
  activeMembershipId: null,
  allowedOrganizationIds: [CLUB],
});

const atleta = (id, nome, sedeId) => ({
  id,
  organization_id: CLUB,
  first_name: nome,
  last_name: "Rossi",
  category_id: "cat-pulcini",
  category_name: "Pulcini",
  data: {},
  category_memberships: [],
  __sede: sedeId,
});

const seed = () => ({
  club: [
    {
      id: CLUB,
      name: "ASD Prova",
      creator_id: OWNER,
      categories: [{ id: "cat-pulcini", name: "Pulcini" }],
      club_sites: [
        { id: "sede-scauri", name: "Scauri" },
        { id: "sede-santi", name: "Santi Cosma" },
      ],
      category_groups: [
        { categoryId: "cat-pulcini", siteId: "sede-scauri" },
        { categoryId: "cat-pulcini", siteId: "sede-santi" },
      ],
      trainers: [
        {
          id: ALLENATORE_SCAURI,
          name: "Anna Verdi",
          email: "anna@example.it",
          // La categoria e la configurazione, il gruppo e l'operazione
          // (ADR-0055): un allenatore vero ha entrambe.
          categories: ["cat-pulcini"],
          groupIds: [GRUPPO_SCAURI],
        },
      ],
      trainings: [
        {
          id: T_SCAURI,
          title: "Pulcini Scauri",
          date: "2026-09-05",
          time: "17:30",
          endTime: "19:00",
          status: "upcoming",
          categoryId: "cat-pulcini",
          groupIds: [GRUPPO_SCAURI],
          rsvpRequired: true,
          rsvpDeadline: "2026-09-04T18:00:00Z",
        },
        {
          /*
            Dato **precedente** ai gruppi operativi: nessun `groupIds`, solo la
            categoria. Deve continuare a riguardare tutti i Pulcini, altrimenti
            un allenamento storico mostrerebbe un «senza risposta» piu corto
            del vero.
          */
          id: T_LEGACY,
          title: "Pulcini (dato precedente ai gruppi)",
          date: "2026-09-05",
          time: "17:30",
          endTime: "19:00",
          status: "upcoming",
          categoryId: "cat-pulcini",
          rsvpRequired: true,
        },
        {
          id: T_SANTI,
          title: "Pulcini Santi Cosma",
          date: "2026-09-05",
          time: "17:30",
          endTime: "19:00",
          status: "upcoming",
          categoryId: "cat-pulcini",
          groupIds: [GRUPPO_SANTI],
          rsvpRequired: true,
        },
      ],
    },
    { id: ALTRO_CLUB, name: "ASD Altra", creator_id: OWNER, trainings: [] },
  ],
  athlete: [
    atleta(A1, "Mario", "sede-scauri"),
    atleta(A2, "Luca", "sede-scauri"),
    atleta(A3, "Sara", "sede-santi"),
  ],
  athleteCategoryMembership: [
    {
      id: "m1",
      organization_id: CLUB,
      athlete_id: A1,
      category_id: "cat-pulcini",
      category_name: "Pulcini",
      is_primary: true,
      site_id: "sede-scauri",
    },
    {
      id: "m2",
      organization_id: CLUB,
      athlete_id: A2,
      category_id: "cat-pulcini",
      category_name: "Pulcini",
      is_primary: true,
      site_id: "sede-scauri",
    },
    {
      id: "m3",
      organization_id: CLUB,
      athlete_id: A3,
      category_id: "cat-pulcini",
      category_name: "Pulcini",
      is_primary: true,
      site_id: "sede-santi",
    },
  ],
  /*
    Gli allenamenti sono righe (ADR-0098): il riepilogo RSVP si appoggia alla
    riga dell'evento, e l'identificativo storico resta in `legacy_id`.
  */
  clubEvent: [T_SCAURI, T_LEGACY, T_SANTI].map((legacyId) => ({
    id: `evento-${legacyId}`,
    organization_id: CLUB,
    kind: "training",
    legacy_id: legacyId,
    status: "scheduled",
    starts_at: new Date("2026-09-05T17:30:00.000Z"),
    payload: { id: legacyId },
  })),
  clubEventParticipant: [
    {
      id: "riga-1",
      organization_id: CLUB,
      event_id: `evento-${T_SCAURI}`,
      legacy_training_id: T_SCAURI,
      athlete_id: A1,
      status: "pending",
      rsvp_status: "yes",
      rsvp_note: "arriva tardi",
      rsvp_at: new Date("2026-08-31T09:00:00Z"),
    },
  ],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/rsvp.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("il riepilogo conta i silenzi degli attesi, non solo le righe esistenti", async () => {
  const riepilogo = await service.readEventRsvpSummary({
    trainingId: T_SCAURI,
    scope: scope(OWNER, "owner"),
    now: ADESSO,
  });

  assert.equal(riepilogo.rsvpRequired, true);
  assert.equal(riepilogo.totals.yes, 1);
  assert.equal(riepilogo.totals.no, 0);
  // Sara e di Santi Cosma: non e attesa a Scauri e non entra nel denominatore.
  assert.equal(riepilogo.totals.noResponse, 1);
  assert.equal(riepilogo.totals.expected, 2);

  const senzaRisposta = riepilogo.athletes.filter(
    (riga) => riga.state === "no_response",
  );
  assert.deepEqual(
    senzaRisposta.map((riga) => riga.athleteId),
    [A2],
  );
  assert.equal(senzaRisposta[0].athleteName, "Rossi Luca");
});

test("l'allenatore legge le risposte del suo gruppo", async () => {
  const riepilogo = await service.readEventRsvpSummary({
    trainingId: T_SCAURI,
    scope: scope(ALLENATORE_SCAURI, "trainer"),
    actorEmail: "anna@example.it",
    now: ADESSO,
  });

  assert.equal(riepilogo.totals.expected, 2);
});

test("l'allenatore non legge le risposte di un gruppo che non segue", async () => {
  await assert.rejects(
    () =>
      service.readEventRsvpSummary({
        trainingId: T_SANTI,
        scope: scope(ALLENATORE_SCAURI, "trainer"),
        actorEmail: "anna@example.it",
        now: ADESSO,
      }),
    /Accesso negato/,
  );
});

test("un ruolo senza permesso di lettura non vede il riepilogo", async () => {
  await assert.rejects(
    () =>
      service.readEventRsvpSummary({
        trainingId: T_SCAURI,
        scope: scope(OWNER, "parent"),
        now: ADESSO,
      }),
    /Accesso negato/,
  );
});

/**
 * Il club richiesto deve essere fra quelli a cui la sessione ha accesso: un
 * `organization_id` scelto da chi chiama non e un filtro (CLAUDE.md §8).
 */
test("non si legge il riepilogo di un club fuori dallo scope", async () => {
  await assert.rejects(
    () =>
      service.readEventRsvpSummary({
        organizationId: ALTRO_CLUB,
        trainingId: T_SCAURI,
        scope: scope(OWNER, "owner"),
        now: ADESSO,
      }),
    /Accesso negato/,
  );
});

test("un allenamento senza gruppi dichiarati riguarda tutta la categoria", async () => {
  const riepilogo = await service.readEventRsvpSummary({
    trainingId: T_LEGACY,
    scope: scope(OWNER, "owner"),
    now: ADESSO,
  });

  assert.equal(riepilogo.totals.expected, 3);
  assert.equal(riepilogo.totals.noResponse, 3);
});

/**
 * Sullo stesso dato precedente, l'allenatore ricade sulla **categoria**: un
 * perimetro per gruppo applicato a un allenamento che i gruppi non li dichiara
 * negherebbe l'accesso proprio a chi il club lo ha configurato meglio.
 */
test("sul dato precedente l'allenatore ricade sulla categoria", async () => {
  const riepilogo = await service.readEventRsvpSummary({
    trainingId: T_LEGACY,
    scope: scope(ALLENATORE_SCAURI, "trainer"),
    actorEmail: "anna@example.it",
    now: ADESSO,
  });

  assert.equal(riepilogo.totals.expected, 3);
});
