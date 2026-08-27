"use client";

import React from "react";
import {
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { ATTACHMENT_ACCEPT_ATTRIBUTE } from "@/lib/attachments";
import {
  replaceAttachment,
  uploadAttachmentReference,
} from "@/lib/api/attachments";
import { parseAttachmentReference } from "@/lib/attachments";
import { downloadAttachment, openClientFileUrl } from "@/lib/client-files";
import {
  TRAINER_DOCUMENT_STATUS_CLASSES,
  TRAINER_DOCUMENT_STATUS_LABELS,
  TRAINER_DOCUMENT_TYPES,
  normalizeTrainerDocumentType,
  removeTrainerDocument,
  resolveTrainerDocumentStatus,
  trainerDocumentDownloadName,
  trainerDocumentTypeLabel,
  upsertTrainerDocument,
  type TrainerDocument,
  type TrainerDocumentTypeId,
} from "@/lib/trainer-documents";

/**
 * I documenti di un allenatore: **una griglia sola**.
 *
 * Prima c'erano due pagine dedicate (`/trainers/:id/contracts` e la sua
 * `/upload`), un riquadro nella scheda che ne mostrava tre senza poterli
 * aprire, e tre posti diversi in cui il documento poteva finire. Nessuno dei
 * tre gesti funzionava: vedi `src/lib/trainer-documents.ts`.
 *
 * Qui c'e una tabella e una finestra leggera per aggiungere. I byte passano
 * da Attachment Core — nessuna seconda logica documentale, nessun file dentro
 * il record — e la riga dell'allenatore conserva solo il riferimento.
 */

const formatDate = (value: string) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
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
    const ok = downloadAttachment(
      document.fileUrl,
      trainerDocumentDownloadName(document, trainerName),
    );
    if (!ok) {
      showToast("error", "Il file di questo documento non e disponibile.");
    }
  };

  const handleAdd = async () => {
    if (!draft.file) {
      showToast("error", "Scegli il file da caricare");
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
        uploadedAt: new Date().toISOString().slice(0, 10),
        expiryDate: draft.expiryDate,
        notes: "",
      };

      await onPersist(upsertTrainerDocument(documents, document));
      setAddOpen(false);
      setDraft(emptyDraft());
      showToast("success", "Documento caricato");
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Non sono riuscito a caricare il documento",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplacePicked = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
          uploadedAt: new Date().toISOString().slice(0, 10),
        }),
      );
      showToast("success", "Documento sostituito");
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Non sono riuscito a sostituire il documento",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (document: TrainerDocument) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Eliminare «${document.title}»?`)
    ) {
      return;
    }

    setBusyId(document.id);
    try {
      await onPersist(removeTrainerDocument(documents, document.id));
      showToast("success", "Documento eliminato");
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Non sono riuscito a eliminare il documento",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documenti
        </CardTitle>
        {canWrite ? (
          <Button
            onClick={() => {
              setDraft(emptyDraft());
              setAddOpen(true);
            }}
            className="w-full justify-center gap-2 bg-blue-600 hover:bg-blue-700 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Aggiungi documento
          </Button>
        ) : null}
      </CardHeader>

      <CardContent>
        {documents.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FileText className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p>Nessun documento caricato</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Nome file</th>
                  <th className="py-2 pr-3 font-medium">Caricato</th>
                  <th className="py-2 pr-3 font-medium">Scadenza</th>
                  <th className="py-2 pr-3 font-medium">Stato</th>
                  <th className="py-2 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => {
                  const status = resolveTrainerDocumentStatus(document);
                  const busy = busyId === document.id;

                  return (
                    <tr key={document.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{document.typeLabel}</span>
                        {document.title &&
                        document.title !== document.fileName ? (
                          <span className="block text-xs text-muted-foreground">
                            {document.title}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[16rem] truncate py-2 pr-3">
                        {document.fileName}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 eg-tabular">
                        {formatDate(document.uploadedAt)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 eg-tabular">
                        {formatDate(document.expiryDate)}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant="outline"
                          className={TRAINER_DOCUMENT_STATUS_CLASSES[status]}
                        >
                          {TRAINER_DOCUMENT_STATUS_LABELS[status]}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Visualizza"
                            aria-label={`Visualizza ${document.title}`}
                            onClick={() => handleView(document)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Scarica"
                            aria-label={`Scarica ${document.title}`}
                            onClick={() => handleDownload(document)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {canWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Sostituisci"
                                aria-label={`Sostituisci ${document.title}`}
                                disabled={busy}
                                onClick={() => {
                                  replaceTargetRef.current = document;
                                  replaceInputRef.current?.click();
                                }}
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Elimina"
                                aria-label={`Elimina ${document.title}`}
                                disabled={busy}
                                onClick={() => handleDelete(document)}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <input
        ref={replaceInputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={handleReplacePicked}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo documento</DialogTitle>
            <DialogDescription>
              Il file resta collegato a questo allenatore e non entra nella sua
              scheda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trainer-document-type">Tipo</Label>
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    type: normalizeTrainerDocumentType(value),
                  }))
                }
              >
                <SelectTrigger id="trainer-document-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINER_DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainer-document-title">
                Titolo <span className="text-muted-foreground">(facoltativo)</span>
              </Label>
              <Input
                id="trainer-document-title"
                value={draft.title}
                placeholder="Se lo lasci vuoto uso il nome del file"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainer-document-expiry">
                Scadenza{" "}
                <span className="text-muted-foreground">(facoltativa)</span>
              </Label>
              <Input
                id="trainer-document-expiry"
                type="date"
                value={draft.expiryDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    expiryDate: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainer-document-file">File</Label>
              <Input
                id="trainer-document-file"
                type="file"
                accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    file: event.target.files?.[0] || null,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                PDF, immagini e documenti Office, fino a 10 MB.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={isSaving}
            >
              Annulla
            </Button>
            <Button onClick={handleAdd} disabled={isSaving || !draft.file}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Carica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
