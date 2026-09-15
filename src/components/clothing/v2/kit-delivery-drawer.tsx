"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { DateInput, Field, FieldSizeProvider, Select, TextInput } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import {
  CLOTHING_ITEM_STATE_LABELS,
  describeAssignedSize,
  getItemState,
  getKitDeliveryProgress,
  setAssignmentItemState,
  type ClothingItemState,
} from "@/lib/clothing-delivery";
import type { ClothingAssignment } from "@/lib/clothing-inventory-utils";
import { todayLocalDateOnly } from "@/lib/date-only";
import { dateInputValue, ITEM_STATE_STATUS, KIT_DELIVERY_STATUS } from "@/components/clothing/v2/clothing-model";

const ITEM_STATES: ClothingItemState[] = [
  "to_prepare",
  "ready",
  "delivered",
  "unavailable",
];

const ITEM_STATE_OPTIONS = ITEM_STATES.map((value) => ({ value, label: CLOTHING_ITEM_STATE_LABELS[value] }));

/** Lo stato del kit in elenco: pillola derivata + «2/4 consegnati · 1 non disponibile». */
export function KitDeliveryStatePill({ assignment }: { assignment: Pick<ClothingAssignment, "items"> }) {
  const progress = getKitDeliveryProgress(assignment);
  return <StatusPill status={KIT_DELIVERY_STATUS[progress.state]} detail={progress.label} />;
}

/**
 * Consegna di un kit, un articolo alla volta (V1: `KitDeliveryDialog`).
 *
 * E il posto dove si registra la realta di ottobre: maglia e pantaloncino
 * consegnati, felpa pronta, borsa esaurita. Lo stato del kit non si sceglie —
 * si legge in alto e si aggiorna da solo (`@/lib/clothing-delivery`).
 *
 * La disposizione e a blocchi impilati e non a tabella: le consegne si
 * registrano in magazzino, spesso dal telefono, ed e la schermata che a
 * 375 px deve funzionare per prima. Cassetto da 480, una colonna.
 */
export function KitDeliveryDrawer({
  open,
  onOpenChange,
  assignment,
  athleteName,
  proposedSizeByItemId = {},
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: ClothingAssignment | null;
  athleteName: string;
  proposedSizeByItemId?: Record<string, string>;
  /** V1 `saveKitDeliveries`: torna `true` se la scrittura e andata a buon fine. */
  onSave: (next: ClothingAssignment) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ClothingAssignment | null>(assignment);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) setDraft(assignment);
  }, [open, assignment]);

  const progress = useMemo(() => (draft ? getKitDeliveryProgress(draft) : null), [draft]);
  const dirty = Boolean(draft && assignment && JSON.stringify(draft.items) !== JSON.stringify(assignment.items));

  if (!draft || !progress) return null;

  const changeState = (itemId: string, state: ClothingItemState) =>
    setDraft((current) =>
      current
        ? setAssignmentItemState({ assignment: current, itemId, state, deliveredAt: state === "delivered" ? new Date().toISOString() : null })
        : current,
    );

  const changeField = (itemId: string, updates: { size?: string; quantity?: number; notes?: string; deliveredAt?: string }) =>
    setDraft((current) =>
      current ? { ...current, items: current.items.map((item) => (item.id === itemId ? { ...item, ...updates } : item)) } : current,
    );

  const save = async () => {
    setSaving(true);
    try {
      const ok = await onSave(draft);
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Consegne"
      title={athleteName}
      description={`${draft.kitName || "Articoli singoli"} · lo stato del kit si ricava dagli articoli e non si sceglie a mano.`}
      dirty={dirty}
      locked={saving}
      data-test="clothing-kit-delivery-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Salva consegne
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Stato del kit">
          <InsetBlock className="flex flex-wrap items-center gap-3">
            <StatusPill status={KIT_DELIVERY_STATUS[progress.state]} />
            <span className="egw-num font-brand text-[13px] font-semibold text-egw-ink">{progress.label}</span>
          </InsetBlock>
        </DrawerSection>

        <DrawerSection eyebrow="Articoli">
          <div className="flex flex-col gap-3">
            {draft.items.map((item) => {
              const state = getItemState(item);
              const sizeDescription = describeAssignedSize({ assignedSize: item.size, proposedSize: proposedSizeByItemId[item.itemId] });

              return (
                <InsetBlock key={item.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-brand text-[13px] font-semibold text-egw-ink">{item.name}</p>
                    <StatusPill status={ITEM_STATE_STATUS[state]} size="sm" />
                  </div>

                  <Field label="Stato" htmlFor={`delivery-state-${item.id}`}>
                    <Select id={`delivery-state-${item.id}`} value={state} onValueChange={(value) => changeState(item.id, value as ClothingItemState)} options={ITEM_STATE_OPTIONS} />
                  </Field>

                  <Field
                    label="Taglia assegnata"
                    htmlFor={`delivery-size-${item.id}`}
                    helper={
                      sizeDescription.proposed
                        ? sizeDescription.isOverride
                          ? `Anagrafica: ${sizeDescription.proposed} — l'anagrafica non cambia`
                          : `Prevista da anagrafica: ${sizeDescription.proposed}`
                        : undefined
                    }
                  >
                    <TextInput
                      id={`delivery-size-${item.id}`}
                      value={item.size || ""}
                      placeholder={sizeDescription.proposed || "Taglia"}
                      onChange={(event) => changeField(item.id, { size: event.target.value })}
                    />
                  </Field>

                  <Field label="Quantita" htmlFor={`delivery-quantity-${item.id}`} width="12ch">
                    <TextInput
                      id={`delivery-quantity-${item.id}`}
                      type="number"
                      numeric
                      min={1}
                      value={item.quantity}
                      onChange={(event) => changeField(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                    />
                  </Field>

                  <Field label="Data consegna" htmlFor={`delivery-date-${item.id}`} width="14ch">
                    <DateInput
                      id={`delivery-date-${item.id}`}
                      disabled={state !== "delivered"}
                      value={state === "delivered" ? dateInputValue(item.deliveredAt) || todayLocalDateOnly() : ""}
                      onChange={(event) => changeField(item.id, { deliveredAt: event.target.value ? new Date(event.target.value).toISOString() : "" })}
                    />
                  </Field>

                  <Field label="Note" htmlFor={`delivery-notes-${item.id}`} optional>
                    <TextInput
                      id={`delivery-notes-${item.id}`}
                      value={item.notes || ""}
                      placeholder="Es. taglia esaurita dal fornitore"
                      onChange={(event) => changeField(item.id, { notes: event.target.value })}
                    />
                  </Field>
                </InsetBlock>
              );
            })}
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
