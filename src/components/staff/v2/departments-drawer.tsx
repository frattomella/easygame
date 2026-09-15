"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { Field, FieldSizeProvider, TextInput, Textarea } from "@/components/web/forms/Field";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { useToast } from "@/components/ui/toast-notification";
import {
  DEFAULT_DEPARTMENT_COLOR,
  STAFF_DEPARTMENT_COLORS,
  makeDepartmentId,
  normalizeDepartmentName,
  type StaffDepartment,
} from "@/lib/staff-directory";
import { departmentChipTone } from "@/components/staff/v2/staff-model";

/**
 * «Gestisci reparti» in un cassetto da 480 (guideline 06 §6.7, 08 §8.5).
 *
 * E la dialog `DepartmentManagement` della V1, con gli stessi campi (nome
 * obbligatorio, descrizione, uno dei cinque colori), lo stesso id derivato dal
 * nome (mai dall'orologio) e gli stessi messaggi. Cambia una cosa sola, e di
 * proposito: eliminare un reparto azzera il reparto dei membri che lo
 * usavano, quindi ora **chiede** (§8.9, notevole e reversibile) invece di
 * agire al primo clic.
 */
const emptyDepartment = (): StaffDepartment => ({
  id: "",
  name: "",
  description: "",
  color: DEFAULT_DEPARTMENT_COLOR,
});

export function DepartmentsDrawer({
  open,
  onOpenChange,
  departments,
  staffCountsByDepartment = {},
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: StaffDepartment[];
  staffCountsByDepartment?: Record<string, number>;
  onSave: (department: StaffDepartment) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState<StaffDepartment>(emptyDepartment);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<StaffDepartment | null>(null);
  const [busy, setBusy] = React.useState(false);

  const dirty = Boolean(draft.name.trim() || draft.description?.trim() || draft.id);

  React.useEffect(() => {
    if (!open) {
      setDraft(emptyDepartment());
      setNameError(null);
    }
  }, [open]);

  const reset = () => {
    setDraft(emptyDepartment());
    setNameError(null);
  };

  const submit = async () => {
    if (!draft.name.trim()) {
      setNameError("Inserisci un nome per il reparto");
      showToast("error", "Inserisci un nome per il reparto");
      return;
    }
    const existing = departments.find(
      (dept) => dept.name.toLowerCase() === draft.name.trim().toLowerCase(),
    );
    if (existing && !draft.id) {
      setNameError(`Il reparto ${draft.name} esiste già`);
      showToast("error", `Il reparto ${draft.name} esiste già`);
      return;
    }
    const name = normalizeDepartmentName(draft.name);
    const toSave: StaffDepartment = {
      ...draft,
      name,
      id: draft.id || makeDepartmentId(name),
    };
    setBusy(true);
    try {
      await onSave(toSave);
      showToast("success", draft.id ? `Reparto ${name} aggiornato` : `Reparto ${draft.name} creato con successo`);
      reset();
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await onDelete(deleting.id);
      if (draft.id === deleting.id) reset();
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        width="default"
        eyebrow="Staff"
        title="Gestisci reparti"
        description="I reparti raggruppano il personale. Un membro sta in un reparto solo."
        dirty={dirty}
        data-test="staff-departments-drawer"
        footer={
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        }
      >
        <FieldSizeProvider size="sm">
          <DrawerSection eyebrow={draft.id ? "Modifica reparto" : "Crea nuovo reparto"}>
            <div className="flex flex-col gap-4">
              <Field label="Nome reparto" htmlFor="staff-department-name" required error={nameError}>
                <TextInput
                  id="staff-department-name"
                  value={draft.name}
                  onChange={(event) => {
                    setDraft({ ...draft, name: event.target.value });
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Nome reparto"
                  autoComplete="off"
                />
              </Field>
              <Field label="Descrizione" htmlFor="staff-department-description">
                <Textarea
                  id="staff-department-description"
                  value={draft.description || ""}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="Descrizione del reparto"
                  rows={2}
                />
              </Field>
              <Field label="Colore">
                <div role="radiogroup" aria-label="Colore del reparto" className="flex flex-wrap gap-2">
                  {STAFF_DEPARTMENT_COLORS.map((color) => {
                    const selected = draft.color === color.name;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={color.name}
                        onClick={() => setDraft({ ...draft, color: color.name })}
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-egw-chip border transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
                          selected ? "border-egw-navy-800 bg-white" : "border-transparent hover:border-egw-control-border",
                        )}
                      >
                        <span aria-hidden className={cn("h-4 w-4 rounded-full", color.swatch)} />
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="neutral" size="sm" onClick={() => void submit()} loading={busy}>
                  {draft.id ? "Salva reparto" : "Crea reparto"}
                </Button>
                {draft.id ? (
                  <Button variant="secondary" size="sm" onClick={reset} disabled={busy}>
                    Annulla modifica
                  </Button>
                ) : null}
              </div>
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Reparti esistenti">
            {departments.length ? (
              <ul className="flex flex-col gap-2">
                {departments.map((dept) => {
                  const assigned = staffCountsByDepartment[dept.name.toLowerCase()] || 0;
                  return (
                    <li key={dept.id}>
                      <InsetBlock className="flex items-start gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <DataChip tone={departmentChipTone(dept)}>{dept.name}</DataChip>
                            <span className="egw-num font-brand text-[11.5px] text-egw-ink-62">
                              {assigned} staff assegnati
                            </span>
                          </div>
                          {dept.description ? (
                            <p className="mt-1.5 line-clamp-2 font-brand text-[12px] text-egw-ink-62">{dept.description}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <IconButton
                            aria-label={`Modifica ${dept.name}`}
                            size="xs"
                            variant="row"
                            onClick={() =>
                              setDraft({
                                id: dept.id,
                                name: dept.name,
                                description: dept.description || "",
                                color: dept.color || DEFAULT_DEPARTMENT_COLOR,
                              })
                            }
                          >
                            <Pencil />
                          </IconButton>
                          <IconButton
                            aria-label={`Elimina ${dept.name}`}
                            size="xs"
                            variant="row"
                            className="text-egw-red hover:text-egw-red"
                            onClick={() => setDeleting(dept)}
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </InsetBlock>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="font-brand text-[12.5px] text-egw-ink-62">Nessun reparto creato</p>
            )}
          </DrawerSection>
        </FieldSizeProvider>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={`Eliminare il reparto ${deleting?.name ?? ""}?`}
        description={
          deleting && (staffCountsByDepartment[deleting.name.toLowerCase()] || 0) > 0
            ? `${staffCountsByDepartment[deleting.name.toLowerCase()]} membri dello staff restano senza reparto. Le loro schede non cambiano altro.`
            : "Nessun membro dello staff usa questo reparto."
        }
        confirmLabel="Elimina"
        tone="danger"
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  );
}
