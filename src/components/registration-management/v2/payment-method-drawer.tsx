"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, TextInput, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { Toggle } from "@/components/web/primitives/Controls";

/**
 * Il metodo di pagamento manuale (bonifico, contanti, …) in un cassetto da
 * 480: e il dialogo «Nuovo Metodo di Pagamento» della V1 con i suoi tre
 * campi — nome (obbligatorio), dettagli, attivo — e lo stesso messaggio di
 * validazione. La scrittura resta della pagina (`saveClubSettings` su
 * `settings.paymentMethods`, serializzata da `payment-config-utils`).
 */
export type PaymentMethodDraft = { name: string; details: string; active: boolean };

const emptyMethod = (): PaymentMethodDraft => ({ name: "", details: "", active: true });

export function PaymentMethodDrawer({
  open,
  onOpenChange,
  method,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  method: { id: string; name: string; details: string; active: boolean } | null;
  saving: boolean;
  onSave: (draft: PaymentMethodDraft) => Promise<boolean>;
}) {
  const initial = React.useMemo<PaymentMethodDraft>(
    () => (method ? { name: method.name, details: method.details, active: method.active } : emptyMethod()),
    [method],
  );
  const [draft, setDraft] = React.useState<PaymentMethodDraft>(initial);
  const [nameError, setNameError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraft(initial);
      setNameError(null);
    }
  }, [open, initial]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const submit = async () => {
    if (!draft.name) {
      setNameError("Inserisci un nome per il metodo di pagamento");
      return;
    }
    const saved = await onSave(draft);
    if (saved) onOpenChange(false);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Iscrizioni"
      title={method ? "Modifica metodo" : "Nuovo metodo di pagamento"}
      description="Un metodo manuale accettato dalla societa: compare fra le scelte quando si registra un incasso."
      dirty={dirty}
      locked={saving}
      data-test="payment-method-drawer"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            {method ? "Aggiorna" : "Salva"}
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection>
          <div className="flex flex-col gap-4">
            <Field label="Nome metodo" htmlFor="method-name" required error={nameError}>
              <TextInput
                id="method-name"
                value={draft.name}
                onChange={(event) => {
                  setDraft({ ...draft, name: event.target.value });
                  if (nameError) setNameError(null);
                }}
                placeholder="Es. Bonifico Bancario"
                autoComplete="off"
              />
            </Field>
            <Field label="Dettagli" htmlFor="method-details" helper="Coordinate, causale o istruzioni che la famiglia deve leggere.">
              <Textarea
                id="method-details"
                value={draft.details}
                onChange={(event) => setDraft({ ...draft, details: event.target.value })}
                placeholder="Dettagli del metodo di pagamento"
                rows={4}
              />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-egw-field border border-egw-hairline bg-egw-page-100 px-4 py-3">
              <label htmlFor="method-active" className="font-brand text-[12.5px] font-semibold text-egw-ink">
                Metodo attivo
              </label>
              <Toggle
                id="method-active"
                checked={draft.active}
                onCheckedChange={(active) => setDraft({ ...draft, active })}
              />
            </div>
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
