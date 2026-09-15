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

  /*
    **E non passa da `collectAthletesForExport`**, che risponde a un'altra
    domanda.

    Quella funzione serve l'export, e la sua prima riga e «se c'e una
    selezione, sono quelli» — giusto per un foglio, sbagliato qui: con una
    sola casella spuntata, «Azioni su tutti» toccava quella sola mentre la
    conferma diceva «tutti gli atleti registrati». Il menu resta attivo a
    prescindere dalla selezione, quindi non e un caso limite: e il gesto di
    chi ha spuntato una riga, ha cambiato idea e ha aperto l'altro menu.

    La paginazione resta scritta una volta sola — `collectFilteredAthletes` —
    e le due domande la riusano ognuna a modo suo.
  */
  assert.match(
    corpo,
    /collectFilteredAthletes\(\)/,
    "«tutti» e tutto l'insieme filtrato, e la selezione non lo restringe",
  );
  assert.doesNotMatch(
    corpo,
    /collectAthletesForExport\(\)/,
    "la funzione dell'export degrada «tutti» nella selezione",
  );

  /*
    Nel Web V2 le due funzioni ricevono cio che la griglia mostra
    (`visibili`, `request.rows`): sotto la soglia e gia tutto l'insieme
    filtrato, sopra la soglia le pagine restanti si chiedono qui. La forma
    resta la stessa: una sola paginazione, e l'export che ricade su di essa.
  */
  assert.match(
    testo,
    /const collectFilteredAthletes = async \([^)]*\): Promise<Athlete\[\]> => \{[\s\S]{0,400}getClubAthletesPage\(/,
    "la paginazione vive in un punto solo, e sta li",
  );
  assert.match(
    testo,
    /const collectAthletesForExport = async \([\s\S]{0,80}\): Promise<Athlete\[\]> => \{[\s\S]{0,400}return collectFilteredAthletes\(/,
    "l'export resta quello che era: la selezione, oppure tutto l'insieme filtrato",
  );
});

test("«seleziona tutti» sopra la soglia vale per l'intero archivio filtrato", () => {
  /*
    La griglia del Web V2 seleziona **le righe caricate**. Sotto la soglia
    sono gia tutto l'insieme; sopra, quando la selezione copre ogni riga
    caricata, l'ambito diventa «all» e i bersagli si risolvono sulle pagine
    del server — come faceva «Azioni su tutti» nella V1. Senza questo, con
    duemila atleti «seleziona tutti i 200» toccherebbe duecento persone e la
    conferma direbbe «tutti gli atleti registrati».
  */
  const testo = sorgente();

  assert.match(
    testo,
    /const bulkScopeOf = \(righe: Athlete\[\]\): PendingBulkAction\["scope"\] =>\s*paginated && righe\.length > 0 && righe\.length >= filteredAthletes\.length\s*\? "all"\s*: "selected";/,
    "l'ambito si decide in un posto solo, e dipende da «tutte le righe caricate»",
  );

  const aperture = Array.from(testo.matchAll(/scope: bulkScopeOf\(/g)).length;
  assert.equal(
    aperture,
    5,
    "ogni azione di massa — attiva, sospendi, disattiva, elimina, cambia categoria — passa dal risolutore di ambito",
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

/* ==================================================================== *
 *  Gli annullati: «lo conto?» e «lo mostro?» sono due domande
 * ==================================================================== */

test("le superfici che mostrano lo stato chiedono anche gli annullati", () => {
  /*
    **La regressione che P0-3 aveva introdotto** (D-AUD-20), trovata da una
    revisione indipendente sulla remediation.

    Togliere gli annullati dal predefinito della rotta era giusto per i
    **conteggi**: un evento che non si e svolto non e un evento a cui qualcuno
    e mancato. Ma stringere la lettura ha risposto anche alla domanda
    sbagliata: dal calendario e dalla bacheca dell'allenatore gli annullati
    sono spariti.

    Le conseguenze non erano cosmetiche: la segreteria non poteva piu
    distinguere «martedi e stato annullato» da «martedi non e mai esistito», e
    il flusso di **ripristino** della pagina allenamenti — «un allenamento
    annullato non compare: prima si ripristina, poi si sposta» — era diventato
    irraggiungibile. Si annullava e non si tornava piu indietro.
  */
  const calendario = readFileSync(
    path.join(process.cwd(), "src", "app", "calendar", "page.tsx"),
    "utf8",
  );
  assert.match(
    calendario,
    /include_cancelled: "1"/,
    "il calendario disegna la pastiglia «Annullato»: deve poterla raggiungere",
  );

  const bacheca = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "components",
      "trainer",
      "trainer-dashboard-context.tsx",
    ),
    "utf8",
  );
  assert.equal(
    (bacheca.match(/include_cancelled=1/g) || []).length,
    2,
    "allenamenti e gare: il ripristino vale per tutti e due",
  );
});
