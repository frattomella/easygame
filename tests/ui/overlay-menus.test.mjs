import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * RC Fix 1, punto 5 — le tendine lunghe.
 *
 * Il difetto non era di una schermata: era delle **primitive**. Una tendina
 * con molte voci — province, sport, categorie, atleti — cresceva oltre lo
 * schermo, veniva ritagliata dal contenitore e non offriva nessun modo di
 * arrivare alle voci in fondo. Tre cause distinte, tutte qui:
 *
 * 1. `SelectContent` non aveva un'altezza massima ne i comandi di
 *    scorrimento di Radix;
 * 2. Radix nasconde la barra di scorrimento del viewport con uno `<style>`
 *    iniettato a runtime, e nessuna regola la rimetteva;
 * 3. `CommandItem` usava `data-[disabled]`, che in CSS verifica la
 *    **presenza** dell'attributo: `cmdk` scrive `data-disabled="false"` sulle
 *    voci abilitate, quindi tutte risultavano spente e non cliccabili.
 *
 * Sono test sul sorgente perche il progetto non ha un renderer di componenti
 * (vedi 15 — Testing); sono comunque le tre righe che, se tornano come prima,
 * riportano il difetto identico.
 */

const read = (relative) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const SELECT = read("src/components/ui/select.tsx");
const COMMAND = read("src/components/ui/command.tsx");
const DROPDOWN = read("src/components/ui/dropdown-menu.tsx");
const POPOVER = read("src/components/ui/popover.tsx");
const GLOBALS = read("src/app/globals.css");

test("la tendina di scelta ha un'altezza massima legata allo spazio disponibile", () => {
  assert.match(
    SELECT,
    /max-h-\[min\(20rem,var\(--radix-select-content-available-height\)\)\]/,
    "senza altezza massima la tendina esce dallo schermo",
  );
});

test("la tendina di scelta monta i due comandi di scorrimento", () => {
  assert.match(SELECT, /<SelectScrollUpButton \/>/);
  assert.match(SELECT, /<SelectScrollDownButton \/>/);
  assert.match(SELECT, /SelectPrimitive\.ScrollUpButton/);
  assert.match(SELECT, /SelectPrimitive\.ScrollDownButton/);
});

test("il viewport della tendina non e alto quanto il campo", () => {
  assert.equal(
    /h-\[var\(--radix-select-trigger-height\)\]/.test(SELECT),
    false,
    "quell'altezza fissa lascia visibile una voce sola",
  );
});

test("la barra di scorrimento delle tendine e rimessa con specificita maggiore", () => {
  assert.match(
    GLOBALS,
    /\[data-radix-select-viewport\]\[data-radix-select-viewport\]\s*\{[^}]*scrollbar-width:\s*thin/,
    "Radix la nasconde da dentro il portale: serve una regola piu specifica",
  );
  assert.match(
    GLOBALS,
    /\[data-radix-select-viewport\]\[data-radix-select-viewport\]::-webkit-scrollbar\s*\{[^}]*display:\s*block/,
  );
});

test("una voce di ricerca si spegne solo quando e davvero disabilitata", () => {
  assert.match(COMMAND, /data-\[disabled=true\]:pointer-events-none/);
  assert.match(COMMAND, /data-\[disabled=true\]:opacity-50/);
  assert.equal(
    /data-\[disabled\]:/.test(COMMAND),
    false,
    'cmdk scrive data-disabled="false" sulle voci abilitate: il selettore per presenza le spegne tutte',
  );
});

test("l'elenco a ricerca scorre e non supera meta schermo", () => {
  assert.match(COMMAND, /max-h-\[min\(18rem,50vh\)\]/);
  assert.match(COMMAND, /overflow-y-auto/);
});

test("menu contestuali e popover non superano lo spazio disponibile", () => {
  assert.match(
    DROPDOWN,
    /max-h-\[var\(--radix-dropdown-menu-content-available-height\)\][^"]*overflow-y-auto/,
  );
  assert.equal(
    (DROPDOWN.match(
      /max-h-\[var\(--radix-dropdown-menu-content-available-height\)\]/g,
    ) || []).length,
    2,
    "vale per il menu e per i suoi sottomenu",
  );
  assert.match(
    POPOVER,
    /max-h-\[var\(--radix-popover-content-available-height\)\][^"]*overflow-y-auto/,
  );
});
