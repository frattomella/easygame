import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **I tre percorsi di cancellazione dicevano la cosa sbagliata, e uno si
 * fermava a meta.**
 *
 * `assertPersonalDataDisposed` ferma la cancellazione di un'anagrafica che
 * abbia anche una sola riga fra allegati, consensi, richieste documentali e
 * depositi, e nel messaggio elenca **quali** e indica la strada. I tre percorsi
 * che cancellano un atleta — la scheda, l'elenco, l'operazione in blocco — quel
 * messaggio lo catturavano e lo sostituivano con «Errore nell'eliminazione
 * dell'atleta»: la persona non sapeva ne cosa fosse successo ne cosa fare.
 *
 * A questo si aggiungevano due difetti peggiori:
 *
 *   1. **il dialogo prometteva il falso.** «La scheda, le appartenenze e i
 *      certificati medici collegati vengono rimossi» non e piu vero da quando
 *      la guardia esiste, e non lo era per quasi ogni atleta reale —
 *      l'iscrizione online crea richieste documentali, i moduli registrano
 *      consensi;
 *   2. **la cancellazione massiva si interrompeva.** Il ciclo non aveva un
 *      `try` per singolo elemento: al primo atleta con dati vivi l'errore
 *      usciva dal `for`, i successivi non venivano nemmeno tentati, e restava
 *      una cancellazione parziale che nessuno aveva dichiarato.
 *
 * Questo file fissa che nessuno dei tre torni indietro.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const ELENCO = path.join(PROJECT_ROOT, "src/app/athletes/page.tsx");
const SCHEDA = path.join(PROJECT_ROOT, "src/app/athletes/[id]/page.tsx");
const SEZIONE = path.join(
  PROJECT_ROOT,
  "src/components/athletes/profile/athlete-data-subject-section.tsx",
);

const strip = (file) =>
  readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const elenco = strip(ELENCO);
const scheda = strip(SCHEDA);
const sezione = strip(SEZIONE);

const pagine = [
  ["l'elenco atleti", elenco],
  ["la scheda atleta", scheda],
];

/* ================================== il dialogo non promette piu il falso === */

for (const [nome, codice] of pagine) {
  test(`${nome} non promette piu che i certificati medici vengano rimossi`, () => {
    assert.ok(
      !/certificati medici collegati/i.test(codice),
      "la guardia ferma la cancellazione prima: quella frase era falsa per quasi ogni atleta",
    );
  });

  test(`${nome} dice dove si trattano i dati personali`, () => {
    assert.match(
      codice,
      /Dati personali/,
      "il dialogo deve indicare la strada che il messaggio della guardia nomina",
    );
  });
}

/* ============================ il motivo del server arriva a chi lo legge === */

for (const [nome, codice] of pagine) {
  test(`${nome} non sostituisce piu il motivo del server con un testo generico`, () => {
    assert.match(
      codice,
      /eDatiPersonaliDaSmaltire\(messaggio\)/,
      "il messaggio della guardia si riconosce",
    );
    assert.match(
      codice,
      /messaggioDatiPersonali\(messaggio/,
      "e si mostra insieme alla strada, invece di essere buttato via",
    );
    assert.ok(
      !/showToast\(\s*"error",\s*"Errore nell'eliminazione dell'atleta"\s*\)/.test(
        codice,
      ),
      "il testo generico non deve piu essere l'unica cosa che si vede",
    );
  });
}

test("il riconoscimento del messaggio vive in un posto solo", () => {
  assert.match(
    sezione,
    /export const eDatiPersonaliDaSmaltire/,
    "la stessa domanda se la fanno in tre: una risposta sola e piu facile da tenere vera",
  );
  assert.match(sezione, /export const messaggioDatiPersonali/);
  for (const [nome, codice] of pagine) {
    assert.match(
      codice,
      /from "@\/components\/athletes\/profile\/athlete-data-subject-section"/,
      `${nome} deve importarla, non riscriverla`,
    );
  }
});

/* ================== la cancellazione massiva non si interrompe piu a meta === */

test("la cancellazione massiva tenta ogni atleta per conto suo", () => {
  const ciclo = elenco.slice(
    elenco.indexOf('if (pendingBulkAction.action === "delete") {'),
    elenco.indexOf('} else if (pendingBulkAction.action === "changeCategory") {'),
  );

  assert.ok(ciclo.length > 0, "il ramo della cancellazione in blocco deve esistere");
  assert.match(
    ciclo,
    /for \(const athleteId of targetIds\) \{\s*try \{/,
    "ogni elemento va tentato dentro il proprio try: senza, il primo errore ferma tutti i successivi",
  );
  assert.match(
    ciclo,
    /eliminati\.push\(athleteId\)/,
    "gli esiti riusciti si contano",
  );
  assert.match(
    ciclo,
    /falliti\.push\(/,
    "e quelli falliti anche, con il loro motivo",
  );
});

test("la cancellazione massiva dichiara l'esito parziale invece di nasconderlo", () => {
  const ciclo = elenco.slice(
    elenco.indexOf('if (pendingBulkAction.action === "delete") {'),
    elenco.indexOf('} else if (pendingBulkAction.action === "changeCategory") {'),
  );

  assert.match(
    ciclo,
    /if \(eliminati\.length\)/,
    "quanti sono spariti",
  );
  assert.match(
    ciclo,
    /if \(falliti\.length\)/,
    "e quanti no: una cancellazione parziale e irreversibile, e va detta",
  );
  assert.match(
    ciclo,
    /eDatiPersonaliDaSmaltire\(riga\.motivo\)/,
    "il motivo che ricorre si riconosce e si spiega una volta con la strada",
  );
  assert.ok(
    !/showToast\(\s*\n?\s*"success",\s*\n?\s*`\$\{targetIds\.length\}/.test(ciclo),
    "il conteggio dichiarato non deve piu essere quello dei tentativi",
  );
});

test("la conferma in blocco avverte che l'operazione puo riuscire a meta", () => {
  const inizio = elenco.indexOf("Stai per eliminare ${athletesCount}");
  const fine = elenco.indexOf("Vuoi continuare?");
  assert.ok(
    inizio >= 0 && fine > inizio,
    "la descrizione della conferma in blocco deve esistere",
  );
  const descrizione = elenco.slice(inizio, fine);

  assert.match(
    descrizione,
    /non vengono eliminati/,
    "chi conferma deve sapere prima che una parte puo non partire",
  );
  assert.match(
    descrizione,
    /Dati personali/,
    "e dove si trattano quelli che restano",
  );
});

/* ================================= la scheda porta dove il messaggio manda === */

test("dalla scheda atleta si arriva alla sezione che la guardia nomina", () => {
  assert.match(
    scheda,
    /<AthleteDataSubjectSection\b/,
    "il percorso deve chiudersi: il messaggio dice «usa la cancellazione dei dati personali», e da qui la si usa",
  );
  assert.match(
    sezione,
    /id="dati-personali"/,
    "un ancoraggio stabile, cosi il rimando resta valido",
  );
});
