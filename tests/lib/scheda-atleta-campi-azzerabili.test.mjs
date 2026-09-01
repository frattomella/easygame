import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **W6-05 · W6-06 — «rimuovo la foto, ricarico, la foto e tornata».**
 *
 * Il difetto era una riga sola, e la sua forma vale ben oltre l'avatar:
 *
 * ```
 * const nextAvatar =
 *   updates.avatar ?? updates.avatar_url ?? currentAthlete.avatar_url ?? null;
 * ```
 *
 * `??` risponde alla domanda «e nullo?». Questa riga doveva rispondere a
 * un'altra: «e stato **dichiarato**?». Togliere la foto significa mandare
 * `avatar: null`; con `??` quel `null` veniva letto come «non fornito», la
 * catena scivolava fino al valore in archivio e **riesumava la foto**.
 *
 * Il difetto era invisibile a occhio perche la schermata aveva gia aggiornato
 * il proprio stato: la foto spariva davvero, e tornava solo ricaricando. Cioe
 * si vedeva solo *dopo* aver chiuso la scheda credendo di aver finito.
 *
 * Le stesse righe rendevano non azzerabili il **codice di accesso** e il
 * **numero di maglia** (W6-06).
 *
 * ## Perche il test guarda il sorgente
 *
 * `updateClubAthlete` parla con l'adattatore HTTP: provarla qui vorrebbe dire
 * sostituire il trasporto, cioe la classe di test che questo difetto ha
 * attraversato indenne per quattro Wave. Il giro vero — carica, rimuovi,
 * ricarica — sta in `scripts/wave-6-uat.mjs`, contro un database. Qui si
 * presidia la **forma**: che il distinguo fra `undefined` e `null` non torni a
 * essere un `??`.
 */

const SORGENTE = readFileSync("src/lib/simplified-db.ts", "utf8");

const corpoDiUpdateClubAthlete = () => {
  const inizio = SORGENTE.indexOf("export async function updateClubAthlete");
  assert.ok(inizio > 0, "updateClubAthlete non trovata");
  const fine = SORGENTE.indexOf("export async function", inizio + 10);
  return SORGENTE.slice(inizio, fine > 0 ? fine : undefined);
};

test("W6-05 · i campi azzerabili distinguono «non fornito» da «da cancellare»", () => {
  const corpo = corpoDiUpdateClubAthlete();

  assert.ok(
    corpo.includes("const primoDichiarato ="),
    "serve un selettore che si fermi al primo valore dichiarato, non al primo non nullo",
  );

  for (const campo of ["nextAvatar", "nextAccessCode", "nextJerseyNumber"]) {
    const riga = corpo.slice(
      corpo.indexOf(`const ${campo} =`),
      corpo.indexOf(";", corpo.indexOf(`const ${campo} =`)),
    );
    assert.ok(
      riga.includes("primoDichiarato"),
      `${campo} deve passare da primoDichiarato`,
    );
    assert.equal(
      riga.includes("??"),
      false,
      `${campo}: con ?? un null esplicito torna a significare «non fornito», e il valore vecchio risorge`,
    );
  }
});

test("W6-03 · lo stato passa dal vocabolario prima di toccare la colonna", () => {
  const corpo = corpoDiUpdateClubAthlete();

  assert.ok(
    /const nextStatus = normalizeAthleteStatus\(/.test(corpo),
    "senza normalizzazione un nome di azione torna a poter diventare uno stato",
  );
  assert.equal(
    corpo.includes('currentAthlete.status ?? "active"'),
    false,
    "la vecchia forma non normalizzava: accettava qualunque stringa",
  );
});

test("il modulo che scrive l'atleta importa il vocabolario, non ne tiene una copia", () => {
  assert.match(SORGENTE, /from "\.\/athletes\/status"/);
});
