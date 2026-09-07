import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * **La scheda appuntamento che a 375 px veniva tagliata, non scorreva**
 * (PP-03 §12.1).
 *
 * La verifica di responsivita di §12 misurava
 * `documentElement.scrollWidth - clientWidth` su ogni pagina dell'area
 * allenatore, e su tutte e quattro le larghezze dava **zero**. Era vero, e non
 * bastava: il guscio dell'applicazione dichiara `overflow-x-hidden` sul
 * `<main>`, quindi un contenuto piu largo dello schermo non fa traboccare il
 * documento — **sparisce**. La misura giusta e la seconda, e nessuno la faceva:
 * un contenitore che ritaglia (`overflow-x: hidden`) il cui `scrollWidth`
 * supera il proprio `clientWidth`.
 *
 * Misurato sul club di collaudo, a 375 px: `main` 375/671, ogni scheda
 * appuntamento larga **634 px**. Di ognuna sparivano lo stato e il terzo
 * pulsante, «Rifiuta» — cioe una delle tre transizioni che la macchina a stati
 * del dominio dichiarava ammesse.
 *
 * La causa e la larghezza minima automatica di una **casella di griglia**, che
 * vale `min-content`: dentro la scheda c'e un titolo `truncate`, cioe
 * `white-space: nowrap`, il cui `min-content` e l'intera riga di testo. La
 * colonna non poteva scendere sotto quella misura.
 *
 * Il `min-w-0` sul blocco di testo dentro la scheda **c'era gia** e non
 * bastava: quello lascia scendere il figlio flex, e la casella della griglia
 * resta al proprio `min-content`. E la stessa regola che
 * `responsive-invariants.test.mjs` gia difende in due punti — «senza `min-w-0`
 * un `truncate` non tronca» — applicata un livello piu su.
 *
 * Sta in un file di PP-03 e non dentro `responsive-invariants.test.mjs` perche
 * quel file lo stanno leggendo anche le altre due lane parallele: qui il merge
 * e un'aggiunta.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const APPUNTAMENTI = "components/trainer/trainer-appointments-dashboard-page.tsx";

test("PP-03 §12.1 · la scheda appuntamento e una casella di griglia che sa restringersi", () => {
  const sorgente = leggi(APPUNTAMENTI);

  /*
    La relazione da difendere e fra tre cose che stanno in questo file: una
    griglia, la scheda che ci finisce dentro, e un `truncate` dentro la scheda.
    Se un domani sparisse il `truncate` il difetto non ci sarebbe piu — ma
    tornerebbe al primo titolo lungo, quindi la prova resta sulla scheda.
  */
  assert.match(
    sorgente,
    /<article\s+key=\{appointment\.id\}\s+className="min-w-0 /,
    "la scheda e una casella di griglia: senza `min-w-0` la colonna non scende sotto il `min-content` del titolo, e a 375 px il `<main>` la taglia",
  );

  assert.ok(
    /className="truncate text-sm font-semibold/.test(sorgente),
    "il titolo tronca: e questo `white-space: nowrap` a dettare il `min-content` della casella",
  );
});

test("PP-03 §12.1 · le due griglie della pagina disegnano la stessa scheda", () => {
  const sorgente = leggi(APPUNTAMENTI);

  /*
    «Da gestire» e «Storico» sono due griglie distinte. Se disegnassero due
    schede diverse, la correzione varrebbe per una sola e l'altra tornerebbe a
    tagliare — che e la forma in cui questo repository ha gia perso tre volte
    la stessa correzione.
  */
  const griglie = sorgente.match(/<div className="grid gap-3 xl:grid-cols-2">\s*\{(\w+)\.map\((\w+)\)\}/g) || [];
  assert.equal(
    griglie.length,
    2,
    "le due griglie della pagina devono restare due, e passare entrambe da una funzione di disegno",
  );
  for (const griglia of griglie) {
    assert.match(
      griglia,
      /\.map\(renderCard\)/,
      "entrambe devono disegnare `renderCard`: una seconda copia della scheda perderebbe la correzione al primo ritocco",
    );
  }
});

test("PP-03 §12.1 · nessun'altra scheda dell'area allenatore entra in una griglia senza potersi stringere", () => {
  /*
    Il verso generale, per quanto un test sul sorgente lo puo dire: in questa
    cartella, un elemento che apre una scheda **subito dentro** una griglia e
    che contiene un `truncate` deve dichiarare `min-w-0`.

    Non e una prova di responsivita — quella si fa con un browser, ed e in §12.
    E la sentinella che impedisce di reintrodurre la stessa forma senza
    accorgersene, che e il modo in cui e arrivata la prima volta.
  */
  const cartella = path.join(SRC, "components", "trainer");
  const problemi = [];

  for (const nome of readdirSync(cartella)) {
    if (!nome.endsWith(".tsx")) continue;
    const sorgente = readFileSync(path.join(cartella, nome), "utf8");
    if (!sorgente.includes("truncate")) continue;

    /* Ogni apertura di griglia, e cosa viene disegnato subito dopo. */
    const righe = sorgente.split("\n");
    for (let i = 0; i < righe.length; i += 1) {
      if (!/className="[^"]*\bgrid\b[^"]*"/.test(righe[i])) continue;
      const finestra = righe.slice(i + 1, i + 6).join("\n");
      /*
        Interessa solo la casella dichiarata **qui**, con una classe propria:
        una `{lista.map(fn)}` rimanda a una funzione, e quella la coprono le due
        prove sopra per il caso noto.
      */
      const casella = finestra.match(/^\s*<(article|div|section)\s+className="([^"]*)"/m);
      if (!casella) continue;
      const classi = casella[2];
      if (!/\b(rounded|border|bg-white)\b/.test(classi)) continue;
      if (classi.includes("min-w-0")) continue;
      if (!finestra.includes("truncate")) continue;
      problemi.push(`${nome}:${i + 1} → <${casella[1]} class="${classi.slice(0, 60)}">`);
    }
  }

  assert.deepEqual(
    problemi,
    [],
    "una casella di griglia con un `truncate` dentro e senza `min-w-0` non scende sotto il proprio `min-content`: a 375 px il `<main>`, che dichiara `overflow-x-hidden`, la taglia invece di farla scorrere",
  );
});
