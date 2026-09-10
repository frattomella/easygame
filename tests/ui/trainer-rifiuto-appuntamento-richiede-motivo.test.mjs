import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Il motivo del rifiuto e obbligatorio a livello di dominio, e la pagina
 * Trainer non lo raccoglieva mai.**
 *
 * `rejectAppointment` (`src/lib/server/appointments.ts`) rifiuta senza
 * `note`: la famiglia legge il motivo nel messaggio che chiude la richiesta,
 * quindi un rifiuto senza spiegazione equivarrebbe a cancellare la riga senza
 * dirlo — la stessa cosa che questo dominio esiste per evitare (ADR della
 * lane 5E). Il contratto e corretto e resta cosi: il difetto era che la
 * pagina Trainer chiamava `rejectClubAppointment(id, { version })`, senza
 * `note`, quindi ogni «Rifiuta» falliva sempre con 400 "Il motivo del
 * rifiuto e obbligatorio" — un'azione offerta dal permesso e mai eseguibile.
 *
 * La correzione non e un ripiego solo-mobile: e la stessa pagina Web che ora
 * raccoglie il motivo prima di chiamare la stessa API, con lo stesso
 * contratto che il dominio ha sempre richiesto.
 */

const SRC = path.join(process.cwd(), "src");
const APPUNTAMENTI = path.join(
  SRC,
  "components",
  "trainer",
  "trainer-appointments-dashboard-page.tsx",
);
const DOMINIO = path.join(SRC, "lib", "server", "appointments.ts");

test("il dominio continua a pretendere un motivo per il rifiuto (il contratto non e stato indebolito)", () => {
  const sorgente = readFileSync(DOMINIO, "utf8");
  const inizio = sorgente.indexOf("export const rejectAppointment");
  assert.ok(inizio > -1, "rejectAppointment deve continuare a esistere");
  const corpo = sorgente.slice(inizio, sorgente.indexOf("\nexport const", inizio + 1));

  assert.match(
    corpo,
    /if \(!motivo\) throw new Error\("Il motivo del rifiuto e obbligatorio"\);/,
    "il rifiuto senza motivo deve continuare a essere respinto: la famiglia riceve il motivo nel messaggio che chiude la richiesta",
  );
});

test("la pagina Trainer raccoglie il motivo prima di chiamare il rifiuto", () => {
  const sorgente = readFileSync(APPUNTAMENTI, "utf8");

  assert.match(
    sorgente,
    /const \[rejectingId, setRejectingId\] = useState<string \| null>\(null\);/,
    "manca lo stato che apre il modulo del motivo",
  );
  assert.match(
    sorgente,
    /const \[motivoRifiuto, setMotivoRifiuto\] = useState\(""\);/,
    "manca il campo per il motivo",
  );

  /*
    La chiamata reale all'API deve portare `note`, non solo `version`: e
    esattamente il campo che mancava e che faceva fallire ogni rifiuto.
  */
  const chiamata = sorgente.match(
    /rejectClubAppointment\(\s*appointment\.id,\s*\{([^}]*)\}/,
  );
  assert.ok(chiamata, "rejectClubAppointment deve essere ancora chiamata dalla pagina");
  assert.match(
    chiamata[1],
    /note:\s*motivoRifiuto\.trim\(\)/,
    "la chiamata deve portare il motivo raccolto, non solo `version`",
  );

  /*
    Il pulsante che invia il rifiuto deve restare disabilitato senza un
    motivo: un motivo vuoto tornerebbe a far fallire la chiamata con lo
    stesso 400 di prima, solo un passo piu tardi.
  */
  assert.match(
    sorgente,
    /disabled=\{inCorso \|\| !motivoRifiuto\.trim\(\)\}/,
    "il pulsante di conferma deve restare disabilitato finche il motivo e vuoto",
  );
});

test("il pulsante «Rifiuta» apre il modulo del motivo invece di chiamare subito l'API", () => {
  const sorgente = readFileSync(APPUNTAMENTI, "utf8");

  const sezionePulsanti = sorgente.slice(
    sorgente.indexOf("{puoConfermare || puoRifiutare || puoRiprogrammare"),
    sorgente.indexOf("</article>"),
  );

  const blocco = sezionePulsanti.match(
    /\{puoRifiutare[^}]*\?\s*\(([\s\S]*?)\)\s*:\s*null\}/,
  );
  assert.ok(blocco, "il pulsante Rifiuta deve esistere ancora");
  assert.doesNotMatch(
    blocco[1],
    /rejectClubAppointment/,
    "il pulsante «Rifiuta» non deve chiamare l'API direttamente: deve prima aprire il modulo del motivo",
  );
  assert.match(
    blocco[1],
    /setRejectingId\(appointment\.id\)/,
    "il pulsante «Rifiuta» deve aprire il modulo del motivo per questo appuntamento",
  );
});
