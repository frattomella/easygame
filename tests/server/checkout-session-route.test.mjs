import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La rotta del checkout, chiamata come la chiama l'interfaccia.**
 *
 * Il difetto che questi test presidiano e stato trovato a runtime su staging,
 * con 1.727 test verdi: premere «Paga online» rispondeva sempre «Club non
 * disponibile». La rotta pretendeva `clubId` nel **corpo** della richiesta;
 * l'unica schermata che apre un checkout —
 * `components/payments/use-athlete-payment-ledger.ts` — non lo manda, e non
 * deve mandarlo: il club attivo viaggia nell'header `x-active-club-id`, come
 * per ogni altra rotta, e lo schema di validazione lo dichiara facoltativo.
 *
 * Nessun test se n'era accorto perche nessuno chiamava la rotta: i test del
 * Blocco D e del Blocco E esercitavano `openGatewayCheckout`, cioe il pezzo
 * **dopo** il controllo che rifiutava. Da qui la forma di questo file: si
 * costruisce una `Request` con lo stesso corpo che costruisce l'hook, e si
 * guarda cosa risponde il route handler vero.
 *
 * Le quattro proprieta:
 *
 * 1. il corpo **senza** `clubId` apre il checkout, se l'header dice il club;
 * 2. senza nemmeno l'header vale il club attivo della sessione;
 * 3. un `clubId` nel corpo continua a **restringere**, e uno fuori portata
 *    resta un 403;
 * 4. la rata comanda sul club: una rata di un'altra societa non si incassa.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA = "cccccccc-0000-4000-8000-000000000003";
const RATA_ALTRUI = "cccccccc-0000-4000-8000-000000000009";
const ATLETA = "dddddddd-0000-4000-8000-000000000004";
const UTENTE = "eeeeeeee-0000-4000-8000-000000000005";
const TOKEN = "token-di-sessione";
const ACCOUNT = "acct_alfa";

let route;
let setPrismaClientForTests;
let fake;
let fetchOriginale;
let chiamate;

before(async () => {
  route = await import(
    "../../src/app/api/payments/create-checkout-session/route.ts"
  );
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/** Un club che l'abbonamento mette in condizione di incassare online. */
const impostazioniClub = () => ({
  entitlements: { overrides: { online_payments: true } },
  /* La preferenza operativa della segreteria: gli incassi online sono accesi. */
  paymentSettings: { enabled: true },
});

const seed = () => ({
  session: [
    {
      id: "sess-1",
      token: TOKEN,
      user_id: UTENTE,
      expires_at: new Date(Date.now() + 3600_000),
      /*
        La fake-prisma non risolve `include`: la relazione si semina gia
        annidata, che e cio che il codice legge.
      */
      user: {
        id: UTENTE,
        email: "gestore@example.invalid",
        role: "club_manager",
        first_name: "Gestore",
        last_name: "Di Prova",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
  ],
  organizationUser: [
    {
      id: "ou-1",
      user_id: UTENTE,
      organization_id: CLUB,
      role: "club_manager",
      is_primary: true,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  club: [
    { id: CLUB, name: "ASD Alfa", settings: impostazioniClub() },
    { id: ALTRO_CLUB, name: "ASD Beta", settings: impostazioniClub() },
  ],
  clubPaymentAccount: [
    {
      id: "cpa-1",
      organization_id: CLUB,
      provider: "stripe",
      external_account_id: ACCOUNT,
      account_type: "standard",
      status: "active",
      charges_enabled: true,
      payouts_enabled: true,
      requirements: [],
      online_payments_enabled: true,
      online_payments_decided_at: new Date("2026-08-01T00:00:00.000Z"),
    },
  ],
  platformCommissionRule: [
    {
      id: "rule-1",
      organization_id: null,
      percent: 1,
      fixed_cents: 0,
      effective_from: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 130,
      status: "pending",
      description: "QA 130",
      due_date: new Date("2026-09-30T00:00:00.000Z"),
      data: {},
    },
    {
      id: RATA_ALTRUI,
      organization_id: ALTRO_CLUB,
      athlete_id: ATLETA,
      amount: 50,
      status: "pending",
      description: "Rata di un'altra societa",
      due_date: new Date("2026-09-30T00:00:00.000Z"),
      data: {},
    },
  ],
});

beforeEach(() => {
  /* Il prefisso non si scrive per esteso: vedi `tests/ui/ci-guardrails.test.mjs`. */
  process.env.STRIPE_SECRET_KEY = `sk_${"test"}_non_e_una_chiave_vera`;

  /*
    L'origine dell'applicazione: gli URL di ritorno devono appartenerle, e
    senza ambiente configurato il checkout non si apre affatto — la stessa
    scelta gia presa per i link di pagamento, dove un ritorno che porta
    altrove e peggio di nessun link.
  */
  process.env.AUTH_BASE_URL = "https://easygame.test";

  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);

  chiamate = [];
  fetchOriginale = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const indirizzo = String(url);
    chiamate.push({
      url: indirizzo,
      headers: options?.headers || {},
      body: Object.fromEntries(new URLSearchParams(String(options?.body || ""))),
    });

    if (indirizzo.includes("/checkout/sessions")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "cs_test_1",
          url: "https://checkout.stripe.test/cs_test_1",
          amount_total: 13000,
          currency: "eur",
          payment_status: "unpaid",
          status: "open",
        }),
      };
    }

    return { ok: true, status: 200, json: async () => ({}) };
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  delete process.env.STRIPE_SECRET_KEY;
  setPrismaClientForTests(null);
});

/**
 * La richiesta **come la costruisce l'hook**: rata, importo, dove tornare.
 * Il club sta nell'header, non nel corpo.
 */
const richiesta = ({ body = {}, clubHeader = CLUB } = {}) => {
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${TOKEN}`,
  });
  if (clubHeader) headers.set("x-active-club-id", clubHeader);

  return new Request("https://easygame.test/api/payments/create-checkout-session", {
    method: "POST",
    headers,
    body: JSON.stringify({
      paymentId: RATA,
      athleteId: ATLETA,
      amountCents: 13000,
      description: "QA 130",
      successUrl: "https://easygame.test/athletes/x?pagamento=verifica",
      cancelUrl: "https://easygame.test/athletes/x?pagamento=annullato",
      ...body,
    }),
  });
};

/* -------------------------------------- 1. il corpo non porta il club */

test("il checkout si apre con il corpo che manda l'interfaccia, senza clubId", async () => {
  const response = await route.POST(richiesta());
  const payload = await response.json();

  assert.equal(
    response.status,
    200,
    `atteso 200, ricevuto ${response.status}: ${JSON.stringify(payload)}`,
  );
  assert.equal(payload.error, null);
  assert.equal(payload.data.checkoutUrl, "https://checkout.stripe.test/cs_test_1");

  /* La commissione e quella della piattaforma, non una mandata dal client. */
  assert.equal(payload.data.platformFeeCents, 130);

  const apertura = chiamate.find((c) => c.url.includes("/checkout/sessions"));
  assert.ok(apertura, "il checkout non e mai stato chiesto al provider");
  assert.equal(
    apertura.headers["Stripe-Account"] || apertura.headers["stripe-account"],
    ACCOUNT,
    "il checkout deve nascere sull'account connesso del club",
  );
});

/* ------------------------------- 2. nemmeno l'header: vale il club attivo */

test("senza header il club e quello attivo della sessione", async () => {
  const response = await route.POST(richiesta({ clubHeader: null }));
  const payload = await response.json();

  assert.equal(
    response.status,
    200,
    `atteso 200, ricevuto ${response.status}: ${JSON.stringify(payload)}`,
  );
  assert.equal(payload.data.checkoutUrl, "https://checkout.stripe.test/cs_test_1");
});

/* --------------------------- 3. un clubId nel corpo restringe, non allarga */

test("un clubId fuori dalla portata della sessione resta un 403", async () => {
  const response = await route.POST(
    richiesta({ body: { clubId: ALTRO_CLUB }, clubHeader: CLUB }),
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.match(payload.error.message, /Accesso negato/);
  assert.equal(
    chiamate.filter((c) => c.url.includes("/checkout/sessions")).length,
    0,
    "nessun checkout deve partire quando il club non e accessibile",
  );
});

/* ------------------------------------------ 4. la rata comanda sul club */

test("una rata di un'altra societa non si incassa sul club attivo", async () => {
  const response = await route.POST(
    richiesta({ body: { paymentId: RATA_ALTRUI } }),
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.match(payload.error.message, /appartiene a un altro club/);
  assert.equal(
    chiamate.filter((c) => c.url.includes("/checkout/sessions")).length,
    0,
    "nessun checkout deve partire su una rata di un'altra societa",
  );
});

/* ------------- 5. il club della sessione e quello su cui si agisce */

/**
 * **Lo scope si risolveva da una parte e il club si sceglieva dall'altra.**
 *
 * Lo scope veniva risolto da `x-active-club-id || clubId` — cioe preferendo
 * l'**intestazione** — e il club su cui agire da `clubId || activeOrganizationId`
 * — cioe preferendo il **corpo**. I due controlli sotto erano poi eseguiti sul
 * valore del corpo, contro se stesso: `allowedOrganizationIds.includes(B)` e
 * vero per chiunque appartenga a B, e non dice niente su quale club la
 * sessione abbia dichiarato attivo.
 *
 * Mandando l'intestazione di A e il corpo di B, il calcolo degli entitlement,
 * la verifica sulla rata e l'apertura del checkout lavoravano tutti su B
 * mentre la sessione parlava di A.
 */
test("intestazione di un club e corpo di un altro: si rifiuta", async () => {
  const response = await route.POST(
    richiesta({ body: { clubId: ALTRO_CLUB }, clubHeader: CLUB }),
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.match(payload.error.message, /Accesso negato/);
  assert.equal(
    chiamate.filter((c) => c.url.includes("/checkout/sessions")).length,
    0,
  );
});

/**
 * E il permesso, che non c'era affatto: un checkout impegna il club con il suo
 * fornitore di pagamenti, e qualunque membro poteva aprirne uno su qualunque
 * rata del club.
 */
test("un genitore non apre un checkout a nome del club", async () => {
  const tessera = fake.rows("organizationUser").find((r) => r.id === "ou-1");
  tessera.role = "parent";

  const response = await route.POST(richiesta());
  const payload = await response.json();

  assert.equal(response.status, 403, JSON.stringify(payload));
  assert.match(payload.error.message, /Accesso negato/);
  assert.equal(
    chiamate.filter((c) => c.url.includes("/checkout/sessions")).length,
    0,
  );
});

/* ------------------------------- gli URL di ritorno stanno in casa */

/**
 * **Il checkout autenticato era un redirector aperto.**
 *
 * `successUrl` e `cancelUrl` erano validati solo come «e un URL»: qualunque
 * host. Chi ha accesso ai pagamenti del club — quattro ruoli su sette,
 * segreteria compresa — poteva aprire un checkout **vero**, per una rata
 * **vera**, con il ritorno su un dominio proprio, e mandare alla famiglia il
 * link Stripe autentico.
 *
 * La famiglia paga su una pagina genuina, con il marchio del suo club, e
 * subito dopo il pagamento riuscito — il momento di massima fiducia — finisce
 * su «carta rifiutata, reinserisci i dati». EasyGame e Stripe fanno da
 * garanti.
 *
 * `payment-links.ts` questo attacco lo aveva gia previsto e lo rifiuta da
 * tempo sulla rotta pubblica. Il gemello autenticato no.
 */
test("un URL di ritorno su un altro dominio si rifiuta", async () => {
  const response = await route.POST(
    richiesta({
      body: { successUrl: "https://easygame-pagamenti.example/conferma" },
    }),
  );

  assert.equal(response.status, 400);
  assert.match(
    (await response.json())?.error?.message || "",
    /devono appartenere a questa applicazione/,
  );
});

test("vale anche per l'URL di annullamento", async () => {
  const response = await route.POST(
    richiesta({ body: { cancelUrl: "https://altrove.example/annullato" } }),
  );

  assert.equal(response.status, 400);
});

/**
 * Senza origine configurata non si apre niente: meglio nessun checkout che un
 * checkout che riporta altrove. E la stessa scelta di `payment-links.ts`.
 */
test("senza origine configurata il checkout non si apre", async () => {
  const precedente = process.env.AUTH_BASE_URL;
  const precedentePubblica = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.AUTH_BASE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;

  try {
    const response = await route.POST(richiesta());
    assert.equal(response.status, 400);
    assert.match(
      (await response.json())?.error?.message || "",
      /Origine dell'applicazione non configurata/,
    );
  } finally {
    if (precedente !== undefined) process.env.AUTH_BASE_URL = precedente;
    if (precedentePubblica !== undefined) {
      process.env.NEXT_PUBLIC_APP_URL = precedentePubblica;
    }
  }
});
