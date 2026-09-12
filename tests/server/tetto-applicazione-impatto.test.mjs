import assert from "node:assert/strict";
import test, { before } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Un tetto esplicito sull'applicazione in blocco di WP-08** (sonda di
 * performance su Postgres reale: 50 fasce cambiate con 90 giorni gia
 * generati, 645 eventi da toccare, uno alla volta tramite `updateClubEvent`
 * — lo stesso scrittore di una modifica umana, con le sue stesse verifiche
 * — restavano oltre il minuto anche con un drappello di esecuzioni in
 * parallelo). Questo file prova che l'operazione si rifiuta con un
 * messaggio leggibile, prima di scrivere niente, quando il numero di
 * eventi "sicuri" da toccare supera il tetto — invece di lasciare la
 * richiesta HTTP appesa per minuti.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-000000000c1";
const DIREZIONE = "11111111-6c00-4000-8000-000000000c1a";

let automazione;
let setPrismaClientForTests;

const scope = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const NOW = new Date("2026-09-14T08:00:00.000Z");

const slot = (overrides) => ({
  id: "slot-1",
  day: "Lunedì",
  startTime: "18:00",
  endTime: "19:30",
  categoryId: "u15",
  structureId: "STRUCT1",
  locationId: "FIELD1",
  trainerIds: ["trainer-1"],
  ...overrides,
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  automazione = await import("../../src/lib/server/training-automation.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const legacyIdPer = (dataIso, fieldId) =>
  `auto:${[dataIso, "18:00", fieldId, "u15"]
    .map((v) => String(v).toLowerCase())
    .join("|")}`;

// I prossimi N lunedi dopo NOW, come stringa AAAA-MM-GG (calendario locale,
// la stessa primitiva della produzione — qui basta la data, non l'ora).
const prossimiLunedi = (quanti) => {
  const risultato = [];
  const cursore = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  // Porta il cursore al primo lunedi (getDay() === 1).
  while (cursore.getDay() !== 1) cursore.setDate(cursore.getDate() + 1);
  cursore.setDate(cursore.getDate() + 7); // il primo lunedi futuro, non oggi
  for (let i = 0; i < quanti; i += 1) {
    const y = cursore.getFullYear();
    const m = String(cursore.getMonth() + 1).padStart(2, "0");
    const d = String(cursore.getDate()).padStart(2, "0");
    risultato.push(`${y}-${m}-${d}`);
    cursore.setDate(cursore.getDate() + 7);
  }
  return risultato;
};

/*
  `findClubEvent`/`updateClubEvent` cercano per `id` solo se ha la forma di
  un UUID: un identificativo leggibile come "evt-2026-09-21" ricadrebbe sul
  `legacy_id`, che qui e un'altra cosa, e l'evento risulterebbe "non
  trovato" anche se la riga esiste.
*/
const idPer = (indice) =>
  `dddddddd-6c00-4000-8000-${String(indice).padStart(12, "0")}`;

const rigaGenerata = (dataIso, indice, fieldId = "FIELD1") => {
  const inizio = new Date(`${dataIso}T18:00:00.000Z`);
  return {
    id: idPer(indice),
    organization_id: CLUB,
    kind: "training",
    legacy_id: legacyIdPer(dataIso, fieldId),
    title: "Allenamento",
    status: "scheduled",
    category_id: "u15",
    category_name: "Under 15",
    category_ids: ["u15"],
    structure_id: "STRUCT1",
    field_id: fieldId,
    site_id: null,
    group_ids: [],
    rsvp_required: false,
    starts_at: inizio,
    ends_at: new Date(inizio.getTime() + 90 * 60 * 1000),
    version: 1,
    payload: { generated: true },
  };
};

const seed = (righeEventi) => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [{ id: "u15", name: "Under 15" }],
      club_sites: [],
      category_groups: [],
      trainers: [],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  clubResourceItem: [],
  clubEvent: righeEventi,
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

test("hostile audit · oltre il tetto, l'applicazione si rifiuta con un messaggio leggibile e non scrive niente", async () => {
  /*
    `findFutureEventsForPreviousSlotDefinitions` cerca solo entro
    `MAX_MANUAL_GENERATION_DAYS_AHEAD` (366 giorni): un solo slot settimanale
    non puo superare ~52 occorrenze in quella finestra. Il caso reale della
    sonda cambiava 50 fasce insieme (645 eventi); qui bastano 4 fasce da 52
    occorrenze ciascuna (208, oltre il tetto di 200) per provare lo stesso
    rifiuto, su campi distinti cosi che le chiavi non collidano.
  */
  const date = prossimiLunedi(52);
  const campi = ["FIELD1", "FIELD2", "FIELD3", "FIELD4"];
  let indice = 0;
  const righe = campi.flatMap((fieldId) =>
    date.map((d) => rigaGenerata(d, indice++, fieldId)),
  );
  assert.equal(righe.length, 208);
  const fake = createFakePrisma(seed(righe));
  setPrismaClientForTests(fake.client);

  const previousSchedule = campi.map((fieldId, i) =>
    slot({ id: `slot-${i}`, locationId: fieldId }),
  );
  const nextSchedule = previousSchedule.map((s) => ({
    ...s,
    startTime: "18:15",
    endTime: "19:45",
  }));

  await assert.rejects(
    () =>
      automazione.applyWeeklyScheduleSlotChanges(
        scope(),
        CLUB,
        { userId: DIREZIONE, email: "direzione@club.it" },
        { previousSchedule, nextSchedule, now: NOW },
      ),
    (errore) => {
      assert.match(errore.message, /troppi eventi/i);
      assert.match(errore.message, /208/);
      return true;
    },
  );

  // Nessuna riga toccata: il rifiuto arriva prima di ogni scrittura.
  const righeInvariate = fake.rows("clubEvent");
  assert.ok(
    righeInvariate.every((riga) => riga.version === 1),
    "il rifiuto per il tetto non deve aver aggiornato nessuna riga",
  );
});

test("hostile audit · sotto il tetto, la scala di riferimento del mandato (rotazione 21 giorni) si applica normalmente", async () => {
  // 8 occorrenze: ben sotto il tetto, e sotto la scala di 152 eventi che la
  // sonda di performance misura per una rotazione a 21 giorni su 50 fasce.
  const date = prossimiLunedi(8);
  const righe = date.map((d, i) => rigaGenerata(d, i));
  const fake = createFakePrisma(seed(righe));
  setPrismaClientForTests(fake.client);

  const nextSchedule = [slot({ startTime: "18:15", endTime: "19:45" })];

  const [esito] = await automazione.applyWeeklyScheduleSlotChanges(
    scope(),
    CLUB,
    { userId: DIREZIONE, email: "direzione@club.it" },
    { previousSchedule: [slot({})], nextSchedule, now: NOW },
  );

  assert.equal(esito.updatedCount, 8);
  assert.equal(esito.skippedCount, 0);
});
