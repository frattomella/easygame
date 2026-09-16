import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  «Nuovo atleta» riconosce una persona in prova (ADR-0188, secondo lotto §5):
  mentre si scrivono nome e cognome la pagina cerca fra le prove e mostra le
  corrispondenze; non fonde niente da sola, non blocca la creazione, e se si
  sceglie la prova usa la **stessa** conversione canonica del dominio.
*/

const leggi = (p) => readFileSync(path.join(process.cwd(), p), "utf8");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const notice = senzaCommenti(leggi("src/components/trials/v2/TrialMatchNotice.tsx"));
const pagina = senzaCommenti(leggi("src/app/athletes/new/page.tsx"));
const modulo = senzaCommenti(leggi("src/components/forms/AthleteCreateForm.tsx"));

test("il modulo espone il blocco sotto l'identita e la pagina lo disegna con nome, cognome e data", () => {
  assert.match(modulo, /identityNotice\?: \(identity: \{ firstName: string; lastName: string; birthDate: string \}\) => React\.ReactNode/);
  assert.match(modulo, /identityNotice\(\{\s*firstName: formData\.firstName,\s*lastName: formData\.lastName,\s*birthDate: formData\.birthDate,/);
  assert.match(pagina, /<TrialMatchNotice/);
});

test("la ricerca passa dal server, con `trials.read`, e mostra solo chi ha lo stesso nome e cognome", () => {
  assert.match(notice, /listTrialAthletes\(\{ status: "in_trial", q: `\$\{nome\} \$\{cognome\}` \}\)/, "cerca fra le persone ancora in prova");
  assert.match(notice, /normal\(row\.firstName\) === normal\(nome\) && normal\(row\.lastName\) === normal\(cognome\)/, "corrispondenza esatta di nome e cognome, non una sottostringa");
  assert.match(pagina, /roleHasPermission\(activeClub\?\.role \|\| null, "trials\.read"\)/, "solo chi puo leggere le prove");
  assert.match(notice, /trialsCount/, "dice quante prove ha fatto");
  assert.match(notice, /lastTrialAt/, "e l'ultima");
  assert.match(notice, /stessa data di nascita|data di nascita diversa/, "e se la data di nascita coincide");
});

test("nessuna fusione automatica: due azioni esplicite, e gli omonimi vanno avanti", () => {
  assert.match(notice, /Usa questa anagrafica/);
  assert.match(notice, /Continua come nuovo atleta/);
  assert.match(notice, /setDismissedKey\(chiave\)/, "chi continua come nuovo non rivede lo stesso avviso");
  assert.doesNotMatch(notice, /onUse\(candidates\[0\]\)/, "niente scelta automatica del primo");
  assert.doesNotMatch(pagina, /disabled=\{.*trialToUse/, "la creazione non e bloccata dalla corrispondenza");
});

test("scegliere la prova usa la conversione canonica, poi completa la scheda: nessuna seconda implementazione", () => {
  assert.match(pagina, /convertTrialAthlete\(trialToUse\.id, \{\s*create: \{/, "la scheda nasce dalla conversione del dominio");
  assert.match(pagina, /updateClubAthlete\(clubId, esito\.athleteId, \{/, "e il resto del modulo si salva dopo, sulla scheda nata");
  assert.doesNotMatch(pagina, /trialToUse[\s\S]{0,400}addClubAthlete\(clubId, \{\s*firstName/, "con una prova scelta non si crea una seconda scheda dal registro");
  assert.match(pagina, /trialToUse\.trialsCount\} prove restano nello storico/, "e lo dice");
});
