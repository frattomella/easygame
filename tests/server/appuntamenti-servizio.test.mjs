import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il servizio degli appuntamenti: permesso, confine, legame, transizioni.**
 *
 * Cio che una colonna JSON non poteva avere, e che qui va provato:
 *
 * - un **permesso per riga**, e non «chi puo scrivere il club puo scrivere
 *   ogni appuntamento»;
 * - un **confine** verificato riga per riga con `assertActiveClub`: una riga di
 *   un altro club non si legge, non si scrive, non si cancella;
 * - il **legame** come congiunzione: dal contesto del figlio A non si tocca la
 *   richiesta nata per il figlio B (W5-54);
 * - il **doppio clic**, che non produce due appuntamenti;
 * - la **riprogrammazione**, che crea una riga e chiude la vecchia invece di
 *   mutare la data in luogo.
 */

const CLUB = "aaaaaaaa-5e00-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-5e00-4000-8000-00000000000b";

const SEGRETERIA = "11111111-5e00-4000-8000-000000000aaa";
const ALLENATORE = "22222222-5e00-4000-8000-000000000bbb";
const GENITORE = "33333333-5e00-4000-8000-000000000ccc";
const ALTRO_GENITORE = "44444444-5e00-4000-8000-000000000ddd";

const FIGLIO_A = "aaaa1111-5e00-4000-8000-00000000aaaa";
const FIGLIO_B = "bbbb2222-5e00-4000-8000-00000000bbbb";

const APP_A = "eeee1111-5e00-4000-8000-00000000eee1";
const APP_B = "eeee2222-5e00-4000-8000-00000000eee2";
const APP_ALTRUI = "eeee3333-5e00-4000-8000-00000000eee3";
const APP_ALLENATORE = "eeee4444-5e00-4000-8000-00000000eee4";

const SLOT = "5555aaaa-5e00-4000-8000-0000000055a1";
const SLOT_ALTRUI = "5555bbbb-5e00-4000-8000-0000000055b1";

/** Lunedi 7 settembre 2026, in ora italiana: 09:00 = 07:00 UTC. */
const LUNEDI = "2026-09-07";

const scope = (activeRole, userId = SEGRETERIA, organizationId = CLUB) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  /*
    L'elenco porta **entrambi** i club, ed e voluto: e la forma esatta
    dell'attacco che ADR-0094 chiude. Se una funzione autorizzasse guardando
    qui invece che il club attivo, questi test lo mostrerebbero.
  */
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
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

const appuntamento = (extra = {}) => ({
  organization_id: CLUB,
  site_id: null,
  season_id: null,
  slot_id: null,
  starts_at: new Date("2026-09-07T08:00:00.000Z"),
  ends_at: new Date("2026-09-07T08:30:00.000Z"),
  timezone: "Europe/Rome",
  status: "requested",
  athlete_id: FIGLIO_A,
  requested_by_user_id: GENITORE,
  assigned_to_user_id: null,
  reason: "Colloquio con la segreteria",
  notes: null,
  internal_notes: "La famiglia e in ritardo con la quota",
  decision_note: null,
  decided_by: null,
  decided_at: null,
  parent_appointment_id: null,
  idempotency_key: null,
  version: 1,
  created_by: GENITORE,
  ...extra,
});

const seed = () => ({
  user: [
    { id: SEGRETERIA, email: "segreteria@club.it", email_verified_at: new Date() },
    { id: ALLENATORE, email: "mister@club.it", email_verified_at: new Date() },
    {
      id: GENITORE,
      email: "genitore@famiglia.it",
      first_name: "Anna",
      last_name: "Rossi",
      email_verified_at: new Date(),
    },
    { id: ALTRO_GENITORE, email: "altro@famiglia.it", email_verified_at: new Date() },
  ],
  club: [
    { id: CLUB, slug: "club", name: "Club", opening_hours: null },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro club", opening_hours: null },
  ],
  organizationUser: [
    { id: "m1", organization_id: CLUB, user_id: SEGRETERIA, role: "owner", is_primary: true },
    { id: "m2", organization_id: CLUB, user_id: ALLENATORE, role: "trainer" },
    { id: "m3", organization_id: CLUB, user_id: GENITORE, role: "parent" },
  ],
  athlete: [
    {
      id: FIGLIO_A,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Rossi",
      data: { guardians: [{ linkedUserId: GENITORE }] },
    },
    {
      id: FIGLIO_B,
      organization_id: CLUB,
      first_name: "Sara",
      last_name: "Rossi",
      data: { guardians: [{ linkedUserId: GENITORE }] },
    },
  ],
  appointmentSlot: [
    {
      id: SLOT,
      organization_id: CLUB,
      site_id: null,
      assigned_to_user_id: null,
      weekday: 1,
      specific_date: null,
      start_time: "09:00",
      end_time: "11:00",
      duration_minutes: 30,
      capacity: 1,
      valid_from: null,
      valid_until: null,
      active: true,
    },
    {
      id: SLOT_ALTRUI,
      organization_id: ALTRO_CLUB,
      site_id: null,
      assigned_to_user_id: null,
      weekday: 1,
      specific_date: null,
      start_time: "09:00",
      end_time: "11:00",
      duration_minutes: 30,
      capacity: 1,
      active: true,
    },
  ],
  appointment: [
    /* Le 10:00 italiane: la richiesta del figlio A. */
    { id: APP_A, ...appuntamento() },
    /* Le 10:30 italiane: la richiesta del figlio B, dallo stesso genitore. */
    {
      id: APP_B,
      ...appuntamento({
        athlete_id: FIGLIO_B,
        starts_at: new Date("2026-09-07T08:30:00.000Z"),
        ends_at: new Date("2026-09-07T09:00:00.000Z"),
        reason: "Colloquio per Sara",
      }),
    },
    {
      id: APP_ALLENATORE,
      ...appuntamento({
        athlete_id: FIGLIO_A,
        assigned_to_user_id: ALLENATORE,
        starts_at: new Date("2026-09-07T09:00:00.000Z"),
        ends_at: new Date("2026-09-07T09:30:00.000Z"),
        reason: "Colloquio con l'allenatore",
      }),
    },
    {
      id: APP_ALTRUI,
      ...appuntamento({
        organization_id: ALTRO_CLUB,
        athlete_id: null,
        requested_by_user_id: ALTRO_GENITORE,
        reason: "Appuntamento di un altro club",
      }),
    },
  ],
  notification: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

const righe = () => fake.rows("appointment");
const riga = (id) => righe().find((row) => row.id === id);

/* =================================================== la matrice ========== */

test("un genitore non legge la coda del club, e non la scrive", async () => {
  await assert.rejects(() => appuntamenti.listAppointments(scope("parent", GENITORE)), negato);
  await assert.rejects(
    () => appuntamenti.confirmAppointment(scope("parent", GENITORE), APP_A),
    negato,
    "confermarsi da soli l'appuntamento che si e appena chiesto non e una mossa",
  );
  await assert.rejects(
    () => appuntamenti.createAppointmentSlot(scope("parent", GENITORE), {}),
    negato,
  );
});

test("un atleta non ha nessuna delle quattro chiavi", async () => {
  await assert.rejects(() => appuntamenti.listAppointments(scope("athlete", GENITORE)), negato);
  await assert.rejects(
    () => appuntamenti.createAppointment(scope("athlete", GENITORE), { reason: "x" }),
    negato,
  );
});

test("l'allenatore vede solo gli appuntamenti assegnati a lui", async () => {
  const rows = await appuntamenti.listAppointments(scope("trainer", ALLENATORE));

  assert.deepEqual(
    rows.map((row) => row.id),
    [APP_ALLENATORE],
    "read_own non e un filtro opzionale: e il perimetro, e non si accende su un parametro",
  );
});

test("l'allenatore non muove un appuntamento che non e suo, e non ne crea", async () => {
  await assert.rejects(
    () => appuntamenti.confirmAppointment(scope("trainer", ALLENATORE), APP_A),
    negato,
  );
  await assert.rejects(
    () =>
      appuntamenti.createAppointment(scope("trainer", ALLENATORE), {
        reason: "Colloquio",
        date: LUNEDI,
        time: "09:00",
      }),
    negato,
    "chiedere un appuntamento alla segreteria non e cosa che il ruolo trainer possa fare",
  );

  const suo = await appuntamenti.confirmAppointment(
    scope("trainer", ALLENATORE),
    APP_ALLENATORE,
    {},
    { userId: ALLENATORE },
  );
  assert.equal(suo.status, "confirmed");
});

test("senza un club attivo non si legge e non si scrive niente", async () => {
  const senzaClub = {
    userId: SEGRETERIA,
    activeOrganizationId: null,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
  };

  await assert.rejects(() => appuntamenti.listAppointments(senzaClub), negato);
  await assert.rejects(
    () => appuntamenti.confirmAppointment(senzaClub, APP_A),
    negato,
  );
});

/* ==================================================== il confine ========= */

test("un appuntamento di un altro club non si legge", async () => {
  assert.equal(await appuntamenti.readAppointment(scope("owner"), APP_ALTRUI), null);

  const rows = await appuntamenti.listAppointments(scope("owner"));
  assert.equal(rows.length > 0, true);
  for (const row of rows) assert.equal(row.organization_id, CLUB);
});

test("un appuntamento di un altro club non si scrive", async () => {
  for (const mossa of [
    () => appuntamenti.confirmAppointment(scope("owner"), APP_ALTRUI),
    () => appuntamenti.rejectAppointment(scope("owner"), APP_ALTRUI, { note: "no" }),
    () => appuntamenti.cancelAppointment(scope("owner"), APP_ALTRUI),
    () =>
      appuntamenti.rescheduleAppointment(scope("owner"), APP_ALTRUI, {
        date: LUNEDI,
        time: "09:00",
      }),
  ]) {
    await assert.rejects(mossa, /Accesso negato|non trovato/);
  }

  assert.equal(
    riga(APP_ALTRUI).status,
    "requested",
    "la riga dell'altro club non si e mossa di un millimetro",
  );
});

test("uno slot di un altro club non si modifica e non si cancella", async () => {
  await assert.rejects(
    () => appuntamenti.updateAppointmentSlot(scope("owner"), SLOT_ALTRUI, {}),
    /Accesso negato|non trovato/,
  );
  await assert.rejects(
    () => appuntamenti.deleteAppointmentSlot(scope("owner"), SLOT_ALTRUI),
    /Accesso negato|non trovato/,
  );

  assert.equal(
    fake.rows("appointmentSlot").some((row) => row.id === SLOT_ALTRUI),
    true,
  );
});

/* ============================================= il legame della famiglia == */

test("dal contesto del figlio A non si tocca la richiesta del figlio B", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);
  assert.ok(ctx, "il genitore e collegato al figlio A");
  assert.equal(ctx.organizationId, CLUB, "il club si deriva dal legame, non dal client");

  await assert.rejects(
    () => appuntamenti.cancelFamilyAppointment(ctx, APP_B),
    negato,
    "era un OR permissivo: bastava che coincidesse l'utente richiedente",
  );
  await assert.rejects(
    () =>
      appuntamenti.rescheduleFamilyAppointment(ctx, APP_B, {
        date: LUNEDI,
        time: "09:00",
      }),
    negato,
  );

  assert.equal(riga(APP_B).status, "requested");
});

test("una richiesta del proprio figlio nata da un altro utente non si tocca", async () => {
  riga(APP_A).requested_by_user_id = ALTRO_GENITORE;

  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);
  await assert.rejects(() => appuntamenti.cancelFamilyAppointment(ctx, APP_A), negato);

  assert.equal(
    riga(APP_A).status,
    "requested",
    "la congiunzione vale in entrambi i versi: atleta **e** autore",
  );
});

test("chi non e collegato all'atleta non ottiene nessun contesto", async () => {
  assert.equal(
    await appuntamenti.resolveFamilyAppointmentContext(ALTRO_GENITORE, FIGLIO_A),
    null,
  );
});

test("la famiglia annulla la propria richiesta, e lo stato dice chi e stato", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);
  const esito = await appuntamenti.cancelFamilyAppointment(ctx, APP_A);

  assert.equal(esito.status, "cancelled_by_family");
  assert.equal(riga(APP_A).status, "cancelled_by_family");
});

/* ==================================================== il doppio clic ===== */

test("due invii dello stesso gesto non producono due appuntamenti", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);
  const richiesta = { reason: "Colloquio", date: LUNEDI, time: "09:00" };

  const prima = await appuntamenti.requestFamilyAppointment(ctx, richiesta);
  const seconda = await appuntamenti.requestFamilyAppointment(ctx, richiesta);

  assert.equal(seconda.id, prima.id, "il secondo clic ritrova il primo appuntamento");
  assert.equal(
    righe().filter((row) => row.idempotency_key && row.athlete_id === FIGLIO_A).length,
    1,
  );
});

test("la richiesta della famiglia cade su uno slot libero, e solo su quello", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);

  await assert.rejects(
    () =>
      appuntamenti.requestFamilyAppointment(ctx, {
        reason: "Colloquio",
        date: LUNEDI,
        time: "09:20",
      }),
    /non e piu disponibile|non e fra quelli disponibili/,
    "le 09:20 non sono uno slot: la data qualunque non esiste piu",
  );

  await assert.rejects(
    () =>
      appuntamenti.requestFamilyAppointment(ctx, {
        reason: "Colloquio",
        date: LUNEDI,
        time: "10:00",
      }),
    /non e piu disponibile|non e fra quelli disponibili/,
    "le 10:00 sono gia occupate da una richiesta viva",
  );
});

test("la richiesta della famiglia nasce in attesa e avvisa la segreteria", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);
  const creato = await appuntamenti.requestFamilyAppointment(ctx, {
    reason: "Colloquio",
    date: LUNEDI,
    time: "09:00",
  });

  assert.equal(creato.status, "requested");
  assert.equal(creato.slot_id, SLOT);
  assert.equal(
    riga(creato.id).starts_at.toISOString(),
    "2026-09-07T07:00:00.000Z",
    "le 09:00 italiane di settembre sono le 07:00 UTC",
  );

  const avvisi = fake.rows("notification");
  assert.equal(avvisi.length > 0, true);
  for (const avviso of avvisi) {
    assert.notEqual(
      avviso.user_id,
      null,
      "una notifica di societa e indirizzata: mai user_id nullo",
    );
  }
});

/* =============================================== conferma e rifiuto ====== */

test("la conferma avvisa la famiglia e lascia una riga di audit", async () => {
  const row = await appuntamenti.confirmAppointment(
    scope("owner"),
    APP_A,
    { note: "Ci vediamo in sede" },
    { userId: SEGRETERIA, email: "segreteria@club.it" },
  );

  assert.equal(row.status, "confirmed");
  assert.equal(row.decided_by, SEGRETERIA);

  const avviso = fake.rows("notification").find((item) => item.user_id === GENITORE);
  assert.ok(avviso, "la famiglia deve saperlo senza dover richiamare la segreteria");

  const audit = fake.rows("auditLog").find((item) => item.action === "appointment.confirmed");
  assert.ok(audit);
  assert.equal(audit.resource_id, APP_A);
});

test("il rifiuto senza motivo non passa; con il motivo arriva alla famiglia", async () => {
  await assert.rejects(
    () => appuntamenti.rejectAppointment(scope("owner"), APP_A, {}),
    /motivo del rifiuto/,
  );

  const row = await appuntamenti.rejectAppointment(
    scope("owner"),
    APP_A,
    { note: "Quel giorno la segreteria e chiusa" },
    { userId: SEGRETERIA },
  );

  assert.equal(row.status, "rejected");
  assert.equal(row.decision_note, "Quel giorno la segreteria e chiusa");
});

test("un appuntamento confermato non si rifiuta: la macchina a stati lo nega", async () => {
  await appuntamenti.confirmAppointment(scope("owner"), APP_A, {}, { userId: SEGRETERIA });

  await assert.rejects(
    () => appuntamenti.rejectAppointment(scope("owner"), APP_A, { note: "ripensato" }),
    /Transizione non ammessa/,
  );
});

test("due operatori che confermano insieme: il secondo fallisce, non vince", async () => {
  await appuntamenti.confirmAppointment(
    scope("owner"),
    APP_A,
    { note: "confermato dalla prima", expectedVersion: 1 },
    { userId: SEGRETERIA },
  );

  await assert.rejects(
    () =>
      appuntamenti.confirmAppointment(
        scope("owner"),
        APP_A,
        { note: "confermato dalla seconda", expectedVersion: 1 },
        { userId: ALLENATORE },
      ),
    /aggiornato da qualcun altro|Transizione non ammessa/,
  );

  assert.equal(riga(APP_A).decision_note, "confermato dalla prima");
});

/* ================================================ la riprogrammazione ==== */

test("la riprogrammazione crea una riga nuova e chiude la vecchia", async () => {
  const prima = righe().length;

  const esito = await appuntamenti.rescheduleAppointment(
    scope("owner"),
    APP_A,
    { date: LUNEDI, time: "09:00", note: "Spostato su richiesta della famiglia" },
    { userId: SEGRETERIA },
  );

  assert.equal(righe().length, prima + 1, "la data non si muta in luogo");
  assert.equal(riga(APP_A).status, "rescheduled");
  assert.equal(esito.created.parent_appointment_id, APP_A);
  assert.equal(esito.created.status, "requested");
  assert.equal(
    esito.created.starts_at.toISOString(),
    "2026-09-07T07:00:00.000Z",
  );
  assert.equal(
    esito.created.internal_notes,
    null,
    "le note della segreteria non si trascinano su un altro appuntamento",
  );

  const audit = fake
    .rows("auditLog")
    .find((item) => item.action === "appointment.rescheduled");
  assert.equal(
    audit.metadata.nuovoAppuntamento,
    esito.created.id,
    "l'audit deve poter essere letto in avanti",
  );
});

test("la famiglia riprogramma finche e in richiesta, non dopo la conferma", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);

  const nuovo = await appuntamenti.rescheduleFamilyAppointment(ctx, APP_A, {
    date: LUNEDI,
    time: "09:00",
  });
  assert.equal(riga(APP_A).status, "rescheduled");
  assert.equal(nuovo.status, "requested");

  await appuntamenti.confirmAppointment(
    scope("owner"),
    nuovo.id,
    {},
    { userId: SEGRETERIA },
  );

  await assert.rejects(
    () =>
      appuntamenti.rescheduleFamilyAppointment(ctx, nuovo.id, {
        date: LUNEDI,
        time: "09:30",
      }),
    /Transizione non ammessa/,
  );
});

/* ==================================== le note interne non escono mai ===== */

test("le note della segreteria non arrivano alla famiglia", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);
  const items = await appuntamenti.listFamilyAppointments(ctx);
  const mio = items.find((item) => item.id === APP_A);

  assert.ok(mio);
  assert.equal(
    Object.prototype.hasOwnProperty.call(mio, "internal_notes"),
    false,
    "non e nascosto dall'interfaccia: nella proiezione della famiglia non c'e",
  );
  assert.equal(
    JSON.stringify(items).includes("in ritardo con la quota"),
    false,
  );
});

test("l'elenco della famiglia porta solo il figlio selezionato", async () => {
  const ctx = await appuntamenti.resolveFamilyAppointmentContext(GENITORE, FIGLIO_A);
  const items = await appuntamenti.listFamilyAppointments(ctx);

  assert.equal(
    items.some((item) => item.id === APP_B),
    false,
    "l'appuntamento dell'altro figlio si vede dal contesto dell'altro figlio",
  );
});

/* ================================================ concluso e assente ===== */

test("concluso e assente si constatano solo su un appuntamento confermato", async () => {
  await assert.rejects(
    () => appuntamenti.closeAppointment(scope("owner"), APP_A, "no_show"),
    /Transizione non ammessa/,
  );

  await appuntamenti.confirmAppointment(scope("owner"), APP_A, {}, { userId: SEGRETERIA });
  const row = await appuntamenti.closeAppointment(
    scope("owner"),
    APP_A,
    "no_show",
    {},
    { userId: SEGRETERIA },
  );

  assert.equal(row.status, "no_show");
});
