/**
 * Le estensioni dell'editor di testo formattato (ADR-0190 §2): lo schema
 * chiuso di ProseMirror, con quattro cose che TipTap non porta di serie.
 *
 * - `FontSize`: una scala chiusa di dimensioni, come stile sul testo;
 * - `BlockSpacing`: interlinea e spazio sotto il paragrafo, scale chiuse,
 *   sui paragrafi e sui titoli;
 * - `PageBreak`: l'interruzione di pagina come **nodo**, non come a capo
 *   casuale: `<div class="easygame-page-break">`, la classe che il CSS di
 *   stampa conosce;
 * - `PlaceholderToken`: il segnaposto `{{athlete.firstName}}` come nodo
 *   **inline atomico**: non si spezza, non si edita dentro, si seleziona e si
 *   cancella come un carattere, e in HTML esce `<span class="egw-placeholder"
 *   data-token="…">{{…}}</span>`, che la risoluzione dei segnaposto legge come
 *   testo.
 * - `ResizableImage`: l'immagine con larghezza e allineamento, che i byte
 *   li tiene negli allegati (mai `data:`).
 */

import { Extension, Node, mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { PAGE_BREAK_CLASS, PLACEHOLDER_CLASS } from "@/lib/rich-text/sanitize";

/** La scala delle dimensioni del carattere, in px: leggibile, non un word processor. */
export const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32] as const;
/** L'interlinea. */
export const LINE_HEIGHTS = ["1", "1.15", "1.3", "1.5", "1.7", "2"] as const;
/** Lo spazio sotto un paragrafo, in px. */
export const PARAGRAPH_SPACINGS = [0, 4, 8, 12, 16, 24] as const;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: number | null) => ReturnType;
    };
    blockSpacing: {
      setLineHeight: (value: string | null) => ReturnType;
      setParagraphSpacing: (px: number | null) => ReturnType;
    };
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
    placeholderToken: {
      insertPlaceholder: (token: string, label?: string) => ReturnType;
    };
    resizableImage: {
      setImageWidth: (width: string | null) => ReturnType;
      setImageAlign: (align: "left" | "center" | "right" | null) => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => {
              const raw = String(element.style.fontSize || "").replace("px", "");
              const n = Number(raw);
              return FONT_SIZES.includes(n as (typeof FONT_SIZES)[number]) ? n : null;
            },
            renderHTML: (attributes) =>
              attributes.fontSize ? { style: `font-size: ${attributes.fontSize}px` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          size
            ? chain().setMark("textStyle", { fontSize: size }).run()
            : chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const BlockSpacing = Extension.create({
  name: "blockSpacing",
  addOptions() {
    return { types: ["paragraph", "heading"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => {
              const value = String(element.style.lineHeight || "");
              return LINE_HEIGHTS.includes(value as (typeof LINE_HEIGHTS)[number]) ? value : null;
            },
            renderHTML: (attributes) =>
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
          },
          spacingBelow: {
            default: null,
            parseHTML: (element) => {
              const raw = String(element.style.marginBottom || "").replace("px", "");
              const n = Number(raw);
              return raw !== "" && PARAGRAPH_SPACINGS.includes(n as (typeof PARAGRAPH_SPACINGS)[number]) ? n : null;
            },
            renderHTML: (attributes) =>
              attributes.spacingBelow !== null && attributes.spacingBelow !== undefined
                ? { style: `margin-bottom: ${attributes.spacingBelow}px` }
                : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        (value) =>
        ({ commands }) =>
          this.options.types.every((type: string) => commands.updateAttributes(type, { lineHeight: value })),
      setParagraphSpacing:
        (px) =>
        ({ commands }) =>
          this.options.types.every((type: string) => commands.updateAttributes(type, { spacingBelow: px })),
    };
  },
});

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: `div.${PAGE_BREAK_CLASS}` }];
  },
  renderHTML() {
    return ["div", { class: PAGE_BREAK_CLASS, "data-type": "page-break" }];
  },
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).insertContent({ type: "paragraph" }).run(),
    };
  },
});

export const PlaceholderToken = Node.create({
  name: "placeholderToken",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      token: { default: "" },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: `span.${PLACEHOLDER_CLASS}`,
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const token = el.getAttribute("data-token") || el.textContent?.replace(/[{}]/g, "").trim() || "";
          return token ? { token, label: el.getAttribute("title") || "" } : false;
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "span",
      mergeAttributes({
        class: PLACEHOLDER_CLASS,
        "data-token": node.attrs.token,
        "data-type": "placeholder",
        title: node.attrs.label || node.attrs.token,
        contenteditable: "false",
      }),
      `{{${node.attrs.token}}}`,
    ];
  },
  renderText({ node }) {
    return `{{${node.attrs.token}}}`;
  },
  addCommands() {
    return {
      insertPlaceholder:
        (token, label = "") =>
        ({ chain }) =>
          chain()
            .insertContent([{ type: this.name, attrs: { token, label } }, { type: "text", text: " " }])
            .run(),
    };
  },
});

export const ResizableImage = Image.extend({
  inline: false,
  allowBase64: false,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const style = String((element as HTMLElement).style.width || "");
          const attr = element.getAttribute("width");
          return style || (attr ? `${attr}px` : null);
        },
        renderHTML: (attributes) => (attributes.width ? { style: `width: ${attributes.width}; height: auto` } : {}),
      },
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-align"),
        renderHTML: (attributes) => {
          if (!attributes.align) return {};
          const style =
            attributes.align === "center"
              ? "display: block; margin: 0 auto"
              : attributes.align === "right"
                ? "float: right; margin: 0 0 8px 12px"
                : "float: left; margin: 0 12px 8px 0";
          return { "data-align": attributes.align, style };
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    /* Due `style` (larghezza e allineamento) si fondono in uno. */
    const merged = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    return ["img", merged];
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setImageWidth:
        (width) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { width }),
      setImageAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { align }),
    };
  },
});
