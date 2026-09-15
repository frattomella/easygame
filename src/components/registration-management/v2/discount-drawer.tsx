"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, Select, TextInput } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { Toggle } from "@/components/web/primitives/Controls";

/**
 * Lo sconto o la promozione in un cassetto da 480: e il dialogo «Nuovo
 * Sconto/Promozione» della V1 con i suoi quattro campi — titolo, tipo
 * (percentuale o importo fisso), valore, attivo — e la stessa validazione
 * («Compila tutti i campi» quando manca il titolo o il valore non e
 * positivo). Il record salvato lo compone la pagina, come prima.
 */
export type DiscountDraft = { title: string; type: string; value: number; active: boolean };

const DISCOUNT_TYPE_OPTIONS = [
  { value: "percentage", label: "Percentuale (%)" },
  { value: "fixed", label: "Importo fisso (€)" },
];

const emptyDiscount = (): DiscountDraft => ({ title: "", type: "percentage", value: 0, active: true });

export function DiscountDrawer({
  open,
  onOpenChange,
  discount,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discount: Record<string, any> | null;
  saving: boolean;
  onSave: (draft: DiscountDraft) => Promise<boolean>;
}) {
  const initial = React.useMemo<DiscountDraft>(
    () =>
      discount
        ? {
            title: String(discount.title || ""),
            type: String(discount.type || "percentage"),
            value: Number(discount.value) || 0,
            active: discount.active !== false,
          }
        : emptyDiscount(),
    [discount],
  );
  const [draft, setDraft] = React.useState<DiscountDraft>(initial);
  const [error, setError] = React.useState<{ title?: string; value?: string }>({});

  React.useEffect(() => {
    if (open) {
      setDraft(initial);
      setError({});
    }
  }, [open, initial]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const isPercentage = draft.type === "percentage";

  const submit = async () => {
    if (!draft.title || draft.value <= 0) {
      setError({
        title: !draft.title ? "Compila tutti i campi" : undefined,
        value: draft.value <= 0 ? "Compila tutti i campi" : undefined,
      });
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
      title={discount ? "Modifica sconto" : "Nuovo sconto / promozione"}
      description="Una riduzione applicabile alla quota di un'iscrizione, in percentuale o a importo fisso."
      dirty={dirty}
      locked={saving}
      data-test="discount-drawer"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            {discount ? "Aggiorna" : "Salva"}
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection>
          <div className="flex flex-col gap-4">
            <Field label="Titolo" htmlFor="discount-title" required error={error.title}>
              <TextInput
                id="discount-title"
                value={draft.title}
                onChange={(event) => {
                  setDraft({ ...draft, title: event.target.value });
                  if (error.title) setError({ ...error, title: undefined });
                }}
                placeholder="Es. Sconto Famiglia"
                autoComplete="off"
              />
            </Field>
            <Field label="Tipo di sconto" htmlFor="discount-type">
              <Select
                id="discount-type"
                value={draft.type}
                onValueChange={(type) => setDraft({ ...draft, type })}
                options={DISCOUNT_TYPE_OPTIONS}
              />
            </Field>
            <Field label={isPercentage ? "Percentuale (%)" : "Importo (€)"} htmlFor="discount-value" required error={error.value}>
              <TextInput
                id="discount-value"
                type="number"
                numeric
                inputMode="decimal"
                min="0"
                step={isPercentage ? "1" : "0.01"}
                value={draft.value}
                onChange={(event) => {
                  setDraft({ ...draft, value: parseFloat(event.target.value) || 0 });
                  if (error.value) setError({ ...error, value: undefined });
                }}
                placeholder="0"
                trailing={isPercentage ? "%" : "€"}
              />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-egw-field border border-egw-hairline bg-egw-page-100 px-4 py-3">
              <label htmlFor="discount-active" className="font-brand text-[12.5px] font-semibold text-egw-ink">
                Sconto attivo
              </label>
              <Toggle
                id="discount-active"
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
