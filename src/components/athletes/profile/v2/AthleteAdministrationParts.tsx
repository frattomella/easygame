"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox } from "@/components/web/primitives/Controls";
import { InsetBlock, Eyebrow, Hairline } from "@/components/web/primitives/Surface";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { SummaryCard } from "@/components/web/page/Cards";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, Select } from "@/components/web/forms/Field";
import { formatDateShort, formatMoney, MISSING } from "@/lib/web/format";
import { MONEY_STATUS } from "@/lib/web/status";
import type { NormalizedPaymentPlan, NormalizedPaymentPlanService } from "@/lib/payment-plan-utils";

/**
 * Le parti dell'area Amministrazione che la V1 teneva in pagina: l'editor del
 * piano (dentro «Composizione della quota» di `AthleteEnrollmentTab`), il
 * cassetto «Conferma piano/abbonamento» e la conferma «Creare i pagamenti?».
 *
 * I numeri arrivano gia calcolati dal dominio (`calculateAthleteExpectedIncome`,
 * `generateInstallmentPreview`, `describeProrationResult`): qui si mostrano.
 */

type Proration = { label: string; detail: string | null; tone: "applied" | "neutral" | "warning" };

/* ── Editor del piano ──────────────────────────────────────────────────── */
export function AthletePlanEditor({
  planValue,
  plans,
  onPlanChange,
  discountValue,
  discounts,
  onDiscountChange,
  selectedPlan,
  requiredServices,
  optionalServices,
  selectedOptionalServiceIds,
  proration,
}: {
  planValue: string;
  plans: NormalizedPaymentPlan[];
  onPlanChange: (value: string) => void;
  discountValue: string;
  discounts: any[];
  onDiscountChange: (value: string) => void;
  selectedPlan: NormalizedPaymentPlan | null;
  requiredServices: NormalizedPaymentPlanService[];
  optionalServices: NormalizedPaymentPlanService[];
  selectedOptionalServiceIds: Set<string>;
  proration: Proration;
}) {
  return (
    <div className="flex flex-col gap-5">
      <FormGrid columns={2}>
        <Field label="Piano di pagamento" htmlFor="enrollment-plan">
          <Select
            id="enrollment-plan"
            value={planValue}
            onValueChange={onPlanChange}
            placeholder="Seleziona un piano di pagamento"
            options={[
              { value: "none", label: "Nessun piano" },
              ...plans.filter((plan) => plan.active).map((plan) => ({ value: plan.id, label: `${plan.name} · ${formatMoney(plan.totalAmount)}` })),
            ]}
          />
        </Field>
        <Field label="Sconto applicato" htmlFor="enrollment-discount">
          <Select
            id="enrollment-discount"
            value={discountValue || "none"}
            onValueChange={onDiscountChange}
            placeholder="Seleziona uno sconto"
            options={[
              { value: "none", label: "Nessuno sconto" },
              ...discounts
                .filter((discount: any) => discount.active !== false)
                .map((discount: any) => ({
                  value: String(discount.title || discount.name || discount.id),
                  label: [
                    discount.title || discount.name,
                    discount.type === "percentage" && discount.value ? `− ${discount.value}%` : null,
                    discount.type === "fixed" && discount.value ? `− ${formatMoney(discount.value)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" "),
                })),
            ]}
          />
        </Field>
      </FormGrid>

      {selectedPlan ? (
        <InsetBlock className="flex flex-col gap-4">
          <div>
            <p className="font-brand text-[13px] font-semibold text-egw-ink">Servizi</p>
            <p className="font-brand text-[11.5px] text-egw-ink-62">
              Gli obbligatori sono sempre inclusi. Gli opzionali valgono solo per questo atleta e si cambiano dalla conferma del piano.
            </p>
          </div>
          <ServiceRows eyebrow="Obbligatori" services={requiredServices} empty="Nessun servizio obbligatorio." />
          {optionalServices.length ? (
            <ServiceRows eyebrow="Opzionali" services={optionalServices} selected={selectedOptionalServiceIds} readOnly />
          ) : null}
          <div>
            <Eyebrow className="mb-1.5">Pro-rata</Eyebrow>
            {/*
              Quattro situazioni diverse dicevano tutte «non applicato»:
              `describeProrationResult` le distingue.
            */}
            <p
              className={
                proration.tone === "applied"
                  ? "font-brand text-[13px] font-semibold text-egw-green"
                  : proration.tone === "warning"
                    ? "font-brand text-[13px] font-semibold text-egw-amber-ink"
                    : "font-brand text-[13px] text-egw-ink-62"
              }
            >
              {proration.label}
            </p>
            {proration.detail ? <p className="mt-0.5 font-brand text-[12px] text-egw-ink-62">{proration.detail}</p> : null}
          </div>
        </InsetBlock>
      ) : null}
    </div>
  );
}

function ServiceRows({
  eyebrow,
  services,
  empty,
  selected,
  readOnly,
  onToggle,
}: {
  eyebrow: string;
  services: NormalizedPaymentPlanService[];
  empty?: string;
  selected?: Set<string>;
  readOnly?: boolean;
  onToggle?: (serviceId: string, checked: boolean) => void;
}) {
  return (
    <div>
      <Eyebrow className="mb-2">{eyebrow}</Eyebrow>
      {services.length ? (
        <ul className="divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-white">
          {services.map((service) => (
            <li key={service.id} className="flex min-h-[44px] items-center gap-3 px-3 py-2">
              {selected ? (
                <Checkbox
                  checked={selected.has(service.id)}
                  disabled={readOnly}
                  aria-label={service.name}
                  onChange={(event) => onToggle?.(service.id, event.target.checked)}
                />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="egw-ellipsis block font-brand text-[13px] font-medium text-egw-ink">{service.name}</span>
                {service.description ? <span className="egw-ellipsis block font-brand text-[11.5px] text-egw-ink-62">{service.description}</span> : null}
              </span>
              <span className="egw-num shrink-0 font-brand text-[13px] font-bold text-egw-ink">{formatMoney(service.price)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-brand text-[12px] text-egw-ink-62">{empty}</p>
      )}
    </div>
  );
}

/* ── Conferma piano / abbonamento ──────────────────────────────────────── */
export type PlanConfirmationDraft = {
  planId: string;
  subscriptionStartDate: string;
  selectedOptionalServiceIds: string[];
  manualEnrollmentAmount: string;
};

export type InstallmentPreviewRow = { id: string; label: string; dueDate?: string | null; amount: number };

export function AthletePlanConfirmationDrawer({
  open,
  onOpenChange,
  plan,
  draft,
  setDraft,
  requiredServices,
  optionalServices,
  baseTotal,
  grossAmount,
  totalDiscounts,
  expectedTotal,
  prorationApplied,
  proration,
  prorationWarning,
  previewWarnings,
  installments,
  saving,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: NormalizedPaymentPlan | null;
  draft: PlanConfirmationDraft | null;
  setDraft: React.Dispatch<React.SetStateAction<PlanConfirmationDraft | null>>;
  requiredServices: NormalizedPaymentPlanService[];
  optionalServices: NormalizedPaymentPlanService[];
  baseTotal: number;
  grossAmount: number;
  totalDiscounts: number;
  expectedTotal: number;
  prorationApplied: boolean;
  proration: Proration;
  prorationWarning?: string | null;
  previewWarnings: string[];
  installments: InstallmentPreviewRow[];
  saving: boolean;
  onContinue: () => void;
}) {
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);
  const patch = (changes: Partial<PlanConfirmationDraft>) => {
    setDirty(true);
    setDraft((current) => (current ? { ...current, ...changes } : current));
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Iscrizione"
      title="Conferma piano / abbonamento"
      description={plan ? plan.name : undefined}
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={onContinue} disabled={saving || previewWarnings.length > 0}>
            Continua
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      {plan && draft ? (
        <FieldSizeProvider size="sm">
          <DrawerSection eyebrow="Periodo">
            <FormGrid columns={2}>
              <Field label="Data inizio abbonamento" required htmlFor="plan-start" helper="Parte dalla data di iscrizione: modificabile per questo piano.">
                <DateInput id="plan-start" value={draft.subscriptionStartDate} onChange={(event) => patch({ subscriptionStartDate: event.target.value })} />
              </Field>
              {plan.proration.allowManualOverride ? (
                <Field label="Importo personalizzato" htmlFor="plan-manual-amount" helper="Vuoto: calcolo automatico." width="16ch">
                  <CurrencyInput id="plan-manual-amount" value={draft.manualEnrollmentAmount} onChange={(event) => patch({ manualEnrollmentAmount: event.target.value })} />
                </Field>
              ) : null}
            </FormGrid>
          </DrawerSection>

          <DrawerSection eyebrow="Servizi">
            <div className="flex flex-col gap-4">
              <ServiceRows eyebrow="Obbligatori" services={requiredServices} empty="Nessun servizio obbligatorio." />
              <ServiceRows
                eyebrow="Opzionali"
                services={optionalServices}
                empty="Nessun servizio opzionale."
                selected={new Set(draft.selectedOptionalServiceIds)}
                onToggle={(serviceId, checked) => {
                  const next = new Set(draft.selectedOptionalServiceIds);
                  if (checked) next.add(serviceId);
                  else next.delete(serviceId);
                  patch({ selectedOptionalServiceIds: Array.from(next) });
                }}
              />
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Totali">
            <SummaryCard
              dashed
              rows={[
                { label: "Servizi", value: formatMoney(baseTotal) },
                {
                  label: "Pro-rata",
                  value: prorationApplied ? formatMoney(grossAmount) : proration.label,
                  tone: proration.tone === "warning" ? "amber" : "ink",
                },
                { label: "Sconti", value: formatMoney(-(totalDiscounts || 0)), tone: totalDiscounts ? "amber" : "muted" },
              ]}
              total={{ label: "Totale finale", value: formatMoney(expectedTotal || 0), tone: "green" }}
            />
            {proration.detail ? <p className="mt-2 font-brand text-[12px] text-egw-ink-62">{proration.detail}</p> : null}
            {prorationWarning ? (
              <AlertBlock severity="warning" title={prorationWarning} className="mt-3" />
            ) : null}
            {previewWarnings.length > 0 ? (
              <AlertBlock severity="danger" title={previewWarnings[0]} className="mt-3" />
            ) : null}
          </DrawerSection>

          <DrawerSection eyebrow="Anteprima pagamenti">
            <ul className="divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-egw-page-100">
              {installments.map((installment) => (
                <li key={installment.id} className="flex min-h-[44px] flex-wrap items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 font-brand text-[13px] font-medium text-egw-ink">{installment.label}</span>
                  <span className="font-brand text-[12px] text-egw-ink-62">Scadenza {installment.dueDate ? formatDateShort(installment.dueDate) : MISSING}</span>
                  <span className="egw-num font-brand text-[13px] font-bold text-egw-ink">{formatMoney(installment.amount)}</span>
                </li>
              ))}
            </ul>
          </DrawerSection>
        </FieldSizeProvider>
      ) : null}
    </Drawer>
  );
}

/* ── Creare i pagamenti? ───────────────────────────────────────────────── */
export function CreatePaymentsConfirmDialog({
  open,
  onOpenChange,
  planName,
  installments,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string | null;
  installments: InstallmentPreviewRow[];
  saving: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Creare i pagamenti?"
      description={`Verranno creati ${installments.length} pagamenti in attesa nello storico dell'atleta.`}
      confirmLabel="Conferma e crea pagamenti"
      loading={saving}
      onConfirm={onConfirm}
    >
      <ul className="divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-egw-page-100">
        {installments.map((installment, index) => (
          <li key={installment.id} className="flex min-h-[44px] flex-wrap items-center gap-3 px-3 py-2">
            <span className="egw-num w-6 shrink-0 font-brand text-[12px] font-bold text-egw-ink-42">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="egw-ellipsis block font-brand text-[13px] font-medium text-egw-ink">
                {planName || "Piano"} · {installment.label}
              </span>
              <span className="block font-brand text-[11.5px] text-egw-ink-62">Scadenza {installment.dueDate ? formatDateShort(installment.dueDate) : MISSING}</span>
            </span>
            <span className="egw-num font-brand text-[13px] font-bold text-egw-ink">{formatMoney(installment.amount)}</span>
            <StatusPill status={MONEY_STATUS.pending} size="sm" />
          </li>
        ))}
      </ul>
      <Hairline className="my-3" />
    </ConfirmDialog>
  );
}
