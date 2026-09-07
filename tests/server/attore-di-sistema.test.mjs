/**
 * **L'attore di sistema: chi e, e cosa non e.**
 *
 * ---
 *
 * ## Perche questo file esiste
 *
 * La correzione del Critical dell'automazione ha introdotto un'autorita nuova:
 * un contesto che scrive eventi quando a chiedere non e nessuno. Un'autorita
 * nuova e la cosa piu pericolosa che si possa aggiungere a un prodotto
 * multi-tenant, e le tre risposte sbagliate erano tutte piu comode di quella
 * giusta: fingere il proprietario, aprire un cancello globale, coniare
 * un'utenza di servizio.
 *
 * Le prove qui misurano che nessuna delle tre sia entrata di soppiatto.
 *
 * ## La divisione del lavoro con la sonda
 *
 * `scripts/critical-automazione-sistema-probe.mjs` misura il **comportamento**
 * contro PostgreSQL: idempotenza, concorrenza, proiezione, audit. Qui si
 * misura la **forma** dell'autorita, che non ha bisogno di un database — e in
 * particolare il legame fra capacita e club, che nella sonda si vede solo di
 * riflesso, attraverso un rifiuto.
 */

import test from "node:test";
import assert from "node:assert/strict";

const attore = await import("../../src/lib/server/system-actor.ts");

const CLUB_A = "11111111-1111-4111-8111-111111111111";
const CLUB_B = "22222222-2222-4222-8222-222222222222";

const contesto = (organizationId = CLUB_A) =>
  attore.createSystemExecutionContext({
    organizationId,
    job: "training-automation",
    capabilities: ["training_automation.generate"],
  });

/* ==================================================================== *
 *  1. Il club e obbligatorio, e fallisce chiuso
 * ==================================================================== */

test("un contesto senza club non si costruisce", () => {
  for (const vuoto of ["", "   ", null, undefined]) {
    assert.throws(
      () =>
        attore.createSystemExecutionContext({
          organizationId: vuoto,
          job: "x",
          capabilities: ["training_automation.generate"],
        }),
      /organizzazione/i,
      `un club «${String(vuoto)}» non deve produrre un contesto`,
    );
  }
});

test("ne uno senza nome del lavoro, ne uno senza capacita", () => {
  assert.throws(
    () =>
      attore.createSystemExecutionContext({
        organizationId: CLUB_A,
        job: "",
        capabilities: ["training_automation.generate"],
      }),
    /lavoro/i,
  );

  /*
    Un contesto senza capacita non puo fare niente, e non fallirebbe: fallirebbe
    ogni cosa che tenta, silenziosamente e altrove. Meglio non nascere.
  */
  assert.throws(
    () =>
      attore.createSystemExecutionContext({
        organizationId: CLUB_A,
        job: "x",
        capabilities: [],
      }),
    /capacita/i,
  );
});

test("una capacita che l'elenco non conosce e un errore, non un contesto muto", () => {
  /*
    Il verso conta: un refuso che producesse un contesto valido-ma-impotente
    darebbe un lavoro che non funziona e non lo dice — la difesa inerte di
    ADR-0147, spostata nel costruttore.
  */
  assert.throws(
    () =>
      attore.createSystemExecutionContext({
        organizationId: CLUB_A,
        job: "x",
        capabilities: ["events.write"],
      }),
    /sconosciuta/i,
  );
});

/* ==================================================================== *
 *  2. Capacita e club sono una domanda sola
 * ==================================================================== */

test("la capacita vale solo sul club per cui il contesto e nato", () => {
  /*
    **La prova diretta del legame cross-club.** Nella sonda si vede di
    riflesso, attraverso un «Accesso negato»; qui si vede in faccia, ed e la
    ragione per cui `systemContextAllows` chiede le due cose insieme invece di
    esporre due funzioni che un chiamante distratto potrebbe usare a meta.
  */
  const ctx = contesto(CLUB_A);

  assert.equal(
    attore.systemContextAllows(ctx, "training_automation.generate", CLUB_A),
    true,
  );
  assert.equal(
    attore.systemContextAllows(ctx, "training_automation.generate", CLUB_B),
    false,
    "un contesto del club A non autorizza niente nel club B",
  );
  assert.equal(
    attore.systemContextAllows(ctx, "training_automation.generate", ""),
    false,
    "e un club vuoto non e un jolly",
  );
});

test("una capacita non dichiarata non e concessa, sullo stesso club", () => {
  const ctx = contesto();

  assert.equal(
    attore.systemContextAllows(ctx, "capacita.inventata", CLUB_A),
    false,
    "«e il sistema» non e una risposta: la capacita si dichiara",
  );
});

/* ==================================================================== *
 *  3. Non e un ruolo, non e un'utenza, non si contraffa
 * ==================================================================== */

test("un oggetto che somiglia a un contesto non passa per uno", () => {
  /*
    Il contesto non arriva mai da una richiesta — vive solo sul server — ma la
    guardia di forma esiste lo stesso: il giorno in cui qualcuno lo passasse
    attraverso un JSON, `capabilities` sarebbe un array e non un `Set`, e
    questa riga e cio che lo distingue.
  */
  const contraffatto = {
    kind: "system",
    organizationId: CLUB_A,
    job: "finto",
    capabilities: ["training_automation.generate"],
  };

  assert.equal(attore.isSystemExecutionContext(contraffatto), false);
  assert.equal(
    attore.systemContextAllows(
      contraffatto,
      "training_automation.generate",
      CLUB_A,
    ),
    false,
  );

  for (const niente of [null, undefined, {}, "system", 42, []]) {
    assert.equal(
      attore.systemContextAllows(niente, "training_automation.generate", CLUB_A),
      false,
    );
  }
});

test("l'attore dell'audit non e un identificativo di utenza", () => {
  /*
    Deve essere riconoscibile a occhio in una riga di audit e non deve poter
    coincidere con una chiave di `users`: nessuno deve poter cercare per attore
    e trovare una persona che non ha fatto niente.
  */
  assert.match(attore.SYSTEM_ACTOR_ROLE, /^system:/);
  assert.doesNotMatch(
    attore.SYSTEM_ACTOR_ROLE,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "un attore di sistema non deve avere la forma di uno UUID",
  );
});

test("il contesto e congelato: non gli si aggiungono capacita dopo", () => {
  const ctx = contesto();

  assert.throws(() => {
    Object.assign(ctx, { organizationId: CLUB_B });
  });

  assert.equal(ctx.organizationId, CLUB_A);
});

/* ==================================================================== *
 *  4. L'elenco delle capacita e chiuso, e resta piccolo
 * ==================================================================== */

test("le capacita dichiarate nominano un'azione, non un dominio", () => {
  /*
    La regola di crescita, misurata invece che scritta in un commento:
    `training_automation.generate` va bene, `events.write` no — sarebbe il
    cancello globale in un'altra grafia. Il vaglio e grezzo di proposito: un
    nome che finisce per `.write`, `.manage` o `.all` e quasi sempre un dominio
    travestito da azione.
  */
  for (const capacita of attore.SYSTEM_CAPABILITIES) {
    assert.match(
      capacita,
      /^[a-z_]+(\.[a-z_]+)+$/,
      `${capacita}: una capacita si scrive «ambito.azione»`,
    );
    assert.doesNotMatch(
      capacita,
      /\.(write|manage|all|admin)$/,
      `${capacita}: nomina un'azione, non un permesso di dominio`,
    );
  }
});
