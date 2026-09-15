"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, FormGrid, SearchableSelect, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { inventoryStatusLabels, type ClothingCatalogItem, type InventoryUnitStatus, type NumberingGroup } from "@/lib/clothing-inventory-utils";
import { STOCK_TYPE_LABELS, type StockForm } from "@/components/clothing/v2/clothing-model";

/**
 * Il modulo di magazzino (V1: «Aggiungi magazzino» / «Modifica magazzino»).
 * Un'unita singola ha nove campi, una quantita generica sette: cassetto da
 * 720 a sezioni. Taglia, colore e variante restano testo libero come in V1
 * (non sono vincolati alle liste dell'articolo). In modifica la pagina
 * conserva riservato/assegnato/atleta/assegnazione dell'esistente.
 */
const STOCK_TYPE_OPTIONS = [
  { value: "single_unit", label: "Unità singola" },
  { value: "bulk_quantity", label: "Quantità generica" },
];
const STATUS_OPTIONS = (Object.keys(inventoryStatusLabels) as InventoryUnitStatus[]).map((value) => ({ value, label: inventoryStatusLabels[value] }));

export function StockDrawer({
  open,
  onOpenChange,
  initial,
  items,
  groups,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: StockForm;
  items: ClothingCatalogItem[];
  groups: NumberingGroup[];
  onSave: (form: StockForm) => Promise<boolean>;
}) {
  const [form, setForm] = React.useState<StockForm>(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
  }, [open, initial]);

  const patch = (updates: Partial<StockForm>) => setForm((current) => ({ ...current, ...updates }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const single = form.stockType === "single_unit";

  const submit = async () => {
    if (!form.itemId) {
      setError("Seleziona un articolo");
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
      eyebrow="Magazzino"
      title={form.id ? "Modifica magazzino" : single ? "Aggiungi unità" : "Aggiungi quantità"}
      description={single ? "Un pezzo fisico, eventualmente numerato." : "Una quantità generica dello stesso articolo."}
      dirty={dirty}
      locked={busy}
      data-test="clothing-stock-drawer"
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
        <DrawerSection eyebrow="Articolo">
          <FormGrid>
            <Field label="Tipo magazzino" htmlFor="stock-type">
              <Select id="stock-type" value={form.stockType} onValueChange={(value) => patch({ stockType: value as StockForm["stockType"] })} options={STOCK_TYPE_OPTIONS} />
            </Field>
            <Field label="Articolo" htmlFor="stock-item" required error={error}>
              <SearchableSelect
                id="stock-item"
                value={form.itemId}
                onValueChange={(value) => { patch({ itemId: value || "" }); setError(null); }}
                options={items.map((item) => ({ value: item.id, label: item.name, description: item.type }))}
                placeholder="Seleziona articolo"
                searchPlaceholder="Cerca articolo"
              />
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="Variante">
          <FormGrid>
            <Field label="Taglia" htmlFor="stock-size">
              <TextInput id="stock-size" value={form.size} onChange={(event) => patch({ size: event.target.value })} />
            </Field>
            <Field label="Colore" htmlFor="stock-color">
              <TextInput id="stock-color" value={form.color} onChange={(event) => patch({ color: event.target.value })} />
            </Field>
            <Field label="Variante" htmlFor="stock-variant">
              <TextInput id="stock-variant" value={form.variant} onChange={(event) => patch({ variant: event.target.value })} />
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow={STOCK_TYPE_LABELS[form.stockType]}>
          <FormGrid>
            {single ? (
              <>
                <Field label="Numero" htmlFor="stock-number" optional width="12ch">
                  <TextInput id="stock-number" type="number" numeric value={form.number} onChange={(event) => patch({ number: event.target.value })} />
                </Field>
                <Field label="Gruppo numerazione" htmlFor="stock-group" optional>
                  <Select
                    id="stock-group"
                    value={form.numberingGroupId}
                    onValueChange={(value) => patch({ numberingGroupId: value })}
                    options={groups.map((group) => ({ value: group.id, label: group.name }))}
                    placeholder="Seleziona"
                  />
                </Field>
                <Field label="Stato" htmlFor="stock-status">
                  <Select id="stock-status" value={form.status} onValueChange={(value) => patch({ status: value as InventoryUnitStatus })} options={STATUS_OPTIONS} />
                </Field>
              </>
            ) : (
              <Field label="Quantità disponibile" htmlFor="stock-quantity" width="12ch">
                <TextInput id="stock-quantity" type="number" min={0} numeric value={form.quantityAvailable} onChange={(event) => patch({ quantityAvailable: event.target.value })} />
              </Field>
            )}
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="Note">
          <Field label="Note" htmlFor="stock-notes" optional>
            <Textarea id="stock-notes" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} rows={2} />
          </Field>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
