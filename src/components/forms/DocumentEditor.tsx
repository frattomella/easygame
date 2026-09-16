"use client";

import * as React from "react";
import { Maximize, Minimize, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { RichTextEditor, type PlaceholderOption } from "@/components/rich-text/RichTextEditor";
import { uploadAttachment } from "@/lib/api/attachments";
import { buildAttachmentUrl } from "@/lib/attachments";
import {
  DOCUMENT_SIGNATURE_TOKENS,
  listPlaceholderTokensForSubject,
  type DocumentSignatureToken,
  type DocumentTemplateToken,
  type TemplateSubjectKind,
} from "@/lib/documents/placeholders";
import { PLACEHOLDER_CLASS, sanitizeRichHtml } from "@/lib/rich-text/sanitize";
import { cn } from "@/lib/utils";

/**
 * L'editor dei modelli di documento (ADR-0190 §2).
 *
 * **Cosa e cambiato.** Fino al secondo lotto del redesign questo file era un
 * `contentEditable` con `document.execCommand`, 1178 righe senza un modello
 * del documento: i segnaposto andavano a capo, l'interlinea non si governava,
 * le immagini entravano in base64 e non si ridimensionavano, le tabelle non
 * si inserivano, la multipagina era un a capo. Ora e un involucro sottile
 * intorno a `RichTextEditor` (ProseMirror con schema chiuso), lo stesso
 * editor del blocco di contenuto dei moduli.
 *
 * **I segnaposto** restano `{{chiave}}` nel testo salvato — e cio che il
 * risolutore (`src/lib/server/document-placeholders.ts`) legge — ma dentro
 * l'editor sono nodi inline atomici: non si spezzano e non si editano
 * dentro. All'apertura il testo `{{chiave}}` diventa nodo; al salvataggio il
 * nodo torna testo. Si propongono **solo** i segnaposto che il soggetto del
 * modello sa riempire (`listPlaceholderTokensForSubject`, DOC-04).
 *
 * **Le immagini** vanno negli allegati del club (categoria
 * `contenuto-documento`): nell'HTML resta l'URL, mai i byte.
 */

export type { DocumentTemplateToken, DocumentSignatureToken as SignatureToken };

interface DocumentEditorProps {
  initialContent?: string;
  onSave?: (content: string) => void;
  onCancel?: () => void;
  readOnly?: boolean;
  /** Di chi parla il modello: decide quali segnaposto proporre (DOC-04). */
  subject?: TemplateSubjectKind;
}

const EMPTY_DOCUMENT = "<h1>Documento</h1><p>Scrivi qui il contenuto.</p>";
const PLACEHOLDER_TEXT = /{{\s*([a-z0-9_.]+)\s*}}/gi;

/** `{{chiave}}` nel testo → nodo inline; solo fuori dai tag. */
const toAtoms = (html: string) =>
  html
    .split(/(<[^>]+>)/g)
    .map((part) =>
      part.startsWith("<")
        ? part
        : part.replace(PLACEHOLDER_TEXT, (_m, key: string) => `<span class="${PLACEHOLDER_CLASS}" data-token="${key}">{{${key}}}</span>`),
    )
    .join("");

/** Il nodo torna testo: il risolutore legge `{{chiave}}`, non uno span. */
const fromAtoms = (html: string) =>
  html.replace(new RegExp(`<span[^>]*class="${PLACEHOLDER_CLASS}"[^>]*>\\s*({{[^}]+}})\\s*</span>`, "gi"), "$1");

export default function DocumentEditor({
  initialContent = "",
  onSave,
  onCancel,
  readOnly = false,
  subject = "athlete",
}: DocumentEditorProps) {
  const { activeClub } = useAuth();
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [content, setContent] = React.useState(() => toAtoms(sanitizeRichHtml(initialContent) || EMPTY_DOCUMENT));
  const lastInitial = React.useRef(initialContent);

  /* Un modello diverso (o ricaricato) rientra nell'editor. */
  React.useEffect(() => {
    if (initialContent === lastInitial.current) return;
    lastInitial.current = initialContent;
    setContent(toAtoms(sanitizeRichHtml(initialContent) || EMPTY_DOCUMENT));
  }, [initialContent]);

  /* L'elenco proposto: solo cio che il soggetto del modello sa riempire. */
  const availableTokens = React.useMemo(() => listPlaceholderTokensForSubject(subject), [subject]);
  const placeholders = React.useMemo<PlaceholderOption[]>(
    () => [
      ...availableTokens.map((token) => ({
        token: token.value.replace(/[{}]/g, "").trim(),
        label: token.label,
        group: token.group,
      })),
      ...DOCUMENT_SIGNATURE_TOKENS.map((token) => ({
        token: token.value.replace(/[{}]/g, "").trim(),
        label: token.label,
        group: "Firme",
      })),
    ],
    [availableTokens],
  );

  const uploadImage = React.useCallback(
    async (file: File) => {
      const clubId = String(activeClub?.id || "");
      if (!clubId) throw new Error("Nessun club attivo");
      const esito = await uploadAttachment({
        file,
        ownerType: "club",
        ownerId: clubId,
        category: "contenuto-documento",
        organizationId: clubId,
      });
      if (!esito.ok) throw new Error(esito.message);
      return buildAttachmentUrl(esito.attachment.id);
    },
    [activeClub?.id],
  );

  const save = () => onSave?.(sanitizeRichHtml(fromAtoms(content)));

  return (
    <div className={cn(isFullscreen && "fixed inset-0 z-50 overflow-y-auto bg-egw-page p-4")} data-test="document-editor">
      <div className={cn("space-y-3", isFullscreen && "mx-auto max-w-5xl")}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-egw-ink-62">
            Il foglio: titoli, testo, elenchi, tabelle, immagini e interruzioni di pagina. I campi dinamici sono blocchi in riga.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsFullscreen((v) => !v)} aria-pressed={isFullscreen}>
              {isFullscreen ? <Minimize className="mr-1.5 h-4 w-4" /> : <Maximize className="mr-1.5 h-4 w-4" />}
              {isFullscreen ? "Riduci" : "A tutto schermo"}
            </Button>
          </div>
        </div>

        {readOnly ? (
          <div className="rounded-egw-control border border-egw-hairline bg-white p-6">
            <div className="egw-rich-content" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(fromAtoms(content)) }} />
          </div>
        ) : (
          <div className="rounded-egw-control bg-egw-page-100 p-2 sm:p-4">
            {/* Il foglio: un A4 di larghezza sul desktop, la larghezza disponibile sul telefono. */}
            <RichTextEditor
              aria-label="Contenuto del modello"
              value={content}
              onChange={setContent}
              placeholders={placeholders}
              onUploadImage={uploadImage}
              allowPageBreaks
              minHeight={isFullscreen ? 640 : 420}
              className="mx-auto max-w-[820px] shadow-egw-plane-1"
            />
          </div>
        )}

        {!readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                <X className="mr-2 h-4 w-4" />
                Annulla
              </Button>
            ) : null}
            <Button type="button" onClick={save}>
              <Save className="mr-2 h-4 w-4" />
              Salva bozza
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
