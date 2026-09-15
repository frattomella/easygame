"use client";

import * as React from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { deleteAttachmentById, listAttachmentsFor, uploadAttachment } from "@/lib/api/attachments";
import { ATTACHMENT_ACCEPT_ATTRIBUTE, buildAttachmentUrl, type AttachmentMetadata } from "@/lib/attachments";
import { SPORT_WORK_ATTACHMENT_OWNERS, SPORT_WORK_DOCUMENT_CATEGORIES, SPORT_WORK_DOCUMENT_CATEGORY_LABELS, type SportWorkDocumentCategory } from "@/lib/sport-work/model";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Panel, PanelHeader, InsetBlock, Eyebrow } from "@/components/web/primitives/Surface";
import { DataChip, IconChip } from "@/components/web/primitives/StatusPill";
import { Field, FieldSizeProvider, Select } from "@/components/web/forms/Field";
import { InfoCard } from "@/components/web/page/Cards";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import { documentCategoryLabel } from "@/components/sport-work/v2/sport-work-model";

/**
 * I documenti di un rapporto e della sua persona (Web V2).
 *
 * **Nessun archivio nuovo**: sono righe di Attachment Core, con
 * `owner_type = sport_work_relationship` oppure `sport_work_person`. Due
 * proprietari perche i documenti vivono tempi diversi: contratto e
 * comunicazioni finiscono con il rapporto; identita, autocertificazione e
 * coordinate bancarie restano alla persona.
 *
 * **Allegare un contratto scrive il riferimento sul rapporto** (`PATCH` con
 * `contractAttachmentId` + `signatureState: "SIGNED"`): e la condizione che
 * sblocca l'attivazione. L'eliminazione, che nella V1 non chiedeva niente,
 * passa dalla conferma distruttiva del sistema.
 */
const RELATIONSHIP_CATEGORIES: SportWorkDocumentCategory[] = ["CONTRACT", "MANDATE", "COMMUNICATION", "INVOICE", "PAYSLIP", "EXPENSE_RECEIPT", "OTHER"];
const PERSON_CATEGORIES: SportWorkDocumentCategory[] = ["IDENTITY_DOCUMENT", "SELF_DECLARATION", "VAT_DOCUMENT", "BANK_DETAILS", "OTHER"];

export function DocumentsSection({
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
  const [confirm, confirmDialog] = useConfirm();
  const [relationshipDocs, setRelationshipDocs] = React.useState<AttachmentMetadata[]>([]);
  const [personDocs, setPersonDocs] = React.useState<AttachmentMetadata[]>([]);
  const [category, setCategory] = React.useState<SportWorkDocumentCategory>("CONTRACT");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const load = React.useCallback(async () => {
    const [onRelationship, onPerson] = await Promise.all([
      listAttachmentsFor(SPORT_WORK_ATTACHMENT_OWNERS.relationship, relationshipId),
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
      ownerType: isPersonCategory ? SPORT_WORK_ATTACHMENT_OWNERS.person : SPORT_WORK_ATTACHMENT_OWNERS.relationship,
      ownerId: isPersonCategory ? personId : relationshipId,
      category,
    });
    if (!result.ok) {
      setBusy(false);
      showToast("error", result.message);
      return;
    }
    if (category === "CONTRACT") {
      const { error } = await apiRequest(`/api/v1/sport-work/relationships/${encodeURIComponent(relationshipId)}`, {
        method: "PATCH",
        body: { contractAttachmentId: result.attachment.id, signatureState: "SIGNED" },
      });
      if (error) showToast("error", "Documento caricato, ma il collegamento al rapporto non è riuscito");
      else onContractAttached?.();
    }
    setBusy(false);
    showToast("success", "Documento allegato");
    await load();
  };

  const handleDelete = async (doc: AttachmentMetadata) => {
    const ok = await confirm({
      tone: "danger",
      title: `Eliminare ${doc.fileName}?`,
      description: "Il file viene tolto dall'archivio degli allegati.",
      consequences: [`${documentCategoryLabel(doc.category)} del ${formatDateShort(doc.createdAt)}`],
      confirmLabel: "Elimina",
    });
    if (!ok) return;
    setBusy(true);
    const done = await deleteAttachmentById(doc.id);
    setBusy(false);
    if (!done) {
      showToast("error", "Eliminazione non riuscita");
      return;
    }
    showToast("success", "Documento eliminato");
    await load();
  };

  const renderDocs = (docs: AttachmentMetadata[], title: string, hint: string) => (
    <div className="flex flex-col gap-2">
      <div>
        <Eyebrow>{title}</Eyebrow>
        <p className="mt-1 font-brand text-[11.5px] text-egw-ink-62">{hint}</p>
      </div>
      {docs.length === 0 ? (
        <p className="font-brand text-[12.5px] text-egw-ink-62">Nessun documento.</p>
      ) : (
        <InsetBlock className="p-0">
          <ul>
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 border-b border-egw-hairline px-3.5 py-2.5 last:border-0">
                <IconChip tone="neutral" size={34} className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">
                  <FileText />
                </IconChip>
                <div className="min-w-0 flex-1">
                  <a
                    href={buildAttachmentUrl(doc.id, { download: doc.fileName })}
                    target="_blank"
                    rel="noreferrer"
                    className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink hover:underline focus-visible:outline-none focus-visible:shadow-egw-focus"
                  >
                    {doc.fileName}
                  </a>
                  <span className="egw-ellipsis block font-brand text-[11px] text-egw-ink-62">{joinMeta(documentCategoryLabel(doc.category), formatDateShort(doc.createdAt))}</span>
                </div>
                <DataChip size="sm" className="hidden sm:inline-flex">
                  {documentCategoryLabel(doc.category)}
                </DataChip>
                <Button variant="text" size="xs" asChild>
                  <a href={buildAttachmentUrl(doc.id, { download: doc.fileName })} target="_blank" rel="noreferrer">
                    Visualizza
                  </a>
                </Button>
                {canManage ? (
                  <IconButton aria-label={`Elimina ${doc.fileName}`} variant="danger" size="xs" disabled={busy} onClick={() => void handleDelete(doc)}>
                    <Trash2 />
                  </IconButton>
                ) : null}
              </li>
            ))}
          </ul>
        </InsetBlock>
      )}
    </div>
  );

  return (
    <Panel as="section">
      <PanelHeader
        eyebrow="Documenti"
        title="Documenti"
        description="Contratto, documento d'identità, autocertificazioni, comunicazioni. Stessi allegati del resto del prodotto: non esiste un secondo archivio."
      />
      <div className="flex flex-col gap-5">
        {canManage ? (
          <FieldSizeProvider size="sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Tipo di documento" htmlFor="sw-doc-category" className="flex-1">
                <Select
                  id="sw-doc-category"
                  value={category}
                  onValueChange={(value) => setCategory(value as SportWorkDocumentCategory)}
                  options={SPORT_WORK_DOCUMENT_CATEGORIES.filter((value) => RELATIONSHIP_CATEGORIES.includes(value) || PERSON_CATEGORIES.includes(value)).map((value) => ({
                    value,
                    label: SPORT_WORK_DOCUMENT_CATEGORY_LABELS[value],
                  }))}
                />
              </Field>
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
              <Button variant="secondary" icon={<Paperclip />} loading={busy} onClick={() => inputRef.current?.click()}>
                Allega
              </Button>
            </div>
          </FieldSizeProvider>
        ) : null}

        {category === "CONTRACT" && canManage ? (
          <InfoCard eyebrow="Contratto">Allegando il contratto il rapporto lo registra come proprio e passa a «firmato»: è la condizione che sblocca l&apos;attivazione.</InfoCard>
        ) : null}

        {renderDocs(relationshipDocs, "Documenti del rapporto", "Finiscono quando finisce il rapporto: contratto, comunicazioni, fatture.")}
        {renderDocs(personDocs, "Documenti della persona", "Restano alla persona: identità, autocertificazioni, coordinate bancarie.")}
      </div>
      {confirmDialog}
    </Panel>
  );
}
