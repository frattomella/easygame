"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, FormGrid, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import { Checkbox } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import type { ClothingNumberMode, ClothingSizeSource, ClothingStockMode } from "@/lib/clothing-inventory-utils";
import { NUMBER_MODE_LABELS, SIZE_SOURCE_LABELS, STOCK_MODE_LABELS, type ItemForm } from "@/components/clothing/v2/clothing-model";

/**
 * Il modulo dell'articolo di catalogo (V1: dialogo «Articolo»). Tredici
 * campi in quattro gruppi → cassetto da 720 (guideline 08 §8.5). Le regole
 * sono quelle della V1: spuntare «Richiede numero» porta la modalita a
 * «Numero per articolo», toglierla la azzera; scegliere una modalita accende
 * il requisito. Al salvataggio la pagina forza `numberMode = "none"` se il
 * numero non e richiesto.
 */
const NUMBER_MODE_OPTIONS = (Object.keys(NUMBER_MODE_LABELS) as ClothingNumberMode[]).map((value) => ({
  value,
  label: value === "none" ? "Nessun numero" : value === "shared_by_kit" ? "Condiviso nel kit" : NUMBER_MODE_LABELS[value],
}));
const STOCK_MODE_OPTIONS = (Object.keys(STOCK_MODE_LABELS) as ClothingStockMode[]).map((value) => ({ value, label: STOCK_MODE_LABELS[value] }));
const SIZE_SOURCE_OPTIONS = (Object.keys(SIZE_SOURCE_LABELS) as ClothingSizeSource[]).map((value) => ({ value, label: SIZE_SOURCE_LABELS[value] }));

export function ItemDrawer({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ItemForm;
  /** V1 `saveItem`: torna `true` se la scrittura e andata a buon fine. */
  onSave: (form: ItemForm) => Promise<boolean>;
}) {
  const [form, setForm] = React.useState<ItemForm>(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
  }, [open, initial]);

  const patch = (updates: Partial<ItemForm>) => setForm((current) => ({ ...current, ...updates }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Nome articolo obbligatorio");
      return;
    }
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
      width="wide"
      eyebrow="Catalogo"
      title={form.id ? "Modifica articolo" : "Nuovo articolo"}
      description="Un articolo dice quali taglie, colori e varianti esistono e se porta un numero."
      dirty={dirty}
      locked={busy}
      data-test="clothing-item-drawer"
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
          <FormGrid>
            <Field label="Nome" htmlFor="item-name" required error={error}>
              <TextInput id="item-name" value={form.name} onChange={(event) => { patch({ name: event.target.value }); setError(null); }} placeholder="Es. Maglia gara" />
            </Field>
            <Field label="Tipo" htmlFor="item-type" helper="Serve a dedurre la taglia (maglia, pantaloni, scarpe) quando non la dichiari sotto.">
              <TextInput id="item-type" value={form.type} onChange={(event) => patch({ type: event.target.value })} placeholder="articolo" />
            </Field>
            <Field label="Codice" htmlFor="item-code">
              <TextInput id="item-code" value={form.code} onChange={(event) => patch({ code: event.target.value })} />
            </Field>
            <Field label="Descrizione" htmlFor="item-description" className="laptop:col-span-2">
              <Textarea id="item-description" value={form.description} onChange={(event) => patch({ description: event.target.value })} rows={2} />
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="Varianti disponibili">
          <FormGrid>
            <Field label="Taglie" htmlFor="item-sizes" helper="Separate da virgola: S, M, L">
              <TextInput id="item-sizes" value={form.sizes} onChange={(event) => patch({ sizes: event.target.value })} />
            </Field>
            <Field label="Colori" htmlFor="item-colors" helper="Separati da virgola">
              <TextInput id="item-colors" value={form.colors} onChange={(event) => patch({ colors: event.target.value })} />
            </Field>
            <Field label="Varianti" htmlFor="item-variants" helper="Separate da virgola">
              <TextInput id="item-variants" value={form.variants} onChange={(event) => patch({ variants: event.target.value })} />
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="Requisiti">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 font-brand text-[13px] text-egw-ink">
              <Checkbox checked={form.requiresSize} onChange={(event) => patch({ requiresSize: event.target.checked })} />
              Richiede taglia
            </label>
            <label className="flex items-center gap-2.5 font-brand text-[13px] text-egw-ink">
              <Checkbox checked={form.requiresColor} onChange={(event) => patch({ requiresColor: event.target.checked })} />
              Richiede colore
            </label>
            <label className="flex items-center gap-2.5 font-brand text-[13px] text-egw-ink">
              <Checkbox
                checked={form.requiresNumber}
                onChange={(event) => patch({ requiresNumber: event.target.checked, numberMode: event.target.checked ? "per_item" : "none" })}
              />
              Richiede numero
            </label>
          </div>
        </DrawerSection>

        <DrawerSection eyebrow="Numero, magazzino e taglia">
          <FormGrid>
            <Field label="Modalità numero" htmlFor="item-number-mode">
              <Select
                id="item-number-mode"
                value={form.numberMode}
                onValueChange={(value) => patch({ numberMode: value as ClothingNumberMode, requiresNumber: value !== "none" })}
                options={NUMBER_MODE_OPTIONS}
              />
            </Field>
            <Field label="Modalità stock" htmlFor="item-stock-mode">
              <Select id="item-stock-mode" value={form.stockMode} onValueChange={(value) => patch({ stockMode: value as ClothingStockMode })} options={STOCK_MODE_OPTIONS} />
            </Field>
            <Field
              label="Taglia dall'anagrafica"
              htmlFor="item-size-source"
              helper="Quale taglia proporre in assegnazione. La proposta si può sempre sovrascrivere e non modifica l'anagrafica."
              className="laptop:col-span-2"
            >
              <Select id="item-size-source" value={form.sizeSource} onValueChange={(value) => patch({ sizeSource: value as ClothingSizeSource })} options={SIZE_SOURCE_OPTIONS} />
            </Field>
          </FormGrid>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
