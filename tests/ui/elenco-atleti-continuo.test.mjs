import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * **L'elenco Atleti e continuo** (P0 «elenco atleti senza paginazione
 * classica»).
 *
 * In fondo alla lista c'erano «Precedente» e «Successiva», e ogni porzione
 * **sostituiva** la precedente. Su questa pagina non e un dettaglio di
 * navigazione: l'elenco e anche il posto in cui si spuntano le righe per
 * un'azione massiva — comunicazione, export, cambio di stato — e cambiare
 * pagina le portava via dagli occhi. Chi ne aveva scelte dodici non aveva piu
 * modo di sapere se fossero ancora scelte, e la barra della selezione diceva
 * dodici sopra un elenco che non ne conteneva nessuna.
 *
 * A 375 px il difetto e piu semplice: la paginazione classica e una cosa che
 * si impara, non una che si usa.
 *
 * Questi test misurano la forma dell'elenco continuo — l'accodamento, il
 * sentinello, il pulsante che resta per la tastiera — e le due trappole che
 * l'accodamento porta con se: la risposta in ritardo che riscrive l'elenco
 * con un filtro vecchio, e la riga che torna due volte.
 */

const ELENCO = path.join(process.cwd(), "src/app/athletes/page.tsx");
const sorgente = fs.readFileSync(ELENCO, "utf8");

/** Il corpo del componente, senza i commenti: cio che il browser esegue. */
const senzaCommenti = sorgente
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("i due pulsanti della paginazione classica non ci sono piu", () => {
  assert.ok(
    !/>\s*Precedente\s*</.test(senzaCommenti),
    "«Precedente» era il pulsante che riportava indietro sostituendo l'elenco",
  );
  assert.ok(
    !/>\s*Successiva\s*</.test(senzaCommenti),
    "«Successiva» sostituiva l'elenco, e con lui la selezione in corso",
  );
});

test("la porzione successiva si accoda, non sostituisce", () => {
  assert.match(
    senzaCommenti,
    /const loadAthletePage = React\.useCallback\(\s*async \(\s*targetPage: number,\s*\{ accoda = false \}/,
    "la stessa lettura serve due domande: «rifai l'elenco» e «continua»",
  );

  const corpo = senzaCommenti.slice(
    senzaCommenti.indexOf("const loadAthletePage"),
    senzaCommenti.indexOf("const caricaAltriAtleti"),
  );

  assert.match(
    corpo,
    /if \(!accoda\) \{\s*setAthletes\(rows\);/,
    "senza accodamento l'elenco si rifa: e il ramo del cambio di filtro",
  );
  assert.match(
    corpo,
    /setAthletes\(\(precedenti\) => \{/,
    "con l'accodamento le righe nuove si aggiungono a quelle gia lette",
  );
});

test("una riga non entra due volte nell'elenco", () => {
  /*
    L'archivio cambia mentre lo si scorre — una segreteria che iscrive un
    atleta sposta la finestra di tutte le porzioni successive. Senza il vaglio
    per identificativo la stessa riga comparirebbe due volte, con due caselle
    di selezione che si spuntano insieme.
  */
  const corpo = senzaCommenti.slice(
    senzaCommenti.indexOf("const loadAthletePage"),
    senzaCommenti.indexOf("const caricaAltriAtleti"),
  );

  assert.match(
    corpo,
    /const visti = new Set\(precedenti\.map\(\(riga\) => riga\.id\)\)/,
    "l'accodamento deve conoscere cio che ha gia",
  );
  assert.match(
    corpo,
    /rows\.filter\(\(riga\) => !visti\.has\(riga\.id\)\)/,
    "e scartare cio che tornerebbe due volte",
  );
});

test("una risposta in ritardo non riscrive l'elenco", () => {
  /*
    Due letture possono essere in volo insieme: si digita mentre il sentinello
    sta chiedendo la porzione successiva. Senza gettone, la piu lenta arriva
    dopo e mostra il risultato di un filtro che non e piu quello scritto nella
    casella.
  */
  assert.match(
    senzaCommenti,
    /const gettoneLettura = React\.useRef\(0\)/,
    "serve un gettone crescente",
  );
  assert.match(
    senzaCommenti,
    /const mio = \+\+gettoneLettura\.current;/,
    "ogni lettura ne prende uno",
  );
  assert.match(
    senzaCommenti,
    /if \(mio !== gettoneLettura\.current\) return;/,
    "chi torna e non e l'ultimo non tocca niente",
  );
});

test("l'elenco continua da solo, e il pulsante resta per la tastiera", () => {
  assert.match(
    senzaCommenti,
    /const sentinelloElenco = React\.useRef<HTMLDivElement \| null>\(null\)/,
    "il nodo sotto l'ultima riga",
  );
  assert.match(
    senzaCommenti,
    /new IntersectionObserver\(/,
    "arrivare in fondo deve bastare",
  );
  assert.match(
    senzaCommenti,
    /ref=\{sentinelloElenco\}/,
    "l'osservatore deve guardare un nodo che esiste nella pagina",
  );

  assert.match(
    senzaCommenti,
    /data-testid="carica-altri-atleti"/,
    "lo scorrimento non e una strada da tastiera: il pulsante non e un ripiego",
  );
  assert.match(
    senzaCommenti,
    /onClick=\{caricaAltriAtleti\}/,
    "e deve fare la stessa cosa dell'osservatore",
  );
});

test("il conteggio in fondo dice quante righe si stanno guardando", () => {
  /*
    «Pagina 3 di 11» era una posizione dentro un meccanismo. Con l'elenco
    continuo la domanda e un'altra — «quanti ne sto vedendo?» — e la risposta
    non puo essere `athletes.length`: quello e cio che e stato letto, non cio
    che il vaglio di stato lascia passare.
  */
  assert.match(
    senzaCommenti,
    /data-testid="elenco-atleti-avanzamento"/,
    "l'avanzamento deve essere una superficie, non un commento",
  );
  assert.match(
    senzaCommenti,
    /\{filteredAthletes\.length\} di \{listMeta\.total\} atleti/,
    "quante righe si vedono su quante ce ne sono nell'archivio",
  );
  assert.ok(
    !/Pagina \{page\} di\{" "\}/.test(senzaCommenti),
    "la posizione dentro il meccanismo non e piu una domanda del prodotto",
  );
});

test("cambiare filtro rifa l'inizio, e non dipende piu dal numero di porzione", () => {
  /*
    L'effetto che ricarica dipendeva da `page`: era il modo in cui
    «Successiva» funzionava. Se ci restasse, chiedere la porzione successiva
    farebbe **anche** ripartire l'effetto, e la stessa lettura verrebbe fatta
    due volte — una accodando e una sostituendo.
  */
  const effetto = senzaCommenti.slice(
    senzaCommenti.indexOf("if (!paginated) return;"),
  );
  const chiusura = effetto.indexOf("}, [paginated");

  assert.ok(chiusura > 0, "l'effetto di ricarica deve esistere");
  assert.match(
    effetto.slice(0, chiusura + 60),
    /void loadAthletePage\(1\);/,
    "un filtro nuovo rifa l'elenco dall'inizio",
  );
  assert.match(
    effetto.slice(chiusura, chiusura + 60),
    /\}, \[paginated, loadAthletePage\]\);/,
    "e `page` non e piu una dipendenza di questo effetto",
  );
});
