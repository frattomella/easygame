import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La verifica dei recapiti, provata dalle rotte vere** (PP-05).
 *
 * Non dai servizi: le revisioni di PP-01 e PP-02 hanno mostrato che un test di
 * servizio puo essere verde mentre la rotta e rotta. Qui si chiamano i `POST`
 * esportati dai quattro handler — invio e conferma, email e telefono — con
 * `Request` veri, e si guarda lo stato HTTP e il corpo che tornano.
 *
 * Il database e il doppio (`fake-prisma`), che sa fare anche l'istruzione SQL
 * grezza del contatore di frequenza. Cio che il doppio **non** rappresenta —
 * atomicita vera sotto concorrenza, unicita, scadenza calcolata da Postgres —
 * sta nella sonda `scripts/pp-05-otp-probe.mjs`, che gira contro il database.
 */

const UTENTE = "22222222-0000-4000-8000-0000000000bb";
const ALTRO = "33333333-0000-4000-8000-0000000000cc";
/*
  **Il riferimento opaco, che e cio che il flusso vero ha in mano** (PP-05,
  M-1 del secondo round della revisione ostile).

  L'UUID di un account non e un segreto: non cambia mai, circola in molte
  proiezioni club-scoped, e usciva in chiaro come `verification.userId` da ogni
  risposta senza sessione. Da PP-05 le quattro rotte accettano l'UUID nudo
  **solo** da chi ha gia una sessione su quell'account — il caso della pagina
  Account — e da chiunque altro pretendono il riferimento, che e un segreto
  lungo e si puo ruotare. Chi arriva da registrazione o login lo riceve nella
  risposta: e questo il valore che i test seguenti mandano.
*/
const RIFERIMENTO = "verify_aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666";
const RIFERIMENTO_ALTRO = "verify_9999888877776666555544443333222211110000ffffeeee";
const GETTONE_SESSIONE = "sessione-di-anna-lunga-e-imprevedibile";
const NUMERO = "+393401234567";
const NUMERO_ALTRUI = "+393479876543";
const INDIRIZZO = "persona@example.invalid";

let inviaTelefono;
let confermaTelefono;
let inviaEmail;
let confermaEmail;
let flussi;
let setPrismaClientForTests;
let smsInviati;
let setSmsProviderForTests;
let emailInviate;
let setEmailProviderForTests;
let fake;

const utente = (over = {}) => ({
  id: UTENTE,
  email: INDIRIZZO,
  first_name: "Anna",
  last_name: "Rossi",
  password_hash: "x",
  phone: NUMERO,
  email_verified_at: null,
  phone_verified_at: null,
  phone_verification_required: true,
  token_verification_id: RIFERIMENTO,
  user_metadata: {},
  role: "user",
  is_club_creator: false,
  /* Il doppio non applica i default dello schema: le date le mette il seme. */
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
  ...over,
});

const seed = () => ({
  user: [
    utente(),
    utente({
      id: ALTRO,
      email: "altro@example.invalid",
      phone: NUMERO_ALTRUI,
      token_verification_id: RIFERIMENTO_ALTRO,
    }),
  ],
  authVerificationChallenge: [],
  /*
    La sessione di Anna. Il doppio non idrata le relazioni di `include`, quindi
    l'utente sta **dentro** la riga: `getSessionFromRequest` chiede
    `include: { user: true }` e trova gia il campo al suo posto.
  */
  session: [
    {
      id: "sessione-anna",
      token: GETTONE_SESSIONE,
      user_id: UTENTE,
      expires_at: new Date(Date.now() + 3600 * 1000),
      user: utente(),
    },
  ],
  authRateLimitBucket: [],
});

/** Una richiesta come la riceve un route handler, con un indirizzo dichiarato. */
const richiesta = (corpo, ip = "203.0.113.7") =>
  new Request("http://easygame.local/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(corpo),
  });

/** La stessa richiesta, ma con il biscotto di sessione di un account. */
const richiestaConSessione = (corpo, gettone = GETTONE_SESSIONE, ip = "203.0.113.7") =>
  new Request("http://easygame.local/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      cookie: `easygame_session=${gettone}`,
    },
    body: JSON.stringify(corpo),
  });

const leggi = async (risposta) => ({
  status: risposta.status,
  body: await risposta.json(),
});

/** Il codice in chiaro dell'ultima challenge viva del canale. */
const codiceCorrente = (channel) => {
  const righe = fake
    .rows("authVerificationChallenge")
    .filter((r) => r.channel === channel && !r.consumed_at);
  const ultima = righe[righe.length - 1];
  if (!ultima) return null;
  /*
    L'impronta e un HMAC: non si inverte. Si prova ogni codice a sei cifre?
    No — si legge il codice dal canale previsto per lo sviluppo, cioe la
    risposta di anteprima, e i test che ne hanno bisogno lo catturano da li.
    Questa funzione serve solo a sapere **quale** riga e viva.
  */
  return ultima;
};

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  process.env.AUTH_ALLOW_TEST_CODES = "true";
  process.env.NODE_ENV = "test";
  process.env.SMS_PROVIDER = "";

  flussi = await import("../../src/lib/server/auth-workflows.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
  ({ __setSmsProviderForTests: setSmsProviderForTests } = await import(
    "../../src/lib/server/sms/sms-service.ts"
  ));
  ({ __setEmailProviderForTests: setEmailProviderForTests } = await import(
    "../../src/lib/server/email/email-service.ts"
  ));

  ({ POST: inviaTelefono } = await import(
    "../../src/app/api/v1/auth/verify/phone/send/route.ts"
  ));
  ({ POST: confermaTelefono } = await import(
    "../../src/app/api/v1/auth/verify/phone/confirm/route.ts"
  ));
  ({ POST: inviaEmail } = await import(
    "../../src/app/api/v1/auth/verify/email/send/route.ts"
  ));
  ({ POST: confermaEmail } = await import(
    "../../src/app/api/v1/auth/verify/email/confirm/route.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);

  /*
    **Il provider fittizio dei test: registra, non spedisce.** Nessun byte
    lascia la macchina, e si puo affermare «questo numero ha ricevuto questo
    testo», che e la sola cosa che serve provare.
  */
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

/** Sposta indietro la nascita della challenge, per scavalcare il cooldown. */
const invecchiaChallenge = (secondi = 120) => {
  for (const riga of fake.rows("authVerificationChallenge")) {
    riga.created_at = new Date(riga.created_at.getTime() - secondi * 1000);
  }
};

test("l'invio del codice al telefono lo consegna al numero, in E.164", async () => {
  const esito = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));

  assert.equal(esito.status, 200);
  assert.equal(esito.body.data.sent, true);
  assert.equal(smsInviati.length, 1);
  assert.equal(smsInviati[0].to, NUMERO);
  assert.match(smsInviati[0].text, /EasyGame/);
  assert.match(smsInviati[0].text, /\d{6}/, "il testo porta un codice a sei cifre");

  /* E in archivio vive l'impronta, non il codice. */
  const riga = codiceCorrente("phone");
  assert.equal(riga.target, NUMERO);
  const codice = esito.body.data.previewCode;
  assert.ok(codice, "in sviluppo il codice torna nella risposta di anteprima");
  assert.notEqual(riga.code_hash, codice);
  assert.ok(!JSON.stringify(riga).includes(codice), "il codice non e in nessuna colonna");
});

test("il codice giusto verifica, e riusato la seconda volta non vale piu (replay)", async () => {
  const invio = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  const codice = invio.body.data.previewCode;

  const prima = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: codice })),
  );
  assert.equal(prima.status, 200);
  assert.ok(fake.rows("user")[0].phone_verified_at, "il numero risulta verificato");

  const replay = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: codice })),
  );
  assert.equal(replay.status, 400, "lo stesso codice non si spende due volte");
  assert.match(replay.body.error.message, /non valido o scaduto/i);
});

test("un codice sbagliato non verifica, e al quinto tentativo la challenge e carta straccia", async () => {
  const invio = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  const codice = invio.body.data.previewCode;
  const sbagliato = codice === "000000" ? "111111" : "000000";

  for (let i = 0; i < 5; i += 1) {
    const esito = await leggi(
      await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: sbagliato })),
    );
    assert.equal(esito.status, 400, `tentativo ${i + 1}`);
  }

  assert.equal(codiceCorrente("phone").attempts, 5);
  assert.equal(
    fake.rows("user")[0].phone_verified_at,
    null,
    "cinque codici sbagliati non verificano niente",
  );

  /*
    **Il sesto tentativo non arriva nemmeno alla challenge.** Il contatore per
    account (`otpConfirm`, cinque in un quarto d'ora) e il tetto della challenge
    (cinque tentativi) hanno di proposito la stessa soglia: chi ha bruciato i
    cinque tentativi ha anche esaurito il contatore, quindi la risposta e 429 e
    non 400. Le due difese sono comunque distinte, e la ragione e che coprono
    due cose diverse — il contatore sopravvive all'emissione di una challenge
    nuova, il tetto no — ma sul sesto colpo si sovrappongono ed e giusto cosi.
  */
  const dopoIlTetto = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: codice })),
  );
  assert.equal(dopoIlTetto.status, 429);
  assert.equal(dopoIlTetto.body.error.code, "RATE_LIMITED");
  assert.equal(fake.rows("user")[0].phone_verified_at, null);

  /*
    E da un altro indirizzo IP — cioe scavalcando il contatore per rete — il
    codice giusto **continua a non valere**, perche il tetto vive sulla
    challenge e non sul contatore.
  */
  const daAltraRete = await leggi(
    await confermaTelefono(
      richiesta({ userId: RIFERIMENTO_ALTRO, code: codice }, "198.51.100.42"),
    ),
  );
  assert.equal(daAltraRete.status, 400);
  assert.equal(fake.rows("user")[0].phone_verified_at, null);
});

test("un codice scaduto non verifica", async () => {
  const invio = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  const codice = invio.body.data.previewCode;

  for (const riga of fake.rows("authVerificationChallenge")) {
    riga.expires_at = new Date(Date.now() - 1000);
  }

  const esito = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: codice })),
  );
  assert.equal(esito.status, 400);
  assert.equal(fake.rows("user")[0].phone_verified_at, null);
});

test("il reinvio ravvicinato non invalida il codice gia in mano (cooldown)", async () => {
  const primo = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  const codice = primo.body.data.previewCode;

  const secondo = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  assert.equal(secondo.status, 429);
  assert.equal(secondo.body.error.code, "RESEND_TOO_SOON");
  assert.equal(smsInviati.length, 1, "il secondo invio non e partito");

  /*
    **E il codice del primo invio funziona ancora.** E il punto: prima ogni
    reinvio consumava il precedente, quindi due clic sul pulsante rendevano
    inutile il codice appena arrivato — e chi conosceva un identificativo poteva
    tenere un account inverificabile a colpi di reinvio.
  */
  const conferma = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: codice })),
  );
  assert.equal(conferma.status, 200);
});

test("passato il cooldown il reinvio riparte, e il codice vecchio muore", async () => {
  const primo = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  const vecchio = primo.body.data.previewCode;

  invecchiaChallenge();

  const secondo = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  assert.equal(secondo.status, 200);
  assert.equal(smsInviati.length, 2);

  const conVecchio = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: vecchio })),
  );
  assert.equal(conVecchio.status, 400, "un codice sostituito non vale piu");

  const conNuovo = await leggi(
    await confermaTelefono(
      richiesta({ userId: RIFERIMENTO, code: secondo.body.data.previewCode }),
    ),
  );
  assert.equal(conNuovo.status, 200);
});

/**
 * **Il difetto piu grave che PP-05 chiude.**
 *
 * La challenge non veniva mai confrontata con il destinatario corrente. Si
 * poteva quindi farsi mandare il codice sul proprio numero, cambiare il numero
 * del profilo con quello di un'altra persona, e confermare: `phone_verified_at`
 * finiva valorizzato su un numero che nessuno aveva mai verificato. La regola
 * «cambio numero → nuova verifica» esisteva nella riga che azzerava la colonna
 * e non esisteva in quella che la riscriveva.
 */
test("un codice emesso per un numero non verifica un numero diverso", async () => {
  const invio = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  const codice = invio.body.data.previewCode;
  assert.equal(smsInviati[0].to, NUMERO);

  /* Il numero cambia, come farebbe un PATCH del profilo. */
  fake.rows("user")[0].phone = NUMERO_ALTRUI;
  fake.rows("user")[0].phone_verified_at = null;

  const esito = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: codice })),
  );

  assert.equal(esito.status, 400);
  assert.equal(
    fake.rows("user")[0].phone_verified_at,
    null,
    "il numero di un altro non risulta verificato",
  );
  assert.equal(
    codiceCorrente("phone").attempts,
    0,
    "e non si e nemmeno speso un tentativo: la riga non riguardava questo numero",
  );
});

test("lo stesso vale per l'indirizzo: un codice email non segue il cambio di indirizzo", async () => {
  const invio = await leggi(await inviaEmail(richiesta({ userId: RIFERIMENTO })));
  assert.equal(invio.status, 200);
  const codice = invio.body.data.previewCode;
  assert.ok(codice);

  fake.rows("user")[0].email = "altro-indirizzo@example.invalid";

  const esito = await leggi(
    await confermaEmail(richiesta({ userId: RIFERIMENTO, code: codice })),
  );
  assert.equal(esito.status, 400);
  assert.equal(fake.rows("user")[0].email_verified_at, null);
});

test("l'email si verifica, e la verifica scrive solo la colonna dell'email", async () => {
  const invio = await leggi(await inviaEmail(richiesta({ userId: RIFERIMENTO })));
  const esito = await leggi(
    await confermaEmail(
      richiesta({ userId: RIFERIMENTO, code: invio.body.data.previewCode }),
    ),
  );

  assert.equal(esito.status, 200);
  assert.ok(fake.rows("user")[0].email_verified_at);
  assert.equal(
    fake.rows("user")[0].phone_verified_at,
    null,
    "verificare l'email non verifica il telefono",
  );
});

test("un codice del canale email non vale sul canale telefono", async () => {
  const invio = await leggi(await inviaEmail(richiesta({ userId: RIFERIMENTO })));
  const codiceEmail = invio.body.data.previewCode;

  const esito = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: codiceEmail })),
  );
  assert.equal(esito.status, 400);
  assert.equal(fake.rows("user")[0].phone_verified_at, null);
});

test("il codice di un account non verifica un altro account", async () => {
  const invio = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  const codice = invio.body.data.previewCode;

  const esito = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO_ALTRO, code: codice })),
  );
  assert.equal(esito.status, 400);
  assert.equal(
    fake.rows("user").find((u) => u.id === ALTRO).phone_verified_at,
    null,
  );
});

/**
 * **Anti-enumeration.** Un riferimento sconosciuto, un utente senza numero e un
 * numero gia verificato devono rispondere come un invio riuscito: chi prova
 * identificativi non deve poter distinguere i casi.
 */
test("l'invio non rivela se il riferimento esiste, se ha un numero, se e gia verificato", async () => {
  const sconosciuto = await leggi(
    await inviaTelefono(
      richiesta({ userId: "44444444-0000-4000-8000-0000000000dd" }),
    ),
  );
  assert.equal(sconosciuto.status, 200);
  assert.deepEqual(sconosciuto.body.data, { sent: true, previewCode: null });
  assert.equal(smsInviati.length, 0, "e non parte nessun SMS");

  fake.rows("user")[0].phone = null;
  const senzaNumero = await leggi(
    await inviaTelefono(richiesta({ userId: RIFERIMENTO }, "203.0.113.8")),
  );
  assert.equal(senzaNumero.status, 200);
  assert.deepEqual(senzaNumero.body.data, { sent: true, previewCode: null });

  fake.rows("user")[0].phone = NUMERO;
  fake.rows("user")[0].phone_verified_at = new Date();
  const giaVerificato = await leggi(
    await inviaTelefono(richiesta({ userId: RIFERIMENTO }, "203.0.113.9")),
  );
  assert.equal(giaVerificato.status, 200);
  assert.deepEqual(giaVerificato.body.data, { sent: true, previewCode: null });
  assert.equal(smsInviati.length, 0);
});

test("la conferma non distingue «utente inesistente» da «codice sbagliato»", async () => {
  await inviaTelefono(richiesta({ userId: RIFERIMENTO }));

  const inesistente = await leggi(
    await confermaTelefono(
      richiesta({ userId: "44444444-0000-4000-8000-0000000000dd", code: "123456" }),
    ),
  );
  const sbagliato = await leggi(
    await confermaTelefono(richiesta({ userId: RIFERIMENTO, code: "000000" })),
  );

  assert.equal(inesistente.status, sbagliato.status);
  assert.deepEqual(inesistente.body, sbagliato.body);
});

/**
 * **Il contatore per numero, e non solo per indirizzo IP.**
 *
 * Prima la chiave era `phone:<utente>:<indirizzoIP>`: cambiando rete si
 * ripartiva da zero, e con una manciata di indirizzi si facevano arrivare
 * tutti gli SMS che si volevano al numero di un'altra persona. Qui ogni
 * richiesta arriva da un indirizzo diverso, e il contatore per **numero** la
 * ferma comunque.
 */
test("cambiare rete non azzera il contatore degli invii verso un numero", async () => {
  let bloccato = null;

  for (let i = 0; i < 10 && !bloccato; i += 1) {
    invecchiaChallenge();
    const esito = await leggi(
      await inviaTelefono(richiesta({ userId: RIFERIMENTO }, `198.51.100.${i}`)),
    );
    if (esito.status === 429) bloccato = esito;
  }

  assert.ok(bloccato, "il contatore deve fermare la raffica");
  assert.equal(bloccato.body.error.code, "RATE_LIMITED");
  assert.ok(
    smsInviati.length <= 5,
    `partiti ${smsInviati.length} SMS: il tetto per numero e cinque`,
  );
});

/**
 * **L'invariante «una challenge viva per canale» vive nel database.**
 *
 * Il doppio non ha indici unici, quindi questa proprieta non si puo provare a
 * runtime qui: la misura la sonda contro Postgres (P3). Cio che si puo fare in
 * `npm test` — e che serve — e impedire che la migrazione **sparisca** senza
 * che nessuno se ne accorga: senza quei due indici il cooldown torna a essere
 * una promessa del codice applicativo, e sotto concorrenza tornerebbero a
 * esistere dodici codici validi insieme.
 */
test("la migrazione che rende unica la challenge viva e ancora al suo posto", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const cartelle = readdirSync("prisma/migrations").filter((nome) =>
    nome.includes("pp05_una_challenge_viva_per_canale"),
  );
  assert.equal(cartelle.length, 1, "la migrazione PP-05 deve esistere");

  const sql = readFileSync(
    `prisma/migrations/${cartelle[0]}/migration.sql`,
    "utf8",
  );
  assert.match(sql, /CREATE UNIQUE INDEX[\s\S]*auth_verification_challenges/);
  assert.match(sql, /WHERE "consumed_at" IS NULL AND "purpose" <> 'reset_password'/);
  assert.match(sql, /WHERE "consumed_at" IS NULL AND "purpose" = 'reset_password'/);
});

test("il testo dell'SMS non finisce mai nell'impronta, e l'impronta non e uno SHA nudo del codice", async () => {
  const invio = await leggi(await inviaTelefono(richiesta({ userId: RIFERIMENTO })));
  const codice = invio.body.data.previewCode;
  const riga = codiceCorrente("phone");

  const { createHash } = await import("node:crypto");
  const shaNudo = createHash("sha256").update(codice).digest("hex");

  assert.notEqual(
    riga.code_hash,
    shaNudo,
    "uno SHA-256 nudo di sei cifre si precalcola: serve un pepe fuori dal database",
  );
  assert.equal(
    riga.code_hash,
    flussi.hashOtpCode(codice, {
      userId: UTENTE,
      channel: "phone",
      purpose: "verify_phone",
      /*
        **Il destinatario e parte dell'impronta** (PP-05, CRITICAL del quarto
        round della revisione ostile). Si prende dalla riga perche e li che il
        codice di produzione l'ha scritto: se lo scrivesse il test, questa
        prova direbbe solo che due copie della stessa costante sono uguali.
      */
      target: riga.target,
    }),
  );
});

/**
 * **L'UUID nudo apre le rotte di verifica solo a chi ha gia una sessione**
 * (PP-05, M-1 del secondo round della revisione ostile).
 *
 * Le due strade non sono simmetriche e non devono esserlo:
 *
 * - **con sessione** l'UUID vale, ed e il caso della pagina Account, che manda
 *   `user.id` perche e l'unico identificativo che il client ha di se stesso.
 *   Li non si rivela niente: chi chiama sa gia chi e;
 * - **senza sessione** l'UUID non vale. Prima valeva, e quella strada rendeva
 *   vana la rotazione del riferimento fatta dallo sfratto (ADR-0117):
 *   l'occupante non aveva bisogno del riferimento nuovo, perche l'UUID
 *   dell'account non cambia mai e lo aveva gia.
 * - **con la sessione di un altro** l'UUID non vale, altrimenti bastava un
 *   account qualunque per pilotare le rotte di verifica di chiunque.
 */
test("dalla pagina Account l'UUID vale, perche la sessione c'e", async () => {
  const invio = await leggi(
    await inviaTelefono(richiestaConSessione({ userId: UTENTE })),
  );

  assert.equal(invio.status, 200);
  assert.equal(smsInviati.length, 1, "l'SMS parte davvero");
  assert.equal(smsInviati[0].to, NUMERO);

  const conferma = await leggi(
    await confermaTelefono(
      richiestaConSessione({ userId: UTENTE, code: invio.body.data.previewCode }),
    ),
  );
  assert.equal(conferma.status, 200);
  assert.ok(fake.rows("user")[0].phone_verified_at);
});

test("senza sessione l'UUID nudo non pilota niente, e non si distingue da uno inventato", async () => {
  const conUuid = await leggi(await inviaTelefono(richiesta({ userId: UTENTE })));
  const inventato = await leggi(
    await inviaTelefono(
      richiesta({ userId: "44444444-0000-4000-8000-0000000000dd" }, "203.0.113.8"),
    ),
  );

  assert.equal(conUuid.status, 200, "la risposta resta opaca: non si nega, si tace");
  assert.deepEqual(conUuid.body.data, inventato.body.data);
  assert.equal(smsInviati.length, 0, "e nessun SMS parte verso quel numero");

  /*
    E la conferma nemmeno: prima si emette una challenge **vera** dal
    riferimento, poi si prova a spenderla con l'UUID nudo. Senza il vincolo
    questa riga tornerebbe 200.
  */
  const emessa = await leggi(
    await inviaTelefono(richiesta({ userId: RIFERIMENTO }, "198.51.100.3")),
  );
  const conferma = await leggi(
    await confermaTelefono(
      richiesta({ userId: UTENTE, code: emessa.body.data.previewCode }, "198.51.100.4"),
    ),
  );
  assert.equal(conferma.status, 400);
  assert.equal(fake.rows("user")[0].phone_verified_at, null);
});

test("la sessione di un altro account non apre le rotte di verifica di questo", async () => {
  const emessa = await leggi(
    await inviaTelefono(richiesta({ userId: RIFERIMENTO_ALTRO })),
  );
  assert.equal(smsInviati.length, 1);
  assert.equal(smsInviati[0].to, NUMERO_ALTRUI);

  /* Anna e autenticata, e prova a spendere il codice di un altro account. */
  const conferma = await leggi(
    await confermaTelefono(
      richiestaConSessione({ userId: ALTRO, code: emessa.body.data.previewCode }),
    ),
  );

  assert.equal(conferma.status, 400);
  assert.equal(
    fake.rows("user").find((u) => u.id === ALTRO).phone_verified_at,
    null,
    "una sessione vale per il proprio account e per nessun altro",
  );
});
