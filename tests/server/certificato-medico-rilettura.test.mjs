import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **N5 — dopo SALVA, un ricaricamento restituisce gli stessi dati.**
 *
 * Il difetto vero stava **prima** di queste righe, nel browser: il form del
 * certificato caricava il file con `supabase.storage`, che nell'adattatore e
 * una `POST /api/v1/assets`, e `assets` e una risorsa **chiusa** — la porta si
 * sbarra in `ensureResource`, prima ancora della sessione. Il caricamento
 * rispondeva 403, l'eccezione veniva raccolta, e `onSubmit` non veniva **mai**
 * chiamato: nessuna riga scritta, nessun errore comprensibile, la finestra che
 * resta aperta. Quella meta e coperta da
 * `tests/ui/certificato-medico-salvataggio.test.mjs`.
 *
 * Qui si misura la meta di sotto, che il difetto teneva irraggiungibile e che
 * nessuna prova percorreva: creare, rileggere, **correggere**, rileggere. Il
 * percorso di correzione non esisteva affatto — c'erano solo inserimento e
 * cancellazione — quindi una scadenza digitata male si sistemava buttando via
 * la riga che il club aveva protocollato.
 */

const CLUB = "aaaaaaaa-c500-4000-8000-00000000000a";
const ALTRO_CLUB = "aaaaaaaa-c500-4000-8000-00000000000b";
const SEGRETERIA = "11111111-c500-4000-8000-00000000000a";
const MISTER = "11111111-c500-4000-8000-00000000000b";
const ATLETA = "bbbbbbbb-c500-4000-8000-00000000000a";
const ATLETA_ALTROVE = "bbbbbbbb-c500-4000-8000-00000000000b";

let risorse;
let setPrismaClientForTests;
let fake;

const scopeSegreteria = (organizationId = CLUB) => ({
  userId: SEGRETERIA,
  activeOrganizationId: organizationId,
  activeRole: "owner",
  allowedOrganizationIds: [organizationId],
  accessScopes: [],
});

const scopeAllenatore = () => ({
  userId: MISTER,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    { id: SEGRETERIA, email: "segreteria@club.it" },
    { id: MISTER, email: "mister@club.it" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: "cat-a", name: "Under 12" }],
      trainers: [
        {
          id: "trainer-1",
          email: "mister@club.it",
          linkedUserId: MISTER,
          categories: ["cat-a"],
        },
      ],
      staff_members: [],
    },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro", categories: [] },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Sara",
      last_name: "Bianchi",
      status: "active",
      category_id: "cat-a",
      data: {},
    },
    {
      id: ATLETA_ALTROVE,
      organization_id: ALTRO_CLUB,
      first_name: "Luca",
      last_name: "Verdi",
      status: "active",
      data: {},
    },
  ],
  medicalCertificate: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const nuovoCertificato = (overrides = {}) => ({
  organization_id: CLUB,
  athlete_id: ATLETA,
  type: "Agonistico",
  issue_date: "2026-09-01",
  expiry_date: "2027-09-01",
  file_url: "attachment:11111111-2222-3333-4444-555555555555",
  notes: "Agonistico",
  data: { source: "athlete-profile" },
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* Creare e rileggere                                                  */
/* ------------------------------------------------------------------ */

test("un certificato nuovo si rilegge identico", async () => {
  const creato = await risorse.createResource(
    "medical_certificates",
    nuovoCertificato(),
    "create",
    scopeSegreteria(),
  );

  assert.ok(creato?.id, "la creazione deve restituire una riga");

  const riletti = await risorse.listResource(
    "medical_certificates",
    new URLSearchParams({ athlete_id: ATLETA }),
    scopeSegreteria(),
  );

  const riga = riletti.find((voce) => voce.id === creato.id);
  assert.ok(riga, "dopo SALVA la riga deve esserci");
  assert.equal(riga.type, "Agonistico");
  assert.equal(
    String(riga.file_url),
    "attachment:11111111-2222-3333-4444-555555555555",
    "il riferimento all'allegato deve sopravvivere al giro",
  );
  assert.match(String(riga.expiry_date ?? ""), /^2027-09-01/);
});

test("il tipo e le due date sono quelli scritti, non quelli di default", async () => {
  const creato = await risorse.createResource(
    "medical_certificates",
    nuovoCertificato({
      type: "Non Agonistico",
      issue_date: "2026-03-15",
      expiry_date: "2026-12-31",
    }),
    "create",
    scopeSegreteria(),
  );

  const riletto = await risorse.getResourceById(
    "medical_certificates",
    creato.id,
    scopeSegreteria(),
  );

  assert.equal(riletto.type, "Non Agonistico");
  assert.match(String(riletto.issue_date ?? ""), /^2026-03-15/);
  assert.match(String(riletto.expiry_date ?? ""), /^2026-12-31/);
});

/* ------------------------------------------------------------------ */
/* Correggere e rileggere                                              */
/* ------------------------------------------------------------------ */

test("correggere la scadenza la cambia davvero, e resta cambiata", async () => {
  const creato = await risorse.createResource(
    "medical_certificates",
    nuovoCertificato(),
    "create",
    scopeSegreteria(),
  );

  await risorse.updateResource(
    "medical_certificates",
    creato.id,
    { expiry_date: "2027-12-31" },
    scopeSegreteria(),
  );

  const riletto = await risorse.getResourceById(
    "medical_certificates",
    creato.id,
    scopeSegreteria(),
  );

  assert.match(
    String(riletto.expiry_date ?? ""),
    /^2027-12-31/,
    "la correzione deve sopravvivere al ricaricamento",
  );
  assert.equal(riletto.id, creato.id, "e deve restare la stessa riga");
});

test("correggere il tipo non perde l'allegato", async () => {
  const creato = await risorse.createResource(
    "medical_certificates",
    nuovoCertificato(),
    "create",
    scopeSegreteria(),
  );

  await risorse.updateResource(
    "medical_certificates",
    creato.id,
    { type: "Sana e Robusta Costituzione" },
    scopeSegreteria(),
  );

  const riletto = await risorse.getResourceById(
    "medical_certificates",
    creato.id,
    scopeSegreteria(),
  );

  assert.equal(riletto.type, "Sana e Robusta Costituzione");
  assert.equal(
    String(riletto.file_url),
    "attachment:11111111-2222-3333-4444-555555555555",
    "correggere una data non deve staccare il documento che la prova",
  );
});

test("sostituire il file cambia il riferimento e non ne lascia due", async () => {
  const creato = await risorse.createResource(
    "medical_certificates",
    nuovoCertificato(),
    "create",
    scopeSegreteria(),
  );

  await risorse.updateResource(
    "medical_certificates",
    creato.id,
    { file_url: "attachment:99999999-8888-7777-6666-555555555555" },
    scopeSegreteria(),
  );

  const righe = await risorse.listResource(
    "medical_certificates",
    new URLSearchParams({ athlete_id: ATLETA }),
    scopeSegreteria(),
  );

  assert.equal(righe.length, 1, "una correzione non crea una seconda riga");
  assert.equal(
    String(righe[0].file_url),
    "attachment:99999999-8888-7777-6666-555555555555",
  );
});

test("un certificato senza file si crea e si rilegge senza inventarne uno", async () => {
  /*
    La riga puo nascere senza allegato dalla promozione di un deposito
    documentale. Il ricaricamento non deve regalarle un `file_url`.
  */
  const creato = await risorse.createResource(
    "medical_certificates",
    nuovoCertificato({ file_url: null }),
    "create",
    scopeSegreteria(),
  );

  const riletto = await risorse.getResourceById(
    "medical_certificates",
    creato.id,
    scopeSegreteria(),
  );

  assert.ok(!riletto.file_url, "senza file il campo resta vuoto");
});

/* ------------------------------------------------------------------ */
/* Autorizzazioni                                                      */
/* ------------------------------------------------------------------ */

test("l'allenatore non scrive un certificato: gli manca clinical.manage", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "medical_certificates",
        nuovoCertificato(),
        "create",
        scopeAllenatore(),
      ),
    /Accesso negato/,
    "registrare un dato sanitario non e un atto dell'allenatore",
  );
});

test("l'allenatore non corregge un certificato gia scritto", async () => {
  const creato = await risorse.createResource(
    "medical_certificates",
    nuovoCertificato(),
    "create",
    scopeSegreteria(),
  );

  await assert.rejects(
    () =>
      risorse.updateResource(
        "medical_certificates",
        creato.id,
        { expiry_date: "2099-01-01" },
        scopeAllenatore(),
      ),
    /Accesso negato/,
  );
});

test("un certificato non si scrive sull'atleta di un altro club", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "medical_certificates",
        nuovoCertificato({
          athlete_id: ATLETA_ALTROVE,
          organization_id: ALTRO_CLUB,
        }),
        "create",
        scopeSegreteria(CLUB),
      ),
    /Accesso negato/,
    "il confine e il club attivo, non l'elenco dei club dell'utente",
  );
});

/* ------------------------------------------------------------------ */
/* La proiezione clinica dell'allenatore non cambia                    */
/* ------------------------------------------------------------------ */

test("all'allenatore esce lo stato, non il contenuto", async () => {
  await risorse.createResource(
    "medical_certificates",
    nuovoCertificato({ notes: "Cardiopatia nota, controllo semestrale" }),
    "create",
    scopeSegreteria(),
  );

  const righe = await risorse.listResource(
    "medical_certificates",
    new URLSearchParams({ athlete_id: ATLETA }),
    scopeAllenatore(),
  );

  assert.equal(righe.length, 1, "lo stato dei propri atleti lo vede");

  const riga = righe[0];
  assert.ok(riga.expiry_date, "la scadenza e lo stato: quella la vede");

  for (const chiave of ["file_url", "fileUrl", "notes", "doctor", "attachment_id"]) {
    assert.equal(
      riga[chiave] ?? null,
      null,
      `«${chiave}» e contenuto clinico e non deve uscire verso l'allenatore`,
    );
  }
});

test("il controspecchio: alla segreteria il contenuto esce", async () => {
  await risorse.createResource(
    "medical_certificates",
    nuovoCertificato({ notes: "Agonistico" }),
    "create",
    scopeSegreteria(),
  );

  const righe = await risorse.listResource(
    "medical_certificates",
    new URLSearchParams({ athlete_id: ATLETA }),
    scopeSegreteria(),
  );

  assert.equal(
    String(righe[0].file_url),
    "attachment:11111111-2222-3333-4444-555555555555",
    "chi protocolla il certificato deve poterlo aprire",
  );
});
