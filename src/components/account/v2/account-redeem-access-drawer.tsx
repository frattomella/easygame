"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { IconChip } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";

/**
 * «Aggiungi un accesso»: un campo, un cassetto da 480. Sostituisce la modale
 * della V1 con lo stesso invio (`POST /api/v1/auth/access/redeem`, fatto da
 * chi lo monta) e lo stesso testo.
 */
export function AccountRedeemAccessDrawer({
  open,
  onOpenChange,
  value,
  loading,
  onValueChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  loading: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Accessi assegnati"
      title="Aggiungi un accesso"
      description="Inserisci il token che il club ti ha condiviso. Se il token è valido e non scaduto, il ruolo viene aggiunto al tuo account."
      dirty={Boolean(value.trim())}
      locked={loading}
      data-test="account-redeem-drawer"
      footer={
        <>
          <Button variant="primary" onClick={onSubmit} loading={loading}>
            Collega accesso
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Chiudi
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <InsetBlock className="flex items-start gap-3">
            <IconChip tone="blue" size={34}>
              <KeyRound />
            </IconChip>
            <div className="min-w-0">
              <p className="font-brand text-[13px] font-semibold text-egw-ink">Token di accesso club</p>
              <p className="mt-0.5 font-brand text-[12px] leading-[1.5] text-egw-ink-62">Il token può avere una scadenza. Inseriscilo prima che venga invalidato dal club che te lo ha condiviso.</p>
            </div>
          </InsetBlock>

          <Field label="Token" htmlFor="access-token" required>
            <TextInput id="access-token" value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="Es. EGCLUB8H2K9" autoComplete="off" spellCheck={false} className="uppercase tracking-[0.18em]" />
          </Field>

          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}
