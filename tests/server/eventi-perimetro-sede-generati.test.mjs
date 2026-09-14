import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **`listClubEvents` applica il perimetro di sede sulla colonna** (Wave 6
 * §11.3): `where.site_id = { in: sedi }` e un filtro SQL diretto, non un
 * controllo applicativo dopo la lettura — un evento con `site_id` assente
 * non lo soddisfa mai, qualunque sia la sua categoria (pilota Fortitudo
 * Scauri: un Trainer con sedi assegnate, non "tutte", a zero allenamenti
 * generati visibili).
 *
 * Questo file fissa il comportamento **corretto e voluto** di quel filtro
 * (ADR-0103: due assi in AND, una riga senza il valore dell'asse ristretto
 * non passa) — cosi che il vero rimedio resti dove deve stare, sulla
 * scrittura (`training-automation.ts`, vedi
 * `training-automation-gruppo-sede-derivati.test.mjs`), e nessuno sia
 * tentato di "aggiustarlo" allargando qui la lettura.
 */

const CLUB = "aaaaaaaa-5ede-4000-8000-00000000000f";
const GESTORE = "11111111-5ede-4000-8000-000000000eee";

const SITE_A = "site-a";
const SITE_B = "site-b";
const CAT_U15 = "cat-u15";

const EVENTO_SENZA_SEDE = "eeeeeeee-5ede-4000-8000-000000000001";
const EVENTO_SEDE_A = "eeeeeeee-5ede-4000-8000-000000000002";
const EVENTO_SEDE_B = "eeeeeeee-5ede-4000-8000-000000000003";

let eventi;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/** Un ruolo con il perimetro di sede dichiarato in righe di `accessScopes`. */
const scope = (sedi = []) => ({
  userId: GESTORE,
  activeOrganizationId: CLUB,
  activeRole: "club_manager",
  allowedOrganizationIds: [CLUB],
  accessScopes: sedi.map((value) => ({ kind: "site", value })),
});

const evento = (id, siteId) => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: id,
  title: `Evento ${id}`,
  status: "scheduled",
  site_id: siteId,
  category_id: CAT_U15,
  category_name: "Under 15",
  category_ids: [CAT_U15],
  starts_at: new Date("2026-09-16T18:00:00.000Z"),
  ends_at: null,
  version: 1,
  payload: { id },
});

const seed = () => ({
  user: [{ id: GESTORE, email: "gestore@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: CAT_U15, name: "Under 15" }],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
    },
  ],
  clubEvent: [
    evento(EVENTO_SENZA_SEDE, null),
    evento(EVENTO_SEDE_A, SITE_A),
    evento(EVENTO_SEDE_B, SITE_B),
  ],
  athlete: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("ruolo ristretto a una sede vede l'evento di quella sede", async () => {
  const elenco = await eventi.listClubEvents(scope([SITE_A]), {
    kind: "training",
  });

  assert.deepEqual(
    elenco.map((riga) => riga.id).sort(),
    [EVENTO_SEDE_A],
  );
});

test("ruolo ristretto a una sede NON vede l'evento di un'altra sede", async () => {
  const elenco = await eventi.listClubEvents(scope([SITE_A]), {
    kind: "training",
  });

  assert.equal(
    elenco.some((riga) => riga.id === EVENTO_SEDE_B),
    false,
  );
});

test("ruolo ristretto a una sede (parziale, non «tutte») NON vede un evento senza site_id — anche se la categoria e la sua (pilota Fortitudo Scauri)", async () => {
  const elenco = await eventi.listClubEvents(scope([SITE_A]), {
    kind: "training",
  });

  assert.equal(
    elenco.some((riga) => riga.id === EVENTO_SENZA_SEDE),
    false,
    "site_id assente non soddisfa mai `where.site_id = { in: sedi } — la riga va scritta con la sede giusta, non lasciata senza (vedi training-automation-gruppo-sede-derivati.test.mjs)",
  );
});

test("zero righe di perimetro di sede = tutto il club (ADR-0103): l'evento storico senza site_id resta visibile", async () => {
  const elenco = await eventi.listClubEvents(scope(), { kind: "training" });

  assert.deepEqual(
    elenco.map((riga) => riga.id).sort(),
    [EVENTO_SEDE_A, EVENTO_SEDE_B, EVENTO_SENZA_SEDE].sort(),
  );
});
