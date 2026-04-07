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
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize,
  Minimize,
  Pilcrow,
  Quote,
  Underline as UnderlineIcon,
} from "lucide-react";

interface DocumentEditorProps {
  initialContent?: string;
  onSave?: (content: string) => void;
  readOnly?: boolean;
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

export default function DocumentEditor({
  initialContent = "",
  onSave,
  readOnly = false,
}: DocumentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [content, setContent] = useState(ensureBaseContent(initialContent));

  useEffect(() => {
    setContent(ensureBaseContent(initialContent));
  }, [initialContent]);

  const previewHtml = useMemo(() => ensureBaseContent(content), [content]);

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
          <div
            className={cn(
              "grid gap-4",
              showPreview ? "lg:grid-cols-2" : "grid-cols-1",
            )}
          >
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <div className="mb-2 px-2 text-sm font-medium text-slate-600">
                HTML del documento
              </div>
              <Textarea
                ref={textareaRef}
                value={content}
                readOnly={readOnly}
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[420px] resize-none rounded-xl border-slate-200 bg-white font-mono text-[13px] leading-6 text-slate-700"
              />
            </div>

            {showPreview && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <div className="mb-2 px-2 text-sm font-medium text-slate-600">
                  Anteprima documento
                </div>
                <div
                  className="min-h-[420px] rounded-xl border border-slate-200 bg-white px-5 py-4 text-[15px] leading-7 text-slate-700"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            )}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Editor gratuito integrato, con HTML modificabile e anteprima in
                tempo reale.
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
