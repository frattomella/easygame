"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eye,
  EyeOff,
  GripVertical,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize,
  Minimize,
  Pilcrow,
  PenLine,
  Quote,
  Tags,
  Underline as UnderlineIcon,
} from "lucide-react";

export type DocumentTemplateToken = {
  label: string;
  value: string;
  group: "Atleta" | "Certificati" | "Club" | "Famiglia" | "Data";
};

export const DOCUMENT_TEMPLATE_TOKENS: DocumentTemplateToken[] = [
  { label: "Nome atleta", value: "{{athlete.first_name}}", group: "Atleta" },
  { label: "Cognome atleta", value: "{{athlete.last_name}}", group: "Atleta" },
  {
    label: "Data di nascita",
    value: "{{athlete.birth_date}}",
    group: "Atleta",
  },
  { label: "Categoria", value: "{{athlete.category}}", group: "Atleta" },
  {
    label: "Certificato medico",
    value: "{{medical_certificate.expiry_date}}",
    group: "Certificati",
  },
  { label: "Club", value: "{{club.name}}", group: "Club" },
  { label: "Data corrente", value: "{{current_date}}", group: "Data" },
  {
    label: "Genitore/Tutore",
    value: "{{guardian.name}}",
    group: "Famiglia",
  },
];

interface DocumentEditorProps {
  initialContent?: string;
  onSave?: (content: string) => void;
  readOnly?: boolean;
  tokens?: DocumentTemplateToken[];
}

type ToolbarButtonProps = {
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
};

const ToolbarButton = ({
  disabled = false,
  onClick,
  title,
  children,
}: ToolbarButtonProps) => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    disabled={disabled}
    onClick={onClick}
    title={title}
    className="h-8 min-w-8 px-2 text-slate-600"
  >
    {children}
  </Button>
);

const ensureBaseContent = (value?: string) => {
  if (typeof value !== "string" || !value.trim()) {
    return "<p></p>";
  }

  return value;
};

const TEMPLATE_DRAG_MIME = "application/x-easygame-template-insert";

const SIGNATURE_BLOCK =
  '<div style="margin-top: 32px;"><p style="margin-bottom: 24px;">Firma</p><div style="width: 260px; border-bottom: 1px solid #111827;"></div></div>';

const IMAGE_PLACEHOLDER_BLOCK =
  '<div style="margin: 20px 0; padding: 24px; border: 1px dashed #94a3b8; text-align: center; color: #64748b;">{{image.placeholder}}</div>';

export default function DocumentEditor({
  initialContent = "",
  onSave,
  readOnly = false,
  tokens = DOCUMENT_TEMPLATE_TOKENS,
}: DocumentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [content, setContent] = useState(ensureBaseContent(initialContent));

  useEffect(() => {
    setContent(ensureBaseContent(initialContent));
  }, [initialContent]);

  const previewHtml = useMemo(() => ensureBaseContent(content), [content]);
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

  const insertTextAtSelection = (value: string) => {
    if (readOnly || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    const selectionStart = textarea.selectionStart ?? content.length;
    const selectionEnd = textarea.selectionEnd ?? content.length;
    const nextValue =
      content.slice(0, selectionStart) + value + content.slice(selectionEnd);

    setContent(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPosition = selectionStart + value.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  const applyInsertion = (
    before: string,
    after = "",
    placeholder = "Testo",
  ) => {
    if (readOnly || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    const selectionStart = textarea.selectionStart ?? content.length;
    const selectionEnd = textarea.selectionEnd ?? content.length;
    const selectedText =
      content.slice(selectionStart, selectionEnd) || placeholder;

    const nextValue =
      content.slice(0, selectionStart) +
      before +
      selectedText +
      after +
      content.slice(selectionEnd);

    setContent(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPosition =
        selectionStart + before.length + selectedText.length + after.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  const handleDragStart = (
    event: React.DragEvent,
    value: string,
  ) => {
    event.dataTransfer.setData(TEMPLATE_DRAG_MIME, value);
    event.dataTransfer.setData("text/plain", value);
    event.dataTransfer.effectAllowed = "copy";
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

      insertTextAtSelection(
        `<img src="${dataUrl}" alt="Immagine documento" style="max-width: 100%; height: auto; margin: 16px 0;" />`,
      );
    };
    reader.readAsDataURL(file);
  };

  const handleEditorDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    if (readOnly) {
      return;
    }

    const imageFile = Array.from(event.dataTransfer.files || []).find((file) =>
      file.type.startsWith("image/"),
    );
    const droppedText =
      event.dataTransfer.getData(TEMPLATE_DRAG_MIME) ||
      event.dataTransfer.getData("text/plain");

    if (!imageFile && !droppedText) {
      return;
    }

    event.preventDefault();

    if (imageFile) {
      insertImageFile(imageFile);
      return;
    }

    insertTextAtSelection(droppedText);
  };

  const handleSave = () => {
    if (!onSave) {
      return;
    }

    onSave(ensureBaseContent(content));
  };

  const handleLink = () => {
    if (readOnly) {
      return;
    }

    const url = window.prompt(
      "Inserisci il link. Lascia vuoto per rimuoverlo.",
      "",
    );

    if (url === null) {
      return;
    }

    if (!url.trim()) {
      return;
    }

    applyInsertion(
      `<a href="${url.trim()}" target="_blank" rel="noreferrer">`,
      "</a>",
      "Link",
    );
  };

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 overflow-auto bg-slate-950/15 p-4 backdrop-blur-sm"
          : ""
      }
    >
      <Card
        className={cn(
          "w-full overflow-hidden border-slate-200 shadow-sm",
          isFullscreen && "mx-auto max-w-7xl",
        )}
      >
        <CardHeader className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/80 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Editor Documento</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton
              title="Titolo 1"
              disabled={readOnly}
              onClick={() => applyInsertion("<h1>", "</h1>", "Titolo principale")}
            >
              <Heading1 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Titolo 2"
              disabled={readOnly}
              onClick={() => applyInsertion("<h2>", "</h2>", "Sottotitolo")}
            >
              <Heading2 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Paragrafo"
              disabled={readOnly}
              onClick={() => applyInsertion("<p>", "</p>", "Testo paragrafo")}
            >
              <Pilcrow className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Grassetto"
              disabled={readOnly}
              onClick={() => applyInsertion("<strong>", "</strong>")}
            >
              <Bold className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Corsivo"
              disabled={readOnly}
              onClick={() => applyInsertion("<em>", "</em>")}
            >
              <Italic className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Sottolineato"
              disabled={readOnly}
              onClick={() => applyInsertion("<u>", "</u>")}
            >
              <UnderlineIcon className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Elenco puntato"
              disabled={readOnly}
              onClick={() => applyInsertion("<ul><li>", "</li></ul>", "Voce elenco")}
            >
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Elenco numerato"
              disabled={readOnly}
              onClick={() => applyInsertion("<ol><li>", "</li></ol>", "Voce elenco")}
            >
              <ListOrdered className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Citazione"
              disabled={readOnly}
              onClick={() => applyInsertion("<blockquote>", "</blockquote>", "Citazione")}
            >
              <Quote className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title="Link" disabled={readOnly} onClick={handleLink}>
              <Link2 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Allinea a sinistra"
              disabled={readOnly}
              onClick={() =>
                applyInsertion(
                  '<div style="text-align:left;">',
                  "</div>",
                  "Testo allineato a sinistra",
                )
              }
            >
              <AlignLeft className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Centra"
              disabled={readOnly}
              onClick={() =>
                applyInsertion(
                  '<div style="text-align:center;">',
                  "</div>",
                  "Testo centrato",
                )
              }
            >
              <AlignCenter className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Allinea a destra"
              disabled={readOnly}
              onClick={() =>
                applyInsertion(
                  '<div style="text-align:right;">',
                  "</div>",
                  "Testo allineato a destra",
                )
              }
            >
              <AlignRight className="h-4 w-4" />
            </ToolbarButton>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((current) => !current)}
            >
              {showPreview ? (
                <EyeOff className="mr-2 h-4 w-4" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              {showPreview ? "Nascondi anteprima" : "Mostra anteprima"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen((current) => !current)}
              className="ml-auto"
            >
              {isFullscreen ? (
                <Minimize className="mr-2 h-4 w-4" />
              ) : (
                <Maximize className="mr-2 h-4 w-4" />
              )}
              {isFullscreen ? "Esci da schermo intero" : "Schermo intero"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
            {!readOnly && (
              <aside className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Tags className="h-4 w-4 text-blue-600" />
                  Campi dinamici
                </div>
                <div className="space-y-4">
                  {Object.entries(tokensByGroup).map(([group, groupTokens]) => (
                    <div key={group} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                        {group}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {groupTokens.map((token) => (
                          <button
                            key={token.value}
                            type="button"
                            draggable
                            onDragStart={(event) =>
                              handleDragStart(event, token.value)
                            }
                            onClick={() => insertTextAtSelection(token.value)}
                            className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                          >
                            <GripVertical className="h-3 w-3 text-blue-400" />
                            {token.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                    Blocchi
                  </p>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) =>
                      handleDragStart(event, SIGNATURE_BLOCK)
                    }
                    onClick={() => insertTextAtSelection(SIGNATURE_BLOCK)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <PenLine className="h-4 w-4 text-slate-500" />
                    Firma
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) =>
                      handleDragStart(event, IMAGE_PLACEHOLDER_BLOCK)
                    }
                    onClick={() =>
                      insertTextAtSelection(IMAGE_PLACEHOLDER_BLOCK)
                    }
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <ImageIcon className="h-4 w-4 text-slate-500" />
                    Immagine
                  </button>
                </div>
              </aside>
            )}

            <div
              className={cn(
                "grid gap-4",
                showPreview ? "lg:grid-cols-2" : "grid-cols-1",
              )}
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <div className="mb-2 px-2 text-sm font-medium text-slate-600">
                  Documento
                </div>
                <Textarea
                  ref={textareaRef}
                  value={content}
                  readOnly={readOnly}
                  onChange={(event) => setContent(event.target.value)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleEditorDrop}
                  className="min-h-[480px] resize-none rounded-xl border-slate-200 bg-white font-mono text-[13px] leading-6 text-slate-700"
                />
              </div>

              {showPreview && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-2 px-2 text-sm font-medium text-slate-600">
                    Anteprima
                  </div>
                  <div
                    className="min-h-[480px] rounded-xl border border-slate-200 bg-white px-5 py-4 text-[15px] leading-7 text-slate-700"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              )}
            </div>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                I campi dinamici vengono compilati quando selezioni un atleta.
              </p>
              <Button onClick={handleSave} disabled={!content.trim()}>
                Salva Documento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
