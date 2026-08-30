import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il confine multi-tenant, come modulo puro.
 *
 * Le prove end-to-end stanno in `tests/server/active-club-boundary-wide.test.mjs`
 * e in `tests/server/accounting-active-club-boundary.test.mjs`. Qui si presidia
 * la **regola**, perche e una sola e la copiavano in quindici: se questa cede,
 * cedono tutti insieme invece che uno alla volta e in silenzio.
 */

let policy;

before(async () => {
  policy = await import("../../src/lib/auth/active-club-boundary.ts");
});

const CLUB_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLUB_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const multiClub = {
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A, CLUB_B],
};

test("la riga del club attivo passa", () => {
  assert.equal(policy.belongsToActiveClub(multiClub, CLUB_A), true);
  assert.doesNotThrow(() => policy.assertActiveClub(multiClub, CLUB_A));
});

test("la riga di un altro club non passa, benche l'utente vi appartenga", () => {
  /*
    E il difetto, in una riga. `CLUB_B` e nell'elenco dei club dell'utente, e
    il vecchio confine si fermava li. Ma il permesso viene verificato con il
    ruolo del club **attivo**, che e `CLUB_A`: concedere qui significa
    concedere con il ruolo sbagliato.
  */
  assert.equal(policy.belongsToActiveClub(multiClub, CLUB_B), false);
  assert.throws(() => policy.assertActiveClub(multiClub, CLUB_B), /Accesso negato/);
});

test("senza club attivo non si passa, neanche con un elenco pieno", () => {
  const senzaAttivo = { activeOrganizationId: null, allowedOrganizationIds: [CLUB_A] };
  assert.equal(policy.belongsToActiveClub(senzaAttivo, CLUB_A), false);
  assert.throws(() => policy.assertActiveClub(senzaAttivo, CLUB_A), /nessun club attivo/);
});

test("una riga senza club non passa", () => {
  assert.throws(() => policy.assertActiveClub(multiClub, null), /non dichiara un club/);
  assert.throws(() => policy.assertActiveClub(multiClub, "  "), /non dichiara un club/);
});

test("il messaggio non distingue «non esiste» da «non e tuo»", () => {
  /*
    Distinguerli direbbe a chi prova identificativi a caso quali esistono
    davvero. E la stessa ragione per cui una schermata di accesso non dice
    «l'indirizzo non risulta».
  */
  assert.throws(
    () => policy.assertActiveClub(multiClub, CLUB_B, "la fattura"),
    /la fattura non appartiene al club attivo, o non esiste/u,
  );
});

test("ogni rifiuto porta la stringa che il route handler mappa sul 403", () => {
  /*
    CLAUDE.md §8: un errore di autorizzazione **deve** contenere «Accesso
    negato», altrimenti la rotta generica risponde 400 e chi legge il log non
    distingue un confine da un errore di battitura.
  */
  for (const azione of [
    () => policy.assertActiveClub(multiClub, CLUB_B),
    () => policy.assertActiveClub({ activeOrganizationId: null }, CLUB_A),
    () => policy.assertActiveClub(multiClub, null),
    () => policy.resolveActiveClubId(multiClub, CLUB_B),
    () => policy.resolveActiveClubId({ activeOrganizationId: null }),
  ]) {
    assert.throws(azione, /Accesso negato/);
  }
});

/* --------------------------------------------------- il club di lavoro */

test("il club dichiarato dal client deve essere quello attivo", () => {
  assert.equal(policy.resolveActiveClubId(multiClub, CLUB_A), CLUB_A);
  assert.throws(() => policy.resolveActiveClubId(multiClub, CLUB_B), /Accesso negato/);
});

test("senza club dichiarato vale il club attivo", () => {
  assert.equal(policy.resolveActiveClubId(multiClub), CLUB_A);
  assert.equal(policy.resolveActiveClubId(multiClub, ""), CLUB_A);
  assert.equal(policy.resolveActiveClubId(multiClub, null), CLUB_A);
});

test("scope assente o vuoto non concede niente", () => {
  assert.equal(policy.belongsToActiveClub(null, CLUB_A), false);
  assert.equal(policy.belongsToActiveClub(undefined, CLUB_A), false);
  assert.throws(() => policy.assertActiveClub(null, CLUB_A), /Accesso negato/);
});

test("gli spazi attorno a un identificativo non aprono ne chiudono il confine", () => {
  assert.equal(policy.belongsToActiveClub(multiClub, ` ${CLUB_A} `), true);
  assert.equal(
    policy.belongsToActiveClub({ activeOrganizationId: ` ${CLUB_A} ` }, CLUB_A),
    true,
  );
});
