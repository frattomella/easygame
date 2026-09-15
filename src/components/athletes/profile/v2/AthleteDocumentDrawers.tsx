"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
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
import { DOCUMENT_KIND_OPTIONS } from "@/lib/documents/kind-catalog";
import { FileInput } from "./FileInput";

/**
 * I cassetti dell'area Documenti e sanità: visita medica, allegato (documento
 * d'identita o d'iscrizione), altro documento, richiesta e caricamento di un
 * documento condiviso con la famiglia, e il rifiuto con motivo — che nella V1
 * era l'unico `window.prompt` rimasto.
 *
 * Ogni cassetto e controllato dalla pagina: la bozza e il salvataggio vivono
 * li, come prima; qui ci sono solo i campi e la guardia sulle modifiche.
 */

const useDirty = (open: boolean) => {
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);
  return [dirty, () => setDirty(true)] as const;
};

/* ── Visita medica ─────────────────────────────────────────────────────── */
export type MedicalVisitDraft = {
  title: string;
  description: string;
  type: string;
  paidBy: string;
  location: string;
  date: string;
  outcome: string;
  file: File | null;
};

const VISIT_TYPES = [
  { value: "Agonistica", label: "Agonistica" },
  { value: "Non Agonistica", label: "Non agonistica" },
  { value: "Controllo", label: "Controllo" },
];
const PAID_BY = [
  { value: "atleta", label: "Atleta" },
  { value: "club", label: "Club" },
  { value: "famiglia", label: "Famiglia" },
];

export function AthleteMedicalVisitDrawer({
  open,
  onOpenChange,
  draft,
  setDraft,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: MedicalVisitDraft;
  setDraft: React.Dispatch<React.SetStateAction<MedicalVisitDraft>>;
  onSave: () => void | Promise<void>;
}) {
  const [dirty, touch] = useDirty(open);
  const patch = (changes: Partial<MedicalVisitDraft>) => {
    touch();
    setDraft((current) => ({ ...current, ...changes }));
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Sanità"
      title="Nuova visita medica"
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={() => void onSave()}>
            Salva visita
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <FormGrid columns={2}>
            <Field label="Titolo" required htmlFor="visit-title">
              <TextInput id="visit-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
            </Field>
            <Field label="Data" required htmlFor="visit-date">
              <DateInput id="visit-date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
            </Field>
          </FormGrid>
          <FormGrid columns={2}>
            <Field label="Tipologia" htmlFor="visit-type">
              <Select id="visit-type" value={draft.type} onValueChange={(value) => patch({ type: value })} options={VISIT_TYPES} placeholder="Seleziona tipologia" />
            </Field>
            <Field label="Pagamento" htmlFor="visit-paid-by">
              <Select id="visit-paid-by" value={draft.paidBy} onValueChange={(value) => patch({ paidBy: value })} options={PAID_BY} placeholder="Chi paga" />
            </Field>
          </FormGrid>
          <Field label="Esito" htmlFor="visit-outcome">
            <TextInput id="visit-outcome" value={draft.outcome} onChange={(e) => patch({ outcome: e.target.value })} placeholder="Es. Idoneo" />
          </Field>
          <Field label="Luogo" htmlFor="visit-location">
            <TextInput id="visit-location" value={draft.location} onChange={(e) => patch({ location: e.target.value })} />
          </Field>
          <Field label="Descrizione" htmlFor="visit-description">
            <Textarea id="visit-description" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
          </Field>
          <Field label="Allegato visita" htmlFor="visit-file">
            <FileInput id="visit-file" file={draft.file} onFileChange={(file) => patch({ file })} />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

/* ── Allegato (documento d'identita, documento d'iscrizione) ───────────── */
export type AttachmentDraft = {
  name: string;
  type: string;
  notes: string;
  file: File | null;
};

export function AthleteAttachmentDrawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  typePlaceholder,
  draft,
  setDraft,
  onSave,
  saveLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow: string;
  typePlaceholder: string;
  draft: AttachmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<AttachmentDraft>>;
  onSave: () => void | Promise<void>;
  saveLabel: string;
}) {
  const [dirty, touch] = useDirty(open);
  const patch = (changes: Partial<AttachmentDraft>) => {
    touch();
    setDraft((current) => ({ ...current, ...changes }));
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={eyebrow}
      title={title}
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={() => void onSave()}>
            {saveLabel}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <Field label="Nome documento" required htmlFor="attachment-name">
            <TextInput id="attachment-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Tipo" htmlFor="attachment-type">
            <TextInput id="attachment-type" value={draft.type} onChange={(e) => patch({ type: e.target.value })} placeholder={typePlaceholder} />
          </Field>
          <Field label="Note" htmlFor="attachment-notes">
            <Textarea id="attachment-notes" value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
          <Field label="File" required htmlFor="attachment-file">
            <FileInput id="attachment-file" file={draft.file} onFileChange={(file) => patch({ file })} />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

/* ── Altro documento ───────────────────────────────────────────────────── */
export type OtherDocumentDraft = {
  name: string;
  type: string;
  file: File | null;
};

const OTHER_DOCUMENT_TYPES = ["Certificato Medico", "Documento Identità", "Tesserino", "Liberatoria", "Privacy", "Altro"];

export function AthleteOtherDocumentDrawer({
  open,
  onOpenChange,
  draft,
  setDraft,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: OtherDocumentDraft;
  setDraft: React.Dispatch<React.SetStateAction<OtherDocumentDraft>>;
  onSave: () => void | Promise<void>;
}) {
  const [dirty, touch] = useDirty(open);
  const patch = (changes: Partial<OtherDocumentDraft>) => {
    touch();
    setDraft((current) => ({ ...current, ...changes }));
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Documenti"
      title="Aggiungi documento"
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={() => void onSave()}>
            Aggiungi
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <Field label="Nome documento" required htmlFor="other-document-name">
            <TextInput id="other-document-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Es: Certificato medico" />
          </Field>
          <Field label="Tipo documento" required htmlFor="other-document-type">
            <Select
              id="other-document-type"
              value={draft.type}
              onValueChange={(value) => patch({ type: value })}
              placeholder="Seleziona tipo"
              options={OTHER_DOCUMENT_TYPES.map((type) => ({ value: type, label: type }))}
            />
          </Field>
          <Field label="File" optional htmlFor="other-document-file">
            <FileInput id="other-document-file" file={draft.file} onFileChange={(file) => patch({ file })} />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

/* ── Documenti condivisi con la famiglia ───────────────────────────────── */
export type SharedDocumentRequestDraft = {
  title: string;
  documentType: string;
  description: string;
  dueDate: string;
};

export function SharedDocumentRequestDrawer({
  open,
  onOpenChange,
  draft,
  setDraft,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: SharedDocumentRequestDraft;
  setDraft: React.Dispatch<React.SetStateAction<SharedDocumentRequestDraft>>;
  busy: boolean;
  onSubmit: () => void | Promise<void>;
}) {
  const [dirty, touch] = useDirty(open);
  const patch = (changes: Partial<SharedDocumentRequestDraft>) => {
    touch();
    setDraft((current) => ({ ...current, ...changes }));
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Famiglia"
      title="Richiedi documento"
      description="La famiglia vede la richiesta nell'area famiglia e carica il file da lì."
      dirty={dirty}
      locked={busy}
      footer={
        <>
          <Button variant="primary" loading={busy} onClick={() => void onSubmit()}>
            Richiedi alla famiglia
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <Field label="Titolo documento" required htmlFor="shared-request-title">
            <TextInput id="shared-request-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field label="Tipo documento" htmlFor="shared-request-type">
            <Select id="shared-request-type" value={draft.documentType} onValueChange={(value) => patch({ documentType: value })} options={DOCUMENT_KIND_OPTIONS} />
          </Field>
          <Field label="Scadenza" htmlFor="shared-request-due" width="16ch">
            <DateInput id="shared-request-due" value={draft.dueDate} onChange={(e) => patch({ dueDate: e.target.value })} />
          </Field>
          <Field label="Note per la famiglia" htmlFor="shared-request-notes">
            <Textarea id="shared-request-notes" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

export type SharedDocumentUploadDraft = {
  title: string;
  documentType: string;
  description: string;
  file: File | null;
};

export function SharedDocumentUploadDrawer({
  open,
  onOpenChange,
  draft,
  setDraft,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: SharedDocumentUploadDraft;
  setDraft: React.Dispatch<React.SetStateAction<SharedDocumentUploadDraft>>;
  busy: boolean;
  onSubmit: () => void | Promise<void>;
}) {
  const [dirty, touch] = useDirty(open);
  const patch = (changes: Partial<SharedDocumentUploadDraft>) => {
    touch();
    setDraft((current) => ({ ...current, ...changes }));
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Famiglia"
      title="Carica documento club"
      description="Il file diventa visibile alla famiglia nell'area famiglia."
      dirty={dirty}
      locked={busy}
      footer={
        <>
          <Button variant="primary" loading={busy} onClick={() => void onSubmit()}>
            Condividi con la famiglia
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <Field label="Titolo documento" htmlFor="shared-upload-title" helper="Se vuoto, vale il nome del file.">
            <TextInput id="shared-upload-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field label="Tipo documento" htmlFor="shared-upload-type">
            <Select id="shared-upload-type" value={draft.documentType} onValueChange={(value) => patch({ documentType: value })} options={DOCUMENT_KIND_OPTIONS} />
          </Field>
          <Field label="File" required htmlFor="shared-upload-file" helper="PDF o immagine (JPEG, PNG, HEIC).">
            <FileInput id="shared-upload-file" file={draft.file} accept=".pdf,image/jpeg,image/png,image/heic,image/heif" onFileChange={(file) => patch({ file })} />
          </Field>
          <Field label="Descrizione" htmlFor="shared-upload-description">
            <Textarea id="shared-upload-description" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

/**
 * Il rifiuto con motivo: un dialogo dell'applicazione al posto del
 * `window.prompt`, che il browser puo sopprimere e che dentro una webview puo
 * non comparire affatto. Il motivo resta obbligatorio, come prima.
 */
export function SharedDocumentRejectDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  busy: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title="Rifiutare il documento?"
      description="La famiglia vede il motivo e può caricare un file nuovo."
      confirmLabel="Rifiuta"
      loading={busy}
      onConfirm={onConfirm}
    >
      <Field label="Motivo del rifiuto" required htmlFor="shared-reject-reason">
        <Textarea id="shared-reject-reason" value={reason} onChange={(e) => onReasonChange(e.target.value)} rows={3} autoFocus />
      </Field>
    </ConfirmDialog>
  );
}
