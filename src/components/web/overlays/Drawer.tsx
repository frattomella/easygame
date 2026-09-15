"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/web/primitives/Surface";
import { DirtyGuardDialog } from "@/components/web/overlays/Modal";

/**
 * Il cassetto da destra (guideline 06 §6.7): 392 (azioni rapide, ispettore,
 * notifiche) · 480 (crea/modifica) · 720 (modulo a sezioni). Velo
 * `--egw-scrim`, scorre da destra in 220ms, esce in 180ms, chiude con Esc e
 * con il clic sul velo — **tranne** se il modulo e sporco: allora chiede
 * (`dirty` + guardia). Un cassetto non apre un secondo cassetto.
 *
 * `tone="brand"` da all'intestazione il gradiente del cassetto (Azioni
 * rapide); il default e un'intestazione bianca con occhiello e titolo.
 */
export type DrawerWidth = "narrow" | "default" | "wide";

const widths: Record<DrawerWidth, string> = {
  narrow: "w-[392px]",
  default: "w-[480px]",
  wide: "w-[720px]",
};

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: DrawerWidth;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Intestazione in gradiente (solo per il cassetto delle azioni rapide). */
  tone?: "light" | "brand";
  /** Velo con sfocatura (solo azioni rapide e notifiche). */
  blurScrim?: boolean;
  /** Mostra una freccia «indietro» al posto della X e la chiama al clic. */
  onBack?: () => void;
  /** Il modulo ha modifiche non salvate: chiudere chiede conferma. */
  dirty?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Slot a destra del titolo (es. un contatore). */
  headerAside?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Non chiudere con Esc/velo (operazione in corso). */
  locked?: boolean;
  "data-test"?: string;
}

export function Drawer({
  open,
  onOpenChange,
  width = "default",
  title,
  eyebrow,
  description,
  tone = "light",
  blurScrim = false,
  onBack,
  dirty = false,
  footer,
  children,
  headerAside,
  className,
  bodyClassName,
  locked = false,
  ...rest
}: DrawerProps) {
  const [guardOpen, setGuardOpen] = React.useState(false);

  const requestClose = React.useCallback(() => {
    if (locked) return;
    if (dirty) {
      setGuardOpen(true);
      return;
    }
    onOpenChange(false);
  }, [dirty, locked, onOpenChange]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
        else onOpenChange(true);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "egw-scrim fixed inset-0 z-[55] bg-[var(--egw-scrim)]",
            blurScrim && "backdrop-blur-[5px]",
          )}
        />
        <DialogPrimitive.Content
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            requestClose();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
            requestClose();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          className={cn(
            "egw-drawer-panel fixed inset-y-0 right-0 z-[56] flex max-w-[100vw] flex-col bg-egw-page font-brand shadow-egw-plane-drawer outline-none",
            widths[width],
            className,
          )}
          data-test={rest["data-test"]}
        >
          <header
            className={cn(
              "shrink-0",
              tone === "brand"
                ? "bg-egw-drawer px-[22px] pb-5 pt-[22px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]"
                : "border-b border-egw-hairline bg-white px-6 pb-4 pt-5",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {onBack ? (
                    <button
                      type="button"
                      onClick={onBack}
                      aria-label="Indietro"
                      className={cn(
                        "-ml-1 inline-flex h-7 w-7 items-center justify-center rounded-egw-chip focus-visible:outline-none",
                        tone === "brand"
                          ? "text-white/85 hover:bg-white/16 focus-visible:shadow-egw-focus-dark"
                          : "text-egw-ink-62 hover:bg-egw-page-100 focus-visible:shadow-egw-focus",
                      )}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  ) : null}
                  {eyebrow ? (
                    <Eyebrow tone={tone === "brand" ? "white" : "ink"}>{eyebrow}</Eyebrow>
                  ) : null}
                </div>
                <DialogPrimitive.Title
                  className={cn(
                    "mt-1.5 font-brand font-extrabold tracking-[var(--egw-track-display)]",
                    tone === "brand" ? "text-[21px] leading-[1.15] text-white" : "text-[20px] leading-6 text-egw-ink",
                  )}
                >
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description
                    className={cn(
                      "mt-1.5 text-[11.5px] leading-[1.5]",
                      tone === "brand" ? "text-white/80" : "text-egw-ink-62",
                    )}
                  >
                    {description}
                  </DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {headerAside}
                {!locked ? (
                  <button
                    type="button"
                    onClick={requestClose}
                    aria-label="Chiudi"
                    className={cn(
                      "inline-flex h-[30px] w-[30px] items-center justify-center rounded-egw-chip border transition-colors duration-hover focus-visible:outline-none",
                      tone === "brand"
                        ? "border-white/30 bg-white/16 text-white hover:bg-white/24 focus-visible:shadow-egw-focus-dark"
                        : "border-egw-control-border bg-white text-egw-ink-62 hover:bg-egw-page-100 focus-visible:shadow-egw-focus",
                    )}
                  >
                    <X className="h-[15px] w-[15px]" />
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div className={cn("egw-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <footer className="shrink-0 border-t border-egw-hairline bg-white px-6 py-4">
              <div className="flex flex-wrap items-center gap-2.5">{footer}</div>
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      <DirtyGuardDialog
        open={guardOpen}
        onOpenChange={setGuardOpen}
        onDiscard={() => {
          setGuardOpen(false);
          onOpenChange(false);
        }}
      />
    </DialogPrimitive.Root>
  );
}

/** Una sezione del corpo del cassetto: occhiello + blocco. */
export function DrawerSection({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-6 last:mb-0", className)}>
      {eyebrow ? <Eyebrow className="mb-3">{eyebrow}</Eyebrow> : null}
      {title ? (
        <h3 className="mb-3 font-brand text-[13.5px] font-bold text-egw-ink">{title}</h3>
      ) : null}
      {children}
    </section>
  );
}
