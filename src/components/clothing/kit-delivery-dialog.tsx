"use client";

import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLOTHING_ITEM_STATE_LABELS,
  KIT_DELIVERY_STATE_LABELS,
  describeAssignedSize,
  getItemState,
  getKitDeliveryProgress,
  setAssignmentItemState,
  type ClothingItemState,
} from "@/lib/clothing-delivery";
import type { ClothingAssignment } from "@/lib/clothing-inventory-utils";

const ITEM_STATES: ClothingItemState[] = [
  "to_prepare",
  "ready",
  "delivered",
  "unavailable",
];

const STATE_BADGE_CLASS: Record<ClothingItemState, string> = {
  to_prepare: "border-slate-200 bg-slate-50 text-slate-700",
  ready: "border-blue-200 bg-blue-50 text-blue-700",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  unavailable: "border-amber-200 bg-amber-50 text-amber-700",
};

const KIT_STATE_BADGE_CLASS = {
  to_prepare: "border-slate-200 bg-slate-50 text-slate-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
} as const;

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const dateInputValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export function KitDeliveryStateBadge({
  assignment,
}: {
  assignment: Pick<ClothingAssignment, "items">;
}) {
  const progress = getKitDeliveryProgress(assignment);

  return (
    <div className="flex flex-col gap-1">
      <Badge variant="outline" className={KIT_STATE_BADGE_CLASS[progress.state]}>
        {KIT_DELIVERY_STATE_LABELS[progress.state]}
      </Badge>
      <span className="text-xs text-slate-500">{progress.label}</span>
    </div>
  );
}

/**
 * Consegna di un kit, un articolo alla volta.
 *
 * E il posto dove si registra la realta di ottobre: maglia e pantaloncino
 * consegnati, felpa pronta, borsa esaurita. Lo stato del kit non si sceglie —
 * si legge in alto e si aggiorna da solo (vedi `@/lib/clothing-delivery`).
 *
 * La disposizione e a schede impilate e non a tabella: le consegne si
 * registrano in magazzino, spesso dal telefono, ed e la schermata che a
 * 375 px deve funzionare per prima.
 */
export function KitDeliveryDialog({
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
  onSave: (next: ClothingAssignment) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<ClothingAssignment | null>(assignment);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) setDraft(assignment);
  }, [open, assignment]);

  const progress = useMemo(
    () => (draft ? getKitDeliveryProgress(draft) : null),
    [draft],
  );

  if (!draft || !progress) {
    return null;
  }

  const changeState = (itemId: string, state: ClothingItemState) => {
    setDraft((current) =>
      current
        ? setAssignmentItemState({
            assignment: current,
            itemId,
            state,
            deliveredAt:
              state === "delivered"
                ? new Date().toISOString()
                : null,
          })
        : current,
    );
  };

  const changeField = (
    itemId: string,
    updates: { size?: string; quantity?: number; notes?: string; deliveredAt?: string },
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId ? { ...item, ...updates } : item,
            ),
          }
        : current,
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            Consegne · {athleteName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-3">
          <Badge
            variant="outline"
            className={KIT_STATE_BADGE_CLASS[progress.state]}
          >
            {KIT_DELIVERY_STATE_LABELS[progress.state]}
          </Badge>
          <span className="text-sm font-medium text-slate-700">
            {progress.label}
          </span>
          <span className="w-full text-xs text-slate-500">
            {draft.kitName || "Articoli singoli"} — lo stato del kit si ricava
            dagli articoli e non si sceglie a mano.
          </span>
        </div>

        <div className="space-y-3">
          {draft.items.map((item) => {
            const state = getItemState(item);
            const sizeDescription = describeAssignedSize({
              assignedSize: item.size,
              proposedSize: proposedSizeByItemId[item.itemId],
            });

            return (
              <div key={item.id} className="rounded-lg border bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <Badge variant="outline" className={STATE_BADGE_CLASS[state]}>
                    {CLOTHING_ITEM_STATE_LABELS[state]}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`delivery-state-${item.id}`}>Stato</Label>
                    <Select
                      value={state}
                      onValueChange={(value) =>
                        changeState(item.id, value as ClothingItemState)
                      }
                    >
                      <SelectTrigger
                        id={`delivery-state-${item.id}`}
                        className="mt-2"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_STATES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {CLOTHING_ITEM_STATE_LABELS[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor={`delivery-size-${item.id}`}>
                      Taglia assegnata
                    </Label>
                    <Input
                      id={`delivery-size-${item.id}`}
                      className="mt-2"
                      value={item.size || ""}
                      placeholder={sizeDescription.proposed || "Taglia"}
                      onChange={(event) =>
                        changeField(item.id, { size: event.target.value })
                      }
                    />
                    {sizeDescription.proposed ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {sizeDescription.isOverride
                          ? `Anagrafica: ${sizeDescription.proposed} — l'anagrafica non cambia`
                          : `Prevista da anagrafica: ${sizeDescription.proposed}`}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <Label htmlFor={`delivery-quantity-${item.id}`}>
                      Quantita
                    </Label>
                    <Input
                      id={`delivery-quantity-${item.id}`}
                      className="mt-2"
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        changeField(item.id, {
                          quantity: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor={`delivery-date-${item.id}`}>
                      Data consegna
                    </Label>
                    <Input
                      id={`delivery-date-${item.id}`}
                      className="mt-2"
                      type="date"
                      disabled={state !== "delivered"}
                      value={
                        state === "delivered"
                          ? dateInputValue(item.deliveredAt) || todayInputValue()
                          : ""
                      }
                      onChange={(event) =>
                        changeField(item.id, {
                          deliveredAt: event.target.value
                            ? new Date(event.target.value).toISOString()
                            : "",
                        })
                      }
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label htmlFor={`delivery-notes-${item.id}`}>Note</Label>
                    <Input
                      id={`delivery-notes-${item.id}`}
                      className="mt-2"
                      value={item.notes || ""}
                      placeholder="Es. taglia esaurita dal fornitore"
                      onChange={(event) =>
                        changeField(item.id, { notes: event.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Annulla
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            Salva consegne
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
