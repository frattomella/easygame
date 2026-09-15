"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/web/primitives/Button";

/**
 * La barra azioni di un modulo a pagina intera (guideline 08 §8.4): 64px,
 * bianca, appiccicata in basso, `Salva` primario e `Annulla` secondario a
 * destra, «Modifiche non salvate» in ambra a sinistra quando il modulo e
 * sporco. Le azioni distruttive **non** stanno qui: vivono nella zona
 * pericolosa in fondo al modulo.
 */
export function StickyActionBar({
  dirty,
  saving,
  onSave,
  onCancel,
  saveLabel = "Salva",
  cancelLabel = "Annulla",
  saveDisabled,
  children,
  className,
  formId,
}: {
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  /** Azioni secondarie in piu (es. «Salva e aggiungi un altro»). */
  children?: React.ReactNode;
  className?: string;
  /** Se il pulsante invia un `<form id=…>`. */
  formId?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-6 flex min-h-16 flex-wrap items-center justify-between gap-3 border-t border-egw-hairline bg-white px-4 py-3 shadow-[0_-1px_0_rgba(11,26,58,.09)] md:-mx-5 md:px-5 lg:-mx-6 lg:px-6 xl:-mx-8 xl:px-8",
        className,
      )}
      data-test="sticky-action-bar"
    >
      <span className={cn("font-brand text-[12px] font-medium", dirty ? "text-egw-amber-ink" : "text-transparent")} aria-live="polite">
        {dirty ? "Modifiche non salvate" : ""}
      </span>
      <div className="flex flex-wrap items-center gap-2.5">
        {children}
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
        ) : null}
        <Button
          variant="primary"
          type={formId ? "submit" : "button"}
          form={formId}
          onClick={formId ? undefined : onSave}
          loading={saving}
          disabled={saveDisabled}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

/** La zona pericolosa in fondo a un modulo: contorno rosso, una riga di conseguenza. */
export function DangerZone({
  title = "Zona pericolosa",
  description,
  action,
  className,
}: {
  title?: React.ReactNode;
  description: React.ReactNode;
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-egw-field border border-egw-tint-red-bd bg-egw-page-100 px-4 py-4", className)} aria-label="Zona pericolosa">
      <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-red">{title}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">{description}</p>
        {action}
      </div>
    </section>
  );
}
