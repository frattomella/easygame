"use client";

import * as React from "react";
import { CellChips } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, ViewDef } from "@/components/web/datagrid/types";
import { StatusPill, DataChip } from "@/components/web/primitives/StatusPill";
import { PERSON_STATUS, type StatusSpec } from "@/lib/web/status";
import { formatMoney, formatPercent } from "@/lib/web/format";
import { normalizePaymentPlan, type NormalizedPaymentPlan } from "@/lib/payment-plan-utils";
import {
  paymentStatusLabel,
  type ClubPaymentMethodOption,
} from "@/lib/payments/payment-config-utils";
import type {
  ClubPaymentProviderConfig,
  PaymentProviderDefinition,
  PaymentProviderStatus,
} from "@/lib/payments/payment-types";

/**
 * Le tre griglie di «Iscrizioni» come configurazione del `DataGrid`
 * (guideline 07): piani di pagamento, metodi manuali, sconti — piu la
 * tabella in sola lettura dei provider online. Nessun calcolo nuovo: i
 * numeri di un piano li da `normalizePaymentPlan`, come nelle card della V1.
 */

/* ── Stati locali (candidati a `src/lib/web/status.ts`) ─────────────────── */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/** Un piano, un metodo, uno sconto: attivo o disattivato (§9.4, «Persona»: le stesse due parole). */
export const configurationStatus = (active: boolean): StatusSpec =>
  active ? PERSON_STATUS.active : PERSON_STATUS.inactive;

const PROVIDER_ENABLED = spec("ABILITATO", "solid", "green");
const PROVIDER_DISABLED = spec("DISABILITATO", "quiet", "neutral");
const PROVIDER_AVAILABLE = spec("DISPONIBILE", "solid", "green");
const PROVIDER_UNAVAILABLE = spec("NON DISPONIBILE", "quiet", "neutral");

/** Lo stato di configurazione del provider, nelle parole di `paymentStatusLabel`. */
export const providerConfigStatus = (status: PaymentProviderStatus): StatusSpec => {
  const label = paymentStatusLabel(status).toUpperCase();
  switch (status) {
    case "active":
      return spec(label, "solid", "green");
    case "configured":
      return spec(label, "solid", "blue");
    case "onboarding_required":
      return spec(label, "outline", "amber");
    case "error":
      return spec(label, "urgent", "red");
    default:
      return spec(label, "quiet", "neutral");
  }
};

/* ── Piani ──────────────────────────────────────────────────────────────── */
export type PlanRow = {
  id: string;
  raw: Record<string, any>;
  plan: NormalizedPaymentPlan;
};

export const toPlanRows = (plans: readonly unknown[]): PlanRow[] =>
  plans.map((raw) => {
    const plan = normalizePaymentPlan(raw);
    return { id: plan.id, raw: raw as Record<string, any>, plan };
  });

const prorationLabel = (plan: NormalizedPaymentPlan) =>
  plan.proration.enabled ? (plan.proration.method === "months" ? "Mesi" : "Giorni") : null;

export const PLAN_VIEWS: ViewDef[] = [
  { id: "active", label: "Attivi", filters: { state: "active" }, builtIn: true },
  { id: "inactive", label: "Disattivati", filters: { state: "inactive" }, builtIn: true },
];

export const PLAN_FILTERS: FilterDef<PlanRow>[] = [
  {
    id: "state",
    label: "Stato",
    type: "select",
    pinned: true,
    options: [
      { value: "active", label: "Attivi" },
      { value: "inactive", label: "Disattivati" },
    ],
    apply: (row, value) => {
      if (typeof value !== "string" || !value) return true;
      return value === "active" ? row.plan.active : !row.plan.active;
    },
  },
  {
    id: "proration",
    label: "Pro-rata",
    type: "select",
    options: [
      { value: "yes", label: "Con pro-rata" },
      { value: "no", label: "Senza pro-rata" },
    ],
    apply: (row, value) => {
      if (typeof value !== "string" || !value) return true;
      return value === "yes" ? row.plan.proration.enabled : !row.plan.proration.enabled;
    },
  },
  {
    id: "installments",
    label: "Rate",
    type: "select",
    options: [
      { value: "single", label: "Pagamento unico" },
      { value: "multiple", label: "A rate" },
    ],
    apply: (row, value) => {
      if (typeof value !== "string" || !value) return true;
      return value === "single" ? row.plan.installmentsCount <= 1 : row.plan.installmentsCount > 1;
    },
  },
];

export const PLAN_COLUMNS: ColumnDef<PlanRow>[] = [
  {
    id: "name",
    header: "Piano",
    kind: "identity",
    locked: true,
    minWidth: 200,
    width: 1.8,
    cell: (row) => (
      <div className="min-w-0">
        <p className="egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink">{row.plan.name}</p>
        <p className="egw-ellipsis font-brand text-[11.5px] text-egw-ink-62">
          {row.plan.services.length} {row.plan.services.length === 1 ? "servizio" : "servizi"}
          {row.plan.description ? ` · ${row.plan.description}` : " · Nessuna descrizione"}
        </p>
      </div>
    ),
    sortValue: (row) => row.plan.name.toLowerCase(),
    title: (row) => [row.plan.name, row.plan.description].filter(Boolean).join(" — "),
    exportValue: (row) => row.plan.name,
  },
  {
    id: "services",
    header: "Servizi",
    kind: "chips",
    minWidth: 180,
    width: 1.6,
    cell: (row) => (
      <CellChips
        items={row.plan.services.map((service) => ({
          label: `${service.name} · ${formatMoney(service.price)}`,
          tone: service.optional ? "amber" : "neutral",
        }))}
        max={2}
      />
    ),
    title: (row) => row.plan.services.map((service) => `${service.name} · ${formatMoney(service.price)}`).join(", "),
    exportValue: (row) => row.plan.services.map((service) => `${service.name} (${formatMoney(service.price)})`).join(" | "),
  },
  {
    id: "total",
    header: "Totale servizi",
    kind: "amount",
    align: "right",
    width: "120px",
    cell: (row) => formatMoney(row.plan.totalAmount),
    sortValue: (row) => row.plan.totalAmount,
    exportValue: (row) => row.plan.totalAmount,
  },
  {
    id: "installments",
    header: "Rate",
    kind: "number",
    align: "right",
    width: "70px",
    cell: (row) => row.plan.installmentsCount,
    sortValue: (row) => row.plan.installmentsCount,
    exportValue: (row) => row.plan.installmentsCount,
  },
  {
    id: "firstDue",
    header: "Prima scadenza",
    kind: "text",
    width: "130px",
    cell: (row) => `Dopo ${row.plan.installments[0]?.dueAfterDays ?? 0} giorni`,
    sortValue: (row) => row.plan.installments[0]?.dueAfterDays ?? 0,
    exportValue: (row) => row.plan.installments[0]?.dueAfterDays ?? 0,
  },
  {
    id: "proration",
    header: "Pro-rata",
    kind: "classification",
    width: "90px",
    cell: (row) => prorationLabel(row.plan),
    sortValue: (row) => prorationLabel(row.plan) || "",
    exportValue: (row) => prorationLabel(row.plan) || "",
  },
  {
    id: "discounts",
    header: "Sconti applicabili",
    kind: "text",
    width: "130px",
    hidden: true,
    cell: (row) =>
      row.plan.applicableDiscountIds.length === 0
        ? "Tutti"
        : `${row.plan.applicableDiscountIds.length} ${row.plan.applicableDiscountIds.length === 1 ? "sconto" : "sconti"}`,
    exportValue: (row) => (row.plan.applicableDiscountIds.length === 0 ? "Tutti" : row.plan.applicableDiscountIds.join(" | ")),
  },
  {
    id: "state",
    header: "Stato",
    kind: "status",
    width: "120px",
    cell: (row) => <StatusPill status={configurationStatus(row.plan.active)} size="sm" />,
    sortValue: (row) => (row.plan.active ? 0 : 1),
    exportValue: (row) => configurationStatus(row.plan.active).label,
  },
];

export const planSearch = {
  placeholder: "Cerca per nome, descrizione o servizio",
  match: (row: PlanRow, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.plan.name, row.plan.description, ...row.plan.services.map((service) => service.name)]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(q));
  },
};

/* ── Metodi manuali ─────────────────────────────────────────────────────── */
export type MethodRow = ClubPaymentMethodOption;

export const METHOD_VIEWS: ViewDef[] = [
  { id: "active", label: "Attivi", filters: { state: "active" }, builtIn: true },
  { id: "inactive", label: "Disattivati", filters: { state: "inactive" }, builtIn: true },
];

export const METHOD_FILTERS: FilterDef<MethodRow>[] = [
  {
    id: "state",
    label: "Stato",
    type: "select",
    pinned: true,
    options: [
      { value: "active", label: "Attivi" },
      { value: "inactive", label: "Disattivati" },
    ],
    apply: (row, value) => {
      if (typeof value !== "string" || !value) return true;
      return value === "active" ? row.active : !row.active;
    },
  },
];

export const METHOD_COLUMNS: ColumnDef<MethodRow>[] = [
  {
    id: "name",
    header: "Metodo",
    kind: "identity",
    locked: true,
    minWidth: 180,
    width: 1.2,
    cell: (row) => <span className="egw-ellipsis block font-brand text-[13px] font-semibold text-egw-ink">{row.name}</span>,
    sortValue: (row) => row.name.toLowerCase(),
    title: (row) => row.name,
    exportValue: (row) => row.name,
  },
  {
    id: "details",
    header: "Dettagli",
    kind: "text",
    minWidth: 200,
    width: 2.4,
    cell: (row) => row.details || null,
    title: (row) => row.details || undefined,
    sortValue: (row) => row.details.toLowerCase(),
    exportValue: (row) => row.details,
  },
  {
    id: "state",
    header: "Stato",
    kind: "status",
    width: "120px",
    cell: (row) => <StatusPill status={configurationStatus(row.active)} size="sm" />,
    sortValue: (row) => (row.active ? 0 : 1),
    exportValue: (row) => configurationStatus(row.active).label,
  },
];

export const methodSearch = {
  placeholder: "Cerca per nome o dettagli",
  match: (row: MethodRow, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.name, row.details].some((value) => value.toLowerCase().includes(q));
  },
};

/* ── Provider online (sola lettura) ─────────────────────────────────────── */
export type ProviderRow = {
  id: string;
  definition: PaymentProviderDefinition;
  config: ClubPaymentProviderConfig;
  available: boolean;
};

export const PROVIDER_COLUMNS: ColumnDef<ProviderRow>[] = [
  {
    id: "method",
    header: "Metodo",
    kind: "identity",
    locked: true,
    minWidth: 160,
    width: 1.2,
    cell: (row) => (
      <span className="egw-ellipsis block font-brand text-[13px] font-semibold text-egw-ink">
        {row.config.publicLabel || row.definition.label}
      </span>
    ),
    exportValue: (row) => row.config.publicLabel || row.definition.label,
  },
  {
    id: "provider",
    header: "Provider",
    kind: "classification",
    width: "110px",
    cell: (row) => row.definition.label,
    exportValue: (row) => row.definition.label,
  },
  {
    id: "state",
    header: "Stato",
    kind: "chips",
    minWidth: 240,
    width: 2,
    cell: (row) => (
      <>
        <StatusPill status={row.config.enabled ? PROVIDER_ENABLED : PROVIDER_DISABLED} size="sm" />
        <StatusPill status={providerConfigStatus(row.config.status)} size="sm" />
        {!row.definition.isImplemented ? <DataChip size="sm">Predisposto</DataChip> : null}
      </>
    ),
    exportValue: (row) =>
      [
        row.config.enabled ? PROVIDER_ENABLED.label : PROVIDER_DISABLED.label,
        paymentStatusLabel(row.config.status),
        row.definition.isImplemented ? "" : "Predisposto",
      ]
        .filter(Boolean)
        .join(" · "),
  },
  {
    id: "available",
    header: "Disponibile",
    kind: "status",
    width: "150px",
    cell: (row) => <StatusPill status={row.available ? PROVIDER_AVAILABLE : PROVIDER_UNAVAILABLE} size="sm" />,
    exportValue: (row) => (row.available ? PROVIDER_AVAILABLE.label : PROVIDER_UNAVAILABLE.label),
  },
];

/* ── Sconti ─────────────────────────────────────────────────────────────── */
export type DiscountRow = {
  id: string;
  raw: Record<string, any>;
  title: string;
  type: "percentage" | "fixed";
  value: number;
  active: boolean;
};

export const toDiscountRows = (discounts: readonly unknown[]): DiscountRow[] =>
  discounts.map((raw, index) => {
    const record = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
    return {
      id: String(record.id || record.title || `discount_${index}`),
      raw: record,
      title: String(record.title || record.name || "Sconto"),
      type: record.type === "fixed" ? "fixed" : "percentage",
      value: Number(record.value) || 0,
      active: record.active !== false,
    };
  });

export const discountValueLabel = (row: DiscountRow) =>
  row.type === "percentage" ? formatPercent(row.value, 0) : formatMoney(row.value);

export const DISCOUNT_VIEWS: ViewDef[] = [
  { id: "active", label: "Attivi", filters: { state: "active" }, builtIn: true },
  { id: "inactive", label: "Disattivati", filters: { state: "inactive" }, builtIn: true },
];

export const DISCOUNT_FILTERS: FilterDef<DiscountRow>[] = [
  {
    id: "state",
    label: "Stato",
    type: "select",
    pinned: true,
    options: [
      { value: "active", label: "Attivi" },
      { value: "inactive", label: "Disattivati" },
    ],
    apply: (row, value) => {
      if (typeof value !== "string" || !value) return true;
      return value === "active" ? row.active : !row.active;
    },
  },
  {
    id: "type",
    label: "Tipo",
    type: "select",
    options: [
      { value: "percentage", label: "Percentuale" },
      { value: "fixed", label: "Importo fisso" },
    ],
    apply: (row, value) => {
      if (typeof value !== "string" || !value) return true;
      return row.type === value;
    },
  },
];

export const DISCOUNT_COLUMNS: ColumnDef<DiscountRow>[] = [
  {
    id: "title",
    header: "Sconto",
    kind: "identity",
    locked: true,
    minWidth: 180,
    width: 1.6,
    cell: (row) => <span className="egw-ellipsis block font-brand text-[13px] font-semibold text-egw-ink">{row.title}</span>,
    sortValue: (row) => row.title.toLowerCase(),
    title: (row) => row.title,
    exportValue: (row) => row.title,
  },
  {
    id: "value",
    header: "Valore",
    kind: "amount",
    align: "right",
    width: "110px",
    cell: (row) => discountValueLabel(row),
    sortValue: (row) => row.value,
    exportValue: (row) => row.value,
  },
  {
    id: "type",
    header: "Tipo",
    kind: "chips",
    width: "130px",
    cell: (row) => <DataChip size="sm">{row.type === "percentage" ? "Percentuale" : "Importo fisso"}</DataChip>,
    sortValue: (row) => row.type,
    exportValue: (row) => (row.type === "percentage" ? "Percentuale" : "Importo fisso"),
  },
  {
    id: "state",
    header: "Stato",
    kind: "status",
    width: "120px",
    cell: (row) => <StatusPill status={configurationStatus(row.active)} size="sm" />,
    sortValue: (row) => (row.active ? 0 : 1),
    exportValue: (row) => configurationStatus(row.active).label,
  },
];

export const discountSearch = {
  placeholder: "Cerca per titolo",
  match: (row: DiscountRow, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return row.title.toLowerCase().includes(q);
  },
};
