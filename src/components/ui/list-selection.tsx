"use client";

import * as React from "react";
import { ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  describeSelection,
  pruneSelection,
  selectionHeaderState,
  toggleManySelection,
  toggleSelection,
  type SelectionScope,
} from "@/lib/list-selection";

/**
 * Selezione multipla di righe: il pezzo di interfaccia, una volta sola.
 *
 * Le **regole** stanno in `src/lib/list-selection.ts` (modulo puro,
 * collaudabile senza React). Qui c'e solo il minimo che React deve fare: uno
 * stato, tre caselle e una barra.
 *
 * Non e un componente tabella: le quattro schermate che lo usano hanno tabelle
 * diverse — gli Atleti raggruppano per categoria, lo Staff ha anche le schede,
 * i Soci due modalita di vista — e imporre una tabella comune sarebbe stato
 * riscriverle tutte per un guadagno che nessuno vede. Si condivide cio che e
 * davvero uguale.
 */

export type ListSelection = {
  selectedIds: Set<string>;
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string, checked: boolean) => void;
  toggleMany: (ids: readonly string[], checked: boolean) => void;
  clear: () => void;
  /** Toglie dalla selezione gli id che non esistono piu. */
  prune: (availableIds: readonly string[]) => void;
  headerState: (ids: readonly string[]) => boolean | "indeterminate";
};

export function useListSelection(): ListSelection {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  return React.useMemo(
    () => ({
      selectedIds,
      count: selectedIds.size,
      isSelected: (id: string) => selectedIds.has(id),
      toggle: (id: string, checked: boolean) =>
        setSelectedIds((current) => toggleSelection(current, id, checked)),
      toggleMany: (ids: readonly string[], checked: boolean) =>
        setSelectedIds((current) => toggleManySelection(current, ids, checked)),
      clear: () => setSelectedIds(new Set()),
      prune: (availableIds: readonly string[]) =>
        setSelectedIds((current) => pruneSelection(current, availableIds)),
      headerState: (ids: readonly string[]) =>
        selectionHeaderState(selectedIds, ids),
    }),
    [selectedIds],
  );
}

/**
 * La casella in testa alla colonna: «tutti quelli che vedi».
 *
 * `aria-label` dice **cosa** si sta per selezionare, non «seleziona tutto»:
 * chi naviga a voce sente il pulsante senza vedere l'elenco che ha sotto, e
 * «tutto» su una pagina filtrata non e una descrizione.
 */
export function SelectAllCheckbox({
  selection,
  ids,
  label,
  className,
}: {
  selection: ListSelection;
  ids: readonly string[];
  /** Per esempio «gli allenatori in elenco». */
  label: string;
  className?: string;
}) {
  const state = selection.headerState(ids);

  return (
    <Checkbox
      className={className}
      checked={state}
      disabled={!ids.length}
      onCheckedChange={(checked) => selection.toggleMany(ids, Boolean(checked))}
      aria-label={`Seleziona ${label}`}
    />
  );
}

/** La casella di una riga. */
export function SelectRowCheckbox({
  selection,
  id,
  label,
  className,
}: {
  selection: ListSelection;
  id: string;
  /** Il nome della persona: e cio che chi ascolta ha bisogno di sentire. */
  label: string;
  className?: string;
}) {
  return (
    <Checkbox
      className={className}
      checked={selection.isSelected(id)}
      onCheckedChange={(checked) => selection.toggle(id, Boolean(checked))}
      aria-label={`Seleziona ${label}`}
    />
  );
}

/**
 * La barra che compare **solo** quando c'e una selezione.
 *
 * A riposo non disegna niente, per la stessa ragione per cui `SaveStatus` non
 * disegna niente a riposo: una barra sempre presente che dice «0 selezionati»
 * occupa spazio per non dire nulla.
 *
 * Compare da **una** riga selezionata, non da due: chi ne ha scelta una sola
 * vuole comunque fare qualcosa con quella, e nascondere i comandi finche non
 * ne sceglie un'altra e una regola che nessuno indovina.
 */
export function BulkSelectionToolbar({
  selection,
  nouns,
  children,
  className,
}: {
  selection: ListSelection;
  nouns: { one: string; many: string };
  /** Le azioni: le decide il dominio, non questa barra. */
  children: React.ReactNode;
  className?: string;
}) {
  if (!selection.count) return null;

  return (
    <div
      role="region"
      aria-label="Azioni sulla selezione"
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div
        className="flex items-center gap-2 text-sm font-medium text-slate-700"
        aria-live="polite"
      >
        <ListChecks className="h-4 w-4 text-slate-500" aria-hidden />
        <span>{describeSelection(selection.count, nouns)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={selection.clear}
        >
          <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Cancella selezione
        </Button>
      </div>
    </div>
  );
}

export type { SelectionScope };
