import { newWebsiteId } from "../ids";
import {
  SECTION_LAYOUT_COLUMNS,
  type DeviceVisibility,
  type ElementStyle,
  type ResponsiveStyle,
  type ResponsiveValue,
  type SectionLayout,
  type WebsiteBlock,
  type WebsiteColumn,
  type WebsiteDevice,
  type WebsitePageDocument,
  type WebsiteSection,
} from "./types";

/**
 * **Le operazioni sul documento di una pagina** (ADR-0200 §3).
 *
 * Funzioni pure che restituiscono un documento nuovo: l'editor le chiama, la
 * cronologia ne conserva lo stato precedente, e un test le prova senza DOM.
 * L'idea e quella di `editor-model.ts` del Website Builder GPW, estesa al
 * quarto livello: qui un blocco vive in una colonna di una sezione, e si puo
 * spostare **fra** sezioni.
 *
 * Nessuna operazione inventa contenuto: duplicare copia, spostare sposta.
 * Un identificativo che non esiste lascia il documento com'e.
 */

type Doc = WebsitePageDocument;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* ------------------------------------------------------------- ricerca */

export type BlockLocation = {
  sectionIndex: number;
  columnIndex: number;
  blockIndex: number;
  section: WebsiteSection;
  column: WebsiteColumn;
  block: WebsiteBlock;
};

export const findSection = (doc: Doc, sectionId: string) =>
  doc.sections.find((section) => section.id === sectionId) || null;

export const locateBlock = (doc: Doc, blockId: string): BlockLocation | null => {
  for (let s = 0; s < doc.sections.length; s += 1) {
    const section = doc.sections[s];
    for (let c = 0; c < section.columns.length; c += 1) {
      const column = section.columns[c];
      const b = column.blocks.findIndex((block) => block.id === blockId);
      if (b >= 0) {
        return { sectionIndex: s, columnIndex: c, blockIndex: b, section, column, block: column.blocks[b] };
      }
    }
  }
  return null;
};

export const listBlocks = (doc: Doc) =>
  doc.sections.flatMap((section) => section.columns.flatMap((column) => column.blocks));

/* ------------------------------------------------------------- sezioni */

const columnsFor = (layout: SectionLayout, existing: WebsiteColumn[] = []): WebsiteColumn[] => {
  const count = SECTION_LAYOUT_COLUMNS[layout];
  const columns = existing.slice(0, count).map((column) => ({ ...column, blocks: column.blocks.slice() }));
  while (columns.length < count) columns.push({ id: newWebsiteId(), blocks: [] });
  /* Le colonne che spariscono non perdono i blocchi: confluiscono nell'ultima che resta. */
  const orphans = existing.slice(count).flatMap((column) => column.blocks);
  if (orphans.length) columns[columns.length - 1].blocks.push(...orphans);
  return columns;
};

export const createSection = (
  layout: SectionLayout = "one",
  blocks: WebsiteBlock[][] = [],
  extra: Partial<Omit<WebsiteSection, "id" | "layout" | "columns">> = {},
): WebsiteSection => {
  const columns = columnsFor(layout).map((column, index) => ({ ...column, blocks: blocks[index] || [] }));
  return { id: newWebsiteId(), layout, columns, ...extra };
};

export const insertSection = (doc: Doc, section: WebsiteSection, index = doc.sections.length): Doc => {
  const sections = doc.sections.slice();
  sections.splice(Math.max(0, Math.min(index, sections.length)), 0, section);
  return { ...doc, sections };
};

export const removeSection = (doc: Doc, sectionId: string): Doc => ({
  ...doc,
  sections: doc.sections.filter((section) => section.id !== sectionId),
});

/** Una copia con identificativi nuovi, subito dopo l'originale. */
export const duplicateSection = (doc: Doc, sectionId: string): { doc: Doc; newId: string | null } => {
  const index = doc.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return { doc, newId: null };
  const copy = reidentifySection(clone(doc.sections[index]));
  if (copy.anchor) copy.anchor = `${copy.anchor}-copia`.slice(0, 60);
  return { doc: insertSection(doc, copy, index + 1), newId: copy.id };
};

export const reidentifySection = (section: WebsiteSection): WebsiteSection => ({
  ...section,
  id: newWebsiteId(),
  columns: section.columns.map((column) => ({
    id: newWebsiteId(),
    blocks: column.blocks.map((block) => ({ ...block, id: newWebsiteId() })),
  })),
});

export const moveSection = (doc: Doc, sectionId: string, toIndex: number): Doc => {
  const from = doc.sections.findIndex((section) => section.id === sectionId);
  if (from < 0) return doc;
  const sections = doc.sections.slice();
  const [moved] = sections.splice(from, 1);
  sections.splice(Math.max(0, Math.min(toIndex, sections.length)), 0, moved);
  return { ...doc, sections };
};

export const moveSectionBy = (doc: Doc, sectionId: string, delta: -1 | 1): Doc => {
  const from = doc.sections.findIndex((section) => section.id === sectionId);
  if (from < 0) return doc;
  const to = from + delta;
  if (to < 0 || to >= doc.sections.length) return doc;
  return moveSection(doc, sectionId, to);
};

export const updateSection = (
  doc: Doc,
  sectionId: string,
  patch: Partial<Omit<WebsiteSection, "id" | "columns">>,
): Doc => ({
  ...doc,
  sections: doc.sections.map((section) => {
    if (section.id !== sectionId) return section;
    const next = { ...section, ...patch };
    if (patch.layout && patch.layout !== section.layout) next.columns = columnsFor(patch.layout, section.columns);
    return next;
  }),
});

/* ------------------------------------------------------------- blocchi */

export type BlockTarget = { sectionId: string; columnId: string; index?: number };

const mapColumn = (doc: Doc, sectionId: string, columnId: string, fn: (blocks: WebsiteBlock[]) => WebsiteBlock[]): Doc => ({
  ...doc,
  sections: doc.sections.map((section) =>
    section.id !== sectionId
      ? section
      : {
          ...section,
          columns: section.columns.map((column) =>
            column.id !== columnId ? column : { ...column, blocks: fn(column.blocks.slice()) },
          ),
        },
  ),
});

export const insertBlock = (doc: Doc, target: BlockTarget, block: WebsiteBlock): Doc =>
  mapColumn(doc, target.sectionId, target.columnId, (blocks) => {
    const index = target.index === undefined ? blocks.length : Math.max(0, Math.min(target.index, blocks.length));
    blocks.splice(index, 0, block);
    return blocks;
  });

export const removeBlock = (doc: Doc, blockId: string): Doc => {
  const location = locateBlock(doc, blockId);
  if (!location) return doc;
  return mapColumn(doc, location.section.id, location.column.id, (blocks) => blocks.filter((block) => block.id !== blockId));
};

export const duplicateBlock = (doc: Doc, blockId: string): { doc: Doc; newId: string | null } => {
  const location = locateBlock(doc, blockId);
  if (!location) return { doc, newId: null };
  const copy: WebsiteBlock = { ...clone(location.block), id: newWebsiteId() };
  return {
    doc: insertBlock(doc, { sectionId: location.section.id, columnId: location.column.id, index: location.blockIndex + 1 }, copy),
    newId: copy.id,
  };
};

/**
 * Sposta un blocco in qualunque colonna di qualunque sezione. Se la colonna
 * di arrivo e la stessa di partenza, l'indice di arrivo si legge **dopo** aver
 * tolto il blocco: e la convenzione del trascinamento.
 */
export const moveBlock = (doc: Doc, blockId: string, target: BlockTarget): Doc => {
  const location = locateBlock(doc, blockId);
  if (!location) return doc;
  if (!findSection(doc, target.sectionId)?.columns.some((column) => column.id === target.columnId)) return doc;
  const without = removeBlock(doc, blockId);
  return insertBlock(without, target, location.block);
};

export const moveBlockBy = (doc: Doc, blockId: string, delta: -1 | 1): Doc => {
  const location = locateBlock(doc, blockId);
  if (!location) return doc;
  const to = location.blockIndex + delta;
  if (to < 0 || to >= location.column.blocks.length) return doc;
  return moveBlock(doc, blockId, { sectionId: location.section.id, columnId: location.column.id, index: to });
};

export const replaceBlock = (doc: Doc, blockId: string, fn: (block: WebsiteBlock) => WebsiteBlock): Doc => {
  const location = locateBlock(doc, blockId);
  if (!location) return doc;
  return mapColumn(doc, location.section.id, location.column.id, (blocks) =>
    blocks.map((block) => (block.id === blockId ? fn(block) : block)),
  );
};

export const updateBlockProps = (doc: Doc, blockId: string, patch: Record<string, unknown>): Doc =>
  replaceBlock(doc, blockId, (block) => ({ ...block, props: { ...block.props, ...patch } }));

/* --------------------------------------------------------- visibilita */

/**
 * Nasconde o mostra su un dispositivo, o su tutti (`device` assente).
 * «Nascosto su tutti» resta nel documento e nell'editor, ma non arriva al
 * sito pubblicato: e il modo di parcheggiare una sezione senza cancellarla.
 */
export const toggleVisibility = (hidden: DeviceVisibility | undefined, device?: WebsiteDevice): DeviceVisibility => {
  const current = { desktop: Boolean(hidden?.desktop), tablet: Boolean(hidden?.tablet), mobile: Boolean(hidden?.mobile) };
  if (device) return { ...current, [device]: !current[device] };
  const allHidden = current.desktop && current.tablet && current.mobile;
  return { desktop: !allHidden, tablet: !allHidden, mobile: !allHidden };
};

export const isHiddenEverywhere = (hidden: DeviceVisibility | undefined) =>
  Boolean(hidden?.desktop && hidden?.tablet && hidden?.mobile);

export const toggleBlockVisibility = (doc: Doc, blockId: string, device?: WebsiteDevice): Doc =>
  replaceBlock(doc, blockId, (block) => ({ ...block, hidden: toggleVisibility(block.hidden, device) }));

export const toggleSectionVisibility = (doc: Doc, sectionId: string, device?: WebsiteDevice): Doc => {
  const section = findSection(doc, sectionId);
  if (!section) return doc;
  return updateSection(doc, sectionId, { hidden: toggleVisibility(section.hidden, device) });
};

/* ---------------------------------------------------------------- stile */

/**
 * Scrive un token per un dispositivo. Desktop scrive la base; tablet e
 * mobile scrivono uno scostamento. Scrivere su tablet lo stesso valore che
 * tablet erediterebbe comunque non crea uno scostamento inutile.
 */
export const setResponsiveToken = <K extends keyof ResponsiveStyle>(
  style: ElementStyle | undefined,
  device: WebsiteDevice,
  key: K,
  value: ResponsiveStyle[K],
): ElementStyle => {
  const responsive: ResponsiveValue<ResponsiveStyle> = clone(style?.responsive || { base: {} });
  if (!responsive.base) responsive.base = {};
  if (device === "desktop") {
    responsive.base[key] = value;
  } else {
    const inherited =
      device === "tablet"
        ? responsive.base[key]
        : responsive.tablet?.[key] ?? responsive.base[key];
    const bucket = { ...(responsive[device] || {}) };
    if (inherited === value) delete bucket[key];
    else bucket[key] = value;
    if (Object.keys(bucket).length) responsive[device] = bucket;
    else delete responsive[device];
  }
  return { ...(style || {}), responsive };
};

/** «Ripristina»: toglie lo scostamento di un dispositivo, che torna a ereditare. */
export const resetResponsiveToken = (
  style: ElementStyle | undefined,
  device: Exclude<WebsiteDevice, "desktop">,
  key: keyof ResponsiveStyle,
): ElementStyle => {
  if (!style?.responsive?.[device]) return style || {};
  const responsive = clone(style.responsive);
  const bucket = { ...(responsive[device] || {}) };
  delete bucket[key];
  if (Object.keys(bucket).length) responsive[device] = bucket;
  else delete responsive[device];
  return { ...style, responsive };
};

/** Toglie tutti gli scostamenti di un dispositivo. */
export const resetDeviceOverrides = (style: ElementStyle | undefined, device: Exclude<WebsiteDevice, "desktop">): ElementStyle => {
  if (!style?.responsive) return style || {};
  const responsive = clone(style.responsive);
  delete responsive[device];
  return { ...style, responsive };
};

export const setStaticStyle = (style: ElementStyle | undefined, patch: ElementStyle["static"]): ElementStyle => ({
  ...(style || {}),
  static: { ...(style?.static || {}), ...(patch || {}) },
});

export const updateBlockStyle = (doc: Doc, blockId: string, fn: (style: ElementStyle | undefined) => ElementStyle): Doc =>
  replaceBlock(doc, blockId, (block) => ({ ...block, style: fn(block.style) }));

export const updateSectionStyle = (doc: Doc, sectionId: string, fn: (style: ElementStyle | undefined) => ElementStyle): Doc => {
  const section = findSection(doc, sectionId);
  if (!section) return doc;
  return updateSection(doc, sectionId, { style: fn(section.style) });
};

/* -------------------------------------------------------------- salvataggio */

/**
 * Il documento che il server ha appena confermato, fuso con cio che
 * l'operatore ha scritto **mentre** il salvataggio era in volo. Stessa idea di
 * `mergeSavedPage` in GPW: se il documento locale e cambiato dopo l'invio, si
 * tiene quello locale (che partira col prossimo salvataggio); altrimenti si
 * adotta quello del server, che puo averlo ripulito.
 */
export const mergeSavedDocument = (
  sent: Doc,
  local: Doc,
  saved: Doc,
): Doc => (JSON.stringify(sent) === JSON.stringify(local) ? saved : local);
