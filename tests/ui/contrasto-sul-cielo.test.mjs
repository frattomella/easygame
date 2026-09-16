import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Inchiostro scuro su fondo scuro = 0.**
 *
 * Il cielo (ambienti 2 e 3) e blu scuro. Un blocco di avviso e una tinta al
 * 10% con dentro inchiostro: sul bianco si legge, sul cielo diventa un
 * riquadro scuro con testo scuro — la home account lo mostrava sugli avvisi di
 * verifica dei recapiti. La correzione non e per una pagina: e nel sistema.
 * Chi dipinge il cielo lo dichiara (`SkyProvider`), ogni `Panel` lo azzera, e
 * `AlertBlock` sceglie la forma opaca da solo. Questo file pretende che la
 * catena resti intera.
 */
const RADICE = process.cwd();
const leggi = (relativo) => readFileSync(path.join(RADICE, ...relativo.split("/")), "utf8");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("le superfici che dipingono il cielo lo dichiarano", () => {
  for (const file of [
    "src/components/web/shell/OutsideShell.tsx",
    "src/components/account/v2/account-home-screen.tsx",
  ]) {
    const s = senzaCommenti(leggi(file));
    assert.match(s, /egw-sky-full/, `${file}: dipinge il cielo`);
    assert.match(s, /<SkyProvider>/, `${file}: deve dichiararlo a chi contiene`);
  }
});

test("il pannello bianco azzera il cielo per cio che contiene", () => {
  const surface = senzaCommenti(leggi("src/components/web/primitives/Surface.tsx"));
  assert.match(surface, /<SkyContext\.Provider value=\{false\}>/, "Panel e bianco: dentro non si e piu sul cielo");
  const shell = senzaCommenti(leggi("src/components/web/shell/OutsideShell.tsx"));
  assert.match(shell, /<SkyProvider onSky=\{false\}>/, "il pannello del guscio fuori dal club e bianco");
});

test("il blocco di avviso sul cielo e bianco e opaco", () => {
  const alerts = senzaCommenti(leggi("src/components/web/page/Alerts.tsx"));
  assert.match(alerts, /const onSky = useOnSky\(\);/);
  assert.match(alerts, /onSky \? "border-white\/60 bg-white shadow-egw-plane-1" : s\.box/);
});

test("il testo che poggia direttamente sul cielo e bianco", () => {
  /* Nel guscio fuori dal club, fuori dal pannello, ogni classe di colore del testo e bianca. */
  const shell = senzaCommenti(leggi("src/components/web/shell/OutsideShell.tsx"));
  const fuoriDalPannello = shell.split("bare ? (")[0];
  const scuri = fuoriDalPannello.match(/text-egw-ink[\w-]*|text-slate-\d+|text-gray-\d+|text-\[rgba\(11,26,58/g) || [];
  assert.deepEqual(scuri, [], "inchiostro scuro fuori dal pannello, sul cielo");
  const home = senzaCommenti(leggi("src/components/account/v2/account-home-screen.tsx"));
  /* La riga del recupero password poggia sul cielo: bianca. */
  assert.match(home, /text-white\/80">\s*Non conosci nessuna password/);
});
