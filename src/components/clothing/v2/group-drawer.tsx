"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, FormGrid, MultiSelect, TextInput } from "@/components/web/forms/Field";
import { Checkbox } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import type { NumberingGroup } from "@/lib/clothing-inventory-utils";
import type { NormalizedCategoryOption } from "@/lib/category-utils";
import { getActiveClubSites, isMultiSiteClub, type ClubSite } from "@/lib/club-sites";

/**
 * Il modulo del gruppo di numerazione (V1: dialogo «Gruppo numerazione»).
 * Sette campi → cassetto da 480. Le categorie e le sedi erano elenchi di
 * caselle: qui sono `MultiSelect` (con ricerca, obbligatoria sopra otto
 * voci). Vuoto significa «tutte», per entrambi gli assi, come in V1
 * (ADR-0038 per le sedi). `reservedNumbers`/`assignedNumbers` non si
 * editano e restano quelli del record.
 */
export function GroupDrawer({
  open,
  onOpenChange,
  initial,
  categoryOptions,
  sites,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: NumberingGroup;
  categoryOptions: NormalizedCategoryOption[];
  sites: ClubSite[];
  onSave: (group: NumberingGroup) => Promise<boolean>;
}) {
  const [form, setForm] = React.useState<NumberingGroup>(initial);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; range?: string }>({});

  React.useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors({});
    }
  }, [open, initial]);

  const patch = (updates: Partial<NumberingGroup>) => setForm((current) => ({ ...current, ...updates }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const multiSite = isMultiSiteClub(sites);

  const submit = async () => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Nome gruppo obbligatorio";
    if (Number(form.minNumber) > Number(form.maxNumber)) next.range = "Intervallo numeri non valido";
    setErrors(next);
    if (next.name || next.range) return;
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
      eyebrow="Numerazioni"
      title={form.id ? "Modifica gruppo" : "Nuovo gruppo numerazione"}
      description="I numeri sono unici solo dentro il gruppo."
      dirty={dirty}
      locked={busy}
      data-test="clothing-group-drawer"
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
        <DrawerSection eyebrow="Gruppo">
          <div className="flex flex-col gap-4">
            <Field label="Nome gruppo" htmlFor="group-name" required error={errors.name}>
              <TextInput id="group-name" value={form.name} onChange={(event) => { patch({ name: event.target.value }); setErrors((c) => ({ ...c, name: undefined })); }} placeholder="Es. Under 15" />
            </Field>
            <Field label="Stagione" htmlFor="group-season" optional helper="Solo un'etichetta: non filtra i numeri.">
              <TextInput id="group-season" value={form.season || ""} onChange={(event) => patch({ season: event.target.value })} placeholder="2026/2027" />
            </Field>
            <FormGrid>
              <Field label="Numero minimo" htmlFor="group-min" width="12ch" error={errors.range}>
                <TextInput id="group-min" type="number" numeric value={form.minNumber} onChange={(event) => { patch({ minNumber: Number(event.target.value) }); setErrors((c) => ({ ...c, range: undefined })); }} />
              </Field>
              <Field label="Numero massimo" htmlFor="group-max" width="12ch">
                <TextInput id="group-max" type="number" numeric value={form.maxNumber} onChange={(event) => { patch({ maxNumber: Number(event.target.value) }); setErrors((c) => ({ ...c, range: undefined })); }} />
              </Field>
            </FormGrid>
          </div>
        </DrawerSection>

        <DrawerSection eyebrow="Chi numera">
          <div className="flex flex-col gap-4">
            <Field label="Categorie" htmlFor="group-categories" helper={categoryOptions.length ? "Nessuna categoria selezionata significa «tutte»." : "Nessuna categoria configurata."}>
              <MultiSelect
                id="group-categories"
                values={form.categoryIds}
                onValuesChange={(values) => patch({ categoryIds: values })}
                options={categoryOptions.map((category) => ({ value: category.id, label: category.name }))}
                placeholder="Tutte le categorie"
                searchPlaceholder="Cerca categoria"
                disabled={!categoryOptions.length}
              />
            </Field>
            {multiSite ? (
              <Field label="Sedi del gruppo" htmlFor="group-sites" helper="Nessuna sede selezionata significa «tutte». Serve a numerare separatamente la stessa categoria svolta in due sedi.">
                <MultiSelect
                  id="group-sites"
                  values={form.siteIds}
                  onValuesChange={(values) => patch({ siteIds: values })}
                  options={getActiveClubSites(sites).map((site) => ({ value: site.id, label: site.name }))}
                  placeholder="Tutte le sedi"
                  searchPlaceholder="Cerca sede"
                />
              </Field>
            ) : null}
            <InsetBlock>
              <label className="flex cursor-pointer items-start gap-2.5 font-brand text-[13px] text-egw-ink">
                <Checkbox checked={form.includeCompatibleCategories} onChange={(event) => patch({ includeCompatibleCategories: event.target.checked })} />
                <span>
                  <span className="block font-semibold">Includi le categorie compatibili</span>
                  <span className="mt-1 block text-[12px] leading-[1.45] text-egw-ink-62">
                    Aggiunge gli atleti che le categorie del gruppo dichiarano compatibili nella scheda Categorie. L&apos;eleggibilità non cambia la categoria dell&apos;atleta.
                  </span>
                </span>
              </label>
            </InsetBlock>
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
