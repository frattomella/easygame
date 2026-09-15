"use client";

import * as React from "react";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { Field, FieldSizeProvider, TextInput } from "@/components/web/forms/Field";

/**
 * Una conferma **con un motivo obbligatorio** (guideline 08 §8.9, azione
 * notevole: modale da 460, nessuna conferma scritta). Serve a due atti del
 * dominio che la V1 chiedeva con `window.prompt` e con un dialogo fatto in
 * casa: la **cessazione** di un rapporto e lo **storno** di un'erogazione.
 * Il motivo non e decorazione: il server lo pretende e lo scrive sulla riga.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  reasonLabel = "Motivo",
  placeholder,
  emptyError,
  tone = "neutral",
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  reasonLabel?: string;
  placeholder?: string;
  emptyError: string;
  tone?: "neutral" | "danger";
  loading?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) return;
    setReason("");
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!reason.trim()) {
      setError(emptyError);
      return;
    }
    await onConfirm(reason.trim());
  };

  return (
    <ConfirmDialog open={open} onOpenChange={onOpenChange} title={title} description={description} confirmLabel={confirmLabel} onConfirm={submit} loading={loading} tone={tone}>
      <FieldSizeProvider size="sm">
        <Field label={reasonLabel} htmlFor={id} required error={error}>
          <TextInput
            id={id}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError(null);
            }}
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            autoFocus
          />
        </Field>
      </FieldSizeProvider>
    </ConfirmDialog>
  );
}
