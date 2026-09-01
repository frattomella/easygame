import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Due difetti del servizio appuntamenti, misurati sul giro completo.**
 *
 * 1. **W6-58 — uno slot offerto veniva rifiutato allo spostamento.** La
 *    lettura della famiglia non filtra per operatore, e mostra quando la
 *    societa riceve; `riprogramma` invece filtrava con l'operatore della riga
 *    esistente. Se l'appuntamento era di Rossi e la famiglia sceglieva uno
 *    slot di Bianchi, la risposta era «L'orario scelto non e fra quelli
 *    disponibili» — su un orario che l'applicazione aveva appena mostrato come
 *    libero. Le due strade devono offrire lo **stesso insieme**.
 *
 * 2. **W6-59 — il desk fissava un appuntamento e non lo diceva a nessuno.**
 *    `createAppointment` con `confirmed` nasce gia in agenda e scriveva solo
 *    l'audit: un colloquio preso al telefono esisteva solo per la segreteria.
 *    Il destinatario non e `requested_by_user_id` — su quella riga porta
 *    l'operatore che l'ha scritta — ma i tutori dell'atleta.
 */

const CLUB = "aaaaaaaa-6a00-4000-8000-00000000000a";

const SEGRETERIA = "11111111-6a00-4000-8000-000000000aaa";
const ROSSI = "22222222-6a00-4000-8000-000000000bbb";
const BIANCHI = "33333333-6a00-4000-8000-000000000ccc";
const GENITORE = "44444444-6a00-4000-8000-000000000ddd";

const FIGLIO = "aaaa1111-6a00-4000-8000-00000000aaaa";
const APP_CON_ROSSI = "eeee1111-6a00-4000-8000-00000000eee1";

const SLOT_ROSSI = "5555aaaa-6a00-4000-8000-0000000055a1";
const SLOT_BIANCHI = "5555bbbb-6a00-4000-8000-0000000055b1";

/** Lunedi 7 settembre 2026, in ora italiana: 09:00 = 07:00 UTC. */
const LUNEDI = "2026-09-07";

const scope = (activeRole, userId = SEGRETERIA) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB],
});

let appuntamenti;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  appuntamenti = await import("../../src/lib/server/appointments.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/*
  Due agende distinte sullo stesso lunedi mattina: Rossi riceve dalle 09:00
  alle 09:30, Bianchi dalle 09:30 alle 10:00. Nessuno dei due copre l'orario
  dell'altro, ed e la forma esatta del difetto: le 09:30 esistono per la
  societa e non esistono per Rossi.
*/
const seed = () => ({
  user: [
    { id: SEGRETERIA, email: "segreteria@club.it", email_verified_at: new Date() },
    { id: ROSSI, email: "rossi@club.it", email_verified_at: new Date() },
    { id: BIANCHI, email: "bianchi@club.it", email_verified_at: new Date() },
    {
      id: GENITORE,
      email: "genitore@famiglia.it",
      first_name: "Anna",
      last_name: "Verdi",
      email_verified_at: new Date(),
    },
  ],
  club: [{ id: CLUB, slug: "club", name: "Club", opening_hours: null }],
  organizationUser: [
    { id: "m1", organization_id: CLUB, user_id: SEGRETERIA, role: "owner", is_primary: true },
    { id: "m2", organization_id: CLUB, user_id: ROSSI, role: "trainer" },
    { id: "m3", organization_id: CLUB, user_id: BIANCHI, role: "trainer" },
    { id: "m4", organization_id: CLUB, user_id: GENITORE, role: "parent" },
  ],
  athlete: [
    {
      id: FIGLIO,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Verdi",
      data: { guardians: [{ linkedUserId: GENITORE }] },
    },
  ],
  appointmentSlot: [
    {
      id: SLOT_ROSSI,
      organization_id: CLUB,
      site_id: null,
      assigned_to_user_id: ROSSI,
      weekday: 1,
      specific_date: null,
      start_time: "09:00",
      end_time: "09:30",
      duration_minutes: 30,
      valid_from: null,
      valid_until: null,
      active: true,
    },
    {
      id: SLOT_BIANCHI,
      organization_id: CLUB,
      site_id: null,
      assigned_to_user_id: BIANCHI,
      weekday: 1,
      specific_date: null,
      start_time: "09:30",
      end_time: "10:00",
      duration_minutes: 30,
      valid_from: null,
      valid_until: null,
      active: true,
    },
  ],
  appointment: [
    {
      id: APP_CON_ROSSI,
      organization_id: CLUB,
      site_id: null,
      season_id: null,
      slot_id: SLOT_ROSSI,
      starts_at: new Date("2026-09-07T07:00:00.000Z"),
      ends_at: new Date("2026-09-07T07:30:00.000Z"),
      timezone: "Europe/Rome",
      status: "requested",
      athlete_id: FIGLIO,
      requested_by_user_id: GENITORE,
      assigned_to_user_id: ROSSI,
      reason: "Colloquio",
      notes: null,
      internal_notes: null,
      decision_note: null,
      decided_by: null,
      decided_at: null,
      parent_appointment_id: null,
      idempotency_key: null,
      version: 1,
      created_by: GENITORE,
    },
  ],
  notification: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const righe = () => fake.rows("appointment");
const avvisi = () => fake.rows("notification");

/* ================ W6-58: la lettura e lo spostamento offrono gli stessi slot */

test("la disponibilita mostrata alla famiglia comprende gli slot di ogni operatore", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO);
  assert.ok(ctx);

  const liberi = await appuntamenti.listFamilyFreeSlots(ctx, {
    from: new Date("2026-09-07T00:00:00.000Z"),
    to: new Date("2026-09-07T23:00:00.000Z"),
    now: new Date("2026-09-01T00:00:00.000Z"),
  });

  assert.deepEqual(
    liberi.map((slot) => slot.time).sort(),
    ["09:30"],
    "le 09:00 di Rossi sono occupate dalla richiesta viva; le 09:30 di Bianchi no",
  );
});

test("uno slot offerto si puo scegliere davvero: lo spostamento cambia operatore", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO);

  const creato = await appuntamenti.rescheduleFamilyAppointment(ctx, APP_CON_ROSSI, {
    date: LUNEDI,
    time: "09:30",
  });

  assert.equal(
    righe().find((row) => row.id === APP_CON_ROSSI).status,
    "rescheduled",
    "la riga vecchia si chiude, non si muta la data in luogo",
  );

  const nuova = righe().find((row) => row.id === creato.id);
  assert.equal(nuova.parent_appointment_id, APP_CON_ROSSI);
  assert.equal(
    nuova.assigned_to_user_id,
    BIANCHI,
    "l'appuntamento passa all'operatore dello slot scelto, come fa la prenotazione",
  );
  assert.equal(nuova.starts_at.toISOString(), "2026-09-07T07:30:00.000Z");
});

test("un orario che nessuno offre resta rifiutato", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO);

  await assert.rejects(
    () =>
      appuntamenti.rescheduleFamilyAppointment(ctx, APP_CON_ROSSI, {
        date: LUNEDI,
        time: "11:00",
      }),
    /non e fra quelli disponibili/,
    "la correzione allarga l'insieme degli operatori, non quello degli orari",
  );
});

test("un operatore dichiarato dal chiamante resta vincolante", async () => {
  /*
    E la segreteria che assegna, e li la domanda e un'altra: se dice «con
    Rossi» e Rossi a quell'ora non riceve, la risposta deve restare no.
  */
  await assert.rejects(
    () =>
      appuntamenti.rescheduleAppointment(
        scope("owner"),
        APP_CON_ROSSI,
        { date: LUNEDI, time: "09:30", assignedToUserId: ROSSI },
        { userId: SEGRETERIA },
      ),
    /non e fra quelli disponibili/,
  );
});

/* ============================ W6-59: il desk avvisa la famiglia ========== */

test("l'appuntamento fissato dal desk arriva alla famiglia, non all'operatore", async () => {
  const creato = await appuntamenti.createAppointment(
    scope("owner"),
    {
      athleteId: FIGLIO,
      date: LUNEDI,
      time: "15:00",
      reason: "Colloquio preso al telefono",
      confirmed: true,
      outsideAvailability: true,
    },
    { userId: SEGRETERIA, email: "segreteria@club.it" },
  );

  assert.equal(creato.status, "confirmed");

  const destinatari = avvisi().map((avviso) => avviso.user_id);
  assert.deepEqual(
    destinatari,
    [GENITORE],
    "il tutore dell'atleta, e non chi ha scritto la riga",
  );
  assert.equal(
    avvisi()[0].user_id === null,
    false,
    "una notifica indirizzata: mai user_id nullo, che nel modello vuol dire «di societa»",
  );
  assert.equal(avvisi()[0].data.appointmentId, creato.id);
});

test("una richiesta che nasce in attesa non avvisa la famiglia di se stessa", async () => {
  await appuntamenti.createAppointment(
    scope("owner"),
    {
      athleteId: FIGLIO,
      date: LUNEDI,
      time: "15:00",
      reason: "Richiesta registrata allo sportello",
      outsideAvailability: true,
    },
    { userId: SEGRETERIA, email: "segreteria@club.it" },
  );

  assert.deepEqual(
    avvisi().map((avviso) => avviso.type),
    [],
    "una riga in attesa non e un impegno in agenda: la risposta arrivera, e sara quella ad avvisare",
  );
});

/* ============ W6-53: la modifica parziale di una fascia, e i suoi vuoti === */

test("togliere l'operatore da una fascia lo toglie davvero", async () => {
  /*
    `updateAppointmentSlot` sceglieva i campi con `??`, che tratta `null` come
    «non fornito»: la schermata mandava `null` per svuotare la sede o
    l'operatore, il valore di prima tornava al suo posto, e la riga continuava
    a proporre l'agenda di una persona che nessuno aveva piu indicato. Su una
    configurazione che genera la disponibilita mostrata alle famiglie, un campo
    che non si puo svuotare e un campo che non si puo correggere.
  */
  const aggiornato = await appuntamenti.updateAppointmentSlot(
    scope("owner"),
    SLOT_ROSSI,
    { assignedToUserId: null, startTime: "09:00", endTime: "09:30" },
    { userId: SEGRETERIA },
  );

  assert.equal(aggiornato.assigned_to_user_id, null);
});

test("cio che non si dichiara resta com'era", async () => {
  const aggiornato = await appuntamenti.updateAppointmentSlot(
    scope("owner"),
    SLOT_ROSSI,
    { active: false },
    { userId: SEGRETERIA },
  );

  assert.equal(aggiornato.active, false);
  assert.equal(
    aggiornato.assigned_to_user_id,
    ROSSI,
    "un campo assente non e un campo svuotato",
  );
  assert.equal(aggiornato.weekday, 1);
  assert.equal(aggiornato.start_time, "09:00");
});
