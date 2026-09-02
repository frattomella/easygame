import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  compareByDate,
  paymentDateOf,
  sortByDateAsc,
  sortByDateDesc,
} from "../../src/lib/sorting.ts";

/**
 * Blocco 7, punti 16 e 17 — ordinamento cronologico e rimozione del PIN club.
 *
 * Il PIN non era un meccanismo di sicurezza:
 *
 * - valore predefinito `"1234"`, in chiaro sia nel client sia nel server, in
 *   un repository pubblico;
 * - `payment_pin` era fra i campi proiettabili di `/api/v1/clubs/:id`: chi
 *   poteva leggere il club poteva **leggere il PIN**;
 * - segreto condiviso da tutto il club: non diceva chi avesse agito;
 * - barriera solo nell'interfaccia, con le stesse operazioni raggiungibili
 *   chiamando le API.
 *
 * Al suo posto la rotta dei pagamenti controlla il **ruolo**, che il PIN non
 * ha mai fatto.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

/** Sorgente senza commenti: un commento che *nomina* il PIN non e il PIN. */
const readCode = (file) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const APP_FILES = walk(SRC);

// --- il PIN non torna --------------------------------------------------------

test("nessun codice legge o scrive il PIN del club", () => {
  /*
    **`resources.ts` e l'unica eccezione, e la ragione e il difetto che segue.**

    Il PIN non si legge da nessuna parte; compare la in una sola riga, come
    voce di un elenco di colonne che **non escono mai**. Vietare anche quella
    significherebbe vietare l'unico posto in cui il segreto viene tolto dalla
    risposta.
  */
  const offenders = APP_FILES.filter((file) =>
    /payment_pin|getClubPaymentPin|PinInput/.test(readCode(file)),
  )
    .map((file) => path.relative(SRC, file).replace(/\\/g, "/"))
    .filter((file) => file !== "lib/server/resources.ts");

  assert.deepEqual(offenders, [], "il PIN di club e stato rimosso, non nascosto");
});

test("il PIN non esce dalle API del club, nemmeno da una lettura intera", async () => {
  /*
    **La prova precedente controllava la cosa sbagliata, e passava mentre il
    segreto usciva.**

    Verificava che `"payment_pin"` non fosse fra le colonne **proiettabili** —
    quelle che un client puo chiedere con `?fields=`. E vero, e non bastava: una
    lettura **senza** `?fields=` non passa da quella lista, restituisce la riga
    intera, e la serializzazione era una copia senza filtro. Una revisione
    ostile ha letto `payment_pin: 1234` da `GET /api/v1/clubs`.

    Un segreto non si difende con un elenco di cio che si puo chiedere: si
    difende con un elenco di cio che non esce, applicato all'uscita. Questa
    prova guarda la **risposta**, che e l'unica cosa che conta.
  */
  const { createFakePrisma } = await import("../helpers/fake-prisma.mjs");
  const risorse = await import("../../src/lib/server/resources.ts");
  const { __setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  );

  const CLUB = "aaaaaaaa-0000-4000-8000-0000000000c1";
  const UTENTE = "bbbbbbbb-0000-4000-8000-0000000000u1";

  const fake = createFakePrisma({
    club: [
      {
        id: CLUB,
        slug: "alfa",
        name: "ASD Alfa",
        payment_pin: "1234",
        iban: "IT60X0542811101000000123456",
      },
    ],
  });
  __setPrismaClientForTests(fake.client);

  const scope = {
    userId: UTENTE,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
  };

  const scheda = await risorse.getResourceById("clubs", CLUB, scope);
  assert.ok(scheda, "il club attivo si legge");
  assert.equal(
    Object.prototype.hasOwnProperty.call(scheda, "payment_pin"),
    false,
    "il PIN non esce dalla scheda del club attivo",
  );

  const { records } = await risorse.listResourcePage(
    "clubs",
    new URLSearchParams(),
    scope,
  );
  for (const record of records) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(record, "payment_pin"),
      false,
      "il PIN non esce dall'elenco dei club",
    );
  }
});

test("di un club non attivo esce l'identita, e nient'altro", async () => {
  /*
    **L'eccezione dei club era tre ordini di grandezza piu larga della ragione
    che la giustificava.**

    L'elenco dei club resta filtrato sui club dell'utente — e giusto: li la
    risorsa **e** il club, e il selettore di societa deve poter leggere quella
    su cui sta per spostarsi. Ma «leggere» significava la riga **intera**, e una
    revisione ostile ha misurato cosa ci sta dentro: IBAN, conti correnti con i
    saldi, la prima nota storica, gli sponsor, i soci con il codice fiscale. Un
    genitore in una societa li leggeva tenendo attiva la propria.

    Del club non attivo escono adesso le sole colonne che servono a sceglierlo.
  */
  const { createFakePrisma } = await import("../helpers/fake-prisma.mjs");
  const risorse = await import("../../src/lib/server/resources.ts");
  const { __setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  );

  const MIO = "aaaaaaaa-0000-4000-8000-0000000000a1";
  const ALTRO = "bbbbbbbb-0000-4000-8000-0000000000b1";

  const fake = createFakePrisma({
    club: [
      { id: MIO, slug: "mio", name: "Il mio club" },
      {
        id: ALTRO,
        slug: "altro",
        name: "Club altrui",
        logo_url: "https://x/logo.png",
        iban: "IT99",
        payment_pin: "1234",
        transactions: [{ id: "t1", amount: 70000 }],
        bank_accounts: [{ id: "b1", iban: "IT99", balance: 250000 }],
        members: [{ id: "m1", fiscal_code: "BNCLCU90A01H501X" }],
        sponsors: [{ id: "s1", name: "Sponsor riservato" }],
      },
    ],
  });
  __setPrismaClientForTests(fake.client);

  const { records } = await risorse.listResourcePage(
    "clubs",
    new URLSearchParams(),
    {
      userId: "u1",
      activeOrganizationId: MIO,
      allowedOrganizationIds: [MIO, ALTRO],
    },
  );

  const altrui = records.find((record) => record.id === ALTRO);
  assert.ok(altrui, "il club resta elencabile: serve a sceglierlo");
  assert.equal(altrui.name, "Club altrui");
  assert.equal(altrui.logo_url, "https://x/logo.png");

  for (const segreto of [
    "iban",
    "payment_pin",
    "transactions",
    "bank_accounts",
    "members",
    "sponsors",
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(altrui, segreto),
      false,
      `${segreto} vive dentro il club, e si legge solo dal club attivo`,
    );
  }
});

test("nessun PIN predefinito scritto nel codice", () => {
  const offenders = APP_FILES.filter((file) => {
    const source = readCode(file);
    return /(pin|Pin|PIN)[^;\n]{0,40}["'`]1234["'`]/.test(source);
  }).map((file) => path.relative(SRC, file).replace(/\\/g, "/"));

  assert.deepEqual(offenders, [], "un default in chiaro non e un segreto");
});

/**
 * Il punto che rende la rimozione un miglioramento e non una perdita: al posto
 * del PIN c'e un controllo di ruolo, che prima non esisteva.
 */
test("la rotta dei pagamenti atleta controlla il ruolo", () => {
  const route = readCode(
    path.join(SRC, "app/api/athlete-payments/[paymentId]/route.ts"),
  );

  assert.match(route, /canManageClubConfigurationAsActor\(scope\.activeRole\)/);
  assert.equal(/verifyClubPin/.test(route), false);
  assert.match(
    route,
    /requireAuthenticatedUser/,
    "sessione e appartenenza restano i presidi principali",
  );
  /*
    **Il confine e il club attivo, non l'elenco dei club.**

    Questa riga chiedeva `allowedOrganizationIds`, cioe esattamente la forma
    che una revisione ostile ha sfruttato: il permesso si verifica con
    `activeRole` — il ruolo nel club **attivo** — e il confine guardava tutti i
    club dell'utente. Chi possiede una societa e in un'altra e solo genitore
    poteva cancellare una rata dell'altra, portandosi via in cascata ogni
    incasso, storno e rimborso collegato.
  */
  assert.match(route, /assertActiveClub\(scope, payment\.organization_id/);
  assert.equal(
    /allowedOrganizationIds/.test(route),
    false,
    "l'elenco dei club non e un confine: lo e il club attivo",
  );
});

/**
 * La colonna `clubs.payment_pin` resta nello schema: toglierla richiede una
 * migrazione distruttiva, e non serve a niente farlo — non la legge piu
 * nessuno. Questo test lo dichiara, cosi la sua presenza non sembra una
 * dimenticanza.
 */
test("la colonna resta nello schema, ma non la usa nessuno", () => {
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.match(
    schema,
    /payment_pin\s+String\?/,
    "il dato legacy resta finche non c'e una ragione per una migrazione distruttiva",
  );
});

// --- ordinamento cronologico -------------------------------------------------

test("la data di un pagamento si legge da qualunque chiave storica", () => {
  assert.equal(paymentDateOf({ paidAt: "2026-03-01" }), "2026-03-01");
  assert.equal(paymentDateOf({ due_date: "2026-04-01" }), "2026-04-01");
  assert.equal(
    paymentDateOf({ dueDate: "2026-04-01", paidAt: "2026-03-01" }),
    "2026-03-01",
    "in un registro l'incasso conta piu della scadenza",
  );
  assert.equal(paymentDateOf({}), "");
});

test("il decrescente e il default: si guarda l'ultimo movimento", () => {
  const rows = [
    { id: "a", date: "2026-01-10" },
    { id: "b", date: "2026-03-05" },
    { id: "c", date: "2026-02-01" },
  ];

  assert.deepEqual(
    sortByDateDesc(rows, paymentDateOf).map((row) => row.id),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    sortByDateAsc(rows, paymentDateOf).map((row) => row.id),
    ["a", "c", "b"],
  );
});

test("le voci senza data vanno in fondo in entrambe le direzioni", () => {
  const rows = [
    { id: "senza" },
    { id: "vecchia", date: "2026-01-10" },
    { id: "nuova", date: "2026-03-05" },
  ];

  assert.equal(
    sortByDateDesc(rows, paymentDateOf).at(-1).id,
    "senza",
    "una riga senza data non e l'ultimo movimento",
  );
  assert.equal(sortByDateAsc(rows, paymentDateOf).at(-1).id, "senza");
});

test("una data illeggibile si comporta come una data assente", () => {
  const rows = [
    { id: "rotta", date: "non-una-data" },
    { id: "buona", date: "2026-01-10" },
  ];

  assert.deepEqual(
    sortByDateDesc(rows, paymentDateOf).map((row) => row.id),
    ["buona", "rotta"],
  );
});

test("ordinare non muta l'array di partenza", () => {
  const rows = [{ date: "2026-01-01" }, { date: "2026-05-01" }];
  const snapshot = [...rows];

  sortByDateDesc(rows, paymentDateOf);
  assert.deepEqual(rows, snapshot, "mutare uno stato React e un difetto silenzioso");
});

test("il comparatore e utilizzabile da solo", () => {
  const compare = compareByDate((value) => value, "asc");
  assert.ok(compare("2026-01-01", "2026-02-01") < 0);
  assert.equal(compare("2026-01-01", "2026-01-01"), 0);
});

/**
 * Gli elenchi che rappresentano eventi nel tempo comparivano nell'ordine in cui
 * erano stati scritti nel JSON — cioe di inserimento, che per una segreteria
 * non significa niente.
 */
test("gli elenchi temporali passano dal comparatore condiviso", () => {
  for (const [file, needle] of [
    ["app/trainers/[id]/page.tsx", /sortByDateDesc\(/],
    /*
      Su `/movements` i giroconti non arrivano piu dal blob `clubs.transfers`
      da ordinare nel browser: la prima nota li ordina sul server, per
      `entry_date`. Cio che resta da ordinare qui sono le rate, e passano dallo
      stesso comparatore — che e cio che questo test difende.
    */
    ["app/movements/page.tsx", /sortByDateDesc\(/],
  ]) {
    assert.match(
      readCode(path.join(SRC, file)),
      needle,
      `${file}: l'ordine non deve dipendere dall'inserimento`,
    );
  }
});
