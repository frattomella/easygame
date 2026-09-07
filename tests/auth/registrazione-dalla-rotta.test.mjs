import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La registrazione, provata dalla rotta vera** (PP-05, ADR-0132).
 *
 * Fino a qui `POST /api/v1/auth/register` era coperto solo da controlli
 * **statici sul sorgente** (`tests/server/input-validation.test.mjs` legge il
 * file e cerca delle stringhe). E la porta d'ingresso dell'intera lane: la
 * regola di prodotto «email **e** cellulare obbligatori» nasce qui, e qui
 * nascono le due challenge di verifica.
 *
 * Cio che questo file misura, e che nessun controllo statico puo misurare:
 *
 * - il numero si **normalizza** in E.164 e un non-cellulare viene rifiutato;
 * - le due challenge partono davvero, verso il numero e l'indirizzo giusti;
 * - la risposta porta il **riferimento opaco** e non l'UUID, e il numero
 *   **mascherato** (M-1 e MEDIUM-5 della revisione ostile);
 * - il ramo «indirizzo gia occupato» e **indistinguibile** da quello di un
 *   indirizzo libero, che e la ragione per cui quel ramo esiste.
 *
 * Cio che dipende da PostgreSQL — unicita, concorrenza, il contatore per
 * destinatario attraverso reti diverse — sta in
 * `scripts/pp-05-sicurezza-probe.mjs` (S5).
 */

const NUMERO_SCRITTO = "340 123 4567";
const NUMERO_CANONICO = "+393401234567";
const INDIRIZZO = "nuova.persona@example.invalid";
const OCCUPATO = "gia.presente@example.invalid";
const NUMERO_OCCUPATO = "+393479876543";

let registra;
let setPrismaClientForTests;
let setSmsProviderForTests;
let setEmailProviderForTests;
let smsInviati;
let emailInviate;
let fake;

const QUANDO = new Date("2026-01-01T00:00:00.000Z");

const seed = () => ({
  user: [
    {
      id: "11111111-0000-4000-8000-0000000000aa",
      email: OCCUPATO,
      first_name: "Gia",
      last_name: "Presente",
      /* Una password che il test non conosce: il ramo «stesso account» non si apre. */
      password_hash: "$2a$10$impronta.che.non.corrisponde.a.niente.di.noto",
      phone: NUMERO_OCCUPATO,
      email_verified_at: null,
      phone_verified_at: null,
      phone_verification_required: true,
      token_verification_id: "verify_gia_presente_0123456789abcdef",
      user_metadata: {},
      role: "user",
      created_at: QUANDO,
      updated_at: QUANDO,
    },
  ],
  authVerificationChallenge: [],
  session: [],
  authRateLimitBucket: [],
  club: [],
  organizationUser: [],
});

/** Una richiesta come la riceve il route handler, da un indirizzo dichiarato. */
const richiesta = (corpo, ip = "203.0.113.7") =>
  new Request("http://easygame.local/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(corpo),
  });

const leggi = async (risposta) => ({
  status: risposta.status,
  body: await risposta.json(),
});

/**
 * **La forma che manda il client vero** (`auth-shell.tsx`): l'anagrafica sta
 * dentro `options.data`, non in cima. Costruirla a mano in cima farebbe
 * passare il test e non proverebbe niente della rotta: il numero finirebbe in
 * un campo che nessuno legge, e la registrazione risponderebbe «il cellulare e
 * obbligatorio» a un corpo che il cellulare ce l'ha.
 */
const corpoValido = ({ email = INDIRIZZO, phone = NUMERO_SCRITTO, ...over } = {}) => ({
  email,
  password: "PasswordDiProva!2026",
  options: {
    data: {
      firstName: "Anna",
      lastName: "Rossi",
      phone,
      ...over,
    },
  },
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  process.env.AUTH_ALLOW_TEST_CODES = "true";
  process.env.NODE_ENV = "test";
  /* Un trasporto che consegna: senza, la verifica del telefono non si accende. */
  process.env.SMS_PROVIDER = "";

  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
  ({ __setSmsProviderForTests: setSmsProviderForTests } = await import(
    "../../src/lib/server/sms/sms-service.ts"
  ));
  ({ __setEmailProviderForTests: setEmailProviderForTests } = await import(
    "../../src/lib/server/email/email-service.ts"
  ));
  ({ POST: registra } = await import(
    "../../src/app/api/v1/auth/register/route.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);

  smsInviati = [];
  setSmsProviderForTests({
    id: "test",
    async send(message) {
      smsInviati.push(message);
    },
  });

  emailInviate = [];
  setEmailProviderForTests({
    id: "test",
    async verify() {},
    async send(message) {
      emailInviate.push(message);
    },
  });
});

test("email e cellulare insieme creano l'account, e partono le due challenge", async () => {
  const esito = await leggi(await registra(richiesta(corpoValido())));

  assert.equal(esito.status, 202, "la registrazione non apre una sessione");
  assert.equal(esito.body.data.session, null);
  assert.equal(esito.body.data.user, null);

  const creato = fake.rows("user").find((u) => u.email === INDIRIZZO);
  assert.ok(creato, "l'account esiste");
  assert.equal(
    creato.phone,
    NUMERO_CANONICO,
    "il numero e in archivio nella forma canonica, non come lo si e scritto",
  );
  /* Il doppio non applica i default dello schema: qui conta «non valorizzato». */
  assert.ok(!creato.email_verified_at);
  assert.ok(!creato.phone_verified_at);
  assert.notEqual(creato.password_hash, "PasswordDiProva!2026");

  /* Le due challenge partono, ciascuna al proprio destinatario. */
  assert.equal(smsInviati.length, 1);
  assert.equal(smsInviati[0].to, NUMERO_CANONICO);
  assert.match(smsInviati[0].text, /\d{6}/);
  assert.equal(emailInviate.length, 1);
  assert.equal(emailInviate[0].to, INDIRIZZO);

  const challenge = fake.rows("authVerificationChallenge");
  assert.equal(challenge.length, 2, "una per canale");
  assert.deepEqual(
    challenge.map((c) => c.channel).sort(),
    ["email", "phone"],
  );
  assert.deepEqual(
    Array.from(new Set(challenge.map((c) => c.purpose))),
    ["signup"],
    "lo scopo e `signup`: e l'unico, con `login`, che puo poi aprire una sessione",
  );
});

test("la risposta porta il riferimento opaco e il numero mascherato, mai l'UUID e mai il numero intero", async () => {
  const esito = await leggi(await registra(richiesta(corpoValido())));
  const creato = fake.rows("user").find((u) => u.email === INDIRIZZO);
  const verifica = esito.body.data.verification;

  assert.match(
    String(verifica.userId),
    /^verify_[0-9a-f]{32,}$/,
    "il riferimento opaco, non l'UUID: l'UUID non e un segreto e non cambia mai",
  );
  assert.notEqual(verifica.userId, creato.id);
  assert.equal(verifica.userId, creato.token_verification_id);

  assert.notEqual(verifica.phone, NUMERO_CANONICO);
  assert.match(
    verifica.phone,
    /^\+39•+\d{3}$/,
    "il numero esce mascherato: il prefisso e le ultime tre cifre, e nulla in mezzo",
  );
  assert.equal(verifica.email, INDIRIZZO);

  /*
    E nessuna delle due impronte, ne il codice in chiaro, compare fuori dal
    campo di anteprima previsto per lo sviluppo.
  */
  const corpoSerializzato = JSON.stringify(esito.body);
  for (const riga of fake.rows("authVerificationChallenge")) {
    assert.ok(
      !corpoSerializzato.includes(riga.code_hash),
      "l'impronta di una challenge non esce dalla risposta",
    );
  }
  assert.ok(!corpoSerializzato.includes(creato.password_hash));
});

test("un numero che non e un cellulare viene rifiutato, e prima di guardare l'indirizzo", async () => {
  /* Un numero di rete fissa italiano: E.164 valido, cellulare no. */
  const fisso = await leggi(
    await registra(richiesta(corpoValido({ phone: "06 12345678" }))),
  );
  assert.equal(fisso.status, 400);
  assert.equal(fisso.body.error.code, "INVALID_PHONE");
  assert.equal(smsInviati.length, 0);
  assert.equal(
    fake.rows("user").find((u) => u.email === INDIRIZZO),
    undefined,
    "e nessun account nasce",
  );

  /*
    **Il rifiuto arriva prima di sapere se l'indirizzo esista.** Lo stesso
    numero malformato con un indirizzo **occupato** deve rispondere identico:
    altrimenti il campo del telefono diventa un oracolo sugli indirizzi.
  */
  const suOccupato = await leggi(
    await registra(
      richiesta(corpoValido({ phone: "06 12345678", email: OCCUPATO }), "203.0.113.8"),
    ),
  );
  assert.equal(suOccupato.status, fisso.status);
  assert.deepEqual(suOccupato.body, fisso.body);
});

test("un cellulare mancante non passa: e obbligatorio quanto l'email", async () => {
  const senza = await leggi(
    await registra(richiesta(corpoValido({ phone: "" }))),
  );
  assert.equal(senza.status, 400);
  assert.equal(senza.body.error.code, "INVALID_PHONE");
  assert.equal(
    fake.rows("user").length,
    1,
    "in archivio resta il solo account del seme",
  );
});

/**
 * **Anti-enumeration.** Il ramo dell'indirizzo occupato esiste per non
 * rivelare l'occupazione: se si distinguesse, la registrazione diventerebbe il
 * modo piu comodo per sapere chi ha un account su EasyGame.
 */
test("un indirizzo gia occupato risponde come uno libero, e non tocca l'account di nessuno", async () => {
  const libero = await leggi(await registra(richiesta(corpoValido())));
  const occupato = await leggi(
    await registra(
      richiesta(corpoValido({ email: OCCUPATO }), "203.0.113.8"),
    ),
  );

  assert.equal(occupato.status, libero.status);
  assert.deepEqual(Object.keys(occupato.body.data.verification).sort(), [
    ...Object.keys(libero.body.data.verification).sort(),
  ]);
  assert.equal(occupato.body.data.session, null);
  assert.equal(occupato.body.data.user, null);

  /* E il numero dell'altra persona non esce: e la ragione del mascheramento. */
  assert.ok(
    !JSON.stringify(occupato.body).includes(NUMERO_OCCUPATO),
    "il numero di chi occupa l'indirizzo non si legge da qui",
  );

  /* La riga di quella persona resta com'era: nessuna password, nessun recapito. */
  const preesistente = fake.rows("user").find((u) => u.email === OCCUPATO);
  assert.equal(preesistente.phone, NUMERO_OCCUPATO);
  assert.equal(
    preesistente.password_hash,
    "$2a$10$impronta.che.non.corrisponde.a.niente.di.noto",
    "una registrazione con la password sbagliata non riscrive niente",
  );
});
