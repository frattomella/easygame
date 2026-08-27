import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PERSON_IDENTITY_FIELD_ORDER,
  PERSON_IDENTITY_LABELS,
  LEGACY_PERSON_NAME_KEYS,
  personIdentityFieldIndex,
  readPersonIdentity,
  toDateInputValue,
  writePersonIdentity,
} from "../../src/lib/person-identity.ts";

/**
 * L'ordine dei campi anagrafici (RC Fix 2, punto 1).
 *
 * **Il difetto.** Nove anagrafiche di persona chiedevano gli stessi sei dati
 * in sei ordini diversi. Il codice fiscale compariva dopo l'email nel nuovo
 * socio, dopo le categorie nel nuovo atleta, dopo la formazione scolastica
 * nella scheda allenatore. Chi lavora in segreteria compila la stessa
 * sequenza decine di volte al giorno leggendola da un documento: l'ordine e
 * memoria muscolare, e cambiarlo fra una scheda e l'altra costa un errore
 * ogni volta che la mano arriva prima dell'occhio.
 *
 * **La misura.** L'ordine e dichiarato in un modulo puro e disegnato da un
 * componente solo. Questi test guardano il modulo (che l'ordine sia quello) e
 * il componente (che lo rispetti nel markup): riordinare i campi richiede di
 * passare da qui, e da qui non si passa per sbaglio.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

test("l'ordine canonico e nome, cognome, data, luogo, sesso, codice fiscale", () => {
  assert.deepEqual(PERSON_IDENTITY_FIELD_ORDER, [
    "firstName",
    "lastName",
    "birthDate",
    "birthPlace",
    "gender",
    "fiscalCode",
  ]);

  assert.equal(personIdentityFieldIndex("fiscalCode"), 5);
  assert.equal(
    personIdentityFieldIndex("nationality"),
    -1,
    "la nazionalita non e un campo di identita: sta dopo, e il suo ordine e affare della scheda",
  );
});

/**
 * Il markup segue l'ordine dichiarato.
 *
 * Si leggono le posizioni delle etichette nel sorgente del componente. E un
 * controllo grezzo, ma coglie esattamente il difetto che si vuole evitare:
 * qualcuno che sposta un campo dentro il blocco senza accorgersene.
 */
test("il blocco condiviso disegna i sei campi in quell'ordine", () => {
  const block = read("components/forms/person-identity-fields.tsx");

  const positions = PERSON_IDENTITY_FIELD_ORDER.map((field) => {
    const at = block.indexOf(`PERSON_IDENTITY_LABELS.${field}`);
    assert.notEqual(at, -1, `il blocco non disegna il campo ${field}`);
    return at;
  });

  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(
      positions[index] > positions[index - 1],
      `${PERSON_IDENTITY_LABELS[PERSON_IDENTITY_FIELD_ORDER[index]]} deve venire dopo ${
        PERSON_IDENTITY_LABELS[PERSON_IDENTITY_FIELD_ORDER[index - 1]]
      }`,
    );
  }
});

/**
 * Il codice fiscale non si sposta quando manca qualcosa.
 *
 * Il pulsante «Calcola» compare quando ci sono i dati per calcolarlo — quello
 * si — ma il **campo** sta al sesto posto sempre. Un campo che cambia
 * posizione a seconda di cosa e stato compilato e un campo che la volta dopo
 * non si trova.
 */
test("il campo codice fiscale non e condizionato: solo il pulsante lo e", () => {
  const block = read("components/forms/person-identity-fields.tsx");
  const fiscalMount = block.slice(block.indexOf("<AssistedFiscalCodeField"));

  assert.equal(
    /^\s*\{[^}]*\?\s*<AssistedFiscalCodeField/.test(fiscalMount),
    false,
    "il campo non deve stare dietro una condizione",
  );

  const field = read("components/forms/assisted-anagrafica.tsx");
  assert.match(
    field,
    /const canFill = enableCompute && !trimmed && computed\.ok/,
    "e il pulsante «Calcola» a comparire quando ci sono i dati, non il campo",
  );
  assert.match(
    field,
    /Per calcolarlo servono ancora/,
    "quando i dati mancano si dice quali, invece di far sparire qualcosa",
  );
});

/**
 * Le anagrafiche che chiamano i campi con altri nomi passano dallo stesso
 * blocco: la traduzione avviene in un posto solo.
 */
test("le chiavi storiche name/surname si traducono in un posto solo", () => {
  const values = readPersonIdentity(
    { name: "mario", surname: "rossi", fiscalCode: "RSSMRA10E12H501U" },
    LEGACY_PERSON_NAME_KEYS,
  );

  assert.equal(values.firstName, "mario");
  assert.equal(values.lastName, "rossi");
  assert.equal(values.fiscalCode, "RSSMRA10E12H501U");
  assert.equal(values.birthPlace, "", "un campo assente si legge come vuoto");

  const written = writePersonIdentity(
    { firstName: "Mario", birthPlaceCode: "H501" },
    LEGACY_PERSON_NAME_KEYS,
  );

  assert.deepEqual(written, { name: "Mario", birthPlaceCode: "H501" });
  assert.equal(
    Object.prototype.hasOwnProperty.call(written, "surname"),
    false,
    "una modifica parziale non deve azzerare i campi che non ha toccato",
  );
});

/* ------------------------------ la data che non arrivava (RC Fix 2, punto 3) */

/**
 * **Il difetto.** `athletes.birth_date` e una colonna `DateTime`: dall'API
 * arriva come `2010-05-12T00:00:00.000Z`. Un `<input type="date">` accetta
 * solo `YYYY-MM-DD` e con qualunque altra forma si disegna **vuoto**.
 *
 * L'effetto non era una casella da riempire: era che dalla finestra di
 * modifica il codice fiscale non si poteva calcolare. Il calcolo leggeva la
 * stessa data, non la riconosceva, e rispondeva «servono ancora: data di
 * nascita» — mentre la scheda, due centimetri piu su, quella data la mostrava.
 */
test("la data di nascita si normalizza per il campo e per il calcolo", () => {
  assert.equal(toDateInputValue("2010-05-12T00:00:00.000Z"), "2010-05-12");
  assert.equal(toDateInputValue("2010-05-12"), "2010-05-12");
  assert.equal(toDateInputValue(new Date("2010-05-12T00:00:00.000Z")), "2010-05-12");

  assert.equal(toDateInputValue(""), "");
  assert.equal(toDateInputValue(null), "");
  assert.equal(toDateInputValue(undefined), "");
  assert.equal(toDateInputValue("non una data"), "");
});

/**
 * **Il giorno non si sposta.**
 *
 * `new Date("2010-05-12T00:00:00.000Z")` letta con i getter locali, in un fuso
 * a ovest di Greenwich, e l'11 maggio alle 20:00. Una data di nascita spostata
 * di un giorno cambia il codice fiscale, e il risultato sarebbe un codice
 * **plausibile e sbagliato**: nessuno se ne accorgerebbe guardandolo.
 */
test("la mezzanotte UTC non diventa il giorno prima", () => {
  for (const iso of [
    "2010-01-01T00:00:00.000Z",
    "2010-05-12T00:00:00.000Z",
    "1999-12-31T00:00:00.000Z",
  ]) {
    assert.equal(
      toDateInputValue(iso),
      iso.slice(0, 10),
      `${iso}: il giorno deve restare quello`,
    );
  }
});

/** Il campo e il calcolo leggono la **stessa** normalizzazione. */
test("il campo data e il calcolo del codice fiscale usano la stessa data", () => {
  const block = read("components/forms/person-identity-fields.tsx");

  assert.match(block, /value=\{toDateInputValue\(values\.birthDate\)\}/);
  assert.match(block, /birthDate: toDateInputValue\(values\.birthDate\)/);
});
