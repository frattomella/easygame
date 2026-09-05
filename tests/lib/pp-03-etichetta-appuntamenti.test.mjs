import assert from "node:assert/strict";
import test from "node:test";

import { PERMISSION_CATALOG } from "../../src/lib/permissions/catalog.ts";
import { isManagementAccessRole } from "../../src/lib/access-roles.ts";

/**
 * **Un'etichetta che il server smentisce** (PP-03 §10.2).
 *
 * `appointments.manage` diceva «…e configurare la disponibilita», ed e vero per
 * chi amministra il club. Ma la chiave e concessa anche a `trainer`, e
 * `assertPuoConfigurareLaDisponibilita` gli nega comunque gli slot con un 403 —
 * giustamente, perche gli orari in cui la societa riceve non sono la riga di
 * nessuno, sono la configurazione del club.
 *
 * Un club che spuntava quella casella per un ruolo personalizzato basato su
 * `trainer` leggeva una promessa che il prodotto non mantiene: e la casella che
 * non fa cio che dice, vietata da [CLAUDE.md §11.5](../../CLAUDE.md).
 *
 * La prova non controlla il testo esatto — sarebbe un test sull'ortografia. Fa
 * una domanda sola: se la chiave e concessa a un ruolo **non** gestionale, la
 * sua etichetta non puo promettere di configurare il club.
 */

const PROMESSE_DI_CONFIGURAZIONE = [
  "configurare la disponibilita",
  "configurare la disponibilità",
];

test("PP-03 §10.2 · `appointments.manage` non promette a un allenatore di configurare il club", () => {
  const voce = PERMISSION_CATALOG.find(
    (entry) => entry.key === "appointments.manage",
  );

  assert.ok(voce, "la chiave e sparita dal catalogo: il test va riscritto con essa");

  const ruoliNonGestionali = voce.roles.filter(
    (ruolo) => !isManagementAccessRole(ruolo),
  );

  assert.ok(
    ruoliNonGestionali.length > 0,
    "se la chiave tornasse alla sola direzione, la promessa sarebbe di nuovo vera e questa prova andrebbe tolta",
  );

  const promette = PROMESSE_DI_CONFIGURAZIONE.some((frase) =>
    voce.label.toLowerCase().includes(frase),
  );

  assert.equal(
    promette,
    false,
    `l'etichetta promette di configurare la disponibilita a ${ruoliNonGestionali.join(", ")}, che il server respinge con 403`,
  );
});

test("PP-03 §10.2 · l'etichetta dice comunque a chi tocca", () => {
  /*
    Togliere la promessa senza dire dove vive quella funzione lascerebbe chi
    amministra a chiedersi quale casella accenda gli orari di ricevimento: la
    correzione toglie una promessa falsa e mette al suo posto la risposta.
  */
  const voce = PERMISSION_CATALOG.find(
    (entry) => entry.key === "appointments.manage",
  );

  assert.ok(
    /amministra/i.test(voce.label),
    "l'etichetta deve dire chi configura la disponibilita, non solo chi non la configura",
  );
});
