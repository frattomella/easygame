"use client";

import * as React from "react";
import { Hash, Pencil, Shuffle, Users, X } from "lucide-react";
import { CellChips, DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard } from "@/components/web/page/Cards";
import type { NumberingGroup } from "@/lib/clothing-inventory-utils";
import type { JerseyGroupAthleteRow, JerseyGroupSummary } from "@/lib/jersey-numbering-utils";
import { CATEGORY_ELIGIBILITY_LABELS } from "@/lib/category-compatibility";
import type { NormalizedCategoryOption } from "@/lib/category-utils";
import { formatInteger, joinMeta } from "@/lib/web/format";

/**
 * L'area «Numerazioni» (pattern 10: due griglie impilate). Sopra i gruppi con
 * il loro riepilogo derivato (`getJerseyGroupSummaries`); sotto, per il
 * gruppo aperto, gli atleti con i numeri, il numero manuale in linea
 * (guideline 08 §8.7: il numero di maglia e uno dei campi ammessi), Random
 * e Rimuovi. La V1 apriva i gruppi a fisarmonica con ricerca e «Mostra
 * altri» per gruppo: qui ricerca e pagine sono quelle della griglia.
 *
 * Il record manuale e il `jerseyAssignment` senza `assignmentId`: i numeri
 * che arrivano dalle assegnazioni kit non si toccano da qui.
 */
const manualRecordOf = (row: JerseyGroupAthleteRow) => row.records.find((record) => record.source === "jersey_assignment" && !record.assignmentId);

const MEMBERSHIP_OPTIONS = [
  { value: "primary", label: "Categoria del gruppo" },
  { value: "secondary", label: CATEGORY_ELIGIBILITY_LABELS.secondary },
  { value: "compatible", label: CATEGORY_ELIGIBILITY_LABELS.compatible },
  { value: "external", label: "Fuori gruppo" },
];

export function NumberingArea({
  summaries,
  categoryOptions,
  categoryLabel,
  canManage,
  loading,
  onEditGroup,
  onCreateGroup,
  onSaveManualNumber,
  onAssignRandom,
}: {
  summaries: JerseyGroupSummary[];
  categoryOptions: NormalizedCategoryOption[];
  /** Come si scrive una categoria (ADR-0185). */
  categoryLabel?: (categoryId: string) => string;
  canManage: boolean;
  loading: boolean;
  onEditGroup: (group: NumberingGroup) => void;
  onCreateGroup: () => void;
  onSaveManualNumber: (payload: { athleteId: string; groupId: string; value: string | number | null }) => Promise<void>;
  onAssignRandom: (groupId: string, athleteId: string) => Promise<void>;
}) {
  const [openGroupId, setOpenGroupId] = React.useState<string | null>(null);
  const summary = summaries.find((entry) => entry.group.id === openGroupId) || null;

  /* Mai un identificativo come testo (ADR-0185): una categoria sconosciuta si dice, non si stampa. */
  const categoryName = React.useCallback(
    (id: string) =>
      (categoryLabel ? categoryLabel(id) : categoryOptions.find((category) => category.id === id)?.name) ||
      "Categoria non disponibile",
    [categoryLabel, categoryOptions],
  );

  /* ── Gruppi ─────────────────────────────────────────────────────────── */
  const groupColumns = React.useMemo<ColumnDef<JerseyGroupSummary>[]>(
    () => [
      {
        id: "name",
        header: "Gruppo",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <IdentityCell
            name={row.group.name}
            meta={joinMeta(`${row.group.minNumber}–${row.group.maxNumber}`, row.group.season || null)}
            onClick={() => setOpenGroupId(row.group.id)}
          />
        ),
        sortValue: (row) => row.group.name.toLowerCase(),
        exportValue: (row) => row.group.name,
        title: (row) => row.group.name,
      },
      {
        id: "categories",
        header: "Categorie",
        kind: "chips",
        width: 1.5,
        cell: (row) => (
          <CellChips
            items={[
              ...(row.group.categoryIds.length ? row.group.categoryIds.map((id) => ({ label: categoryName(id) })) : [{ label: "Tutte le categorie" }]),
              ...(row.group.includeCompatibleCategories ? [{ label: "Categorie compatibili incluse", tone: "blue" as const }] : []),
            ]}
          />
        ),
        sortValue: (row) => row.group.categoryIds.length,
        exportValue: (row) => (row.group.categoryIds.length ? row.group.categoryIds.map(categoryName).join(", ") : "Tutte le categorie"),
        title: (row) => (row.group.categoryIds.length ? row.group.categoryIds.map(categoryName).join(", ") : "Tutte le categorie"),
      },
      { id: "athletes", header: "Atleti", kind: "number", align: "right", width: "90px", cell: (row) => formatInteger(row.rows.length), sortValue: (row) => row.rows.length, exportValue: (row) => row.rows.length },
      { id: "used", header: "Numeri usati", kind: "number", align: "right", width: "110px", cell: (row) => formatInteger(row.usedNumbers.length), sortValue: (row) => row.usedNumbers.length, exportValue: (row) => row.usedNumbers.length },
      {
        id: "missing",
        header: "Senza numero",
        kind: "number",
        align: "right",
        width: "110px",
        cell: (row) => <span className={row.missingRows.length ? "text-egw-amber-ink" : undefined}>{formatInteger(row.missingRows.length)}</span>,
        sortValue: (row) => row.missingRows.length,
        exportValue: (row) => row.missingRows.length,
      },
      {
        id: "duplicates",
        header: "Duplicati",
        kind: "number",
        align: "right",
        width: "100px",
        cell: (row) => <span className={row.duplicateNumbers.length ? "font-bold text-egw-red" : undefined}>{formatInteger(row.duplicateNumbers.length)}</span>,
        sortValue: (row) => row.duplicateNumbers.length,
        exportValue: (row) => row.duplicateNumbers.length,
      },
      { id: "season", header: "Stagione", kind: "classification", hidden: true, cell: (row) => row.group.season, sortValue: (row) => row.group.season || null },
      { id: "sites", header: "Sedi", kind: "number", hidden: true, cell: (row) => (row.group.siteIds.length ? formatInteger(row.group.siteIds.length) : "Tutte"), sortValue: (row) => row.group.siteIds.length },
    ],
    [categoryName],
  );

  const groupFilters = React.useMemo<FilterDef<JerseyGroupSummary>[]>(
    () => [
      {
        id: "problems",
        label: "Situazione",
        type: "select",
        options: [
          { value: "missing", label: "Con atleti senza numero", tone: "amber" },
          { value: "duplicates", label: "Con numeri duplicati", tone: "red" },
        ],
        apply: (row, value) => (value === "missing" ? row.missingRows.length > 0 : value === "duplicates" ? row.duplicateNumbers.length > 0 : true),
      },
    ],
    [],
  );

  const groupActions = React.useMemo<RowActionDef<JerseyGroupSummary>[]>(
    () => [
      { id: "open", label: "Atleti del gruppo", icon: <Users />, primary: true, onClick: (row) => setOpenGroupId(row.group.id) },
      { id: "edit", label: "Modifica", icon: <Pencil />, hidden: () => !canManage, onClick: (row) => onEditGroup(row.group) },
    ],
    [canManage, onEditGroup],
  );

  /* ── Atleti del gruppo aperto ───────────────────────────────────────── */
  const group = summary?.group || null;

  const athleteColumns = React.useMemo<ColumnDef<JerseyGroupAthleteRow>[]>(
    () => [
      {
        id: "athlete",
        header: "Atleta",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell number={row.numbers[0] ?? null} name={row.athleteName} meta={row.categoryLabel} />,
        sortValue: (row) => row.athleteName.toLowerCase(),
        exportValue: (row) => row.athleteName,
        title: (row) => row.athleteName,
      },
      {
        id: "membership",
        header: "Perché è nel gruppo",
        kind: "chips",
        cell: (row) =>
          row.membership === "primary" ? (
            <span className="font-brand text-[12px] text-egw-ink-62">Categoria del gruppo</span>
          ) : (
            <DataChip size="sm" tone={row.membership === "external" ? "neutral" : "blue"}>
              {row.membership === "external" ? "Fuori gruppo" : CATEGORY_ELIGIBILITY_LABELS[row.membership]}
            </DataChip>
          ),
        sortValue: (row) => row.membership,
        exportValue: (row) => (row.membership === "primary" ? "Categoria del gruppo" : row.membership === "external" ? "Fuori gruppo" : CATEGORY_ELIGIBILITY_LABELS[row.membership]),
      },
      {
        id: "numbers",
        header: "Numeri",
        kind: "chips",
        cell: (row) =>
          row.numbers.length ? (
            <CellChips items={row.numbers.map((number) => ({ label: String(number), tone: row.duplicateNumbers.includes(number) ? ("amber" as const) : undefined }))} max={3} />
          ) : (
            <span className="font-brand text-[12px] text-egw-amber-ink">Senza numero</span>
          ),
        sortValue: (row) => row.numbers[0] ?? null,
        exportValue: (row) => row.numbers.join(", "),
      },
      {
        id: "manual",
        header: "Numero manuale",
        kind: "number",
        width: "150px",
        cell: (row) => {
          const manual = manualRecordOf(row);
          if (!canManage || !group) return manual?.number ?? null;
          return (
            <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              <input
                key={`${row.athleteId}-${manual?.number ?? "empty"}`}
                type="number"
                min={group.minNumber}
                max={group.maxNumber}
                defaultValue={manual?.number ?? ""}
                placeholder="Numero"
                aria-label={`Numero manuale di ${row.athleteName}`}
                className="egw-num h-8 w-[88px] rounded-egw-control border border-egw-field-border bg-white px-2 text-right font-brand text-[12.5px] text-egw-ink outline-none transition-[border-color,box-shadow] duration-hover placeholder:text-egw-ink-42 hover:border-egw-control-border focus:border-egw-blue focus:shadow-egw-focus [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if ((!value && !manual) || value === String(manual?.number ?? "")) return;
                  void onSaveManualNumber({ athleteId: row.athleteId, groupId: group.id, value });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </div>
          );
        },
        sortValue: (row) => manualRecordOf(row)?.number ?? null,
        exportValue: (row) => manualRecordOf(row)?.number ?? "",
      },
    ],
    [canManage, group, onSaveManualNumber],
  );

  const athleteFilters = React.useMemo<FilterDef<JerseyGroupAthleteRow>[]>(
    () => [
      {
        id: "hasNumber",
        label: "Numero",
        type: "select",
        pinned: true,
        options: [
          { value: "missing", label: "Senza numero", tone: "amber" },
          { value: "assigned", label: "Con numero" },
          { value: "duplicate", label: "Duplicato", tone: "red" },
        ],
        apply: (row, value) => (value === "missing" ? !row.hasNumber : value === "assigned" ? row.hasNumber : value === "duplicate" ? row.duplicateNumbers.length > 0 : true),
      },
      {
        id: "membership",
        label: "Appartenenza",
        type: "select",
        options: MEMBERSHIP_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? row.membership === value : true),
      },
    ],
    [],
  );

  const athleteActions = React.useMemo<RowActionDef<JerseyGroupAthleteRow>[]>(
    () => [
      { id: "random", label: "Numero casuale", icon: <Shuffle />, primary: true, hidden: (row) => !canManage || row.hasNumber, onClick: (row) => group && void onAssignRandom(group.id, row.athleteId) },
      { id: "remove", label: "Rimuovi numero manuale", icon: <X />, tone: "danger", hidden: (row) => !canManage || !manualRecordOf(row), onClick: (row) => group && void onSaveManualNumber({ athleteId: row.athleteId, groupId: group.id, value: null }) },
    ],
    [canManage, group, onAssignRandom, onSaveManualNumber],
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <DataGrid<JerseyGroupSummary>
        module="abbigliamento-numerazioni"
        aria-label="Gruppi numerazione"
        rows={summaries}
        getRowId={(row) => row.group.id}
        rowLabel={(row) => row.group.name}
        columns={groupColumns}
        filters={groupFilters}
        search={{
          placeholder: "Cerca gruppo",
          match: (row, query) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return [row.group.name, row.group.season || "", ...row.group.categoryIds.map(categoryName)].some((value) => value.toLowerCase().includes(q));
          },
        }}
        defaultSort={{ columnId: "name", direction: "asc" }}
        rowActions={groupActions}
        onOpenRow={(row) => setOpenGroupId(row.group.id)}
        activeRowId={openGroupId}
        state={loading ? "loading" : "ready"}
        noun={{ singular: "gruppo", plural: "gruppi" }}
        hideFooter={summaries.length <= 25}
        empty={{
          icon: <Hash />,
          title: "Nessun gruppo numerazione configurato",
          description: "I numeri sono unici solo dentro il gruppo: crea un gruppo per categoria o per sede.",
          primary: canManage ? (
            <Button variant="primary" size="sm" onClick={onCreateGroup}>
              Nuovo gruppo
            </Button>
          ) : null,
        }}
      />

      {summary && group ? (
        <section aria-label={`Atleti del gruppo ${group.name}`} className="flex flex-col gap-[18px]">
          <Panel>
            <PanelHeader
              eyebrow="Gruppo aperto"
              title={group.name}
              description={joinMeta(`Numeri ${group.minNumber}–${group.maxNumber}`, group.season || null, `${formatInteger(summary.rows.length)} ${summary.rows.length === 1 ? "atleta" : "atleti"}`)}
              actions={
                <>
                  {canManage ? (
                    <Button variant="secondary" size="sm" icon={<Pencil />} onClick={() => onEditGroup(group)}>
                      Modifica gruppo
                    </Button>
                  ) : null}
                  <Button variant="text" size="sm" onClick={() => setOpenGroupId(null)}>
                    Chiudi
                  </Button>
                </>
              }
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {group.categoryIds.length ? group.categoryIds.map((id) => <DataChip key={id}>{categoryName(id)}</DataChip>) : <DataChip>Tutte le categorie</DataChip>}
              {group.includeCompatibleCategories ? <DataChip tone="blue">Categorie compatibili incluse</DataChip> : null}
              <DataChip>{formatInteger(summary.usedNumbers.length)} numeri usati</DataChip>
              <DataChip tone={summary.missingRows.length ? "amber" : "neutral"}>{formatInteger(summary.missingRows.length)} senza numero</DataChip>
            </div>
            {summary.duplicateNumbers.length ? (
              <AlertBlock severity="warning" title={`Numeri duplicati: ${summary.duplicateNumbers.map((entry) => entry.number).join(", ")}`} className="mt-4">
                Due atleti dello stesso gruppo hanno lo stesso numero: correggi il numero manuale di uno dei due.
              </AlertBlock>
            ) : null}
          </Panel>

          <DataGrid<JerseyGroupAthleteRow>
            module="abbigliamento-numerazione-atleti"
            aria-label={`Atleti del gruppo ${group.name}`}
            rows={summary.rows}
            getRowId={(row) => row.athleteId}
            rowLabel={(row) => row.athleteName}
            columns={athleteColumns}
            filters={athleteFilters}
            search={{
              placeholder: "Cerca atleta o categoria",
              match: (row, query) => {
                const q = query.trim().toLowerCase();
                if (!q) return true;
                return `${row.athleteName} ${row.categoryLabel}`.toLowerCase().includes(q);
              },
            }}
            defaultSort={{ columnId: "athlete", direction: "asc" }}
            rowActions={athleteActions}
            state="ready"
            noun={{ singular: "atleta", plural: "atleti" }}
            empty={{ icon: <Users />, title: "Nessun atleta collegato al gruppo", description: "Il gruppo non ha categorie con atleti, o le sue sedi non hanno squadre." }}
          />
        </section>
      ) : summaries.length && !loading ? (
        <EmptyStateCard icon={<Users />} title="Apri un gruppo per vedere i suoi atleti" description="Dalla riga del gruppo, o con Invio: qui compaiono i numeri assegnati, quelli mancanti e il numero manuale." />
      ) : null}
    </div>
  );
}
