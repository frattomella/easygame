import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **La navigazione sotto la soglia, presidiata invece che ricordata.**
 *
 * Il prodotto ha avuto per tre Wave due elenchi di navigazione copiati a mano
 * per ogni guscio — la barra larga e il menu stretto — e per tre volte una
 * voce e nata da un lato senza arrivare dall'altro (Notifiche, Squadre, I miei
 * compensi dell'allenatore; Documenti, Ruoli e accessi, Registro attivita del
 * club). Ogni volta la correzione e stata aggiungere la riga mancante; ogni
 * volta e mancata la difesa.
 *
 * Dal Web V2 la difesa e **strutturale**: l'elenco e uno solo per guscio.
 *
 * | guscio | fonte unica | chi la legge |
 * |--------|-------------|--------------|
 * | club | `NAV_GROUPS` in `web/shell/navigation.ts` | `Sidebar` e `MobileTopBar` via `visibleNavGroups` |
 * | allenatore | `trainerAreaNavGroups` in `web/shell/area-navigation.ts` | `AreaShell` (barra + menu) |
 * | famiglia | `parentAreaNavGroups` | `AreaShell` |
 * | atleta | `ATHLETE_AREA_NAV_GROUPS` | `AreaShell` |
 *
 * Questo file pretende che la struttura resti tale: nessun elenco di `href`
 * scritto a mano nei menu stretti, ogni chiave di permesso dell'allenatore
 * nella fonte unica, ogni voce verso una pagina che esiste.
 *
 * **Cosa questo test non e.** Non apre nessuna pagina e non misura niente a
 * 375 px: legge il codice. Dice che la voce c'e, non che si legge — quello
 * resta il collaudo su schermo.
 */

const RADICE = process.cwd();
const leggi = (relativo) =>
  readFileSync(path.join(RADICE, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const blocco = (sorgente, apertura, nome) => {
  const trovato = senzaCommenti(sorgente).match(
    new RegExp(`${apertura}[\\s\\S]*?\\n\\];`),
  );
  assert.ok(trovato, `${nome}: elenco non trovato, il presidio non sa piu leggerlo`);
  return trovato[0];
};

const hrefDi = (testo) =>
  [...testo.matchAll(/href:\s*"([^"]+)"/g)].map((occorrenza) => occorrenza[1]);

const paginaEsiste = (href) => {
  const segmenti = href.split("?")[0].replace(/^\//, "").split("/");
  return existsSync(path.join(RADICE, "src", "app", ...segmenti, "page.tsx"));
};

/* ======================================================================== */
/*  Guscio del club — soglia 1024 px                                        */
/* ======================================================================== */

const NAVIGAZIONE = leggi("src/components/web/shell/navigation.ts");
const SIDEBAR_CLUB = blocco(
  NAVIGAZIONE,
  "export const NAV_GROUPS: readonly NavGroup\\[\\] = \\[",
  "navigation.ts",
);
const VOCI_DESKTOP_CLUB = hrefDi(SIDEBAR_CLUB);
const BARRA_MOBILE = senzaCommenti(leggi("src/components/layout/MobileTopBar.tsx"));
const SIDEBAR = senzaCommenti(leggi("src/components/web/shell/Sidebar.tsx"));

test("la barra mobile del club legge le voci dalla stessa fonte della barra laterale", () => {
  assert.match(
    BARRA_MOBILE,
    /visibleNavGroups/,
    "MobileTopBar deve derivare le voci da `visibleNavGroups`: un elenco copiato a mano e la terza Wave che dimentica una voce",
  );
  assert.match(SIDEBAR, /visibleNavGroups/);
  assert.deepEqual(
    hrefDi(BARRA_MOBILE),
    [],
    "nessun `href` scritto a mano nella barra mobile: le voci arrivano da navigation.ts",
  );
  assert.doesNotMatch(BARRA_MOBILE, /const navSections\s*=/, "l'elenco duplicato del club non deve tornare");
});

test("la barra mobile applica lo stesso filtro per ruolo della barra laterale", () => {
  /* `visibleNavGroups` porta con se `canAccessPath` e `canOpenAccounting`: un solo filtro, non due. */
  assert.match(NAVIGAZIONE, /canAccessPath\(context\.role, item\.href/);
  assert.match(NAVIGAZIONE, /canOpenAccounting\(role \|\| null\)/);
});

test("nessuna voce del club punta a una rotta che non esiste", () => {
  for (const href of VOCI_DESKTOP_CLUB) {
    assert.equal(
      paginaEsiste(href),
      true,
      `${href}: voce di menu verso una pagina che non c'e, cioe un 404 con l'aspetto di una funzione`,
    );
  }
});

test("le tre voci della Wave 6 stanno nella fonte unica", () => {
  for (const href of ["/documenti", "/dashboard/access-management", "/audit"]) {
    assert.equal(VOCI_DESKTOP_CLUB.includes(href), true, `${href}: mancava da un telefono`);
  }
});

/* ======================================================================== */
/*  Le aree: allenatore, famiglia, atleta                                   */
/* ======================================================================== */

const AREE = senzaCommenti(leggi("src/components/web/shell/area-navigation.ts"));
const PERMESSI_TRAINER = senzaCommenti(leggi("src/lib/trainer-dashboard-permissions.ts"));

const chiaviMappaRotte = () => {
  const mappa = PERMESSI_TRAINER.match(
    /TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY[\s\S]*?= \{([\s\S]*?)\};/,
  );
  assert.ok(mappa, "la mappa delle rotte dell'allenatore non si trova piu");
  return [...mappa[1].matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]);
};

const chiaviFonteUnica = () => {
  const blocco = AREE.match(/const TRAINER_NAV[\s\S]*?\n\];/);
  assert.ok(blocco, "TRAINER_NAV non si trova piu in area-navigation.ts");
  return [...blocco[0].matchAll(/key:\s*"([a-z]+)"/g)].map((m) => m[1]);
};

test("ogni chiave di navigazione dell'allenatore e una voce della fonte unica", () => {
  const mappa = chiaviMappaRotte();
  const fonte = chiaviFonteUnica();
  const mancanti = mappa.filter((chiave) => !fonte.includes(chiave));
  assert.deepEqual(
    mancanti,
    [],
    `Chiavi con una rotta ma senza voce di menu: ${mancanti.join(", ")}. Una pagina senza voce esiste solo per chi ne conosce l'indirizzo.`,
  );
  const inventate = fonte.filter((chiave) => !mappa.includes(chiave));
  assert.deepEqual(inventate, [], `Voci senza una rotta nella mappa: ${inventate.join(", ")}`);
});

test("le voci dell'allenatore prendono la rotta dalla mappa e si filtrano con il permesso di navigazione", () => {
  assert.match(AREE, /TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY\[item\.key\]/);
  assert.match(AREE, /permissions\.navigation\[item\.key\]/);
  assert.deepEqual(
    hrefDi(AREE.match(/const TRAINER_NAV[\s\S]*?\n\];/)[0]),
    [],
    "nessun indirizzo dell'allenatore scritto a mano",
  );
});

test("i tre gusci delle aree montano AreaShell, che disegna barra e menu dallo stesso elenco", () => {
  const gusci = {
    "src/components/trainer/trainer-dashboard-club-shell.tsx": "trainerAreaNavGroups",
    "src/components/parent-dashboard/parent-dashboard-shell.tsx": "parentAreaNavGroups",
    "src/components/athlete/athlete-area-shell.tsx": "ATHLETE_AREA_NAV_GROUPS",
  };
  for (const [file, fonte] of Object.entries(gusci)) {
    const sorgente = senzaCommenti(leggi(file));
    assert.match(sorgente, /<AreaShell/, `${file}: deve montare AreaShell`);
    assert.match(sorgente, new RegExp(fonte), `${file}: deve leggere le voci da ${fonte}`);
    assert.deepEqual(hrefDi(sorgente), [], `${file}: nessun elenco di voci scritto a mano nel guscio`);
  }
  const shell = senzaCommenti(leggi("src/components/web/shell/AreaShell.tsx"));
  assert.match(shell, /<Sidebar groups=\{groups\}/);
  assert.match(shell, /mobileNavSections=\{mobileNavSections\}/);
  assert.match(shell, /toMobileNavSections\(groups\)/);
});

test("le tre barre laterali legacy delle aree non esistono piu", () => {
  for (const file of [
    "src/components/parent-dashboard/ParentSidebar.tsx",
    "src/components/trainer/TrainerSidebar.tsx",
    "src/components/athlete/athlete-sidebar.tsx",
  ]) {
    assert.equal(existsSync(path.join(RADICE, ...file.split("/"))), false, `${file}: una seconda barra laterale`);
  }
});

test("ogni voce dell'atleta e della famiglia punta a una pagina che esiste", () => {
  const atleta = AREE.match(/ATHLETE_AREA_NAV_GROUPS[\s\S]*?\n\];/);
  assert.ok(atleta);
  for (const href of hrefDi(atleta[0])) {
    assert.equal(paginaEsiste(href), true, `${href}: voce dell'atleta senza pagina`);
  }
  const famiglia = AREE.match(/parentAreaNavGroups[\s\S]*?\n\};/);
  assert.ok(famiglia);
  const segmenti = [...famiglia[0].matchAll(/href:\s*`\$\{base\}(\/[a-z-]+)`/g)].map((m) => m[1]);
  assert.ok(segmenti.length >= 12, "la famiglia ha almeno dodici voci oltre la home");
  for (const segmento of segmenti) {
    assert.equal(
      existsSync(path.join(RADICE, "src", "app", "parent-view", "[id]", segmento.slice(1), "page.tsx")),
      true,
      `${segmento}: voce della famiglia senza pagina`,
    );
  }
});

/* ======================================================================== */
/*  Una barra sola per pagina                                               */
/* ======================================================================== */

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

test("nessuna pagina impila due barre mobili", () => {
  const colpevoli = paginePagina()
    .filter((file) => {
      const sorgente = senzaCommenti(readFileSync(file, "utf8"));
      return sorgente.includes("<Header") && sorgente.includes("<MobileTopBar");
    })
    .map((file) =>
      path.relative(path.join(RADICE, "src"), file).split(path.sep).join("/"),
    );

  assert.deepEqual(
    colpevoli,
    [],
    `${colpevoli.join(", ")}: \`Header\` monta gia \`MobileTopBar\` sotto i 1024 px, e la seconda barra e un doppione visibile solo da un telefono.`,
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
