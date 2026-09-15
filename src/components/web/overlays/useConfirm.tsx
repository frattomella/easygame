"use client";

import * as React from "react";
import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";

/**
 * Una conferma «a promessa», per i flussi che oggi chiedono `window.confirm`
 * nel mezzo di un handler:
 *
 *     const [confirm, confirmDialog] = useConfirm();
 *     if (!(await confirm({ title: "Inserirlo comunque?", description, confirmLabel: "Inserisci" }))) return;
 *     …
 *     return <>{…}{confirmDialog}</>;
 *
 * Il dialogo e quello del sistema (guideline 08 §8.9): `tone: "danger"` usa la
 * conferma distruttiva con le sue conseguenze. Una sola conferma alla volta.
 */
export type ConfirmRequest = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "neutral" | "danger";
  consequences?: React.ReactNode[];
  irreversible?: boolean;
  typedConfirmation?: string;
};

export function useConfirm(): [
  (request: ConfirmRequest) => Promise<boolean>,
  React.ReactNode,
] {
  const [pending, setPending] = React.useState<{ request: ConfirmRequest; resolve: (ok: boolean) => void } | null>(null);

  const confirm = React.useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setPending((current) => {
          current?.resolve(false);
          return { request, resolve };
        });
      }),
    [],
  );

  const settle = (ok: boolean) => {
    setPending((current) => {
      current?.resolve(ok);
      return null;
    });
  };

  const element = pending ? (
    pending.request.tone === "danger" ? (
      <DangerConfirmDialog
        open
        onOpenChange={(open) => !open && settle(false)}
        title={pending.request.title}
        description={pending.request.description}
        confirmLabel={pending.request.confirmLabel}
        consequences={pending.request.consequences}
        irreversible={pending.request.irreversible ?? true}
        typedConfirmation={pending.request.typedConfirmation}
        onConfirm={() => settle(true)}
      />
    ) : (
      <ConfirmDialog
        open
        onOpenChange={(open) => !open && settle(false)}
        title={pending.request.title}
        description={pending.request.description}
        confirmLabel={pending.request.confirmLabel}
        cancelLabel={pending.request.cancelLabel}
        onConfirm={() => settle(true)}
      />
    )
  ) : null;

  return [confirm, element];
}
