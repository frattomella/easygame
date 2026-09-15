"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import type { DocumentReviewRow } from "@/lib/documents/review-queue";
import { reviewQueueStatusSpec, reviewSourceLabel, type ReviewDecision } from "@/components/documents/v2/review-queue-model";

/**
 * La decisione su un documento consegnato (guideline 08 §8.5: un cassetto da
 * 480 per un modulo di un campo; il modale confermerebbe soltanto, e qui c'e
 * un motivo da scrivere).
 *
 * Sostituisce la card «Approvi «…»?» / «Chiedi di rifare «…»» che la V1
 * montava in fondo alla pagina. Le parole restano quelle: chi preme
 * «Rifiuta» non sta chiudendo una porta, sta chiedendo un altro file — nel
 * dominio «Rifiuta» e «richiedi integrazione» sono **una** transizione
 * (`under_review` → `rejected`, PP-02 §H), e la differenza fra le due parole
 * e solo dire cosa succede dopo.
 *
 * Il motivo del rifiuto e obbligatorio: lo pretende il server
 * (`explainDocumentDecisionNoteDenial`), e chiederlo dopo l'errore vorrebbe
 * dire far scoprire la regola con un messaggio rosso. Finche il campo e vuoto
 * l'invio non parte.
 */
export function DocumentDecisionDrawer({
  open,
  onOpenChange,
  row,
  decision,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: DocumentReviewRow | null;
  decision: ReviewDecision;
  /** Riceve il motivo (o la nota) gia ripulito; `null` se vuoto. */
  onConfirm: (note: string | null) => Promise<void>;
  loading?: boolean;
}) {
  const [motivo, setMotivo] = React.useState("");
  const noteId = React.useId();

  React.useEffect(() => {
    if (open) setMotivo("");
  }, [open, row, decision]);

  const rejecting = decision === "rejected";
  const canSend = !loading && (!rejecting || Boolean(motivo.trim()));
  const title = row ? (rejecting ? `Chiedi di rifare «${row.title}»` : `Approvi «${row.title}»?`) : "";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={rejecting ? "Rifiuta il documento" : "Approva il documento"}
      title={title}
      description={row ? joinMeta(row.subjectName || "Atleta", row.documentKindLabel) : undefined}
      dirty={Boolean(motivo.trim())}
      locked={loading}
      data-test="document-decision-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void onConfirm(motivo.trim() || null)} disabled={!canSend} loading={loading}>
            Conferma
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        {row ? (
          <DrawerSection eyebrow="Documento">
            <InsetBlock className="flex flex-wrap items-center gap-3">
              <StatusPill status={reviewQueueStatusSpec(row.state)} />
              <span className="font-brand text-[12.5px] text-egw-ink-72">
                {row.submittedAt
                  ? joinMeta(`Caricato il ${formatDateShort(row.submittedAt)}`, row.submittedByName ? `da ${row.submittedByName}` : null, reviewSourceLabel(row.source))
                  : "Nessun file consegnato"}
              </span>
            </InsetBlock>
          </DrawerSection>
        ) : null}

        {rejecting ? (
          <DrawerSection eyebrow="Cosa succede">
            <InsetBlock>
              <p className="font-brand text-[12.5px] leading-[1.55] text-egw-ink-72">
                La richiesta torna aperta e la famiglia la ritrova fra le cose da fare, con il motivo che scrivi qui
                sotto. È la stessa cosa che chiedere un&apos;integrazione.
              </p>
            </InsetBlock>
          </DrawerSection>
        ) : null}

        <DrawerSection eyebrow="Decisione">
          {rejecting ? (
            <Field label="Motivo, obbligatorio" htmlFor={noteId} required helper="Cosa deve rifare la famiglia: senza questo, ricarica lo stesso file.">
              <Textarea id={noteId} value={motivo} onChange={(event) => setMotivo(event.target.value)} rows={3} />
            </Field>
          ) : (
            <Field label="Nota, facoltativa" htmlFor={noteId} optional>
              <Textarea id={noteId} value={motivo} onChange={(event) => setMotivo(event.target.value)} rows={2} />
            </Field>
          )}
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
