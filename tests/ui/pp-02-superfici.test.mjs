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

/* ==================================================================== */
/*  §G e §J — i moduli online, e il modulo che si compila una volta sola */
/* ==================================================================== */

test("§G · l'area «Moduli online» elenca, non rimanda soltanto", () => {
  const pagine = senzaCommenti(leggi(PAGINE));

  assert.ok(
    pagine.includes("/api/v1/family/online-forms?athlete_id="),
    "la card diceva dove sono i moduli, non cosa manca: senza questa lettura torna un rimando",
  );
  assert.ok(
    pagine.includes("moduliOnline.map((modulo)"),
    "e l'elenco va disegnato, altrimenti la lettura non si vede",
  );
  assert.ok(
    pagine.includes("modulo.stateLabel"),
    "lo stato viene dal dominio: qui era gia stato riscritto tre volte per il certificato",
  );
  assert.ok(
    pagine.includes("Entro il ") && pagine.includes("Inviato il "),
    "scadenza e data di completamento sono due delle cinque cose chieste",
  );
  assert.ok(
    pagine.includes("modulo.canSubmit"),
    "una CTA che si accende su un modulo gia chiuso e la stessa promessa mancata di «Paga ora» prima di §D",
  );
});

test("§J · l'interruttore «una volta sola» esiste, e il server lo applica", () => {
  const builder = senzaCommenti(leggi("components/forms/form-builder.tsx"));
  const dominio = senzaCommenti(leggi("lib/forms/model.ts"));
  const servizio = senzaCommenti(leggi("lib/server/form-submissions.ts"));

  assert.ok(
    dominio.includes("singleSubmission: boolean;"),
    "la dichiarazione sta nelle impostazioni, cioe dentro la versione pubblicata",
  );
  assert.ok(
    builder.includes("Si compila una volta sola"),
    "un vincolo che il club non puo accendere non esiste",
  );
  assert.ok(
    servizio.includes("assertNonGiaCompilato"),
    "e uno che nessuno applica e peggio: prometterebbe una regola che non c'e",
  );
  assert.ok(
    servizio.includes('status: { in: ["pending", "approved"] }'),
    "una pratica respinta non blocca: e proprio il caso in cui la famiglia deve poter rimandare",
  );
});

test("§J · il catalogo dice cosa chiede un modello, prima di adottarlo", () => {
  const catalogo = senzaCommenti(leggi("components/forms/forms-dashboard.tsx"));

  assert.ok(
    catalogo.includes("Cosa chiede questo modulo"),
    "per saperlo bisognava adottarlo, aprirlo e cancellarlo: tre gesti per la sola domanda che conta",
  );
  assert.ok(
    catalogo.includes("buildFormFromCatalog(entry).fields.map("),
    "l'anteprima e l'elenco dei campi, che e cio che distingue due modelli dallo stesso titolo",
  );
  assert.ok(
    catalogo.includes('"Usa modello"'),
    "«Adotta» non dice cosa succede: si prende il modello e ne nasce una copia del club",
  );
});

/* ==================================================================== */
/*  §K — la segreteria: come riceve il club                             */
/* ==================================================================== */

test("§K · il club puo dire se riceve, e per cosa", () => {
  const pagina = senzaCommenti(leggi("app/appuntamenti/page.tsx"));

  assert.ok(
    pagina.includes("Le famiglie possono prenotare"),
    "esisteva solo `active` sulla fascia: chi voleva chiudere le richieste doveva spegnerle a una a una",
  );
  assert.ok(
    pagina.includes("Motivi che accettiamo"),
    "il motivo era testo libero, e in coda arrivavano «info» e «pagamento?»",
  );
  assert.ok(
    pagina.includes("salvaConfigurazione("),
    "un interruttore che non salva e un interruttore finto",
  );
});

test("§K · la famiglia sceglie fra i motivi, e sa se le richieste sono chiuse", () => {
  const pagine = senzaCommenti(leggi(PAGINE));

  assert.ok(
    pagine.includes("tipiAppuntamento.length ? ("),
    "con i motivi configurati si sceglie; senza, il campo libero resta — i tipi restringono, la loro assenza non e un divieto",
  );
  assert.ok(
    pagine.includes("Le richieste online non sono attive."),
    "dirlo dopo il gesto e la stessa promessa mancata di «Paga ora» prima di §D",
  );
  assert.ok(
    pagine.includes("prenotazioniAperte"),
    "e la risposta arriva dal server, non da una regola riscritta qui",
  );
});

/* ==================================================================== */
/*  §N — cio che deve reggere a 375 px                                  */
/* ==================================================================== */

test("§N · le righe nuove dell'area famiglia vanno a capo", () => {
  const pagine = senzaCommenti(leggi(PAGINE));

  /*
    Le tre superfici che PP-02 ha aggiunto o riscritto dentro contenitori con
    `overflow-hidden`: li cio che non ci sta non sporge, viene **tagliato**.
  */
  assert.ok(
    pagine.includes(`className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"`),
    "la riga di una ricevuta e quella di un modulo: descrizione e importo su una riga rigida non stanno a 375 px",
  );
  assert.ok(
    pagine.includes(`className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500"`),
    "la riga di dettaglio — tipo, numero, data, figlio, stato — e la piu lunga di tutte",
  );
  assert.ok(
    pagine.includes(`className="flex flex-wrap gap-3"`),
    "i due orari della prenotazione devono impilarsi invece di stringersi finche non si leggono",
  );
});

test("§N · la scheda del figlio nella barra non tronca il nome", () => {
  const barra = senzaCommenti(leggi(BARRA));

  assert.ok(
    barra.includes("min-w-0"),
    "senza, `truncate` non tronca: la larghezza minima resta quella del nome intero",
  );
  assert.ok(
    barra.includes("truncate font-semibold"),
    "un nome lungo deve troncarsi, non allargare la barra",
  );
});

/* ==================================================================== */
/*  §H — la coda del club: una sola verita, e una sola transizione       */
/* ==================================================================== */

test("§H · la coda dice cosa succede quando si rifiuta", () => {
  const coda = senzaCommenti(leggi("components/documents/document-review-inbox.tsx"));

  /*
    Il mandato elenca «Rifiuta» e «Richiedi integrazione» come due azioni. Nel
    dominio sono una transizione sola, e farne due vorrebbe dire due parole per
    lo stesso fatto su tre schermate. Cio che mancava non era una seconda
    azione: era dire cosa succede dopo la prima.
  */
  assert.ok(
    coda.includes("E la stessa cosa\n                che chiedere un&apos;integrazione.") ||
      coda.includes("che chiedere un&apos;integrazione"),
    "chi preme «Rifiuta» non sta chiudendo una porta, sta chiedendo un altro file",
  );
  assert.ok(
    coda.includes("Motivo, obbligatorio"),
    "un rifiuto senza motivo fa ricaricare lo stesso file",
  );
});

test("§H · i filtri della coda sono quelli del lavoro, e stanno nel dominio", () => {
  const dominio = senzaCommenti(leggi("lib/documents/review-queue.ts"));

  for (const chiave of [
    '"new"',
    '"to_fix"',
    '"certificates"',
    '"identity"',
    '"overdue"',
    '"approved"',
  ]) {
    assert.ok(
      dominio.includes(chiave),
      `manca il filtro ${chiave}: la stessa domanda deve avere la stessa risposta nel conteggio e nell'elenco`,
    );
  }
});

/* ==================================================================== */
/*  §T — cio che la quarta revisione ha trovato sulle schermate         */
/* ==================================================================== */

test("§T · la riga dell'appuntamento legge la proiezione, non un vocabolario suo", () => {
  const pagine = senzaCommenti(leggi(PAGINE));

  /*
    **T6.** `toFamilyAppointment` calcola `status_label`, `decision_note`,
    `can_reschedule` e `can_cancel`, e la schermata li ignorava tutti e
    quattro. Il badge passava da un vocabolario scritto per gli **eventi**,
    che non conosce `cancelled_by_family`, `cancelled_by_club`, `rescheduled`
    e `no_show`: cadevano tutti su un ripiego, e una famiglia che disdiceva il
    proprio appuntamento leggeva nella riga che l'appuntamento e in programma.

    E «Elimina» compariva quando lo stato non era `"cancelled"` — una stringa
    che non e nel codominio del dominio, quindi la condizione era **sempre
    vera**: il pulsante stava su ogni riga storica, e premendolo si otteneva
    il messaggio interno sulle transizioni non ammesse.
  */
  assert.ok(
    pagine.includes("appointment.status_label ||"),
    "l'etichetta la sa il dominio, che conosce gli otto stati",
  );
  assert.ok(
    pagine.includes("appointment.can_reschedule && prenotazioniAperte"),
    "chi puo spostare lo dice il dominio; se il club ha chiuso, il modulo non viene reso",
  );
  assert.ok(
    pagine.includes("appointment.can_cancel ?"),
    "chi puo disdire lo dice il dominio, che conosce le transizioni",
  );
  assert.ok(
    pagine.includes("appointment.decision_note ?"),
    "il motivo del rifiuto e la sola cosa che rende utile una risposta negativa",
  );
  assert.ok(
    !pagine.includes('normalizeText(appointment.status) !== "cancelled"'),
    "la condizione sempre vera non deve tornare",
  );
});

test("§T · la barra su telefono riceve la stessa identita di quella su desktop", () => {
  const header = senzaCommenti(leggi("components/dashboard/Header.tsx"));
  const barra = senzaCommenti(leggi("components/layout/MobileTopBar.tsx"));

  /*
    **T (High).** La correzione di §C — il club e la stagione detti dal
    server, per chi non ha una tessera — viveva solo su `Header`. A
    `MobileTopBar` non arrivava niente, e quella e la barra che si vede
    **sotto i 1024 px**: su ogni telefono e ogni tablet, cioe i due viewport
    che questo pacchetto cita in ogni sezione, un tutore collegato senza
    tessera leggeva ancora «EasyGame» e «Nessuna stagione attiva».

    Il test di §C cercava due sottostringhe dentro `Header.tsx` e non aveva
    motivo di guardare l'altro file. Adesso ce l'ha.
  */
  assert.ok(
    header.includes("clubIdentity={clubIdentity}"),
    "senza questa riga la correzione di §C vale solo sopra i 1024 px",
  );
  assert.ok(
    barra.includes("clubIdentity?.name || activeClub?.name"),
    "quando il server dice il club, e lui a vincere sulla copia in localStorage",
  );
  assert.ok(
    barra.includes("clubIdentity\n              ? clubIdentity.seasonLabel") ||
      barra.includes("? clubIdentity.seasonLabel"),
    "la stagione segue la stessa regola del nome, o si torna a «Nessuna stagione attiva»",
  );
});

test("§U · il modulo online non parla sempre di rinnovo", () => {
  const modulo = senzaCommenti(leggi("components/enrollment/renewal-form.tsx"));

  /*
    Terza faccia dello stesso difetto, e va scritto. Il primo round trovo che
    ogni modulo online diventava una pratica di **rinnovo**; il secondo rimedio
    lo mando alla pagina pubblica anonima e perse il legame con il figlio; il
    terzo derivo il tipo giusto sulla pratica — e la **schermata** continuava a
    dire «Rinnovo per Marco», «Avevi gia iniziato a compilare questo rinnovo»,
    «Invia il rinnovo», con la stagione accanto al nome.

    Il dominio aveva imparato la terza parola e la pagina ne conosceva due.
  */
  assert.ok(
    modulo.includes("draft.isEnrollment === false"),
    "la schermata deve sapere cosa sta facendo compilare",
  );
  assert.ok(
    !modulo.includes("Preparo il modulo di rinnovo"),
    "il caricamento non anticipa un rinnovo che potrebbe non esserlo",
  );
  assert.ok(
    !modulo.includes("compilare questo rinnovo"),
    "la bozza ripresa e di un modulo, non necessariamente di un rinnovo",
  );
});

test("§U · il colore dell'appuntamento segue la sua etichetta", () => {
  const pagine = senzaCommenti(leggi(PAGINE));

  /*
    L'etichetta era stata portata sul vocabolario del dominio e il **colore**
    no: `getStatusClassName` conosce `"cancelled"`, non `cancelled_by_family`.
    Chi disdiceva leggeva «Annullato dalla famiglia» dentro una pastiglia
    azzurra, identica a quella di un appuntamento vivo — e su una lista il
    colore si legge prima del testo.
  */
  assert.ok(
    pagine.includes("classeStatoAppuntamento(appointment.status)"),
    "il tono lo decide il vocabolario degli appuntamenti",
  );
  assert.ok(
    pagine.includes('"cancelled_by_family"') &&
      pagine.includes('"no_show"'),
    "i sei stati terminali devono essere nominati, o cadono su un ripiego",
  );
});

test("§V · il campanello della famiglia riceve il numero, non solo la porta", () => {
  const guscio = senzaCommenti(leggi("components/parent-dashboard/parent-dashboard-shell.tsx"));

  /*
    La pastiglia e governata **solo** da `notificationCount`, che ha un default
    a zero: ometterla non e un errore di compilazione, e' una campanella spenta
    per sempre. Questo pacchetto ha corretto **dove porta** il campanello e ha
    lasciato **se si accende** — un genitore con avvisi non letti la guardava
    spenta, e il numero compariva solo dentro la pagina che avrebbe dovuto
    raggiungere.
  */
  assert.ok(
    guscio.includes("notificationCount={data?.notificationsUnread || 0}"),
    "il numero il server lo calcola per figlio: qui va passato",
  );
});

test("§V · «cosa manca» legge il nome che il server manda", () => {
  const pagine = senzaCommenti(leggi("components/parent-dashboard/parent-family-pages.tsx"));

  /*
    Il server manda `pendingDocuments`; qui si leggeva `missingDocuments`, che
    nessun produttore emette. L'elenco «Il club aspetta:» e il pulsante «Carica
    documenti» non si disegnavano mai — cioe la seconda meta di cio che il
    sottotitolo della pagina promette. Il gemello pubblico invece funzionava:
    uno sconosciuto con il link della ricevuta vedeva piu di un genitore
    autenticato.
  */
  assert.ok(
    pagine.includes("pratica.pendingDocuments"),
    "il nome deve essere quello che il server emette",
  );
  assert.ok(
    !pagine.includes("pratica.missingDocuments"),
    "il nome che nessuno produce non deve tornare",
  );
});

test("§V · la schermata del club dice quando ha chiuso la porta senza volerlo", () => {
  const club = senzaCommenti(leggi("app/appuntamenti/page.tsx"));

  /*
    `familyCanRequestAppointment` e falsa anche con l'interruttore acceso,
    quando nessun motivo e prenotabile. La schermata della famiglia la chiede;
    questa — che e quella che **causa** lo stato — mostrava solo l'interruttore
    grezzo, e un amministratore chiudeva le richieste senza accorgersene.
  */
  assert.ok(
    club.includes("!familyCanRequestAppointment(configurazione)"),
    "chi chiude la porta deve vederla chiusa",
  );
});

test("§W · la schermata di scelta del figlio non chiede una tessera", () => {
  const guardia = senzaCommenti(leggi("components/auth/access-area-guard.tsx"));

  /*
    §A ha aperto l'area famiglia a chi e tutore collegato **anche senza riga in
    `organization_users`**, e il server risponde correttamente. Ma nessuna di
    quelle risposte arrivava a una persona: senza tessera non c'e
    `activeClub`, la guardia negava, e il tutore finiva su `/account` senza
    club e senza figli — nemmeno la schermata «Nessun figlio collegato»
    riusciva a comparire.

    La sonda di §A chiamava `listParentChildren` direttamente: e la stessa
    lezione, applicata al dominio e non al percorso del browser.
  */
  assert.ok(
    guardia.includes('pathname === "/parent-view"'),
    "la scelta del figlio e l'ingresso, e non puo chiedere cio che l'ingresso deve procurare",
  );
  assert.ok(
    guardia.includes("scegliFiglio ||"),
    "la porta si apre alla sola schermata di scelta, non alle tredici pagine dentro",
  );
});
