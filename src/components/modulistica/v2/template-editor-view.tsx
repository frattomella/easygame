"use client";

import * as React from "react";
import { ArrowLeft, Upload } from "lucide-react";
import DocumentEditor from "@/components/forms/DocumentEditor";
import { Button } from "@/components/web/primitives/Button";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Field, Select } from "@/components/web/forms/Field";
import { InfoCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { formatDateShort, MISSING } from "@/lib/web/format";
import type { DocumentTemplateDetail, TemplateSubject } from "@/lib/api/documents";
import { TemplateStateLine } from "@/components/modulistica/v2/template-state";
import { SUBJECT_OPTIONS } from "@/components/modulistica/v2/modulistica-model";

const formatDate = (value: string | null) => (value ? formatDateShort(value) : MISSING);

/**
 * L'editor di un modello (Web V2): l'intestazione con lo stato, il soggetto
 * e «Pubblica», la riga che spiega la differenza fra salvare e pubblicare,
 * le versioni pubblicate, e il foglio visuale.
 *
 * Il foglio e `DocumentEditor` cosi com'e: e l'editor di dominio dei
 * segnaposto (propone solo cio che il soggetto sa riempire, DOC-04) e ha i
 * suoi test. Qui lo si avvolge; non se ne scrive un secondo.
 *
 * **Salvare non e pubblicare.** Salvare corregge la bozza; pubblicare crea
 * una **versione**, e i documenti prodotti da quel momento la citeranno per
 * sempre.
 */
export function TemplateEditorView({
  template,
  subject,
  onSubjectChange,
  canManage,
  onSave,
  onPublish,
  onBack,
  savingDraft,
  publishing,
}: {
  template: DocumentTemplateDetail;
  subject: TemplateSubject;
  onSubjectChange: (subject: TemplateSubject) => void;
  canManage: boolean;
  onSave: (content: string) => void;
  onPublish: () => void;
  onBack: () => void;
  savingDraft?: boolean;
  publishing?: boolean;
}) {
  const subjectId = React.useId();
  return (
    <div className="flex flex-col gap-[18px]">
      <Panel as="header" className="p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Button variant="text" size="sm" icon={<ArrowLeft />} onClick={onBack} className="-ml-2 mb-2">
              Torna alla lista
            </Button>
            <h2 className="break-words font-brand text-[20px] font-extrabold leading-6 tracking-[var(--egw-track-display)] text-egw-ink">{template.title}</h2>
            {template.description ? <p className="mt-1 break-words font-brand text-[12.5px] text-egw-ink-62">{template.description}</p> : null}
            <TemplateStateLine template={template} className="mt-3" />
          </div>
          <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
            <Field label="Di chi parla" htmlFor={subjectId} className="w-full sm:w-56">
              <Select id={subjectId} value={subject} onValueChange={(value) => onSubjectChange(value as TemplateSubject)} options={SUBJECT_OPTIONS} disabled={!canManage} />
            </Field>
            {canManage ? (
              <Button variant="primary" icon={<Upload />} onClick={onPublish} loading={publishing} disabled={savingDraft}>
                Pubblica
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>

      <InfoCard eyebrow="Salvare e pubblicare">
        <strong>Salva</strong> scrive la bozza e non cambia nessun documento già prodotto. <strong>Pubblica</strong> crea una versione, e i
        documenti generati da quel momento la citeranno per sempre: pubblica dopo aver salvato.
      </InfoCard>

      {!canManage ? (
        <AlertBlock severity="info" title="Il modello è in sola lettura">
          Modificare e pubblicare i modelli è riservato a chi amministra il club.
        </AlertBlock>
      ) : null}

      {template.versions.length > 0 ? (
        <Panel className="p-5">
          <PanelHeader eyebrow="Storico" title="Versioni pubblicate" />
          <ul className="flex flex-col divide-y divide-egw-rule">
            {template.versions.map((version) => (
              <li key={version.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 font-brand text-[12.5px] text-egw-ink-72">
                <span className="egw-num font-bold text-egw-ink">Versione {version.version}</span>
                <span className="egw-num">{formatDate(version.publishedAt)}</span>
                <span className="min-w-0 flex-1 break-words">{version.title}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="p-3 lg:p-4">
        <DocumentEditor initialContent={template.draftContent} onSave={onSave} onCancel={onBack} readOnly={!canManage} subject={subject} />
      </Panel>
    </div>
  );
}
