import { getBlockDefinition, isBlockAllowedOnPage, normalizeBlockProps, type PageKind } from "../registry";
import { sanitizeAnchor } from "../links";
import { normalizeMediaRef } from "../site-config";
import { newWebsiteId } from "../ids";
import {
  ALIGN_TOKENS,
  ANIMATION_TOKENS,
  BACKGROUND_KINDS,
  COLUMN_COUNTS,
  GUTTER_TOKENS,
  PAGE_DOCUMENT_SCHEMA_VERSION,
  RADIUS_OVERRIDE_TOKENS,
  SECTION_LAYOUTS,
  SECTION_LAYOUT_COLUMNS,
  SPACING_TOKENS,
  TEXT_SIZE_TOKENS,
  TONE_TOKENS,
  WIDTH_TOKENS,
  type DeviceVisibility,
  type ElementStyle,
  type ResponsiveStyle,
  type SectionLayout,
  type WebsiteBlock,
  type WebsitePageDocument,
  type WebsiteSection,
} from "./types";

/**
 * **La validazione del documento di una pagina** (ADR-0200 §3).
 *
 * Il server non salva cio che il browser manda: lo ricostruisce. Ogni sezione
 * e ogni blocco passano di qui; un tipo sconosciuto cade (e lo si dice), le
 * props passano dallo schema della definizione, i token di stile fuori
 * catalogo tornano assenti. Il risultato e un documento che il renderer sa
 * disegnare per costruzione.
 *
 * La sanificazione dell'HTML ricco non e qui perche la sua libreria vive sul
 * server: la applica `src/lib/server/website/document-sanitize.ts` dopo questa
 * funzione, sui campi che il registry dichiara `richtext`.
 *
 * Modulo puro.
 */

export const MAX_SECTIONS = 60;
export const MAX_BLOCKS_PER_COLUMN = 40;

export type DocumentIssue = {
  level: "error" | "warning";
  message: string;
  sectionId?: string;
  blockId?: string;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const oneOf = <T>(value: unknown, allowed: readonly T[]): T | undefined =>
  (allowed as readonly unknown[]).includes(value) ? (value as T) : undefined;

const normalizeResponsive = (raw: unknown): ResponsiveStyle => {
  const record = asRecord(raw);
  const out: ResponsiveStyle = {};
  const pt = oneOf(record.paddingTop, SPACING_TOKENS);
  const pb = oneOf(record.paddingBottom, SPACING_TOKENS);
  const px = oneOf(record.paddingX, GUTTER_TOKENS);
  const gap = oneOf(record.gap, GUTTER_TOKENS);
  const align = oneOf(record.align, ALIGN_TOKENS);
  const size = oneOf(record.textSize, TEXT_SIZE_TOKENS);
  const columns = oneOf(Number(record.columns), COLUMN_COUNTS);
  if (pt) out.paddingTop = pt;
  if (pb) out.paddingBottom = pb;
  if (px) out.paddingX = px;
  if (gap) out.gap = gap;
  if (align) out.align = align;
  if (size) out.textSize = size;
  if (columns) out.columns = columns;
  return out;
};

export const normalizeElementStyle = (raw: unknown): ElementStyle | undefined => {
  const record = asRecord(raw);
  if (!Object.keys(record).length) return undefined;
  const style: ElementStyle = {};
  const st = asRecord(record.static);
  const staticStyle: NonNullable<ElementStyle["static"]> = {};
  const background = oneOf(st.background, BACKGROUND_KINDS);
  if (background) staticStyle.background = background;
  const image = normalizeMediaRef(st.backgroundImage);
  if (image) staticStyle.backgroundImage = image;
  const overlay = Number(st.overlay);
  if (Number.isFinite(overlay)) staticStyle.overlay = Math.min(80, Math.max(0, Math.round(overlay)));
  const tone = oneOf(st.tone, TONE_TOKENS);
  if (tone) staticStyle.tone = tone;
  const width = oneOf(st.width, WIDTH_TOKENS);
  if (width) staticStyle.width = width;
  const radius = oneOf(st.radius, RADIUS_OVERRIDE_TOKENS);
  if (radius) staticStyle.radius = radius;
  const animation = oneOf(st.animation, ANIMATION_TOKENS);
  if (animation) staticStyle.animation = animation;
  if (Object.keys(staticStyle).length) style.static = staticStyle;

  const responsive = asRecord(record.responsive);
  if (Object.keys(responsive).length) {
    const base = normalizeResponsive(responsive.base);
    const tablet = normalizeResponsive(responsive.tablet);
    const mobile = normalizeResponsive(responsive.mobile);
    style.responsive = { base };
    if (Object.keys(tablet).length) style.responsive.tablet = tablet;
    if (Object.keys(mobile).length) style.responsive.mobile = mobile;
  }
  return Object.keys(style).length ? style : undefined;
};

const normalizeHidden = (raw: unknown): DeviceVisibility | undefined => {
  const record = asRecord(raw);
  const hidden: DeviceVisibility = {};
  for (const device of ["desktop", "tablet", "mobile"] as const) {
    if (record[device] === true) hidden[device] = true;
  }
  return Object.keys(hidden).length ? hidden : undefined;
};

export type NormalizeResult = { doc: WebsitePageDocument; issues: DocumentIssue[] };

/**
 * Ricostruisce un documento da cio che arriva. `kind` decide quali blocchi
 * sono ammessi: il contenuto di un articolo non ha senso nella home.
 */
export const normalizePageDocument = (raw: unknown, kind: PageKind = "standard"): NormalizeResult => {
  const issues: DocumentIssue[] = [];
  const record = asRecord(raw);
  const seen = new Set<string>();
  const uniqueId = (value: unknown) => {
    const candidate = typeof value === "string" ? value.trim().slice(0, 64) : "";
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
    const fresh = newWebsiteId();
    seen.add(fresh);
    return fresh;
  };

  const rawSections = Array.isArray(record.sections) ? record.sections : [];
  if (rawSections.length > MAX_SECTIONS) {
    issues.push({ level: "warning", message: `Una pagina ha al massimo ${MAX_SECTIONS} sezioni: le altre non sono state salvate` });
  }

  const sections: WebsiteSection[] = rawSections.slice(0, MAX_SECTIONS).map((rawSection: unknown) => {
    const s = asRecord(rawSection);
    const layout: SectionLayout = oneOf(s.layout, SECTION_LAYOUTS) || "one";
    const id = uniqueId(s.id);
    const rawColumns = Array.isArray(s.columns) ? s.columns : [];
    const count = SECTION_LAYOUT_COLUMNS[layout];
    const columns = Array.from({ length: count }, (_, index) => {
      const c = asRecord(rawColumns[index]);
      const rawBlocks = Array.isArray(c.blocks) ? c.blocks : [];
      const blocks: WebsiteBlock[] = [];
      for (const rawBlock of rawBlocks.slice(0, MAX_BLOCKS_PER_COLUMN)) {
        const b = asRecord(rawBlock);
        const type = typeof b.type === "string" ? b.type : "";
        const definition = getBlockDefinition(type);
        if (!definition) {
          issues.push({ level: "warning", message: `Un blocco di tipo sconosciuto («${type || "vuoto"}») e stato tolto`, sectionId: id });
          continue;
        }
        const blockId = uniqueId(b.id);
        if (!isBlockAllowedOnPage(type, kind)) {
          issues.push({ level: "warning", message: `«${definition.label}» non si usa in questo tipo di pagina ed e stato tolto`, sectionId: id, blockId });
          continue;
        }
        const props = normalizeBlockProps({ type, version: Number(b.version) || definition.version, props: asRecord(b.props) }) || {};
        const block: WebsiteBlock = { id: blockId, type, version: definition.version, props };
        const style = normalizeElementStyle(b.style);
        if (style) block.style = style;
        const hidden = normalizeHidden(b.hidden);
        if (hidden) block.hidden = hidden;
        blocks.push(block);
      }
      /* I blocchi delle colonne in piu (un layout ristretto da un client vecchio) non si perdono. */
      if (index === count - 1) {
        for (const extra of rawColumns.slice(count)) {
          const c2 = asRecord(extra);
          for (const rawBlock of Array.isArray(c2.blocks) ? c2.blocks : []) {
            const b = asRecord(rawBlock);
            const definition = getBlockDefinition(String(b.type || ""));
            if (!definition || !isBlockAllowedOnPage(definition.type, kind)) continue;
            blocks.push({
              id: uniqueId(b.id),
              type: definition.type,
              version: definition.version,
              props: normalizeBlockProps({ type: definition.type, version: Number(b.version) || 1, props: asRecord(b.props) }) || {},
            });
          }
        }
      }
      return { id: uniqueId(c.id), blocks };
    });

    const section: WebsiteSection = { id, layout, columns };
    const label = typeof s.label === "string" ? s.label.trim().slice(0, 80) : "";
    if (label) section.label = label;
    const anchor = sanitizeAnchor(s.anchor);
    if (anchor) section.anchor = anchor;
    const style = normalizeElementStyle(s.style);
    if (style) section.style = style;
    const hidden = normalizeHidden(s.hidden);
    if (hidden) section.hidden = hidden;
    const preset = typeof s.preset === "string" ? s.preset.slice(0, 60) : "";
    if (preset) section.preset = preset;
    return section;
  });

  return { doc: { schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION, sections }, issues };
};

export type MediaAltLookup = (mediaId: string) => string | null | undefined;

/**
 * I controlli che **bloccano la pubblicazione** di una pagina, piu le
 * avvertenze. Un'immagine senza testo alternativo e un errore: e il limite del
 * Website Builder GPW che EasyGame non ripete.
 */
export const checkDocumentForPublish = (doc: WebsitePageDocument, altOf: MediaAltLookup): DocumentIssue[] => {
  const issues: DocumentIssue[] = [];
  const anchors = new Set<string>();
  let h1 = 0;
  for (const section of doc.sections) {
    if (section.anchor) {
      if (anchors.has(section.anchor)) {
        issues.push({ level: "error", message: `Due sezioni hanno la stessa ancora «#${section.anchor}»`, sectionId: section.id });
      }
      anchors.add(section.anchor);
    }
    for (const column of section.columns) {
      for (const block of column.blocks) {
        const props = block.props as Record<string, any>;
        if (block.type === "heading" && props.level === "h1") h1 += 1;
        if (block.type === "image") {
          const ref = props.image;
          if (!ref?.mediaId) {
            issues.push({ level: "warning", message: "Un blocco immagine non ha ancora un'immagine", sectionId: section.id, blockId: block.id });
          } else if (!String(ref.alt || altOf(ref.mediaId) || "").trim()) {
            issues.push({ level: "error", message: "Un'immagine non ha il testo alternativo: scrivilo nel blocco o nella libreria", sectionId: section.id, blockId: block.id });
          }
        }
        if (block.type === "gallery" || block.type === "carousel" || block.type === "card-grid" || block.type === "logos") {
          const refs: any[] =
            block.type === "gallery"
              ? props.images || []
              : (props.items || props.slides || []).map((item: any) => item.image).filter(Boolean);
          const missing = refs.filter((ref) => ref?.mediaId && !String(ref.alt || altOf(ref.mediaId) || "").trim()).length;
          if (missing) {
            issues.push({ level: "warning", message: `${missing} immagini senza testo alternativo in «${getBlockDefinition(block.type)?.label}»`, sectionId: section.id, blockId: block.id });
          }
        }
      }
    }
  }
  if (h1 > 1) issues.push({ level: "warning", message: "La pagina ha piu di un titolo H1" });
  return issues;
};
