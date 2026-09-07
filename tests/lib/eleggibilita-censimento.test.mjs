/**
 * **Il censimento dell'eleggibilita gira nella suite, non solo a mano.**
 *
 * ---
 *
 * ## Perche
 *
 * `scripts/censimento-eleggibilita.mjs` e cio che impedisce alla domanda
 * «quali atleti appartengono a questa categoria?» di tornare ad avere sette
 * risposte (D-INT-2). Un censimento che si esegue solo quando qualcuno se lo
 * ricorda e un censimento che non esiste: e la lezione che questo repository
 * ha gia imparato con `scripts/pp-02-uat.mjs`, che misurava due correzioni di
 * accesso e **non era raccolto dalla discovery** — si potevano revertire
 * entrambe e la suite restava verde.
 *
 * Qui si esegue il processo vero invece di reimplementarne il giudizio: una
 * seconda copia della logica del censimento sarebbe la stessa forma di difetto
 * che il censimento esiste per impedire.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("il censimento dell'eleggibilita e verde: quattro proprieta", () => {
  let uscita = "";
  let codice = 0;

  try {
    uscita = execFileSync(
      process.execPath,
      ["scripts/censimento-eleggibilita.mjs"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
  } catch (errore) {
    uscita = String(errore?.stdout || "") + String(errore?.stderr || "");
    codice = errore?.status ?? 1;
  }

  const rosse = uscita
    .split("\n")
    .filter((riga) => riga.includes("FAIL"))
    .map((riga) => riga.trim());

  assert.deepEqual(
    rosse,
    [],
    `il censimento dell'eleggibilita e rosso:\n${uscita}`,
  );
  assert.equal(codice, 0);
});

test("e le quattro proprieta ci sono tutte: non ne e sparita una in silenzio", () => {
  /*
    **Il controllo che rende load-bearing la prova qui sopra.**

    Un censimento a cui qualcuno togliesse una proprieta resterebbe verde, e
    verde per il motivo peggiore: nessuna prova rossa perche nessuna prova. Il
    conto e esplicito, e cambiarlo e una decisione da scrivere.
  */
  const uscita = execFileSync(
    process.execPath,
    ["scripts/censimento-eleggibilita.mjs"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.match(uscita, /Esito: 4\/4/);

  for (const proprieta of ["E1", "E2", "E2b", "E3"]) {
    assert.ok(
      uscita.includes(`PASS  ${proprieta} `),
      `la proprieta ${proprieta} non compare piu nel censimento`,
    );
  }
});
