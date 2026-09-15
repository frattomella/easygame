import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Una gara nasce senza `group_ids` (batch di completamento funzionale,
 * acceptance pass autenticata WP13).
 *
 * **Il difetto.** `eventWithinTrainerPerimeter` (`src/lib/server/events.ts`)
 * fa decidere il gruppo quando l'evento ne dichiara uno — e cosi un
 * allenatore assegnato per sede vede un allenamento della propria categoria
 * anche se il suo profilo non dichiara quella categoria per nome (ADR-0055).
 * `AddTrainingForm` rende `groupIds` obbligatorio da sempre; `AddMatchForm`
 * non aveva **nessun** modo di dichiararlo — ne UI ne campo nel payload —
 * quindi ogni gara nasceva con `group_ids: null` e uno di questi allenatori
 * la vedeva sparire dal proprio calendario pur vedendo l'allenamento
 * gemello della stessa categoria/sede.
 *
 * **Cosa questi test difendono.** Non la UI in se: che una gara dichiari un
 * gruppo con la stessa via di un allenamento — lo stesso selettore, lo
 * stesso campo nel payload verso `createEvent`. Il perimetro lato server
 * (`eventWithinTrainerPerimeter`, coperto da `tests/server/perimetro-*`) non
 * ha bisogno di saperlo: legge `group_ids` a prescindere dal `kind`.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8").replace(
    /\r\n/g,
    "\n",
  );

/* La forma V2 di `AddMatchForm` (Wave D): stesso selettore, stesso campo nel payload. */
const ADD_MATCH_FORM = "components/matches/v2/MatchFormDrawer.tsx";
const MATCHES_PAGE = "app/matches/page.tsx";

test("MatchFormDrawer assegna la gara a un gruppo, non solo a una categoria", () => {
  const source = read(ADD_MATCH_FORM);

  assert.match(
    source,
    /TrainingGroupSelector/,
    "il selettore di gruppo (ADR-0055) e lo stesso di AddTrainingForm, non una seconda implementazione",
  );
  assert.match(
    source,
    /groupIds:\s*string\[\];/,
    "lo stato del modulo porta groupIds, come formData di AddTrainingForm",
  );
  assert.match(
    source,
    /categoryIdsFromGroups\(groupOptions,\s*groupIds\)/,
    "le categorie si derivano dai gruppi selezionati, non sono una seconda spunta da tenere allineata",
  );
});

test("MatchFormDrawer non spunta piu categorie a mano: il checkbox categoria non c'e piu", () => {
  const source = read(ADD_MATCH_FORM);

  assert.doesNotMatch(
    source,
    /handleCategoryChange/,
    "la selezione diretta della categoria e stata sostituita dal gruppo — resuscitarla riapre la stessa ambiguita di sede",
  );
});

test("la creazione di una gara manda groupIds a createEvent, come un allenamento", () => {
  const source = read(MATCHES_PAGE);

  assert.match(
    source,
    /groupIds:\s*groupIdsForThisCategory/,
    "newMatchData deve portare i gruppi della categoria di questa riga",
  );
  assert.match(
    source,
    /groups=\{matchGroupOptions\}/,
    "il form di creazione/modifica gara deve ricevere i gruppi del club, non solo le categorie",
  );
});
