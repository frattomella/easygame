/**
 * **Le differenze fra sport, in un posto solo** (ADR-0200 §8).
 *
 * EasyGame e multi-sport: niente nell'architettura dice «quarti» o «punti».
 * Il risultato di una gara e un elenco generico di periodi
 * `{number, label, home, away}`; questo modulo dice, per uno sport, come si
 * chiamano i periodi, quanti sono di norma, quali statistiche individuali hanno
 * senso e quali ruoli esistono. Uno sport che non conosce torna all'adattatore
 * generico, che funziona per tutto e non presume niente.
 *
 * Non sono venti sport: sono il generico e quattro adattatori veri — basket,
 * calcio, pallavolo, pallamano — perche sono quelli dei club che usano
 * EasyGame oggi. Aggiungerne uno e una voce in `ADAPTERS`.
 *
 * Modulo puro, lo usano il gestionale (inserimento risultati) e il sito.
 */

export type StatDefinition = {
  key: string;
  label: string;
  short: string;
  /** Come si aggrega su una stagione. */
  aggregate: "sum" | "max";
};

export type SportAdapter = {
  key: string;
  label: string;
  /** Il nome del periodo al singolare e plurale: «Quarto», «Tempo», «Set». */
  periodLabel: string;
  periodLabelPlural: string;
  defaultPeriods: number;
  maxPeriods: number;
  /** L'etichetta del periodo n (1-based), compresi supplementari. */
  periodName: (n: number) => string;
  /** Come si chiama il punteggio: «punti», «gol», «set». */
  scoreUnit: string;
  /** Nella pallavolo il risultato e in set, i parziali in punti. */
  resultCountsPeriodsWon: boolean;
  stats: readonly StatDefinition[];
  positions: readonly string[];
  /** Il pareggio esiste in questo sport. */
  allowsDraw: boolean;
};

const generic: SportAdapter = {
  key: "generic",
  label: "Generico",
  periodLabel: "Periodo",
  periodLabelPlural: "Periodi",
  defaultPeriods: 2,
  maxPeriods: 10,
  periodName: (n) => `${n}° periodo`,
  scoreUnit: "punti",
  resultCountsPeriodsWon: false,
  stats: [{ key: "points", label: "Punti", short: "PT", aggregate: "sum" }],
  positions: [],
  allowsDraw: true,
};

const basketball: SportAdapter = {
  key: "basketball",
  label: "Pallacanestro",
  periodLabel: "Quarto",
  periodLabelPlural: "Quarti",
  defaultPeriods: 4,
  maxPeriods: 8,
  periodName: (n) => (n <= 4 ? `${n}° quarto` : n === 5 ? "Supplementare" : `${n - 4}° supplementare`),
  scoreUnit: "punti",
  resultCountsPeriodsWon: false,
  stats: [
    { key: "points", label: "Punti", short: "PT", aggregate: "sum" },
    { key: "rebounds", label: "Rimbalzi", short: "RIM", aggregate: "sum" },
    { key: "assists", label: "Assist", short: "AST", aggregate: "sum" },
    { key: "steals", label: "Palle recuperate", short: "REC", aggregate: "sum" },
    { key: "blocks", label: "Stoppate", short: "STP", aggregate: "sum" },
    { key: "threes", label: "Tiri da tre segnati", short: "3PT", aggregate: "sum" },
    { key: "fouls", label: "Falli", short: "FAL", aggregate: "sum" },
  ],
  positions: ["Playmaker", "Guardia", "Ala piccola", "Ala grande", "Centro"],
  allowsDraw: false,
};

const football: SportAdapter = {
  key: "football",
  label: "Calcio",
  periodLabel: "Tempo",
  periodLabelPlural: "Tempi",
  defaultPeriods: 2,
  maxPeriods: 5,
  periodName: (n) => (n === 1 ? "1° tempo" : n === 2 ? "2° tempo" : n === 3 ? "1° supplementare" : n === 4 ? "2° supplementare" : "Rigori"),
  scoreUnit: "gol",
  resultCountsPeriodsWon: false,
  stats: [
    { key: "goals", label: "Gol", short: "G", aggregate: "sum" },
    { key: "assists", label: "Assist", short: "A", aggregate: "sum" },
    { key: "yellow", label: "Ammonizioni", short: "AMM", aggregate: "sum" },
    { key: "red", label: "Espulsioni", short: "ESP", aggregate: "sum" },
    { key: "minutes", label: "Minuti giocati", short: "MIN", aggregate: "sum" },
  ],
  positions: ["Portiere", "Difensore", "Centrocampista", "Attaccante"],
  allowsDraw: true,
};

const volleyball: SportAdapter = {
  key: "volleyball",
  label: "Pallavolo",
  periodLabel: "Set",
  periodLabelPlural: "Set",
  defaultPeriods: 3,
  maxPeriods: 5,
  periodName: (n) => `${n}° set`,
  scoreUnit: "set",
  resultCountsPeriodsWon: true,
  stats: [
    { key: "points", label: "Punti", short: "PT", aggregate: "sum" },
    { key: "aces", label: "Ace", short: "ACE", aggregate: "sum" },
    { key: "blocks", label: "Muri", short: "MURI", aggregate: "sum" },
    { key: "attacks", label: "Attacchi vincenti", short: "ATT", aggregate: "sum" },
  ],
  positions: ["Palleggiatore", "Opposto", "Schiacciatore", "Centrale", "Libero"],
  allowsDraw: false,
};

const handball: SportAdapter = {
  key: "handball",
  label: "Pallamano",
  periodLabel: "Tempo",
  periodLabelPlural: "Tempi",
  defaultPeriods: 2,
  maxPeriods: 5,
  periodName: (n) => (n <= 2 ? `${n}° tempo` : n <= 4 ? `${n - 2}° supplementare` : "Rigori"),
  scoreUnit: "reti",
  resultCountsPeriodsWon: false,
  stats: [
    { key: "goals", label: "Reti", short: "R", aggregate: "sum" },
    { key: "assists", label: "Assist", short: "A", aggregate: "sum" },
    { key: "saves", label: "Parate", short: "PAR", aggregate: "sum" },
    { key: "suspensions", label: "Esclusioni", short: "2'", aggregate: "sum" },
  ],
  positions: ["Portiere", "Terzino", "Centrale", "Ala", "Pivot"],
  allowsDraw: true,
};

const ADAPTERS: Record<string, SportAdapter> = {
  generic,
  basketball,
  football,
  volleyball,
  handball,
};

/** Le grafie con cui uno sport e scritto nelle impostazioni dei club. */
const ALIASES: Record<string, string> = {
  basket: "basketball",
  basketball: "basketball",
  pallacanestro: "basketball",
  minibasket: "basketball",
  calcio: "football",
  football: "football",
  soccer: "football",
  calcetto: "football",
  calcio5: "football",
  futsal: "football",
  "calcio a 5": "football",
  pallavolo: "volleyball",
  volley: "volleyball",
  volleyball: "volleyball",
  minivolley: "volleyball",
  pallamano: "handball",
  handball: "handball",
};

export const resolveSportKey = (value: unknown) => {
  const token = String(value ?? "").trim().toLowerCase();
  return ALIASES[token] || (ADAPTERS[token] ? token : "generic");
};

export const getSportAdapter = (value: unknown): SportAdapter => ADAPTERS[resolveSportKey(value)] || generic;

export const listSportAdapters = () => Object.values(ADAPTERS);

/** Lo sport principale di un club, dalle sue impostazioni. */
export const clubPrimarySport = (settings: unknown) => {
  const record = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const sports = Array.isArray(record.sports) ? record.sports : record.sport ? [record.sport] : [];
  return resolveSportKey(sports[0]);
};

export type PeriodScore = { number: number; label: string; home: number | null; away: number | null };

/**
 * I periodi ripuliti: numeri progressivi, punteggi interi non negativi o
 * nulli, etichette dall'adattatore quando mancano.
 */
export const normalizePeriodScores = (raw: unknown, sport: SportAdapter): PeriodScore[] => {
  const items = Array.isArray(raw) ? raw : [];
  const score = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 && n <= 999 ? n : null;
  };
  return items.slice(0, sport.maxPeriods).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const number = index + 1;
    const label = String(record.label ?? "").trim().slice(0, 40) || sport.periodName(number);
    return { number, label, home: score(record.home ?? record.homeScore), away: score(record.away ?? record.awayScore) };
  });
};

/**
 * Il risultato coerente con i periodi, quando si puo ricavare: la somma dei
 * parziali, o i set vinti nella pallavolo. `null` se i periodi non bastano.
 */
export const resultFromPeriods = (periods: PeriodScore[], sport: SportAdapter) => {
  const complete = periods.filter((period) => period.home !== null && period.away !== null);
  if (!complete.length || complete.length !== periods.length) return null;
  if (sport.resultCountsPeriodsWon) {
    return {
      home: complete.filter((period) => (period.home as number) > (period.away as number)).length,
      away: complete.filter((period) => (period.away as number) > (period.home as number)).length,
    };
  }
  return {
    home: complete.reduce((sum, period) => sum + (period.home as number), 0),
    away: complete.reduce((sum, period) => sum + (period.away as number), 0),
  };
};

/** Le statistiche individuali ripulite: solo chiavi dello sport, interi non negativi. */
export const normalizePlayerStats = (raw: unknown, sport: SportAdapter) => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const stat of sport.stats) {
    const n = Math.round(Number(record[stat.key]));
    if (Number.isFinite(n) && n >= 0 && n <= 9999) out[stat.key] = n;
  }
  return out;
};
