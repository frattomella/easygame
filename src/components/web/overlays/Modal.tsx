"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/web/primitives/Button";
import { IconChip } from "@/components/web/primitives/StatusPill";

/**
 * Il modale (guideline 06 §6.7, 08 §8.9): 460 per una conferma, 560 per una
 * decisione davvero modale. **Solo conferme**: un modulo va in un cassetto.
 * Sfuma e sale di 8px; chiude con Esc e con il velo, tranne il modale
 * distruttivo, che non si chiude sul velo e non mette il fuoco sul pulsante
 * rosso.
 */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  width?: 460 | 560;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Non chiude sul clic del velo. */
  strict?: boolean;
  icon?: React.ReactNode;
  tone?: "neutral" | "danger";
  /** Chi riceve il fuoco all'apertura (default: il primo focusabile). */
  initialFocusRef?: React.RefObject<HTMLElement>;
  hideClose?: boolean;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  width = 460,
  children,
  footer,
  strict = false,
  icon,
  tone = "neutral",
  initialFocusRef,
  hideClose = false,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="egw-scrim fixed inset-0 z-[65] bg-[var(--egw-scrim)]" />
        <DialogPrimitive.Content
          onPointerDownOutside={strict ? (event) => event.preventDefault() : undefined}
          onInteractOutside={strict ? (event) => event.preventDefault() : undefined}
          onOpenAutoFocus={
            initialFocusRef
              ? (event) => {
                  event.preventDefault();
                  initialFocusRef.current?.focus();
                }
              : undefined
          }
          className={cn(
            "egw-modal-panel fixed left-1/2 top-1/2 z-[66] flex max-h-[calc(100vh-48px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-egw-panel bg-white font-brand shadow-egw-plane-2 outline-none",
          )}
          style={{ maxWidth: width }}
        >
          <div className="flex items-start gap-4 px-6 pt-6">
            {icon ? (
              <IconChip tone={tone === "danger" ? "red" : "blue"} size={40}>
                {icon}
              </IconChip>
            ) : null}
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="font-brand text-[18px] font-extrabold leading-6 tracking-[var(--egw-track-display)] text-egw-ink">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-[1.55] text-egw-ink-72">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            {!hideClose ? (
              <DialogPrimitive.Close
                aria-label="Chiudi"
                className="-mr-2 -mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-egw-chip text-egw-ink-62 hover:bg-egw-page-100 focus-visible:outline-none focus-visible:shadow-egw-focus"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            ) : null}
          </div>
          {children ? (
            <div className="egw-scroll min-h-0 flex-1 overflow-y-auto px-6 pt-4">{children}</div>
          ) : null}
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 pb-6 pt-5">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Conferma «notevole, reversibile» (§8.9): titolo che nomina l'azione, una riga
 * di conseguenza, `Annulla` + il verbo come primario. Niente da scrivere.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annulla",
  onConfirm,
  loading,
  tone = "neutral",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  tone?: "neutral" | "danger";
  children?: React.ReactNode;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      onOpenChange={loading ? () => {} : onOpenChange}
      title={title}
      description={description}
      tone={tone}
      icon={tone === "danger" ? <XCircle /> : undefined}
      strict={tone === "danger"}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={() => void onConfirm()}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/**
 * Conferma distruttiva (§8.9): blocco rosso con **cosa se ne va**, la riga
 * «Questa operazione non e reversibile.», e — per le operazioni irreversibili
 * o ampie — la conferma scritta: il primario resta disabilitato finche il
 * testo non coincide, maiuscole comprese.
 */
export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel,
  onConfirm,
  loading,
  typedConfirmation,
  irreversible = true,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Le righe di «cosa va via con lui». */
  consequences?: React.ReactNode[];
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  /** La parola da scrivere (`ELIMINA` o il nome del record). Assente = nessuna. */
  typedConfirmation?: string;
  irreversible?: boolean;
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = React.useState("");
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const matches = !typedConfirmation || typed === typedConfirmation;
  const inputId = React.useId();

  return (
    <Modal
      open={open}
      onOpenChange={loading ? () => {} : onOpenChange}
      title={title}
      description={description}
      tone="danger"
      icon={<AlertTriangle />}
      strict
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Annulla
          </Button>
          <Button variant="danger" onClick={() => void onConfirm()} loading={loading} disabled={!matches}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {consequences && consequences.length ? (
        <div className="rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-4 py-3">
          <ul className="space-y-1 text-[12.5px] font-medium text-egw-ink">
            {consequences.map((row, index) => (
              <li key={index} className="flex items-start gap-2">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-egw-red" />
                <span>{row}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {irreversible ? (
        <p className="mt-3 text-[12.5px] font-semibold text-egw-red">
          Questa operazione non è reversibile.
        </p>
      ) : null}
      {children}
      {typedConfirmation ? (
        <div className="mt-4">
          <label htmlFor={inputId} className="mb-2 block text-[12px] font-semibold text-egw-ink-62">
            Scrivi <strong className="text-egw-ink">{typedConfirmation}</strong> per confermare
          </label>
          <input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-[46px] w-full rounded-egw-field border border-egw-field-border bg-egw-page-100 px-3.5 font-brand text-[13.5px] text-egw-ink shadow-[inset_0_1px_2px_rgba(11,26,58,.05)] outline-none placeholder:text-egw-ink-42 focus:border-[1.5px] focus:border-egw-red focus:bg-white focus:shadow-egw-focus-danger"
          />
        </div>
      ) : null}
    </Modal>
  );
}

/** La guardia sulle modifiche non salvate (guideline 06 §6.7). */
export function DirtyGuardDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  const keepRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Modifiche non salvate"
      description="Se chiudi ora perdi le modifiche a questa scheda."
      strict
      initialFocusRef={keepRef}
      footer={
        <>
          <Button ref={keepRef} variant="secondary" onClick={() => onOpenChange(false)}>
            Continua a modificare
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Chiudi senza salvare
          </Button>
        </>
      }
    />
  );
}
