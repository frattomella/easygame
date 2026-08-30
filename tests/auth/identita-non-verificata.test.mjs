import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getRequestIp } from "../../src/lib/server/auth-rate-limit.ts";
import { isPlatformAdminSession } from "../../src/lib/server/auth.ts";

/**
 * ===========================================================================
 * Decima tornata — quello che il prodotto accetta come prova di identita
 * ===========================================================================
 *
 * Un audit indipendente ha attaccato l'autenticazione dall'esterno invece di
 * rileggere il codice della Wave. Ha trovato tre cose che il prodotto prendeva
 * per buone senza che nessuno le avesse dimostrate: l'indirizzo dichiarato da
 * un provider OAuth, l'indirizzo IP dichiarato dal client, e il ruolo scritto
 * in colonna quando la regola diceva di guardare l'elenco degli indirizzi.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");

/* ------------------------------------------------------------------ */
/* L'indirizzo IP che il client si sceglie da solo                     */
/* ------------------------------------------------------------------ */

/**
 * **Il difetto.** `X-Forwarded-For.split(",")[0]` e la voce piu a **sinistra**,
 * cioe quella che scrive il client. Cambiandola a ogni richiesta si otteneva
 * un secchiello nuovo ogni volta, e con esso login, registrazione, moduli
 * pubblici e — perche la chiave contiene l'IP — invio e conferma degli OTP,
 * cioe rinvii illimitati verso la casella di qualcun altro.
 *
 * Ogni proxy **accoda** l'indirizzo da cui ha ricevuto: con un solo proxy
 * fidato davanti, l'indirizzo vero e l'ultimo della catena.
 */
test("l'indirizzo falso messo dal client non conta", () => {
  const richiesta = new Request("https://esempio.test/", {
    headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.7" },
  });

  assert.equal(
    getRequestIp(richiesta),
    "203.0.113.7",
    "vale la voce accodata dal proxy, non quella dichiarata da chi bussa",
  );
});

test("due richieste che mentono in modo diverso finiscono nello stesso secchiello", () => {
  const uno = new Request("https://esempio.test/", {
    headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.7" },
  });
  const due = new Request("https://esempio.test/", {
    headers: { "x-forwarded-for": "2.2.2.2, 203.0.113.7" },
  });

  assert.equal(
    getRequestIp(uno),
    getRequestIp(due),
    "cambiare l'intestazione non deve piu regalare un limite nuovo",
  );
});

test("una catena con un solo indirizzo e quell'indirizzo", () => {
  const richiesta = new Request("https://esempio.test/", {
    headers: { "x-forwarded-for": "203.0.113.7" },
  });
  assert.equal(getRequestIp(richiesta), "203.0.113.7");
});

test("senza intestazioni non si inventa un indirizzo", () => {
  assert.equal(
    getRequestIp(new Request("https://esempio.test/")),
    "unknown",
    "e il verso prudente: stringe invece di aprire",
  );
});

test("con due proxy dichiarati si risale di uno", () => {
  const precedente = process.env.AUTH_RATE_LIMIT_TRUSTED_PROXIES;
  process.env.AUTH_RATE_LIMIT_TRUSTED_PROXIES = "2";
  try {
    const richiesta = new Request("https://esempio.test/", {
      headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.7, 10.0.0.1" },
    });
    assert.equal(
      getRequestIp(richiesta),
      "203.0.113.7",
      "chi mette una CDN sopra Vercel deve poterlo dire, altrimenti conta gli indirizzi della CDN",
    );
  } finally {
    if (precedente === undefined) {
      delete process.env.AUTH_RATE_LIMIT_TRUSTED_PROXIES;
    } else {
      process.env.AUTH_RATE_LIMIT_TRUSTED_PROXIES = precedente;
    }
  }
});

/* ------------------------------------------------------------------ */
/* Le due serrature dell'amministratore di piattaforma                 */
/* ------------------------------------------------------------------ */

/**
 * **Il difetto.** La regola dice: con l'elenco di indirizzi configurato conta
 * **solo** l'indirizzo. `isPlatformAdminUser` la rispettava;
 * `isPlatformAdminSession` — che e quella che sorveglia tutto
 * `/api/v1/admin/*` — teneva ancora il ramo alternativo su `users.role`.
 *
 * Non ho trovato una strada con cui un utente si scriva quella colonna da
 * solo, quindi non era sfruttabile: era pero un disegno a due serrature che
 * si contraddicono, e togliere qualcuno dall'elenco non gli toglieva l'API.
 */
const sessioneFinta = (email, role) => ({
  db: { user: { email, role } },
});

test("con l'elenco configurato, il ruolo in colonna non basta piu", () => {
  const precedente = process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
  process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = "capo@esempio.test";
  try {
    assert.equal(
      isPlatformAdminSession(sessioneFinta("capo@esempio.test", "user")),
      true,
      "chi e nell'elenco entra",
    );
    assert.equal(
      isPlatformAdminSession(sessioneFinta("altro@esempio.test", "platform_admin")),
      false,
      "chi non e nell'elenco non entra, per quanto dica la colonna",
    );
  } finally {
    if (precedente === undefined) {
      delete process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
    } else {
      process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = precedente;
    }
  }
});

test("senza sessione non si e amministratori", () => {
  assert.equal(isPlatformAdminSession(null), false);
});

/* ------------------------------------------------------------------ */
/* L'indirizzo che un provider OAuth dichiara                          */
/* ------------------------------------------------------------------ */

/**
 * **Il difetto.** `profile()` calcolava `emailVerified` — Google leggendo il
 * claim, Microsoft scrivendo `true` fisso — e `findOrCreateOAuthUser` non
 * aveva il parametro: era un calcolo morto. Il collegamento a un account
 * esistente avveniva **per solo indirizzo**, e rilasciava il cookie di
 * sessione di quell'account.
 *
 * Con l'endpoint `/common` il tenant Microsoft lo crea chiunque in pochi
 * minuti e ci scrive dentro l'indirizzo che vuole: bastava un giro di login
 * per entrare nell'account di un altro, password e OTP scavalcati.
 *
 * Test statico perche il flusso vive dentro Prisma e una fetch verso il
 * provider. Quello che presidia e esattamente cio che era rotto: che il valore
 * calcolato **arrivi** a chi decide.
 */
test("la callback OAuth passa a valle la verifica dell'indirizzo", () => {
  const sorgente = fs.readFileSync(
    path.join(
      PROJECT_ROOT,
      "src/app/api/v1/auth/oauth/[provider]/callback/route.ts",
    ),
    "utf8",
  );

  assert.match(
    sorgente,
    /emailVerified:\s*profile\.emailVerified/,
    "il claim del provider deve arrivare a findOrCreateOAuthUser, non essere calcolato e buttato",
  );
});

test("un indirizzo non verificato non apre e non crea un account", () => {
  const sorgente = fs.readFileSync(
    path.join(PROJECT_ROOT, "src/lib/server/auth-workflows.ts"),
    "utf8",
  );

  const inizio = sorgente.indexOf("export const findOrCreateOAuthUser");
  assert.notEqual(inizio, -1, "la funzione deve esistere");

  const corpo = sorgente.slice(inizio, sorgente.indexOf("\nexport const", inizio + 1));

  const guardia = corpo.indexOf("if (!emailVerified)");
  const perIndirizzo = corpo.indexOf("prisma.user.findUnique");

  assert.notEqual(guardia, -1, "deve esserci una guardia sull'indirizzo non verificato");
  assert.ok(
    guardia < perIndirizzo,
    "la guardia deve venire prima della ricerca per indirizzo, non dopo",
  );
});

/**
 * Microsoft dichiara l'indirizzo verificato solo quando il deployment fissa il
 * proprio tenant: con `/common` la directory la crea chiunque, e Microsoft
 * stessa documenta che quel claim non va usato per decidere chi sei.
 */
test("con il tenant Microsoft condiviso l'indirizzo non e verificato", () => {
  const sorgente = fs.readFileSync(
    path.join(PROJECT_ROOT, "src/lib/server/auth-workflows.ts"),
    "utf8",
  );

  assert.match(
    sorgente,
    /emailVerified:\s*microsoftTenantIsTrusted\(\)/,
    "Microsoft non deve piu affermare `true` fisso",
  );
  assert.match(
    sorgente,
    /MICROSOFT_SHARED_TENANTS[\s\S]{0,200}common/,
    "`common`, `organizations` e `consumers` sono i tenant condivisi",
  );
});

/* ------------------------------------------------------------------ */
/* La regola sulla password si controlla dopo il token                 */
/* ------------------------------------------------------------------ */

/**
 * **Il difetto.** `confirmPasswordReset` applicava la regola sulla password
 * **prima** di verificare il token, e i suoi messaggi escono verbatim dalla
 * rotta: una password corta rispondeva «deve contenere almeno 12 caratteri»
 * quando quell'`uid` esisteva, e «Link di reset non valido o scaduto» quando
 * non esisteva — senza avere il token in mano.
 */
test("il reset password non dice se un identificativo esiste", () => {
  const sorgente = fs.readFileSync(
    path.join(PROJECT_ROOT, "src/lib/server/auth-workflows.ts"),
    "utf8",
  );

  const inizio = sorgente.indexOf("export const confirmPasswordReset");
  assert.notEqual(inizio, -1);
  const corpo = sorgente.slice(inizio, sorgente.indexOf("\nexport const", inizio + 1));

  const validazione = corpo.indexOf("validatePassword(");
  const confronto = corpo.indexOf("timingSafeEqual(");

  assert.notEqual(validazione, -1);
  assert.notEqual(confronto, -1);
  assert.ok(
    confronto < validazione,
    "prima si dimostra di avere il token, poi si giudica la password",
  );
});

/**
 * **E il ramo che riapriva la porta appena chiusa.**
 *
 * Il ramo «stesso `sub`» non passa dalla guardia sull'indirizzo, e non deve:
 * quell'identita e dimostrata. Ma ristampava `email_verified_at` guardando
 * solo se il provider avesse verificato **qualcosa**, non se avesse verificato
 * **quell'** indirizzo — cioe quello che l'account porta adesso.
 *
 * La strada: si collega il proprio account a Google; si cambia il proprio
 * indirizzo con quello del tutore di un'altra famiglia (il cambio azzera
 * `email_verified_at`, ed e quell'azzeramento a chiudere l'area genitore); si
 * rientra da Google. Stesso `sub`, nessun controllo, e la verifica tornava —
 * su un indirizzo che nessuno ha mai verificato. Da li l'area genitore
 * riconosceva di nuovo il legame per indirizzo.
 */
test("il rientro OAuth non ristampa la verifica su un indirizzo cambiato", () => {
  const sorgente = fs.readFileSync(
    path.join(PROJECT_ROOT, "src/lib/server/auth-workflows.ts"),
    "utf8",
  );

  const inizio = sorgente.indexOf("export const findOrCreateOAuthUser");
  const corpo = sorgente.slice(inizio, sorgente.indexOf("\nexport const", inizio + 1));

  const ramo = corpo.indexOf("existingAccount.user.email_verified_at ||");
  assert.notEqual(ramo, -1, "il ramo del `sub` gia collegato deve esistere");

  const decisione = corpo.slice(ramo, ramo + 220);
  assert.match(
    decisione,
    /sameEmail\(\s*email,\s*existingAccount\.user\.email\s*\)/,
    "si stampa «verificato» solo se il provider ha verificato l'indirizzo che l'account porta adesso",
  );
});

/** Il confronto fra indirizzi normalizza, e non considera uguale il vuoto. */
test("il confronto fra indirizzi ignora maiuscole e spazi, e rifiuta il vuoto", () => {
  const sorgente = fs.readFileSync(
    path.join(PROJECT_ROOT, "src/lib/server/auth-workflows.ts"),
    "utf8",
  );

  const inizio = sorgente.indexOf("const sameEmail =");
  assert.notEqual(inizio, -1);
  const corpo = sorgente.slice(inizio, inizio + 260);

  assert.match(corpo, /toLowerCase\(\)/, "due indirizzi differiscono per maiuscole");
  assert.match(corpo, /trim\(\)/, "e per spazi ai bordi");
  assert.match(
    corpo,
    /!==\s*""/,
    "due indirizzi vuoti non sono lo stesso indirizzo",
  );
});
