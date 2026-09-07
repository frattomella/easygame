import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Lo sweep dopo la revoca deve risolvere il ruolo, non leggerlo** (PP-03).
 *
 * `revokeClubAccess` cancella la tessera e poi chiama le quattro funzioni di
 * `profile-account-links.ts` perche nessun riferimento all'utenza sopravviva
 * nel club. Le quattro decidevano confrontando `organization_users.role` con
 * insiemi di stringhe scritti a mano — `["trainer","allenatore","coach"]` e
 * compagnia. Quel confronto ignorava due cose:
 *
 * 1. **Un ruolo personalizzato porta uno slug** (ADR-0102): in colonna c'e
 *    `custom:trainer:preparatori`. Nessun insieme lo conteneva, quindi la
 *    tessera spariva e la scheda restava «Account collegato» a un'utenza senza
 *    piu accesso — lo stato esatto che questo modulo esiste per non lasciare.
 * 2. **Gli alias canonici vivono in un elenco solo**, `access-roles.ts`. Le
 *    copie locali ne avevano perse per strada (`allenatrice`, `tutor`,
 *    `giocatore`, `segreteria`, `amministratore`, `membro`) e ne avevano una
 *    che il dizionario canonico non conosce affatto (`socio`).
 *
 * Registrato da PP-04 come dependency verso PP-03. Misurato anche contro
 * PostgreSQL e il dominio vero: `scripts/pp-03-revoca-sweep-probe.mjs`.
 */

const CLUB = "aaaaaaaa-9d00-4000-8000-00000000000a";
const MISTER = "22222222-9d00-4000-8000-000000000bbb";
const SEGRETERIA = "33333333-9d00-4000-8000-000000000ccc";
const GENITORE = "44444444-9d00-4000-8000-000000000ddd";
const ATLETA_UTENTE = "55555555-9d00-4000-8000-000000000eee";

let collegamenti;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  collegamenti = await import("../../src/lib/server/profile-account-links.ts");
});

const seed = () => ({
  /*
    **Le tessere vanno dichiarate, o «un ruolo estraneo» e una revoca
    completa** (integrazione PP-02 x PP-03).

    `unlinkParentGuardians` non guarda piu **solo** il ruolo della tessera
    revocata: chiude anche quando dopo quella revoca la persona nel club non
    ha piu **nessuna** tessera (ADR-0110). E la correzione di PP-02 per il
    tutore collegato che portava una tessera di ruolo diverso: la tessera
    spariva, l'audit scriveva «revocato», e la riga del tutore restava viva
    con l'utenza addosso.

    Questo seme non dichiarava nessuna `organizationUser`, quindi ogni
    revoca vi era per costruzione una revoca **completa** — e la prova del
    verso opposto misurava una precondizione che non aveva dichiarato.
    GENITORE porta percio una tessera che sopravvive: e cosi che si chiede
    «un ruolo estraneo non tocca niente» senza chiedere anche «e nemmeno una
    revoca completa».
  */
  organizationUser: [
    {
      id: "77777777-9d00-4000-8000-0000000000e1",
      organization_id: CLUB,
      user_id: GENITORE,
      role: "parent",
    },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      trainers: [
        { id: "trainer-1", email: "mister@club.it", linkedUserId: MISTER },
      ],
      staff_members: [
        {
          id: "staff-1",
          email: "segreteria@club.it",
          linkedUserId: SEGRETERIA,
          role: "Segreteria",
        },
      ],
    },
  ],
  clubResourceItem: [
    {
      id: "11111111-9d00-4000-8000-0000000000f1",
      organization_id: CLUB,
      resource_type: "trainers",
      payload: { id: "trainer-1", email: "mister@club.it", linkedUserId: MISTER },
    },
    {
      id: "11111111-9d00-4000-8000-0000000000f2",
      organization_id: CLUB,
      resource_type: "staff_members",
      payload: {
        id: "staff-1",
        email: "segreteria@club.it",
        linkedUserId: SEGRETERIA,
        role: "Segreteria",
      },
    },
  ],
  athlete: [
    {
      id: "66666666-9d00-4000-8000-0000000000a1",
      organization_id: CLUB,
      user_id: ATLETA_UTENTE,
      data: {
        guardians: [{ email: "genitore@club.it", linkedUserId: GENITORE }],
      },
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
});

const tx = () => fake.client;

const schedaAllenatore = () =>
  fake
    .rows("clubResourceItem")
    .find((riga) => riga.resource_type === "trainers").payload.linkedUserId ??
  null;

const schedaStaff = () =>
  fake
    .rows("clubResourceItem")
    .find((riga) => riga.resource_type === "staff_members").payload
    .linkedUserId ?? null;

/* --------------------------------------------------- il ruolo personalizzato */

test("PP-03 · uno slug di ruolo personalizzato slega la scheda allenatore", async () => {
  const ruolo = "custom:trainer:preparatori";

  await collegamenti.unlinkProfileResources(tx(), CLUB, MISTER, null, ruolo);
  assert.equal(
    schedaAllenatore(),
    null,
    "lo slug non e stato riconosciuto come ruolo allenatore",
  );

  await collegamenti.unlinkClubJsonProfiles(tx(), CLUB, MISTER, null, ruolo);
  const club = fake.rows("club")[0];
  assert.equal(
    club.trainers[0].linkedUserId ?? null,
    null,
    "la proiezione JSON e rimasta collegata",
  );
});

test("PP-03 · uno slug gestionale slega la scheda di staff", async () => {
  const ruolo = "custom:staff:segreteria-iscrizioni";

  await collegamenti.unlinkProfileResources(tx(), CLUB, SEGRETERIA, null, ruolo);
  assert.equal(schedaStaff(), null, "lo slug gestionale non e stato riconosciuto");
});

/* ------------------------------------------------------------- gli alias --- */

test("PP-03 · gli alias canonici valgono tutti, non quelli ricordati a mano", async () => {
  for (const alias of ["allenatrice", "coach", "trainer"]) {
    fake = createFakePrisma(seed());
    await collegamenti.unlinkProfileResources(tx(), CLUB, MISTER, null, alias);
    assert.equal(schedaAllenatore(), null, `alias allenatore non riconosciuto: ${alias}`);
  }

  for (const alias of ["amministratore", "membro", "segreteria", "club_manager"]) {
    fake = createFakePrisma(seed());
    await collegamenti.unlinkProfileResources(tx(), CLUB, SEGRETERIA, null, alias);
    assert.equal(schedaStaff(), null, `alias gestionale non riconosciuto: ${alias}`);
  }
});

test("PP-03 · l'alias `tutor` slega il tutore dalla scheda atleta", async () => {
  const toccati = await collegamenti.unlinkParentGuardians(
    tx(),
    CLUB,
    GENITORE,
    null,
    "tutor",
  );

  assert.equal(toccati, 1, "nessuna scheda atleta e stata ripulita");
  assert.equal(
    fake.rows("athlete")[0].data.guardians[0].linkedUserId ?? null,
    null,
  );
});

test("PP-03 · l'alias `giocatore` slega `athletes.user_id`", async () => {
  const toccati = await collegamenti.unlinkDirectAthleteProfile(
    tx(),
    CLUB,
    ATLETA_UTENTE,
    "giocatore",
  );

  assert.equal(toccati, 1);
  assert.equal(fake.rows("athlete")[0].user_id ?? null, null);
});

/* ----------------------------------------------- e cio che non deve muoversi */

test("PP-03 · un ruolo estraneo al profilo non tocca niente", async () => {
  /*
    Il verso opposto conta quanto il primo: allargare il riconoscimento non
    deve trasformare lo sweep in una scopa che passa ovunque. Una tessera da
    genitore non slega la scheda allenatore, e una da atleta non slega quella
    di staff.
  */
  await collegamenti.unlinkProfileResources(tx(), CLUB, MISTER, null, "genitore");
  assert.equal(schedaAllenatore(), MISTER, "la scheda allenatore e stata slegata da un genitore");

  await collegamenti.unlinkProfileResources(tx(), CLUB, SEGRETERIA, null, "atleta");
  assert.equal(schedaStaff(), SEGRETERIA, "la scheda di staff e stata slegata da un atleta");

  const guardiani = await collegamenti.unlinkParentGuardians(
    tx(),
    CLUB,
    GENITORE,
    null,
    "custom:trainer:preparatori",
  );
  assert.equal(guardiani, 0, "un allenatore ha slegato un tutore");

  const atleti = await collegamenti.unlinkDirectAthleteProfile(
    tx(),
    CLUB,
    ATLETA_UTENTE,
    "custom:staff:segreteria",
  );
  assert.equal(atleti, 0, "uno staff ha slegato `athletes.user_id`");
});

test("PP-03 · un ruolo che il dizionario canonico non conosce non slega niente", async () => {
  /*
    `socio` stava nell'insieme locale e non e un alias canonico: era una
    stringa che dava accesso allo sweep senza corrispondere a nessun ruolo. Un
    ruolo sconosciuto ora non passa, che e il verso giusto in cui sbagliare.
  */
  const toccati = await collegamenti.unlinkProfileResources(
    tx(),
    CLUB,
    SEGRETERIA,
    null,
    "socio",
  );

  assert.equal(toccati, 0);
  assert.equal(schedaStaff(), SEGRETERIA);
});
