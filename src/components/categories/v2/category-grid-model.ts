import type { FilterDef, ViewDef } from "@/components/web/datagrid/types";

/**
 * Il modello di vista di una categoria come lo costruisce la pagina
 * (`buildCategoryViewModel` in `src/app/categories/page.tsx`): conteggi gia
 * calcolati sugli atleti attivi, gli allenatori e il programma settimanale.
 */
export interface CategoryViewModel {
  id: string;
  name: string;
  sport: string;
  ageRange: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  birthYearsLabel: string;
  athletesCount: number;
  trainersCount: number;
  trainingsPerWeek: number;
  color: string;
  /** Il posto scelto dal club (D-INT-9), quando c'e. */
  sortOrder: number | null;
  /** Categorie in cui gli atleti di questa categoria possono essere utilizzati. */
  compatibleCategoryIds: string[];
}

/**
 * La riga della griglia: il modello di vista piu cio che la griglia mostra
 * accanto — la posizione nell'ordine del club, le sedi dei gruppi operativi
 * (ADR-0038), i nomi degli allenatori e delle categorie compatibili.
 */
export interface CategoryRow extends CategoryViewModel {
  /** La posizione (da 1) nell'ordine scelto dal club. */
  posizione: number;
  /** Le sedi dei gruppi operativi attivi e non impliciti. */
  siteNames: string[];
  siteIds: string[];
  /** Le sedi dei gruppi archiviati (storia che non si porta via). */
  archivedSiteNames: string[];
  trainerIds: string[];
  trainerNames: string[];
  compatibleCategoryNames: string[];
}

export const CATEGORY_GRID_MODULE = "categorie";

export const categoryRowId = (row: CategoryRow) => row.id;

/** Ricerca in griglia: nome o descrizione/sport, come la V1. */
export const categoryRowMatchesQuery = (row: CategoryRow, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q) || row.sport.toLowerCase().includes(q);
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [];

/** Gli anni di nascita coperti da almeno una categoria, dal piu recente. */
export const collectCategoryBirthYears = (rows: readonly CategoryRow[]): number[] => {
  const years = new Set<number>();
  for (const row of rows) {
    const from = row.birthYearFrom;
    const to = row.birthYearTo ?? row.birthYearFrom;
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    const lo = Math.min(from as number, to as number);
    const hi = Math.max(from as number, to as number);
    for (let year = lo; year <= hi; year += 1) years.add(year);
  }
  return Array.from(years).sort((a, b) => b - a);
};

/**
 * I filtri della griglia. La sede **non** e qui: e un controllo di contesto
 * nell'intestazione (guideline 09 §9.2), con la stessa regola della V1 — i
 * gruppi impliciti restano visibili con qualunque sede scelta.
 */
export const buildCategoryFilters = ({
  years,
  trainers,
}: {
  years: readonly number[];
  trainers: readonly { id: string; name: string }[];
}): FilterDef<CategoryRow>[] => [
  {
    id: "anno",
    label: "Anno di nascita",
    type: "select",
    options: years.map((year) => ({ value: String(year), label: String(year) })),
    apply: (row, value) => {
      const year = Number(value);
      if (!Number.isInteger(year)) return true;
      const from = row.birthYearFrom;
      const to = row.birthYearTo ?? row.birthYearFrom;
      if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
      return year >= Math.min(from as number, to as number) && year <= Math.max(from as number, to as number);
    },
  },
  {
    id: "atleti",
    label: "Atleti",
    type: "select",
    options: [
      { value: "con", label: "Con atleti" },
      { value: "senza", label: "Senza atleti", tone: "amber" },
    ],
    apply: (row, value) => (value === "senza" ? row.athletesCount === 0 : value === "con" ? row.athletesCount > 0 : true),
  },
  {
    id: "copertura",
    label: "Allenatori assegnati",
    type: "select",
    options: [
      { value: "con", label: "Con allenatore" },
      { value: "senza", label: "Senza allenatore", tone: "amber" },
    ],
    apply: (row, value) => (value === "senza" ? row.trainersCount === 0 : value === "con" ? row.trainersCount > 0 : true),
  },
  {
    id: "allenatore",
    label: "Allenatore",
    type: "multi",
    options: trainers.map((trainer) => ({ value: trainer.id, label: trainer.name })),
    apply: (row, value) => {
      const wanted = asStringArray(value);
      if (!wanted.length) return true;
      return wanted.some((id) => row.trainerIds.includes(id));
    },
  },
];

/** Le viste di sistema oltre a «Tutte». */
export const CATEGORY_VIEWS: ViewDef[] = [
  { id: "con-atleti", label: "Con atleti", filters: { atleti: "con" }, builtIn: true },
  { id: "senza-atleti", label: "Senza atleti", filters: { atleti: "senza" }, builtIn: true, tone: "amber" },
  { id: "senza-allenatore", label: "Senza allenatore", filters: { copertura: "senza" }, builtIn: true, tone: "amber" },
];
