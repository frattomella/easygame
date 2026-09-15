"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { DateInput, Field, FieldSizeProvider, SearchableSelect, Select, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import type { ClothingAssignment, ClothingAssignmentStatus } from "@/lib/clothing-inventory-utils";
import {
  ASSIGNMENT_ACTION_STATUSES,
  ASSIGNMENT_STATUS,
  assignmentStatusLabel,
  athleteLabel,
  getAthleteCategoryLabel,
  type AssignmentEditForm,
} from "@/components/clothing/v2/clothing-model";

const STATUS_OPTIONS = ASSIGNMENT_ACTION_STATUSES.map((status) => ({ value: status, label: assignmentStatusLabel(status) }));

/**
 * «Modifica assegnazione» (V1: dialogo a quattro campi) → cassetto da 480.
 * Cambiare lo stato da qui muove il magazzino come il cambio di stato a
 * menu (la pagina passa da `updateClothingAssignmentStatus`) e riscrive
 * **tutti** gli articoli con lo stesso stato: per una consegna parziale si
 * usa «Consegne».
 */
export function AssignmentEditDrawer({
  open,
  onOpenChange,
  initial,
  athletes,
  categories = [],
  categoryLabel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AssignmentEditForm;
  athletes: any[];
  /** Il catalogo del club: la categoria si legge per identita (ADR-0185). */
  categories?: readonly { id?: string | null; name?: string | null }[];
  /** Come si scrive una categoria (ADR-0185). */
  categoryLabel?: (reference: { categoryId: string; categoryName: string }) => string;
  onSave: (form: AssignmentEditForm) => Promise<boolean>;
}) {
  const [form, setForm] = React.useState<AssignmentEditForm>(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
  }, [open, initial]);

  const patch = (updates: Partial<AssignmentEditForm>) => setForm((current) => ({ ...current, ...updates }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const submit = async () => {
    if (!form.athleteId) {
      setError("Seleziona un atleta");
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
      width="default"
      eyebrow="Assegnazioni"
      title="Modifica assegnazione"
      dirty={dirty}
      locked={busy}
      data-test="clothing-assignment-edit-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Salva modifiche
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Assegnazione">
          <div className="flex flex-col gap-4">
            <Field label="Atleta" htmlFor="assignment-edit-athlete" required error={error}>
              <SearchableSelect
                id="assignment-edit-athlete"
                value={form.athleteId}
                onValueChange={(value) => { patch({ athleteId: value || "" }); setError(null); }}
                options={athletes.map((athlete) => ({ value: String(athlete.id), label: athleteLabel(athlete), description: getAthleteCategoryLabel(athlete, categories, categoryLabel) }))}
                placeholder="Seleziona atleta"
                searchPlaceholder="Cerca atleta"
              />
            </Field>
            <Field label="Stato" htmlFor="assignment-edit-status" helper="Vale per tutti gli articoli. Per una consegna parziale usa «Consegne».">
              <Select id="assignment-edit-status" value={form.status} onValueChange={(value) => patch({ status: value as ClothingAssignmentStatus })} options={STATUS_OPTIONS} />
            </Field>
            <Field label="Data assegnazione" htmlFor="assignment-edit-date" width="14ch">
              <DateInput id="assignment-edit-date" value={form.createdAt} onChange={(event) => patch({ createdAt: event.target.value })} />
            </Field>
            <Field label="Note" htmlFor="assignment-edit-notes" optional>
              <Textarea id="assignment-edit-notes" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} rows={3} />
            </Field>
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}

/**
 * «Cambia stato» (V1: menu a tendina sulla riga che scriveva al primo clic).
 * Un cassetto stretto con la scelta e la conferma, cosi il magazzino non si
 * muove per un clic sbagliato su una voce di menu.
 */
export function AssignmentStatusDrawer({
  open,
  onOpenChange,
  assignment,
  athleteName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: ClothingAssignment | null;
  athleteName: string;
  onConfirm: (assignment: ClothingAssignment, status: ClothingAssignmentStatus) => Promise<boolean>;
}) {
  const [status, setStatus] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setStatus("");
  }, [open]);

  if (!assignment) return null;
  const options = STATUS_OPTIONS.filter((option) => option.value !== assignment.status);

  const run = async () => {
    if (!status) return;
    setBusy(true);
    try {
      const ok = await onConfirm(assignment, status as ClothingAssignmentStatus);
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="narrow"
      eyebrow="Assegnazioni"
      title="Cambia stato"
      description={athleteName}
      dirty={Boolean(status)}
      locked={busy}
      data-test="clothing-assignment-status-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void run()} disabled={!status} loading={busy}>
            Aggiorna stato
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Stato attuale">
          <InsetBlock className="flex items-center gap-3">
            <StatusPill status={ASSIGNMENT_STATUS[assignment.status]} />
            <span className="font-brand text-[12.5px] text-egw-ink-62">{assignment.kitName || "Articoli"}</span>
          </InsetBlock>
        </DrawerSection>
        <DrawerSection eyebrow="Nuovo stato">
          <Field label="Stato" htmlFor="assignment-status-next" required helper="Muove il magazzino collegato e vale per tutti gli articoli.">
            <Select id="assignment-status-next" value={status} onValueChange={setStatus} options={options} placeholder="Seleziona" />
          </Field>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
