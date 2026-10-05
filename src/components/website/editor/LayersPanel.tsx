"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import { getBlockDefinition } from "@/lib/website/registry";
import {
  createSection,
  duplicateBlock,
  duplicateSection,
  insertSection,
  isHiddenEverywhere,
  moveBlockBy,
  moveSectionBy,
  removeBlock,
  removeSection,
  toggleBlockVisibility,
  toggleSectionVisibility,
} from "@/lib/website/document/operations";
import { SECTION_LAYOUTS, type SectionLayout, type WebsiteBlock, type WebsitePageDocument, type WebsiteSection } from "@/lib/website/document/types";
import type { EditorTarget } from "@/lib/website/editor-protocol";
import { blockIcon } from "./block-icons";
import { applyDrop, DropSlot, useEditorDrag, type DragItem, type DropTarget } from "./editor-drag";

/**
 * **L'albero della pagina**: sezioni, colonne, blocchi.
 *
 * Si riordina trascinando (anche un blocco da una sezione all'altra) o con i
 * bottoni su/giu, che restano per chi usa la tastiera. Ogni riga ha le stesse
 * azioni della barra nell'anteprima: duplica, nascondi, elimina.
 */

export const SECTION_LAYOUT_LABELS: Record<SectionLayout, string> = {
  one: "Una colonna",
  two: "Due colonne",
  "two-wide-left": "Due colonne, larga a sinistra",
  "two-wide-right": "Due colonne, larga a destra",
  three: "Tre colonne",
  four: "Quattro colonne",
};

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Una riga riconoscibile: il tipo, e il primo testo che il blocco mostra. */
export const blockSummary = (block: WebsiteBlock) => {
  const props = block.props || {};
  for (const key of ["title", "heading", "label", "eyebrow", "text", "html", "question"]) {
    const value = props[key];
    if (typeof value === "string" && stripHtml(value)) return stripHtml(value).slice(0, 48);
  }
  return "";
};

export const sectionLabel = (section: WebsiteSection, index: number) => section.label || `Sezione ${index + 1}`;

type Props = {
  doc: WebsitePageDocument;
  selection: EditorTarget | null;
  onSelect: (target: EditorTarget | null) => void;
  onHover: (target: EditorTarget | null) => void;
  onChange: (fn: (doc: WebsitePageDocument) => WebsitePageDocument) => void;
  readOnly: boolean;
};

export function LayersPanel({ doc, selection, onSelect, onHover, onChange, readOnly }: Props) {
  const { start, end } = useEditorDrag();
  const [addingAt, setAddingAt] = React.useState<number | null>(null);

  const drop = (item: DragItem, target: DropTarget) => {
    let select: EditorTarget | null = null;
    onChange((current) => {
      const result = applyDrop(current, item, target);
      select = result.select;
      return result.doc;
    });
    if (select) onSelect(select);
  };

  const addSection = (layout: SectionLayout, index: number) => {
    const section = createSection(layout);
    onChange((current) => insertSection(current, section, index));
    onSelect({ kind: "section", id: section.id });
    setAddingAt(null);
  };

  const rowActions = (target: EditorTarget, hidden: boolean, label: string) => {
    const isSection = target.kind === "section";
    const act = (fn: (doc: WebsitePageDocument) => WebsitePageDocument) => (event: React.MouseEvent) => {
      event.stopPropagation();
      onChange(fn);
    };
    return (
      <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <RowButton label={`Sposta su ${label}`} onClick={act((d) => (isSection ? moveSectionBy(d, target.id, -1) : moveBlockBy(d, target.id, -1)))}>
          <ArrowUp />
        </RowButton>
        <RowButton label={`Sposta giu ${label}`} onClick={act((d) => (isSection ? moveSectionBy(d, target.id, 1) : moveBlockBy(d, target.id, 1)))}>
          <ArrowDown />
        </RowButton>
        <RowButton
          label={`Duplica ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            let newId: string | null = null;
            onChange((d) => {
              const result = isSection ? duplicateSection(d, target.id) : duplicateBlock(d, target.id);
              newId = result.newId;
              return result.doc;
            });
            if (newId) onSelect({ kind: target.kind, id: newId });
          }}
        >
          <Copy />
        </RowButton>
        <RowButton
          label={`${hidden ? "Mostra" : "Nascondi"} ${label}`}
          onClick={act((d) => (isSection ? toggleSectionVisibility(d, target.id) : toggleBlockVisibility(d, target.id)))}
        >
          {hidden ? <Eye /> : <EyeOff />}
        </RowButton>
        <RowButton
          label={`Elimina ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onChange((d) => (isSection ? removeSection(d, target.id) : removeBlock(d, target.id)));
            if (selection?.id === target.id) onSelect(null);
          }}
        >
          <Trash2 />
        </RowButton>
      </span>
    );
  };

  const addMenu = (index: number) =>
    addingAt === index ? (
      <div className="my-1 rounded-md border border-egw-hairline bg-white p-2 shadow-sm">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-egw-ink-42">Nuova sezione</p>
        <div className="grid grid-cols-2 gap-1">
          {SECTION_LAYOUTS.map((layout) => (
            <button
              key={layout}
              type="button"
              onClick={() => addSection(layout, index)}
              className="rounded border border-egw-hairline px-2 py-1.5 text-left text-[11.5px] hover:border-egw-blue hover:text-egw-blue-700"
            >
              {SECTION_LAYOUT_LABELS[layout]}
            </button>
          ))}
        </div>
        <button type="button" className="mt-1 text-[11.5px] text-egw-ink-62 underline" onClick={() => setAddingAt(null)}>
          Annulla
        </button>
      </div>
    ) : null;

  if (!doc.sections.length) {
    return (
      <div className="space-y-2 p-3">
        <p className="text-[12.5px] text-egw-ink-62">La pagina e vuota. Aggiungi una sezione o trascina qui un blocco dalla tavolozza.</p>
        <DropSlot target={{ kind: "between-sections", index: 0 }} onDrop={drop} label="Lascia qui" />
        {!readOnly ? (
          <button type="button" onClick={() => setAddingAt(0)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-egw-blue-700">
            <Plus className="h-3.5 w-3.5" /> Aggiungi una sezione
          </button>
        ) : null}
        {addMenu(0)}
      </div>
    );
  }

  return (
    <div className="p-2" onMouseLeave={() => onHover(null)}>
      <ul aria-label="Struttura della pagina" className="space-y-0">
        {doc.sections.map((section, sectionIndex) => {
          const sectionTarget: EditorTarget = { kind: "section", id: section.id };
          const sectionSelected = selection?.kind === "section" && selection.id === section.id;
          const sectionHidden = isHiddenEverywhere(section.hidden);
          const label = sectionLabel(section, sectionIndex);
          return (
            <li key={section.id}>
              {!readOnly ? <DropSlot target={{ kind: "between-sections", index: sectionIndex }} onDrop={drop} label="Sposta la sezione qui" /> : null}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={sectionSelected}
                draggable={!readOnly}
                onDragStart={(event) => start(event, { kind: "section", id: section.id })}
                onDragEnd={end}
                onClick={() => onSelect(sectionTarget)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(sectionTarget);
                  }
                }}
                onMouseEnter={() => onHover(sectionTarget)}
                className={`group flex items-center gap-1 rounded-md px-1.5 py-1.5 text-[12.5px] font-semibold ${
                  sectionSelected ? "bg-egw-tint-blue text-egw-blue-700" : "text-egw-ink hover:bg-egw-page-100"
                } ${sectionHidden ? "opacity-50" : ""}`}
              >
                {!readOnly ? <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-egw-ink-42" aria-hidden="true" /> : null}
                <span className="truncate">{label}</span>
                <span className="shrink-0 text-[10.5px] font-normal text-egw-ink-42">{section.columns.length > 1 ? `${section.columns.length} col.` : ""}</span>
                {!readOnly ? rowActions(sectionTarget, sectionHidden, label) : null}
              </div>
              <div className="ml-3 border-l border-egw-hairline pl-2">
                {section.columns.map((column, columnIndex) => (
                  <div key={column.id}>
                    {section.columns.length > 1 ? (
                      <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-egw-ink-42">Colonna {columnIndex + 1}</p>
                    ) : null}
                    <ul aria-label={`Blocchi di ${label}${section.columns.length > 1 ? `, colonna ${columnIndex + 1}` : ""}`}>
                      {column.blocks.map((block, blockIndex) => {
                        const definition = getBlockDefinition(block.type);
                        const Icon = blockIcon(definition?.icon);
                        const target: EditorTarget = { kind: "block", id: block.id };
                        const selected = selection?.kind === "block" && selection.id === block.id;
                        const hidden = isHiddenEverywhere(block.hidden);
                        const summary = blockSummary(block);
                        const blockLabel = definition?.label || `Blocco sconosciuto (${block.type})`;
                        return (
                          <li key={block.id}>
                            {!readOnly ? (
                              <DropSlot target={{ kind: "column", sectionId: section.id, columnId: column.id, index: blockIndex }} onDrop={drop} label="Lascia qui" />
                            ) : null}
                            <div
                              role="button"
                              tabIndex={0}
                              aria-pressed={selected}
                              draggable={!readOnly}
                              onDragStart={(event) => {
                                event.stopPropagation();
                                start(event, { kind: "block", id: block.id });
                              }}
                              onDragEnd={end}
                              onClick={() => onSelect(target)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onSelect(target);
                                }
                              }}
                              onMouseEnter={() => onHover(target)}
                              className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] ${
                                selected ? "bg-egw-tint-blue text-egw-blue-700" : "text-egw-ink-72 hover:bg-egw-page-100"
                              } ${hidden ? "opacity-50" : ""} ${definition ? "" : "text-egw-red"}`}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="min-w-0 truncate">
                                <span className="font-semibold">{blockLabel}</span>
                                {summary ? <span className="text-egw-ink-42"> · {summary}</span> : null}
                              </span>
                              {!readOnly ? rowActions(target, hidden, blockLabel) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {!readOnly ? (
                      <DropSlot
                        target={{ kind: "column", sectionId: section.id, columnId: column.id, index: column.blocks.length }}
                        onDrop={drop}
                        label={column.blocks.length ? "Lascia in fondo" : "Lascia nella colonna vuota"}
                      />
                    ) : null}
                    {!column.blocks.length ? <p className="py-1 text-[11px] italic text-egw-ink-42">Colonna vuota</p> : null}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {!readOnly ? (
        <>
          <DropSlot target={{ kind: "between-sections", index: doc.sections.length }} onDrop={drop} label="Lascia in fondo alla pagina" />
          <button
            type="button"
            onClick={() => setAddingAt(doc.sections.length)}
            className="mt-2 inline-flex items-center gap-1 px-1.5 text-[12.5px] font-semibold text-egw-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> Aggiungi una sezione
          </button>
          {addMenu(doc.sections.length)}
        </>
      ) : null}
    </div>
  );
}

function RowButton({ label, onClick, children }: { label: string; onClick: (event: React.MouseEvent) => void; children: React.ReactElement }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-egw-ink-62 hover:bg-white hover:text-egw-ink focus-visible:opacity-100 [&>svg]:h-3.5 [&>svg]:w-3.5"
    >
      {children}
    </button>
  );
}
