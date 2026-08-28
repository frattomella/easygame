import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Due modifiche contemporanee a `clubs.settings` (RC FIX 3, punto 3).
 *
 * **Il sospetto da verificare.** `settings` e una colonna JSON unica: per
 * cambiarne una chiave la si rilegge e la si riscrive **intera**. Chi salva la
 * scheda Contatti rimanda indietro anche i Pagamenti, la cui copia ha letto
 * un istante prima. Se nel frattempo qualcun altro ha scritto i Pagamenti,
 * quella scrittura sparisce senza che nessuno se ne accorga.
 *
 * Il primo test **riproduce** il difetto sul percorso vero — `updateResource`
 * su `clubs`, cioe quello che serve la PATCH — prima di cambiare qualunque
 * cosa. Gli altri dicono cosa deve valere dopo la correzione.
 *
 * Nota su cosa questi test possono e non possono provare: il doppio del
 * client Prisma non ha isolamento delle transazioni, quindi non dimostra che
 * un lock funzioni. Dimostra pero l'unica cosa che qui conta davvero — che la
 * scrittura di una sezione **non porti con se** una copia vecchia delle
 * altre — ed e questa la proprieta che rende il lost update impossibile,
 * perche toglie di mezzo la rilettura invece di metterla in fila.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

const settingsIniziali = () => ({
  companyEmail: "vecchia@example.com",
  phone: "0200000000",
  paymentSettings: { bonifico: { enabled: true } },
  branding: { primaryColor: "#111111" },
  vatNumber: "00000000000",
});

const seed = () => ({
  club: [
    {
      id: CLUB,
      slug: "club-a",
      name: "Club A",
      settings: settingsIniziali(),
    },
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const leggiSettings = async () => {
  const record = await resources.getResourceById("clubs", CLUB, scope());
  return record?.settings || {};
};

/**
 * Una scheda salvata **come fa oggi il client**: rilegge `settings`, ci fonde
 * la propria sezione e rimanda indietro tutto.
 */
const salvaSezioneRileggendo = async (patch) => {
  const current = await leggiSettings();
  return resources.updateResource(
    "clubs",
    CLUB,
    { settings: { ...current, ...patch } },
    scope(),
  );
};

/* --------------------------------------------------------- riproduzione */

test("riproduzione: due schede salvate insieme si cancellano a vicenda", async () => {
  /*
    Le due letture avvengono entrambe prima delle due scritture: e la
    situazione di due schede della stessa pagina aperte in due finestre, o di
    due persone della stessa societa che stanno lavorando insieme.
  */
  const lettaDaContatti = await leggiSettings();
  const lettaDaPagamenti = await leggiSettings();

  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings: {
        ...lettaDaContatti,
        companyEmail: "nuova@example.com",
        phone: "0211111111",
      },
    },
    scope(),
  );

  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings: {
        ...lettaDaPagamenti,
        paymentSettings: { bonifico: { enabled: false }, contanti: { enabled: true } },
      },
    },
    scope(),
  );

  const finali = await leggiSettings();

  assert.deepEqual(
    finali.paymentSettings,
    { bonifico: { enabled: false }, contanti: { enabled: true } },
    "l'ultima scrittura c'e, come previsto",
  );
  assert.equal(
    finali.companyEmail,
    "vecchia@example.com",
    "e questa e la perdita: la scheda Contatti era stata salvata e non c'e piu",
  );
});

/* ----------------------------------------------- cosa deve valere dopo */

test("una sezione puo scrivere solo le proprie chiavi, senza rileggere le altre", async () => {
  const lettaPrima = await leggiSettings();

  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings_patch: {
        companyEmail: "nuova@example.com",
        phone: "0211111111",
      },
    },
    scope(),
  );

  /*
    La seconda scrittura parte da una lettura **precedente** alla prima: e
    esattamente la condizione che prima faceva sparire i Contatti.
  */
  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings_patch: {
        paymentSettings: { bonifico: { enabled: false }, contanti: { enabled: true } },
      },
    },
    scope(),
  );

  assert.ok(lettaPrima.companyEmail, "la lettura iniziale esisteva davvero");

  const finali = await leggiSettings();

  assert.equal(finali.companyEmail, "nuova@example.com", "Contatti resta");
  assert.deepEqual(
    finali.paymentSettings,
    { bonifico: { enabled: false }, contanti: { enabled: true } },
    "Pagamenti resta",
  );
  assert.equal(finali.phone, "0211111111");
  assert.deepEqual(
    finali.branding,
    { primaryColor: "#111111" },
    "cio che nessuna delle due ha toccato non si muove",
  );
});

test("Branding e dati fiscali, salvati insieme, restano entrambi", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { settings_patch: { branding: { primaryColor: "#ff0000" } } },
    scope(),
  );
  await resources.updateResource(
    "clubs",
    CLUB,
    { settings_patch: { vatNumber: "12345678903" } },
    scope(),
  );

  const finali = await leggiSettings();

  assert.deepEqual(finali.branding, { primaryColor: "#ff0000" });
  assert.equal(finali.vatNumber, "12345678903");
});

test("due modifiche alla stessa sezione: vince l'ultima, non un ibrido", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { settings_patch: { companyEmail: "prima@example.com" } },
    scope(),
  );
  await resources.updateResource(
    "clubs",
    CLUB,
    { settings_patch: { companyEmail: "seconda@example.com" } },
    scope(),
  );

  const finali = await leggiSettings();
  assert.equal(finali.companyEmail, "seconda@example.com");
});

test("autosave concorrente: cinque sezioni sporche insieme, nessuna persa", async () => {
  /*
    E la forma vera dell'autosave: `createCoalescingSaver` accorpa le sezioni
    diventate sporche e le scrive una dopo l'altra, tutte a partire dalla
    **stessa** bozza — cioe da una lettura sola, presa prima della prima
    scrittura. Prima bastava questo perche l'ultima sezione riportasse indietro
    le altre quattro com'erano all'inizio.

    La simultaneita vera al database — due richieste che leggono la riga nello
    stesso millisecondo — la trattiene il `FOR UPDATE`, e non e questo doppio
    del client Prisma a poterlo dimostrare: non ha isolamento. Si verifica a
    runtime su staging.
  */
  const sezioni = [
    { companyEmail: "a@example.com" },
    { phone: "0299999999" },
    { branding: { primaryColor: "#00ff00" } },
    { vatNumber: "99999999999" },
    { sports: ["Calcio"] },
  ];

  for (const settings_patch of sezioni) {
    await resources.updateResource("clubs", CLUB, { settings_patch }, scope());
  }

  const finali = await leggiSettings();

  assert.equal(finali.companyEmail, "a@example.com");
  assert.equal(finali.phone, "0299999999");
  assert.deepEqual(finali.branding, { primaryColor: "#00ff00" });
  assert.equal(finali.vatNumber, "99999999999");
  assert.deepEqual(finali.sports, ["Calcio"]);
  assert.deepEqual(
    finali.paymentSettings,
    { bonifico: { enabled: true } },
    "cio che nessuno ha toccato resta com'era",
  );
});

test("una scrittura piena di settings continua a sostituire, come prima", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    { settings: { companyEmail: "sola@example.com" } },
    scope(),
  );

  const finali = await leggiSettings();

  assert.equal(finali.companyEmail, "sola@example.com");
  assert.equal(
    finali.paymentSettings,
    undefined,
    "chi manda settings intero sta ancora dichiarando tutto: non e un merge",
  );
});
