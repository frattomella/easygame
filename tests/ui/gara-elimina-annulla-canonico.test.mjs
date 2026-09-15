import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Elimina / annulla gara usava ancora il writer legacy** (bug UAT
 * "CREAZIONE NUOVA GARA FALLISCE", follow-up scoperto durante l'UAT del
 * fix precedente): `handleDeleteMatch`/`handleCancelMatch` in
 * `matches/page.tsx` leggevano e riscrivevano `clubs.matches` con
 * `getClubData`/`updateClubData` — la stessa colonna che, da ADR-0098, e
 * una **proiezione in sola lettura** con un solo scrittore
 * (`projectEventsToClubColumn`). Un vaglio server-side rifiuta ogni altra
 * scrittura con `403 Accesso negato: matches e una proiezione degli
 * eventi e si scrive da /api/v1/events, non dal club` — verificato in UAT
 * su staging cliccando "Elimina" su una gara reale.
 *
 * **La correzione non e nel dominio**: `deleteClubEvent`/`updateClubEvent`
 * (`src/lib/server/events.ts`) e il loro trasporto client
 * (`deleteEventIfEmpty`/`cancelEvent` in `src/lib/events/client.ts`) erano
 * gia corretti e gia usati da `training/page.tsx` per lo stesso identico
 * problema sugli allenamenti. Il difetto era **solo** che `matches/page.tsx`
 * non li chiamava: due funzioni ferme sul vecchio binario mentre il resto
 * dell'app era gia passato su quello nuovo. Questi test difendono il
 * *cablaggio* — che i due handler chiamino il trasporto canonico, non che
 * il dominio sia corretto (coperto da `tests/server/gara-elimina-annulla-canonico.test.mjs`).
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8").replace(
    /\r\n/g,
    "\n",
  );

const MATCHES_PAGE = "app/matches/page.tsx";

/**
 * Il corpo di una funzione `const <nome> = async (...) => { ... };` dichiarata
 * con l'indentazione di un componente (due spazi), fino al primo `  };` che la
 * chiude allo stesso livello.
 */
const extractHandlerBody = (source, name) => {
  const start = source.indexOf(`const ${name} = async`);
  assert.notEqual(start, -1, `${name} non trovato in ${MATCHES_PAGE}`);
  const end = source.indexOf("\n  };", start);
  assert.notEqual(end, -1, `chiusura di ${name} non trovata`);
  return source.slice(start, end);
};

test("l'import del trasporto eventi porta cancelEvent e deleteEventIfEmpty, non solo createEvent", () => {
  const source = read(MATCHES_PAGE);

  assert.match(
    source,
    /import\s*\{[^}]*\bcancelEvent\b[^}]*\}\s*from\s*"@\/lib\/events\/client"/s,
    "handleCancelMatch deve poter chiamare cancelEvent dal trasporto canonico",
  );
  assert.match(
    source,
    /import\s*\{[^}]*\bdeleteEventIfEmpty\b[^}]*\}\s*from\s*"@\/lib\/events\/client"/s,
    "handleDeleteMatch deve poter chiamare deleteEventIfEmpty dal trasporto canonico",
  );
});

test("handleDeleteMatch chiama il writer canonico, non piu getClubData/updateClubData su \"matches\"", () => {
  const source = read(MATCHES_PAGE);
  const corpo = extractHandlerBody(source, "handleDeleteMatch");

  assert.match(
    corpo,
    /deleteEventIfEmpty\(matchId\)/,
    "deve passare da /api/v1/events (DELETE), come deleteClubEvent",
  );
  assert.doesNotMatch(
    corpo,
    /updateClubData/,
    "non deve piu riscrivere clubs.matches direttamente: quella colonna e una proiezione in sola lettura (ADR-0098)",
  );
  assert.doesNotMatch(
    corpo,
    /getClubData\(activeClub\.id,\s*"matches"\)/,
    "non deve piu leggere clubs.matches per ricostruire l'array a mano",
  );
});

test("handleCancelMatch chiama il writer canonico (PATCH status: cancelled), non piu getClubData/updateClubData su \"matches\"", () => {
  const source = read(MATCHES_PAGE);
  const corpo = extractHandlerBody(source, "handleCancelMatch");

  assert.match(
    corpo,
    /cancelEvent\(matchId,/,
    "deve passare da /api/v1/events/[id] (PATCH), come updateClubEvent",
  );
  assert.doesNotMatch(
    corpo,
    /updateClubData/,
    "non deve piu riscrivere clubs.matches direttamente: quella colonna e una proiezione in sola lettura (ADR-0098)",
  );
  assert.doesNotMatch(
    corpo,
    /getClubData\(activeClub\.id,\s*"matches"\)/,
    "non deve piu leggere clubs.matches per ricostruire l'array a mano",
  );
});

test("il messaggio d'errore reale del dominio arriva all'utente su elimina/annulla, non solo un testo fisso", () => {
  const source = read(MATCHES_PAGE);

  const eliminazione = extractHandlerBody(source, "handleDeleteMatch");
  const annullamento = extractHandlerBody(source, "handleCancelMatch");

  assert.match(
    eliminazione,
    /getReadableMatchErrorMessage\(error,\s*GENERIC_MATCH_DELETE_ERROR\)/,
    "un rifiuto reale (es. \"ha gia una storia\", o un 403 Accesso negato) deve arrivare com'e, non sparire dietro un testo fisso",
  );
  assert.match(
    annullamento,
    /getReadableMatchErrorMessage\(error,\s*GENERIC_MATCH_CANCEL_ERROR\)/,
    "stesso principio per l'annullamento",
  );
});

test("handleEditMatch passa dal writer canonico (PATCH con la versione), non piu da clubs.matches", () => {
  // Il ticket UAT riguardava elimina/annulla, e la modifica era rimasta sul
  // binario legacy come debito dichiarato. La migrazione al Web V2 (Wave D,
  // D-AUD-WD-1) lo ha chiuso: la modifica passa da `updateEvent` con la
  // versione letta, e un conflitto ottimistico ricarica la copia locale.
  const source = read(MATCHES_PAGE);
  const corpo = extractHandlerBody(source, "handleEditMatch");

  assert.match(corpo, /updateEvent\(eventId,\s*updateData,\s*selectedMatch\.version \?\? null\)/, "la modifica manda la versione allo scrittore canonico");
  assert.doesNotMatch(source, /updateClubData/, "nessuna scrittura della proiezione in sola lettura resta in pagina (ADR-0098)");
  assert.doesNotMatch(source, /getClubData\(activeClub\.id,\s*"matches"\)\s*;?\s*\n\s*const updatedMatches/, "non si ricostruisce piu l'array a mano");
  assert.match(corpo, /modificato da qualcun altro/, "sul conflitto ottimistico si ricarica");
});
