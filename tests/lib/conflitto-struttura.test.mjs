/**
 * **Il conflitto di struttura: mezzanotte, giorni adiacenti, e «tutta la
 * struttura»** (P0, D-AUD-12).
 *
 * ---
 *
 * ## Cosa era rotto, e cosa no
 *
 * La **formula** era giusta e lo resta: `inizio < altraFine && altroInizio <
 * fine`, su istanti e non su stringhe di data. Nessun confronto fra date
 * scritte, nessuno slittamento UTC accidentale.
 *
 * Erano rotte le tre cose intorno:
 *
 * 1. **la fine spariva a mezzanotte.** `endsAt > startsAt ? endsAt : null`: un
 *    22:00 → 00:30 perdeva la fine e diventava un evento di un'ora, quindi
 *    occupava il campo per un'ora invece che per due e mezza;
 * 2. **la finestra era lunga un giorno UTC.** Si cercavano candidati solo fra
 *    le 00:00 e le 23:59 del giorno d'inizio: un torneo cominciato la sera
 *    prima e ancora in corso non era mai un candidato;
 * 3. **«tutta la struttura» non collideva con i suoi campi.** Il luogo era un
 *    token concatenato confrontato per uguaglianza, quindi `s1||sede` e
 *    `s1|campo1|sede` erano posti diversi.
 *
 * Le prove sui punti 1 e 3 vivono qui, perche sono del **modello** e non hanno
 * bisogno di un database. Il punto 2 e una query, e la sua prova sta nella
 * sonda contro PostgreSQL.
 */

import test from "node:test";
import assert from "node:assert/strict";

const modello = await import("../../src/lib/events/model.ts");

const istante = (giorno, ora) => new Date(`2026-09-${giorno}T${ora}:00.000Z`);

const evento = ({ id, struttura = "s1", campo = null, sede = "sede1", da, a }) => ({
  id,
  structure_id: struttura,
  field_id: campo,
  site_id: sede,
  starts_at: da,
  ends_at: a,
  status: "scheduled",
  title: id,
});

/* ==================================================================== *
 *  1. La mezzanotte
 * ==================================================================== */

test("un evento che finisce dopo mezzanotte tiene la propria fine", () => {
  const fine = modello.resolveEndsAt(
    istante("10", "22:00"),
    istante("10", "00:30"),
  );

  assert.ok(fine, "prima: la fine si buttava via e l'evento durava un'ora");
  assert.equal(fine.toISOString(), "2026-09-11T00:30:00.000Z");
});

test("ma un refuso di orario resta un refuso", () => {
  /*
    **Il controspecchio, ed e quello che decide la regola.** Senza un limite,
    ogni ora di fine che precede quella d'inizio diventerebbe «la notte dopo»:
    un `18:00 → 17:00` — che e cio che scrive chi sbaglia campo — sarebbe una
    sessione di ventitre ore, e occuperebbe il campo per un giorno intero.
  */
  assert.equal(
    modello.resolveEndsAt(istante("10", "18:00"), istante("10", "17:00")),
    null,
  );
});

test("e una fine uguale all'inizio non e una durata", () => {
  assert.equal(
    modello.resolveEndsAt(istante("10", "18:00"), istante("10", "18:00")),
    null,
  );
});

/* ==================================================================== *
 *  2. I giorni adiacenti
 * ==================================================================== */

test("un evento della sera prima, ancora in corso, e un conflitto", () => {
  const torneo = evento({
    id: "torneo",
    da: istante("10", "20:00"),
    a: istante("11", "02:00"),
  });
  const allenamento = evento({
    id: "allenamento",
    da: istante("11", "01:00"),
    a: istante("11", "02:30"),
  });

  const conflitti = modello.findEventOverlaps(allenamento, [torneo]);

  assert.deepEqual(
    conflitti.map((riga) => riga.id),
    ["torneo"],
    "la formula li vede: era la finestra della query a non consegnarglielo",
  );
});

test("e uno che finisce quando l'altro comincia non lo e", () => {
  /*
    Il confine e stretto: `inizio < altraFine`, non `<=`. Due squadre che si
    danno il cambio alle 20:00 in punto non sono un conflitto, ed e il caso
    piu comune di tutti.
  */
  const primo = evento({
    id: "primo",
    da: istante("10", "18:00"),
    a: istante("10", "20:00"),
  });
  const secondo = evento({
    id: "secondo",
    da: istante("10", "20:00"),
    a: istante("10", "22:00"),
  });

  assert.deepEqual(modello.findEventOverlaps(secondo, [primo]), []);
});

/* ==================================================================== *
 *  3. Tutta la struttura, e i suoi campi
 * ==================================================================== */

test("prenotare tutta la struttura collide con un suo campo", () => {
  const struttura = evento({
    id: "tutta-la-palestra",
    campo: null,
    da: istante("10", "18:00"),
    a: istante("10", "20:00"),
  });
  const campo = evento({
    id: "campo-1",
    campo: "campo1",
    da: istante("10", "19:00"),
    a: istante("10", "21:00"),
  });

  assert.deepEqual(
    modello.findEventOverlaps(campo, [struttura]).map((riga) => riga.id),
    ["tutta-la-palestra"],
    "prima: due token diversi, nessun avviso",
  );

  /* E nell'altro verso, che e quello che si dimentica. */
  assert.deepEqual(
    modello.findEventOverlaps(struttura, [campo]).map((riga) => riga.id),
    ["campo-1"],
  );
});

test("ma due campi diversi della stessa struttura non collidono", () => {
  /*
    **Il controspecchio.** Senza, la correzione passerebbe anche facendo
    collidere tutto con tutto — e una palestra con quattro campi diventerebbe
    inutilizzabile.
  */
  const uno = evento({
    id: "campo-1",
    campo: "campo1",
    da: istante("10", "18:00"),
    a: istante("10", "20:00"),
  });
  const due = evento({
    id: "campo-2",
    campo: "campo2",
    da: istante("10", "18:00"),
    a: istante("10", "20:00"),
  });

  assert.deepEqual(modello.findEventOverlaps(uno, [due]), []);
});

test("e due strutture diverse non collidono mai", () => {
  const qui = evento({
    id: "qui",
    struttura: "s1",
    da: istante("10", "18:00"),
    a: istante("10", "20:00"),
  });
  const altrove = evento({
    id: "altrove",
    struttura: "s2",
    da: istante("10", "18:00"),
    a: istante("10", "20:00"),
  });

  assert.deepEqual(modello.findEventOverlaps(qui, [altrove]), []);
});

/* ==================================================================== *
 *  4. Un evento annullato non occupa niente
 * ==================================================================== */

test("un evento annullato non e un conflitto", () => {
  const annullato = {
    ...evento({
      id: "annullato",
      campo: "campo1",
      da: istante("10", "18:00"),
      a: istante("10", "20:00"),
    }),
    status: "cancelled",
  };
  const nuovo = evento({
    id: "nuovo",
    campo: "campo1",
    da: istante("10", "19:00"),
    a: istante("10", "21:00"),
  });

  assert.deepEqual(modello.findEventOverlaps(nuovo, [annullato]), []);
});

test("e un evento senza posto dichiarato non occupa niente", () => {
  const senzaPosto = {
    id: "senza-posto",
    structure_id: null,
    field_id: null,
    site_id: null,
    starts_at: istante("10", "18:00"),
    ends_at: istante("10", "20:00"),
    status: "scheduled",
  };
  const campo = evento({
    id: "campo-1",
    campo: "campo1",
    da: istante("10", "19:00"),
    a: istante("10", "21:00"),
  });

  assert.deepEqual(modello.findEventOverlaps(senzaPosto, [campo]), []);
});
