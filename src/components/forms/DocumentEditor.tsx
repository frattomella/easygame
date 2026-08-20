"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Maximize,
  Minimize,
  Plus,
  PenLine,
  Pilcrow,
  Tags,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";

export type DocumentTemplateToken = {
  label: string;
  value: string;
  group: string;
  description?: string;
};

type SignatureToken = {
  label: string;
  value: string;
};

interface DocumentEditorProps {
  initialContent?: string;
  onSave?: (content: string) => void;
  onCancel?: () => void;
  readOnly?: boolean;
  tokens?: DocumentTemplateToken[];
}

type ToolbarButtonProps = {
  disabled?: boolean;
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
};

export const DOCUMENT_TEMPLATE_TOKENS: DocumentTemplateToken[] = [
  { label: "Nome club", value: "{{club.name}}", group: "Club" },
  { label: "Indirizzo club", value: "{{club.address}}", group: "Club" },
  { label: "Citta club", value: "{{club.city}}", group: "Club" },
  { label: "Email club", value: "{{club.email}}", group: "Club" },
  { label: "Telefono club", value: "{{club.phone}}", group: "Club" },
  { label: "Codice fiscale club", value: "{{club.fiscal_code}}", group: "Club" },
  { label: "Partita IVA club", value: "{{club.vat_number}}", group: "Club" },
  { label: "Sito web club", value: "{{club.website}}", group: "Club" },
  { label: "Nome atleta", value: "{{athlete.first_name}}", group: "Atleta" },
  { label: "Cognome atleta", value: "{{athlete.last_name}}", group: "Atleta" },
  { label: "Data nascita atleta", value: "{{athlete.birth_date}}", group: "Atleta" },
  { label: "Categoria atleta", value: "{{athlete.category_name}}", group: "Atleta" },
  { label: "Codice fiscale atleta", value: "{{athlete.fiscal_code}}", group: "Atleta" },
  { label: "Indirizzo atleta", value: "{{athlete.address}}", group: "Atleta" },
  { label: "Email atleta", value: "{{athlete.email}}", group: "Atleta" },
  { label: "Telefono atleta", value: "{{athlete.phone}}", group: "Atleta" },
  { label: "Numero maglia", value: "{{athlete.jersey_number}}", group: "Atleta" },
  { label: "Nome genitore 1", value: "{{parent.1.first_name}}", group: "Genitori/Tutori" },
  { label: "Cognome genitore 1", value: "{{parent.1.last_name}}", group: "Genitori/Tutori" },
  { label: "Email genitore 1", value: "{{parent.1.email}}", group: "Genitori/Tutori" },
  { label: "Telefono genitore 1", value: "{{parent.1.phone}}", group: "Genitori/Tutori" },
  { label: "Nome genitore 2", value: "{{parent.2.first_name}}", group: "Genitori/Tutori" },
  { label: "Cognome genitore 2", value: "{{parent.2.last_name}}", group: "Genitori/Tutori" },
  { label: "Email genitore 2", value: "{{parent.2.email}}", group: "Genitori/Tutori" },
  { label: "Telefono genitore 2", value: "{{parent.2.phone}}", group: "Genitori/Tutori" },
  { label: "Tutore principale", value: "{{guardian.name}}", group: "Genitori/Tutori" },
  { label: "Nome staff", value: "{{staff.first_name}}", group: "Staff" },
  { label: "Cognome staff", value: "{{staff.last_name}}", group: "Staff" },
  { label: "Ruolo staff", value: "{{staff.role}}", group: "Staff" },
  { label: "Email staff", value: "{{staff.email}}", group: "Staff" },
  { label: "Telefono staff", value: "{{staff.phone}}", group: "Staff" },
  { label: "Nome allenatore", value: "{{trainer.first_name}}", group: "Allenatori" },
  { label: "Cognome allenatore", value: "{{trainer.last_name}}", group: "Allenatori" },
  { label: "Ruolo allenatore", value: "{{trainer.role}}", group: "Allenatori" },
  { label: "Email allenatore", value: "{{trainer.email}}", group: "Allenatori" },
  { label: "Telefono allenatore", value: "{{trainer.phone}}", group: "Allenatori" },
  { label: "Nome socio", value: "{{member.first_name}}", group: "Soci" },
  { label: "Cognome socio", value: "{{member.last_name}}", group: "Soci" },
  { label: "Email socio", value: "{{member.email}}", group: "Soci" },
  { label: "Telefono socio", value: "{{member.phone}}", group: "Soci" },
  { label: "Nome sponsor", value: "{{sponsor.name}}", group: "Sponsor/Fornitori" },
  { label: "Referente sponsor", value: "{{sponsor.contact_name}}", group: "Sponsor/Fornitori" },
  { label: "Email sponsor", value: "{{sponsor.email}}", group: "Sponsor/Fornitori" },
  { label: "Telefono sponsor", value: "{{sponsor.phone}}", group: "Sponsor/Fornitori" },
  { label: "Nome fornitore", value: "{{supplier.name}}", group: "Sponsor/Fornitori" },
  { label: "Categoria", value: "{{category.name}}", group: "Categorie e gruppi" },
  { label: "Squadra/gruppo", value: "{{team.name}}", group: "Categorie e gruppi" },
  { label: "Stato certificato", value: "{{medical_certificate.status}}", group: "Certificati" },
  { label: "Scadenza certificato", value: "{{medical_certificate.expiry_date}}", group: "Certificati" },
  { label: "Stato iscrizione", value: "{{registration.status}}", group: "Iscrizione/Pagamenti" },
  { label: "Piano pagamento", value: "{{payment.plan}}", group: "Iscrizione/Pagamenti" },
  { label: "Totale dovuto", value: "{{payment.total_due}}", group: "Iscrizione/Pagamenti" },
  { label: "Totale pagato", value: "{{payment.total_paid}}", group: "Iscrizione/Pagamenti" },
  { label: "Totale rimanente", value: "{{payment.remaining}}", group: "Iscrizione/Pagamenti" },
  { label: "Titolo documento", value: "{{document.title}}", group: "Documenti" },
  { label: "Data documento", value: "{{document.date}}", group: "Documenti" },
  { label: "Data corrente", value: "{{current_date}}", group: "Date e sistema" },
  { label: "Anno sportivo", value: "{{season.year}}", group: "Date e sistema" },
];

const SIGNATURE_TOKENS: SignatureToken[] = [
  { label: "Firma atleta", value: "{{signature.athlete}}" },
  { label: "Firma genitore", value: "{{signature.parent}}" },
  {
    label: "Firma presidente/club",
    value: "{{signature.club_representative}}",
  },
  { label: "Firma allenatore", value: "{{signature.trainer}}" },
];

const TEMPLATE_DRAG_MIME = "application/x-easygame-template-insert";
const EMPTY_DOCUMENT = "<h1>Documento</h1><p>Scrivi qui il contenuto.</p>";
const PLACEHOLDER_PATTERN = /{{\s*([^}]+?)\s*}}/g;
const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "HR",
  "I",
  "IMG",
  "LI",
  "OL",
  "P",
  "SPAN",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL",
]);
const ALLOWED_ATTRIBUTES = new Set([
  "alt",
  "class",
  "colspan",
  "data-signature-placeholder",
  "data-template-placeholder",
  "href",
  "rel",
  "rowspan",
  "src",
  "style",
  "target",
  "title",
]);
const ALLOWED_STYLE_PROPERTIES = new Set([
  "background-color",
  "border",
  "border-bottom",
  "border-color",
  "border-radius",
  "color",
  "display",
  "font-size",
  "font-weight",
  "height",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "padding",
  "text-align",
  "text-decoration",
  "width",
]);

const ToolbarButton = ({
  disabled = false,
  onClick,
  title,
  active = false,
  children,
}: ToolbarButtonProps) => (
  <Button
    type="button"
    variant={active ? "default" : "outline"}
    size="sm"
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    title={title}
    className="h-8 w-8 p-0"
  >
    {children}
  </Button>
);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizePlaceholderValue = (value: string) => {
  const key = value.replace(/[{}]/g, "").trim();
  return key ? `{{${key}}}` : "";
};

const ensureBaseContent = (value?: string) => {
  if (typeof value !== "string" || !value.trim()) {
    return EMPTY_DOCUMENT;
  }

  return value;
};

const sanitizeStyle = (styleValue: string) =>
  styleValue
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const [property, ...valueParts] = rule.split(":");
      const name = property?.trim().toLowerCase();
      const value = valueParts.join(":").trim();

      if (!name || !value || !ALLOWED_STYLE_PROPERTIES.has(name)) {
        return "";
      }

      if (/url\s*\(|expression\s*\(/i.test(value)) {
        return "";
      }

      return `${name}: ${value}`;
    })
    .filter(Boolean)
    .join("; ");

const sanitizeTemplateHtml = (html: string) => {
  if (typeof window === "undefined") {
    return ensureBaseContent(html);
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<div data-root="true">${ensureBaseContent(html)}</div>`,
    "text/html",
  );
  const root = document.querySelector("[data-root='true']");

  if (!root) {
    return EMPTY_DOCUMENT;
  }

  const sanitizeNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    Array.from(element.children).forEach(sanitizeNode);

    if (element.tagName === "SCRIPT" || element.tagName === "STYLE") {
      element.remove();
      return;
    }

    if (!ALLOWED_TAGS.has(element.tagName)) {
      const parent = element.parentNode;
      if (!parent) {
        element.remove();
        return;
      }

      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
      }
      element.remove();
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      if (name.startsWith("on") || !ALLOWED_ATTRIBUTES.has(name)) {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((name === "href" || name === "src") && /^javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (name === "style") {
        const cleanStyle = sanitizeStyle(value);
        if (cleanStyle) {
          element.setAttribute("style", cleanStyle);
        } else {
          element.removeAttribute("style");
        }
      }
    });

    if (element.tagName === "A") {
      element.setAttribute("rel", "noreferrer");
    }
  };

  Array.from(root.children).forEach(sanitizeNode);
  return root.innerHTML.trim() || EMPTY_DOCUMENT;
};

const buildTokenLookup = (
  tokens: DocumentTemplateToken[],
  signatures: SignatureToken[],
) => {
  const lookup = new Map<string, string>();

  tokens.forEach((token) => {
    lookup.set(normalizePlaceholderValue(token.value), token.label);
  });
  signatures.forEach((signature) => {
    lookup.set(normalizePlaceholderValue(signature.value), signature.label);
  });

  const legacyLabels: Record<string, string> = {
    "{{first_name}}": "Nome atleta",
    "{{last_name}}": "Cognome atleta",
    "{{birth_date}}": "Data nascita",
    "{{category}}": "Categoria",
    "{{fiscalCode}}": "Codice fiscale atleta",
    "{{guardian.name}}": "Genitore/Tutore",
  };

  Object.entries(legacyLabels).forEach(([value, label]) => {
    lookup.set(value, label);
  });

  return lookup;
};

const isSignaturePlaceholder = (value: string) =>
  normalizePlaceholderValue(value).startsWith("{{signature.");

const createPlaceholderNode = (
  document: Document,
  placeholder: string,
  label: string,
) => {
  const normalizedPlaceholder = normalizePlaceholderValue(placeholder);

  if (isSignaturePlaceholder(normalizedPlaceholder)) {
    const block = document.createElement("div");
    block.setAttribute("contenteditable", "false");
    block.setAttribute("data-signature-placeholder", normalizedPlaceholder);
    block.setAttribute(
      "style",
      "margin: 28px 0 18px; padding: 18px; border: 1px dashed #94a3b8; border-radius: 8px; color: #475569; background-color: #f8fafc;",
    );
    block.className = "easygame-signature-block";
    block.textContent = label;
    return block;
  }

  const chip = document.createElement("span");
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("data-template-placeholder", normalizedPlaceholder);
  chip.className = "easygame-token-chip";
  chip.textContent = label;
  return chip;
};

const convertPlaceholdersToVisualNodes = (
  html: string,
  tokenLookup: Map<string, string>,
) => {
  if (typeof window === "undefined") {
    return ensureBaseContent(html);
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<div data-root="true">${sanitizeTemplateHtml(html)}</div>`,
    "text/html",
  );
  const root = document.querySelector("[data-root='true']");

  if (!root) {
    return EMPTY_DOCUMENT;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const value = textNode.nodeValue || "";
    const matches = Array.from(value.matchAll(PLACEHOLDER_PATTERN));
    if (matches.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    matches.forEach((match) => {
      const matchIndex = match.index ?? 0;
      const rawPlaceholder = match[0];
      const normalizedPlaceholder = normalizePlaceholderValue(rawPlaceholder);
      const label =
        tokenLookup.get(normalizedPlaceholder) ||
        normalizedPlaceholder.replace(/[{}]/g, "");

      if (matchIndex > cursor) {
        fragment.appendChild(
          document.createTextNode(value.slice(cursor, matchIndex)),
        );
      }

      fragment.appendChild(
        createPlaceholderNode(document, normalizedPlaceholder, label),
      );
      fragment.appendChild(document.createTextNode(" "));
      cursor = matchIndex + rawPlaceholder.length;
    });

    if (cursor < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(cursor)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  });

  return root.innerHTML.trim() || EMPTY_DOCUMENT;
};

const serializeVisualDocument = (root: HTMLElement) => {
  const clone = root.cloneNode(true) as HTMLElement;
  const document = clone.ownerDocument;

  clone
    .querySelectorAll(".easygame-selected-image")
    .forEach((imageNode) => imageNode.classList.remove("easygame-selected-image"));

  clone
    .querySelectorAll("[data-template-placeholder]")
    .forEach((placeholderNode) => {
      const placeholder = placeholderNode.getAttribute("data-template-placeholder");
      placeholderNode.replaceWith(document.createTextNode(placeholder || ""));
    });

  clone
    .querySelectorAll("[data-signature-placeholder]")
    .forEach((signatureNode) => {
      const placeholder = signatureNode.getAttribute("data-signature-placeholder");
      signatureNode.replaceWith(document.createTextNode(placeholder || ""));
    });

  return sanitizeTemplateHtml(clone.innerHTML);
};

export default function DocumentEditor({
  initialContent = "",
  onSave,
  onCancel,
  readOnly = false,
  tokens = DOCUMENT_TEMPLATE_TOKENS,
}: DocumentEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const lastInitialContentRef = useRef<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [hasSelectedImage, setHasSelectedImage] = useState(false);

  const tokenLookup = useMemo(
    () => buildTokenLookup(tokens, SIGNATURE_TOKENS),
    [tokens],
  );
  const tokenLookupRef = useRef(tokenLookup);
  const tokensByGroup = useMemo(
    () =>
      tokens.reduce<Record<string, DocumentTemplateToken[]>>((groups, token) => {
        if (!groups[token.group]) {
          groups[token.group] = [];
        }

        groups[token.group].push(token);
        return groups;
      }, {}),
    [tokens],
  );

  const syncContentState = () => {
    const text = editorRef.current?.textContent || "";
    const imageCount = editorRef.current?.querySelectorAll("img").length || 0;
    setHasContent(Boolean(text.trim() || imageCount > 0));
  };

  const saveSelection = () => {
    if (readOnly || !editorRef.current) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();

    if (savedRangeRef.current) {
      selection.addRange(savedRangeRef.current);
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
  };

  const insertHtml = (html: string) => {
    if (readOnly) {
      return;
    }

    restoreSelection();
    document.execCommand("insertHTML", false, html);
    saveSelection();
    syncContentState();
  };

  const placeSelectionAtPoint = (clientX: number, clientY: number) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const docWithCaret = document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let range: Range | null = null;
    const caretPosition = docWithCaret.caretPositionFromPoint?.(
      clientX,
      clientY,
    );

    if (caretPosition) {
      range = document.createRange();
      range.setStart(caretPosition.offsetNode, caretPosition.offset);
      range.collapse(true);
    } else {
      range = docWithCaret.caretRangeFromPoint?.(clientX, clientY) || null;
    }

    if (!range || !editor.contains(range.commonAncestorContainer)) {
      return;
    }

    savedRangeRef.current = range.cloneRange();
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const executeCommand = (command: string, value?: string) => {
    if (readOnly) {
      return;
    }

    restoreSelection();
    document.execCommand(command, false, value);
    saveSelection();
    syncContentState();
  };

  const insertToken = (token: DocumentTemplateToken) => {
    insertHtml(
      `<span class="easygame-token-chip" contenteditable="false" data-template-placeholder="${escapeHtml(
        normalizePlaceholderValue(token.value),
      )}">${escapeHtml(token.label)}</span>&nbsp;`,
    );
  };

  const insertSignature = (signature: SignatureToken) => {
    insertHtml(
      `<div class="easygame-signature-block" contenteditable="false" data-signature-placeholder="${escapeHtml(
        normalizePlaceholderValue(signature.value),
      )}" style="margin: 28px 0 18px; padding: 18px; border: 1px dashed #94a3b8; border-radius: 8px; color: #475569; background-color: #f8fafc;">${escapeHtml(
        signature.label,
      )}</div><p><br></p>`,
    );
  };

  const insertImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) {
        return;
      }

      insertHtml(
        `<img src="${escapeHtml(dataUrl)}" alt="Immagine documento" style="display: block; max-width: 100%; height: auto; margin: 16px 0; border-radius: 6px;" />`,
      );
    };
    reader.readAsDataURL(file);
  };

  const insertPageBreak = () => {
    insertHtml(
      `<div class="easygame-page-break" contenteditable="false">Pagina successiva</div><p><br></p>`,
    );
  };

  const clearSelectedImage = () => {
    selectedImageRef.current?.classList.remove("easygame-selected-image");
    selectedImageRef.current = null;
    setHasSelectedImage(false);
  };

  const selectImage = (image: HTMLImageElement) => {
    clearSelectedImage();
    image.classList.add("easygame-selected-image");
    selectedImageRef.current = image;
    setHasSelectedImage(true);
  };

  const updateSelectedImage = (updates: Partial<CSSStyleDeclaration>) => {
    const image = selectedImageRef.current;
    if (!image) {
      return;
    }

    Object.entries(updates).forEach(([property, value]) => {
      if (typeof value === "string") {
        image.style[property as any] = value;
      }
    });
    image.style.display = "block";
    image.style.height = "auto";
    selectImage(image);
    syncContentState();
  };

  const removeSelectedImage = () => {
    selectedImageRef.current?.remove();
    selectedImageRef.current = null;
    setHasSelectedImage(false);
    syncContentState();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (readOnly) {
      return;
    }

    const imageFile = Array.from(event.dataTransfer.files || []).find((file) =>
      file.type.startsWith("image/"),
    );
    const droppedValue =
      event.dataTransfer.getData(TEMPLATE_DRAG_MIME) ||
      event.dataTransfer.getData("text/plain");

    if (!imageFile && !droppedValue) {
      return;
    }

    event.preventDefault();
    placeSelectionAtPoint(event.clientX, event.clientY);

    if (imageFile) {
      insertImageFile(imageFile);
      return;
    }

    const signature = SIGNATURE_TOKENS.find(
      (item) => item.value === droppedValue,
    );
    if (signature) {
      insertSignature(signature);
      return;
    }

    const token = tokens.find((item) => item.value === droppedValue);
    if (token) {
      insertToken(token);
    }
  };

  const handleSave = () => {
    if (!onSave || !editorRef.current) {
      return;
    }

    onSave(serializeVisualDocument(editorRef.current));
  };

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;

    if (target instanceof HTMLImageElement) {
      selectImage(target);
      return;
    }

    clearSelectedImage();
  };

  useEffect(() => {
    tokenLookupRef.current = tokenLookup;
  }, [tokenLookup]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if (lastInitialContentRef.current === initialContent) {
      syncContentState();
      return;
    }

    lastInitialContentRef.current = initialContent;
    clearSelectedImage();
    editorRef.current.innerHTML = convertPlaceholdersToVisualNodes(
      ensureBaseContent(initialContent),
      tokenLookupRef.current,
    );
    syncContentState();
  }, [initialContent]);

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 overflow-auto bg-slate-950/20 p-4 backdrop-blur-sm"
          : ""
      }
    >
      <Card
        className={cn(
          "w-full overflow-hidden border-slate-200 shadow-sm",
          isFullscreen && "mx-auto max-w-7xl",
        )}
      >
        <CardHeader className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Editor documento</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <ToolbarButton
                title="Titolo 1"
                disabled={readOnly}
                onClick={() => executeCommand("formatBlock", "h1")}
              >
                <Heading1 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Titolo 2"
                disabled={readOnly}
                onClick={() => executeCommand("formatBlock", "h2")}
              >
                <Heading2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Paragrafo"
                disabled={readOnly}
                onClick={() => executeCommand("formatBlock", "p")}
              >
                <Pilcrow className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Grassetto"
                disabled={readOnly}
                onClick={() => executeCommand("bold")}
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Corsivo"
                disabled={readOnly}
                onClick={() => executeCommand("italic")}
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Sottolineato"
                disabled={readOnly}
                onClick={() => executeCommand("underline")}
              >
                <UnderlineIcon className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Elenco puntato"
                disabled={readOnly}
                onClick={() => executeCommand("insertUnorderedList")}
              >
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Elenco numerato"
                disabled={readOnly}
                onClick={() => executeCommand("insertOrderedList")}
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Allinea a sinistra"
                disabled={readOnly}
                onClick={() => executeCommand("justifyLeft")}
              >
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Centra"
                disabled={readOnly}
                onClick={() => executeCommand("justifyCenter")}
              >
                <AlignCenter className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Allinea a destra"
                disabled={readOnly}
                onClick={() => executeCommand("justifyRight")}
              >
                <AlignRight className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Inserisci immagine"
                disabled={readOnly}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                title="Aggiungi pagina"
                disabled={readOnly}
                onClick={insertPageBreak}
              >
                <Plus className="h-4 w-4" />
              </ToolbarButton>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsFullscreen((current) => !current)}
              >
                {isFullscreen ? (
                  <Minimize className="mr-2 h-4 w-4" />
                ) : (
                  <Maximize className="mr-2 h-4 w-4" />
                )}
                {isFullscreen ? "Riduci" : "Schermo intero"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid min-h-[680px] lg:grid-cols-[280px_minmax(0,1fr)]">
            {!readOnly ? (
              <aside className="border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Tags className="h-4 w-4 text-blue-600" />
                  Campi dinamici
                </div>
                <div className="space-y-4">
                  {Object.entries(tokensByGroup).map(([group, groupTokens]) => (
                    <div key={group} className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        {group}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {groupTokens.map((token) => (
                          <button
                            key={token.value}
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                TEMPLATE_DRAG_MIME,
                                token.value,
                              );
                              event.dataTransfer.setData(
                                "text/plain",
                                token.value,
                              );
                            }}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertToken(token)}
                            className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                          >
                            {token.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-2 border-t border-slate-200 pt-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Firme
                  </p>
                  {SIGNATURE_TOKENS.map((signature) => (
                    <button
                      key={signature.value}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          TEMPLATE_DRAG_MIME,
                          signature.value,
                        );
                        event.dataTransfer.setData("text/plain", signature.value);
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertSignature(signature)}
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      <PenLine className="h-4 w-4 text-slate-500" />
                      {signature.label}
                    </button>
                  ))}
                </div>

                {hasSelectedImage ? (
                  <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Immagine selezionata
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedImage({
                            width: "35%",
                            maxWidth: "35%",
                          })
                        }
                      >
                        S
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedImage({
                            width: "60%",
                            maxWidth: "60%",
                          })
                        }
                      >
                        M
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedImage({
                            width: "100%",
                            maxWidth: "100%",
                          })
                        }
                      >
                        L
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedImage({
                            marginLeft: "0",
                            marginRight: "auto",
                          })
                        }
                      >
                        Sx
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedImage({
                            marginLeft: "auto",
                            marginRight: "auto",
                          })
                        }
                      >
                        C
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedImage({
                            marginLeft: "auto",
                            marginRight: "0",
                          })
                        }
                      >
                        Dx
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-red-600 hover:text-red-700"
                      onClick={removeSelectedImage}
                    >
                      Rimuovi immagine
                    </Button>
                  </div>
                ) : null}
              </aside>
            ) : null}

            <section className="bg-slate-100 p-4 md:p-8">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    insertImageFile(file);
                  }
                  event.target.value = "";
                }}
              />
              <div className="mx-auto max-w-[860px]">
                <div
                  ref={editorRef}
                  contentEditable={!readOnly}
                  suppressContentEditableWarning
                  onInput={syncContentState}
                  onKeyUp={saveSelection}
                  onMouseUp={saveSelection}
                  onClick={handleEditorClick}
                  onBlur={saveSelection}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  className={cn(
                    "easygame-document-page min-h-[1120px] w-full max-w-[794px] rounded-sm bg-white px-10 py-12 text-[15px] leading-7 text-slate-800 shadow-sm outline-none md:px-16",
                    !readOnly &&
                      "ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500",
                  )}
                />
              </div>
            </section>
          </div>

          {!readOnly ? (
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                I campi dinamici restano salvati nel template e vengono compilati solo in fase di compilazione/export.
              </p>
              <div className="flex flex-wrap gap-2">
                {onCancel ? (
                  <Button type="button" variant="outline" onClick={onCancel}>
                    <X className="mr-2 h-4 w-4" />
                    Annulla
                  </Button>
                ) : null}
                <Button type="button" onClick={handleSave} disabled={!hasContent}>
                  <Check className="mr-2 h-4 w-4" />
                  Salva
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <style jsx global>{`
        .easygame-document-page h1 {
          color: #0f172a;
          font-size: 30px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 18px;
        }
        .easygame-document-page h2 {
          color: #1e293b;
          font-size: 22px;
          font-weight: 700;
          line-height: 1.3;
          margin: 24px 0 12px;
        }
        .easygame-document-page h3 {
          color: #334155;
          font-size: 18px;
          font-weight: 700;
          margin: 20px 0 10px;
        }
        .easygame-document-page p {
          margin: 0 0 12px;
        }
        .easygame-document-page ul,
        .easygame-document-page ol {
          margin: 0 0 14px 24px;
          padding: 0;
        }
        .easygame-document-page li {
          margin: 4px 0;
        }
        .easygame-document-page img {
          display: block;
          max-width: 100%;
          cursor: pointer;
          resize: both;
        }
        .easygame-selected-image {
          outline: 3px solid #2563eb;
          outline-offset: 4px;
        }
        .easygame-page-break {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 36px;
          margin: 36px -64px;
          border-top: 1px dashed #94a3b8;
          border-bottom: 1px dashed #94a3b8;
          background: #f1f5f9;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          page-break-before: always;
          break-before: page;
          user-select: none;
        }
        .easygame-token-chip {
          display: inline-flex;
          align-items: center;
          border: 1px solid #bfdbfe;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          margin: 0 2px;
          padding: 4px 8px;
          white-space: nowrap;
        }
        .easygame-signature-block {
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
