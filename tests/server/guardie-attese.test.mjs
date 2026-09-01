import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **Una guardia attesa a meta non ferma niente.**
 *
 * Le tre guardie di permesso della Wave 5 — eventi, appuntamenti, fascicolo —
 * sono diventate `async` per una ragione sola: il diniego deve **lasciare una
 * riga** prima di essere lanciato, e una scrittura non attesa su un runtime
 * serverless corre contro la fine della richiesta.
 *
 * Il prezzo di quella scelta e un pericolo preciso e silenzioso: una funzione
 * `async` chiamata senza `await` restituisce una promessa e **non lancia**.
 * L'eccezione arriva dopo, a controllo gia superato, come rifiuto non gestito;
 * la richiesta prosegue come se il permesso ci fosse. Non e un errore di tipo:
 * il compilatore vede un'espressione valida e tace.
 *
 * Questo file rilegge i tre sorgenti e pretende che **ogni** chiamata sia
 * attesa. E un test sul testo, il che di solito e un cattivo segno — ma qui la
 * proprieta da difendere e proprio testuale, e l'alternativa (provare tutte e
 * ventidue le funzioni con tutti i ruoli negati) proverebbe cio che i test di
 * dominio gia provano, e continuerebbe a non accorgersi della chiamata nuova
 * scritta domani senza `await`.
 */

const SORGENTI = [
  {
    file: "src/lib/server/events.ts",
    guardia: "assertEventsPermission",
    attese: 9,
  },
  {
    file: "src/lib/server/appointments.ts",
    guardia: "assertAppointmentsPermission",
    attese: 7,
  },
  {
    file: "src/lib/server/document-requests.ts",
    guardia: "assertRolePermission",
    attese: 6,
  },
  /*
    Le due guardie cliniche del registro generico corrono lo stesso rischio, e
    su un dato sanitario di un minore: sono diventate `async` per scrivere il
    diniego, e una di loro chiamata senza `await` lascerebbe passare la
    scrittura di un certificato.
  */
  {
    file: "src/lib/server/resources.ts",
    guardia: "assertClinicalWrite",
    attese: 3,
  },
  {
    file: "src/lib/server/resources.ts",
    guardia: "assertClinicalRead",
    attese: 2,
  },
];

const leggi = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

for (const { file, guardia, attese } of SORGENTI) {
  test(`ogni chiamata a ${guardia} e attesa`, () => {
    const righe = leggi(file).split("\n");

    const chiamate = righe
      .map((riga, indice) => ({ riga, numero: indice + 1 }))
      .filter(({ riga }) => riga.includes(`${guardia}(`))
      /* La definizione e i riferimenti dentro i commenti non sono chiamate. */
      .filter(({ riga }) => !/^\s*(const|export const)\s/.test(riga))
      .filter(({ riga }) => !/^\s*\*/.test(riga));

    assert.equal(
      chiamate.length,
      attese,
      `${file}: attese ${attese} chiamate a ${guardia}, trovate ${chiamate.length}. Se ne hai aggiunta una, aggiorna questo numero — e verifica che sia attesa.`,
    );

    const senzaAwait = chiamate.filter(
      ({ riga }) => !new RegExp(`await\\s+${guardia}\\(`).test(riga),
    );

    assert.deepEqual(
      senzaAwait.map(({ numero }) => numero),
      [],
      `${file}: queste chiamate a ${guardia} non sono attese, quindi non fermano niente`,
    );
  });
}

test("la guardia dichiara di essere asincrona", () => {
  for (const { file, guardia } of SORGENTI) {
    const sorgente = leggi(file);
    assert.ok(
      new RegExp(`const ${guardia} = async \\(`).test(sorgente),
      `${file}: ${guardia} deve restare async, o il diniego torna a non lasciare traccia`,
    );
  }
});

/**
 * Le due guardie cliniche delegano la scrittura del diniego a
 * `assertClinicalPermission`, che e il loro unico corpo comune: pretendere che
 * ognuna contenga la chiamata direbbe di riscriverla due volte.
 */
const DELEGANO = new Set(["assertClinicalWrite", "assertClinicalRead"]);

test("ogni guardia scrive il diniego prima di lanciarlo", () => {
  for (const { file, guardia } of SORGENTI) {
    if (DELEGANO.has(guardia)) continue;
    const sorgente = leggi(file);
    const corpo = sorgente.slice(
      sorgente.indexOf(`const ${guardia} = async (`),
    );
    const fine = corpo.indexOf("\n};");
    const dichiarazione = corpo.slice(0, fine);

    assert.ok(
      dichiarazione.includes("await recordPermissionDenied("),
      `${file}: ${guardia} rifiuta senza scrivere nessuna riga`,
    );
    assert.ok(
      dichiarazione.indexOf("await recordPermissionDenied(") <
        dichiarazione.indexOf("throw "),
      `${file}: in ${guardia} la riga si scrive **prima** di lanciare`,
    );
  }
});
