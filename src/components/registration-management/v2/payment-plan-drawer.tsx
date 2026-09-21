"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import {
  CurrencyInput,
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  Select,
  TextInput,
  Textarea,
} from "@/components/web/forms/Field";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Checkbox } from "@/components/web/primitives/Controls";
import { Eyebrow, Hairline, InsetBlock } from "@/components/web/primitives/Surface";
import { formatMoney } from "@/lib/web/format";
import { generateMonthlyDueDates, PAYMENT_PLAN_SERVICE_TYPES } from "@/lib/payment-plan-utils";
import {
  applyProrationChange,
  computePlanPreview,
  createEmptyPaymentPlanDraft,
  createPlanInstallment,
  createPlanService,
  describeProrationPeriod,
  discountIdOf,
  planDraftFromRecord,
  validatePlanDraft,
  type PaymentPlanDraft,
  type PlanInstallmentDraft,
  type PlanServiceDraft,
  type SeasonPeriod,
} from "./plan-form-model";

/**
 * Il modulo del piano di pagamento in un cassetto da 720 (guideline 06 §6.7,
 * 08 §8.5: un modulo a sezioni con piu di otto campi e due elenchi ripetuti).
 *
 * E il dialogo «Nuovo Piano / Abbonamento» della V1 con **ogni** campo:
 * nome, descrizione, totale automatico, i servizi (nome, tipo, prezzo,
 * descrizione, opzionale, incluso), le rate (nome, tipo importo, valore,
 * scadenza in giorni), il pro-rata (abilita, metodo, override, periodo e la
 * frase che dice quale periodo verra usato), l'anteprima, gli sconti
 * applicabili e le note interne. I calcoli e il record salvato sono quelli di
 * `plan-form-model.ts`, cioe della V1.
 *
 * Cambia la forma della validazione: l'errore sta accanto al campo e non
 * solo nel toast (08 §8.3), e l'avviso sulle rate — che nella V1 era gia in
 * linea — resta in linea e blocca il salvataggio come prima.
 */

const SERVICE_TYPE_OPTIONS = PAYMENT_PLAN_SERVICE_TYPES.map((type) => ({
  value: type.value,
  label: type.label,
}));

const INSTALLMENT_TYPE_OPTIONS = [
  { value: "percentage", label: "Percentuale" },
  { value: "fixed", label: "Importo fisso" },
  { value: "remaining", label: "Saldo restante" },
];

const PRORATION_METHOD_OPTIONS = [
  { value: "days", label: "Per giorni" },
  { value: "months", label: "Per mesi" },
];

const numberOr = (value: string, fallback = 0) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function PaymentPlanDrawer({
  open,
  onOpenChange,
  plan,
  discounts,
  seasonPeriod,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Il piano da modificare; `null` per un piano nuovo. */
  plan: Record<string, any> | null;
  discounts: Array<Record<string, any>>;
  seasonPeriod: SeasonPeriod | null;
  saving: boolean;
  onSave: (draft: PaymentPlanDraft, validServices: PlanServiceDraft[]) => Promise<boolean>;
}) {
  const initial = React.useMemo(
    () => (plan ? planDraftFromRecord(plan) : createEmptyPaymentPlanDraft()),
    [plan],
  );
  const [draft, setDraft] = React.useState<PaymentPlanDraft>(initial);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [servicesError, setServicesError] = React.useState<string | null>(null);
  const initialJson = React.useMemo(() => JSON.stringify(initial), [initial]);

  React.useEffect(() => {
    if (open) {
      setDraft(initial);
      setNameError(null);
      setServicesError(null);
    }
  }, [open, initial]);

  const dirty = JSON.stringify(draft) !== initialJson;

  const preview = React.useMemo(() => computePlanPreview(draft, seasonPeriod), [draft, seasonPeriod]);
  const { currentPlanTotal, prorationPreview, installmentPreview } = preview;

  const update = (patch: Partial<PaymentPlanDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const updateService = (serviceId: string, patch: Partial<PlanServiceDraft>) =>
    setDraft((current) => ({
      ...current,
      services: current.services.map((service) =>
        service.id === serviceId ? { ...service, ...patch } : service,
      ),
    }));

  const addService = () =>
    setDraft((current) => ({ ...current, services: [...current.services, createPlanService()] }));

  const removeService = (serviceId: string) =>
    setDraft((current) => ({
      ...current,
      services:
        current.services.length > 1
          ? current.services.filter((service) => service.id !== serviceId)
          : current.services,
    }));

  const updateInstallment = (installmentId: string, patch: Partial<PlanInstallmentDraft>) =>
    setDraft((current) => ({
      ...current,
      installmentSchedule: current.installmentSchedule.map((installment) =>
        installment.id === installmentId ? { ...installment, ...patch } : installment,
      ),
    }));

  const addInstallment = () =>
    setDraft((current) => ({
      ...current,
      installmentSchedule: [
        ...current.installmentSchedule,
        createPlanInstallment(current.installmentSchedule.length),
      ],
    }));

  const removeInstallment = (installmentId: string) =>
    setDraft((current) => ({
      ...current,
      installmentSchedule:
        current.installmentSchedule.length > 1
          ? current.installmentSchedule.filter((installment) => installment.id !== installmentId)
          : current.installmentSchedule,
    }));

  /*
    **Il preset mensile aggiunge, non sostituisce** (D10): l'acconto («Prima
    quota») resta la rata che l'operatore ha gia scritto a mano con
    «Aggiungi rata»; questo genera solo le N rate ricorrenti, con le date
    gia chiuse dentro il mese che c'e (`generateMonthlyDueDates`).
  */
  const [monthlyPreset, setMonthlyPreset] = React.useState({
    count: 8,
    dayOfMonth: 1,
    startDate: "",
    amount: 0,
  });
  const applyMonthlyPreset = () => {
    const dates = generateMonthlyDueDates({
      startDate: monthlyPreset.startDate,
      dayOfMonth: monthlyPreset.dayOfMonth,
      count: monthlyPreset.count,
    });
    if (!dates.length) return;
    setDraft((current) => ({
      ...current,
      installmentSchedule: [
        ...current.installmentSchedule,
        ...dates.map((dueDate, index) => ({
          id: `${Date.now()}_mensile_${index}`,
          label: `Rata mensile ${index + 1}`,
          amountType: "fixed" as const,
          amount: monthlyPreset.amount,
          dueAfterDays: 0,
          dueDate,
        })),
      ],
    }));
  };

  const updateProration = (field: keyof PaymentPlanDraft["proration"], value: string | boolean) =>
    setDraft((current) => ({
      ...current,
      proration: applyProrationChange(current.proration, field, value),
    }));

  const toggleDiscount = (discountId: string, checked: boolean) =>
    setDraft((current) => {
      const ids = new Set(current.applicableDiscountIds || []);
      if (checked) ids.add(discountId);
      else ids.delete(discountId);
      return { ...current, applicableDiscountIds: Array.from(ids) };
    });

  const submit = async () => {
    const result = validatePlanDraft(draft, installmentPreview.warnings);
    if (!result.ok) {
      setNameError(result.field === "name" ? result.message : null);
      setServicesError(result.field === "services" ? result.message : null);
      if (result.field === "installments") {
        document.getElementById("plan-installments")?.scrollIntoView({ block: "center" });
      }
      return;
    }
    setNameError(null);
    setServicesError(null);
    const saved = await onSave(draft, result.validServices);
    if (saved) onOpenChange(false);
  };

  const activeDiscounts = discounts.filter((discount) => discount.active !== false);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Iscrizioni"
      title={plan ? "Modifica piano" : "Nuovo piano / abbonamento"}
      description="Servizi, rate e pro-rata del listino che un'iscrizione puo scegliere."
      dirty={dirty}
      locked={saving}
      data-test="payment-plan-drawer"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            {plan ? "Aggiorna" : "Salva"}
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Piano">
          <FormGrid>
            <Field label="Nome piano" htmlFor="plan-name" required error={nameError}>
              <TextInput
                id="plan-name"
                value={draft.name}
                onChange={(event) => {
                  update({ name: event.target.value });
                  if (nameError) setNameError(null);
                }}
                placeholder="Es. Stagione completa"
                autoComplete="off"
              />
            </Field>
            <InsetBlock>
              <Eyebrow className="mb-2">Totale automatico</Eyebrow>
              <p className="egw-num font-brand text-[22px] font-extrabold leading-none text-egw-ink">
                {formatMoney(currentPlanTotal)}
              </p>
              <p className="mt-1.5 font-brand text-[11.5px] text-egw-ink-62">Somma dei servizi inclusi nel piano.</p>
            </InsetBlock>
          </FormGrid>
          <Field label="Descrizione" htmlFor="plan-description" className="mt-5">
            <Textarea
              id="plan-description"
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
              placeholder="Descrizione del piano"
            />
          </Field>
        </DrawerSection>

        <DrawerSection
          eyebrow="Servizi inclusi"
          title="Dettaglia quote, allenamenti, assicurazione, kit o componenti extra del piano."
        >
          <div className="flex flex-col gap-3">
            {draft.services.map((service, index) => (
              <InsetBlock key={service.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Servizio {index + 1}</p>
                  <IconButton
                    aria-label="Rimuovi servizio"
                    size="xs"
                    variant="row"
                    onClick={() => removeService(service.id)}
                    disabled={draft.services.length <= 1}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Nome servizio" htmlFor={`service-name-${service.id}`}>
                    <TextInput
                      id={`service-name-${service.id}`}
                      value={service.name}
                      onChange={(event) => {
                        updateService(service.id, { name: event.target.value });
                        if (servicesError) setServicesError(null);
                      }}
                      placeholder="Es. Allenamenti stagione"
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Tipo" htmlFor={`service-type-${service.id}`}>
                      <Select
                        id={`service-type-${service.id}`}
                        value={service.type}
                        onValueChange={(value) => updateService(service.id, { type: value })}
                        options={SERVICE_TYPE_OPTIONS}
                      />
                    </Field>
                    <Field label="Prezzo" htmlFor={`service-price-${service.id}`}>
                      <CurrencyInput
                        id={`service-price-${service.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={service.price}
                        onChange={(event) => updateService(service.id, { price: numberOr(event.target.value) })}
                      />
                    </Field>
                  </div>
                  <Field label="Descrizione servizio" htmlFor={`service-description-${service.id}`} className="sm:col-span-2">
                    <Textarea
                      id={`service-description-${service.id}`}
                      value={service.description}
                      onChange={(event) => updateService(service.id, { description: event.target.value })}
                      placeholder="Dettaglio opzionale visibile nel riepilogo"
                      rows={2}
                      className="min-h-[64px]"
                    />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  <label className="flex cursor-pointer items-center gap-2 font-brand text-[12.5px] text-egw-ink">
                    <Checkbox
                      checked={Boolean(service.optional)}
                      onChange={(event) =>
                        updateService(service.id, {
                          optional: event.target.checked,
                          required: !event.target.checked,
                        })
                      }
                    />
                    Opzionale per atleta
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 font-brand text-[12.5px] text-egw-ink">
                    <Checkbox
                      checked={service.included}
                      onChange={(event) => updateService(service.id, { included: event.target.checked })}
                    />
                    Incluso nel totale
                  </label>
                </div>
              </InsetBlock>
            ))}
          </div>
          {servicesError ? (
            <p role="alert" className="mt-2 font-brand text-[11.5px] font-medium text-egw-red">
              {servicesError}
            </p>
          ) : null}
          <Button variant="secondary" size="sm" icon={<Plus />} className="mt-3" onClick={addService}>
            Aggiungi servizio
          </Button>
        </DrawerSection>

        <DrawerSection
          eyebrow="Rate e scadenze"
          title="Le scadenze sono relative alla data inizio iscrizione dell'atleta."
        >
          <div id="plan-installments" className="flex flex-col gap-3">
            {draft.installmentSchedule.map((installment, index) => (
              <InsetBlock key={installment.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Rata {index + 1}</p>
                  <IconButton
                    aria-label="Rimuovi rata"
                    size="xs"
                    variant="row"
                    onClick={() => removeInstallment(installment.id)}
                    disabled={draft.installmentSchedule.length <= 1}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Nome rata" htmlFor={`installment-label-${installment.id}`}>
                    <TextInput
                      id={`installment-label-${installment.id}`}
                      value={installment.label}
                      onChange={(event) => updateInstallment(installment.id, { label: event.target.value })}
                      placeholder="Es. Prima rata"
                    />
                  </Field>
                  <Field label="Tipo importo" htmlFor={`installment-type-${installment.id}`}>
                    <Select
                      id={`installment-type-${installment.id}`}
                      value={installment.amountType}
                      onValueChange={(value) =>
                        updateInstallment(installment.id, {
                          amountType: value as PlanInstallmentDraft["amountType"],
                        })
                      }
                      options={INSTALLMENT_TYPE_OPTIONS}
                    />
                  </Field>
                  <Field label="Valore" htmlFor={`installment-amount-${installment.id}`}>
                    <TextInput
                      id={`installment-amount-${installment.id}`}
                      type="number"
                      numeric
                      min="0"
                      step="0.01"
                      value={installment.amount}
                      disabled={installment.amountType === "remaining"}
                      onChange={(event) => updateInstallment(installment.id, { amount: numberOr(event.target.value) })}
                      placeholder={installment.amountType === "percentage" ? "%" : "EUR"}
                      trailing={installment.amountType === "percentage" ? "%" : "€"}
                    />
                  </Field>
                  <Field
                    label="Scadenza dopo giorni"
                    htmlFor={`installment-days-${installment.id}`}
                    helper={installment.dueDate ? "Ignorata: questa rata ha una data esatta." : undefined}
                  >
                    <TextInput
                      id={`installment-days-${installment.id}`}
                      type="number"
                      numeric
                      min="0"
                      disabled={Boolean(installment.dueDate)}
                      value={installment.dueAfterDays}
                      onChange={(event) =>
                        updateInstallment(installment.id, {
                          dueAfterDays: parseInt(event.target.value, 10) || 0,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Data esatta (facoltativa)"
                    htmlFor={`installment-due-date-${installment.id}`}
                    helper="Vince sulla scadenza a giorni, per un piano scritto con date di calendario (D9)."
                  >
                    <DateInput
                      id={`installment-due-date-${installment.id}`}
                      value={installment.dueDate || ""}
                      onChange={(event) =>
                        updateInstallment(installment.id, { dueDate: event.target.value || null })
                      }
                    />
                  </Field>
                </div>
              </InsetBlock>
            ))}
          </div>
          {installmentPreview.warnings.length > 0 ? (
            <p role="alert" className="mt-2 font-brand text-[11.5px] font-medium text-egw-red">
              {installmentPreview.warnings[0]}
            </p>
          ) : null}
          <Button variant="secondary" size="sm" icon={<Plus />} className="mt-3" onClick={addInstallment}>
            Aggiungi rata
          </Button>

          <InsetBlock className="mt-4">
            <Eyebrow>Preset mensile</Eyebrow>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Rate">
                <TextInput
                  type="number"
                  numeric
                  min="1"
                  value={monthlyPreset.count}
                  onChange={(event) => setMonthlyPreset((current) => ({ ...current, count: parseInt(event.target.value, 10) || 1 }))}
                />
              </Field>
              <Field label="Importo">
                <TextInput
                  type="number"
                  numeric
                  min="0"
                  step="0.01"
                  trailing="€"
                  value={monthlyPreset.amount}
                  onChange={(event) => setMonthlyPreset((current) => ({ ...current, amount: numberOr(event.target.value) }))}
                />
              </Field>
              <Field label="A partire dal">
                <DateInput
                  value={monthlyPreset.startDate}
                  onChange={(event) => setMonthlyPreset((current) => ({ ...current, startDate: event.target.value }))}
                />
              </Field>
              <Field label="Giorno del mese">
                <TextInput
                  type="number"
                  numeric
                  min="1"
                  max="31"
                  value={monthlyPreset.dayOfMonth}
                  onChange={(event) => setMonthlyPreset((current) => ({ ...current, dayOfMonth: parseInt(event.target.value, 10) || 1 }))}
                />
              </Field>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              disabled={!monthlyPreset.startDate}
              onClick={applyMonthlyPreset}
            >
              Genera rate mensili
            </Button>
          </InsetBlock>
        </DrawerSection>

        <DrawerSection
          eyebrow="Calcolo quota stagionale"
          title="Il pro-rata viene applicato quando assegni il piano a un atleta con data inizio."
        >
          <label className="flex cursor-pointer items-center gap-2 font-brand text-[12.5px] text-egw-ink">
            <Checkbox
              checked={Boolean(draft.proration.enabled)}
              onChange={(event) => updateProration("enabled", event.target.checked)}
            />
            Abilita calcolo proporzionale
          </label>
          {draft.proration.enabled ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Metodo" htmlFor="plan-proration-method">
                <Select
                  id="plan-proration-method"
                  value={draft.proration.method}
                  onValueChange={(value) => updateProration("method", value)}
                  options={PRORATION_METHOD_OPTIONS}
                />
              </Field>
              <Field label="Permetti override manuale">
                <label className="flex h-[42px] cursor-pointer items-center gap-2 font-brand text-[12.5px] text-egw-ink">
                  <Checkbox
                    checked={Boolean(draft.proration.allowManualOverride)}
                    onChange={(event) => updateProration("allowManualOverride", event.target.checked)}
                  />
                  Modifica importo in scheda atleta
                </label>
              </Field>
              <Field label="Inizio periodo/stagione" htmlFor="plan-proration-start">
                <DateInput
                  id="plan-proration-start"
                  value={draft.proration.seasonStartDate}
                  onChange={(event) => updateProration("seasonStartDate", event.target.value)}
                />
              </Field>
              <Field label="Fine periodo/stagione" htmlFor="plan-proration-end">
                <DateInput
                  id="plan-proration-end"
                  value={draft.proration.seasonEndDate}
                  onChange={(event) => updateProration("seasonEndDate", event.target.value)}
                />
              </Field>
              {/*
                Lasciare vuote le due date era la causa piu comune del pro-rata
                «non applicato»: ora il periodo lo mette la stagione attiva, e
                qui si dice quale (`fallbackPeriod: seasonPeriod`).
              */}
              <p className="font-brand text-[12px] text-egw-ink-62 sm:col-span-2">
                {describeProrationPeriod(draft.proration, seasonPeriod)}
              </p>
            </div>
          ) : null}
        </DrawerSection>

        <DrawerSection
          eyebrow="Anteprima"
          title="Esempio calcolato con data inizio oggi e rate arrotondate a multipli di 5 euro."
        >
          <InsetBlock dashed>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Eyebrow className="mb-1.5">Totale servizi</Eyebrow>
                <p className="egw-num font-brand text-[15px] font-bold text-egw-ink">{formatMoney(currentPlanTotal)}</p>
              </div>
              <div>
                <Eyebrow className="mb-1.5">Totale esempio</Eyebrow>
                <p className="egw-num font-brand text-[15px] font-bold text-egw-ink">{formatMoney(prorationPreview.total)}</p>
              </div>
              <div>
                <Eyebrow className="mb-1.5">Rate</Eyebrow>
                <p className="egw-num font-brand text-[15px] font-bold text-egw-ink">{installmentPreview.installments.length}</p>
              </div>
            </div>
            <Hairline className="my-3" />
            <ul className="flex flex-col gap-1.5">
              {installmentPreview.installments.map((installment) => (
                <li
                  key={installment.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 font-brand text-[12.5px]"
                >
                  <span className="font-semibold text-egw-ink">{installment.label}</span>
                  <span className="text-egw-ink-62">Dopo {installment.dueAfterDays} giorni</span>
                  <span className="egw-num font-bold text-egw-ink">{formatMoney(installment.amount)}</span>
                </li>
              ))}
            </ul>
            {prorationPreview.warning ? (
              <p className="mt-3 font-brand text-[12px] font-medium text-egw-amber-ink">{prorationPreview.warning}</p>
            ) : null}
          </InsetBlock>
        </DrawerSection>

        <DrawerSection
          eyebrow="Sconti applicabili"
          title="Se non selezioni nulla, tutti gli sconti restano applicabili a questo piano."
        >
          {activeDiscounts.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {activeDiscounts.map((discount) => {
                const discountId = discountIdOf(discount);
                return (
                  <label
                    key={discountId}
                    className="flex cursor-pointer items-center gap-2 rounded-egw-field border border-egw-hairline bg-egw-page-100 px-3 py-2 font-brand text-[12.5px] text-egw-ink"
                  >
                    <Checkbox
                      checked={draft.applicableDiscountIds.includes(discountId)}
                      onChange={(event) => toggleDiscount(discountId, event.target.checked)}
                    />
                    <span className="egw-ellipsis">{discount.title || discount.name || "Sconto"}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="font-brand text-[12.5px] text-egw-ink-62">Nessuno sconto configurato.</p>
          )}
        </DrawerSection>

        <DrawerSection eyebrow="Note">
          <Field label="Note interne" htmlFor="plan-notes">
            <Textarea
              id="plan-notes"
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Note operative opzionali"
              rows={3}
            />
          </Field>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
