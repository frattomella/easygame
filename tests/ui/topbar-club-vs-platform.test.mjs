import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Le due chrome sono cose diverse, e vanno tenute diverse (WP-45).
 *
 * La pulizia del Blocco 3 aveva tolto azioni rapide e assistenza da **tutte**
 * le barre: era richiesta per la sola console `platform_admin`, che non e un
 * club e non deve avere scorciatoie di club. Sulla topbar del club quelle due
 * funzioni servono e sono tornate.
 *
 * La chat resta fuori da entrambe finche non esiste una funzione vera: era un
 * pannello senza backend.
 *
 * Sono test sul sorgente, non sul rendering: il progetto non ha un renderer di
 * componenti (vedi 15 - Testing), ma queste regole sono verificabili leggendo
 * i file ed e esattamente cosi che si sono persi i comandi la prima volta.
 */

const SRC = path.join(process.cwd(), "src");
/**
 * Il sorgente si legge **normalizzato a LF**.
 *
 * Alcune asserzioni di questo file misurano una distanza fra due punti del
 * sorgente (`[\s\S]{0,240}`). In un checkout CRLF ogni riga compresa fra i
 * due punti aggiunge un carattere, la distanza cresce e il test fallisce su
 * un codice che non e cambiato: verificava il checkout, non il componente.
 *
 * La normalizzazione qui e la difesa vera, perche vale comunque sia
 * configurato `core.autocrlf` sulla macchina di chi esegue i test. La
 * convenzione di repository sta in `.gitattributes`; le due cose sono
 * complementari, non alternative. Vedi D30 in 16 - Debito tecnico.
 */
const read = (file) =>
  readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

/** Sorgente senza commenti: un commento che *nomina* una cosa non e la cosa. */
const readCode = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const CLUB_HEADER = "components/dashboard/Header.tsx";
const CLUB_SIDEBAR = "components/dashboard/Sidebar.tsx";
const CLUB_MOBILE = "components/layout/MobileTopBar.tsx";
const PLATFORM_SHELL = "components/platform-admin/platform-admin-shell.tsx";
const CLUB_IDENTITY = "components/brand/club-identity.tsx";

// --- topbar del club: cosa deve esserci --------------------------------------

test("la topbar del club ha le azioni rapide", () => {
  const header = readCode(CLUB_HEADER);

  assert.match(header, /QUICK_ACTIONS/, "l'elenco delle azioni rapide");
  assert.match(header, /Azioni rapide/, "il comando visibile all'utente");
  assert.match(header, /quickActionsOpen/, "il pannello che le mostra");
});

test("le azioni rapide del club passano dalla matrice permessi", () => {
  for (const file of [CLUB_HEADER, CLUB_MOBILE]) {
    const source = readCode(file);
    assert.match(
      source,
      /canAccessPath\(\s*activeRole\s*,\s*action\.href/,
      `${file}: una scorciatoia verso un'area vietata non deve comparire`,
    );
  }
});

test("la topbar del club ha l'assistenza", () => {
  const header = readCode(CLUB_HEADER);

  assert.match(header, /HelpCircle/);
  assert.match(header, /Assistenza/);
  assert.match(header, /cedisoft\.it\/contatti/);
});

/**
 * Blocco 7: il marchio esce dalla topbar del club.
 *
 * Su desktop la sidebar e sempre visibile a fianco della barra: due EasyGame a
 * 30 px di distanza non informano, e il secondo toglieva larghezza al logo del
 * club — l'unica identita che cambia da una schermata all'altra. Il ritorno
 * all'elenco dei club, che era la sola funzione del logo, si sposta sul
 * marchio della sidebar.
 */
test("il marchio EasyGame sta nella sidebar, non nella topbar del club", () => {
  assert.equal(
    /<EasyGameLogo/.test(readCode(CLUB_HEADER)),
    false,
    "la topbar del club non ripete il marchio: c'e gia nella sidebar",
  );

  const sidebar = readCode(CLUB_SIDEBAR);
  assert.match(sidebar, /<EasyGameLogo/, "il marchio e l'SVG in repo");
  assert.match(
    sidebar,
    /href="\/account"[\s\S]{0,240}<EasyGameLogo/,
    "dal marchio si torna all'elenco dei club",
  );
});

test("le due topbar del club mostrano club e stagione", () => {
  for (const file of [CLUB_HEADER, CLUB_MOBILE]) {
    assert.match(readCode(file), /ClubIdentity/, `${file} deve montare ClubIdentity`);
  }
});

test("su telefono le azioni rapide e l'assistenza stanno nel menu", () => {
  const mobile = readCode(CLUB_MOBILE);

  assert.match(mobile, /quickActions/, "le azioni rapide esistono anche su telefono");
  assert.match(mobile, /Assistenza/);
  assert.equal(
    /<header[\s\S]*?Zap[\s\S]*?<\/header>/.test(mobile),
    false,
    "nella barra non ci va un pulsante in piu: la larghezza serve a club e stagione",
  );
});

// --- topbar del club: cosa non deve esserci ----------------------------------

test("la chat resta fuori da entrambe le chrome", () => {
  for (const file of [CLUB_HEADER, CLUB_MOBILE, PLATFORM_SHELL]) {
    assert.equal(
      /ChatButton|ui\/chat/.test(readCode(file)),
      false,
      `${file}: la chat non ha un backend, non deve avere un comando`,
    );
  }
});

// --- console di piattaforma: separata ----------------------------------------

test("la console di piattaforma non ha le funzioni di club", () => {
  const shell = readCode(PLATFORM_SHELL);

  for (const [pattern, cosa] of [
    [/QUICK_ACTIONS|quickActions|Azioni rapide/i, "le azioni rapide"],
    [/HelpCircle|Assistenza/, "l'assistenza"],
    [/ClubIdentity|SeasonPlate/, "l'identita di club e la stagione"],
  ]) {
    assert.equal(
      pattern.test(shell),
      false,
      `${cosa}: la console di piattaforma non amministra un club`,
    );
  }
});

test("la console di piattaforma non monta la chrome del club", () => {
  const page = read("app/private/easygame-platform-admin-0c7a/page.tsx");

  assert.equal(/dashboard\/Sidebar|dashboard\/Header/.test(page), false);
  assert.match(page, /PlatformAdminShell/);
});

// --- gerarchia della riga identita -------------------------------------------

test("il logo del club non ha cornice ed e il piu grande della riga", () => {
  const identity = readCode(CLUB_IDENTITY);
  const logoBlock = identity.slice(
    identity.indexOf("relative grid shrink-0"),
    identity.indexOf("</span>", identity.indexOf("relative grid shrink-0")),
  );

  assert.equal(
    /border/.test(logoBlock),
    false,
    "niente cornice attorno al marchio del club",
  );
  assert.match(logoBlock, /h-12 w-12/, "sulla topbar desktop il logo e 48 px");
});

test("il nome del club e il testo piu grande della barra", () => {
  assert.match(
    readCode(CLUB_IDENTITY),
    /compact \? "text-base" : "text-xl"/,
    "il nome del club era text-base: piu piccolo del titolo di una card",
  );
});

test("la targhetta stagione e discreta e non spinge via il resto", () => {
  const identity = readCode(CLUB_IDENTITY);
  const plate = identity.slice(identity.indexOf("const shared = cn("));

  assert.equal(
    /border-amber|border\b/.test(plate.slice(0, plate.indexOf("if (!onClick)"))),
    false,
    "senza bordo: e una targhetta, non un badge",
  );
  assert.match(
    identity,
    /flex-wrap items-center/,
    "la stagione sta accanto al nome e va a capo, invece di allargare la riga",
  );
});

/**
 * Blocco 7: la targhetta stagione e grigia.
 *
 * L'ambra e un colore semantico e nelle tabelle vuol dire "guarda qui" (quota
 * in attesa, certificato in scadenza). Sulla stagione era acceso sempre, su un
 * valore quasi sempre corretto: un avviso permanente non e un avviso, e
 * consumava il significato dell'ambra ovunque.
 */
test("la targhetta stagione e neutra, non ambra", () => {
  const identity = readCode(CLUB_IDENTITY);
  const plate = identity.slice(identity.indexOf("export function SeasonPlate"));

  assert.equal(
    /amber/.test(plate),
    false,
    "nessuna classe ambra nella targhetta stagione",
  );

  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const token = /--eg-season:\s*([^;]+);/.exec(css);
  assert.ok(token, "il token della stagione deve esistere");
  assert.equal(
    token[1].trim(),
    "#475569",
    "il token della stagione e uno slate, non un ambra",
  );
});

// --- tipografia: nessun font nuovo, nessuna taglia inventata ------------------

/**
 * Documenti generati per stampa, PDF ed email: vivono fuori dal DOM
 * dell'applicazione, dove `next/font` non arriva e un font di sistema e
 * l'unica scelta possibile.
 */
const DOCUMENT_GENERATORS = new Set([
  "app/modulistica/page.tsx",
  "app/movements/page.tsx",
  "app/private/api-docs/api-docs-client.tsx",
  "components/forms/FormShareDialog.tsx",
  "lib/people-pdf-export.ts",
  "lib/clothing-supplier-order-pdf.ts",
  /*
    Il documento di una ricevuta o di una fattura si stampa, e spesso da un
    portatile che non ha i font dell'applicazione installati. Dichiarare li
    dentro un font di sistema non e un'eccezione allo stile: e la stessa
    ragione per cui la pagina non carica niente da fuori.
  */
  "lib/documents/document-view.ts",
  "lib/server/auth-workflows.ts",
]);

/**
 * Superfici che **definiscono** l'identita visiva: chrome, marchio, accesso,
 * console di piattaforma. Qui la scala tipografica non ammette eccezioni.
 *
 * Il resto dell'applicazione porta ancora una quindicina di taglie scritte a
 * mano in griglie dense (vedi D26 in 16 - Debito tecnico): sono precedenti a
 * questa regola e si normalizzano quando si tocca quella pagina, non con un
 * rifacimento di massa.
 */
const IDENTITY_SURFACES = [
  "components/brand/",
  "components/platform-admin/",
  "components/account/",
  "components/auth/",
  "components/dashboard/Header.tsx",
  "components/layout/MobileTopBar.tsx",
  "components/ui/save-status.tsx",
  "components/ui/app-loading-screen.tsx",
];

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path.relative(SRC, full).replace(/\\/g, "/"));
    }
  }
  return out;
};

const APP_FILES = walk(SRC);

test("nessun font dichiarato fuori dai token, salvo stampa e email", () => {
  const offenders = APP_FILES.filter((file) => {
    if (DOCUMENT_GENERATORS.has(file)) return false;
    return /font-family\s*:\s*(?!var\(--font-)/.test(read(file));
  });

  assert.deepEqual(
    offenders,
    [],
    "l'applicazione ha due font e basta: --font-sans e --font-display",
  );
});

test("nessun font nuovo importato da next/font", () => {
  const layout = read("app/layout.tsx");
  const imported = [...layout.matchAll(/import\s*\{([^}]*)\}\s*from\s*"next\/font\/google"/g)]
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim())
    .filter(Boolean)
    .sort();

  assert.deepEqual(
    imported,
    ["Archivo", "Inter"],
    "Inter per testo e dati, Archivo per i titoli: non se ne aggiungono altri",
  );

  const others = APP_FILES.filter(
    (file) => file !== "app/layout.tsx" && /next\/font/.test(read(file)),
  );
  assert.deepEqual(others, [], "i font si dichiarano solo nel layout radice");
});

test("le superfici dell'identita non inventano taglie di testo", () => {
  const offenders = APP_FILES.filter(
    (file) =>
      IDENTITY_SURFACES.some((surface) => file.startsWith(surface)) &&
      /text-\[[0-9.]+(rem|px)\]/.test(read(file)),
  );

  assert.deepEqual(
    offenders,
    [],
    "si usano la scala Tailwind e le due utility .eg-eyebrow / .eg-eyebrow-sm",
  );
});

test("le taglie di occhiello sono due, definite in un posto solo", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(css, /\.eg-eyebrow\s*\{/);
  assert.match(css, /\.eg-eyebrow-sm\s*\{/);
  assert.equal(
    (css.match(/\.eg-eyebrow(-sm)?\s*\{/g) || []).length,
    2,
    "nessuna terza variante",
  );
});

// --- indipendenza dai fine riga (D30) ----------------------------------------

/**
 * Il difetto che questo test presidia.
 *
 * L'asserzione «dal marchio si torna all'elenco dei club» misura al carattere
 * la distanza fra `href="/account"` e `<EasyGameLogo`: 240 con fine riga LF.
 * In un checkout CRLF le righe comprese fra i due punti aggiungono un `\r`
 * ciascuna, la distanza supera il limite e il test fallisce su un componente
 * che nessuno ha toccato. E successo nel Workstream B, e la reazione naturale
 * — cambiare `core.autocrlf` sulla macchina — nasconde il problema invece di
 * chiuderlo, perche la macchina successiva lo ritrova identico.
 *
 * Qui il checkout CRLF viene **simulato**, cosi la garanzia vale anche dove i
 * file sul disco sono in LF e nessuno se ne accorgerebbe.
 */
test("le asserzioni reggono anche in un checkout CRLF", () => {
  const crlf = readFileSync(path.join(SRC, CLUB_SIDEBAR), "utf8").replace(
    /\r?\n/g,
    "\r\n",
  );

  assert.ok(crlf.includes("\r\n"), "la simulazione deve produrre davvero CRLF");

  const comeLoLeggeIlTest = crlf
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  assert.equal(
    comeLoLeggeIlTest.includes("\r"),
    false,
    "dopo la normalizzazione non deve restare nessun ritorno a capo CRLF",
  );
  assert.match(
    comeLoLeggeIlTest,
    /href="\/account"[\s\S]{0,240}<EasyGameLogo/,
    "la distanza fra marchio e link non deve dipendere dal checkout",
  );
});

test("il sorgente letto dai test e sempre normalizzato a LF", () => {
  for (const file of [CLUB_HEADER, CLUB_SIDEBAR, CLUB_MOBILE, PLATFORM_SHELL]) {
    assert.equal(read(file).includes("\r"), false, `${file} deve arrivare in LF`);
  }
});
