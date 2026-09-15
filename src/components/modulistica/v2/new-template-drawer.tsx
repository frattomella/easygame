"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, Select, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import type { TemplateSubject } from "@/lib/api/documents";
import { SUBJECT_HINT, SUBJECT_OPTIONS } from "@/components/modulistica/v2/modulistica-model";

/**
 * «Nuovo documento» (guideline 08 §8.5: tre campi, un cassetto da 480).
 * Sostituisce il `Dialog` della V1 con gli stessi tre campi — titolo,
 * descrizione, di chi parla — e la stessa regola: il titolo e obbligatorio,
 * il soggetto decide quali dati il modello sapra scrivere e va spiegato.
 */
export type NewTemplateValues = { title: string; description: string; subjectKind: TemplateSubject };

export function NewTemplateDrawer({
  open,
  onOpenChange,
  onCreate,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: NewTemplateValues) => Promise<void>;
  creating?: boolean;
}) {
  const [newDocumentTitle, setNewDocumentTitle] = React.useState("");
  const [newDocumentDescription, setNewDocumentDescription] = React.useState("");
  const [newDocumentSubject, setNewDocumentSubject] = React.useState<TemplateSubject>("athlete");
  const [errors, setErrors] = React.useState<Array<{ id?: string; label: string }>>([]);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const subjectId = React.useId();

  React.useEffect(() => {
    if (open) {
      setNewDocumentTitle("");
      setNewDocumentDescription("");
      setNewDocumentSubject("athlete");
      setErrors([]);
    }
  }, [open]);

  const dirty = Boolean(newDocumentTitle.trim() || newDocumentDescription.trim() || newDocumentSubject !== "athlete");
  const titleError = errors.find((e) => e.id === titleId);

  const submit = async () => {
    if (!newDocumentTitle.trim()) {
      setErrors([{ id: titleId, label: "Inserisci il titolo del documento" }]);
      return;
    }
    setErrors([]);
    await onCreate({ title: newDocumentTitle.trim(), description: newDocumentDescription.trim(), subjectKind: newDocumentSubject });
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Modelli di documento"
      title="Nuovo documento"
      description="Nasce come bozza: si scrive nel foglio visuale e vale quando lo pubblichi."
      dirty={dirty && !creating}
      locked={creating}
      data-test="new-template-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={creating} disabled={!newDocumentTitle.trim()}>
            Crea
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={creating}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <ValidationSummary errors={errors} className="mb-5" />
        <DrawerSection>
          <div className="flex flex-col gap-5">
            <Field label="Titolo" htmlFor={titleId} required error={titleError?.label}>
              <TextInput id={titleId} value={newDocumentTitle} onChange={(event) => setNewDocumentTitle(event.target.value)} placeholder="Inserisci il titolo del documento" autoFocus />
            </Field>
            <Field label="Descrizione" htmlFor={descriptionId} optional>
              <TextInput id={descriptionId} value={newDocumentDescription} onChange={(event) => setNewDocumentDescription(event.target.value)} placeholder="Inserisci una breve descrizione" />
            </Field>
            <Field label="Di chi parla" htmlFor={subjectId} helper={SUBJECT_HINT}>
              <Select id={subjectId} value={newDocumentSubject} onValueChange={(value) => setNewDocumentSubject(value as TemplateSubject)} options={SUBJECT_OPTIONS} />
            </Field>
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
