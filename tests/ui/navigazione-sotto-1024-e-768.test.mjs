import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **La navigazione sotto la soglia, presidiata invece che ricordata.**
 *
 * Il prodotto ha due gusci, e ciascuno ha **due** elenchi di navigazione
 * duplicati a mano:
 *
 * | guscio | barra larga | menu stretto | soglia |
 * |--------|-------------|--------------|--------|
 * | club | `Sidebar.tsx` (`hidden lg:flex`) | `MobileTopBar.tsx` | 1024 px |
 * | allenatore | `TrainerSidebar.tsx` (dentro `hidden md:block`) | `trainer-dashboard-club-shell.tsx` | 768 px |
 *
 * Sotto la soglia la barra laterale **non e montata**: non e ridotta, non e
 * un'icona, non c'e. Una voce che sta solo li e quindi una pagina che da un
 * telefono si raggiunge solo digitandone l'indirizzo — cioe, in pratica, una
 * pagina che non esiste.
 *
 * **E la terza volta.** La Wave 5 aveva dimenticato «Notifiche»
 * dell'allenatore; la Wave 6 ha dimenticato «Squadre» e «I miei compensi» da
 * quel lato e «Documenti», «Ruoli e accessi» e «Registro attivita» dal lato
 * club — e prima ancora erano rimaste indietro Calendario, Strutture,
 * Comunicazioni, Lavoro sportivo e Abbigliamento. Ogni volta la correzione e
 * stata la stessa: aggiungere la riga mancante. Ogni volta e mancata la
 * difesa.
 *
 * Questo file e la difesa. Non elenca le voci: le **ricava** dalle barre
 * larghe e pretende di ritrovarle nei menu stretti. Una voce nuova aggiunta
 * solo alla barra desktop fa fallire il test da sola, senza chiedere a nessuno
 * di ricordarsene.
 *
 * **Cosa questo test non e.** Non apre nessuna pagina e non misura niente a
 * 375 px: e un confronto fra due elenchi nel codice. Dice che la voce c'e in
 * entrambi, non che si legge — quello resta il collaudo su schermo.
 */

const RADICE = process.cwd();
const leggi = (relativo) =>
  readFileSync(path.join(RADICE, ...relativo.split("/")), "utf8");

/**
 * I commenti di questo repository raccontano il difetto chiuso, e nominano
 * quindi rotte e chiavi di cui parlano. Cercarle nel testo intero troverebbe
 * la **spiegazione** invece del codice: si guarda il codice.
 */
const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Il blocco di dichiarazione di un elenco di voci, isolato dal resto del file. */
const blocco = (sorgente, apertura, nome) => {
  const trovato = senzaCommenti(sorgente).match(
    new RegExp(`${apertura}[\\s\\S]*?\\n\\];`),
  );
  assert.ok(trovato, `${nome}: elenco non trovato, il presidio non sa piu leggerlo`);
  return trovato[0];
};

const hrefDi = (testo) =>
  [...testo.matchAll(/href:\s*"([^"]+)"/g)].map((occorrenza) => occorrenza[1]);

/* ======================================================================== */
/*  Guscio del club — soglia 1024 px                                        */
/* ======================================================================== */

const SIDEBAR_CLUB = blocco(
  leggi("src/components/dashboard/Sidebar.tsx"),
  "const sidebarGroups: SidebarGroup\\[\\] = \\[",
  "Sidebar.tsx",
);
const MENU_CLUB = blocco(
  leggi("src/components/layout/MobileTopBar.tsx"),
  "const navSections = \\[",
  "MobileTopBar.tsx",
);

const VOCI_DESKTOP_CLUB = hrefDi(SIDEBAR_CLUB);
const VOCI_MOBILE_CLUB = hrefDi(MENU_CLUB);

/**
 * **Le eccezioni, e come si scrivono.**
 *
 * Una voce puo legittimamente restare solo sulla barra larga: una superficie
 * che a 375 px non si puo usare davvero — non «e stretta», ma **non si puo
 * usare** — e meglio assente che presente e inutilizzabile. In quel caso va
 * dichiarata qui **con il motivo**, e il motivo deve dire perche la pagina non
 * serve su un telefono, non che ci si e dimenticati di guardarla.
 *
 * L'elenco e vuoto, ed e la risposta giusta: nessuna delle trentatre voci del
 * club e stata pensata per il solo desktop. Chi ne aggiunge una si assume di
 * scrivere qui la frase che lo giustifica.
 */
const SOLO_DESKTOP_CLUB = {
  /* esempio: "/una-rotta": "motivo per cui a 375 px non ha senso" */
};

test("ogni voce della barra laterale del club esiste anche nel menu sotto i 1024 px", () => {
  const mancanti = VOCI_DESKTOP_CLUB.filter(
    (href) =>
      !VOCI_MOBILE_CLUB.includes(href) &&
      !Object.prototype.hasOwnProperty.call(SOLO_DESKTOP_CLUB, href),
  );

  assert.deepEqual(
    mancanti,
    [],
    `Voci raggiungibili solo sopra i 1024 px: ${mancanti.join(", ")}. Sotto quella soglia \`Sidebar\` non e montata: la pagina esiste solo per chi ne conosce l'indirizzo. Aggiungila a \`navSections\` in MobileTopBar.tsx, oppure dichiarala in SOLO_DESKTOP_CLUB spiegando perche su un telefono non serve.`,
  );
});

test("il menu stretto del club non inventa voci che la barra laterale non ha", () => {
  const inventate = VOCI_MOBILE_CLUB.filter(
    (href) => !VOCI_DESKTOP_CLUB.includes(href),
  );

  assert.deepEqual(
    inventate,
    [],
    `Voci presenti solo sul telefono: ${inventate.join(", ")}. Due menu che divergono sono due prodotti diversi a seconda della larghezza dello schermo.`,
  );
});

test("le eccezioni dichiarate sono ancora eccezioni", () => {
  for (const [href, motivo] of Object.entries(SOLO_DESKTOP_CLUB)) {
    assert.equal(
      VOCI_DESKTOP_CLUB.includes(href),
      true,
      `${href}: dichiarata solo-desktop ma non e piu nella barra laterale, l'eccezione e scaduta`,
    );
    assert.equal(
      VOCI_MOBILE_CLUB.includes(href),
      false,
      `${href}: dichiarata solo-desktop ed e nel menu mobile, togli l'eccezione`,
    );
    assert.equal(
      typeof motivo === "string" && motivo.trim().length > 20,
      true,
      `${href}: un'eccezione senza un motivo scritto e una dimenticanza con un nome piu bello`,
    );
  }
});

test("nessuna voce del menu del club punta a una rotta che non esiste", () => {
  for (const href of VOCI_MOBILE_CLUB) {
    const segmenti = href.replace(/^\//, "").split("/");
    assert.equal(
      existsSync(path.join(RADICE, "src", "app", ...segmenti, "page.tsx")),
      true,
      `${href}: voce di menu verso una pagina che non c'e, cioe un 404 con l'aspetto di una funzione`,
    );
  }
});

/**
 * Le tre voci che la Wave 6 aveva lasciato fuori. I test qui sopra le coprono
 * gia — sono ricavate, non elencate — ma nominarle serve al prossimo che legga
 * un fallimento e voglia sapere di che difetto si tratta.
 */
test("le tre voci della Wave 6 si raggiungono da un telefono", () => {
  for (const href of ["/documenti", "/dashboard/access-management", "/audit"]) {
    assert.equal(
      VOCI_MOBILE_CLUB.includes(href),
      true,
      `${href}: a 375 e 768 px non c'era nessun modo di arrivarci`,
    );
  }
});

/* ======================================================================== */
/*  Guscio dell'allenatore — soglia 768 px                                  */
/* ======================================================================== */

/*
  Qui il confronto non e sugli indirizzi ma sulle **chiavi di permesso**: i due
  elenchi scrivono la rotta in due modi diversi — la barra laterale a mano, il
  guscio via `TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY` — e la chiave e cio che
  davvero deve coincidere. Una voce filtrata da un lato e libera dall'altro
  sarebbe una porta che si apre o no a seconda della larghezza dello schermo.
*/
const chiaviNavigazione = (sorgente) =>
  new Set(
    [...senzaCommenti(sorgente).matchAll(/permissions\.navigation\.([A-Za-z]+)/g)].map(
      (occorrenza) => occorrenza[1],
    ),
  );

const CHIAVI_SIDEBAR_TRAINER = chiaviNavigazione(
  leggi("src/components/trainer/TrainerSidebar.tsx"),
);
const GUSCIO_TRAINER = leggi(
  "src/components/trainer/trainer-dashboard-club-shell.tsx",
);
const CHIAVI_MENU_TRAINER = chiaviNavigazione(GUSCIO_TRAINER);

/** Stessa regola delle eccezioni del club: si dichiara con il motivo. */
const SOLO_DESKTOP_TRAINER = {
  /* esempio: "chiave": "motivo per cui a 375 px non ha senso" */
};

test("ogni voce della barra dell'allenatore esiste anche nel menu sotto i 768 px", () => {
  const mancanti = [...CHIAVI_SIDEBAR_TRAINER].filter(
    (chiave) =>
      !CHIAVI_MENU_TRAINER.has(chiave) &&
      !Object.prototype.hasOwnProperty.call(SOLO_DESKTOP_TRAINER, chiave),
  );

  assert.deepEqual(
    mancanti,
    [],
    `Voci raggiungibili solo sopra i 768 px: ${mancanti.join(", ")}. \`TrainerSidebar\` sta dentro un \`hidden md:block\`, e un allenatore apre queste pagine in palestra dal telefono.`,
  );
});

test("il menu stretto dell'allenatore non inventa voci che la barra non ha", () => {
  const inventate = [...CHIAVI_MENU_TRAINER].filter(
    (chiave) => !CHIAVI_SIDEBAR_TRAINER.has(chiave),
  );

  assert.deepEqual(inventate, [], `Voci presenti solo sul telefono: ${inventate.join(", ")}`);
});

test("le eccezioni dell'allenatore sono ancora eccezioni", () => {
  for (const [chiave, motivo] of Object.entries(SOLO_DESKTOP_TRAINER)) {
    assert.equal(
      CHIAVI_SIDEBAR_TRAINER.has(chiave),
      true,
      `${chiave}: dichiarata solo-desktop ma non e piu nella barra laterale`,
    );
    assert.equal(
      typeof motivo === "string" && motivo.trim().length > 20,
      true,
      `${chiave}: un'eccezione senza motivo scritto non e un'eccezione`,
    );
  }
});

test("le tre voci della Wave 6 dell'allenatore si raggiungono da un telefono", () => {
  for (const chiave of ["categories", "notifications", "compensation"]) {
    assert.equal(
      CHIAVI_MENU_TRAINER.has(chiave),
      true,
      `${chiave}: manca dal menu mobile, quindi da un telefono la sezione non si raggiunge`,
    );
  }
});

test("le voci del menu dell'allenatore passano dalla mappa delle rotte, non da indirizzi scritti a mano", () => {
  const senzaCommentiGuscio = senzaCommenti(GUSCIO_TRAINER);

  for (const chiave of CHIAVI_MENU_TRAINER) {
    assert.equal(
      senzaCommentiGuscio.includes(
        `TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.${chiave}`,
      ),
      true,
      `${chiave}: la voce deve prendere la rotta dalla mappa, altrimenti un giorno la mappa cambia e il menu no`,
    );
  }
});

/* ======================================================================== */
/*  Una barra sola per pagina                                               */
/* ======================================================================== */

/**
 * **`Header` contiene gia `MobileTopBar`.**
 *
 * Sotto i 1024 px `Header` monta la barra mobile per conto proprio. Una pagina
 * che renderizza **entrambi** impila due intestazioni identiche, e su 812 px di
 * altezza sono due fasce rubate al contenuto.
 *
 * Le tre pagine in elenco hanno lo stesso difetto e sono di altre lane: il test
 * non le fotografa come corrette — pretende solo che il numero non **cresca**.
 * Chi ne corregge una toglie la propria riga da qui.
 */
const DOPPIA_BARRA_NOTA = new Set([
  "app/modulistica/page.tsx",
  "app/soci/page.tsx",
  "app/structures/page.tsx",
]);

const paginePagina = () => {
  const radice = path.join(RADICE, "src", "app");
  const trovate = [];

  const scendi = (cartella) => {
    for (const voce of readdirSync(cartella)) {
      const completo = path.join(cartella, voce);
      if (statSync(completo).isDirectory()) {
        scendi(completo);
        continue;
      }
      if (completo.endsWith(".tsx")) trovate.push(completo);
    }
  };

  scendi(radice);
  return trovate;
};

test("nessuna pagina nuova impila due barre mobili", () => {
  const colpevoli = paginePagina()
    .filter((file) => {
      const sorgente = senzaCommenti(readFileSync(file, "utf8"));
      return sorgente.includes("<Header") && sorgente.includes("<MobileTopBar");
    })
    .map((file) =>
      path.relative(path.join(RADICE, "src"), file).split(path.sep).join("/"),
    );

  const nuove = colpevoli.filter((file) => !DOPPIA_BARRA_NOTA.has(file));

  assert.deepEqual(
    nuove,
    [],
    `${nuove.join(", ")}: \`Header\` monta gia \`MobileTopBar\` sotto i 1024 px, e la seconda barra e un doppione visibile solo da un telefono. Passa il titolo a \`Header\` e togli la barra.`,
  );
});

test("«Documenti» non impila piu due barre", () => {
  const sorgente = senzaCommenti(leggi("src/app/documenti/page.tsx"));

  assert.equal(sorgente.includes("<Header"), true);
  assert.equal(
    sorgente.includes("<MobileTopBar"),
    false,
    "la barra mobile arriva da Header: montarne una seconda impilava due intestazioni identiche",
  );
  assert.match(
    sorgente,
    /<Header title="Documenti" \/>/,
    "il titolo deve passare da Header, che lo gira alla barra mobile",
  );
});
