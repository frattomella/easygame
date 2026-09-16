import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

/*
  Le correzioni dell'UAT sul redesign (secondo lotto, §4 del mandato):

  1. sul cielo il testo si legge — Tailwind emette `text-white/NN` solo se NN
     sta nella scala delle opacita, altrimenti scarta la classe in silenzio e
     l'elemento eredita l'inchiostro scuro (era la briciola «Panoramica» e
     l'eyebrow della dashboard, illeggibili);
  2. il badge del ruolo nella Home account non si spezza in due righe;
  3. la barra superiore non ripete la stagione: il contesto del club lo dice
     la Sidebar;
  4. «Atleti in prova» e una vista visibile dell'area Atleti, non una voce del
     menu a tre puntini.
*/

const root = process.cwd();
const leggi = (p) => readFileSync(path.join(root, p), "utf8");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------ 1. opacita del cielo */

const SCALA_TAILWIND = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

const scalaEstesa = () => {
  const config = leggi("tailwind.config.ts");
  const blocco = config.match(/opacity:\s*\{([\s\S]*?)\}/);
  assert.ok(blocco, "tailwind.config.ts dichiara la scala delle opacita del cielo");
  return [...blocco[1].matchAll(/(\d+):\s*"0?\.(\d+)"/g)].map((m) => Number(m[1]));
};

test("ogni `colore/NN` usato nel sorgente sta nella scala delle opacita, altrimenti Tailwind lo scarta", () => {
  const scala = new Set([...SCALA_TAILWIND, ...scalaEstesa()]);
  const elenco = execSync(
    'git grep -h -o -E "(text|bg|border|ring|from|to|via|placeholder|divide|fill|stroke|outline|shadow)-(white|black|egw-[a-z0-9-]+)/[0-9]+" -- src',
    { cwd: root, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  assert.ok(elenco.length > 50, "il censimento trova le classi con opacita");
  const fuoriScala = [...new Set(elenco.filter((c) => !scala.has(Number(c.split("/").pop()))))];
  assert.deepEqual(fuoriScala, [], `opacita fuori scala (verrebbero scartate): ${fuoriScala.join(", ")}`);
});

test("le briciole e l'eyebrow sul cielo usano un'opacita che esiste", () => {
  for (const n of [72, 58, 26, 14, 22, 12]) {
    assert.ok(scalaEstesa().includes(n), `/${n} e nella scala`);
  }
});

/* ------------------------------------------------------ 2. il badge del ruolo */

test("DataChip porta l'icona per prop e il glifo fra i figli resta in riga", () => {
  const chip = senzaCommenti(leggi("src/components/web/primitives/StatusPill.tsx"));
  assert.match(chip, /icon\?: React\.ReactNode/, "la prop `icon`");
  assert.match(chip, /\[&>svg\]:inline-block/, "un svg passato fra i figli non e un blocco");
  const home = senzaCommenti(leggi("src/components/account/v2/account-home-screen.tsx"));
  assert.match(home, /icon=\{ownerMode \? <Crown aria-hidden \/> : <Users aria-hidden \/>\}/, "la Home account passa la corona per prop");
  assert.doesNotMatch(home, /<DataChip[^>]*>\s*\{ownerMode \? <Crown/, "e non piu fra i figli");
});

/* ------------------------------------------------------ 3. la barra senza stagione */

test("la barra superiore non porta un controllo della stagione; l'identita del club resta nella Sidebar e nella barra mobile", () => {
  const barra = senzaCommenti(leggi("src/components/web/shell/Topbar.tsx"));
  assert.doesNotMatch(barra, /aria-label=\{`Stagione \$\{seasonLabel\}`\}/, "niente pulsante «Stagione»");
  assert.doesNotMatch(barra, /activeClub\?\.activeSeasonLabel/, "la barra non legge la stagione");
  const sidebar = senzaCommenti(leggi("src/components/web/shell/Sidebar.tsx"));
  assert.match(sidebar, /Stagioni del club/, "la Sidebar porta le stagioni");
  const mobile = senzaCommenti(leggi("src/components/layout/MobileTopBar.tsx"));
  assert.match(mobile, /Stagione \$\{seasonLabel\}/, "la barra mobile dice la stagione nell'identita");
});

/* ------------------------------------------------------ 4. atleti in prova visibili */

test("«In prova» e una vista accanto ad «Atleti», con il conteggio, e non sta piu nel menu a tre puntini", () => {
  const selettore = senzaCommenti(leggi("src/components/athletes/v2/AthletesViewSwitch.tsx"));
  assert.match(selettore, /<nav aria-label="Vista"/, "sono due pagine: link con aria-current, non una tablist");
  assert.ok(selettore.includes('aria-current={attiva ? "page" : undefined}'), "la voce attiva e la pagina corrente");
  assert.match(selettore, /listTrialAthletes\(\{ status: "in_trial" \}\)/, "conta le persone in prova");
  assert.match(selettore, /roleHasPermission\(role, "trials\.read"\)/, "solo a chi puo leggerle");
  const atleti = senzaCommenti(leggi("src/app/athletes/page.tsx"));
  assert.match(atleti, /<AthletesViewSwitch\s+value="athletes"/, "la pagina Atleti la monta");
  assert.doesNotMatch(atleti, /<MenuItem[^>]*>\s*<UserRoundSearch \/>\s*Atleti in prova/, "non e piu una voce del menu");
  const prova = senzaCommenti(leggi("src/app/athletes/in-prova/page.tsx"));
  assert.match(prova, /<AthletesViewSwitch value="trials"/, "e la pagina In prova pure, con il conteggio che gia sa");
});

test("un colore del sistema non porta mai un modificatore di opacita: le variabili CSS non hanno un canale alfa e la classe cadrebbe", () => {
  const elenco = execSync(
    'git grep -h -o -E "(text|bg|border|ring|from|to|via|placeholder|divide|fill|stroke|outline|shadow)-egw-[a-z0-9-]+/[0-9]+" -- src || true',
    { cwd: root, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  assert.deepEqual([...new Set(elenco)], [], `opacita su un colore del sistema (verrebbe scartata): ${elenco.join(", ")}`);
});
