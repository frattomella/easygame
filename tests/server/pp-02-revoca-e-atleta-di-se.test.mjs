import assert from "node:assert/strict";
import test, { before } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

let canParentAccessAthlete;
let clearLinkedFields;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ({ canParentAccessAthlete } = await import(
    "../../src/lib/server/parent-dashboard.ts"
  ));
  ({ clearLinkedFields } = await import(
    "../../src/lib/server/profile-account-links.ts"
  ));
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/**
 * **Le due proprieta piu gravi del pacchetto, dentro `npm test`.**
 *
 * Il settimo round ha chiuso due difetti di accesso — «Scollega account» che
 * non revocava, e un atleta che era tutore di se stesso — e le loro prove
 * vivevano **solo** in `scripts/pp-02-uat.mjs`, che gira contro un database
 * vero e **non e raccolto dalla discovery**: non e un `*.test.mjs` e non sta in
 * `package.json`. L'ottavo round lo ha misurato in una riga:
 *
 *     grep -rn "accessRevokedAt|includeSelf" tests/  →  0
 *
 * Cioe: si potevano revertire entrambe le correzioni e la suite restava verde.
 * CLAUDE.md §4 chiede che ogni commit che tocca accesso ai dati porti un test,
 * e quelle due righe erano il commit che ne aveva piu bisogno.
 *
 * Le sonde contro PostgreSQL restano — provano la **strada**, dalla rotta —
 * ma la rete di sicurezza che gira a ogni commit deve conoscere queste due
 * proprieta.
 */

const CLUB = "11111111-0000-4000-8000-000000000001";
const ANNA = "22222222-0000-4000-8000-000000000002";
const RAGAZZO = "33333333-0000-4000-8000-000000000003";
const FIGLIO = "44444444-0000-4000-8000-000000000004";

const EMAIL_ANNA = "anna@famiglia.invalid";

const seme = (guardiano) => ({
  user: [
    { id: ANNA, email: EMAIL_ANNA, email_verified_at: new Date() },
    {
      id: RAGAZZO,
      email: "ragazzo@famiglia.invalid",
      email_verified_at: new Date(),
    },
  ],
  club: [{ id: CLUB, name: "ASD Prova" }],
  organizationUser: [
    { id: "m1", organization_id: CLUB, user_id: ANNA, role: "parent" },
    { id: "m2", organization_id: CLUB, user_id: RAGAZZO, role: "athlete" },
  ],
  athlete: [
    {
      id: FIGLIO,
      organization_id: CLUB,
      first_name: "Elia",
      last_name: "Prova",
      status: "active",
      user_id: RAGAZZO,
      data: { guardians: [guardiano] },
    },
  ],
});

const conSeme = (guardiano) => {
  const fake = createFakePrisma(seme(guardiano));
  setPrismaClientForTests(fake.client);
  return fake;
};

/* ------------------------------------------------- la revoca che revoca */

test("l'indirizzo di contatto, da solo, e un legame", async () => {
  /*
    E la decisione ADR-0114: la segreteria scrive l'indirizzo, la famiglia si
    registra con quello, e dentro un club dove ha gia una tessera il legame
    vale. Questa prova esiste per il verso opposto — perche la correzione della
    revoca **non deve** capovolgerla.
  */
  conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA });

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), true);
});

test("dopo la revoca l'indirizzo di contatto non basta piu", async () => {
  /*
    Il difetto: `clearLinkedFields` azzera gli identificativi e **non**
    l'indirizzo di contatto, che al club serve per scrivere alla persona. Il
    vaglio dell'accesso quell'indirizzo lo accettava, quindi «Scollega account»
    rispondeva 200, la scheda diceva «Account non collegato», e chi era stato
    scollegato continuava a leggere calendario, rate, ricevute, documenti e i
    byte del certificato medico del minore.
  */
  const { next } = clearLinkedFields(
    { id: "t1", name: "Anna", email: EMAIL_ANNA, linkedUserId: ANNA },
    ANNA,
    EMAIL_ANNA,
  );

  assert.equal(next.linkedUserId, null, "l'identificativo si azzera");
  assert.equal(next.email, EMAIL_ANNA, "l'indirizzo resta: al club serve");
  assert.ok(next.accessRevokedAt, "e resta scritto che l'accesso e stato tolto");

  conSeme(next);
  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), false);
});

test("un legame dichiarato vince sul marchio, cosi ci si ricollega", async () => {
  /*
    Un riscatto successivo riscrive `linkedUserId`: il marchio nega il
    **ripiego** sull'indirizzo, non un legame dichiarato. Senza questa regola
    una revoca sarebbe definitiva, e non lo e.
  */
  conSeme({
    id: "t1",
    name: "Anna",
    email: EMAIL_ANNA,
    linkedUserId: ANNA,
    accessRevokedAt: new Date().toISOString(),
  });

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), true);
});

/* --------------------------------------- un atleta non e tutore di se */

test("per le rotte della famiglia un atleta non e tutore di se stesso", async () => {
  /*
    `athleteBelongsToParent` rispondeva vero quando chi chiede **e** l'atleta,
    e da li passava tutta l'area famiglia: recapiti dei tutori — dati di terzi
    — riga `data` grezza, allergie e note mediche, rate, ricevute, fatture; e
    dai documenti i byte del certificato. E poteva revocare il consenso alle
    immagini dato dal genitore.
  */
  conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA, linkedUserId: ANNA });

  assert.equal(await canParentAccessAthlete(RAGAZZO, FIGLIO), false);
});

test("ma chi lo chiede esplicitamente lo ottiene: e l'area del ragazzo", async () => {
  /*
    Due soli posti lo chiedono, e sono quelli che ne hanno diritto: l'area
    atleta, che da questi dati costruisce la propria proiezione ristretta, e
    l'RSVP, dove un sedicenne conferma la propria presenza e il ruolo con cui
    risponde e gia derivato da quel fatto.
  */
  conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA, linkedUserId: ANNA });

  assert.equal(
    await canParentAccessAthlete(RAGAZZO, FIGLIO, { includeSelf: true }),
    true,
  );
});

test("e il tutore vero resta tale in tutti e due i casi", async () => {
  conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA, linkedUserId: ANNA });

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), true);
  assert.equal(
    await canParentAccessAthlete(ANNA, FIGLIO, { includeSelf: true }),
    true,
  );
});

/* ==================================================================== */
/*  La revoca vale per l'identita, non per la riga                       */
/* ==================================================================== */

test("una riga sorella con lo stesso indirizzo non riapre l'accesso", async () => {
  /*
    Il marchio stava sulla **riga**, e l'accesso si concede a un'**identita**.
    Bastava quindi aggiungere una riga nuova con lo stesso indirizzo e un `id`
    diverso — a mano, oppure lasciando che lo facesse il dominio dei moduli,
    che all'approvazione di un'iscrizione in cui la persona si dichiara tutore
    fa `guardians.push(...)` di un oggetto nuovo.

    L'elenco delle identita revocate vive sull'atleta e non ha un `id` da
    cambiare.
  */
  const righe = seme({ id: "t-vecchio", name: "Anna", email: EMAIL_ANNA });
  righe.athlete[0].data = {
    guardians: [
      { id: "t-vecchio", name: "Anna", email: EMAIL_ANNA },
      { id: "t-nuovo", name: "Anna", email: EMAIL_ANNA },
    ],
    revokedGuardianIdentities: [EMAIL_ANNA],
  };
  setPrismaClientForTests(createFakePrisma(righe).client);

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), false);
});

test("un legame dichiarato riapre, perche e cosi che ci si ricollega", async () => {
  const righe = seme({ id: "t", name: "Anna", email: EMAIL_ANNA });
  righe.athlete[0].data = {
    guardians: [{ id: "t", name: "Anna", linkedUserId: ANNA }],
    revokedGuardianIdentities: [],
  };
  setPrismaClientForTests(createFakePrisma(righe).client);

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), true);
});
