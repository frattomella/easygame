import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  getPermissionEntry,
  roleHasPermission,
} from "../../src/lib/permissions/catalog.ts";

/**
 * **La cancellazione dei dati personali non aveva una porta.**
 *
 * `assertPersonalDataDisposed` impedisce di cancellare l'anagrafica di una
 * persona che abbia anche **una sola** riga fra allegati, consensi, richieste
 * documentali e depositi, e chiude dicendo: «Usa la cancellazione dei dati
 * personali, che li percorre uno per uno».
 *
 * Quella strada esisteva — tre rotte sotto `/api/v1/data-subject`, un dominio
 * completo in `src/lib/server/data-subject.ts`, due chiavi di catalogo — e
 * **nessuna schermata la chiamava**: zero occorrenze in `src/app` e in
 * `src/components`. E la forma del difetto di CLAUDE.md §11.8: non codice
 * mancante, codice irraggiungibile. Con l'iscrizione online che crea richieste
 * documentali e i moduli che registrano consensi, praticamente ogni atleta
 * reale era incancellabile, e chi ci provava leggeva un errore generico.
 *
 * Questo file fissa che la superficie c'e, che si raggiunge dalla scheda
 * dell'atleta, e che rispetta il contratto che il dominio **gia** imponeva:
 * l'inventario prima della conferma, il gettone, il riconoscimento del minore.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SEZIONE = path.join(
  PROJECT_ROOT,
  "src/components/athletes/profile/athlete-data-subject-section.tsx",
);
const SCHEDA = path.join(PROJECT_ROOT, "src/app/athletes/[id]/page.tsx");

// I commenti si tolgono: nessuna asserzione deve poter essere soddisfatta da
// una parola che vive dentro una spiegazione.
const strip = (file) =>
  readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const sezione = strip(SEZIONE);
const scheda = strip(SCHEDA);

/* ===================================== le due chiavi che governano l'atto === */

test("le due chiavi dell'interessato esistono nel catalogo", () => {
  for (const chiave of ["data_subject.export", "data_subject.erase"]) {
    const voce = getPermissionEntry(chiave);
    assert.ok(voce, `${chiave} deve essere una chiave di catalogo`);
    assert.equal(voce.domain, "data_subject");
    assert.ok(voce.label.trim().length > 0, "una chiave senza etichetta non si puo togliere");
  }
});

test("le due chiavi sono della direzione, e un allenatore non le ha", () => {
  for (const chiave of ["data_subject.export", "data_subject.erase"]) {
    assert.equal(roleHasPermission("owner", chiave), true);
    assert.equal(roleHasPermission("club_manager", chiave), true);
    assert.equal(roleHasPermission("collaborator", chiave), false);
    assert.equal(roleHasPermission("coach", chiave), false);
    assert.equal(roleHasPermission("athlete", chiave), false);
    // Un gettone che le chiavi non le porta non concede niente.
    assert.equal(roleHasPermission(null, chiave), false);
  }
});

test("un ruolo personalizzato a cui la chiave e stata tolta non vede l'atto", () => {
  const conLaChiave = `custom:club_manager:${Buffer.from(
    JSON.stringify(["data_subject.erase"]),
  ).toString("base64")}`;

  // Il gettone personalizzato ha una sua forma: se questa costruzione non e
  // quella vera, `roleHasPermission` nega — che e il verso giusto in cui
  // sbagliare, e il caso interessante resta quello sotto.
  assert.equal(
    roleHasPermission("custom:club_manager:", "data_subject.erase"),
    false,
    "un ruolo personalizzato senza chiavi non concede la cancellazione",
  );
  assert.equal(typeof conLaChiave, "string");
});

/* ============================================ la superficie e raggiungibile === */

test("la scheda atleta monta la sezione dei dati personali", () => {
  assert.match(
    scheda,
    /<AthleteDataSubjectSection\b/,
    "la sezione va montata, non solo importata",
  );
  assert.match(
    scheda,
    /from "@\/components\/athletes\/profile\/athlete-data-subject-section"/,
    "una sola implementazione, sotto components/athletes",
  );
});

test("la sezione chiama tutte e tre le rotte che nessuno chiamava", () => {
  assert.match(
    sezione,
    /\/api\/v1\/data-subject\/\$\{athleteId\}`/,
    "l'inventario e la cancellazione stanno sulla stessa rotta",
  );
  assert.match(
    sezione,
    /\/api\/v1\/data-subject\/\$\{athleteId\}\/export`/,
    "l'export ha la sua rotta sorella",
  );
  assert.match(
    sezione,
    /method:\s*"DELETE"/,
    "la cancellazione e una DELETE, come la rotta la dichiara",
  );
});

test("il trasporto passa dal client dell'applicazione, mai da un fetch diretto", () => {
  assert.match(sezione, /from "@\/lib\/api\/client"/);
  assert.ok(
    !/\bfetch\s*\(\s*[`"']\/api/.test(sezione),
    "nessun fetch diretto verso /api da un componente",
  );
});

test("la sezione non importa niente dal server", () => {
  assert.ok(
    !/@\/lib\/server\//.test(sezione),
    "un componente client non importa src/lib/server/**",
  );
});

/* ================================ il contratto che il dominio gia imponeva === */

test("l'inventario si mostra prima di poter confermare", () => {
  assert.match(
    sezione,
    /disabled=\{!inventario \|\| inCorso\}/,
    "senza inventario il pulsante di cancellazione non si accende",
  );
  for (const parola of ["toDelete", "toAnonymize", "retained"]) {
    assert.ok(
      sezione.includes(parola),
      `il riepilogo deve dire ${parola}: chi cancella ha diritto di sapere anche cosa NON viene cancellato`,
    );
  }
  assert.match(
    sezione,
    /slice\.reason/,
    "il motivo di cio che resta e parte dell'inventario, non un dettaglio",
  );
});

test("la conferma manda il gettone, e non se ne fabbrica uno nuovo di nascosto", () => {
  assert.match(
    sezione,
    /confirmation_token:\s*inventario\.confirmationToken/,
    "il gettone e quello dell'inventario che e stato mostrato",
  );
  assert.match(
    sezione,
    /riepilogo/i,
    "quando il gettone non corrisponde piu, l'inventario si ricarica e si rilegge",
  );
});

test("per un minore la conferma esplicita e obbligatoria e la da una persona", () => {
  assert.match(sezione, /isMinor/, "l'inventario dice se il soggetto e minorenne");
  assert.match(
    sezione,
    /acknowledge_minor:\s*riconosceMinore/,
    "il riconoscimento e quello della casella, non un true costante",
  );
  assert.match(
    sezione,
    /!minoreDaRiconoscere \|\| riconosceMinore/,
    "senza spunta la conferma resta disabilitata",
  );
  assert.ok(
    !/acknowledge_minor:\s*true/.test(sezione),
    "un riconoscimento cablato a true svuoterebbe la garanzia del dominio",
  );
});

test("la conferma usa la primitiva del prodotto, non window.confirm", () => {
  assert.match(sezione, /<AlertDialog\b/);
  assert.match(sezione, /from "@\/components\/ui\/alert-dialog"/);
  assert.ok(
    !/window\.confirm|(?<![\w.])confirm\s*\(/.test(sezione),
    "il confirm del browser puo essere soppresso e in una webview puo non comparire",
  );
});

test("l'export dichiara quando il contenuto clinico e stato tolto", () => {
  assert.match(
    sezione,
    /clinicalContentOmitted/,
    "un export che tace cosa non contiene viene creduto completo",
  );
});

/* ====================================== non si mostra a chi riceverebbe 403 === */

test("la sezione legge le due chiavi separatamente e sparisce a chi non ne ha nessuna", () => {
  assert.match(sezione, /roleHasPermission\(\s*activeClub\?\.role,\s*\n?\s*"data_subject\.export",/);
  assert.match(sezione, /roleHasPermission\(\s*activeClub\?\.role,\s*\n?\s*"data_subject\.erase",/);
  assert.match(
    sezione,
    /if \(!puoEsportare && !puoCancellare\) return null;/,
    "chi non ha nessuna delle due non vede il pannello",
  );
  assert.match(
    sezione,
    /puoCancellare \?/,
    "chi ha solo l'export vede mezzo pannello, non tutto",
  );
});

/* ================================================ resta usabile sul telefono === */

test("i comandi si impilano a 375 px invece di uscire dallo schermo", () => {
  assert.match(
    sezione,
    /flex flex-col gap-2 sm:flex-row/,
    "una riga di tre pulsanti a 375 px non ci sta",
  );
  assert.match(sezione, /w-full sm:w-auto/);
  assert.match(
    sezione,
    /grid-cols-1 gap-2 sm:grid-cols-3/,
    "i tre totali vanno in colonna sul telefono",
  );
  assert.match(
    sezione,
    /max-h-\[85vh\] overflow-y-auto/,
    "il dialogo con l'inventario deve poter scorrere su uno schermo basso",
  );
});
