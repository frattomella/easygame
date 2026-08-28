import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildDefaultSeason,
  normalizeClubSeasons,
} from "../../src/lib/club-seasons.ts";

/**
 * La prima stagione di un club.
 *
 * Il difetto che questi test fissano si vede **solo creando un club vero**:
 * dall'onboarding usciva un club con due stagioni chiamate entrambe
 * «2026/2027», entrambe con `status: "active"`, di cui una nessuno aveva mai
 * chiesto. Nessun test la vedeva perche ogni test partiva da un club che le
 * stagioni ce l'aveva gia.
 *
 * La causa non era la riga che salva: era che `normalizeClubSeasons`
 * **sintetizza** una stagione quando il club non ne ha, per non lasciare
 * l'interfaccia senza perimetro dei dati — e chi scriveva la portava nel
 * database insieme a quella vera.
 */

const ROOT = process.cwd();
const read = (relative) =>
  readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");

test("un club senza stagioni ne dichiara una sintetizzata, non un dato", () => {
  const empty = normalizeClubSeasons({});

  assert.equal(empty.isFallback, true);
  assert.equal(empty.seasons.length, 1);
  assert.equal(empty.seasons[0].id, buildDefaultSeason().id);
});

test("un club con stagioni salvate non e mai in fallback", () => {
  const state = normalizeClubSeasons({
    seasons: [
      {
        id: "season-2026-09-01-2027-06-30-abc",
        label: "2026/2027",
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        status: "active",
      },
    ],
    activeSeasonId: "season-2026-09-01-2027-06-30-abc",
  });

  assert.equal(state.isFallback, false);
  assert.equal(state.activeSeasonId, "season-2026-09-01-2027-06-30-abc");
});

/**
 * Lo stato che il difetto lasciava sul database, riletto: la lettura sana
 * l'invariante, ed e per questo che a schermo non si notava quasi niente. Il
 * dato salvato restava comunque sbagliato, e con due etichette identiche la
 * scheda Stagioni mostrava due righe indistinguibili.
 */
test("due stagioni active salvate vengono ridotte a una sola in lettura", () => {
  const state = normalizeClubSeasons({
    activeSeasonId: "season-2026-09-01-2027-06-30-abc",
    seasons: [
      {
        id: "season-2026-09-01-2027-06-30-abc",
        label: "2026/2027",
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        status: "active",
      },
      {
        id: "season-2026-2027",
        label: "2026/2027",
        startDate: "2026-07-01",
        endDate: "2027-06-30",
        status: "active",
      },
    ],
  });

  assert.equal(
    state.seasons.filter((season) => season.status === "active").length,
    1,
    "una sola stagione puo essere attiva",
  );
  assert.equal(state.activeSeasonId, "season-2026-09-01-2027-06-30-abc");
});

/**
 * `createClubSeason` e il solo punto che puo scrivere una stagione. Su un club
 * in fallback non deve portarsi dietro la stagione sintetizzata, e la prima
 * stagione vera deve nascere attiva: altrimenti `activeSeasonId` punterebbe a
 * un id che non esiste piu e il club resterebbe senza perimetro.
 */
test("la creazione non porta nel database la stagione sintetizzata", () => {
  const source = read("src/lib/server/seasons.ts");

  assert.match(
    source,
    /const previousSeasons = state\.isFallback \? \[\] : state\.seasons;/,
  );
  assert.match(
    source,
    /const shouldActivate = activate \|\| previousSeasons\.length === 0;/,
  );
  assert.match(
    source,
    /\[season, \.\.\.previousSeasons\],\s*\n\s*nextActiveSeasonId,/,
  );
});

/**
 * E l'onboarding non scrive piu `settings.seasons` a mano: quella colonna ha
 * un proprietario (CLAUDE.md §2) e passa dalla sua rotta.
 */
test("l'onboarding crea la stagione dal suo dominio", () => {
  const source = read("src/app/onboarding/page.tsx");

  assert.match(
    source,
    /import \{ createSeason \} from "@\/lib\/api\/seasons";/,
  );
  assert.match(source, /await createSeason\(\{/);
  assert.equal(
    /seasons: \[season, \.\.\.current\.seasons\]/.test(source),
    false,
    "nessuna scrittura diretta di settings.seasons dall'onboarding",
  );
  assert.equal(
    /createSeasonDraft/.test(source),
    false,
    "la bozza di stagione non si costruisce piu nella pagina",
  );
});

/**
 * E lo scaffale locale del club impara la stagione appena creata: senza, la
 * barra in cima diceva «Nessuna stagione attiva» su un club che la stagione
 * l'aveva, e continuava a dirlo dopo un ricaricamento.
 */
test("la stagione creata aggiorna il club attivo memorizzato", () => {
  const onboarding = read("src/app/onboarding/page.tsx");
  const client = read("src/lib/api/client.ts");

  assert.match(onboarding, /rememberActiveSeason\(season\.id, season\.label\)/);
  assert.match(client, /export const rememberActiveSeason = \(/);
  assert.match(
    client,
    /new CustomEvent\("club-updated", \{ detail: \{ clubData: updated \} \}\)/,
    "l'aggiornamento deve raggiungere l'intestazione gia montata",
  );

  /*
    E resta **una** implementazione: la pagina Organizzazione aveva la sua
    copia della stessa scrittura su `localStorage`.
  */
  const organization = read("src/app/organization/page.tsx");
  assert.match(organization, /rememberActiveSeason\(season\.id, season\.label\)/);
  assert.equal(
    /const syncActiveSeasonLocally =/.test(organization),
    false,
    "nessuna seconda implementazione della stessa scrittura",
  );
});

/**
 * I record marcati con una stagione che il club **non ha**.
 *
 * Non e un caso teorico: su staging, EasyGame FC ha una categoria e i suoi due
 * gruppi operativi marcati `seasonId: "season-2026-2027"`, mentre
 * `clubs.settings.seasons` e vuoto. Oggi si vedono perche quell'id coincide con
 * la stagione sintetizzata in lettura. Il giorno in cui il club crea la sua
 * prima stagione vera, la sintetizzata sparisce e quei tre record — categoria
 * compresa — non appartengono piu a nessuna annata: scomparirebbero da ogni
 * schermata, in silenzio.
 */
test("un record marcato con una stagione inesistente non sparisce", async () => {
  const { filterCollectionBySeason } = await import(
    "../../src/lib/club-seasons.ts"
  );

  const records = [
    { id: "vecchia", seasonId: "season-2026-2027" },
    { id: "senza-stagione" },
    { id: "di-questa-stagione", seasonId: "season-2027-2028" },
    { id: "di-un-altra-vera", seasonId: "season-2026-2027-vera" },
  ];

  const known = ["season-2027-2028", "season-2026-2027-vera"];

  const visible = filterCollectionBySeason("categories", records, "season-2027-2028", {
    legacySeasonId: "season-2027-2028",
    knownSeasonIds: known,
  }).map((record) => record.id);

  assert.deepEqual(visible, ["vecchia", "senza-stagione", "di-questa-stagione"]);

  /*
    E la stagione vera di un'altra annata continua a essere esclusa: la
    correzione non deve trasformare il filtro in un colabrodo.
  */
  assert.equal(visible.includes("di-un-altra-vera"), false);
});

test("senza l'elenco delle stagioni note il filtro si comporta come prima", async () => {
  const { filterCollectionBySeason } = await import(
    "../../src/lib/club-seasons.ts"
  );

  const records = [{ id: "a", seasonId: "season-x" }, { id: "b" }];

  assert.deepEqual(
    filterCollectionBySeason("categories", records, "season-y", {
      legacySeasonId: "season-y",
    }).map((record) => record.id),
    ["b"],
  );
});

/**
 * E non si marca affatto finche la stagione e solo quella sintetizzata: e da
 * li che nascono i record orfani.
 */
test("su un club senza stagioni salvate non si marca e non si filtra", () => {
  const source = read("src/lib/server/resources.ts");

  assert.match(
    source,
    /if \(seasonState\.isFallback\) \{\s*\n\s*return null;/,
  );
  assert.match(
    source,
    /knownSeasonIds: seasonState\.seasons\.map\(\(season\) => season\.id\),/,
  );
  assert.match(source, /knownSeasonIds: season\.knownSeasonIds,/);
});
