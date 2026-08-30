import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **I confini che non erano confini.**
 *
 * La correzione dell'IDOR aveva inseguito **una** firma: autorizzare una riga
 * con `allowedOrganizationIds` mentre il permesso si verifica con `activeRole`.
 * L'ha chiusa bene, e una revisione ostile indipendente ha mostrato che fuori
 * da quella firma c'erano tre classi peggiori:
 *
 * 1. **risorse senza nessun confine.** `users` e `assets` non avevano un
 *    controllo sbagliato: non ne avevano affatto. Una ricerca dell'anti-pattern
 *    non poteva vederle, perche l'anti-pattern li non c'era;
 * 2. **confine giusto, permesso assente.** Cinque moduli superavano il primo
 *    controllo e non eseguivano mai il secondo — che il modulo del confine
 *    dichiara nella sua intestazione come **entrambi obbligatori**;
 * 3. **un privilegio che si concede da se.** `user_metadata` accettava
 *    qualunque chiave, e il controllo dell'amministratore di piattaforma ne
 *    leggeva una.
 *
 * Questo file esiste perche fallisca.
 */

const MIO = "aaaaaaaa-2222-4000-8000-00000000000a";
const ALTRUI = "bbbbbbbb-2222-4000-8000-00000000000b";
const IO = "11111111-2222-4000-8000-000000000aaa";
const VITTIMA = "22222222-2222-4000-8000-000000000bbb";
const RATA_ALTRUI = "33333333-2222-4000-8000-000000000ccc";

/**
 * L'attaccante: proprietario del **proprio** club, e in un altro e soltanto
 * genitore. Banale da ottenere — chiunque puo creare una societa.
 */
const scopeAttaccante = () => ({
  userId: IO,
  activeOrganizationId: MIO,
  activeRole: "owner",
  allowedOrganizationIds: [MIO, ALTRUI],
});

let risorse;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    {
      id: IO,
      email: "io@example.it",
      password_hash: "$2b$MIO",
      first_name: "Io",
      role: "user",
      user_metadata: {},
    },
    {
      id: VITTIMA,
      email: "presidente@altrasocieta.it",
      password_hash: "$2b$VITTIMA",
      first_name: "Presidente",
      phone: "+39333",
      role: "platform_admin",
      user_metadata: { nota: "riservata" },
    },
  ],
  asset: [
    {
      id: "asset-1",
      bucket: "shared-documents",
      path: `${ALTRUI}/atleta/carta-identita.pdf`,
      public_url: "/x",
      file_name: "carta-identita.pdf",
      data_base64: "JVBERi0xLjQK-SEGRETO",
    },
  ],
  club: [
    { id: MIO, slug: "mio", name: "Il mio club" },
    {
      id: ALTRUI,
      slug: "altrui",
      name: "Club altrui",
      logo_url: "https://x/logo.png",
      iban: "IT60X0542811101000000123456",
      payment_pin: "1234",
      transactions: [{ id: "t1", amount: 70000, description: "incasso segreto" }],
      bank_accounts: [{ id: "b1", iban: "IT99", balance: 250000 }],
      sponsors: [{ id: "s1", name: "Sponsor riservato" }],
      members: [{ id: "m1", fiscal_code: "BNCLCU90A01H501X" }],
    },
  ],
  athletePayment: [
    {
      id: RATA_ALTRUI,
      organization_id: ALTRUI,
      amount: 600,
      status: "pending",
      description: "Quota del club altrui",
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

/* ================================ 1. le risorse senza confine === */

test("l'anagrafica degli utenti non e la rubrica della piattaforma", async () => {
  /*
    `users` non era fra le risorse filtrate per club, e non per distrazione:
    **non ha un club**, quindi non c'era niente da filtrare. Il risultato era
    che `GET /api/v1/users` non applicava nessun `where`, e
    `resolveRecordOrganizationId` restituiva `null` — e il confine, ricevendo
    `null`, usciva **senza negare**.

    Una revisione ostile ha letto l'anagrafica di ogni utente della
    piattaforma, riscritto la password di un amministratore e cancellato il suo
    account, portandosi via in cascata i club che aveva creato.
  */
  const { records } = await risorse.listResourcePage(
    "users",
    new URLSearchParams(),
    scopeAttaccante(),
  );

  assert.deepEqual(
    records.map((riga) => riga.id),
    [IO],
    "un utente vede se stesso, e nessun altro",
  );
});

test("la scheda di un altro utente non si legge, non si scrive, non si cancella", async () => {
  for (const azione of [
    () => risorse.getResourceById("users", VITTIMA, scopeAttaccante()),
    () =>
      risorse.updateResource(
        "users",
        VITTIMA,
        { password: "Password!Nuova9" },
        scopeAttaccante(),
      ),
    () => risorse.deleteResource("users", VITTIMA, scopeAttaccante()),
  ]) {
    await assert.rejects(azione, negato);
  }

  const vittima = fake.rows("user").find((riga) => riga.id === VITTIMA);
  assert.ok(vittima, "l'utente deve esistere ancora");
  assert.equal(vittima.password_hash, "$2b$VITTIMA", "la password non e stata riscritta");
});

test("un utente non si promuove amministratore della piattaforma", async () => {
  /*
    Il ruolo di piattaforma lo assegna chi gia lo ha, dalle rotte sotto
    `/api/v1/admin`. Da quando `users` e una risorsa personale il registro
    generico non e piu una porta verso gli altri; restava una porta verso il
    **proprio** privilegio, ed era la colonna che il controllo legge.
  */
  await risorse.updateResource(
    "users",
    IO,
    { role: "platform_admin", user_metadata: { role: "platform_admin" } },
    scopeAttaccante(),
  );

  const io = fake.rows("user").find((riga) => riga.id === IO);
  assert.equal(io.role, "user", "il ruolo di piattaforma non si scrive su se stessi");
  assert.equal(
    io.user_metadata?.role,
    undefined,
    "nemmeno passando dalla colonna JSON delle preferenze",
  );
});

test("gli allegati non passano dal registro generico", async () => {
  /*
    `assets` non ha un `organization_id`: il club sta dentro `path`, e dedurlo
    da una convenzione di denominazione per autorizzare un documento di
    identita sarebbe un confine costruito su un nome di file. Dentro ci sono
    carte d'identita e certificati medici, con il contenuto in `data_base64`, e
    la porta era aperta a chiunque avesse un ruolo qualunque in un club
    qualunque. Nessun client la usava.
  */
  assert.equal(
    risorse.isClosedResource("assets"),
    true,
    "gli allegati hanno quattro rotte proprie, ognuna con il suo controllo",
  );
});

/* ============================ 2. il club non attivo, e cosa ne esce === */

test("del club non attivo escono le colonne che servono a sceglierlo", async () => {
  const { records } = await risorse.listResourcePage(
    "clubs",
    new URLSearchParams(),
    scopeAttaccante(),
  );

  const altrui = records.find((riga) => riga.id === ALTRUI);
  assert.ok(altrui, "il club resta elencabile: il selettore di societa serve");
  assert.equal(altrui.name, "Club altrui");

  for (const segreto of [
    "iban",
    "payment_pin",
    "transactions",
    "bank_accounts",
    "sponsors",
    "members",
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(altrui, segreto),
      false,
      `${segreto} vive dentro il club, e si legge solo dal club attivo`,
    );
  }
});

test("chiedere un club per identificativo non aggira il confine", async () => {
  const parametri = new URLSearchParams({ id: ALTRUI });
  const { records } = await risorse.listResourcePage(
    "clubs",
    parametri,
    scopeAttaccante(),
  );

  for (const riga of records) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(riga, "iban"),
      false,
      "l'IBAN di un club non attivo non esce nemmeno chiedendolo per id",
    );
  }
});

test("il PIN del club non esce mai, nemmeno dal club attivo", async () => {
  const scheda = await risorse.getResourceById("clubs", MIO, scopeAttaccante());
  assert.equal(Object.prototype.hasOwnProperty.call(scheda, "payment_pin"), false);
});

/* ============================================ il controllo inverso === */

test("con il club giusto attivo, il proprio club si legge per intero", async () => {
  const scopeLegittimo = {
    userId: IO,
    activeOrganizationId: ALTRUI,
    activeRole: "owner",
    allowedOrganizationIds: [MIO, ALTRUI],
  };

  const scheda = await risorse.getResourceById("clubs", ALTRUI, scopeLegittimo);
  assert.equal(scheda.iban, "IT60X0542811101000000123456");
  assert.ok(Array.isArray(scheda.transactions));
  assert.equal(
    Object.prototype.hasOwnProperty.call(scheda, "payment_pin"),
    false,
    "il PIN resta fuori anche qui: non e un dato che serva a nessuno",
  );
});

test("la propria scheda utente si legge e si corregge", async () => {
  const io = await risorse.getResourceById("users", IO, scopeAttaccante());
  assert.equal(io.email, "io@example.it");
  assert.equal(
    Object.prototype.hasOwnProperty.call(io, "password_hash"),
    false,
    "l'impronta della password non esce mai",
  );

  await risorse.updateResource("users", IO, { first_name: "Corretto" }, scopeAttaccante());
  assert.equal(
    fake.rows("user").find((riga) => riga.id === IO).first_name,
    "Corretto",
  );
});
