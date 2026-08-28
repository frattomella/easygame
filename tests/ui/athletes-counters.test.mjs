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

test("sotto la soglia i tre conteggi restano, perche li i dati ci sono tutti", () => {
  assert.match(
    source,
    /Atleti Attivi:\{" "\}\s*\n\s*\{athletes\.filter\(\(a\) => a\.status === "active"\)\.length\}/,
  );
});

/**
 * Il totale del server e gia filtrato per lo stato scelto — l'elenco chiede
 * una categoria per volta — quindi la riga ne annuncia **una**, con il nome
 * giusto: annunciarne tre significherebbe scrivere due zeri inventati.
 */
test("ogni filtro di stato ha il suo titolo", () => {
  assert.match(source, /const STATUS_FILTER_HEADINGS: Record</);

  for (const [chiave, titolo] of [
    ["active", "Atleti Attivi"],
    ["suspended", "Atleti Sospesi"],
    ["inactive", "Atleti in Prestito"],
    ["all", "Atleti"],
  ]) {
    assert.match(
      source,
      new RegExp(`${chiave}: "${titolo}",`),
      `manca il titolo per il filtro ${chiave}`,
    );
  }
});
