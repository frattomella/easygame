import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildTrainerDashboardPermissionPayload,
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  getFirstAccessibleTrainerRoute,
  resolveTrainerDashboardPermissions,
  TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY,
} from "../../src/lib/trainer-dashboard-permissions.ts";

/**
 * **Le leve di navigazione dell'allenatore che il club non poteva muovere.**
 *
 * `trainer-dashboard-permissions.ts` dichiara **dieci** voci di navigazione;
 * `/permissions` — l'unica schermata da cui un club le governa — ne mostrava
 * **cinque**. Le altre cinque non erano decorative: la barra laterale ci
 * appende la voce di menu e la schermata corrispondente si rifiuta di
 * disegnarsi quando valgono `false`. Erano cioe interruttori **accesi, con
 * effetto reale, e senza nessun posto da cui spegnerli** se non scrivendo a
 * mano `settings.trainerDashboardPermissions`.
 *
 * Il mandato della Wave 6 (§11.5) dice «ogni permission mostrata deve avere
 * effetto reale». Questi test misurano **le due direzioni**, perche una sola
 * non basta:
 *
 *   1. cio che ha effetto dev'essere governabile — niente leve nascoste;
 *   2. cio che e governabile deve avere effetto — niente caselle finte.
 *
 * La misura non e una lista scritta a mano: si ricava dal codice delle
 * schermate. Una voce nuova che si difende con la propria chiave entra
 * automaticamente fra quelle che questa pagina **deve** mostrare, e il test
 * fallisce finche qualcuno non ce la mette. E la sola difesa che non chiede a
 * nessuno di ricordarsi.
 */

const RADICE = process.cwd();
const leggi = (relativo) =>
  readFileSync(path.join(RADICE, ...relativo.split("/")), "utf8");

/**
 * I commenti di questo repository raccontano il difetto chiuso, e nominano
 * quindi le chiavi di cui parlano. Cercarle nel testo intero troverebbe la
 * **spiegazione** invece del codice: si guarda il codice.
 */
const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const EDITOR = leggi("src/components/permissions/trainer-permissions-page.tsx");
const EDITOR_CODICE = senzaCommenti(EDITOR);
const SIDEBAR = senzaCommenti(leggi("src/components/trainer/TrainerSidebar.tsx"));

const CHIAVI_NAVIGAZIONE = Object.keys(
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation,
);

/* ============================== cosa la pagina /permissions mostra oggi === */

const chiaviEsposteDallEditor = () => {
  const blocco = EDITOR_CODICE.match(/const NAV_OPTIONS[\s\S]*?\n\];/);
  assert.ok(blocco, "l'elenco NAV_OPTIONS deve esistere nell'editor");
  return [...blocco[0].matchAll(/key:\s*"([A-Za-z]+)"/g)].map(
    (occorrenza) => occorrenza[1],
  );
};

const ESPOSTE = chiaviEsposteDallEditor();

/* ================================ cosa una schermata rispetta davvero ==== */

const raccogliTsx = (relativo) => {
  const assoluto = path.join(RADICE, ...relativo.split("/"));
  const trovati = [];

  const scendi = (cartella) => {
    for (const voce of readdirSync(cartella)) {
      const completo = path.join(cartella, voce);
      if (statSync(completo).isDirectory()) {
        scendi(completo);
        continue;
      }
      if (completo.endsWith(".tsx")) trovati.push(completo);
    }
  };

  scendi(assoluto);
  return trovati;
};

const SUPERFICI = [
  ...raccogliTsx("src/components/trainer"),
  ...raccogliTsx("src/app/trainer-dashboard"),
].map((file) => ({ file, sorgente: senzaCommenti(readFileSync(file, "utf8")) }));

/**
 * Una chiave e **rispettata da una schermata** quando esiste un file che la
 * legge (`permissions.navigation.<chiave>`) e che, in sua assenza, disegna il
 * cartello di sezione disattivata con **quel** nome. Le due condizioni insieme
 * sono la prova che togliere la chiave fa sparire la superficie: la prima da
 * sola direbbe soltanto che il nome compare da qualche parte, la seconda da
 * sola non direbbe con quale chiave.
 */
const chiaviRispettateDaUnaSchermata = CHIAVI_NAVIGAZIONE.filter((chiave) =>
  SUPERFICI.some(
    ({ sorgente }) =>
      sorgente.includes(`permissions.navigation.${chiave}`) &&
      sorgente.includes(`SectionBlockedState section="${chiave}"`),
  ),
);

/* ===================================================== le due direzioni == */

test("ogni voce di navigazione che una schermata rispetta e governabile da /permissions", () => {
  const nascoste = chiaviRispettateDaUnaSchermata.filter(
    (chiave) => !ESPOSTE.includes(chiave),
  );

  assert.deepEqual(
    nascoste,
    [],
    `Leve nascoste: ${nascoste.join(", ")}. Spegnerle fa sparire una superficie, e il club non ha nessun posto da cui farlo.`,
  );
});

test("ogni voce mostrata da /permissions ha una schermata che la rispetta", () => {
  const finte = ESPOSTE.filter(
    (chiave) => !chiaviRispettateDaUnaSchermata.includes(chiave),
  );

  assert.deepEqual(
    finte,
    [],
    `Caselle senza effetto: ${finte.join(", ")}. Una casella che non fa niente e peggio di una casella assente.`,
  );
});

test("le quattro voci scoperte dalla Wave 6 sono adesso in elenco, e una sola volta", () => {
  for (const chiave of ["board", "appointments", "documents", "compensation"]) {
    assert.equal(
      ESPOSTE.filter((esposta) => esposta === chiave).length,
      1,
      `${chiave} deve comparire una volta sola nell'editor di navigazione`,
    );
  }

  assert.equal(
    new Set(ESPOSTE).size,
    ESPOSTE.length,
    "nessuna chiave duplicata nell'elenco della navigazione",
  );
});

/* ============================== togli la chiave: la superficie sparisce == */

/**
 * Il giro completo che fa il prodotto: l'editor costruisce il payload, il club
 * lo salva nelle impostazioni, e chi disegna la dashboard lo rilegge con
 * `resolveTrainerDashboardPermissions`. Se la chiave non sopravvive a questo
 * giro, l'interruttore non arriva mai alla schermata.
 */
const salvaERilegge = (navigazione) =>
  resolveTrainerDashboardPermissions(
    buildTrainerDashboardPermissionPayload({
      ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
      navigation: {
        ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation,
        ...navigazione,
      },
    }),
  );

for (const chiave of ["board", "appointments", "documents", "compensation"]) {
  test(`togliere «${chiave}» la spegne davvero, rimetterla la riaccende`, () => {
    const spenta = salvaERilegge({ [chiave]: false });
    assert.equal(
      spenta.navigation[chiave],
      false,
      "la scelta del club deve sopravvivere al salvataggio e alla rilettura",
    );

    const riaccesa = salvaERilegge({ [chiave]: true });
    assert.equal(riaccesa.navigation[chiave], true);
  });

  test(`«${chiave}» comanda la voce di menu della barra laterale`, () => {
    assert.equal(
      SIDEBAR.includes(`permissions.navigation.${chiave}`),
      true,
      "la voce di menu deve essere appesa alla chiave, altrimenti spegnerla non toglie il collegamento",
    );
    assert.equal(
      SIDEBAR.includes(TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY[chiave]),
      true,
      "e deve puntare alla rotta che la chiave governa",
    );
  });

  test(`«${chiave}» spenta non e piu la destinazione di ripiego`, () => {
    const solaAccesa = Object.fromEntries(
      CHIAVI_NAVIGAZIONE.map((voce) => [voce, voce === chiave]),
    );

    assert.equal(
      getFirstAccessibleTrainerRoute({
        ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
        navigation: solaAccesa,
      }),
      TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY[chiave],
      "se e l'unica accesa, il ripiego deve portarci",
    );

    assert.notEqual(
      getFirstAccessibleTrainerRoute({
        ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
        navigation: Object.fromEntries(
          CHIAVI_NAVIGAZIONE.map((voce) => [voce, voce !== chiave]),
        ),
      }),
      TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY[chiave],
      "spenta, nessun ripiego puo scaricarci sulla sua rotta",
    );
  });
}

/* ================================= una sola forma di editor, e responsive = */

test("le voci nuove passano dallo stesso editor delle altre, non da una seconda forma", () => {
  assert.equal(
    (EDITOR_CODICE.match(/NAV_OPTIONS\.map\(/g) || []).length,
    1,
    "un solo punto disegna l'elenco della navigazione",
  );
  assert.equal(
    (EDITOR_CODICE.match(/const updateNavigationPermission/g) || []).length,
    1,
    "un solo scrittore per il gruppo navigazione",
  );
  assert.equal(
    EDITOR_CODICE.includes("<PermissionRow"),
    true,
    "la riga e quella gia usata da widget e azioni",
  );
});

test("le tre colonne restano leggibili a 375, 768 e 1280 px", () => {
  assert.equal(
    EDITOR_CODICE.includes('className="grid gap-6 xl:grid-cols-3"'),
    true,
    "una colonna sola sotto i 1280 px: le schede non si stringono, si impilano",
  );
  assert.equal(
    EDITOR_CODICE.includes('className="flex-1 overflow-y-auto p-4 md:p-6"'),
    true,
    "l'elenco piu lungo deve poter scorrere, con padding ridotto sullo schermo stretto",
  );
});

/* ================================================ la leva a meta: notifiche */

/**
 * **`notifications` non e esposta, ed e una misura non una dimenticanza.**
 *
 * La chiave esiste, la barra laterale ci appende la voce «Notifiche», ma la
 * schermata `app/trainer-dashboard/notifications/page.tsx` si difende con
 * `permissions.navigation.home`: spegnere `notifications` toglierebbe il
 * collegamento dal menu e lascerebbe la pagina raggiungibile. Mostrarla oggi
 * sarebbe un interruttore che mantiene meta della promessa.
 *
 * Questo test non fotografa il difetto — lo farebbe sopravvivere. Fotografa la
 * **regola**: se un giorno quella schermata leggera la propria chiave, il primo
 * test di questo file pretendera che l'editor la mostri. Qui si verifica solo
 * che le due cose restino coerenti fra loro.
 */
test("una voce che nessuna schermata rispetta non viene mostrata come se lo fosse", () => {
  const nonRispettate = CHIAVI_NAVIGAZIONE.filter(
    (chiave) => !chiaviRispettateDaUnaSchermata.includes(chiave),
  );

  for (const chiave of nonRispettate) {
    assert.equal(
      ESPOSTE.includes(chiave),
      false,
      `${chiave} non e rispettata da nessuna schermata: mostrarla prometterebbe un divieto che non c'e`,
    );
  }
});
