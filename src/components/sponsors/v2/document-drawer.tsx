"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, TextInput, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { useToast } from "@/components/ui/toast-notification";

/**
 * «Nuovo documento» in un cassetto da 480: titolo, descrizione, file.
 * Sostituisce il dialog «Aggiungi Documento» della scheda V1 con la stessa
 * regola (titolo obbligatorio, toast «Inserisci un titolo per il
 * documento») e **la stessa scrittura**: la V1 non caricava il file, ne
 * conservava il nome sull'elemento (`fileName`). Qui e detto, invece di
 * essere taciuto.
 */
export type SponsorDocumentSubmission = { title: string; description: string; fileName: string };

export function DocumentDrawer({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (submission: SponsorDocumentSubmission) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setFileName("");
    setError(null);
  }, [open]);

  const dirty = Boolean(title || description || fileName);

  const submit = async () => {
    if (!title.trim()) {
      setError("Inserisci un titolo per il documento");
      showToast("error", "Inserisci un titolo per il documento");
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave({ title: title.trim(), description: description.trim(), fileName });
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Documenti"
      title="Nuovo documento"
      description="Un riferimento sulla scheda: contratto firmato, lettera d'intenti, materiale di visibilità."
      dirty={dirty}
      locked={saving}
      data-test="sponsor-document-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Aggiungi documento
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <Field label="Titolo" htmlFor="sponsor-document-title" required error={error}>
            <TextInput
              id="sponsor-document-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError(null);
              }}
              placeholder="Es. Contratto di sponsorizzazione 2026/27"
              autoFocus
            />
          </Field>
          <Field label="Descrizione" htmlFor="sponsor-document-description" optional>
            <Textarea id="sponsor-document-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Allega documento" htmlFor="sponsor-document-file" optional helper="Viene registrato il nome del file come riferimento sulla scheda.">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" icon={<Upload />} onClick={() => fileInputRef.current?.click()}>
                {fileName ? "Cambia file" : "Seleziona file"}
              </Button>
              {fileName ? <span className="egw-ellipsis min-w-0 font-brand text-[12.5px] text-egw-ink-72">{fileName}</span> : null}
              <input
                ref={fileInputRef}
                id="sponsor-document-file"
                type="file"
                className="hidden"
                onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
              />
            </div>
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
