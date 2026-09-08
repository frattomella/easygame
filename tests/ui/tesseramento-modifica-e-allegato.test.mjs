import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **N4 — il tesseramento si corregge, e i pulsanti sul file non mentono.**
 *
 * Due difetti sulla stessa tabella.
 *
 * **«Visualizza» e «Scarica» comparivano sempre.** Erano due pulsanti
 * incondizionati che, quando il file non c'era, aprivano un avviso. Non e un
 * caso limite: il numero di tessera e facoltativo di proposito — un
 * tesseramento si registra prima che la federazione lo emetta — e l'allegato lo
 * e altrettanto, quindi **la riga senza file e il caso ordinario**.
 * `src/lib/client-files.ts` lo dice in testa da sempre: «se compare
 * Visualizza, il file si deve vedere».
 *
 * **Non si poteva correggere niente.** C'erano solo aggiunta e cancellazione:
 * `handleSaveRegistration` accodava, `removeRegistration` filtrava, e non
 * esisteva nessun terzo verbo. Correggere una data, o allegare il documento
 * arrivato il giorno dopo, voleva dire cancellare il tesseramento e rifarlo —
 * perdendo la riga protocollata e lasciando in archivio un allegato che
 * nessuno cancella e nessuno legge piu.
 */

const senzaCommenti = (testo) =>
  testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const leggi = (percorso) => readFileSync(percorso, "utf8");

const PANNELLO =
  "src/components/athletes/profile/athlete-registrations-panel.tsx";
const DIALOGO =
  "src/components/athletes/profile/athlete-registration-dialog.tsx";
const PAGINA = "src/app/athletes/[id]/page.tsx";

/* ------------------------------------------------------------------ */
/* I pulsanti sul file                                                 */
/* ------------------------------------------------------------------ */

test("visualizza e scarica compaiono solo quando il file c'e", () => {
  const codice = senzaCommenti(leggi(PANNELLO));

  assert.match(
    codice,
    /const hasFile = Boolean\(\s*String\(registration\.fileUrl \|\| ""\)\.trim\(\),?\s*\)/,
    "la presenza del file va decisa una volta, non dedotta due volte",
  );

  /*
    Le due azioni devono stare **dentro** il ramo `hasFile`. Si misura sul
    testo fra `hasFile ? (` e il suo `) : (`.
  */
  const inizio = codice.indexOf("hasFile ? (");
  assert.ok(inizio > 0, "il ramo condizionale deve esistere");
  const ramo = codice.slice(inizio, codice.indexOf("Nessun allegato"));

  assert.match(ramo, /onView\(registration\)/);
  assert.match(ramo, /onDownload\(registration\)/);
});

test("senza file la riga lo dice, invece di offrire un'azione che fallisce", () => {
  const codice = senzaCommenti(leggi(PANNELLO));
  assert.match(codice, /Nessun allegato/);
});

test("le due azioni hanno un nome per chi legge con lo schermo", () => {
  const codice = leggi(PANNELLO);

  assert.match(codice, /aria-label=\{`Visualizza l'allegato del tesseramento/);
  assert.match(codice, /aria-label=\{`Scarica l'allegato del tesseramento/);
  assert.match(codice, /aria-label=\{`Modifica il tesseramento/);
  assert.match(codice, /aria-label=\{`Elimina il tesseramento/);
});

/* ------------------------------------------------------------------ */
/* La correzione                                                       */
/* ------------------------------------------------------------------ */

test("esiste un pulsante che apre la correzione", () => {
  /*
    Un percorso di dominio senza una schermata che lo accenda e codice
    irraggiungibile: e la forma di difetto che CLAUDE.md §11.8 nomina, ed e
    esattamente cio che era gia successo all'RSVP e a `board.read`.
  */
  const pannello = senzaCommenti(leggi(PANNELLO));
  assert.match(pannello, /onEdit\(registration\)/);

  const pagina = senzaCommenti(leggi(PAGINA));
  assert.match(pagina, /onEdit=\{\(registration\) => \{/);
  assert.match(pagina, /setRegistrationToEdit\(registration\)/);
});

test("la finestra si apre sui valori del tesseramento, non vuota", () => {
  const pagina = senzaCommenti(leggi(PAGINA));

  for (const campo of ["number", "status", "issueDate", "expiryDate", "notes"]) {
    assert.match(
      pagina,
      new RegExp(`${campo}: String\\(registration\\.${campo}`),
      `«${campo}» deve arrivare precompilato, o la correzione lo perde`,
    );
  }

  assert.match(
    pagina,
    /federation: String\(\s*registration\.federationId \|\| registration\.federation/,
    "in correzione la tendina deve ritrovare l'ente per identificativo",
  );
});

test("correggere aggiorna la riga invece di accodarne una seconda", () => {
  const pagina = senzaCommenti(leggi(PAGINA));

  assert.match(
    pagina,
    /const nextRegistrations = inModifica\s*\?\s*registrations\.map\(/,
    "in correzione si sostituisce; in aggiunta si accoda",
  );
  assert.match(pagina, /:\s*\[\.\.\.registrations, registration\]/);
});

test("la finestra dichiara che sta correggendo", () => {
  const dialogo = senzaCommenti(leggi(DIALOGO));

  assert.match(dialogo, /isEditing \? "Modifica Tesseramento" : "Nuovo Tesseramento"/);
  assert.match(dialogo, /isEditing \? "Salva modifiche" : "Salva Tesseramento"/);
});

/* ------------------------------------------------------------------ */
/* L'allegato                                                          */
/* ------------------------------------------------------------------ */

test("in correzione l'allegato non e obbligatorio e non si perde", () => {
  const pagina = senzaCommenti(leggi(PAGINA));

  assert.match(
    pagina,
    /:\s*String\(inModifica\?\.fileUrl \|\| ""\)/,
    "senza file nuovo resta quello che c'era",
  );
});

test("un file nuovo sostituisce allo stesso id", () => {
  /*
    Senza `replaces` ogni correzione lascerebbe dietro di se l'allegato di
    prima: nessuno lo cancella e nessuno lo legge, ma resta in archivio con i
    byte di un documento di un minore.
  */
  const pagina = senzaCommenti(leggi(PAGINA));
  assert.match(pagina, /replaces: String\(inModifica\?\.fileUrl \|\| ""\)/);

  const trasporto = senzaCommenti(leggi("src/lib/api/attachments.ts"));
  assert.match(
    trasporto,
    /precedente\.kind === "reference"\s*\?\s*await replaceAttachment\(/,
    "la sostituzione la decide il trasporto, non ogni chiamante",
  );
});

test("la finestra spiega cosa succede all'allegato che c'e gia", () => {
  const dialogo = leggi(DIALOGO);

  assert.match(dialogo, /Sostituisci allegato/);
  assert.match(
    dialogo,
    /Sceglierne uno nuovo lo sostituisce/,
    "chi corregge deve sapere se il file di prima sopravvive",
  );
});

/* ------------------------------------------------------------------ */
/* La scheda resta sotto il tetto                                      */
/* ------------------------------------------------------------------ */

test("il pannello non ha riportato la logica di dominio in pagina", () => {
  const pannello = senzaCommenti(leggi(PANNELLO));

  assert.doesNotMatch(
    pannello,
    /apiRequest|fetch\(|supabase/,
    "il pannello riceve le righe e restituisce le intenzioni: non parla con la rete",
  );
  assert.match(
    pannello,
    /readRegistrationFederationLabel/,
    "l'etichetta dell'ente la risolve il dominio, non la tabella",
  );
});
