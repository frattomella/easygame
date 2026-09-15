"use client";

import * as React from "react";
import { useMemo } from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, FormGrid, SearchableSelect, Select, TextInput } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { DataChip } from "@/components/web/primitives/StatusPill";
import {
  canAssignNumber,
  getAthleteClothingProfile,
  getAvailableInventoryForItem,
  getAvailableNumbersForGroup,
  type ClothingAssignmentComponentRequest,
  type ClothingAssignmentSource,
  type ClothingAssignmentStatus,
  type ClothingCatalogItem,
  type ClothingState,
} from "@/lib/clothing-inventory-utils";
import { describeAssignedSize, proposeSizeForItem } from "@/lib/clothing-delivery";
import { sortByName } from "@/lib/sorting";
import { athleteLabel, getAthleteCategoryLabel, stockLabel, type AssignmentForm } from "@/components/clothing/v2/clothing-model";

/**
 * «Nuova assegnazione» (V1: dialogo a tutta larghezza). Un kit o un articolo
 * a un atleta, da magazzino o da ordinare, con un blocco per componente.
 * Cassetto da 720 a sezioni (guideline 08 §8.5).
 *
 * La taglia di ogni componente **parte dall'anagrafica** dell'atleta
 * (`proposedSizeByItemId`) e cio che si vede nella tendina e cio che si
 * salva. La proposta **non** scrive l'anagrafica: se l'operatore la cambia,
 * cambia solo quel capo. Un kit o un articolo si puo assegnare se e attivo,
 * e basta: nessuna eleggibilita sportiva su un catalogo di magazzino.
 */
const SOURCE_OPTIONS = [
  { value: "inventory", label: "Da magazzino" },
  { value: "supplier_order", label: "Da ordinare/personalizzare" },
];
const TARGET_OPTIONS = [
  { value: "kit", label: "Kit completo" },
  { value: "item", label: "Singolo articolo" },
];
const INITIAL_STATUS_OPTIONS = [
  { value: "reserved", label: "Riservato" },
  { value: "assigned", label: "Assegnato" },
  { value: "delivered", label: "Consegnato" },
];

export type AssignmentSubmit = {
  form: AssignmentForm;
  components: ClothingAssignmentComponentRequest[];
};

export function AssignmentDrawer({
  open,
  onOpenChange,
  initial,
  athletes,
  categories = [],
  categoryLabel,
  state,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AssignmentForm;
  /** Gli atleti del club, gia ordinati per cognome. */
  athletes: any[];
  /** Il catalogo del club: la categoria si legge per identita (ADR-0185). */
  categories?: readonly { id?: string | null; name?: string | null }[];
  /** Come si scrive una categoria (ADR-0185). */
  categoryLabel?: (reference: { categoryId: string; categoryName: string }) => string;
  state: ClothingState;
  /** V1 `createAssignment`: torna `true` se il server ha scritto. */
  onSubmit: (payload: AssignmentSubmit) => Promise<boolean>;
}) {
  const [form, setForm] = React.useState<AssignmentForm>(initial);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<{ athlete?: string; target?: string }>({});

  React.useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors({});
    }
  }, [open, initial]);

  const patch = (updates: Partial<AssignmentForm>) => setForm((current) => ({ ...current, ...updates }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const athletesById = useMemo(() => new Map(athletes.map((athlete) => [String(athlete.id), athlete])), [athletes]);
  const itemById = useMemo(() => new Map(state.items.map((item) => [item.id, item])), [state.items]);
  const selectedAthlete = athletesById.get(form.athleteId);
  const assignableKits = useMemo(() => sortByName(state.kits.filter((kit) => kit.active), (kit) => kit.name), [state.kits]);
  const assignableItems = useMemo(() => sortByName(state.items.filter((item) => item.active), (item) => item.name), [state.items]);
  const groups = useMemo(() => sortByName(state.numberingGroups, (group) => group.name), [state.numberingGroups]);
  const selectedKit = state.kits.find((kit) => kit.id === form.kitId);
  const selectedItem = state.items.find((item) => item.id === form.itemId);

  /** Taglie proposte per l'atleta selezionato, una per articolo. */
  const proposedSizeByItemId = useMemo(() => {
    if (!selectedAthlete) return {} as Record<string, string>;
    const sizes = getAthleteClothingProfile(selectedAthlete).sizes;
    const proposals: Record<string, string> = {};
    state.items.forEach((item) => {
      const proposed = proposeSizeForItem({ sizes, item });
      if (proposed) proposals[item.id] = proposed;
    });
    return proposals;
  }, [selectedAthlete, state.items]);

  const targetComponents = useMemo(() => {
    if (form.targetType === "kit" && selectedKit) {
      return selectedKit.components.map((component) => itemById.get(component.itemId)).filter(Boolean) as ClothingCatalogItem[];
    }
    return selectedItem ? [selectedItem] : [];
  }, [form.targetType, itemById, selectedItem, selectedKit]);

  const setComponentDraft = (itemId: string, updates: Partial<ClothingAssignmentComponentRequest>) =>
    setForm((current) => ({
      ...current,
      components: { ...current.components, [itemId]: { ...(current.components[itemId] || {}), ...updates, itemId } },
    }));

  const suggestedSizes = selectedAthlete
    ? Object.values(getAthleteClothingProfile(selectedAthlete).sizes).filter(Boolean).join(" / ") || "nessuna taglia salvata"
    : "";

  const submit = async () => {
    const components = targetComponents.map((item) => {
      const draft = form.components[item.id] || {};
      return {
        ...draft,
        itemId: item.id,
        // Senza scelta esplicita vale la proposta dell'anagrafica: e cio che
        // l'operatore vede nella tendina, e deve essere cio che si salva.
        size: draft.size || proposedSizeByItemId[item.id] || "",
      };
    });
    const next: typeof errors = {};
    if (!form.athleteId) next.athlete = "Seleziona un atleta";
    if (!components.length) next.target = "Seleziona kit o articolo";
    setErrors(next);
    if (next.athlete || next.target) return;
    setBusy(true);
    try {
      const ok = await onSubmit({ form, components });
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const numberOptions = (groupId: string) =>
    getAvailableNumbersForGroup({ groupId, state, athleteId: form.athleteId }).map((option) => {
      const occupiedBy = option.occupiedByAthleteId ? athletesById.get(option.occupiedByAthleteId) : null;
      return {
        value: String(option.number),
        label: `${option.number}${!option.available ? ` occupato${occupiedBy ? ` da ${athleteLabel(occupiedBy)}` : ""}` : ""}`,
        disabled: !option.available,
      };
    });

  const renderComponent = (item: ClothingCatalogItem) => {
    const draft = form.components[item.id] || { itemId: item.id };
    const proposedSize = proposedSizeByItemId[item.id] || "";
    const sizeDescription = describeAssignedSize({ assignedSize: draft.size, proposedSize });
    const compatibleInventory = selectedAthlete
      ? getAvailableInventoryForItem({
          item,
          inventory: state.inventory,
          // Anche da magazzino la taglia di partenza e quella dell'anagrafica.
          size: sizeDescription.size,
          color: draft.color,
          variant: draft.variant,
        })
      : [];
    const groupId = String(draft.numberingGroupId || form.numberingGroupId || "");
    const sharedByKit = selectedKit?.numberMode === "shared_by_kit";
    const numberCheck =
      item.requiresNumber && groupId && (draft.number || form.sharedNumber)
        ? canAssignNumber({ athleteId: form.athleteId, groupId, number: sharedByKit ? form.sharedNumber : draft.number, state })
        : { ok: true, reason: "" };

    return (
      <InsetBlock key={item.id} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-brand text-[13px] font-semibold text-egw-ink">{item.name}</p>
            <p className="font-brand text-[11.5px] text-egw-ink-62">{item.requiresNumber ? "Numero richiesto" : "Senza numero"}</p>
          </div>
          {!numberCheck.ok ? (
            <p role="alert" className="font-brand text-[11.5px] font-semibold text-egw-red">
              {numberCheck.reason}
            </p>
          ) : null}
        </div>

        {form.source === "inventory" ? (
          <Field
            label="Stock compatibile"
            htmlFor={`assignment-stock-${item.id}`}
            warning={!compatibleInventory.length ? "Nessuno stock disponibile compatibile. Usa «Da ordinare» per creare una richiesta fornitore." : undefined}
          >
            <Select
              id={`assignment-stock-${item.id}`}
              value={String(draft.inventoryStockId || "")}
              onValueChange={(value) => {
                const stock = compatibleInventory.find((entry) => entry.id === value);
                setComponentDraft(item.id, {
                  inventoryStockId: value,
                  size: stock?.size || draft.size || "",
                  color: stock?.color || draft.color || "",
                  variant: stock?.variant || draft.variant || "",
                  number: stock?.number ?? draft.number ?? null,
                  numberingGroupId: stock?.numberingGroupId || draft.numberingGroupId || form.numberingGroupId || "",
                });
              }}
              options={compatibleInventory.map((stock) => ({ value: stock.id, label: stockLabel(stock) }))}
              placeholder="Seleziona stock disponibile"
            />
          </Field>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Taglia"
              htmlFor={`assignment-size-${item.id}`}
              helper={
                proposedSize
                  ? sizeDescription.isOverride
                    ? `Anagrafica: ${proposedSize} — assegnata a mano, l'anagrafica non cambia`
                    : `Proposta dall'anagrafica: ${proposedSize}`
                  : undefined
              }
            >
              <Select
                id={`assignment-size-${item.id}`}
                value={sizeDescription.size}
                onValueChange={(value) => setComponentDraft(item.id, { size: value })}
                options={(item.sizes.length ? item.sizes : ["Unica"]).map((size) => ({ value: size, label: size }))}
                placeholder="Taglia"
              />
            </Field>
            <Field label="Colore" htmlFor={`assignment-color-${item.id}`}>
              <Select
                id={`assignment-color-${item.id}`}
                value={String(draft.color || "")}
                onValueChange={(value) => setComponentDraft(item.id, { color: value })}
                options={(item.colors.length ? item.colors : ["Standard"]).map((color) => ({ value: color, label: color }))}
                placeholder="Colore"
              />
            </Field>
            <Field label="Variante" htmlFor={`assignment-variant-${item.id}`}>
              <Select
                id={`assignment-variant-${item.id}`}
                value={String(draft.variant || "")}
                onValueChange={(value) => setComponentDraft(item.id, { variant: value })}
                options={(item.variants.length ? item.variants : ["Standard"]).map((variant) => ({ value: variant, label: variant }))}
                placeholder="Variante"
              />
            </Field>
            {item.requiresNumber && !sharedByKit ? (
              <Field label="Numero" htmlFor={`assignment-number-${item.id}`}>
                <SearchableSelect
                  id={`assignment-number-${item.id}`}
                  value={draft.number === undefined || draft.number === null ? "" : String(draft.number)}
                  onValueChange={(value) => setComponentDraft(item.id, { number: value || null })}
                  options={numberOptions(groupId)}
                  placeholder="Numero"
                  searchPlaceholder="Cerca numero"
                  emptyLabel={groupId ? "Nessun numero" : "Seleziona prima un gruppo"}
                />
              </Field>
            ) : null}
          </div>
        )}
      </InsetBlock>
    );
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Assegnazioni"
      title="Nuova assegnazione"
      description="Un kit o un articolo a un atleta, da magazzino o da ordinare."
      dirty={dirty}
      locked={busy}
      data-test="clothing-assignment-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Conferma assegnazione
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Destinatario">
          <FormGrid>
            <Field label="Atleta" htmlFor="assignment-athlete" required error={errors.athlete} helper={selectedAthlete ? `Taglie suggerite: ${suggestedSizes}` : undefined}>
              <SearchableSelect
                id="assignment-athlete"
                value={form.athleteId}
                onValueChange={(value) => {
                  patch({ athleteId: value || "", kitId: "", itemId: "", sharedNumber: "", components: {} });
                  setErrors((c) => ({ ...c, athlete: undefined }));
                }}
                options={athletes.map((athlete) => ({ value: String(athlete.id), label: athleteLabel(athlete), description: getAthleteCategoryLabel(athlete, categories, categoryLabel) }))}
                placeholder="Seleziona atleta"
                searchPlaceholder="Cerca atleta o categoria"
                emptyLabel="Nessun atleta trovato"
              />
            </Field>
            <Field label="Origine" htmlFor="assignment-source">
              <Select
                id="assignment-source"
                value={form.source}
                onValueChange={(value) =>
                  patch({ source: value as ClothingAssignmentSource, status: value === "supplier_order" ? "to_order" : form.status === "to_order" ? "reserved" : form.status })
                }
                options={SOURCE_OPTIONS}
              />
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="Cosa">
          <FormGrid>
            <Field label="Tipo" htmlFor="assignment-target">
              <Select
                id="assignment-target"
                value={form.targetType}
                onValueChange={(value) => patch({ targetType: value as "kit" | "item", kitId: "", itemId: "", components: {} })}
                options={TARGET_OPTIONS}
              />
            </Field>
            {form.targetType === "kit" ? (
              <Field label="Kit" htmlFor="assignment-kit" required error={errors.target}>
                <SearchableSelect
                  id="assignment-kit"
                  value={form.kitId}
                  onValueChange={(value) => {
                    const kit = state.kits.find((entry) => entry.id === value);
                    patch({ kitId: value || "", numberingGroupId: kit?.numberingGroupId || form.numberingGroupId, components: {} });
                    setErrors((c) => ({ ...c, target: undefined }));
                  }}
                  options={assignableKits.map((kit) => ({ value: kit.id, label: kit.name }))}
                  placeholder="Seleziona kit"
                  searchPlaceholder="Cerca kit"
                />
              </Field>
            ) : (
              <Field label="Articolo" htmlFor="assignment-item" required error={errors.target}>
                <SearchableSelect
                  id="assignment-item"
                  value={form.itemId}
                  onValueChange={(value) => {
                    patch({ itemId: value || "", components: {} });
                    setErrors((c) => ({ ...c, target: undefined }));
                  }}
                  options={assignableItems.map((item) => ({ value: item.id, label: item.name, description: item.type }))}
                  placeholder="Seleziona articolo"
                  searchPlaceholder="Cerca articolo"
                />
              </Field>
            )}
            <Field label="Stato iniziale" htmlFor="assignment-status" helper={form.source === "supplier_order" ? "Da ordinare: lo stato lo muove il flusso fornitore." : undefined}>
              <Select
                id="assignment-status"
                value={form.status}
                disabled={form.source === "supplier_order"}
                onValueChange={(value) => patch({ status: value as ClothingAssignmentStatus })}
                options={form.source === "supplier_order" ? [{ value: "to_order", label: "Da ordinare" }] : INITIAL_STATUS_OPTIONS}
              />
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="Numerazione e note">
          <FormGrid>
            <Field label="Gruppo numerazione" htmlFor="assignment-group" optional>
              <Select
                id="assignment-group"
                value={form.numberingGroupId}
                onValueChange={(value) => patch({ numberingGroupId: value })}
                options={groups.map((group) => ({ value: group.id, label: group.name }))}
                placeholder="Seleziona gruppo"
              />
            </Field>
            {selectedKit?.numberMode === "shared_by_kit" ? (
              <Field label="Numero condiviso kit" htmlFor="assignment-shared-number">
                <SearchableSelect
                  id="assignment-shared-number"
                  value={form.sharedNumber}
                  onValueChange={(value) => patch({ sharedNumber: value || "" })}
                  options={numberOptions(form.numberingGroupId)}
                  placeholder="Numero"
                  searchPlaceholder="Cerca numero"
                  emptyLabel={form.numberingGroupId ? "Nessun numero" : "Seleziona prima un gruppo"}
                />
              </Field>
            ) : null}
            <Field label="Note" htmlFor="assignment-notes" optional className="laptop:col-span-2">
              <TextInput id="assignment-notes" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} />
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="Componenti">
          {targetComponents.length ? (
            <div className="flex flex-col gap-3">{targetComponents.map(renderComponent)}</div>
          ) : (
            <InsetBlock dashed className="text-center font-brand text-[12.5px] text-egw-ink-62">
              Seleziona un kit o un articolo.
            </InsetBlock>
          )}
        </DrawerSection>

        <DrawerSection eyebrow="Riepilogo">
          <InsetBlock className="flex flex-wrap items-center gap-2 font-brand text-[12.5px] text-egw-ink">
            <span className="font-semibold">{selectedAthlete ? athleteLabel(selectedAthlete) : "Nessun atleta"}</span>
            <span className="text-egw-ink-42">·</span>
            <span>{selectedKit?.name || selectedItem?.name || "nessun articolo"}</span>
            <span className="text-egw-ink-42">·</span>
            <DataChip size="sm">{form.source === "inventory" ? "da magazzino" : "da ordinare"}</DataChip>
          </InsetBlock>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
