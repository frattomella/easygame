"use client";

import * as React from "react";
import { createBlock, getBlockDefinition } from "@/lib/website/registry";
import {
  createSection,
  insertBlock,
  insertSection,
  locateBlock,
  moveBlock,
  moveSection,
  removeBlock,
} from "@/lib/website/document/operations";
import type { WebsitePageDocument } from "@/lib/website/document/types";

/**
 * **Il trascinamento dell'editor**: che cosa si sta trascinando, condiviso fra
 * l'albero della struttura e la tavolozza. Il `dataTransfer` del browser non
 * si legge durante `dragover`, quindi l'oggetto trascinato vive qui.
 *
 * `applyDrop` e la sola traduzione da «lasciato qui» a operazione sul
 * documento: tre sorgenti (sezione, blocco, tavolozza) per due destinazioni
 * (fra le sezioni, dentro una colonna).
 */

export type DragItem =
  | { kind: "section"; id: string }
  | { kind: "block"; id: string }
  | { kind: "palette"; type: string };

export type DropTarget =
  | { kind: "between-sections"; index: number }
  | { kind: "column"; sectionId: string; columnId: string; index: number };

type DragContextValue = {
  item: DragItem | null;
  start: (event: React.DragEvent, item: DragItem) => void;
  end: () => void;
};

const DragContext = React.createContext<DragContextValue>({ item: null, start: () => undefined, end: () => undefined });

export function EditorDragProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = React.useState<DragItem | null>(null);
  const value = React.useMemo<DragContextValue>(
    () => ({
      item,
      start: (event, next) => {
        event.dataTransfer.effectAllowed = next.kind === "palette" ? "copy" : "move";
        /* Firefox non avvia il trascinamento senza un dato. */
        event.dataTransfer.setData("text/plain", next.kind === "palette" ? next.type : next.id);
        setItem(next);
      },
      end: () => setItem(null),
    }),
    [item],
  );
  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}

export const useEditorDrag = () => React.useContext(DragContext);

/** Vero se l'oggetto si puo lasciare in quella destinazione. */
export const canDrop = (item: DragItem | null, target: DropTarget) => {
  if (!item) return false;
  if (item.kind === "section") return target.kind === "between-sections";
  return true;
};

export type DropResult = { doc: WebsitePageDocument; select: { kind: "section" | "block"; id: string } | null };

export const applyDrop = (doc: WebsitePageDocument, item: DragItem, target: DropTarget): DropResult => {
  if (target.kind === "between-sections") {
    if (item.kind === "section") {
      const from = doc.sections.findIndex((section) => section.id === item.id);
      if (from < 0) return { doc, select: null };
      /* L'indice di arrivo si legge dopo aver tolto la sezione. */
      const to = from < target.index ? target.index - 1 : target.index;
      return { doc: from === to ? doc : moveSection(doc, item.id, to), select: { kind: "section", id: item.id } };
    }
    if (item.kind === "palette") {
      if (!getBlockDefinition(item.type)) return { doc, select: null };
      const block = createBlock(item.type);
      const section = createSection("one", [[block]]);
      return { doc: insertSection(doc, section, target.index), select: { kind: "block", id: block.id } };
    }
    /* Un blocco lasciato fra due sezioni ne apre una nuova tutta sua. */
    const location = locateBlock(doc, item.id);
    if (!location) return { doc, select: null };
    const section = createSection("one", [[location.block]]);
    return { doc: insertSection(removeBlock(doc, item.id), section, target.index), select: { kind: "block", id: item.id } };
  }

  if (item.kind === "palette") {
    if (!getBlockDefinition(item.type)) return { doc, select: null };
    const block = createBlock(item.type);
    return {
      doc: insertBlock(doc, { sectionId: target.sectionId, columnId: target.columnId, index: target.index }, block),
      select: { kind: "block", id: block.id },
    };
  }
  if (item.kind === "block") {
    const location = locateBlock(doc, item.id);
    if (!location) return { doc, select: null };
    const sameColumn = location.section.id === target.sectionId && location.column.id === target.columnId;
    const index = sameColumn && location.blockIndex < target.index ? target.index - 1 : target.index;
    if (sameColumn && index === location.blockIndex) return { doc, select: { kind: "block", id: item.id } };
    return {
      doc: moveBlock(doc, item.id, { sectionId: target.sectionId, columnId: target.columnId, index }),
      select: { kind: "block", id: item.id },
    };
  }
  return { doc, select: null };
};

/** La fessura in cui si lascia: si allarga e si colora solo durante un trascinamento compatibile. */
export function DropSlot({
  target,
  onDrop,
  label,
}: {
  target: DropTarget;
  onDrop: (item: DragItem, target: DropTarget) => void;
  label: string;
}) {
  const { item, end } = useEditorDrag();
  const [over, setOver] = React.useState(false);
  const active = canDrop(item, target);
  return (
    <div
      aria-hidden={!active}
      onDragOver={(event) => {
        if (!active) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = item?.kind === "palette" ? "copy" : "move";
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (item && active) onDrop(item, target);
        end();
      }}
      className={
        active
          ? `my-0.5 flex h-6 items-center justify-center rounded border border-dashed text-[10.5px] font-semibold transition-colors ${
              over ? "border-egw-blue bg-egw-tint-blue text-egw-blue-700" : "border-egw-hairline text-transparent"
            }`
          : "h-1"
      }
    >
      {active && over ? label : null}
    </div>
  );
}
