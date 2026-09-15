"use client";

import React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import {
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  Select,
  TextInput,
  Textarea,
} from "@/components/web/forms/Field";
import type { ClubFederation } from "@/lib/club-federations";
import { FileInput } from "./v2/FileInput";

/**
 * **Il cassetto di un tesseramento: crea e corregge** (N2, N4).
 *
 * Sette campi: un cassetto da 480 (guideline 08 §8.5), con la guardia sulle
 * modifiche non salvate.
 *
 * Due cose che qui non sono cosmetiche.
 *
 * **La tendina porta identificativi.** Il valore di ogni voce e l'`id` della
 * federazione, non il suo nome: il nome e la scritta. Prima il valore *era* la
 * scritta, quindi rinominare un'affiliazione in `/organization` orfanava ogni
 * tesseramento gia registrato — e nessuno se ne accorgeva, perche la scheda
 * continuava a mostrare la vecchia stringa.
 *
 * **In correzione l'allegato non e obbligatorio.** Non lo e mai stato, del
 * resto: un tesseramento si registra prima che la federazione emetta il numero
 * e prima che il documento arrivi. Caricarne uno quando ce n'e gia uno lo
 * **sostituisce**.
 */

export type RegistrationDraft = {
  federation: string;
  number: string;
  status: string;
  issueDate: string;
  expiryDate: string;
  notes: string;
  file: File | null;
};

const REGISTRATION_STATUSES = ["In corso", "In rinnovo", "Scaduto"];

export function AthleteRegistrationDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  federations,
  isEditing,
  hasExistingFile,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: RegistrationDraft;
  onDraftChange: (next: RegistrationDraft) => void;
  federations: readonly ClubFederation[];
  isEditing: boolean;
  hasExistingFile: boolean;
  onSave: () => void;
}) {
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);

  const patch = (changes: Partial<RegistrationDraft>) => {
    setDirty(true);
    onDraftChange({ ...draft, ...changes });
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Tesseramento"
      title={isEditing ? "Modifica tesseramento" : "Nuovo tesseramento"}
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={onSave}>
            {isEditing ? "Salva modifiche" : "Salva tesseramento"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <Field
            label="Federazione/Ente"
            required
            htmlFor="registration-federation"
            warning={
              federations.length === 0
                ? "Nessuna federazione registrata nel club. Aggiungile prima nella pagina Club, scheda «Federazione»."
                : undefined
            }
          >
            <Select
              id="registration-federation"
              value={draft.federation}
              onValueChange={(value) => patch({ federation: value })}
              placeholder="Seleziona federazione o ente"
              options={federations.map((federation) => ({
                /* Il valore e l'identificativo, non la scritta (N2). */
                value: federation.id,
                label: federation.registrationNumber
                  ? `${federation.name} · n. ${federation.registrationNumber}`
                  : federation.name,
              }))}
            />
          </Field>
          <Field label="Numero tessera" htmlFor="registration-number" width="20ch" helper="Facoltativo: la federazione lo emette dopo.">
            <TextInput id="registration-number" value={draft.number} onChange={(e) => patch({ number: e.target.value })} />
          </Field>
          <FormGrid columns={2}>
            <Field label="Data emissione" htmlFor="registration-issue">
              <DateInput id="registration-issue" value={draft.issueDate} onChange={(e) => patch({ issueDate: e.target.value })} />
            </Field>
            <Field label="Data scadenza" htmlFor="registration-expiry">
              <DateInput id="registration-expiry" value={draft.expiryDate} onChange={(e) => patch({ expiryDate: e.target.value })} />
            </Field>
          </FormGrid>
          <Field label="Stato" htmlFor="registration-status">
            <Select
              id="registration-status"
              value={draft.status}
              onValueChange={(value) => patch({ status: value })}
              placeholder="Seleziona stato"
              options={REGISTRATION_STATUSES.map((status) => ({ value: status, label: status }))}
            />
          </Field>
          <Field label="Note" htmlFor="registration-notes">
            <Textarea id="registration-notes" value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
          <Field
            label={hasExistingFile ? "Sostituisci allegato" : "Allegato"}
            htmlFor="registration-file"
            helper={
              hasExistingFile && !draft.file
                ? "Un allegato è già presente. Sceglierne uno nuovo lo sostituisce; lasciando vuoto resta quello."
                : undefined
            }
          >
            <FileInput id="registration-file" file={draft.file} onFileChange={(file) => patch({ file })} />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
