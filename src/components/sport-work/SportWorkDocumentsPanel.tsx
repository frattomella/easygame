"use client";

import React from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  deleteAttachmentById,
  listAttachmentsFor,
  uploadAttachment,
} from "@/lib/api/attachments";
import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  buildAttachmentUrl,
  type AttachmentMetadata,
} from "@/lib/attachments";
import {
  SPORT_WORK_ATTACHMENT_OWNERS,
  SPORT_WORK_DOCUMENT_CATEGORIES,
  SPORT_WORK_DOCUMENT_CATEGORY_LABELS,
  type SportWorkDocumentCategory,
} from "@/lib/sport-work/model";
import { formatDate } from "./sport-work-format";

/**
 * I documenti di un rapporto e della sua persona.
 *
 * **Nessun archivio nuovo**: sono righe di Attachment Core, con
 * `owner_type = sport_work_relationship` oppure `sport_work_person`. I byte
 * stanno dove stanno tutti gli altri byte del prodotto.
 *
 * **Due proprietari e non uno**, perche i documenti si dividono in due gruppi
 * che vivono tempi diversi: contratto e comunicazioni finiscono con il
 * rapporto; documento d'identita, autocertificazione e coordinate bancarie
 * restano addosso alla persona anche quando cambia societa.
 *
 * **Allegare un contratto scrive il riferimento sul rapporto.** Non e un
 * automatismo di comodo: e la condizione che sblocca l'attivazione, e farla
 * dipendere da un secondo gesto — «allega» e poi «collega» — significherebbe
 * che qualcuno si dimentichera del secondo, e il rapporto resterebbe in bozza
 * con il contratto gia caricato.
 */

const RELATIONSHIP_CATEGORIES: SportWorkDocumentCategory[] = [
  "CONTRACT",
  "MANDATE",
  "COMMUNICATION",
  "INVOICE",
  "PAYSLIP",
  "EXPENSE_RECEIPT",
  "OTHER",
];

const PERSON_CATEGORIES: SportWorkDocumentCategory[] = [
  "IDENTITY_DOCUMENT",
  "SELF_DECLARATION",
  "VAT_DOCUMENT",
  "BANK_DETAILS",
  "OTHER",
];

export function SportWorkDocumentsPanel({
  relationshipId,
  personId,
  canManage,
  onContractAttached,
}: {
  relationshipId: string;
  personId: string;
  canManage: boolean;
  onContractAttached?: () => void;
}) {
  const { showToast } = useToast();
  const [relationshipDocs, setRelationshipDocs] = React.useState<
    AttachmentMetadata[]
  >([]);
  const [personDocs, setPersonDocs] = React.useState<AttachmentMetadata[]>([]);
  const [category, setCategory] =
    React.useState<SportWorkDocumentCategory>("CONTRACT");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const load = React.useCallback(async () => {
    const [onRelationship, onPerson] = await Promise.all([
      listAttachmentsFor(
        SPORT_WORK_ATTACHMENT_OWNERS.relationship,
        relationshipId,
      ),
      listAttachmentsFor(SPORT_WORK_ATTACHMENT_OWNERS.person, personId),
    ]);
    setRelationshipDocs(onRelationship);
    setPersonDocs(onPerson);
  }, [relationshipId, personId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const isPersonCategory = PERSON_CATEGORIES.includes(category);

  const handleUpload = async (file: File) => {
    setBusy(true);

    const result = await uploadAttachment({
      file,
      ownerType: isPersonCategory
        ? SPORT_WORK_ATTACHMENT_OWNERS.person
        : SPORT_WORK_ATTACHMENT_OWNERS.relationship,
      ownerId: isPersonCategory ? personId : relationshipId,
      category,
    });

    if (!result.ok) {
      setBusy(false);
      showToast("error", result.message);
      return;
    }

    if (category === "CONTRACT") {
      const { error } = await apiRequest(
        `/api/v1/sport-work/relationships/${encodeURIComponent(relationshipId)}`,
        {
          method: "PATCH",
          body: {
            contractAttachmentId: result.attachment.id,
            signatureState: "SIGNED",
          },
        },
      );
      if (error) {
        showToast(
          "error",
          "Documento caricato, ma il collegamento al rapporto non e riuscito",
        );
      } else {
        onContractAttached?.();
      }
    }

    setBusy(false);
    showToast("success", "Documento allegato");
    await load();
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    const done = await deleteAttachmentById(id);
    setBusy(false);
    if (!done) {
      showToast("error", "Eliminazione non riuscita");
      return;
    }
    showToast("success", "Documento eliminato");
    await load();
  };

  const renderDocs = (docs: AttachmentMetadata[], title: string, hint: string) => (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun documento.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-gray-700 dark:border-gray-700">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <a
                href={buildAttachmentUrl(doc.id, { download: doc.fileName })}
                className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{doc.fileName}</span>
              </a>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {SPORT_WORK_DOCUMENT_CATEGORY_LABELS[
                    doc.category as SportWorkDocumentCategory
                  ] || doc.category}{" "}
                  · {formatDate(doc.createdAt)}
                </span>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => handleDelete(doc.id)}
                    aria-label={`Elimina ${doc.fileName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documenti</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Contratto, documento d&apos;identita, autocertificazioni,
          comunicazioni. Stessi allegati del resto del prodotto: non esiste un
          secondo archivio.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {canManage ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label>Tipo di documento</Label>
              <Select
                value={category}
                onValueChange={(value) =>
                  setCategory(value as SportWorkDocumentCategory)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPORT_WORK_DOCUMENT_CATEGORIES.filter((value) =>
                    RELATIONSHIP_CATEGORIES.includes(value) ||
                    PERSON_CATEGORIES.includes(value),
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {SPORT_WORK_DOCUMENT_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleUpload(file);
              }}
            />
            <Button
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="mr-2 h-4 w-4" />
              {busy ? "Caricamento…" : "Allega"}
            </Button>
          </div>
        ) : null}

        {category === "CONTRACT" && canManage ? (
          <p className="rounded-md bg-blue-50 p-3 text-xs text-blue-900">
            Allegando il contratto il rapporto lo registra come proprio e passa
            a «firmato»: e la condizione che sblocca l&apos;attivazione.
          </p>
        ) : null}

        {renderDocs(
          relationshipDocs,
          "Documenti del rapporto",
          "Finiscono quando finisce il rapporto: contratto, comunicazioni, fatture.",
        )}
        {renderDocs(
          personDocs,
          "Documenti della persona",
          "Restano alla persona: identita, autocertificazioni, coordinate bancarie.",
        )}
      </CardContent>
    </Card>
  );
}
