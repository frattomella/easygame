"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { DangerConfirmDialog, Modal } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import type { DocumentTemplateSummary, TemplateIssue } from "@/lib/api/documents";

/**
 * Perche non si puo pubblicare: chiave per chiave. «Non si puo pubblicare»
 * e basta manda una segreteria a chiamare l'assistenza; ogni riga dice la
 * parola che lo impedisce. Un modale informativo (guideline 08 §8.9,
 * «Blocked»: non una conferma, una spiegazione).
 */
export function PublishIssuesDialog({ issues, onClose }: { issues: TemplateIssue[] | null; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(issues)}
      onOpenChange={(open) => !open && onClose()}
      title="Questo modello non si può pubblicare"
      description="Correggi il testo del modello e riprova. Ogni riga dice la parola che lo impedisce."
      icon={<AlertCircle />}
      tone="danger"
      footer={
        <Button variant="primary" onClick={onClose}>
          Ho capito
        </Button>
      }
    >
      <ul className="flex flex-col gap-2">
        {(issues || []).map((issue, index) => (
          <li key={`${issue.field}-${issue.key || index}`} className="rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-4 py-3">
            {issue.key ? <p className="egw-num font-brand text-[11.5px] font-bold text-egw-red">{issue.key}</p> : null}
            <p className="break-words font-brand text-[12.5px] text-egw-ink">{issue.message}</p>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * Cancellare un modello: ammesso solo per uno che non ha prodotto niente.
 * Con documenti gia prodotti non e una conferma, e una spiegazione
 * (guideline 08 §8.9 «Blocked»: il pulsante distruttivo e assente, non
 * disabilitato) — si ritira, non si cancella, o quei documenti non
 * saprebbero piu spiegarsi. Il server lo rifiuta comunque, con un messaggio
 * scritto per chi lo legge.
 */
export function DeleteTemplateDialog({
  template,
  onOpenChange,
  onConfirm,
  loading,
}: {
  template: DocumentTemplateSummary | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (template: DocumentTemplateSummary) => Promise<void>;
  loading?: boolean;
}) {
  const open = Boolean(template);
  if (template && template.generatedCount > 0) {
    const n = template.generatedCount;
    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={`Non puoi eliminare «${template.title}»`}
        description={`Questo modello ha già prodotto ${n} ${n === 1 ? "documento" : "documenti"}: si ritira, non si cancella, o quei documenti non saprebbero più spiegarsi.`}
        icon={<AlertCircle />}
        tone="danger"
        footer={
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Ho capito
          </Button>
        }
      >
        <InsetBlock>
          <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">
            Un modello ritirato non produce documenti nuovi e continua a spiegare quelli che ha già prodotto. Lo trovi nel menu della riga:
            «Ritira».
          </p>
        </InsetBlock>
      </Modal>
    );
  }
  return (
    <DangerConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminare «${template?.title || ""}»?`}
      description="Il modello non ha prodotto nessun documento: si può eliminare."
      consequences={["Il testo della bozza e le versioni pubblicate", "La provenienza dal catalogo, se ne aveva una"]}
      confirmLabel="Elimina"
      onConfirm={() => (template ? onConfirm(template) : Promise.resolve())}
      loading={loading}
    />
  );
}
