"use client";

import React from "react";
import { Download, Eye, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, RowActionDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { Drawer } from "@/components/web/overlays/Drawer";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { DateInput, Field, FieldSizeProvider, Select, TextInput } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { ATTACHMENT_ACCEPT_ATTRIBUTE } from "@/lib/attachments";
import { replaceAttachment, uploadAttachmentReference } from "@/lib/api/attachments";
import { parseAttachmentReference } from "@/lib/attachments";
import { downloadAttachment, openClientFileUrl } from "@/lib/client-files";
import { todayLocalDateOnly } from "@/lib/date-only";
import { formatDateShort } from "@/lib/web/format";
import { CERTIFICATE_STATUS, STATUS_UNKNOWN, type StatusSpec } from "@/lib/web/status";
import {
  TRAINER_DOCUMENT_TYPES,
  normalizeTrainerDocumentType,
  removeTrainerDocument,
  resolveTrainerDocumentStatus,
  trainerDocumentDownloadName,
  trainerDocumentTypeLabel,
  upsertTrainerDocument,
  type TrainerDocument,
  type TrainerDocumentStatus,
  type TrainerDocumentTypeId,
} from "@/lib/trainer-documents";

/**
 * I documenti di un allenatore: **una griglia sola**, quella del sistema.
 *
 * Prima c'erano due pagine dedicate (`/trainers/:id/contracts` e la sua
 * `/upload`), un riquadro nella scheda che ne mostrava tre senza poterli
 * aprire, e tre posti diversi in cui il documento poteva finire. Nessuno dei
 * tre gesti funzionava: vedi `src/lib/trainer-documents.ts`.
 *
 * I byte passano da Attachment Core — nessuna seconda logica documentale,
 * nessun file dentro il record — e la riga dell'allenatore conserva solo il
 * riferimento. Il caricamento vive in un cassetto da 480; l'eliminazione
 * chiede conferma con il modale distruttivo del sistema.
 */

const DOCUMENT_STATUS: Record<TrainerDocumentStatus, StatusSpec> = {
  valid: CERTIFICATE_STATUS.valid,
  expiring: CERTIFICATE_STATUS.expiring,
  expired: CERTIFICATE_STATUS.expired,
  "no-expiry": STATUS_UNKNOWN,
  "missing-file": CERTIFICATE_STATUS.missing,
};

const createDocumentId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? `trainer-doc-${crypto.randomUUID()}`
    : `trainer-doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const emptyDraft = () => ({
  type: "contratto" as TrainerDocumentTypeId,
  title: "",
  expiryDate: "",
  file: null as File | null,
});

export type TrainerDocumentsPanelProps = {
  documents: TrainerDocument[];
  trainerId: string;
  trainerName: string;
  organizationId: string | null;
  /** Persiste l'elenco completo sul record dell'allenatore. */
  onPersist: (documents: TrainerDocument[]) => Promise<void>;
  readOnly?: boolean;
};

export function TrainerDocumentsPanel({
  documents,
  trainerId,
  trainerName,
  organizationId,
  onPersist,
  readOnly = false,
}: TrainerDocumentsPanelProps) {
  const { showToast } = useToast();
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [dirty, setDirty] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<TrainerDocument | null>(null);
  const replaceInputRef = React.useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = React.useRef<TrainerDocument | null>(null);

  const canWrite = !readOnly && Boolean(organizationId && trainerId);

  const handleView = (document: TrainerDocument) => {
    if (!openClientFileUrl(document.fileUrl)) {
      showToast(
        "error",
        "Il file di questo documento non e disponibile: caricalo di nuovo con «Sostituisci».",
      );
    }
  };

  const handleDownload = (document: TrainerDocument) => {
    const ok = downloadAttachment(document.fileUrl, trainerDocumentDownloadName(document, trainerName));
    if (!ok) {
      showToast("error", "Il file di questo documento non e disponibile.");
    }
  };

  const openAdd = () => {
    setDraft(emptyDraft());
    setDirty(false);
    setFileError(null);
    setAddOpen(true);
  };

  const handleAdd = async () => {
    if (!draft.file) {
      setFileError("Scegli il file da caricare");
      return;
    }
    if (!organizationId) {
      showToast("error", "Nessun club attivo: non so a chi intestare il file");
      return;
    }

    setIsSaving(true);
    try {
      const fileUrl = await uploadAttachmentReference(draft.file, {
        ownerType: "trainer",
        ownerId: trainerId,
        organizationId,
        category: draft.type,
      });

      const type = normalizeTrainerDocumentType(draft.type);
      const document: TrainerDocument = {
        id: createDocumentId(),
        type,
        typeLabel: trainerDocumentTypeLabel(type),
        title:
          draft.title.trim() ||
          draft.file.name.replace(/\.[^.]+$/, "") ||
          trainerDocumentTypeLabel(type),
        fileName: draft.file.name,
        fileUrl,
        uploadedAt: todayLocalDateOnly(),
        expiryDate: draft.expiryDate,
        notes: "",
      };

      await onPersist(upsertTrainerDocument(documents, document));
      setDirty(false);
      setAddOpen(false);
      setDraft(emptyDraft());
      showToast("success", "Documento caricato");
    } catch (error: any) {
      showToast("error", error?.message || "Non sono riuscito a caricare il documento");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplacePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!file || !target) return;

    setBusyId(target.id);
    try {
      /*
        Se il documento punta gia a un allegato si sostituiscono i **byte**
        senza cambiare id: il riferimento nella riga resta valido e non esiste
        l'istante in cui punta a un file cancellato. Per i documenti vecchi,
        che il file non ce l'hanno, si carica normalmente.
      */
      const existingId = parseAttachmentReference(target.fileUrl);
      let fileUrl = target.fileUrl;

      if (existingId) {
        const result = await replaceAttachment(existingId, file, file.name);
        if (!result.ok) throw new Error(result.message);
        fileUrl = result.attachment.reference;
      } else {
        if (!organizationId) {
          throw new Error("Nessun club attivo: non so a chi intestare il file");
        }
        fileUrl = await uploadAttachmentReference(file, {
          ownerType: "trainer",
          ownerId: trainerId,
          organizationId,
          category: target.type,
        });
      }

      await onPersist(
        upsertTrainerDocument(documents, {
          ...target,
          fileName: file.name,
          fileUrl,
          uploadedAt: todayLocalDateOnly(),
        }),
      );
      showToast("success", "Documento sostituito");
    } catch (error: any) {
      showToast("error", error?.message || "Non sono riuscito a sostituire il documento");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const document = deleteTarget;
    if (!document) return;
    setBusyId(document.id);
    try {
      await onPersist(removeTrainerDocument(documents, document.id));
      showToast("success", "Documento eliminato");
      setDeleteTarget(null);
    } catch (error: any) {
      showToast("error", error?.message || "Non sono riuscito a eliminare il documento");
    } finally {
      setBusyId(null);
    }
  };

  const columns = React.useMemo<ColumnDef<TrainerDocument>[]>(
    () => [
      {
        id: "type",
        header: "Tipo",
        kind: "text",
        locked: true,
        width: 1.3,
        minWidth: 150,
        cell: (document) => (
          <span className="block min-w-0">
            <span className="egw-ellipsis block font-semibold">{document.typeLabel}</span>
            {document.title && document.title !== document.fileName ? (
              <span className="egw-ellipsis block text-[10.5px] text-egw-ink-62">{document.title}</span>
            ) : null}
          </span>
        ),
        sortValue: (document) => document.typeLabel,
        title: (document) => document.title || document.typeLabel,
      },
      {
        id: "fileName",
        header: "Nome file",
        kind: "text",
        width: 1.6,
        minWidth: 160,
        cell: (document) => <span className="egw-ellipsis block">{document.fileName}</span>,
        sortValue: (document) => document.fileName,
        title: (document) => document.fileName,
      },
      {
        id: "uploadedAt",
        header: "Caricato",
        kind: "date",
        width: 0.9,
        minWidth: 110,
        cell: (document) => <span className="egw-num">{formatDateShort(document.uploadedAt)}</span>,
        sortValue: (document) => document.uploadedAt || null,
      },
      {
        id: "expiryDate",
        header: "Scadenza",
        kind: "date",
        width: 0.9,
        minWidth: 110,
        cell: (document) => <span className="egw-num">{formatDateShort(document.expiryDate)}</span>,
        sortValue: (document) => document.expiryDate || null,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        width: 1,
        minWidth: 120,
        cell: (document) => <StatusPill status={DOCUMENT_STATUS[resolveTrainerDocumentStatus(document)]} />,
        sortValue: (document) => resolveTrainerDocumentStatus(document),
        exportValue: (document) => DOCUMENT_STATUS[resolveTrainerDocumentStatus(document)].label,
      },
    ],
    [],
  );

  const rowActions = React.useMemo<RowActionDef<TrainerDocument>[]>(
    () => [
      { id: "view", label: "Visualizza", icon: <Eye />, primary: true, onClick: handleView },
      { id: "download", label: "Scarica", icon: <Download />, onClick: handleDownload },
      {
        id: "replace",
        label: "Sostituisci",
        icon: <RefreshCw />,
        hidden: () => !canWrite,
        onClick: (document) => {
          if (busyId) return;
          replaceTargetRef.current = document;
          replaceInputRef.current?.click();
        },
      },
      {
        id: "delete",
        label: "Elimina",
        icon: <Trash2 />,
        tone: "danger",
        hidden: () => !canWrite,
        onClick: (document) => setDeleteTarget(document),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId, canWrite, documents, trainerName],
  );

  return (
    <>
      <DataGrid<TrainerDocument>
        module="allenatore-documenti"
        aria-label="Documenti dell'allenatore"
        rows={documents}
        getRowId={(document) => document.id}
        columns={columns}
        defaultSort={{ columnId: "uploadedAt", direction: "desc" }}
        noun={{ singular: "documento", plural: "documenti" }}
        rowActions={rowActions}
        canSelect={false}
        hideViews
        hideFooter={documents.length <= 25}
        persist={false}
        banner={
          <div className="flex flex-col items-start justify-between gap-3 border-b border-egw-hairline px-4 py-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-brand text-[15px] font-bold text-egw-ink">Documenti</p>
              <p className="font-brand text-[12px] text-egw-ink-62">Contratti, documento d&apos;identità, certificati e assicurazione.</p>
            </div>
            {canWrite ? (
              <Button variant="neutral" size="sm" icon={<Plus />} onClick={openAdd} className="w-full justify-center sm:w-auto">
                Aggiungi documento
              </Button>
            ) : null}
          </div>
        }
        empty={{
          icon: <FileText />,
          title: "Nessun documento caricato",
          description: "Il file resta collegato a questo allenatore e non entra nella sua scheda.",
          primary: canWrite ? (
            <Button variant="neutral" size="sm" icon={<Plus />} onClick={openAdd}>
              Aggiungi documento
            </Button>
          ) : undefined,
        }}
      />

      <input
        ref={replaceInputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={handleReplacePicked}
      />

      <Drawer
        open={addOpen}
        onOpenChange={setAddOpen}
        width="default"
        eyebrow="Documenti"
        title="Nuovo documento"
        description="Il file resta collegato a questo allenatore e non entra nella sua scheda."
        dirty={dirty}
        locked={isSaving}
        footer={
          <>
            <Button variant="primary" onClick={() => void handleAdd()} loading={isSaving}>
              Carica
            </Button>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={isSaving}>
              Annulla
            </Button>
          </>
        }
      >
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <Field label="Tipo" htmlFor="trainer-document-type" required>
              <Select
                id="trainer-document-type"
                value={draft.type}
                onValueChange={(value) => {
                  setDirty(true);
                  setDraft((current) => ({ ...current, type: normalizeTrainerDocumentType(value) }));
                }}
                options={TRAINER_DOCUMENT_TYPES.map((type) => ({ value: type.id, label: type.label }))}
              />
            </Field>
            <Field label="Titolo" htmlFor="trainer-document-title" optional helper="Se lo lasci vuoto uso il nome del file">
              <TextInput
                id="trainer-document-title"
                value={draft.title}
                onChange={(event) => {
                  setDirty(true);
                  setDraft((current) => ({ ...current, title: event.target.value }));
                }}
              />
            </Field>
            <Field label="Scadenza" htmlFor="trainer-document-expiry" optional width="20ch">
              <DateInput
                id="trainer-document-expiry"
                value={draft.expiryDate}
                onChange={(event) => {
                  setDirty(true);
                  setDraft((current) => ({ ...current, expiryDate: event.target.value }));
                }}
              />
            </Field>
            <Field label="File" htmlFor="trainer-document-file" required error={fileError} helper="PDF, immagini e documenti Office, fino a 10 MB.">
              <label
                htmlFor="trainer-document-file"
                className="flex h-[42px] cursor-pointer items-center overflow-hidden rounded-egw-control border border-egw-field-border bg-white font-brand text-[12.5px] focus-within:border-egw-blue focus-within:shadow-egw-focus"
              >
                <span className="flex h-full shrink-0 items-center bg-egw-page-100 px-3 font-semibold text-egw-ink">Scegli il file</span>
                <span className={draft.file ? "egw-ellipsis px-3 text-egw-ink" : "egw-ellipsis px-3 text-egw-ink-42"}>
                  {draft.file ? draft.file.name : "Nessun file scelto"}
                </span>
                <input
                  id="trainer-document-file"
                  type="file"
                  accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
                  className="sr-only"
                  onChange={(event) => {
                    setDirty(true);
                    setFileError(null);
                    setDraft((current) => ({ ...current, file: event.target.files?.[0] || null }));
                  }}
                />
              </label>
            </Field>
          </div>
        </FieldSizeProvider>
      </Drawer>

      <DangerConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Eliminare «${deleteTarget?.title ?? "questo documento"}»?`}
        description="Il documento viene tolto dalla scheda dell'allenatore."
        consequences={deleteTarget ? [`${deleteTarget.typeLabel} · ${deleteTarget.fileName}`] : []}
        confirmLabel="Elimina"
        loading={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onConfirm={handleDelete}
      />
    </>
  );
}
