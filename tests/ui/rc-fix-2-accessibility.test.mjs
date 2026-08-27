import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Accessibilita delle superfici di RC Fix 2 (punto 19).
 *
 * Non e una verifica di conformita: e l'elenco delle cose che, sulle
 * superfici toccate, si rompono per prime e in silenzio. Una casella senza
 * nome, un marchio senza testo alternativo, un elenco che compare senza che
 * nessuno lo annunci: nessuna di queste tre si vede guardando lo schermo, e
 * tutte e tre rendono la pagina inutilizzabile a chi non lo guarda.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

/**
 * Una casella di selezione senza nome si annuncia «casella di controllo, non
 * spuntata» — venti volte di fila, una per riga, tutte identiche.
 */
test("ogni casella di selezione dice cosa sta selezionando", () => {
  const selection = read("components/ui/list-selection.tsx");

  assert.match(
    selection,
    /aria-label=\{`Seleziona \$\{label\}`\}/g,
    "il nome accessibile si costruisce da cio che si sta selezionando",
  );
  assert.equal(
    (selection.match(/aria-label=\{`Seleziona \$\{label\}`\}/g) || []).length,
    2,
    "sia la casella di riga sia quella «tutti visibili» devono avere un nome",
  );

  /*
    E il nome della riga e la persona, non il suo id: «Seleziona Mario Rossi»
    e una frase, «Seleziona a1b2c3» no.
  */
  for (const [file, label] of [
    ["app/trainers/page.tsx", "allenatori"],
    ["app/soci/page.tsx", "soci"],
    ["components/staff/StaffTable.tsx", "staff"],
  ]) {
    assert.equal(
      /<SelectRowCheckbox[\s\S]{0,200}?label=\{String\(/.test(read(file)),
      false,
      `${label} (${file}): l'etichetta della casella deve essere il nome, non un identificativo`,
    );
  }
});

/**
 * Il conteggio della selezione cambia mentre si spunta: se non e in una
 * regione annunciata, chi non vede la barra non sa a quante persone sta per
 * applicare un'azione.
 */
test("il conteggio della selezione viene annunciato quando cambia", () => {
  const selection = read("components/ui/list-selection.tsx");

  assert.match(selection, /aria-live="polite"/);
  assert.match(
    selection,
    /role="region"\s*\n?\s*aria-label="Azioni sulla selezione"/,
    "la barra deve essere una regione con un nome, o si trova solo scorrendo",
  );
});

/**
 * Il logotipo Stripe e un'immagine con dentro una parola: senza testo
 * alternativo, il nome dell'intermediario a cui si stanno per dare i dati
 * bancari semplicemente non viene detto.
 */
test("il marchio dell'intermediario ha un nome accessibile", () => {
  const brand = read("components/brand/stripe-brand.tsx");

  assert.match(brand, /role="img"/);
  assert.match(brand, /aria-label=\{title\}/);
  assert.match(
    brand,
    /title = "Stripe"/,
    "il valore predefinito deve essere il nome dell'intermediario",
  );
});

/**
 * La lettura di un documento produce un elenco che compare **sotto** il
 * pulsante appena premuto. Chi naviga da tastiera resta con il fuoco sul
 * pulsante; chi naviga a voce non sente niente.
 */
test("l'anteprima dei dati letti prende il fuoco e si annuncia", () => {
  const field = read("components/forms/document-extraction-field.tsx");

  assert.match(field, /const resultsRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(
    field,
    /if \(entriesCount\) resultsRef\.current\?\.focus\(\)/,
    "il fuoco deve arrivare all'anteprima quando la lettura riesce",
  );
  assert.match(field, /tabIndex=\{-1\}/);
  assert.match(
    field,
    /aria-label="Dati letti dal documento"/,
    "la regione deve avere un nome",
  );
  assert.match(
    field,
    /role="alert"/,
    "un errore di lettura va annunciato, non solo colorato",
  );
});

/**
 * I menu delle azioni di massa e degli ambiti di export usano il componente
 * condiviso, che porta con se la navigazione da tastiera. Un menu fatto con
 * `div` e `onClick` si vede uguale e non si apre con la tastiera.
 */
test("i menu delle azioni si aprono da tastiera perche sono quelli condivisi", () => {
  for (const file of [
    "app/trainers/page.tsx",
    "app/staff/page.tsx",
    "app/soci/page.tsx",
  ]) {
    const source = read(file);

    assert.match(source, /<DropdownMenuTrigger asChild>/);
    assert.match(source, /<DropdownMenuItem/);
    assert.equal(
      /<div[^>]*role="menu"/.test(source),
      false,
      `${file}: nessun menu fatto a mano`,
    );
  }
});

/**
 * I sei campi del blocco anagrafico hanno etichette **collegate**, non testo
 * messo sopra: senza `htmlFor` una etichetta e una didascalia, e il campo
 * resta senza nome.
 */
test("i campi del blocco di identita hanno etichette collegate", () => {
  const block = read("components/forms/person-identity-fields.tsx");
  const labels = block.match(/<Label htmlFor=\{`\$\{idPrefix\}-[a-z-]+`\}>/g) || [];

  assert.ok(
    labels.length >= 4,
    "nome, cognome, data e sesso devono avere l'etichetta collegata al campo",
  );
  /*
    Luogo di nascita e codice fiscale ricevono l'etichetta dai rispettivi
    componenti assistiti, che la collegano al proprio input.
  */
  assert.match(read("components/forms/assisted-anagrafica.tsx"), /<Label htmlFor=\{id\}>/);
});
