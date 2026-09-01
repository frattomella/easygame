import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **L'identificativo di richiesta** (Wave 6, §16).
 *
 * Il difetto: due righe di log della **stessa** richiesta non erano
 * correlabili. Chi indagava su un 500 aveva un messaggio e un orario, e su un
 * runtime che serve molte richieste insieme un orario non distingue niente.
 *
 * Qui si prova il giro completo: il middleware ne mette uno, lo propaga in
 * avanti al route handler e indietro al chiamante, e non si fida di quello che
 * arriva da fuori quando e malformato.
 *
 * **E il posto in cui le due letture si tengono insieme.** Il middleware gira
 * sul runtime edge e non puo importare `observability.ts` — che riusa
 * `sanitizeMetadata` da `audit.ts`, che importa Prisma — quindi ha una copia
 * di sei righe della validazione. Questo file verifica che le due concordino:
 * senza, la copia potrebbe divergere in silenzio.
 */

let middleware;
let observability;

const richiesta = (url, headers = {}) => {
  const request = new Request(url, { headers });
  /* `NextRequest` aggiunge `nextUrl` e `cookies`: qui bastano i due campi. */
  return Object.assign(request, {
    nextUrl: new URL(url),
    cookies: {
      get: (name) => (headers.cookie?.includes(`${name}=`) ? { value: "x" } : undefined),
    },
  });
};

before(async () => {
  middleware = await import("../../src/middleware.ts");
  observability = await import("../../src/lib/server/observability.ts");
});

test("una richiesta senza identificativo ne riceve uno", () => {
  const risposta = middleware.middleware(
    richiesta("https://app.example.com/api/v1/athletes"),
  );

  const identificativo = risposta.headers.get("x-request-id");
  assert.ok(identificativo, "manca l'identificativo nella risposta");
  assert.equal(
    observability.isValidRequestId(identificativo),
    true,
    "il middleware genera un identificativo che la sua stessa validazione rifiuterebbe",
  );
});

test("l'identificativo viaggia anche in avanti, verso il route handler", () => {
  const risposta = middleware.middleware(
    richiesta("https://app.example.com/api/v1/athletes"),
  );

  /*
    `NextResponse.next({ request: { headers } })` mette le intestazioni
    inoltrate in `x-middleware-request-*`: e il canale con cui Next le passa al
    route handler, e verificarlo qui e l'unico modo di provare che la
    propagazione **in avanti** esiste davvero.
  */
  const inoltrato = risposta.headers.get("x-middleware-request-x-request-id");
  assert.equal(inoltrato, risposta.headers.get("x-request-id"));
});

test("un identificativo valido che arriva da fuori viene conservato", () => {
  const risposta = middleware.middleware(
    richiesta("https://app.example.com/api/v1/athletes", {
      "x-request-id": "browser-01HZ8Q4K2M",
    }),
  );

  assert.equal(risposta.headers.get("x-request-id"), "browser-01HZ8Q4K2M");
});

test("un identificativo malformato non entra in un'intestazione", () => {
  for (const veleno of ["corto", "a".repeat(200), "ok\r\nX-Injected: 1"]) {
    const risposta = middleware.middleware(
      richiesta("https://app.example.com/api/v1/athletes", {
        /* Le intestazioni con a capo le rifiuta gia `Request`: si passa il resto. */
        "x-request-id": veleno.replace(/[\r\n]/g, " "),
      }),
    );

    const identificativo = risposta.headers.get("x-request-id");
    assert.notEqual(identificativo, veleno);
    assert.equal(observability.isValidRequestId(identificativo), true);
  }
});

test("le API proseguono: mai un redirect al posto di un 401 JSON", () => {
  const risposta = middleware.middleware(
    richiesta("https://app.example.com/api/v1/athletes"),
  );

  assert.notEqual(risposta.status, 307);
  assert.equal(risposta.headers.get("location"), null);
});

test("una pagina protetta senza sessione redirige, e porta l'identificativo", () => {
  const risposta = middleware.middleware(
    richiesta("https://app.example.com/athletes"),
  );

  assert.equal(risposta.status, 307);
  assert.ok(risposta.headers.get("location").includes("/login"));
  assert.ok(observability.isValidRequestId(risposta.headers.get("x-request-id")));
});

/* -------------------------------------------------- l'errore sanificato */

test("un errore dell'ORM non porta nei log cio che si stava scrivendo", () => {
  const errore = new Error(
    "Invalid `prisma.user.create()` invocation:\n\n{\n  data: {\n" +
      "    email: \"mario@example.com\",\n" +
      "    password_hash: \"$2b$10$abcdefghijklmnopqrstuv\"\n  }\n}",
  );

  const ridotto = observability.sanitizeError(errore);

  assert.equal(ridotto.message.includes("password_hash"), false);
  assert.equal(ridotto.message.includes("mario@example.com"), false);
  assert.ok(ridotto.message.startsWith("Invalid `prisma.user.create()`"));
});

test("un messaggio di dominio resta leggibile", () => {
  const ridotto = observability.sanitizeError(
    new Error("Accesso negato: questo atleta non e di questo club"),
  );

  assert.equal(
    ridotto.message,
    "Accesso negato: questo atleta non e di questo club",
  );
});

test("il codice dell'errore passa: e utile e non e di nessuno", () => {
  const errore = Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
  });

  assert.equal(observability.sanitizeError(errore).code, "P2002");
});

test("i metadati passano dal filtro delle chiavi sensibili", (t) => {
  const righe = [];
  const originale = console.error;
  console.error = (...args) => righe.push(args);
  t.after(() => {
    console.error = originale;
  });

  observability.reportServerError(new Error("qualcosa"), {
    requestId: "abcdefgh1234",
    route: "/api/v1/prova",
    metadata: { password: "segreta", slug: "iscrizione-2026" },
  });

  const riga = JSON.parse(righe[0][1]);
  assert.equal(riga.metadata.password, "[rimosso]");
  assert.equal(riga.metadata.slug, "iscrizione-2026");
  assert.equal(riga.requestId, "abcdefgh1234");
});
