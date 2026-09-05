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
  activeRole: "owner",
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

/* ==================== chi amministra la piattaforma, e da dove si sa === */

/*
  **Il privilegio che si concedeva da se.**

  `isPlatformAdminUser` leggeva il ruolo da tre posti, e il **primo** era
  `user_metadata.role` — una colonna JSON che l'utente stesso scrive da
  `PATCH /api/v1/auth/user`, che accettava qualunque chiave. Da un account
  qualunque — un genitore, un atleta, uno appena registrato e senza club —
  bastava mandare `{"user_metadata":{"role":"platform_admin"}}` per essere
  amministratore della piattaforma alla richiesta successiva: dati di pagamento
  di ogni societa, piani e abbonamenti scrivibili, profilo fiscale e conto
  Stripe di qualunque club — comprese due delle cinque rotte a cui questa
  stessa Wave aveva appena aggiunto il controllo di ruolo, perche
  l'amministratore le scavalca entrambe.

  E la seconda meta: con l'elenco di indirizzi **configurato**, l'ultima riga
  concedeva comunque sul solo ruolo. L'elenco non era una condizione, era un
  ramo alternativo.
*/

test("il ruolo scritto dall'utente su se stesso non concede niente", async () => {
  const originale = process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
  process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = "";
  try {
    const { isPlatformAdminUser } = await import("../../src/lib/platform-admin.ts");

    assert.equal(
      isPlatformAdminUser({
        email: "chiunque@example.it",
        user_metadata: { role: "platform_admin" },
      }),
      false,
      "e un dato che il suo soggetto scrive: un privilegio che si concede da se non e un privilegio",
    );

    assert.equal(
      isPlatformAdminUser({
        email: "chiunque@example.it",
        app_metadata: { role: "platform_admin" },
      }),
      false,
    );
  } finally {
    if (originale === undefined) delete process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
    else process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = originale;
  }
});

test("con l'elenco configurato vale l'indirizzo, e nient'altro", async () => {
  const originale = process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
  process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = "capo@easygame.it";
  try {
    const { isPlatformAdminUser } = await import("../../src/lib/platform-admin.ts");

    assert.equal(
      isPlatformAdminUser({
        email: "capo@easygame.it",
        email_verified_at: new Date(),
      }),
      true,
    );
    assert.equal(
      isPlatformAdminUser({ email: "chiunque@example.it", role: "platform_admin" }),
      false,
      "l'elenco e la condizione, non un ramo alternativo",
    );

    /*
      **E l'indirizzo dev'essere provato** (PP-05, H-1 del secondo round).

      Prima di PP-05 questa riga era sicura per una ragione che non stava qui:
      un indirizzo non verificato non produceva **nessuna sessione**, quindi
      non poteva valere come identita da nessuna parte. ADR-0115 ha tolto quel
      cancello, e l'elenco degli indirizzi vive in una variabile
      `NEXT_PUBLIC_*`, cioe e pubblicato a ogni browser: chi registrasse un
      indirizzo di quell'elenco non ancora presente in `users` sarebbe stato
      amministratore di piattaforma alla richiesta successiva.
    */
    assert.equal(
      isPlatformAdminUser({ email: "capo@easygame.it" }),
      false,
      "un indirizzo mai verificato non concede la piattaforma",
    );
    assert.equal(
      isPlatformAdminUser({
        email: "capo@easygame.it",
        user_metadata: { emailVerified: true },
      }),
      true,
      "vale anche la forma serializzata, che e quella che vede il client: li `emailVerified` lo scrive `buildUserMetadata` dalla colonna",
    );

    /*
      **E le due forme non sono equivalenti** (PP-05, CRITICAL del terzo round).

      La stesura precedente accettava le due sorgenti in `OR`, e quell'`OR`
      riapriva per intero il difetto che questa funzione era stata scritta per
      chiudere: `user_metadata` e una colonna JSON **libera, scritta dal suo
      stesso soggetto**, quindi bastava un `PATCH /auth/user` con
      `{"data":{"emailVerified":true}}` — che non cambia nessun fattore, e non
      passa nemmeno dal cancello della password attuale — per farsi la prova da
      soli.

      Chi porta la **colonna** viene giudicato su quella e su nient'altro. Solo
      chi non ce l'ha — cioe chi non puo averla, perche la colonna non
      attraversa la serializzazione — ricade sulla proiezione, che a quel punto
      l'ha scritta il server.
    */
    assert.equal(
      isPlatformAdminUser({
        email: "capo@easygame.it",
        email_verified_at: null,
        user_metadata: { emailVerified: true },
      }),
      false,
      "con la colonna presente e vuota, un campo che il soggetto si scrive addosso non e una prova",
    );
  } finally {
    if (originale === undefined) delete process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
    else process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = originale;
  }
});

/**
 * **Le proiezioni calcolate non si scrivono** (PP-05, CRITICAL del terzo round).
 *
 * `buildUserMetadata` **ricalcola** `emailVerified`, `phoneVerified`,
 * `phoneVerificationRequired`, `role` e `isClubCreator` da colonne vere a ogni
 * serializzazione. Persisterli nella colonna JSON non cambia quindi cio che il
 * browser legge — viene sovrascritto — e cambia solo cio che leggono i
 * chiamanti **lato server**, che hanno in mano la riga grezza. Una scrittura
 * senza effetto visibile e con un effetto invisibile e la forma peggiore che
 * possa avere: era la strada con cui un indirizzo dell'elenco degli
 * amministratori, **mai verificato**, si concedeva la piattaforma.
 *
 * La blocklist e la seconda di due difese indipendenti; la prima e in
 * `platform-admin.ts`, e la sonda `pp-05-sicurezza-probe.mjs` (S10) misura che
 * ciascuna delle due, da sola, chiude la catena.
 */
test("PATCH /auth/user non lascia scrivere le proiezioni che il server calcola", async () => {
  const { readFileSync } = await import("node:fs");
  const sorgente = readFileSync("src/app/api/v1/auth/user/route.ts", "utf8");

  const blocco = sorgente.slice(
    sorgente.indexOf("const CHIAVI_NON_SCRIVIBILI"),
    sorgente.indexOf("const metadataGrezzo"),
  );
  assert.ok(blocco, "la lista deve esistere");

  for (const chiave of [
    "role",
    "app_metadata",
    "is_platform_admin",
    "emailVerified",
    "phoneVerified",
    "phoneVerificationRequired",
    "isClubCreator",
  ]) {
    assert.match(
      blocco,
      new RegExp(`"${chiave}"`),
      `\`${chiave}\` e una proiezione o un privilegio: il suo soggetto non la scrive`,
    );
  }

  /*
    E la lista si **applica**: senza il filtro, tenerla aggiornata non
    servirebbe a niente.
  */
  assert.match(
    sorgente,
    /CHIAVI_NON_SCRIVIBILI\.includes\(chiave\)/,
    "la lista dev'essere quella su cui il filtro decide",
  );
});

/**
 * Il contrappunto della prova precedente: le chiavi che **non** sono
 * proiezioni restano scrivibili, perche `user_metadata` e il posto dove una
 * persona tiene le sue preferenze e va bene che lo sia. Una blocklist che
 * cresce senza un criterio finisce per bloccare tutto.
 */
test("le preferenze di una persona restano scrivibili: la lista non e un divieto generale", async () => {
  const { readFileSync } = await import("node:fs");
  const sorgente = readFileSync("src/app/api/v1/auth/user/route.ts", "utf8");
  const blocco = sorgente.slice(
    sorgente.indexOf("const CHIAVI_NON_SCRIVIBILI"),
    sorgente.indexOf("const metadataGrezzo"),
  );

  for (const chiave of ["firstName", "lastName", "phone", "name"]) {
    assert.ok(
      !new RegExp(`"${chiave}"`).test(blocco),
      `\`${chiave}\` e un dato della persona, non una proiezione: deve restare scrivibile`,
    );
  }
});
