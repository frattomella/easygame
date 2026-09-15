"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Checkbox, SegmentedControl, Skeleton, Toggle } from "@/components/web/primitives/Controls";
import { DataChip, IconChip } from "@/components/web/primitives/StatusPill";
import { Eyebrow } from "@/components/web/primitives/Surface";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipProvider,
} from "@/components/web/primitives/Overlays";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { formatInteger } from "@/lib/web/format";
import type { ColumnDef, DataGridProps, Density, FilterDef, FilterValue, ViewDef } from "@/components/web/datagrid/types";
import { ALL_VIEW_ID, PAGE_SIZES, useGridState, type GridStateApi } from "@/components/web/datagrid/useGridState";

/**
 * Il DataGrid del Web V2 (guideline 07). **L'unica** griglia del prodotto:
 * un pannello di piano 1 con sette bande — viste, barra strumenti, barra di
 * massa, intestazione, righe, piede, e i gruppi quando l'elenco e
 * raggruppato. Otto stati, tastiera, esportazione di cio che si vede.
 */
const DENSITY_ROW: Record<Density, number> = { compact: 40, medium: 44, comfortable: 48 };

const gridTemplate = <Row,>(columns: ColumnDef<Row>[], canSelect: boolean, hasActions: boolean) => {
  const parts: string[] = [];
  if (canSelect) parts.push("38px");
  for (const c of columns) {
    const min = c.minWidth ?? (c.kind === "identity" ? 220 : 90);
    if (typeof c.width === "string") parts.push(c.width);
    else parts.push(`minmax(${min}px, ${c.width ?? (c.kind === "identity" ? 2 : 1)}fr)`);
  }
  if (hasActions) parts.push("78px");
  return parts.join(" ");
};

export function DataGrid<Row>(props: DataGridProps<Row>) {
  const {
    rows,
    getRowId,
    columns,
    filters = [],
    search,
    groupBy,
    bulkActions = [],
    rowActions = [],
    onOpenRow,
    onInspectRow,
    activeRowId,
    state = "ready",
    errorMessage,
    onRetry,
    empty,
    export: exportConfig,
    noun = { singular: "riga", plural: "righe" },
    banner,
    className,
    canSelect = true,
    hideViews = false,
    hideFooter = false,
    serverTotal,
  } = props;
  const api = useGridState(props);
  const hasActions = rowActions.length > 0;
  const selectable = canSelect && bulkActions.length > 0;
  const visibleBulk = bulkActions.filter((a) => !a.hidden);
  const template = gridTemplate(api.visibleColumnDefs, selectable, hasActions);
  const rowHeight = DENSITY_ROW[api.density];
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [focusedRowId, setFocusedRowId] = React.useState<string | null>(null);

  /* ── Tastiera (§7.9) ─────────────────────────────────────────────────── */
  const onBodyKeyDown = (event: React.KeyboardEvent) => {
    const ids = api.pageIds;
    if (!ids.length) return;
    const index = focusedRowId ? ids.indexOf(focusedRowId) : -1;
    const rowOf = (id: string) => api.pageRows.find((r) => getRowId(r) === id);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = ids[Math.min(ids.length - 1, index + 1)];
      setFocusedRowId(next);
      if (event.shiftKey && selectable) api.toggleRow(next);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = ids[Math.max(0, index - 1)];
      setFocusedRowId(next);
      if (event.shiftKey && selectable) api.toggleRow(next);
    } else if (event.key === " " && focusedRowId && selectable) {
      event.preventDefault();
      api.toggleRow(focusedRowId);
    } else if (event.key === "Enter" && focusedRowId) {
      event.preventDefault();
      const row = rowOf(focusedRowId);
      if (!row) return;
      if ((event.metaKey || event.ctrlKey) && onInspectRow) onInspectRow(row);
      else if (onOpenRow) onOpenRow(row);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && selectable) {
      event.preventDefault();
      if (!api.headerChecked) api.togglePage();
    } else if (event.key === "/") {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (event.key === "Escape") {
      if (api.selection.size) api.clearSelection();
      else if (api.query) api.setQuery("");
      else (event.currentTarget as HTMLElement).blur();
    }
  };

  const total = api.filteredRows.length;
  const unfilteredTotal = rows.length;
  const start = api.grouped && groupBy ? 1 : api.page * api.pageSize + 1;
  const end = api.grouped && groupBy ? total : Math.min(total, (api.page + 1) * api.pageSize);

  return (
    <TooltipProvider>
      <section
        className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-egw-panel-sm border border-egw-panel-border bg-white font-brand shadow-egw-plane-1",
          className,
        )}
        data-test="datagrid"
        aria-label={props["aria-label"]}
      >
        {banner}
        {!hideViews ? <ViewsBar api={api} search={search} searchRef={searchRef} noun={noun} unfilteredTotal={unfilteredTotal} /> : null}
        <Toolbar api={api} filters={filters} columns={columns} exportConfig={exportConfig} noun={noun} groupBy={groupBy} state={state} />
        {selectable && api.selection.size > 0 ? (
          <BulkBar api={api} actions={visibleBulk} noun={noun} total={total} />
        ) : null}

        {state === "restricted" ? (
          <EmptyStateCard
            flat
            icon={<Lock />}
            iconTone="neutral"
            title="Non hai accesso a questo elenco"
            description="Chiedi a un amministratore del club di abilitare il permesso."
          />
        ) : state === "error" ? (
          <div className="p-4">
            <div role="alert" className="flex flex-wrap items-start gap-3 rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-4 py-3.5">
              <AlertCircle className="mt-px h-[17px] w-[17px] shrink-0 text-egw-red" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-egw-ink">Non è stato possibile caricare l&apos;elenco.</p>
                {errorMessage ? <p className="mt-0.5 text-[12.5px] text-egw-ink-72">{errorMessage}</p> : null}
              </div>
              {onRetry ? (
                <Button variant="primary" size="sm" onClick={onRetry}>
                  Riprova
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="egw-scroll min-h-0 flex-1 overflow-auto" role="presentation">
              <div className="min-w-fit">
                <HeaderRow api={api} template={template} selectable={selectable} hasActions={hasActions} />
                <div
                  ref={bodyRef}
                  role="grid"
                  aria-rowcount={total}
                  aria-busy={state === "loading" || undefined}
                  tabIndex={0}
                  onKeyDown={onBodyKeyDown}
                  onFocus={() => {
                    if (!focusedRowId && api.pageIds[0]) setFocusedRowId(api.pageIds[0]);
                  }}
                  className="outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(37,99,235,.35)]"
                >
                  {state === "loading" && rows.length === 0 ? (
                    <SkeletonRows template={template} rowHeight={rowHeight} columns={api.visibleColumnDefs} selectable={selectable} hasActions={hasActions} />
                  ) : total === 0 ? (
                    api.activeFilters.length || api.query ? (
                      <EmptyStateCard
                        flat
                        icon={<Search />}
                        iconTone="neutral"
                        title="Nessun risultato con questi filtri"
                        description="Prova a togliere un filtro o allarga il periodo."
                        primary={
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              api.clearFilters();
                              api.setQuery("");
                            }}
                          >
                            Azzera i filtri
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyStateCard
                        flat
                        icon={empty?.icon ?? <Users />}
                        title={empty?.title ?? `Nessun elemento in archivio`}
                        description={empty?.description}
                        primary={empty?.primary}
                        secondary={empty?.secondary}
                      />
                    )
                  ) : api.groups ? (
                    api.groups.map((group) => {
                      const collapsed = api.collapsedGroups.includes(group.key);
                      return (
                        <div key={group.key} role="rowgroup">
                          <div
                            role="row"
                            className="sticky top-10 z-[1] flex h-9 items-center gap-2.5 border-b border-egw-rule bg-egw-page-100 px-4"
                          >
                            <button
                              type="button"
                              onClick={() => api.toggleGroupCollapsed(group.key)}
                              aria-expanded={!collapsed}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-egw-micro text-egw-ink-62 hover:bg-white focus-visible:outline-none focus-visible:shadow-egw-focus"
                              aria-label={collapsed ? "Espandi il gruppo" : "Comprimi il gruppo"}
                            >
                              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-panel", collapsed && "-rotate-90")} />
                            </button>
                            {group.dot ? <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: group.dot }} /> : null}
                            <span className="text-[12.5px] font-bold text-egw-ink">{group.label}</span>
                            <span className="egw-num text-[11px] font-bold text-[rgba(11,26,58,.5)]">{group.rows.length}</span>
                            {group.action ? <span className="ml-auto">{group.action}</span> : null}
                          </div>
                          {!collapsed
                            ? group.rows.map((row) => (
                                <GridRow
                                  key={getRowId(row)}
                                  row={row}
                                  api={api}
                                  getRowId={getRowId}
                                  template={template}
                                  rowHeight={rowHeight}
                                  selectable={selectable}
                                  rowActions={rowActions}
                                  onOpenRow={onOpenRow}
                                  active={activeRowId === getRowId(row)}
                                  focused={focusedRowId === getRowId(row)}
                                  onFocusRow={setFocusedRowId}
                                />
                              ))
                            : null}
                        </div>
                      );
                    })
                  ) : (
                    api.pageRows.map((row) => (
                      <GridRow
                        key={getRowId(row)}
                        row={row}
                        api={api}
                        getRowId={getRowId}
                        template={template}
                        rowHeight={rowHeight}
                        selectable={selectable}
                        rowActions={rowActions}
                        onOpenRow={onOpenRow}
                        active={activeRowId === getRowId(row)}
                        focused={focusedRowId === getRowId(row)}
                        onFocusRow={setFocusedRowId}
                      />
                    ))
                  )}
                  {props.footerRow}
                </div>
              </div>
            </div>
            {state === "loading" && rows.length > 0 ? <div className="egw-indeterminate relative h-0.5 w-full overflow-hidden bg-transparent" /> : null}
            {!hideFooter ? (
              <Footer api={api} total={total} serverTotal={serverTotal} start={start} end={end} noun={noun} />
            ) : null}
          </>
        )}
      </section>
    </TooltipProvider>
  );
}

/* ── Views bar ───────────────────────────────────────────────────────────── */
function ViewsBar<Row>({
  api,
  search,
  searchRef,
  noun,
  unfilteredTotal,
}: {
  api: GridStateApi<Row>;
  search?: DataGridProps<Row>["search"];
  searchRef: React.RefObject<HTMLInputElement>;
  noun: { singular: string; plural: string };
  unfilteredTotal: number;
}) {
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [makeDefault, setMakeDefault] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");

  const chipClass = (view: ViewDef, active: boolean) =>
    cn(
      "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-egw-chip border px-[11px] text-[12px] font-medium transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
      view.tone === "red"
        ? active
          ? "border-transparent bg-egw-red text-white"
          : "border-egw-tint-red-bd bg-egw-tint-red text-egw-red hover:bg-[rgba(185,28,28,.14)]"
        : view.tone === "amber"
          ? active
            ? "border-transparent bg-egw-amber text-white"
            : "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink hover:bg-[rgba(180,83,9,.14)]"
          : active
            ? "border-transparent bg-egw-navy-800 text-white"
            : "border-[rgba(11,26,58,.1)] bg-egw-page-100 text-egw-ink hover:bg-white",
    );

  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-egw-hairline px-4 py-[11px]">
      <Eyebrow className="mr-1">Viste</Eyebrow>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {api.allViews.map((view) => {
          const active = api.activeViewId === view.id;
          const dirty = active && api.viewDirty;
          const chip = (
            <button
              key={view.id}
              type="button"
              onClick={() => api.setActiveView(view.id)}
              aria-pressed={active}
              className={chipClass(view, active)}
            >
              {view.shared ? <Users className="h-3 w-3 opacity-70" /> : null}
              <span>{view.label}</span>
              {view.id === ALL_VIEW_ID ? (
                <span className={cn("egw-num text-[11px] font-bold", active ? "text-white/70" : "text-egw-ink-42")}>{formatInteger(unfilteredTotal)}</span>
              ) : null}
              {dirty ? <span aria-label="modificata" className="h-[5px] w-[5px] rounded-full bg-egw-blue" /> : null}
            </button>
          );
          if (view.builtIn) return chip;
          return (
            <Menu key={view.id}>
              <span className="inline-flex items-center">
                {chip}
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Opzioni della vista ${view.label}`}
                    className="-ml-1 inline-flex h-[30px] w-5 items-center justify-center rounded-egw-micro text-egw-ink-42 hover:text-egw-ink focus-visible:outline-none focus-visible:shadow-egw-focus"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </MenuTrigger>
              </span>
              <MenuContent align="start" width={220}>
                <MenuItem onSelect={() => { setRenameId(view.id); setRenameValue(view.label); }}>Rinomina</MenuItem>
                <MenuItem onSelect={() => api.savePersonalView({ label: `${view.label} (copia)` })}>Duplica</MenuItem>
                <MenuItem onSelect={() => api.updatePersonalView(view.id, { isDefault: !view.isDefault })}>
                  {view.isDefault ? "Togli come predefinita" : "Imposta come predefinita"}
                </MenuItem>
                <MenuSeparator />
                <MenuItem tone="danger" onSelect={() => setDeleteId(view.id)}>Elimina</MenuItem>
              </MenuContent>
            </Menu>
          );
        })}
        {api.viewDirty || (api.activeViewId !== ALL_VIEW_ID && api.viewDirty) ? (
          <Popover open={saveOpen} onOpenChange={setSaveOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-[30px] items-center gap-1 whitespace-nowrap rounded-egw-chip border border-dashed border-[rgba(11,26,58,.22)] px-[11px] text-[11.5px] font-semibold text-[rgba(11,26,58,.55)] hover:border-egw-blue hover:text-egw-blue-700 focus-visible:outline-none focus-visible:shadow-egw-focus"
              >
                <Plus className="h-3 w-3" />
                {api.activeView && !api.activeView.builtIn ? "Aggiorna vista" : "Salva vista"}
              </button>
            </PopoverTrigger>
            <PopoverContent width={320} className="p-4">
              <Eyebrow className="mb-3">Salva vista</Eyebrow>
              {api.activeView && !api.activeView.builtIn ? (
                <div className="mb-3 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      api.savePersonalView({ id: api.activeView!.id, label: api.activeView!.label, isDefault: api.activeView!.isDefault });
                      setSaveOpen(false);
                    }}
                  >
                    Aggiorna «{api.activeView.label}»
                  </Button>
                  <span className="text-center text-[11px] text-egw-ink-62">oppure salva come nuova</span>
                </div>
              ) : null}
              <label className="mb-1.5 block text-[12px] font-semibold text-egw-ink-62" htmlFor="egw-view-name">
                Nome
              </label>
              <input
                id="egw-view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Certificati da sistemare"
                className="mb-3 h-[42px] w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 text-[13px] outline-none focus:border-egw-blue focus:bg-white focus:shadow-egw-focus"
              />
              <label className="mb-4 flex items-center justify-between gap-3 text-[12.5px] font-medium text-egw-ink">
                Rendi predefinita
                <Toggle checked={makeDefault} onCheckedChange={setMakeDefault} aria-label="Rendi predefinita" />
              </label>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!name.trim()}
                  onClick={() => {
                    api.savePersonalView({ label: name.trim(), isDefault: makeDefault });
                    setName("");
                    setMakeDefault(false);
                    setSaveOpen(false);
                  }}
                >
                  Salva
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSaveOpen(false)}>
                  Annulla
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {search ? (
        <div className="ml-auto flex h-8 min-w-[180px] items-center gap-2 rounded-egw-control border border-[rgba(11,26,58,.12)] bg-egw-page-050 px-2.5 focus-within:border-egw-blue focus-within:shadow-egw-focus">
          <Search className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" />
          <input
            ref={searchRef}
            value={api.query}
            onChange={(e) => api.setQuery(e.target.value)}
            placeholder={search.placeholder || "Cerca"}
            aria-label={search.placeholder || "Cerca nell'elenco"}
            className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-egw-ink outline-none placeholder:font-normal placeholder:text-egw-ink-42"
          />
          {api.query ? (
            <>
              <span aria-hidden className="h-4 w-px bg-egw-hairline" />
              <span className="egw-num whitespace-nowrap text-[11px] text-[rgba(11,26,58,.5)]">
                {api.filteredRows.length} {api.filteredRows.length === 1 ? "risultato" : "risultati"}
              </span>
              <button type="button" aria-label="Svuota la ricerca" onClick={() => api.setQuery("")} className="text-egw-ink-42 hover:text-egw-ink">
                <X className="h-3 w-3" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={`Eliminare la vista «${api.personalViews.find((v) => v.id === deleteId)?.label ?? ""}»?`}
        description="I filtri salvati con questa vista vengono dimenticati. Le righe dell'elenco non cambiano."
        confirmLabel="Elimina"
        tone="danger"
        onConfirm={() => {
          if (deleteId) api.deletePersonalView(deleteId);
          setDeleteId(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(renameId)}
        onOpenChange={(o) => !o && setRenameId(null)}
        title="Rinomina la vista"
        confirmLabel="Salva"
        onConfirm={() => {
          if (renameId && renameValue.trim()) api.updatePersonalView(renameId, { label: renameValue.trim() });
          setRenameId(null);
        }}
      >
        <input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          aria-label="Nome della vista"
          className="h-[46px] w-full rounded-egw-field border border-egw-field-border bg-egw-page-100 px-3.5 font-brand text-[13.5px] outline-none focus:border-egw-blue focus:bg-white focus:shadow-egw-focus"
        />
      </ConfirmDialog>
      <span className="sr-only">{noun.plural}</span>
    </div>
  );
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
function Toolbar<Row>({
  api,
  filters,
  columns,
  exportConfig,
  noun,
  groupBy,
  state,
}: {
  api: GridStateApi<Row>;
  filters: FilterDef<Row>[];
  columns: ColumnDef<Row>[];
  exportConfig?: DataGridProps<Row>["export"];
  noun: { singular: string; plural: string };
  groupBy?: DataGridProps<Row>["groupBy"];
  state: string;
}) {
  const activeCount = api.activeFilters.length;
  const labelOf = (def: FilterDef<Row>, value: FilterValue) => {
    if (def.formatValue) return def.formatValue(value);
    if (Array.isArray(value)) {
      const labels = value.map((v) => {
        const o = def.options?.find((x) => x.value === v);
        return typeof o?.label === "string" ? o.label : v;
      });
      return labels.length >= 3 ? { text: `${labels.length} selezionate`, title: labels.join(", ") } : labels.join(", ");
    }
    if (typeof value === "boolean") return value ? "Sì" : "No";
    if (value && typeof value === "object") return [value.from, value.to].filter(Boolean).join(" → ");
    const o = def.options?.find((x) => x.value === value);
    return typeof o?.label === "string" ? o.label : String(value ?? "");
  };
  const hideable = columns.filter((c) => !c.locked);
  const customCols = hideable.filter((c) => c.custom);
  const standardCols = hideable.filter((c) => !c.custom);
  const disabled = state === "restricted";

  return (
    <div className="flex min-h-[50px] flex-wrap items-center gap-2 border-b border-egw-hairline bg-egw-page-025 px-4 py-2.5">
      {filters.length ? (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-egw-chip border border-egw-control-border bg-white px-2.5 text-[12px] font-semibold text-egw-ink hover:border-[rgba(37,99,235,.32)] focus-visible:outline-none focus-visible:shadow-egw-focus disabled:opacity-40"
              >
                <Filter className="h-3.5 w-3.5" />
                Filtri
                {activeCount ? (
                  <span className="egw-num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-egw-pill bg-egw-navy-800 px-1.5 text-[10px] font-bold text-white">
                    {activeCount}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent width={320} className="p-2">
              <FilterList api={api} filters={filters} />
            </PopoverContent>
          </Popover>
          {activeCount ? <span aria-hidden className="mx-0.5 h-[22px] w-px bg-egw-hairline" /> : null}
          {api.activeFilters.map(([id, value]) => {
            const def = filters.find((f) => f.id === id);
            if (!def) return null;
            const label = labelOf(def, value);
            const text = typeof label === "string" ? label : label.text;
            const title = typeof label === "string" ? undefined : label.title;
            return (
              <span
                key={id}
                title={title}
                className="inline-flex h-7 max-w-[320px] items-center gap-1.5 rounded-egw-chip border border-egw-tint-blue-bd bg-egw-tint-blue pl-2.5 pr-1.5 text-[11.5px] font-medium text-egw-blue-700"
              >
                <span className="egw-ellipsis">
                  <strong className="font-bold">{def.label}:</strong> {text}
                </span>
                <button
                  type="button"
                  aria-label={`Togli il filtro ${def.label}`}
                  onClick={() => api.setFilter(id, null)}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/60 focus-visible:outline-none focus-visible:shadow-egw-focus"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          {activeCount >= 2 ? (
            <button type="button" onClick={api.clearFilters} className="text-[11.5px] font-semibold text-[rgba(11,26,58,.5)] hover:text-egw-ink">
              Azzera tutto
            </button>
          ) : null}
        </>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {groupBy ? (
          <label className="mr-1 flex items-center gap-2 text-[11.5px] font-semibold text-egw-ink-62">
            <Toggle checked={api.grouped} onCheckedChange={api.setGrouped} aria-label={`Raggruppa per ${groupBy.label.toLowerCase()}`} />
            {groupBy.label}
          </label>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-egw-chip border border-egw-control-border bg-white px-2.5 text-[12px] font-semibold text-egw-ink hover:border-[rgba(37,99,235,.32)] focus-visible:outline-none focus-visible:shadow-egw-focus disabled:opacity-40"
            >
              <Eye className="h-3.5 w-3.5" />
              Colonne
              <span className="egw-num text-[11px] font-medium text-[rgba(11,26,58,.5)]">
                {api.visibleColumnDefs.length}/{columns.length}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent width={280} className="p-2">
            <Eyebrow className="px-2 pb-2 pt-1">Colonne</Eyebrow>
            <ul>
              {columns.filter((c) => c.locked).map((c) => (
                <li key={c.id} className="flex h-9 items-center gap-2.5 px-2 text-[12.5px] text-egw-ink-62">
                  <Lock className="h-3.5 w-3.5" />
                  {c.label ?? c.header}
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-egw-ink-42">Fissa</span>
                </li>
              ))}
              {standardCols.map((c) => (
                <ColumnToggle key={c.id} column={c} api={api} />
              ))}
              {customCols.length ? (
                <>
                  <Eyebrow className="px-2 pb-1.5 pt-3">Personalizzate</Eyebrow>
                  {customCols.map((c) => (
                    <ColumnToggle key={c.id} column={c} api={api} />
                  ))}
                </>
              ) : null}
            </ul>
          </PopoverContent>
        </Popover>
        <SegmentedControl
          aria-label="Densità delle righe"
          size="sm"
          value={api.density}
          onChange={api.setDensity}
          options={[
            { value: "compact", label: "Compatta" },
            { value: "medium", label: "Media" },
            { value: "comfortable", label: "Comoda" },
          ]}
        />
        {exportConfig ? (
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-egw-chip border border-egw-control-border bg-white px-2.5 text-[12px] font-semibold text-egw-ink hover:border-[rgba(37,99,235,.32)] focus-visible:outline-none focus-visible:shadow-egw-focus disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Esporta
              </button>
            </MenuTrigger>
            <MenuContent align="end" width={262}>
              {(exportConfig.kinds ?? ["csv"]).map((kind) => (
                <MenuItem
                  key={kind}
                  onSelect={() =>
                    void exportConfig.onExport({ kind, scope: "filtered", rows: api.filteredRows, columns: api.visibleColumnDefs })
                  }
                >
                  Esporta {kind.toUpperCase()}
                </MenuItem>
              ))}
              {api.selection.size ? (
                <MenuItem
                  onSelect={() =>
                    void exportConfig.onExport({ kind: (exportConfig.kinds ?? ["csv"])[0], scope: "selected", rows: api.selectedRows, columns: api.visibleColumnDefs })
                  }
                >
                  Esporta selezione ({api.selection.size})
                </MenuItem>
              ) : null}
              {exportConfig.onImport ? (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={exportConfig.onImport}>Importa…</MenuItem>
                </>
              ) : null}
              <MenuSeparator />
              <MenuLabel className="normal-case tracking-normal">
                Esporta le {formatInteger(api.filteredRows.length)} {api.filteredRows.length === 1 ? noun.singular : noun.plural} filtrate, {api.visibleColumnDefs.length} colonne
              </MenuLabel>
            </MenuContent>
          </Menu>
        ) : null}
      </div>
    </div>
  );
}

function ColumnToggle<Row>({ column, api }: { column: ColumnDef<Row>; api: GridStateApi<Row> }) {
  const checked = api.visibleColumns.includes(column.id);
  return (
    <li>
      <label className="flex h-9 cursor-pointer items-center gap-2.5 rounded-egw-chip px-2 text-[12.5px] font-medium text-egw-ink hover:bg-egw-page-100">
        <Checkbox
          size={16}
          checked={checked}
          onChange={() =>
            api.setVisibleColumns(checked ? api.visibleColumns.filter((id) => id !== column.id) : [...api.visibleColumns, column.id])
          }
        />
        {column.label ?? column.header}
      </label>
    </li>
  );
}

function FilterList<Row>({ api, filters }: { api: GridStateApi<Row>; filters: FilterDef<Row>[] }) {
  const [openId, setOpenId] = React.useState<string | null>(filters.find((f) => f.pinned)?.id ?? null);
  const [search, setSearch] = React.useState("");
  return (
    <div>
      <Eyebrow className="px-2 pb-2 pt-1">Filtri</Eyebrow>
      <ul className="flex flex-col gap-0.5">
        {filters.map((def) => {
          const value = api.filterState[def.id];
          const open = openId === def.id;
          const options = def.options ?? [];
          const shown = search && open ? options.filter((o) => String(typeof o.label === "string" ? o.label : o.value).toLowerCase().includes(search.toLowerCase())) : options;
          return (
            <li key={def.id} className="rounded-egw-chip">
              <button
                type="button"
                onClick={() => {
                  setOpenId(open ? null : def.id);
                  setSearch("");
                }}
                aria-expanded={open}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-egw-chip px-2 text-[12.5px] font-semibold text-egw-ink hover:bg-egw-page-100 focus-visible:outline-none focus-visible:shadow-egw-focus"
              >
                <span>{def.label}</span>
                <span className="flex items-center gap-1.5">
                  {value != null && value !== "" && !(Array.isArray(value) && !value.length) ? (
                    <span className="h-[5px] w-[5px] rounded-full bg-egw-blue" />
                  ) : null}
                  <ChevronDown className={cn("h-3.5 w-3.5 text-egw-ink-42 transition-transform duration-panel", open && "rotate-180")} />
                </span>
              </button>
              {open ? (
                <div className="px-2 pb-2">
                  {def.type === "boolean" ? (
                    <SegmentedControl
                      aria-label={def.label}
                      size="sm"
                      value={value === true ? "yes" : value === false ? "no" : "all"}
                      onChange={(v) => api.setFilter(def.id, v === "all" ? null : v === "yes")}
                      options={[
                        { value: "all", label: "Tutti" },
                        { value: "yes", label: "Sì" },
                        { value: "no", label: "No" },
                      ]}
                    />
                  ) : def.type === "date-range" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        aria-label="Dal"
                        value={(value && typeof value === "object" && !Array.isArray(value) && value.from) || ""}
                        onChange={(e) => api.setFilter(def.id, { ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}), from: e.target.value || undefined })}
                        className="egw-num h-8 min-w-0 flex-1 rounded-egw-chip border border-egw-field-border bg-egw-page-100 px-2 text-[12px] outline-none focus:border-egw-blue"
                      />
                      <span className="text-egw-ink-42">→</span>
                      <input
                        type="date"
                        aria-label="Al"
                        value={(value && typeof value === "object" && !Array.isArray(value) && value.to) || ""}
                        onChange={(e) => api.setFilter(def.id, { ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}), to: e.target.value || undefined })}
                        className="egw-num h-8 min-w-0 flex-1 rounded-egw-chip border border-egw-field-border bg-egw-page-100 px-2 text-[12px] outline-none focus:border-egw-blue"
                      />
                    </div>
                  ) : (
                    <>
                      {options.length > 8 ? (
                        <div className="mb-1.5 flex h-8 items-center gap-2 rounded-egw-chip bg-egw-page-100 px-2">
                          <Search className="h-3 w-3 text-egw-ink-42" />
                          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
                        </div>
                      ) : null}
                      <ul className="egw-scroll max-h-[220px] overflow-y-auto">
                        {shown.map((o) => {
                          const selected = def.type === "multi" ? Array.isArray(value) && value.includes(o.value) : value === o.value;
                          return (
                            <li key={o.value}>
                              <label className="flex h-8 cursor-pointer items-center gap-2.5 rounded-egw-chip px-2 text-[12.5px] font-medium text-egw-ink hover:bg-egw-page-100">
                                {def.type === "multi" ? (
                                  <Checkbox
                                    size={16}
                                    checked={selected}
                                    onChange={() => {
                                      const current = Array.isArray(value) ? value : [];
                                      api.setFilter(def.id, selected ? current.filter((v) => v !== o.value) : [...current, o.value]);
                                    }}
                                  />
                                ) : (
                                  <input
                                    type="radio"
                                    name={`egw-filter-${def.id}`}
                                    checked={selected}
                                    onChange={() => api.setFilter(def.id, selected ? null : o.value)}
                                    onClick={() => selected && api.setFilter(def.id, null)}
                                    className="h-4 w-4 accent-[#2563eb]"
                                  />
                                )}
                                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                                {o.count != null ? <span className="egw-num text-[11px] text-egw-ink-42">{o.count}</span> : null}
                              </label>
                            </li>
                          );
                        })}
                        {shown.length === 0 ? <li className="px-2 py-2 text-[12px] text-egw-ink-62">Nessuna opzione</li> : null}
                      </ul>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {api.activeFilters.length ? (
        <div className="mt-2 border-t border-egw-hairline px-2 pt-2">
          <button type="button" onClick={api.clearFilters} className="text-[12px] font-semibold text-egw-blue-700 hover:underline">
            Azzera tutto
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ── Bulk bar ────────────────────────────────────────────────────────────── */
function BulkBar<Row>({
  api,
  actions,
  noun,
  total,
}: {
  api: GridStateApi<Row>;
  actions: NonNullable<DataGridProps<Row>["bulkActions"]>;
  noun: { singular: string; plural: string };
  total: number;
}) {
  const count = api.selection.size;
  const shown = actions.slice(0, 4);
  const overflow = actions.slice(4);
  const warnWide = count > 500;
  return (
    <div className="flex min-h-[38px] flex-wrap items-center gap-2.5 border-b border-[rgba(37,99,235,.22)] bg-[linear-gradient(135deg,rgba(59,130,246,.12),rgba(53,51,205,.12))] px-4 py-1.5">
      <span className="inline-flex h-[19px] w-[19px] items-center justify-center rounded-egw-micro bg-egw-action text-white">
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="egw-num text-[12.5px] font-bold text-egw-navy-800">
        {count} {count === 1 ? "selezionato" : "selezionati"}
      </span>
      {!api.selectAllBeyondPage && count < total ? (
        <button type="button" onClick={api.selectAllFiltered} className="text-[12px] font-semibold text-egw-blue-700 underline">
          seleziona {total === 1 ? `l'unica ${noun.singular}` : `tutti i ${formatInteger(total)}`}
        </button>
      ) : null}
      {warnWide ? <span className="text-[11.5px] font-medium text-egw-amber-ink">Stai per agire su {formatInteger(count)} record.</span> : null}
      <span aria-hidden className="h-5 w-px bg-[rgba(37,99,235,.22)]" />
      {shown.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={action.disabled?.(api.selectedRows)}
          onClick={() => void action.onRun(api.selectedRows)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-egw-chip border bg-white px-2.5 text-[11.5px] font-semibold focus-visible:outline-none focus-visible:shadow-egw-focus disabled:opacity-40 [&>svg]:h-3.5 [&>svg]:w-3.5",
            action.tone === "danger" ? "border-egw-red text-egw-red hover:bg-egw-tint-red" : "border-[rgba(37,99,235,.3)] text-egw-blue-700 hover:bg-egw-page-050",
          )}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
      {overflow.length ? (
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="inline-flex h-7 items-center gap-1 rounded-egw-chip border border-[rgba(37,99,235,.3)] bg-white px-2.5 text-[11.5px] font-semibold text-egw-blue-700">
              Altre azioni <ChevronDown className="h-3 w-3" />
            </button>
          </MenuTrigger>
          <MenuContent align="start" width={220}>
            {overflow.map((action) => (
              <MenuItem key={action.id} tone={action.tone === "danger" ? "danger" : "default"} onSelect={() => void action.onRun(api.selectedRows)}>
                {action.icon}
                {action.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
      <button type="button" onClick={api.clearSelection} className="ml-auto text-[11.5px] font-semibold text-egw-ink-62 hover:text-egw-ink">
        Annulla selezione
      </button>
    </div>
  );
}

/* ── Header row ──────────────────────────────────────────────────────────── */
function HeaderRow<Row>({ api, template, selectable, hasActions }: { api: GridStateApi<Row>; template: string; selectable: boolean; hasActions: boolean }) {
  return (
    <div
      role="row"
      className="sticky top-0 z-[2] grid h-10 items-center gap-3 border-b border-[rgba(11,26,58,.1)] bg-egw-page-100 px-4"
      style={{ gridTemplateColumns: template }}
    >
      {selectable ? (
        <div className="flex items-center">
          <Checkbox
            size={16}
            aria-label="Seleziona la pagina"
            checked={api.headerChecked}
            indeterminate={api.headerIndeterminate}
            onChange={api.togglePage}
          />
        </div>
      ) : null}
      {api.visibleColumnDefs.map((column) => {
        const sortable = Boolean(column.sortValue);
        const sorted = api.sort?.columnId === column.id;
        const label = (
          <span className="egw-ellipsis block leading-[1.2] [white-space:normal] [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">{column.header}</span>
        );
        return (
          <div
            key={column.id}
            role="columnheader"
            aria-sort={sorted ? (api.sort!.direction === "asc" ? "ascending" : "descending") : undefined}
            className={cn(
              "min-w-0 text-[9.5px] font-bold uppercase tracking-[var(--egw-track-col-head)]",
              sorted ? "text-egw-navy-800" : "text-[rgba(11,26,58,.52)]",
              column.align === "right" && "text-right",
              column.align === "center" && "text-center",
            )}
          >
            {sortable ? (
              <button
                type="button"
                onClick={() => api.toggleSort(column.id)}
                className={cn("inline-flex max-w-full items-center gap-1 rounded-egw-micro hover:text-egw-ink focus-visible:outline-none focus-visible:shadow-egw-focus", column.align === "right" && "flex-row-reverse")}
              >
                {label}
                {sorted ? <ArrowUp className={cn("h-[11px] w-[11px] shrink-0 transition-transform", api.sort!.direction === "desc" && "rotate-180")} /> : null}
              </button>
            ) : (
              label
            )}
          </div>
        );
      })}
      {hasActions ? (
        <div role="columnheader" className="text-right text-[9.5px] font-bold uppercase tracking-[var(--egw-track-col-head)] text-[rgba(11,26,58,.52)]">
          Azioni
        </div>
      ) : null}
    </div>
  );
}

/* ── Row ─────────────────────────────────────────────────────────────────── */
function GridRow<Row>({
  row,
  api,
  getRowId,
  template,
  rowHeight,
  selectable,
  rowActions,
  onOpenRow,
  active,
  focused,
  onFocusRow,
}: {
  row: Row;
  api: GridStateApi<Row>;
  getRowId: (row: Row) => string;
  template: string;
  rowHeight: number;
  selectable: boolean;
  rowActions: NonNullable<DataGridProps<Row>["rowActions"]>;
  onOpenRow?: (row: Row) => void;
  active: boolean;
  focused: boolean;
  onFocusRow: (id: string) => void;
}) {
  const id = getRowId(row);
  const selected = api.selection.has(id);
  const visible = rowActions.filter((a) => !a.hidden?.(row));
  const primary = visible.find((a) => a.primary);
  const overflow = visible.filter((a) => a !== primary);
  return (
    <div
      role="row"
      aria-selected={selectable ? selected : undefined}
      data-row-id={id}
      onClick={() => onFocusRow(id)}
      onDoubleClick={() => onOpenRow?.(row)}
      className={cn(
        "group/row grid items-center gap-3 border-b border-egw-rule px-4 transition-colors duration-hover hover:bg-egw-row-hover",
        selected && "bg-egw-row-selected shadow-[inset_3px_0_0_var(--egw-blue)]",
        active && !selected && "bg-egw-page-050 shadow-[inset_0_0_0_1px_rgba(37,99,235,.14)]",
        focused && "shadow-[inset_0_0_0_2px_rgba(37,99,235,.35)]",
      )}
      style={{ gridTemplateColumns: template, height: rowHeight }}
    >
      {selectable ? (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox size={16} aria-label="Seleziona la riga" checked={selected} onChange={() => api.toggleRow(id)} />
        </div>
      ) : null}
      {api.visibleColumnDefs.map((column) => {
        const content = column.cell(row);
        const title = column.title?.(row) ?? (typeof content === "string" ? content : undefined);
        return (
          <div
            key={column.id}
            role="gridcell"
            title={title}
            className={cn(
              "min-w-0 text-[13px] text-egw-ink",
              column.kind === "identity" ? "" : "egw-ellipsis",
              column.kind === "classification" && "text-[12px] font-medium text-egw-ink-72",
              column.kind === "date" && "egw-num text-[12.5px]",
              column.kind === "amount" && "egw-num text-right text-[12px] font-bold",
              column.kind === "number" && "egw-num",
              column.align === "right" && "text-right",
              column.align === "center" && "text-center",
              column.kind === "status" && "flex items-center",
              column.kind === "chips" && "flex items-center gap-1.5 overflow-hidden",
            )}
          >
            {content === null || content === undefined || content === "" ? <span className="text-egw-ink-42">—</span> : content}
          </div>
        );
      })}
      {rowActions.length ? (
        <div role="gridcell" className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {primary ? (
            <Tooltip content={primary.label}>
              <IconButton aria-label={primary.label} size="xs" variant="row" onClick={() => primary.onClick(row)}>
                {primary.icon ?? <ChevronRight />}
              </IconButton>
            </Tooltip>
          ) : null}
          {overflow.length ? (
            <Menu>
              <MenuTrigger asChild>
                <IconButton aria-label="Altre azioni" size="xs" variant="row">
                  <MoreHorizontal />
                </IconButton>
              </MenuTrigger>
              <MenuContent align="end" width={220}>
                <MenuLabel>Azioni riga</MenuLabel>
                {overflow.map((action) => (
                  <MenuItem key={action.id} tone={action.tone === "danger" ? "danger" : "default"} onSelect={() => action.onClick(row)}>
                    {action.icon}
                    {action.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */
function SkeletonRows<Row>({ template, rowHeight, columns, selectable, hasActions }: { template: string; rowHeight: number; columns: ColumnDef<Row>[]; selectable: boolean; hasActions: boolean }) {
  return (
    <div aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="grid items-center gap-3 border-b border-egw-rule px-4" style={{ gridTemplateColumns: template, height: rowHeight }}>
          {selectable ? <Skeleton className="h-4 w-4" /> : null}
          {columns.map((c) => (
            <div key={c.id} className={cn("flex items-center gap-2.5", c.align === "right" && "justify-end")}>
              {c.kind === "identity" ? <Skeleton className="h-[34px] w-[34px] rounded-egw-chip" /> : null}
              <Skeleton className="h-[11px]" style={{ width: `${40 + ((i * 17 + c.id.length * 7) % 45)}%` }} />
            </div>
          ))}
          {hasActions ? <Skeleton className="ml-auto h-6 w-14" /> : null}
        </div>
      ))}
    </div>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
function Footer<Row>({ api, total, serverTotal, start, end, noun }: { api: GridStateApi<Row>; total: number; serverTotal?: number; start: number; end: number; noun: { singular: string; plural: string } }) {
  const pages = api.pageCount;
  const current = api.page;
  const numbers: Array<number | "…"> = [];
  if (pages <= 10) for (let i = 0; i < pages; i++) numbers.push(i);
  else {
    numbers.push(0, 1, 2);
    if (current > 3) numbers.push("…");
    for (let i = Math.max(3, current - 1); i <= Math.min(pages - 2, current + 1); i++) if (!numbers.includes(i)) numbers.push(i);
    if (current < pages - 4) numbers.push("…");
    numbers.push(pages - 1);
  }
  const grouped = Boolean(api.groups);
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-3 border-t border-egw-hairline bg-egw-page-100 px-4 py-1.5 text-[12px] text-egw-ink-62">
      <span>
        {total === 0 ? (
          <>Nessuna {noun.singular}</>
        ) : (
          <>
            {noun.plural.charAt(0).toUpperCase() + noun.plural.slice(1)} <strong className="egw-num text-egw-ink">{start}–{end}</strong> di{" "}
            <strong className="egw-num text-egw-ink">{formatInteger(total)}</strong>
            {serverTotal && serverTotal > total ? <> di ~{formatInteger(serverTotal)}</> : null}
          </>
        )}
      </span>
      {!grouped ? (
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Righe per pagina</span>
            <select
              value={api.pageSize}
              onChange={(e) => api.setPageSize(Number(e.target.value))}
              aria-label="Righe per pagina"
              className="egw-num h-8 rounded-egw-chip border border-egw-field-border bg-white px-2 text-[12px] font-semibold text-egw-ink outline-none focus:border-egw-blue focus:shadow-egw-focus"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} per pagina
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Paginazione" className="flex items-center gap-1">
            <IconButton aria-label="Pagina precedente" size="sm" variant="secondary" disabled={current === 0} onClick={() => api.setPage(current - 1)}>
              <ChevronLeft />
            </IconButton>
            {numbers.map((n, i) =>
              n === "…" ? (
                <span key={`e${i}`} className="px-1 text-egw-ink-42">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  aria-current={n === current ? "page" : undefined}
                  onClick={() => api.setPage(n)}
                  className={cn(
                    "egw-num inline-flex h-8 min-w-8 items-center justify-center rounded-egw-control border px-1.5 text-[12px] font-semibold focus-visible:outline-none focus-visible:shadow-egw-focus",
                    n === current ? "border-transparent bg-egw-navy-900 text-white" : "border-egw-field-border bg-white text-egw-ink hover:border-[rgba(37,99,235,.32)]",
                  )}
                >
                  {n + 1}
                </button>
              ),
            )}
            <IconButton aria-label="Pagina successiva" size="sm" variant="secondary" disabled={current >= pages - 1} onClick={() => api.setPage(current + 1)}>
              <ChevronRight />
            </IconButton>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

/** Un chip in una cella: fino a due, poi `+N` con l'elenco nel tooltip. */
export function CellChips({ items, max = 2 }: { items: Array<{ label: string; dot?: string | null; tone?: React.ComponentProps<typeof DataChip>["tone"] }>; max?: number }) {
  if (!items.length) return <span className="text-egw-ink-42">—</span>;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  return (
    <>
      {shown.map((item, i) => (
        <DataChip key={i} size="sm" dot={item.dot} tone={item.tone}>
          {item.label}
        </DataChip>
      ))}
      {rest.length ? (
        <Tooltip content={rest.map((r) => r.label).join(", ")}>
          <span>
            <DataChip size="sm">+{rest.length}</DataChip>
          </span>
        </Tooltip>
      ) : null}
    </>
  );
}

export { IconChip, SlidersHorizontal };
