import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * **"Date-only timezone shift"**: `AddMatchForm` mostrava "17 settembre
 * 2026", ma il submit poteva produrre una gara salvata il 16 —
 * `matchData.date.toISOString()` su un `Date` costruito a mezzanotte
 * locale, riconvertito in un istante UTC vero che a Roma (sempre avanti
 * su UTC) sposta la data indietro di un giorno.
 *
 * Questi test difendono il *cablaggio*: che i punti individuati
 * dall'audit chiamino davvero `formatLocalDateOnly`/`todayLocalDateOnly`
 * (`src/lib/date-only.ts`), non piu `.toISOString()` su un `Date` appena
 * costruito. Il formattore puro e provato in `tests/lib/date-only.test.mjs`;
 * che il dominio persista il giorno giusto e provato in
 * `tests/server/date-only-timezone-shift.test.mjs`.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8").replace(
    /\r\n/g,
    "\n",
  );

test("AddMatchForm.tsx e matches/page.tsx: la data della gara passa da formatLocalDateOnly, non piu da .toISOString()", () => {
  const paginaGare = read("app/matches/page.tsx");

  assert.match(
    paginaGare,
    /import\s*\{\s*formatLocalDateOnly\s*\}\s*from\s*"@\/lib\/date-only"/,
    "matches/page.tsx deve importare il formattatore canonico",
  );
  assert.match(
    paginaGare,
    /formatLocalDateOnly\(matchData\.date\)/,
    "sia la creazione sia la modifica devono leggere il giorno civile di matchData.date con formatLocalDateOnly",
  );
  assert.doesNotMatch(
    paginaGare,
    /matchData\.date\.toISOString\(\)/,
    "non deve restare nessun .toISOString() diretto sul Date scelto nel calendario",
  );
});

test("AddTrainingForm.tsx: l'inizializzazione e il reset della data passano da formatLocalDateOnly", () => {
  const form = read("components/forms/AddTrainingForm.tsx");

  assert.match(
    form,
    /import\s*\{\s*formatLocalDateOnly\s*\}\s*from\s*"@\/lib\/date-only"/,
    "AddTrainingForm.tsx deve importare il formattatore canonico",
  );
  const occorrenze = form.match(/formatLocalDateOnly\(selectedDate \|\| new Date\(\)\)/g) || [];
  assert.equal(
    occorrenze.length,
    2,
    "sia lo stato iniziale sia resetForm devono usare lo stesso formattatore (una ricorrenza a testa)",
  );
});

test("la scadenza RSVP (event-rsvp-fields, dominio condiviso) resta un istante UTC vero — non le cifre letterali di club_events", () => {
  /*
    **Correzione della correzione** (audit semantico post-UAT, ticket
    "date-only timezone shift"): la prima versione di questo test
    verificava l'esatto contrario di quanto scritto qui — pretendeva che
    `toEventRsvpPayload` scrivesse le cifre letterali del datetime-local,
    come `starts_at`/`ends_at`. Era sbagliato: `rsvp_deadline` e confrontato
    con `Date.now()` in `src/lib/rsvp/model.ts` (`canAnswerRsvp`), e un
    confronto cosi richiede un istante vero, non cifre rietichettate. La
    prova end-to-end (scrittura, confronto con "adesso", rilettura) sta in
    `tests/lib/rsvp-deadline-timezone.test.mjs`; qui si verifica solo che
    il cablaggio non torni alla convenzione sbagliata.
  */
  const model = read("lib/events/model.ts");
  const funzione = model.slice(
    model.indexOf("export const toEventRsvpPayload"),
    model.indexOf("export const fromEventRsvpPayload"),
  );

  assert.match(
    funzione,
    /new Date\(value\.rsvpDeadline\)\.toISOString\(\)/,
    "toEventRsvpPayload gira nel browser: new Date(stringa-locale).toISOString() e la conversione giusta in istante UTC vero",
  );
  assert.doesNotMatch(
    funzione,
    /\$\{value\.rsvpDeadline\}:00\.000Z/,
    "non deve tornare la convenzione a cifre letterali: rsvp_deadline non e starts_at/ends_at",
  );

  const letturaInversa = model.slice(
    model.indexOf("export const fromEventRsvpPayload"),
    model.indexOf("export const fromEventRsvpPayload") + 600,
  );
  assert.doesNotMatch(
    letturaInversa,
    /String\(deadline\)\.slice\(0, 16\)/,
    "fromEventRsvpPayload non deve tornare a leggere le cifre UTC gia convertite come se fossero ancora locali",
  );
  assert.match(
    letturaInversa,
    /toLocalDateTimeInputValue\(parsedDeadline\)/,
    "la rilettura per il form deve riconvertire l'istante con gli accessori locali, non tagliare la stringa",
  );
});

test("AddCertificateForm.tsx: la scadenza a +1 anno e il default \"oggi\" usano il formattatore locale", () => {
  const form = read("components/forms/AddCertificateForm.tsx");

  assert.match(
    form,
    /import\s*\{\s*formatLocalDateOnly,\s*todayLocalDateOnly\s*\}\s*from\s*"@\/lib\/date-only"/,
    "deve importare entrambe le utility",
  );
  assert.match(
    form,
    /const todayDate = \(\) => todayLocalDateOnly\(\);/,
    "il default \"oggi\" deve passare dal formattatore locale",
  );
  assert.match(
    form,
    /return formatLocalDateOnly\(date\);/,
    "la scadenza a +1 anno (addOneYear) deve restituire il giorno civile locale, non l'istante UTC",
  );
});

test("calendar/page.tsx: \"oggi\" e \"fra 30 giorni\" usano il giorno civile locale, non un istante UTC troncato", () => {
  const calendario = read("app/calendar/page.tsx");

  assert.match(calendario, /todayLocalDateOnly\(\)/);
  assert.match(calendario, /formatLocalDateOnly\(/);
  assert.doesNotMatch(
    calendario,
    /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/,
    "il filtro \"Da\" non deve tornare a rispondere \"ieri\" nella finestra dopo la mezzanotte locale",
  );
});

/**
 * Cammina `src/` a mano, in puro Node — **non** con `ripgrep` invocato
 * tramite `execSync`. La prima stesura di questo test si appoggiava a
 * `rg`, e su questa macchina di sviluppo `rg` non e sul `PATH` ne in Bash
 * ne in PowerShell: `execSync` falliva con "comando non riconosciuto" (non
 * uscita 1, "nessuna corrispondenza"), il `catch` lo scambiava per
 * "ripgrep assente" e faceva `return` — il test **appariva verde senza
 * avere mai controllato una riga**. Uno sweep che non gira ovunque non e
 * uno sweep: e un'assunzione che nessuno rilegge una seconda volta perche
 * il pallino e gia verde.
 */
const elencaFileSorgente = (dir) => {
  const risultato = [];
  for (const voce of readdirSync(dir, { withFileTypes: true })) {
    if (voce.name === "node_modules" || voce.name.startsWith(".")) continue;
    const percorso = path.join(dir, voce.name);
    if (voce.isDirectory()) {
      risultato.push(...elencaFileSorgente(percorso));
    } else if (/\.(ts|tsx|js|jsx)$/.test(voce.name)) {
      risultato.push(percorso);
    }
  }
  return risultato;
};

const PATTERN_OGGI_UTC_TRONCATO =
  /new Date\(\)\.toISOString\(\)\.(split\("T"\)\[0\]|slice\(0, 10\))/;

test("nessuna occorrenza residua del pattern \"oggi via UTC troncato\" in tutto src/ — zero eccezioni", () => {
  /*
    La prova piu forte non e file per file: e che il pattern esatto del bug
    — `new Date().toISOString()` seguito da un troncamento a sola data —
    sia sparito da **tutto** il codice web.

    **Niente piu eccezioni.** `athletes/[id]/page.tsx` (l'unica di prima)
    non chiamava piu direttamente questo pattern nel suo unico punto
    residuo (riga ~506): la correzione e passata dal modulo gia estratto
    `src/lib/athlete-profile-fields.ts` (`getTodayDateString`, gia
    importato dalla pagina in tre punti su quattro) invece di aggiungere
    una riga alla pagina — il guardiano di crescita
    (`athlete-profile-extraction.test.mjs`, "la scheda atleta non torna a
    crescere") resta verde perche il conteggio righe non e cambiato.
  */
  const righeInattese = [];
  for (const file of elencaFileSorgente(SRC)) {
    const testo = readFileSync(file, "utf8");
    const righe = testo.split("\n");
    righe.forEach((riga, indice) => {
      if (PATTERN_OGGI_UTC_TRONCATO.test(riga)) {
        righeInattese.push(`${path.relative(ROOT, file)}:${indice + 1}: ${riga.trim()}`);
      }
    });
  }

  assert.equal(
    righeInattese.join("\n"),
    "",
    `trovate occorrenze non dichiarate del pattern "oggi via UTC troncato":\n${righeInattese.join("\n")}`,
  );
});

test("getTodayDateString (src/lib/athlete-profile-fields.ts) legge il giorno civile locale — la pagina atleti non ha piu il difetto", () => {
  const modulo = read("lib/athlete-profile-fields.ts");

  assert.match(
    modulo,
    /import\s*\{\s*formatLocalDateOnly\s*\}\s*from\s*"@\/lib\/date-only"/,
    "athlete-profile-fields.ts deve importare il formattatore canonico",
  );
  assert.match(
    modulo,
    /export const getTodayDateString = \(today: Date = new Date\(\)\): string =>\s*\n\s*formatLocalDateOnly\(today\);/,
    "getTodayDateString deve leggere il giorno civile locale, non l'istante UTC troncato",
  );

  const pagina = read("app/athletes/[id]/page.tsx");
  assert.doesNotMatch(
    pagina,
    /new Date\(\)\.toISOString\(\)\.split\("T"\)\[0\]/,
    "il default \"oggi\" del pagamento non deve piu bypassare getTodayDateString",
  );
  assert.match(
    pagina,
    /date: getTodayDateString\(\)/,
    "il default \"oggi\" del pagamento deve passare dal modulo gia estratto e gia importato",
  );
});
