import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Quante volte la dashboard legge l'archivio atleti.
 *
 * Misurato su staging con un club da 212 atleti: la scheda delle metriche V1
 * (`MetricsOverview`) apriva **due** letture su `simplified_athletes`, e la
 * seconda — `all-athletes-<club>` — non veniva usata da nessuna riga del
 * componente. 226 KB di JSON scaricati e scartati a ogni apertura.
 *
 * Dal Web V2 la scheda delle metriche non esiste piu: i KPI arrivano da
 * `buildDashboardMetrics` sui dati che `loadClubDashboardOverview` ha gia
 * letto. Il test resta, perche una query morta non rompe niente e per questo
 * puo tornare per mesi: nessun file della Dashboard V2 deve aprire una
 * lettura propria sugli atleti.
 */
const V2_DIR = path.join(process.cwd(), "src/components/dashboard/v2");

const v2Sources = readdirSync(V2_DIR)
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => [name, readFileSync(path.join(V2_DIR, name), "utf8")]);

test("la dashboard V2 non legge gli atleti per conto suo per contarli", () => {
  for (const [name, source] of v2Sources) {
    assert.equal(
      /\.from\("simplified_athletes"\)/.test(source),
      false,
      `${name}: la lettura diretta di simplified_athletes era la query morta della V1`,
    );
    assert.equal(
      /all-athletes-\$\{/.test(source),
      false,
      `${name}: la query «all-athletes» era morta: nessuna riga ne usava il risultato`,
    );
  }
});

/**
 * E il totale continua a venire dallo stesso posto: `buildDashboardMetrics`
 * conta gli atleti attivi della lettura unica, e la barra KPI lo mostra.
 */
test("il totale atleti si ricava dalla lettura rimasta", () => {
  const page = readFileSync(path.join(V2_DIR, "ClubDashboard.tsx"), "utf8");
  const kpi = readFileSync(path.join(V2_DIR, "DashboardKpiBar.tsx"), "utf8");

  assert.match(page, /buildDashboardMetrics\(\{/);
  assert.match(page, /athletes: overview\?\.athletes \|\| \[\]/);
  assert.match(kpi, /formatInteger\(metrics\.totalAthletes\)/);
});
