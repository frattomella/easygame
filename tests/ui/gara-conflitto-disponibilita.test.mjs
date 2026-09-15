import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **"Giovedi 17 alle 19:00 il campo non e disponibile"** (bug UAT).
 *
 * Il dominio ora porta la causa reale del rifiuto — fuori orario, o un
 * evento gia sul campo, con categoria/avversario/orario quando li ha
 * (`EventAvailabilityError`, `src/lib/events/model.ts`, coperto da
 * `tests/server/gara-conflitto-disponibilita.test.mjs`). Questi test
 * difendono il *cablaggio* lato UI: che il messaggio reale arrivi cosi
 * com'e (non un fisso generico), che il form resti compilato su un
 * rifiuto, e che l'Orario proponga una fine quando l'utente scrive solo
 * l'inizio — senza duplicare in `MatchFormDrawer` (la forma V2 di
 * `AddMatchForm`, Wave D) la logica di dominio che costruisce il messaggio
 * (quella resta sul server).
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8").replace(
    /\r\n/g,
    "\n",
  );

const ADD_MATCH_FORM = "components/matches/v2/MatchFormDrawer.tsx";
const MATCHES_PAGE = "app/matches/page.tsx";

test("MatchFormDrawer propone la fine (+90 minuti) quando si lascia l'ora di inizio senza una fine", () => {
  const source = read(ADD_MATCH_FORM);

  assert.match(
    source,
    /from\s*"@\/lib\/matches\/match-time-suggestion"/,
    "il suggerimento e dominio puro condiviso, non logica scritta due volte nel form",
  );
  /*
    La forma V2 ha due campi — ora di inizio e ora di fine esplicita (fix
    ac8312a) — e la proposta scatta lasciando l'inizio, se la fine e vuota.
  */
  assert.match(source, /onBlur=\{proposeEnd\}/, "l'ora di inizio propone la fine appena l'utente lascia il campo");
  assert.match(
    source,
    /const proposeEnd = \(\) =>[\s\S]{0,400}suggerisciIntervalloGara\(prev\.startTime\)/,
    "la fine proposta viene dal suggerimento di dominio (+90 minuti)",
  );
  assert.match(source, /if \(prev\.endTime \|\| !prev\.startTime\) return prev;/, "una fine gia scritta non si tocca");
});

test("MatchFormDrawer applica lo stesso suggerimento anche al salvataggio, come ripiego", () => {
  const source = read(ADD_MATCH_FORM);
  const handleSubmitStart = source.indexOf("const handleSubmit = async");
  assert.notEqual(handleSubmitStart, -1, "handleSubmit non trovato");
  const submitCallIndex = source.indexOf("await onSubmit(", handleSubmitStart);
  assert.notEqual(submitCallIndex, -1, "la chiamata a onSubmit non trovata");

  const corpo = source.slice(handleSubmitStart, submitCallIndex);
  assert.match(
    corpo,
    /const time = composeTime\(formData\)/,
    "un invio che non passa da onBlur (es. Invio da tastiera) non deve poter mandare un solo orario di inizio",
  );
  assert.match(
    source,
    /const composeTime = [\s\S]{0,300}return suggerisciIntervalloGara\(state\.startTime\);/,
    "senza la fine, l'orario che parte e l'intervallo suggerito: mai un solo orario",
  );

  const payload = source.slice(submitCallIndex, submitCallIndex + 300);
  assert.match(
    payload,
    /\btime,/,
    "il payload deve mandare l'orario normalizzato, non formData.time grezzo",
  );
});

test("il messaggio reale del server (fuori orario, o l'evento in conflitto) arriva com'e alla creazione gara", () => {
  const source = read(MATCHES_PAGE);
  const proceedStart = source.indexOf("proceedWithMatchCreation");
  assert.notEqual(proceedStart, -1, "proceedWithMatchCreation non trovato");
  const catchIndex = source.indexOf("} catch (error) {", proceedStart);
  assert.notEqual(catchIndex, -1, "il catch di proceedWithMatchCreation non trovato");

  const corpoCatch = source.slice(catchIndex, catchIndex + 300);
  assert.match(
    corpoCatch,
    /getReadableMatchErrorMessage\(error\)/,
    "deve mostrare error.message quando e un messaggio di business leggibile (es. \"Attenzione: il Palazzetto e gia occupato...\"), non un testo fisso",
  );
  assert.match(
    corpoCatch,
    /return false;/,
    "un rifiuto deve dire al form di restare aperto (contratto booleano, bug UAT precedente)",
  );
});
