import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **«Invia Credenziali» era una superficie finta** (W6-D05).
 *
 * Sulla scheda di un membro dello staff e su quella di un socio il pulsante
 * c'era e non chiamava nessuna rotta: `handleShareCredentials` mostrava un
 * toast e basta. Prima della Wave 6 lo mostrava **verde**, cioe diceva
 * «inviate» di una cosa che non era successa.
 *
 * La scheda atleta ha risolto lo stesso difetto togliendo il pulsante (W6-26).
 * Qui non si puo fare la stessa cosa: `athlete_account_invites` e modellata
 * sull'atleta, e un secondo sistema di inviti e vietato dall'ownership dei
 * domini. Quello che esiste ed e raggiungibile e `/dashboard/access-management`
 * — «Ruoli e accessi» nella barra laterale — che legge e scrive tessere vere
 * via `/api/v1/club-roles/assignments`.
 *
 * Questo test fissa le tre cose che non devono tornare indietro:
 *
 *   1. il pulsante finto non c'e piu in nessuna delle due schede;
 *   2. entrambe montano la sezione «Accesso EasyGame», che il rimando lo fa
 *      davvero;
 *   3. la sezione non promette a chi non puo mantenere: si mostra solo a chi
 *      amministra il club, e non inventa un invito.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const STAFF = path.join(PROJECT_ROOT, "src/app/staff/[id]/page.tsx");
const SOCI = path.join(PROJECT_ROOT, "src/app/soci/[id]/page.tsx");
const CARD = path.join(
  PROJECT_ROOT,
  "src/components/club/club-person-access-card.tsx",
);

// I fine riga sono normalizzati e i commenti tolti: nessuna asserzione deve
// leggere una parola che vive dentro una spiegazione.
const strip = (file) =>
  readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const staff = strip(STAFF);
const soci = strip(SOCI);
const card = strip(CARD);

const schede = [
  ["staff", staff],
  ["soci", soci],
];

for (const [nome, codice] of schede) {
  test(`la scheda ${nome} non ha piu il pulsante che non chiamava niente`, () => {
    assert.ok(
      !/Invia Credenziali/i.test(codice),
      "il pulsante finto non deve tornare",
    );
    assert.ok(
      !/handleShareCredentials/.test(codice),
      "e nemmeno il gestore che mostrava solo un toast",
    );
  });

  test(`la scheda ${nome} monta la sezione «Accesso EasyGame»`, () => {
    assert.match(
      codice,
      /<ClubPersonAccessCard\b/,
      "al posto del pulsante ci deve essere il rimando vero",
    );
    assert.match(
      codice,
      /from "@\/components\/club\/club-person-access-card"/,
      "una sola implementazione, condivisa fra le due schede",
    );
  });
}

test("la sezione rimanda alla schermata che assegna i ruoli davvero", () => {
  assert.match(
    card,
    /\/dashboard\/access-management/,
    "e la pagina «Ruoli e accessi», raggiungibile dalla barra laterale",
  );
  assert.match(
    card,
    /\/api\/v1\/club-roles\/assignments/,
    "lo stato mostrato viene dalle tessere reali, non da un'ipotesi",
  );
});

test("la sezione dice se la persona ha gia un accesso, e con che ruolo", () => {
  assert.match(card, /Accesso attivo/);
  assert.match(card, /role_label/);
  assert.match(card, /custom_role_name/);
});

test("la sezione non compare a chi non amministra il club", () => {
  assert.match(
    card,
    /canManageClubConfigurationAsActor/,
    "lo stesso perimetro che `listClubAccessAssignments` impone sul server",
  );
  assert.match(
    card,
    /if \(ruoloAttivo === null \|\| !canManageClubConfigurationAsActor\(ruoloAttivo\)\) \{\s*return null;/,
    "a chi non puo amministrare non si mostra una scorciatoia che la guardia di percorso chiuderebbe",
  );
});

test("la sezione non inventa un secondo sistema di inviti", () => {
  assert.ok(
    !/athlete-accounts/.test(card),
    "il dominio dell'invito atleta non si estende a staff e soci",
  );
  assert.ok(
    !/password/i.test(card.replace(/le password/i, "")),
    "nessuna credenziale nasce, si mostra o si manda da questa scheda",
  );
});
