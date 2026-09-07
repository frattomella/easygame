import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **«Tutti» sono tutti, e ognuno una volta sola** (P0-1, pilota Fortitudo
 * Scauri).
 *
 * ---
 *
 * ## Il difetto misurato sul pilota
 *
 * 213 atleti in archivio, e la conferma di «Modifica tutti» diceva **245**.
 * Due difetti in una riga sola, e nessuno dei due si vedeva guardandola:
 *
 * ```ts
 * return athletes.map((athlete) => athlete.id);
 * ```
 *
 * 1. **`athletes` e la pagina caricata**, non l’insieme filtrato. Con
 *    l’archivio paginato «tutti» significava «quelli che ho in mano adesso»,
 *    e l’azione non toccava chi doveva toccare — senza che nessuno se ne
 *    accorgesse, perche l’operazione riusciva;
 * 2. **le righe non sono le persone.** Un atleta con due tessere compare due
 *    volte, e si contava due volte. E la ragione aritmetica del 245.
 *
 * Lo stesso file aveva gia imparato la prima meta della lezione, sull’export:
 * «esportare quelle e chiamarle atleti filtrati sarebbe una bugia in cima a un
 * PDF». Su un’azione di **scrittura** la bugia costa di piu.
 *
 * ## Cosa misurano queste prove
 *
 * La forma della correzione, che e strutturale: il bersaglio si risolve **una
 * volta**, e cio che si conta nella conferma e cio su cui si scrive. Due
 * calcoli separati sono due risposte che un giorno divergono — ed e
 * esattamente cosi che il difetto era nato.
 */

const PAGINA = path.join(process.cwd(), "src", "app", "athletes", "page.tsx");
const sorgente = () => readFileSync(PAGINA, "utf8");

test("il bersaglio di un’azione massiva non e piu la pagina caricata", () => {
  const testo = sorgente();

  assert.equal(
    /return athletes\.map\(\(athlete\) => athlete\.id\);/.test(testo),
    false,
    "«tutti» non puo significare «le righe che ho in mano»",
  );
});

test("i bersagli si risolvono una volta e viaggiano con l’azione", () => {
  const testo = sorgente();

  assert.match(
    testo,
    /targetIds: string\[\];/,
    "l’azione in attesa deve portare con se gli atleti su cui girera",
  );

  assert.match(
    testo,
    /const getBulkActionTargetIds = \(\) => pendingBulkAction\?\.targetIds \?\? \[\];/,
    "chi legge i bersagli non deve ricalcolarli: e il secondo calcolo che diverge",
  );
});

test("e sono distinti: una persona con due tessere e una persona", () => {
  const testo = sorgente();

  const inizio = testo.indexOf("const risolviBersagliMassivi");
  assert.ok(inizio > 0, "il risolutore deve esistere");

  const corpo = testo.slice(inizio, testo.indexOf("};", inizio));

  assert.equal(
    (corpo.match(/new Set\(/g) || []).length >= 2,
    true,
    "tutti e due i rami — selezione e «tutti» — devono rendere distinti gli identificativi",
  );
});

test("«tutti» chiede l’insieme filtrato intero, non la pagina", () => {
  const testo = sorgente();

  const inizio = testo.indexOf("const risolviBersagliMassivi");
  const corpo = testo.slice(inizio, testo.indexOf("};", inizio));

  assert.match(
    corpo,
    /collectAthletesForExport\(\)/,
    "si riusa la paginazione gia scritta per l’export, invece di scriverne una seconda",
  );
});

test("se i bersagli non si possono contare, la conferma non si apre", () => {
  /*
    **Il controspecchio, e conta.** Risolvere «tutti» chiede le pagine
    restanti alla rete, e quella chiamata puo fallire. Aprire lo stesso il
    dialogo vorrebbe dire far confermare un’operazione su un insieme che
    nessuno ha potuto contare: la forma peggiore del difetto che questa
    correzione chiude, non la sua attenuazione.
  */
  const testo = sorgente();

  const inizio = testo.indexOf("const apriAzioneMassiva");
  assert.ok(inizio > 0, "l’apertura deve passare da una funzione sola");

  const corpo = testo.slice(inizio, inizio + 1400);

  assert.match(corpo, /try \{/, "la risoluzione dei bersagli va protetta");
  assert.match(
    corpo,
    /catch[\s\S]{0,220}return;/,
    "e in caso di errore non si apre niente",
  );
  assert.match(
    corpo,
    /if \(!targetIds\.length\)[\s\S]{0,160}return;/,
    "e nemmeno con zero bersagli",
  );
});

test("nessuna apertura scavalca il risolutore", () => {
  /*
    Diciassette punti aprono un’azione massiva. Uno solo che chiamasse ancora
    `setPendingBulkAction` direttamente riporterebbe li il difetto, e sarebbe
    l’unico a non avere i bersagli — cioe zero atleti, in silenzio.
  */
  const testo = sorgente();

  const dirette = Array.from(
    testo.matchAll(/setPendingBulkAction\(\{/g),
  ).length;

  assert.equal(
    dirette,
    1,
    "l’unica chiamata diretta ammessa e quella dentro `apriAzioneMassiva`",
  );
});
