import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La rotta che sceglie le colonne a mano, e percio non conosce il confine.**
 *
 * `GET /api/v1/auth/memberships` sta sul percorso critico di ogni caricamento
 * di pagina, e legge i club con un `select` proprio: non passa da
 * `serializeRecord`, quindi non conosce `CLUB_CAMPI_DI_IDENTITA`. Mandava
 * l'intero `clubs.settings` — piano e stato dell'abbonamento, riferimento
 * della firma, `paymentSettings`, campi fiscali storici — di **ogni** club
 * dell'utente, attivo o no.
 *
 * Contraddiceva l'invariante che il resto della Wave 4 ha costruito: del club
 * non attivo escono le sole colonne che servono a sceglierlo. E il difetto era
 * invisibile ai test del confine, perche questa rotta il confine non lo
 * attraversa.
 *
 * Il client ne legge **una cosa sola**: le stagioni
 * (`AuthProvider.buildActiveClubFromMembership`).
 */

const CLUB = "aaaaaaaa-6666-4000-8000-00000000000a";
const ALTRO = "bbbbbbbb-6666-4000-8000-00000000000b";
const UTENTE = "11111111-6666-4000-8000-000000000aaa";
const TOKEN = "token-memberships";

const stagioni = [
  { id: "2026-27", label: "2026/27", status: "active" },
];

const configurazione = () => ({
  seasons: stagioni,
  subscription: { plan: "plus", status: "active" },
  paymentSettings: { enabled: true, stripeAccountId: "acct_riservato" },
  signature: { reference: "firma-del-presidente" },
  legacyFiscal: { vatNumber: "IT01234567890" },
});

let route;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  route = await import("../../src/app/api/v1/auth/memberships/route.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  session: [
    {
      id: "sess-1",
      token: TOKEN,
      user_id: UTENTE,
      expires_at: new Date(Date.now() + 3600_000),
      user: {
        id: UTENTE,
        email: "gestore@example.invalid",
        role: "club_manager",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
  ],
  user: [{ id: UTENTE, email: "gestore@example.invalid", role: "club_manager" }],
  club: [
    {
      id: CLUB,
      slug: "attivo",
      name: "Club attivo",
      creator_id: UTENTE,
      settings: configurazione(),
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: ALTRO,
      slug: "altro",
      name: "Altro club",
      settings: configurazione(),
      created_at: new Date("2026-01-02T00:00:00.000Z"),
    },
  ],
  organizationUser: [
    {
      id: "ou-1",
      user_id: UTENTE,
      organization_id: CLUB,
      role: "owner",
      is_primary: true,
      organization: {
        id: CLUB,
        name: "Club attivo",
        creator_id: UTENTE,
        settings: configurazione(),
        created_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    {
      id: "ou-2",
      user_id: UTENTE,
      organization_id: ALTRO,
      role: "parent",
      is_primary: false,
      organization: {
        id: ALTRO,
        name: "Altro club",
        settings: configurazione(),
        created_at: new Date("2026-01-02T00:00:00.000Z"),
      },
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const chiedi = () =>
  route.GET(
    new Request("https://easygame.test/api/v1/auth/memberships", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
  );

test("dai club non esce la configurazione, solo le stagioni", async () => {
  const risposta = await chiedi();
  const payload = await risposta.json();
  assert.equal(risposta.status, 200, JSON.stringify(payload));

  const testo = JSON.stringify(payload);
  for (const segreto of [
    "acct_riservato",
    "firma-del-presidente",
    "IT01234567890",
    "subscription",
    "paymentSettings",
  ]) {
    assert.ok(
      !testo.includes(segreto),
      `«${segreto}» non deve uscire da questa rotta`,
    );
  }
});

test("le stagioni escono, perche il client le legge davvero", async () => {
  const risposta = await chiedi();
  const payload = await risposta.json();

  const righe = Array.isArray(payload.data) ? payload.data : [];
  assert.ok(righe.length > 0, "almeno una appartenenza");

  for (const riga of righe) {
    const club = riga.organization || riga.organizations;
    assert.deepEqual(
      club.settings,
      { seasons: stagioni },
      "di `settings` resta la sola parte che l'AuthProvider legge",
    );
  }
});
