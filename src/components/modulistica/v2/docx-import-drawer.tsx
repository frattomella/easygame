"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { RichContent } from "@/components/rich-text/RichContent";
import { previewDocxImport, type DocxImportPreview } from "@/lib/api/documents";
import { useToast } from "@/components/ui/toast-notification";

/**
 * **Importa da Word** (mandato multi-stagione E5-E12).
 *
 * Due passi, mai uno: si carica e si vede prima di scrivere qualunque cosa
 * (E12). «Conferma e crea» non sovrascrive un modello esistente — crea
 * sempre un documento **nuovo**, la stessa strada di «Nuovo documento» — e
 * l'operatore lo apre nel foglio visuale per finirlo.
 */
export function DocxImportDrawer({
  open,
  onOpenChange,
  onConfirm,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: { title: string; html: string }) => Promise<void>;
  creating?: boolean;
}) {
  const { showToast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [preview, setPreview] = React.useState<DocxImportPreview | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setTitle("");
      setPreview(null);
      setLoading(false);
    }
  }, [open]);

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const scelto = event.target.files?.[0] || null;
    event.target.value = "";
    if (!scelto) return;

    setFile(scelto);
    setPreview(null);
    if (!title.trim()) {
      setTitle(scelto.name.replace(/\.docx$/i, ""));
    }
    setLoading(true);
    const { preview: risultato, error } = await previewDocxImport(scelto);
    setLoading(false);
    if (error || !risultato) {
      showToast("error", error || "Impossibile leggere il documento");
      setFile(null);
      return;
    }
    setPreview(risultato);
  };

  const confirm = async () => {
    if (!title.trim() || !preview) return;
    await onConfirm({ title: title.trim(), html: preview.html });
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Modelli di documento"
      title="Importa da Word"
      description="Un documento .docx esistente diventa il punto di partenza: si vede prima di crearlo, e resta una bozza da rifinire nel foglio visuale."
      dirty={Boolean(file) && !creating}
      locked={creating}
      data-test="docx-import-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void confirm()} loading={creating} disabled={!preview || !title.trim()}>
            Conferma e crea documento
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={creating}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <ValidationSummary errors={[]} className="mb-5" />
        <DrawerSection>
          <div className="flex flex-col gap-5">
            <Field label="File Word (.docx)" htmlFor="docx-import-file" helper="Fino a 10 MB. Titoli, paragrafi, elenchi, tabelle e interruzioni di pagina si importano; le immagini incassate no (vedi sotto).">
              <input
                id="docx-import-file"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => void chooseFile(event)}
                disabled={loading || creating}
                className="block w-full text-sm"
              />
            </Field>
            <Field label="Titolo del documento" htmlFor="docx-import-title" required>
              <TextInput id="docx-import-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Inserisci il titolo del documento" />
            </Field>

            {loading ? <p className="font-brand text-[12.5px] text-egw-ink-62">Lettura del documento…</p> : null}

            {preview?.unsupported.length ? (
              <AlertBlock severity="warning" title="Non tutto e stato importato">
                <ul className="list-disc pl-5">
                  {preview.unsupported.map((riga, index) => (
                    <li key={index}>{riga}</li>
                  ))}
                </ul>
              </AlertBlock>
            ) : null}

            {preview ? (
              <div>
                <p className="mb-2 font-brand text-[11.5px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
                  Anteprima
                </p>
                <div className="max-h-[420px] overflow-y-auto rounded-egw-panel-sm border border-egw-panel-border bg-white p-4">
                  <RichContent html={preview.html} />
                </div>
              </div>
            ) : null}
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
