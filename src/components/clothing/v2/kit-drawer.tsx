"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import { Checkbox } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { DataChip } from "@/components/web/primitives/StatusPill";
import type { ClothingCatalogItem, ClothingNumberMode, NumberingGroup } from "@/lib/clothing-inventory-utils";
import { NUMBER_MODE_LABELS, type KitForm } from "@/components/clothing/v2/clothing-model";

/**
 * Il modulo del kit (V1: dialogo «Kit»). Cinque campi → cassetto da 480.
 *
 * Il kit non ha stagione: `clothing_kits` non e fra i tipi stagionali, il
 * catalogo vale per tutte le stagioni e cio che appartiene a una stagione
 * sono le **assegnazioni**. Non ha nemmeno categorie compatibili: e una
 * regola sportiva, non di magazzino (Blocco A, punto 14). I componenti sono
 * gli articoli del catalogo spuntati, con i valori che la V1 assegnava a
 * ogni spunta.
 */
const NUMBER_MODE_OPTIONS = (Object.keys(NUMBER_MODE_LABELS) as ClothingNumberMode[]).map((value) => ({
  value,
  label: value === "none" ? "Nessun numero" : NUMBER_MODE_LABELS[value],
}));

export function KitDrawer({
  open,
  onOpenChange,
  initial,
  items,
  groups,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: KitForm;
  /** Il catalogo in ordine alfabetico. */
  items: ClothingCatalogItem[];
  groups: NumberingGroup[];
  onSave: (form: KitForm) => Promise<boolean>;
}) {
  const [form, setForm] = React.useState<KitForm>(initial);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; components?: string }>({});

  React.useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors({});
    }
  }, [open, initial]);

  const patch = (updates: Partial<KitForm>) => setForm((current) => ({ ...current, ...updates }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const toggleComponent = (item: ClothingCatalogItem) =>
    setForm((current) => {
      const existing = current.components.some((component) => component.itemId === item.id);
      return {
        ...current,
        components: existing
          ? current.components.filter((component) => component.itemId !== item.id)
          : [
              ...current.components,
              { itemId: item.id, name: item.name, required: true, defaultSizeSource: "athlete", requiresNumberOverride: null, sharedKitNumber: true },
            ],
      };
    });

  const submit = async () => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Nome kit obbligatorio";
    if (!form.components.length) next.components = "Seleziona almeno un componente";
    setErrors(next);
    if (next.name || next.components) return;
    setBusy(true);
    try {
      const ok = await onSave(form);
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Catalogo"
      title={form.id ? "Modifica kit" : "Nuovo kit"}
      description="Un kit è una composizione di articoli: vale per tutte le stagioni."
      dirty={dirty}
      locked={busy}
      data-test="clothing-kit-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Salva
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Identità">
          <div className="flex flex-col gap-4">
            <Field label="Nome kit" htmlFor="kit-name" required error={errors.name}>
              <TextInput id="kit-name" value={form.name} onChange={(event) => { patch({ name: event.target.value }); setErrors((c) => ({ ...c, name: undefined })); }} placeholder="Es. Kit gara" />
            </Field>
            <Field label="Descrizione" htmlFor="kit-description">
              <Textarea id="kit-description" value={form.description} onChange={(event) => patch({ description: event.target.value })} rows={2} />
            </Field>
          </div>
        </DrawerSection>

        <DrawerSection eyebrow="Numerazione">
          <div className="flex flex-col gap-4">
            <Field label="Modalità numero" htmlFor="kit-number-mode">
              <Select id="kit-number-mode" value={form.numberMode} onValueChange={(value) => patch({ numberMode: value as ClothingNumberMode })} options={NUMBER_MODE_OPTIONS} />
            </Field>
            <Field label="Gruppo numerazione" htmlFor="kit-group" optional>
              <Select
                id="kit-group"
                value={form.numberingGroupId}
                onValueChange={(value) => patch({ numberingGroupId: value })}
                options={groups.map((group) => ({ value: group.id, label: group.name }))}
                placeholder="Seleziona"
              />
            </Field>
          </div>
        </DrawerSection>

        <DrawerSection eyebrow="Componenti">
          <Field label="Articoli del kit" required error={errors.components}>
            <InsetBlock className="egw-scroll max-h-[320px] overflow-y-auto p-2">
              {items.length ? (
                <ul className="flex flex-col">
                  {items.map((item) => {
                    const included = form.components.some((component) => component.itemId === item.id);
                    return (
                      <li key={item.id} className="border-b border-egw-rule last:border-0">
                        <label className="flex min-h-[40px] cursor-pointer items-center justify-between gap-3 px-2 font-brand text-[13px] text-egw-ink">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Checkbox checked={included} onChange={() => { toggleComponent(item); setErrors((c) => ({ ...c, components: undefined })); }} />
                            <span className="egw-ellipsis">{item.name}</span>
                          </span>
                          {included ? (
                            <DataChip size="sm" tone="blue">
                              incluso
                            </DataChip>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-2 py-3 font-brand text-[12.5px] text-egw-ink-62">Nessun articolo in catalogo: crea prima gli articoli.</p>
              )}
            </InsetBlock>
          </Field>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
