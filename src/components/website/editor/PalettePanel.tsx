"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { createBlock, listPalette, type PageKind } from "@/lib/website/registry";
import { createSection, findSection, insertBlock, insertSection, locateBlock } from "@/lib/website/document/operations";
import type { WebsitePageDocument } from "@/lib/website/document/types";
import type { EditorTarget } from "@/lib/website/editor-protocol";
import { TextInput } from "@/components/web/forms/Field";
import { blockIcon } from "./block-icons";
import { useEditorDrag } from "./editor-drag";

/**
 * **La tavolozza dei blocchi**, letta dal registry (`listPalette`) e filtrata
 * per il tipo di pagina: un blocco che vive solo nel dettaglio di una gara non
 * compare nella home.
 *
 * Un blocco si trascina nell'albero, oppure si aggiunge con un clic: dopo il
 * blocco selezionato, in fondo alla sezione selezionata, o in una sezione
 * nuova in fondo alla pagina.
 */

export function PalettePanel({
  pageKind,
  selection,
  onChange,
  onSelect,
  readOnly,
}: {
  pageKind: PageKind;
  selection: EditorTarget | null;
  onChange: (fn: (doc: WebsitePageDocument) => WebsitePageDocument) => void;
  onSelect: (target: EditorTarget) => void;
  readOnly: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const groups = React.useMemo(() => listPalette(pageKind, query), [pageKind, query]);
  const { start, end } = useEditorDrag();

  const add = (type: string) => {
    const block = createBlock(type);
    onChange((doc) => {
      if (selection?.kind === "block") {
        const location = locateBlock(doc, selection.id);
        if (location) {
          return insertBlock(doc, { sectionId: location.section.id, columnId: location.column.id, index: location.blockIndex + 1 }, block);
        }
      }
      if (selection?.kind === "section") {
        const section = findSection(doc, selection.id);
        const column = section?.columns[section.columns.length - 1];
        if (section && column) return insertBlock(doc, { sectionId: section.id, columnId: column.id }, block);
      }
      return insertSection(doc, createSection("one", [[block]]));
    });
    onSelect({ kind: "block", id: block.id });
  };

  return (
    <div className="p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-egw-ink-42" aria-hidden="true" />
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca un blocco" className="pl-9" aria-label="Cerca un blocco" />
      </div>
      <p className="mt-2 text-[11.5px] text-egw-ink-62">
        {readOnly ? "Il sito e in sola lettura." : "Trascina un blocco nella struttura, o cliccalo per aggiungerlo dopo l'elemento selezionato."}
      </p>
      {groups.map((group) => (
        <section key={group.category} className="mt-4">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-egw-ink-42">{group.label}</h3>
          <ul className="mt-1.5 grid grid-cols-1 gap-1">
            {group.blocks.map((block) => {
              const Icon = blockIcon(block.icon);
              return (
                <li key={block.type}>
                  <button
                    type="button"
                    disabled={readOnly}
                    draggable={!readOnly}
                    onDragStart={(event) => start(event, { kind: "palette", type: block.type })}
                    onDragEnd={end}
                    onClick={() => add(block.type)}
                    className="flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left hover:border-egw-hairline hover:bg-white disabled:opacity-50"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-egw-blue-700" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold text-egw-ink">{block.label}</span>
                      <span className="block text-[11px] leading-snug text-egw-ink-62">{block.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!groups.length ? <p className="mt-4 text-[12.5px] text-egw-ink-62">Nessun blocco corrisponde alla ricerca.</p> : null}
    </div>
  );
}
