import assert from "node:assert/strict";
import test, { afterEach, before, beforeEach } from "node:test";

/**
 * Regressione WP-31 — richieste duplicate dell'adapter.
 *
 * `src/lib/supabase.ts` costruiva uno *snapshot* dell'intera tabella a ogni
 * `select`, anche quando non c'era nessuna relazione da idratare, e lo faceva
 * **senza filtri**. Ogni lettura dell'applicazione costava quindi due
 * richieste, la seconda potenzialmente enorme.
 */

let supabase;
let fetchOriginale;
let richieste;

const rispostaVuota = () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({ data: [], error: null }),
});

before(async () => {
  ({ supabase } = await import("../../src/lib/supabase.ts"));
});

beforeEach(() => {
  richieste = [];
  fetchOriginale = globalThis.fetch;
  globalThis.fetch = async (path) => {
    richieste.push(String(path));
    return rispostaVuota();
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
});

test("una select senza relazioni fa una sola richiesta", async () => {
  await supabase.from("simplified_athletes").select("*").eq("club_id", "club-1");

  assert.deepEqual(richieste, ["/api/v1/simplified_athletes?club_id=club-1"]);
});

test("la richiesta porta i filtri, non e mai una lettura dell'intera tabella", async () => {
  await supabase
    .from("categories")
    .select("*")
    .eq("club_id", "club-1")
    .order("created_at", { ascending: true });

  assert.equal(richieste.length, 1);
  assert.ok(
    richieste[0].includes("club_id=club-1"),
    `richiesta senza filtro: ${richieste[0]}`,
  );
});

test("una select con proiezione di colonne resta una sola richiesta", async () => {
  await supabase
    .from("clubs")
    .select("trainers, weekly_schedule, settings")
    .eq("id", "club-1")
    .single();

  assert.deepEqual(richieste, ["/api/v1/clubs?id=club-1"]);
});

test("le relazioni richieste vengono comunque caricate", async () => {
  globalThis.fetch = async (path) => {
    richieste.push(String(path));
    const isOrganizations = String(path).startsWith("/api/v1/organizations");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: isOrganizations
          ? [{ id: "club-1", name: "Club A" }]
          : [{ id: "membership-1", organization_id: "club-1" }],
        error: null,
      }),
    };
  };

  const { data } = await supabase
    .from("organization_users")
    .select("id, organizations(name)")
    .eq("organization_id", "club-1");

  assert.equal(richieste.length, 2, `richieste: ${richieste.join(", ")}`);
  assert.ok(
    richieste.some((path) => path.startsWith("/api/v1/organization_users")),
    "manca la lettura della tabella di partenza",
  );
  assert.ok(
    richieste.some((path) => path.startsWith("/api/v1/organizations")),
    "manca la lettura della relazione",
  );
  assert.equal(data[0].organizations.name, "Club A");
});
