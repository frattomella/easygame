import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Il numero in cima all'elenco Atleti.
 *
 * Visto sullo staging su un club con **212 atleti, tutti attivi**: la riga
 * diceva «Atleti Attivi: 200», e due centimetri sotto la barra della
 * paginazione diceva «212 atleti nell'archivio». Non c'era nessun errore di
 * calcolo: i tre conteggi si ricavavano da `athletes`, che sopra la soglia di
 * paginazione **e la pagina caricata**, non l'archivio.
 *
 * E il tipo di difetto che non rompe niente e che nessuno segnala come tale:
 * si legge un numero, e il numero e sbagliato del 6%.
 */

const source = readFileSync(
  path.join(process.cwd(), "src/app/athletes/page.tsx"),
  "utf8",
);

test("con la paginazione attiva il conteggio arriva dal server", () => {
  assert.match(
    source,
    /\{paginated && listMeta \? \(\s*<>\s*\{STATUS_FILTER_HEADINGS\[statusFilter\]\}: \{listMeta\.total\}/,
    "sopra la soglia il numero deve essere quello contato dal server",
  );
});

test("sotto la soglia i conteggi restano, perche li i dati ci sono tutti", () => {
  /*
    W6-04. Erano **tre** conteggi scritti a mano, uno per stato. Gli stati sono
    diventati quattro, e scriverne quattro a mano vorrebbe dire riaprire proprio
    il difetto da cui la Wave 6 e partita: era l'enumerazione a mano che aveva
    fatto nascere quattro etichette per tre valori.

    Ora si itera sul vocabolario. Un quinto stato, il giorno che servisse, si
    aggiunge in un posto solo e questa riga lo mostra da sola.
  */
  assert.match(
    source,
    /ATHLETE_STATUSES\.map\(\(stato, indice\) => \(/,
    "i conteggi si ricavano dal vocabolario, non da un elenco scritto a mano",
  );
  assert.match(
    source,
    /\{athletes\.filter\(\(a\) => a\.status === stato\)\.length\}/,
  );
});

/**
 * Il totale del server e gia filtrato per lo stato scelto — l'elenco chiede
 * una categoria per volta — quindi la riga ne annuncia **una**, con il nome
 * giusto: annunciarne quattro significherebbe scrivere tre zeri inventati.
 */
test("ogni filtro di stato ha il suo titolo, e i titoli sono distinti", async () => {
  const { ATHLETE_STATUS_HEADINGS, ATHLETE_STATUSES } = await import(
    "../../src/lib/athletes/status.ts"
  );

  assert.match(
    source,
    /const STATUS_FILTER_HEADINGS = ATHLETE_STATUS_HEADINGS;/,
    "i titoli vengono dal vocabolario: e li che non possono ripetersi",
  );

  /*
    Il presidio vero non e «esiste un titolo», e «i titoli sono **diversi**».
    Il difetto W6-04 era esattamente questo: «Atleti in Prestito» era il titolo
    di `inactive`, e chi filtrava «Disattivati» leggeva un'intestazione che
    parlava d'altro.
  */
  const titoli = [...ATHLETE_STATUSES, "all"].map(
    (chiave) => ATHLETE_STATUS_HEADINGS[chiave],
  );
  for (const titolo of titoli) {
    assert.ok(titolo, "ogni filtro deve avere un titolo");
  }
  assert.equal(
    new Set(titoli).size,
    titoli.length,
    `due filtri con lo stesso titolo: ${titoli.join(" | ")}`,
  );
});
