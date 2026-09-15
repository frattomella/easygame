"use client";

import * as React from "react";
import { Download, Eye, FileText, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import {
  getSharedDocumentStatusLabel,
  getSharedDocumentTypeLabel,
} from "@/lib/shared-documents";
import { ATHLETE_RECORD_SECTIONS } from "@/lib/athlete-profile-tabs";
import { FieldList, RecordRowList, RecordSection, sharedDocumentStatus } from "./record-primitives";

/**
 * Le sezioni documentali dell'area **Documenti e sanità**: i documenti
 * condivisi con la famiglia (richiesta, caricamento, approvazione, sollecito),
 * il documento d'identita con i suoi allegati, e gli altri documenti.
 *
 * Il rifiuto di un documento **non** passa piu da `window.prompt` (l'unico
 * punto della V1 che lo usava): la pagina apre un dialogo con il motivo.
 */

type AthleteLike = Record<string, any>;

/* ── Documenti condivisi con la famiglia ──────────────────────────────── */
export type SharedDocumentLike = {
  id: string;
  title?: string;
  status?: string;
  documentType?: string;
  uploadedByRole?: string;
  fileName?: string;
  description?: string;
  dueDate?: string;
  rejectionReason?: string;
  assetId?: string | null;
};

const APPROVABLE = new Set(["under_review", "uploaded", "rejected"]);
const REMINDABLE = new Set(["required", "rejected", "expired"]);

export function AthleteSharedDocumentsPanel({
  athleteId,
  documents,
  busy,
  onRefresh,
  onRequest,
  onUpload,
  onCompileForm,
  onApprove,
  onReject,
  onRemind,
  onDelete,
}: {
  athleteId: string;
  documents: SharedDocumentLike[];
  busy: boolean;
  onRefresh: () => void;
  onRequest: () => void;
  onUpload: () => void;
  onCompileForm: () => void;
  onApprove: (documentId: string) => void;
  onReject: (documentId: string) => void;
  onRemind: (documentId: string) => void;
  onDelete: (documentId: string) => void;
}) {
  return (
    <RecordSection
      id={ATHLETE_RECORD_SECTIONS.condivisi}
      eyebrow="Famiglia"
      title="Documenti condivisi con la famiglia"
      description="Richiedi, condividi, approva o rifiuta i documenti visibili alla famiglia. L'atleta è già selezionato e i dati che EasyGame conosce arrivano precompilati nei moduli."
      actions={
        <IconButton aria-label="Aggiorna i documenti condivisi" variant="secondary" size="sm" loading={busy} onClick={onRefresh}>
          <RefreshCw />
        </IconButton>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<FileText />} onClick={onRequest}>
          Richiedi documento
        </Button>
        <Button variant="secondary" size="sm" icon={<Upload />} onClick={onUpload}>
          Carica documento club
        </Button>
        <Button variant="secondary" size="sm" icon={<FileText />} onClick={onCompileForm}>
          Compila modulo
        </Button>
      </div>
      <RecordRowList
        aria-label="Documenti condivisi con la famiglia"
        rows={documents.map((document) => {
          const state = String(document.status || "");
          return {
            id: document.id,
            title: document.title || "Documento",
            meta: joinMeta(
              document.uploadedByRole === "parent" ? "Caricato dalla famiglia" : "Creato dal club",
              document.fileName || null,
              document.dueDate ? `Scadenza ${formatDateShort(document.dueDate)}` : null,
            ),
            detail: (
              <>
                {document.description ? <span className="block">{document.description}</span> : null}
                {document.rejectionReason ? (
                  <span className="block font-semibold text-egw-red">Motivo rifiuto: {document.rejectionReason}</span>
                ) : null}
              </>
            ),
            status: (
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusPill status={sharedDocumentStatus(state, getSharedDocumentStatusLabel(document.status))} size="sm" />
                <DataChip size="sm">{getSharedDocumentTypeLabel(document.documentType)}</DataChip>
              </span>
            ),
            actions: (
              <>
                {document.assetId ? (
                  <>
                    <Button variant="row" size="xs" asChild>
                      <a href={`/api/athletes/${athleteId}/documents/${document.id}/file`} target="_blank" rel="noreferrer">
                        <Eye className="h-[15px] w-[15px]" />
                        Visualizza
                      </a>
                    </Button>
                    <Button variant="row" size="xs" asChild>
                      <a
                        /* `?download` distingue le due azioni lato server (RC Fix 1, punto 8). */
                        href={`/api/athletes/${athleteId}/documents/${document.id}/file?download=1`}
                        download={document.fileName || document.title}
                      >
                        <Download className="h-[15px] w-[15px]" />
                        Scarica
                      </a>
                    </Button>
                  </>
                ) : null}
                {document.uploadedByRole === "parent" && APPROVABLE.has(state) ? (
                  <>
                    <Button variant="neutral" size="xs" disabled={busy} onClick={() => onApprove(document.id)}>
                      Approva
                    </Button>
                    <Button variant="row" size="xs" disabled={busy} onClick={() => onReject(document.id)}>
                      Rifiuta
                    </Button>
                  </>
                ) : null}
                {REMINDABLE.has(state) ? (
                  <Button variant="row" size="xs" disabled={busy} onClick={() => onRemind(document.id)}>
                    Sollecita
                  </Button>
                ) : null}
                <IconButton aria-label={`Archivia il documento ${document.title || ""}`} disabled={busy} onClick={() => onDelete(document.id)}>
                  <Trash2 />
                </IconButton>
              </>
            ),
          };
        })}
        empty="Nessun documento condiviso o richiesto."
      />
    </RecordSection>
  );
}

/* ── Documento d'identita ──────────────────────────────────────────────── */
export const summarizeIdentityDocument = (athlete: AthleteLike) =>
  joinMeta(
    athlete.documentType || null,
    athlete.documentNumber || null,
    athlete.documentExpiry ? `scade ${formatDateShort(athlete.documentExpiry)}` : null,
  ) || "Nessun documento registrato";

export function AthleteIdentityDocumentFields({ athlete }: { athlete: AthleteLike }) {
  return (
    <FieldList
      columns={2}
      fields={[
        { label: "Tipo di documento", value: athlete.documentType },
        { label: "Numero documento", value: athlete.documentNumber ? <span className="egw-num">{athlete.documentNumber}</span> : null },
        { label: "Rilascio", value: athlete.documentIssue ? formatDateShort(athlete.documentIssue) : null },
        { label: "Scadenza", value: athlete.documentExpiry ? formatDateShort(athlete.documentExpiry) : null },
        { label: "Scadenza permesso di soggiorno", value: athlete.residencePermitExpiry ? formatDateShort(athlete.residencePermitExpiry) : null, wide: true },
      ]}
    />
  );
}

/* ── Allegati (documento d'identita, altri documenti) ──────────────────── */
export type StoredDocumentLike = {
  id: string;
  name?: string;
  type?: string;
  notes?: string;
  fileName?: string;
  fileUrl?: string;
  uploadDate?: string;
};

export function AthleteStoredDocumentsList({
  documents,
  fallbackType,
  empty,
  onView,
  onDownload,
  onDelete,
  "aria-label": ariaLabel,
}: {
  documents: StoredDocumentLike[];
  fallbackType: string;
  empty: string;
  onView: (document: StoredDocumentLike) => void;
  onDownload: (document: StoredDocumentLike) => void;
  onDelete: (document: StoredDocumentLike) => void;
  "aria-label": string;
}) {
  return (
    <RecordRowList
      aria-label={ariaLabel}
      rows={documents.map((document, index) => ({
        id: String(document.id || index),
        title: document.name || fallbackType,
        meta: joinMeta(document.type || fallbackType, document.fileName || null, document.notes || null),
        aside: document.uploadDate ? formatDateShort(document.uploadDate) : null,
        actions: (
          <>
            <IconButton aria-label={`Visualizza ${document.name || fallbackType}`} onClick={() => onView(document)}>
              <Eye />
            </IconButton>
            <IconButton aria-label={`Scarica ${document.name || fallbackType}`} onClick={() => onDownload(document)}>
              <Download />
            </IconButton>
            <IconButton aria-label={`Elimina ${document.name || fallbackType}`} onClick={() => onDelete(document)}>
              <Trash2 />
            </IconButton>
          </>
        ),
      }))}
      empty={empty}
    />
  );
}

export function AddDocumentAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" icon={<Plus />} onClick={onClick}>
      {label}
    </Button>
  );
}
