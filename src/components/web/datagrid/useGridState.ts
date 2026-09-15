"use client";

import * as React from "react";
import { readPreference, writePreference } from "@/lib/web/preferences";
import type {
  ColumnDef,
  DataGridProps,
  Density,
  FilterDef,
  FilterState,
  FilterValue,
  SortDirection,
  ViewDef,
} from "@/components/web/datagrid/types";

/**
 * Lo stato del DataGrid (guideline 07 §7.3, §7.5–7.8): filtri, ricerca,
 * ordinamento, raggruppamento, colonne, densita, selezione, pagina. Tutto cio
 * che cambia cio che l'utente vede persiste per utente per modulo
 * (`egw.<module>.*`), tranne la ricerca in griglia e la selezione.
 */
export const ALL_VIEW_ID = "__all__";
export const PAGE_SIZES = [25, 50, 100] as const;

export type SortState = { columnId: string; direction: SortDirection } | null;

const isEmptyFilter = (value: FilterValue) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && !Array.isArray(value) && !value.from && !value.to);

export const activeFilterEntries = (filters: FilterState) =>
  Object.entries(filters).filter(([, value]) => !isEmptyFilter(value));

export const sameFilters = (a: FilterState, b: FilterState) => {
  const ea = activeFilterEntries(a);
  const eb = activeFilterEntries(b);
  if (ea.length !== eb.length) return false;
  return ea.every(([k, v]) => JSON.stringify(v) === JSON.stringify(b[k]));
};

const compare = (a: unknown, b: unknown) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "it", { numeric: true, sensitivity: "base" });
};

type Persisted = {
  density?: Density;
  columns?: string[];
  sort?: SortState;
  pageSize?: number;
  view?: string;
  grouped?: boolean;
  personalViews?: ViewDef[];
  collapsedGroups?: string[];
};

export function useGridState<Row>(props: DataGridProps<Row>) {
  const {
    module,
    rows,
    getRowId,
    columns,
    filters = [],
    views = [],
    search,
    defaultSort,
    groupBy,
    defaultGrouped = false,
    persist = true,
    defaultPageSize = 25,
    selectedIds: controlledSelection,
    onSelectionChange,
    onQueryChange,
    onFiltersChange,
    onViewChange,
    requestedViewId,
  } = props;

  const load = <K extends keyof Persisted>(key: K, fallback: NonNullable<Persisted[K]>) =>
    persist ? readPreference<NonNullable<Persisted[K]>>(module, String(key), fallback) : fallback;
  const save = <K extends keyof Persisted>(key: K, value: Persisted[K]) => {
    if (persist) writePreference(module, String(key), value);
  };

  const [hydrated, setHydrated] = React.useState(false);
  const [density, setDensityState] = React.useState<Density>("medium");
  const [visibleColumns, setVisibleColumnsState] = React.useState<string[]>(() =>
    columns.filter((c) => !c.hidden).map((c) => c.id),
  );
  const [sort, setSortState] = React.useState<SortState>(defaultSort || null);
  const [pageSize, setPageSizeState] = React.useState<number>(defaultPageSize);
  const [grouped, setGroupedState] = React.useState<boolean>(defaultGrouped);
  const [personalViews, setPersonalViewsState] = React.useState<ViewDef[]>([]);
  const [activeViewId, setActiveViewIdState] = React.useState<string>(ALL_VIEW_ID);
  const [filterState, setFilterState] = React.useState<FilterState>({});
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [collapsedGroups, setCollapsedGroupsState] = React.useState<string[]>([]);
  const [internalSelection, setInternalSelection] = React.useState<Set<string>>(new Set());
  const [selectAllBeyondPage, setSelectAllBeyondPage] = React.useState(false);

  const selection = controlledSelection ? new Set(controlledSelection) : internalSelection;
  const setSelection = React.useCallback(
    (next: Set<string>) => {
      if (onSelectionChange) onSelectionChange(next);
      if (!controlledSelection) setInternalSelection(next);
    },
    [controlledSelection, onSelectionChange],
  );

  const allViews = React.useMemo<ViewDef[]>(
    () => [
      { id: ALL_VIEW_ID, label: "Tutti", filters: {}, builtIn: true },
      ...views.map((v) => ({ ...v, builtIn: true })),
      ...personalViews,
    ],
    [personalViews, views],
  );

  const applyView = React.useCallback(
    (view: ViewDef | undefined) => {
      if (!view) return;
      setFilterState(view.filters || {});
      if (view.sort !== undefined && view.sort !== null) setSortState(view.sort);
      if (view.groupBy !== undefined && view.groupBy !== null) setGroupedState(Boolean(view.groupBy));
      if (view.columns) setVisibleColumnsState(view.columns);
      if (view.density) setDensityState(view.density);
      setPage(0);
    },
    [],
  );

  // Idratazione delle preferenze (una volta, dopo il montaggio).
  React.useEffect(() => {
    const d = load("density", "medium");
    setDensityState(d);
    const cols = load("columns", [] as string[]);
    if (cols.length) {
      const known = new Set(columns.map((c) => c.id));
      setVisibleColumnsState(cols.filter((id) => known.has(id)));
    }
    const s = persist ? readPreference<SortState>(module, "sort", null) : null;
    if (s && columns.some((c) => c.id === s.columnId)) setSortState(s);
    const ps = load("pageSize", defaultPageSize as number);
    if (PAGE_SIZES.includes(ps as 25)) setPageSizeState(ps);
    setGroupedState(load("grouped", defaultGrouped));
    const pv = load("personalViews", [] as ViewDef[]);
    setPersonalViewsState(pv);
    setCollapsedGroupsState(load("collapsedGroups", [] as string[]));
    /*
      La vista salvata dall'utente vince; se non ne ha mai scelta una, si
      apre la vista predefinita del modulo (o quella che ha segnato lui).
    */
    const v = persist ? readPreference<string | null>(module, "view", null) : null;
    const candidates: ViewDef[] = [
      { id: ALL_VIEW_ID, label: "Tutti", filters: {}, builtIn: true },
      ...views,
      ...pv,
    ];
    const defaultView = candidates.find((x) => x.isDefault);
    const chosen = (v ? candidates.find((x) => x.id === v) : undefined) || defaultView;
    if (chosen && chosen.id !== ALL_VIEW_ID) {
      setActiveViewIdState(chosen.id);
      applyView(chosen);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  const setDensity = (d: Density) => {
    setDensityState(d);
    save("density", d);
  };
  const setVisibleColumns = (ids: string[]) => {
    setVisibleColumnsState(ids);
    save("columns", ids);
  };
  const setSort = (s: SortState) => {
    setSortState(s);
    save("sort", s);
  };
  const toggleSort = (columnId: string) => {
    const next: SortState =
      sort?.columnId === columnId
        ? { columnId, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { columnId, direction: "asc" };
    setSort(next);
  };
  const setPageSize = (n: number) => {
    setPageSizeState(n);
    setPage(0);
    save("pageSize", n);
  };
  const setGrouped = (g: boolean) => {
    setGroupedState(g);
    save("grouped", g);
  };
  const toggleGroupCollapsed = (key: string) => {
    const next = collapsedGroups.includes(key) ? collapsedGroups.filter((k) => k !== key) : [...collapsedGroups, key];
    setCollapsedGroupsState(next);
    save("collapsedGroups", next);
  };

  const setActiveView = (id: string) => {
    setActiveViewIdState(id);
    save("view", id);
    applyView(allViews.find((v) => v.id === id));
    onViewChange?.(id);
  };

  // Una vista chiesta dall'esterno (contatore in intestazione, avviso della Dashboard).
  const lastRequested = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    if (!hydrated) return;
    if (requestedViewId === undefined || requestedViewId === lastRequested.current) return;
    lastRequested.current = requestedViewId;
    if (requestedViewId && allViews.some((v) => v.id === requestedViewId)) setActiveView(requestedViewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedViewId, hydrated]);

  React.useEffect(() => {
    onQueryChange?.(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  React.useEffect(() => {
    onFiltersChange?.(filterState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState]);

  const setFilter = (id: string, value: FilterValue) => {
    setFilterState((current) => ({ ...current, [id]: value }));
    setPage(0);
    if (selection.size) {
      setSelection(new Set());
      setSelectAllBeyondPage(false);
    }
  };
  const clearFilters = () => {
    setFilterState({});
    setPage(0);
  };

  const activeView = allViews.find((v) => v.id === activeViewId) || allViews[0];
  const viewDirty = !sameFilters(filterState, activeView?.filters || {});

  const savePersonalView = (view: Omit<ViewDef, "id" | "filters"> & { id?: string }) => {
    const id = view.id || `v_${Date.now().toString(36)}`;
    const next: ViewDef = {
      ...view,
      id,
      filters: { ...filterState },
      sort,
      groupBy: grouped && groupBy ? groupBy.id : null,
      columns: visibleColumns,
      density,
    };
    const list = personalViews.some((v) => v.id === id)
      ? personalViews.map((v) => (v.id === id ? { ...v, ...next } : v))
      : [...personalViews, next];
    const normalized = view.isDefault ? list.map((v) => ({ ...v, isDefault: v.id === id })) : list;
    setPersonalViewsState(normalized);
    save("personalViews", normalized);
    setActiveViewIdState(id);
    save("view", id);
    return id;
  };
  const updatePersonalView = (id: string, patch: Partial<ViewDef>) => {
    let list = personalViews.map((v) => (v.id === id ? { ...v, ...patch } : v));
    if (patch.isDefault) list = list.map((v) => ({ ...v, isDefault: v.id === id }));
    setPersonalViewsState(list);
    save("personalViews", list);
  };
  const deletePersonalView = (id: string) => {
    const list = personalViews.filter((v) => v.id !== id);
    setPersonalViewsState(list);
    save("personalViews", list);
    if (activeViewId === id) setActiveView(ALL_VIEW_ID);
  };

  /* ── Derivazione ─────────────────────────────────────────────────────── */
  const filterDefs = React.useMemo(() => new Map(filters.map((f) => [f.id, f] as [string, FilterDef<Row>])), [filters]);

  const filteredRows = React.useMemo(() => {
    const active = activeFilterEntries(filterState);
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      for (const [id, value] of active) {
        const def = filterDefs.get(id);
        if (def && !def.apply(row, value)) return false;
      }
      if (q && search && !search.match(row, q)) return false;
      return true;
    });
  }, [filterDefs, filterState, query, rows, search]);

  const sortedRows = React.useMemo(() => {
    if (!sort) return filteredRows;
    const column = columns.find((c) => c.id === sort.columnId);
    if (!column?.sortValue) return filteredRows;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => dir * compare(column.sortValue!(a), column.sortValue!(b)));
  }, [columns, filteredRows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = React.useMemo(
    () => (grouped && groupBy ? sortedRows : sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize)),
    [groupBy, grouped, pageSize, safePage, sortedRows],
  );

  const groups = React.useMemo(() => {
    if (!grouped || !groupBy) return null;
    const map = new Map<string, Row[]>();
    for (const row of sortedRows) {
      const key = groupBy.keyOf(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    const keys = [...map.keys()];
    if (groupBy.order) keys.sort(groupBy.order);
    else {
      const labelOf = (k: string) => {
        const l = groupBy.render(k, map.get(k)!).label;
        return typeof l === "string" ? l : k;
      };
      keys.sort((a, b) => compare(labelOf(a), labelOf(b)));
    }
    return keys.map((key) => ({ key, rows: map.get(key)!, ...groupBy.render(key, map.get(key)!) }));
  }, [groupBy, grouped, sortedRows]);

  /* ── Selezione ───────────────────────────────────────────────────────── */
  const pageIds = React.useMemo(() => pageRows.map(getRowId), [getRowId, pageRows]);
  const allFilteredIds = React.useMemo(() => sortedRows.map(getRowId), [getRowId, sortedRows]);
  const selectedOnPage = pageIds.filter((id) => selection.has(id)).length;
  const headerChecked = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const headerIndeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;

  const toggleRow = (id: string) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
    setSelectAllBeyondPage(false);
  };
  const togglePage = () => {
    const next = new Set(selection);
    if (headerChecked) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelection(next);
    setSelectAllBeyondPage(false);
  };
  const selectAllFiltered = () => {
    setSelection(new Set(allFilteredIds));
    setSelectAllBeyondPage(true);
  };
  const clearSelection = () => {
    setSelection(new Set());
    setSelectAllBeyondPage(false);
  };
  const selectedRows = React.useMemo(
    () => sortedRows.filter((row) => selection.has(getRowId(row))),
    [getRowId, selection, sortedRows],
  );

  // Una selezione sopravvive a ordinamento e pagina; muore con il cambio di filtri (fatto sopra).
  // Le righe sparite dall'elenco (ricaricamento) escono dalla selezione.
  React.useEffect(() => {
    if (!selection.size) return;
    const known = new Set(rows.map(getRowId));
    const pruned = new Set([...selection].filter((id) => known.has(id)));
    if (pruned.size !== selection.size) setSelection(pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const visibleColumnDefs = React.useMemo<ColumnDef<Row>[]>(
    () => columns.filter((c) => c.locked || visibleColumns.includes(c.id)),
    [columns, visibleColumns],
  );

  return {
    hydrated,
    density,
    setDensity,
    visibleColumns,
    setVisibleColumns,
    visibleColumnDefs,
    sort,
    toggleSort,
    pageSize,
    setPageSize,
    page: safePage,
    setPage,
    pageCount,
    grouped,
    setGrouped,
    groups,
    collapsedGroups,
    toggleGroupCollapsed,
    allViews,
    activeView,
    activeViewId,
    setActiveView,
    viewDirty,
    savePersonalView,
    updatePersonalView,
    deletePersonalView,
    personalViews,
    filterState,
    setFilter,
    clearFilters,
    activeFilters: activeFilterEntries(filterState),
    query,
    setQuery,
    filteredRows: sortedRows,
    pageRows,
    selection,
    selectedRows,
    selectAllBeyondPage,
    headerChecked,
    headerIndeterminate,
    toggleRow,
    togglePage,
    selectAllFiltered,
    clearSelection,
    pageIds,
  };
}

export type GridStateApi<Row> = ReturnType<typeof useGridState<Row>>;
