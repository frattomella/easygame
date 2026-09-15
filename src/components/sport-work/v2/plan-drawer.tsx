"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, Select, TextInput } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock, Eyebrow, Hairline } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { formatDateShort, formatInteger, formatMoney } from "@/lib/web/format";
import { COMPENSATION_PLAN_KINDS, COMPENSATION_PLAN_KIND_LABELS } from "@/lib/sport-work/model";
import { generatePlanItems, planTotal, splitPlanByScheduledYear } from "@/lib/sport-work/plan";
import { emptyPlanForm, planFormToConfig, type PlanForm } from "@/components/sport-work/v2/sport-work-forms";

/**
 * L'editor del **piano compensi**, in un cassetto da 720 (il modulo e
 * l'anteprima insieme).
 *
 * **L'anteprima si calcola nel browser con lo stesso modulo del server.**
 * `generatePlanItems` e puro: cio che la segreteria vede prima di salvare e,
 * riga per riga, cio che il server scrivera.
 *
 * **Il riepilogo per anno solare non e un dettaglio.** Dodicimila euro di
 * stagione 2026/27 non sono dodicimila euro del 2026: le rate ricadono su due
 * anni, su due franchigie intere e su due rule set diversi.
 */
export function PlanDrawer({
  open,
  onOpenChange,
  relationshipId,
  hasPlan,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relationshipId: string;
  hasPlan: boolean;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = React.useState<PlanForm>(emptyPlanForm);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(emptyPlanForm());
    setDirty(false);
  }, [open]);

  const setField = (field: keyof PlanForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  };

  const preview = React.useMemo(() => {
    try {
      const items = generatePlanItems(planFormToConfig(form) as any);
      return { items, error: null as string | null };
    } catch (error: any) {
      return { items: [] as any[], error: String(error?.message || "") };
    }
  }, [form]);

  const perYear = React.useMemo(() => splitPlanByScheduledYear(preview.items), [preview.items]);

  const handleSave = async () => {
    if (preview.error) {
      showToast("error", preview.error);
      return;
    }
    setSaving(true);
    const { error } = await apiRequest(`/api/v1/sport-work/relationships/${encodeURIComponent(relationshipId)}/plan`, {
      method: "PUT",
      body: { ...form, ...planFormToConfig(form) },
    });
    setSaving(false);
    if (error) {
      showToast("error", error.message || "Salvataggio del piano non riuscito");
      return;
    }
    showToast("success", "Piano compensi salvato");
    setDirty(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Compensi"
      title={hasPlan ? "Rifai il piano compensi" : "Piano compensi"}
      description="Le scadenze nascono programmate. Maturano quando il loro periodo è trascorso, non quando qualcuno lo dice."
      dirty={dirty}
      locked={saving}
      data-test="sport-work-plan-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving} disabled={preview.items.length === 0}>
            Salva piano
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-6">
          <DrawerSection eyebrow="Forma del piano">
            <div className="flex flex-col gap-5">
              <Field label="Forma del piano" htmlFor="plan-kind">
                <Select
                  id="plan-kind"
                  value={form.kind}
                  onValueChange={(value) => setField("kind", value)}
                  options={COMPENSATION_PLAN_KINDS.filter((kind) => kind !== "CUSTOM").map((kind) => ({ value: kind, label: COMPENSATION_PLAN_KIND_LABELS[kind] }))}
                />
              </Field>
              {form.kind === "EQUAL_INSTALMENTS" ? (
                <FormGrid>
                  <Field label="Importo complessivo" htmlFor="plan-total" required width="16ch">
                    <CurrencyInput id="plan-total" value={form.totalAmount} onChange={(event) => setField("totalAmount", event.target.value)} />
                  </Field>
                  <Field label="Numero di rate" htmlFor="plan-count" required width="10ch">
                    <TextInput id="plan-count" numeric inputMode="numeric" value={form.installmentCount} onChange={(event) => setField("installmentCount", event.target.value)} />
                  </Field>
                  <Field label="Prima scadenza" htmlFor="plan-first" required width="14ch">
                    <DateInput id="plan-first" value={form.firstDueDate} onChange={(event) => setField("firstDueDate", event.target.value)} />
                  </Field>
                </FormGrid>
              ) : (
                <FormGrid>
                  <Field label="Importo mensile" htmlFor="plan-monthly" required width="16ch">
                    <CurrencyInput id="plan-monthly" value={form.monthlyAmount} onChange={(event) => setField("monthlyAmount", event.target.value)} />
                  </Field>
                  <Field label="Giorno di scadenza" htmlFor="plan-day" width="10ch" helper="Vuoto: fine mese.">
                    <TextInput id="plan-day" numeric inputMode="numeric" placeholder="fine mese" value={form.dueDayOfMonth} onChange={(event) => setField("dueDayOfMonth", event.target.value)} />
                  </Field>
                  <Field label="Da" htmlFor="plan-start" required width="14ch">
                    <TextInput id="plan-start" type="month" className="egw-num" value={form.startMonth} onChange={(event) => setField("startMonth", event.target.value)} />
                  </Field>
                  <Field label="A" htmlFor="plan-end" required width="14ch">
                    <TextInput id="plan-end" type="month" className="egw-num" value={form.endMonth} onChange={(event) => setField("endMonth", event.target.value)} />
                  </Field>
                </FormGrid>
              )}
            </div>
          </DrawerSection>

          {preview.error ? (
            dirty ? (
              <AlertBlock severity="warning" title="Il piano non è ancora calcolabile">
                {preview.error}
              </AlertBlock>
            ) : null
          ) : preview.items.length > 0 ? (
            <DrawerSection eyebrow="Anteprima">
              <InsetBlock className="p-0">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 font-brand">
                  <span className="text-[12.5px] font-bold text-egw-ink">{formatInteger(preview.items.length)} scadenze</span>
                  <span className="egw-num text-[13px] font-extrabold text-egw-ink">{formatMoney(planTotal(preview.items))}</span>
                </div>
                <Hairline />
                <ul className="egw-scroll max-h-56 overflow-y-auto">
                  {preview.items.map((item) => (
                    <li key={item.sequence} className="flex items-center justify-between gap-3 px-4 py-2 font-brand text-[12.5px]">
                      <span className="egw-ellipsis min-w-0 text-egw-ink-72">
                        {item.label} · <span className="egw-num">{formatDateShort(item.dueDate)}</span>
                      </span>
                      <span className="egw-num shrink-0 font-semibold text-egw-ink">{formatMoney(item.grossAmount)}</span>
                    </li>
                  ))}
                </ul>
              </InsetBlock>
              {perYear.length > 1 ? (
                <AlertBlock severity="info" title={`Questo piano attraversa ${perYear.length} anni solari`} className="mt-3">
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {perYear.map((year) => (
                      <li key={year.year} className="egw-num">
                        {year.year}: {year.count} rate per {formatMoney(year.total)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">Ogni anno ha franchigie proprie e regole proprie: il calcolo dei contributi usa quelle dell&apos;anno in cui il denaro esce, non quelle della stagione.</p>
                </AlertBlock>
              ) : null}
            </DrawerSection>
          ) : null}

          {!dirty ? (
            <div className="flex flex-col gap-1">
              <Eyebrow>Come funziona</Eyebrow>
              <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">Compila la forma del piano: l&apos;anteprima mostra riga per riga cio che verra scritto, con il riepilogo per anno solare.</p>
            </div>
          ) : null}
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
