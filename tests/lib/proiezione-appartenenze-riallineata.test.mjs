import assert from "node:assert/strict";
import test, { afterEach, before, beforeEach } from "node:test";

/**
 * **La proiezione dice righe che non esistono (D-RD-16, R3).**
 *
 * `updateClubAthlete` salva la scheda **prima** delle righe di
 * `athlete_category_memberships`, e la proiezione `data.categoryMemberships`
 * che scrive porta gli identificativi che il client compone da solo
 * (`<categoria>:membership`). L'archivio poi conia il proprio UUID sulla riga
 * nuova, e la proiezione resta a dire un identificativo che nessuna riga ha.
 *
 * Il censimento D-RD-16 lo misura come `data_cm_entries_not_backed_by_row` e
 * `rows_not_projected`: a 0 dopo la bonifica, a 1 dopo il primo salvataggio
 * di un atleta con una categoria nuova. Il writer deve riallineare la
 * proiezione alle righe come stanno; e non deve riscrivere niente quando
 * dice gia la verita.
 */

const CLUB = "11111111-1111-4111-8111-111111111111";
const ATLETA = "22222222-2222-4222-8222-222222222222";
const PULCINI = "category-1757000000000-pulci";
const ESORDIENTI = "category-1757000000000-esord";
const RIGA_PULCINI = "33333333-3333-4333-8333-333333333333";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let updateClubAthlete;
let fetchOriginale;
let richieste;
let atleta;
let righe;
let coniati;

const risposta = (data) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({ data, error: null }),
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ({ updateClubAthlete } = await import("../../src/lib/simplified-db.ts"));
});

beforeEach(() => {
  richieste = [];
  coniati = 0;
  atleta = {
    id: ATLETA,
    organization_id: CLUB,
    club_id: CLUB,
    first_name: "Gioele",
    last_name: "Prova",
    category_id: PULCINI,
    category_name: "Pulcini",
    data: {
      category: PULCINI,
      categoryName: "Pulcini",
      categoryMemberships: [
        { id: RIGA_PULCINI, organization_id: CLUB, athlete_id: ATLETA, category_id: PULCINI, category_name: "Pulcini", is_primary: true, site_id: null },
      ],
      categories: ["Pulcini"],
    },
  };
  righe = [
    { id: RIGA_PULCINI, organization_id: CLUB, athlete_id: ATLETA, category_id: PULCINI, category_name: "Pulcini", is_primary: true, site_id: null },
  ];

  fetchOriginale = globalThis.fetch;
  globalThis.fetch = async (path, options = {}) => {
    const metodo = String(options.method || "GET").toUpperCase();
    const url = String(path);
    const body = options.body ? JSON.parse(String(options.body)) : null;
    richieste.push({ metodo, url, body });

    if (url.startsWith("/api/v1/clubs")) {
      return risposta([
        { id: CLUB, categories: [{ id: PULCINI, name: "Pulcini" }, { id: ESORDIENTI, name: "Esordienti" }] },
      ]);
    }
    if (url.startsWith("/api/v1/club_resource_items")) return risposta([]);

    if (url.startsWith("/api/v1/athlete_category_memberships")) {
      if (metodo === "GET") return risposta(righe);
      if (metodo === "POST") {
        coniati += 1;
        const riga = { ...body.data, id: `44444444-4444-4444-8444-44444444444${coniati}` };
        righe.push(riga);
        return risposta(riga);
      }
      if (metodo === "PATCH") {
        const id = url.split("/").pop();
        const riga = righe.find((r) => r.id === id);
        Object.assign(riga, body.data);
        return risposta(riga);
      }
      if (metodo === "DELETE") {
        const id = url.split("/").pop();
        righe = righe.filter((r) => r.id !== id);
        return risposta({ id });
      }
    }

    /*
      ADR-0194: l'insieme delle appartenenze lo scrive il server in una
      transazione. Il doppio fa cio che il writer fa per differenza: tiene le
      righe che ci sono, conia le nuove, toglie le assenti, e risponde con le
      righe come stanno.
    */
    if (/\/api\/v1\/athletes\/[^/]+\/memberships$/.test(url) && metodo === "PUT") {
      const volute = Array.isArray(body?.data?.memberships) ? body.data.memberships : [];
      const dopo = volute.map((m) => {
        const corrente = righe.find((r) => r.category_id === m.category_id);
        if (corrente) return { ...corrente, is_primary: Boolean(m.is_primary), site_id: m.site_id || corrente.site_id || null };
        coniati += 1;
        return { id: `44444444-4444-4444-8444-44444444444${coniati}`, organization_id: CLUB, athlete_id: ATLETA, category_id: m.category_id, category_name: m.category_name, is_primary: Boolean(m.is_primary), site_id: m.site_id || null };
      });
      const cambiata = JSON.stringify(dopo) !== JSON.stringify(righe);
      righe = dopo;
      /* Il writer scrive anche la proiezione, e la risponde: il client la riporta sulla scheda. */
      const primaria = righe.find((r) => r.is_primary) || null;
      atleta = {
        ...atleta,
        category_id: primaria?.category_id ?? null,
        category_name: primaria?.category_name ?? null,
        data: { ...atleta.data, category: primaria?.category_id ?? null, categoryName: primaria?.category_name ?? null, categoryMemberships: righe, categories: righe.map((r) => r.category_name) },
      };
      return risposta({ rows: righe, changed: cambiata, athlete: { category_id: atleta.category_id, category_name: atleta.category_name, data: atleta.data } });
    }

    if (url.startsWith("/api/v1/simplified_athletes")) {
      if (metodo === "GET") return risposta([atleta]);
      if (metodo === "PATCH") {
        atleta = { ...atleta, ...body.data };
        return risposta(atleta);
      }
    }
    throw new Error(`richiesta inattesa: ${metodo} ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
});

const patchScheda = () =>
  richieste.filter((r) => r.metodo === "PATCH" && r.url.startsWith("/api/v1/simplified_athletes"));

test("una categoria nuova entra nella proiezione con l'identificativo coniato dall'archivio", async () => {
  const esito = await updateClubAthlete(CLUB, ATLETA, {
    categoryMemberships: [
      { category_id: PULCINI, category_name: "Pulcini", is_primary: true },
      { category_id: ESORDIENTI, category_name: "Esordienti", is_primary: false },
    ],
  });

  const righeInArchivio = righe.map((r) => r.id).sort();
  const proiezione = atleta.data.categoryMemberships.map((e) => e.id).sort();
  assert.deepEqual(proiezione, righeInArchivio, "ogni voce della proiezione e una riga, e ogni riga e in proiezione");
  assert.ok(proiezione.every((id) => UUID.test(id)), "nessun identificativo sintetico nella proiezione");
  assert.equal(patchScheda().length, 1, "una scrittura sola: la proiezione arriva dal writer (ADR-0194), niente riallineamento");

  const ritornate = esito.category_memberships.map((m) => m.id).sort();
  assert.deepEqual(ritornate, righeInArchivio, "e al chiamante tornano le righe vere");
});

test("se la proiezione dice gia la verita non si riscrive", async () => {
  /* Il client rimanda le appartenenze come le ha lette: con l'identificativo della riga. */
  await updateClubAthlete(CLUB, ATLETA, {
    categoryMemberships: [{ id: RIGA_PULCINI, category_id: PULCINI, category_name: "Pulcini", is_primary: true }],
  });
  assert.equal(patchScheda().length, 1, "una scrittura sola");
  assert.deepEqual(atleta.data.categoryMemberships.map((e) => e.id), [RIGA_PULCINI]);
});

test("una riga esistente rimandata senza identificativo torna in proiezione con il suo", async () => {
  await updateClubAthlete(CLUB, ATLETA, {
    categoryMemberships: [{ category_id: PULCINI, category_name: "Pulcini", is_primary: true }],
  });
  assert.deepEqual(atleta.data.categoryMemberships.map((e) => e.id), [RIGA_PULCINI]);
  assert.deepEqual(righe.map((r) => r.id), [RIGA_PULCINI], "la riga non si ricrea");
});

test("un aggiornamento che non parla di appartenenze non tocca ne righe ne proiezione", async () => {
  await updateClubAthlete(CLUB, ATLETA, { jersey_number: "7" });
  assert.equal(patchScheda().length, 1);
  assert.equal(richieste.some((r) => r.metodo !== "GET" && r.url.startsWith("/api/v1/athlete_category_memberships")), false);
  assert.deepEqual(atleta.data.categoryMemberships.map((e) => e.id), [RIGA_PULCINI]);
});
