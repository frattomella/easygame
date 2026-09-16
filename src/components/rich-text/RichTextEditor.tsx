"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  Rows3,
  Scissors,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { sanitizeRichHtml } from "@/lib/rich-text/sanitize";
import { cn } from "@/lib/utils";
import {
  BlockSpacing,
  FONT_SIZES,
  FontSize,
  LINE_HEIGHTS,
  PARAGRAPH_SPACINGS,
  PageBreak,
  PlaceholderToken,
  ResizableImage,
} from "./extensions";

/**
 * **L'editor di testo formattato, uno solo** (ADR-0190 §2): il blocco di
 * contenuto dei moduli e il corpo dei modelli di documento passano di qui.
 *
 * ProseMirror (TipTap) con schema chiuso: paragrafo, titoli 1–3, grassetto,
 * corsivo, sottolineato, dimensione del carattere (scala chiusa),
 * allineamento, interlinea e spazio fra paragrafi, elenchi, link, tabelle,
 * immagini (allegati, ridimensionabili, allineabili), interruzione di pagina,
 * segnaposto inline atomici, annulla/ripeti.
 *
 * L'HTML che esce passa da `sanitizeRichHtml` **anche qui**; il server lo
 * ripassa prima di salvare. Le immagini arrivano da `onUploadImage`, che
 * restituisce l'URL dell'allegato: niente `data:` nel documento.
 */

export type PlaceholderOption = { token: string; label: string; group?: string };

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  /** I segnaposto disponibili; senza, il pulsante non compare. */
  placeholders?: PlaceholderOption[];
  /** Carica un'immagine e restituisce l'URL dell'allegato; senza, niente immagini. */
  onUploadImage?: (file: File) => Promise<string>;
  /** Interruzioni di pagina: hanno senso in un documento, non in un modulo web. */
  allowPageBreaks?: boolean;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  id?: string;
  "aria-label"?: string;
};

const IconButton = ({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={cn(
      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-egw-micro border text-egw-ink transition-colors focus-visible:outline-none focus-visible:shadow-egw-focus disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4",
      active ? "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800" : "border-transparent hover:bg-egw-page-100",
    )}
  >
    {children}
  </button>
);

const ToolbarSelect = ({
  label,
  value,
  onChange,
  children,
  width = "w-[112px]",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  width?: string;
}) => (
  <select
    aria-label={label}
    title={label}
    value={value}
    onMouseDown={(event) => event.stopPropagation()}
    onChange={(event) => onChange(event.target.value)}
    className={cn("h-8 shrink-0 rounded-egw-micro border border-egw-hairline bg-white px-2 text-[12px] text-egw-ink focus-visible:outline-none focus-visible:shadow-egw-focus", width)}
  >
    {children}
  </select>
);

const Divider = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-egw-hairline" />;

const isAllowedHref = (href: string) => /^(https?:\/\/|mailto:)/i.test(href.trim());

export function RichTextEditor({
  value,
  onChange,
  placeholders = [],
  onUploadImage,
  allowPageBreaks = false,
  placeholder = "Scrivi qui…",
  minHeight = 180,
  className,
  id,
  "aria-label": ariaLabel,
}: RichTextEditorProps) {
  const fileInput = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const lastEmitted = React.useRef<string>(value);

  const extensions = React.useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        code: false,
      }),
      Underline,
      Placeholder.configure({ placeholder, emptyEditorClass: "is-editor-empty" }),
      TextStyle,
      FontSize,
      BlockSpacing,
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        shouldAutoLink: (href) => isAllowedHref(href),
        isAllowedUri: (href) => isAllowedHref(href),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ResizableImage,
      PlaceholderToken,
      ...(allowPageBreaks ? [PageBreak] : []),
    ],
    [allowPageBreaks, placeholder],
  );
  const initialContent = React.useRef(sanitizeRichHtml(value) || "<p></p>");

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContent.current,
    editorProps: {
      attributes: {
        class: "egw-rich-content egw-rich-editor focus:outline-none",
        style: `min-height: ${minHeight}px`,
        ...(id ? { id } : {}),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        "data-placeholder": placeholder,
      },
      /* Un incolla porta HTML di ogni provenienza: lo schema lo riduce, la sanificazione lo ripulisce. */
      transformPastedHTML: (html) => sanitizeRichHtml(html),
    },
    onUpdate: ({ editor: current }) => {
      const html = sanitizeRichHtml(current.getHTML());
      const normalized = html === "<p></p>" ? "" : html;
      lastEmitted.current = normalized;
      onChange(normalized);
    },
  });

  /* Un valore che cambia da fuori (un ripristino, un cambio di campo) rientra nell'editor. */
  React.useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(sanitizeRichHtml(value) || "<p></p>", false);
  }, [editor, value]);


  if (!editor) {
    return <div className={cn("rounded-egw-control border border-egw-hairline bg-white", className)} style={{ minHeight }} />;
  }

  const blockValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";
  const fontSize = String(editor.getAttributes("textStyle").fontSize || "");
  const lineHeight = String(editor.getAttributes("paragraph").lineHeight || editor.getAttributes("heading").lineHeight || "");
  const spacing = editor.getAttributes("paragraph").spacingBelow ?? editor.getAttributes("heading").spacingBelow;
  const inTable = editor.isActive("table");
  const onImage = editor.isActive("image");

  const setLink = () => {
    const current = String(editor.getAttributes("link").href || "");
    const href = window.prompt("Indirizzo del link (https://… o mailto:…)", current || "https://");
    if (href === null) return;
    const trimmed = href.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!isAllowedHref(trimmed)) {
      window.alert("Sono ammessi solo link https://, http:// e mailto:.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  };

  const pickImage = () => fileInput.current?.click();

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadImage) return;
    setUploading(true);
    try {
      const src = await onUploadImage(file);
      const alt = window.prompt("Testo alternativo dell'immagine (per chi non la vede)", file.name.replace(/\.[a-z0-9]+$/i, "")) || "";
      editor.chain().focus().setImage({ src, alt }).run();
      editor.commands.setImageWidth("60%");
    } finally {
      setUploading(false);
    }
  };

  const currentWidth = String(editor.getAttributes("image").width || "");

  return (
    <div className={cn("rounded-egw-control border border-egw-hairline bg-white focus-within:border-egw-blue focus-within:shadow-egw-focus", className)} data-test="rich-text-editor">
      <div
        role="toolbar"
        aria-label="Formattazione"
        className="egw-scroll flex flex-wrap items-center gap-1 border-b border-egw-hairline p-2"
        onKeyDown={(event) => {
          /* Frecce fra i comandi, un solo tab stop: la barra non costa 25 tab per arrivare al testo. */
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          const controlli = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), select"));
          const indice = controlli.indexOf(document.activeElement as HTMLElement);
          if (indice < 0) return;
          event.preventDefault();
          const prossimo = controlli[(indice + (event.key === "ArrowRight" ? 1 : -1) + controlli.length) % controlli.length];
          prossimo?.focus();
        }}
      >
        <ToolbarSelect
          label="Stile del blocco"
          value={blockValue}
          onChange={(next) => {
            const chain = editor.chain().focus();
            if (next === "p") chain.setParagraph().run();
            else chain.toggleHeading({ level: Number(next.slice(1)) as 1 | 2 | 3 }).run();
          }}
          width="w-[118px]"
        >
          <option value="p">Paragrafo</option>
          <option value="h1">Titolo 1</option>
          <option value="h2">Titolo 2</option>
          <option value="h3">Titolo 3</option>
        </ToolbarSelect>
        <ToolbarSelect
          label="Dimensione del carattere"
          value={fontSize}
          onChange={(next) => editor.chain().focus().setFontSize(next ? Number(next) : null).run()}
          width="w-[84px]"
        >
          <option value="">Auto</option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={String(size)}>
              {size} px
            </option>
          ))}
        </ToolbarSelect>
        <ToolbarSelect
          label="Interlinea"
          value={lineHeight}
          onChange={(next) => editor.chain().focus().setLineHeight(next || null).run()}
          width="w-[92px]"
        >
          <option value="">Interl.</option>
          {LINE_HEIGHTS.map((lh) => (
            <option key={lh} value={lh}>
              {lh}
            </option>
          ))}
        </ToolbarSelect>
        <ToolbarSelect
          label="Spazio sotto il paragrafo"
          value={spacing === null || spacing === undefined ? "" : String(spacing)}
          onChange={(next) => editor.chain().focus().setParagraphSpacing(next === "" ? null : Number(next)).run()}
          width="w-[96px]"
        >
          <option value="">Spazio</option>
          {PARAGRAPH_SPACINGS.map((px) => (
            <option key={px} value={String(px)}>
              {px} px
            </option>
          ))}
        </ToolbarSelect>
        <Divider />
        <IconButton label="Grassetto" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold />
        </IconButton>
        <IconButton label="Corsivo" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic />
        </IconButton>
        <IconButton label="Sottolineato" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon />
        </IconButton>
        <Divider />
        <IconButton label="Allinea a sinistra" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft />
        </IconButton>
        <IconButton label="Centra" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter />
        </IconButton>
        <IconButton label="Allinea a destra" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight />
        </IconButton>
        <IconButton label="Giustifica" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify />
        </IconButton>
        <Divider />
        <IconButton label="Elenco puntato" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List />
        </IconButton>
        <IconButton label="Elenco numerato" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered />
        </IconButton>
        <IconButton label="Link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 />
        </IconButton>
        <Divider />
        <IconButton label="Inserisci tabella" onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}>
          <Table2 />
        </IconButton>
        {inTable ? (
          <>
            <IconButton label="Aggiungi riga sotto" onClick={() => editor.chain().focus().addRowAfter().run()}>
              <Rows3 />
            </IconButton>
            <IconButton label="Aggiungi colonna a destra" onClick={() => editor.chain().focus().addColumnAfter().run()}>
              <Columns3 />
            </IconButton>
            <IconButton label="Togli riga" onClick={() => editor.chain().focus().deleteRow().run()}>
              <span className="text-[10px] font-bold">−R</span>
            </IconButton>
            <IconButton label="Togli colonna" onClick={() => editor.chain().focus().deleteColumn().run()}>
              <span className="text-[10px] font-bold">−C</span>
            </IconButton>
            <IconButton label="Riga di intestazione" active={editor.isActive("tableHeader")} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
              <Pilcrow />
            </IconButton>
            <IconButton label="Elimina tabella" onClick={() => editor.chain().focus().deleteTable().run()}>
              <Trash2 />
            </IconButton>
          </>
        ) : null}
        {onUploadImage ? (
          <>
            <IconButton label="Inserisci immagine" disabled={uploading} onClick={pickImage}>
              <ImagePlus />
            </IconButton>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
          </>
        ) : null}
        {onImage ? (
          <>
            <ToolbarSelect
              label="Larghezza dell'immagine"
              value={currentWidth}
              onChange={(next) => editor.chain().focus().setImageWidth(next || null).run()}
              width="w-[92px]"
            >
              <option value="">Originale</option>
              {["25%", "33%", "50%", "60%", "75%", "100%"].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </ToolbarSelect>
            <ToolbarSelect
              label="Allineamento dell'immagine"
              value={String(editor.getAttributes("image").align || "")}
              onChange={(next) => editor.chain().focus().setImageAlign((next || null) as "left" | "center" | "right" | null).run()}
              width="w-[96px]"
            >
              <option value="">In riga</option>
              <option value="left">Sinistra</option>
              <option value="center">Centro</option>
              <option value="right">Destra</option>
            </ToolbarSelect>
            <IconButton label="Togli immagine" onClick={() => editor.chain().focus().deleteSelection().run()}>
              <Trash2 />
            </IconButton>
          </>
        ) : null}
        {allowPageBreaks ? (
          <IconButton label="Interruzione di pagina" onClick={() => editor.chain().focus().insertPageBreak().run()}>
            <Scissors />
          </IconButton>
        ) : null}
        {placeholders.length ? (
          <ToolbarSelect
            label="Inserisci un campo dinamico"
            value=""
            onChange={(token) => {
              if (!token) return;
              const option = placeholders.find((p) => p.token === token);
              editor.chain().focus().insertPlaceholder(token, option?.label || "").run();
            }}
            width="w-[150px]"
          >
            <option value="">{"{ } Campo dinamico"}</option>
            {placeholders.map((option) => (
              <option key={option.token} value={option.token}>
                {option.group ? `${option.group} · ` : ""}
                {option.label}
              </option>
            ))}
          </ToolbarSelect>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          <IconButton label="Annulla" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 />
          </IconButton>
          <IconButton label="Ripeti" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 />
          </IconButton>
        </span>
      </div>
      <div className="p-4">
        <EditorContent editor={editor} />
      </div>
      {placeholders.length ? (
        <p className="border-t border-egw-hairline px-4 py-2 text-[11px] text-egw-ink-62">
          <Braces className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden />I campi dinamici sono blocchi in riga: si selezionano e si cancellano come un carattere, e in anteprima diventano il dato.
        </p>
      ) : null}
    </div>
  );
}

export type { Editor };
