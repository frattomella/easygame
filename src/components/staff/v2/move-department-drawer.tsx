"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, Select } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { joinMeta } from "@/lib/web/format";
import type { StaffDepartment } from "@/lib/staff-directory";
import { getStaffDisplayName, type StaffMember } from "@/components/staff/v2/staff-model";

/**
 * L'azione di massa «Sposta in un reparto» (guideline 07 §7.7: un cassetto
 * da 480, mai un menu che scrive al primo clic). Il reparto e **uno solo**
 * per persona: qui si sostituisce, non si aggiunge — e la differenza con
 * l'assegnazione degli allenatori, e la V1 lo scriveva nel menu.
 */
export function MoveDepartmentDrawer({
  open,
  onOpenChange,
  rows,
  departments,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: StaffMember[];
  departments: StaffDepartment[];
  onConfirm: (department: StaffDepartment) => Promise<void>;
}) {
  const [departmentId, setDepartmentId] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const chosen = departments.find((d) => d.id === departmentId) || null;

  React.useEffect(() => {
    if (!open) setDepartmentId("");
  }, [open]);

  const run = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      await onConfirm(chosen);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={`Azione su ${rows.length} ${rows.length === 1 ? "membro dello staff" : "membri dello staff"}`}
      title="Sposta in un reparto"
      description="Il reparto è uno solo: sostituisce quello attuale."
      dirty={Boolean(departmentId)}
      locked={busy}
      data-test="staff-move-department-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void run()} disabled={!chosen} loading={busy}>
            Sposta
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Record interessati">
          <InsetBlock className="egw-scroll max-h-[240px] overflow-y-auto p-2">
            <ul className="flex flex-col">
              {rows.map((row) => (
                <li key={row.id} className="flex h-11 items-center border-b border-egw-rule px-2 last:border-0">
                  <IdentityCell name={getStaffDisplayName(row)} round meta={joinMeta(row.role, row.department || "Non assegnato")} />
                </li>
              ))}
            </ul>
          </InsetBlock>
        </DrawerSection>
        <DrawerSection eyebrow="Opzioni">
          <Field label="Nuovo reparto" htmlFor="staff-move-department" required>
            <Select
              id="staff-move-department"
              value={departmentId}
              onValueChange={setDepartmentId}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Seleziona reparto"
            />
          </Field>
        </DrawerSection>
        {chosen ? (
          <DrawerSection eyebrow="Conferma">
            <InsetBlock>
              <p className="font-brand text-[12.5px] text-egw-ink">
                <strong className="egw-num">{rows.length}</strong> {rows.length === 1 ? "membro dello staff passa" : "membri dello staff passano"} al reparto <strong>{chosen.name}</strong>. Il reparto precedente viene sostituito.
              </p>
            </InsetBlock>
          </DrawerSection>
        ) : null}
      </FieldSizeProvider>
    </Drawer>
  );
}
