import type * as React from "react";

/**
 * Il contratto del DataGrid (guideline 07). Un modulo **configura** questa
 * griglia; non ne disegna una propria. Filtri, ordinamento, raggruppamento,
 * selezione e paginazione sono calcolati sul lato client sulle righe che la
 * pagina ha gia in mano — e cosi che i moduli V1 leggono i loro elenchi.
 */
export type Density = "compact" | "medium" | "comfortable";

export type SortDirection = "asc" | "desc";

export type ColumnAlign = "left" | "right" | "center";

export type ColumnKind = "identity" | "classification" | "status" | "date" | "amount" | "text" | "number" | "chips";

export interface ColumnDef<Row> {
  id: string;
  header: React.ReactNode;
  /** L'etichetta piena per il pannello Colonne e i tooltip (se `header` e un nodo). */
  label?: string;
  cell: (row: Row) => React.ReactNode;
  /** Il valore su cui ordinare; assente = non ordinabile. */
  sortValue?: (row: Row) => string | number | null | undefined;
  /** Il testo da esportare; default: `sortValue` o il testo della cella. */
  exportValue?: (row: Row) => string | number | null | undefined;
  kind?: ColumnKind;
  align?: ColumnAlign;
  /** Larghezza in `fr` (default 1) o in px (`"78px"`). */
  width?: number | string;
  minWidth?: number;
  /** Non si puo nascondere (l'identita). */
  locked?: boolean;
  /** Nascosta di default. */
  hidden?: boolean;
  /** Colonna personalizzata del club: finisce nel gruppo `PERSONALIZZATE`. */
  custom?: boolean;
  /** Il testo per il `title` della cella (ellissi con valore intero). */
  title?: (row: Row) => string | undefined;
}

export type FilterValue = string | string[] | boolean | { from?: string; to?: string } | null;

export interface FilterOption {
  value: string;
  label: React.ReactNode;
  count?: number;
  tone?: "neutral" | "red" | "amber" | "green" | "blue";
}

export interface FilterDef<Row> {
  id: string;
  label: string;
  type: "select" | "multi" | "boolean" | "date-range";
  options?: readonly FilterOption[];
  /** Il predicato: torna `true` se la riga passa con quel valore. */
  apply: (row: Row, value: FilterValue) => boolean;
  /** Etichetta del valore nel chip (default: l'etichetta dell'opzione). */
  formatValue?: (value: FilterValue) => string;
  /** Un filtro «di uso quotidiano» compare gia nella barra, senza aprire il popover. */
  pinned?: boolean;
}

export type FilterState = Record<string, FilterValue>;

export interface ViewDef {
  id: string;
  label: string;
  filters: FilterState;
  sort?: { columnId: string; direction: SortDirection } | null;
  groupBy?: string | null;
  columns?: string[] | null;
  density?: Density | null;
  /** Una vista che significa un problema porta la sua tinta. */
  tone?: "neutral" | "red" | "amber";
  /** Vista di sistema: non si rinomina, non si elimina. */
  builtIn?: boolean;
  /** Vista condivisa dal club (sola lettura per chi non puo condividere). */
  shared?: boolean;
  isDefault?: boolean;
}

export interface BulkActionDef<Row> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
  /** `scope.all` e vero quando l'utente ha scelto «seleziona tutti i N» (oltre la pagina). */
  onRun: (rows: Row[], scope: { all: boolean }) => void | Promise<void>;
  /** Assente se il ruolo non puo (mai disabilitata). */
  hidden?: boolean;
  disabled?: (rows: Row[]) => boolean;
}

export interface RowActionDef<Row> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (row: Row) => void;
  tone?: "default" | "danger";
  /** Se torna `true` l'azione non compare per quella riga. */
  hidden?: (row: Row) => boolean;
  /** La verbo piu usato: diventa il pulsante a icona accanto al `···`. */
  primary?: boolean;
}

export interface GroupDef<Row> {
  id: string;
  label: string;
  /** La chiave di gruppo della riga (es. l'identificativo della categoria). */
  keyOf: (row: Row) => string;
  /** L'etichetta e il colore di un gruppo, dalla chiave. */
  render: (key: string, rows: Row[]) => { label: React.ReactNode; dot?: string | null; action?: React.ReactNode };
  /** Ordine dei gruppi (default: alfabetico sull'etichetta). */
  order?: (a: string, b: string) => number;
}

export type GridState = "ready" | "loading" | "error" | "restricted";

export interface ExportRequest<Row> {
  kind: "csv" | "pdf" | "xlsx";
  /** `filtered` = cio che l'utente vede; `selected` = la selezione. */
  scope: "filtered" | "selected";
  rows: Row[];
  columns: ColumnDef<Row>[];
}

export interface DataGridProps<Row> {
  /** `egw.<module>.*` per le preferenze e le viste personali. */
  module: string;
  rows: Row[];
  getRowId: (row: Row) => string;
  columns: ColumnDef<Row>[];
  filters?: FilterDef<Row>[];
  /** Le viste di sistema (oltre a «Tutti», sempre presente). */
  views?: ViewDef[];
  /** Il termine della ricerca in griglia: torna `true` se la riga corrisponde. */
  search?: { placeholder?: string; match: (row: Row, query: string) => boolean };
  /** Ordinamento di partenza. */
  defaultSort?: { columnId: string; direction: SortDirection };
  groupBy?: GroupDef<Row> | null;
  /** Raggruppamento acceso di default (Atleti lo e). */
  defaultGrouped?: boolean;
  bulkActions?: BulkActionDef<Row>[];
  rowActions?: RowActionDef<Row>[];
  /** Apre la scheda (nome della riga, `Enter`). */
  onOpenRow?: (row: Row) => void;
  /** Apre l'ispettore (`⌘Enter`, riga attiva). */
  onInspectRow?: (row: Row) => void;
  activeRowId?: string | null;
  state?: GridState;
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Lo stato vuoto «non esiste ancora niente»: titolo, riga, azione primaria. */
  empty?: { title: React.ReactNode; description?: React.ReactNode; primary?: React.ReactNode; secondary?: React.ReactNode; icon?: React.ReactNode };
  export?: {
    onExport: (request: ExportRequest<Row>) => void | Promise<void>;
    kinds?: Array<"csv" | "pdf" | "xlsx">;
    /** `Importa…` in fondo al menu. */
    onImport?: () => void;
  };
  /** Il nome della cosa, per «Righe 1–25 di 184» e «seleziona tutti i 184». */
  noun?: { singular: string; plural: string };
  /** Selezione controllata dall'esterno. */
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Un elemento sopra le bande (avviso di pagina dentro il pannello). */
  banner?: React.ReactNode;
  /** Righe totali sul server quando la pagina non le ha tutte. */
  serverTotal?: number;
  className?: string;
  /** Un'etichetta per lo screen reader. */
  "aria-label": string;
  /** Riga in sola lettura per il ruolo: niente checkbox, niente azioni. */
  canSelect?: boolean;
  /** Persistenza spenta (per i test e per griglie usa-e-getta). */
  persist?: boolean;
  /** Il numero di righe per pagina di partenza. */
  defaultPageSize?: 25 | 50 | 100;
  /** Nascondi la barra delle viste (griglie secondarie dentro una scheda). */
  hideViews?: boolean;
  /** Nascondi il piede (elenchi corti). */
  hideFooter?: boolean;
  /** Un blocco sotto le righe di un gruppo (es. totali). */
  footerRow?: React.ReactNode;
  /** Il nome della riga per i comandi (`Altre azioni per Marco Ferretti`). */
  rowLabel?: (row: Row) => string;
  /** Il numero da mostrare sul chip «Tutti» quando le righe non sono persone (una riga per appartenenza). */
  totalCount?: number;
  /** Notifiche di cio che l'utente vede: per chi deve rifare una lettura server o rispecchiare l'URL. */
  onQueryChange?: (query: string) => void;
  onFiltersChange?: (filters: FilterState) => void;
  onViewChange?: (viewId: string) => void;
  /** Attiva una vista dall'esterno (clic su un contatore dell'intestazione): cambia il valore per riattivarla. */
  requestedViewId?: string | null;
}
