import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **PP-02 — le superfici dell'area famiglia, e le porte che devono restare.**
 *
 * Questo file non presidia la logica: quella sta nei test di dominio e in
 * `scripts/pp-02-uat.mjs`, che gira contro un database vero. Presidia che una
 * funzione **abbia una porta**, che e la forma di difetto piu comune di questo
 * repository (CLAUDE.md §11): il codice irraggiungibile.
 *
 * E in due punti presidia il **verso opposto** — che una cosa **non** ci sia
 * piu — perche la fascia «Stai vedendo …» era corretta come informazione e
 * sbagliata come posto, e una correzione di posto si disfa senza che nessun
 * test se ne accorga.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const GUSCIO = "components/parent-dashboard/parent-dashboard-shell.tsx";
const BARRA = "components/parent-dashboard/ParentSidebar.tsx";
const SCELTA = "app/parent-view/page.tsx";
const PAGINE = "components/parent-dashboard/parent-dashboard-pages.tsx";
const HEADER = "components/dashboard/Header.tsx";

/* ==================================================================== */
/*  §A — la scelta del figlio sta nel guscio, non dentro ogni pagina     */
/* ==================================================================== */

test("§A · il cambio figlio ha una porta nella barra laterale", () => {
  const barra = senzaCommenti(leggi(BARRA));

  assert.ok(
    barra.includes("Cambia figlio"),
    "senza questa voce il cambio figlio non e raggiungibile da nessuna pagina",
  );
  assert.ok(
    barra.includes('href="/parent-view"'),
    "e deve portare alla schermata di scelta, che e l'unico posto dove la scelta si fa",
  );
  assert.ok(
    barra.includes("Stai vedendo"),
    "chi sta guardando va detto: e la pagina di un figlio, non della famiglia",
  );
  assert.ok(
    barra.includes("piuFigli"),
    "con un figlio solo il cambio porterebbe a una schermata che reindirizza indietro",
  );
});

test("§A · la fascia sopra il contenuto non c'e piu", () => {
  const guscio = senzaCommenti(leggi(GUSCIO));

  assert.ok(
    !guscio.includes("Stai vedendo"),
    "la fascia occupava la prima riga di tredici pagine su tredici, sopra la piega a 375 px",
  );
  assert.ok(
    guscio.includes('label: `FIGLIO · ${data.athlete.name}`'),
    "su mobile la porta sta in cima al menu, che e dove si va per cambiare pagina",
  );
});

test("§A · un atleta che non si risolve porta alla scelta, non a un ritenta", () => {
  const guscio = senzaCommenti(leggi(GUSCIO));

  assert.ok(
    guscio.includes("Scegli il figlio"),
    "da quando un identificativo sconosciuto non ricade piu sul primo figlio, «riprova» ritenterebbe la stessa richiesta sbagliata",
  );
});

test("§A · la schermata di scelta dice chi e ognuno, non solo come si chiama", () => {
  const scelta = senzaCommenti(leggi(SCELTA));

  assert.ok(scelta.includes("Classe"), "l'anno distingue due fratelli");
  assert.ok(
    scelta.includes("ETICHETTE_STATO"),
    "un figlio non piu iscritto va dichiarato prima di entrarci, non dopo",
  );
  assert.ok(
    scelta.includes("squadre(figlio)"),
    "tutte le categorie, con la sede quando c'e: era la sola primaria",
  );
});

/* ==================================================================== */
/*  §C — la stagione la dice il server, non il localStorage             */
/* ==================================================================== */

test("§C · il guscio della famiglia dichiara l'identita del club", () => {
  const guscio = senzaCommenti(leggi(GUSCIO));

  assert.ok(
    guscio.includes("clubIdentity={"),
    "senza, la targhetta resta appesa a una copia nel browser che per un tutore senza tessera nessuno ha mai scritto",
  );
  assert.ok(
    guscio.includes("data.club.activeSeasonLabel"),
    "l'etichetta viene dal payload, che la porta gia risolta",
  );
  assert.ok(
    guscio.includes("seasonHref: null"),
    "la targhetta rimandava a /organization, che per un genitore e un rimbalzo",
  );
});

test("§C · la barra superiore preferisce l'identita dichiarata alla copia locale", () => {
  const header = senzaCommenti(leggi(HEADER));

  assert.ok(
    header.includes("clubIdentity?.name || orgName"),
    "il nome dichiarato deve vincere",
  );
  assert.ok(
    header.includes("clubIdentity ? clubIdentity.seasonLabel : activeSeasonLabel"),
    "e con lui la stagione: prenderne una da una fonte e una dall'altra e il modo di mostrarle discordi",
  );
});

/* ==================================================================== */
/*  §F — il certificato: lo stato **e** la sua data                     */
/* ==================================================================== */

test("§F · il riquadro del certificato porta anche la scadenza", () => {
  const pagine = senzaCommenti(leggi(PAGINE));

  assert.ok(
    pagine.includes("certificateSummary"),
    "«Valido — Scade il 01/06/2027»: la riga la compone il dominio",
  );
  assert.ok(
    pagine.includes("note={certificateDetail || undefined}"),
    "il riquadro diceva solo lo stato, e la data viveva in un'altra card",
  );
  assert.ok(
    !pagine.includes("`Scade il ${formatDate(data.health.expiryDate)}`"),
    "la resa della data non si rifa qui: con il fuso del lettore un certificato che scade il primo giugno si legge «31/05»",
  );
});

test("§F · il vocabolario del certificato ha un solo proprietario", () => {
  const pagine = senzaCommenti(leggi(PAGINE));

  /*
    Le tre parole erano gia state riscritte tre volte, e la terza non conosceva
    «in scadenza». Qui si presidia che la schermata **non** le riscriva una
    quarta: le legge dal payload, che le prende dal dominio.
  */
  assert.ok(
    !pagine.includes('"Certificato valido"'),
    "l'etichetta la dice il dominio, non la schermata",
  );
  assert.ok(
    !pagine.includes('"Certificato in scadenza"'),
    "l'etichetta la dice il dominio, non la schermata",
  );
});

/* ==================================================================== */
/*  §O — i due residui di PP-01                                         */
/* ==================================================================== */

const ALLENAMENTI = "app/training/page.tsx";

test("§O · la pulizia degli allenamenti orfani passa dal dominio degli eventi", () => {
  const dominio = senzaCommenti(leggi("lib/simplified-db.ts"));
  const inizio = dominio.indexOf("export async function cleanupOrphanScheduledTrainings");
  const fine = dominio.indexOf("export async function updateClubData");
  const funzione = dominio.slice(inizio, fine);

  assert.ok(inizio > 0 && fine > inizio, "la funzione deve esistere");
  assert.ok(
    funzione.includes("deleteEventIfEmpty"),
    "gli allenamenti sono eventi: cancellarli scrivendo clubs.trainings riceve un 403 da ADR-0098, e il pulsante fallisce sempre",
  );
  assert.equal(
    /update\(\{\s*weekly_schedule[\s\S]{0,120}trainings:/.test(funzione),
    false,
    "la colonna proiettata non si scrive: e in sola lettura da ADR-0098",
  );
  assert.ok(
    funzione.includes("keptWithHistory"),
    "cio che non si e potuto togliere va dichiarato, non contato come tolto",
  );
});

test("§O · la conferma della pulizia e un dialogo dell'applicazione", () => {
  const pagina = senzaCommenti(leggi(ALLENAMENTI));

  assert.ok(
    pagina.includes("Rimuovere gli allenamenti in programma?"),
    "la conferma era un window.confirm, la stessa finestra che PP-01 ha tolto da questa pagina",
  );
  assert.ok(pagina.includes("setPuliziaCategorieAperta(true)"));
  assert.ok(
    !pagina.includes(
      "Rimuovere solo gli allenamenti in programma collegati a categorie non piu disponibili?",
    ),
    "il testo del confirm di sistema non deve restare",
  );
});

test("§O · la modifica di un allenamento manda la versione su cui e stata fatta", () => {
  const pagina = senzaCommenti(leggi(ALLENAMENTI));

  assert.ok(
    pagina.includes("editingTraining.version ?? null"),
    "senza la versione il controllo ottimistico di ADR-0098 non puo mai fallire: due segretarie tornano a «vince l'ultimo»",
  );
  assert.ok(
    pagina.includes("version:\n      typeof training?.version === \"number\"") ||
      /version:\s*\n?\s*typeof training\?\.version === "number"/.test(pagina),
    "e la versione deve arrivare fin li: la forma storica la porta, e qui si perdeva",
  );
  assert.ok(
    pagina.includes("/modificato da qualcun altro/i.test(messaggio)"),
    "sul conflitto si ricarica: lasciarlo come istruzione vuol dire che chi non la esegue riceve lo stesso errore per sempre",
  );
});
