import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **"Genera ora" non abortisce piu l'intero blocco per una fascia su un
 * campo chiuso** (issue UAT Fortitudo Scauri: "il campo «Palazzetto» non e
 * disponibile in quel giorno e a quell'ora").
 *
 * Prima di questa correzione, `runTrainingAutomationForClub` passava
 * `campoChiuso: "rifiuta"` a `createClubEventsBatch` ogni volta che c'era
 * una persona dietro (`options.caller`) e non si trattava di "Genera fino
 * a..."/anteprima (`isManualUntilRequest`): il pulsante "Genera ora" del
 * pannello e esattamente quel caso. La prima fascia su un campo chiuso
 * lanciava un'eccezione che scartava anche tutte le altre fasce valide del
 * blocco, con un messaggio che nominava un solo campo e nessun giorno/ora.
 *
 * Ora "Genera ora" salva cio che puo e riporta il dettaglio di cio che ha
 * saltato, come gia faceva il cron e "Genera fino a...".
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000ge01";
const DIREZIONE = "11111111-6c00-4000-8000-00000000ge01";

let automazione;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const seed = () => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [{ id: "u15", name: "Under 15" }],
      trainers: [],
      staff_members: [],
      /*
        Il "Palazzetto" apre **solo il martedi**: una fascia del lunedi non
        trova nessuna finestra applicabile ed e "fuori orario", non
        "occupato" — la stessa distinzione di
        `audit-blocco-interamente-scartato.test.mjs`.
      */
      structures: [
        {
          id: "STRUCT1",
          name: "Struttura 1",
          fields: [
            {
              id: "FIELD1",
              name: "Palazzetto",
              availability: { Mar: [{ start: "08:00", end: "20:00" }] },
            },
          ],
        },
      ],
      trainings: [],
      matches: [],
      weekly_schedule: [
        {
          id: "slot-lunedi-chiuso",
          day: "Lunedì",
          startTime: "18:00",
          endTime: "19:30",
          categoryId: "u15",
          structureId: "STRUCT1",
          locationId: "FIELD1",
          trainerIds: ["trainer-1"],
        },
        {
          /*
            14:00-15:30 UTC = 16:00-17:30 a Roma (UTC+2 a settembre): dentro
            la finestra 08:00-20:00 di martedi. `isWithinFieldAvailability`
            confronta sul fuso della struttura (`DEFAULT_STRUCTURE_TIMEZONE`),
            non su quello del processo — vedi `describeInstantForAvailability`
            in `structures-utils.ts`.
          */
          id: "slot-martedi-aperto",
          day: "Martedì",
          startTime: "14:00",
          endTime: "15:30",
          categoryId: "u15",
          structureId: "STRUCT1",
          locationId: "FIELD1",
          trainerIds: ["trainer-1"],
        },
      ],
      settings: {},
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  clubResourceItem: [],
  clubEvent: [],
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/*
  Domenica 2026-09-13: il lunedi chiuso (14/09) e il martedi aperto (15/09)
  cadono entrambi nella finestra, e `generateDaysAhead: 7` la tiene stretta
  a una sola occorrenza per fascia — niente conteggi da ricalcolare a mano
  se la finestra di default (21 giorni) cambiasse in futuro.
*/
const DOMENICA = new Date("2026-09-13T08:00:00.000Z");

test('"Genera ora" (un caller, nessuna data assoluta) crea la fascia valida e riporta il dettaglio di quella esclusa, senza abortire il blocco', async () => {
  const risultato = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
    now: DOMENICA,
    settingsOverride: { generateDaysAhead: 7 },
    caller: {
      scope: scope(),
      actor: { userId: DIREZIONE, email: "direzione@club.it" },
    },
  });

  assert.equal(risultato.ran, true);
  assert.equal(risultato.due, true);

  // La fascia del martedi (campo aperto) e stata scritta.
  assert.equal(risultato.generatedCount, 1);
  assert.equal(fake.rows("clubEvent").length, 1);
  assert.equal(
    new Date(fake.rows("clubEvent")[0]?.starts_at).getUTCDay(),
    2,
    "l'unica riga scritta e quella del martedi (giorno 2)",
  );

  // La fascia del lunedi (campo chiuso) e stata saltata, non ha fatto
  // fallire l'intera chiamata, e il motivo e leggibile.
  assert.equal(risultato.excludedCount, 1);
  assert.equal(risultato.excludedSlots.length, 1);
  assert.equal(risultato.excludedSlots[0].reasonCode, "OUTSIDE_OPENING_HOURS");
  assert.equal(risultato.excludedSlots[0].categoryName, "Under 15");
  assert.match(risultato.excludedSlots[0].reason, /Palazzetto/);
  assert.match(risultato.excludedSlots[0].reason, /non e disponibile|non è disponibile/);

  // Nessun conflitto in questo scenario.
  assert.equal(risultato.conflicts.length, 0);
});
