import {
  INSTALLMENT_STATUS_LABELS,
  OBLIGATION_KIND_LABELS,
  OBLIGATION_STATUS_LABELS,
  RELATIONSHIP_STATUS_LABELS,
  RELATIONSHIP_TYPE_LABELS,
  SPORT_WORK_ROLE_LABELS,
  type InstallmentStatus,
  type ObligationKind,
  type ObligationStatus,
  type RelationshipStatus,
  type RelationshipType,
  type SportWorkRole,
} from "@/lib/sport-work/model";

/**
 * Formattazione e colori del dominio «Lavoro sportivo».
 *
 * Le **etichette** vengono dal dominio (`model.ts`) e non si riscrivono qui:
 * duplicarle vorrebbe dire che un giorno una schermata chiamerebbe «scaduta»
 * cio che il motore chiama «maturata». Qui sta solo cio che e davvero di
 * presentazione — colore, formato, ordine.
 */

export const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

export const formatPercent = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export const formatDate = (value?: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("it-IT");
};

export const formatDateInput = (value?: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export const todayInput = () => new Date().toISOString().slice(0, 10);

export const relationshipStatusBadge: Record<
  RelationshipStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: RELATIONSHIP_STATUS_LABELS.DRAFT,
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
  ACTIVE: {
    label: RELATIONSHIP_STATUS_LABELS.ACTIVE,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  SUSPENDED: {
    label: RELATIONSHIP_STATUS_LABELS.SUSPENDED,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  EXPIRED: {
    label: RELATIONSHIP_STATUS_LABELS.EXPIRED,
    className: "border-orange-200 bg-orange-50 text-orange-700",
  },
  TERMINATED: {
    label: RELATIONSHIP_STATUS_LABELS.TERMINATED,
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

export const installmentStatusBadge: Record<
  InstallmentStatus,
  { label: string; className: string }
> = {
  SCHEDULED: {
    label: INSTALLMENT_STATUS_LABELS.SCHEDULED,
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
  ACCRUED: {
    label: INSTALLMENT_STATUS_LABELS.ACCRUED,
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  PARTIALLY_PAID: {
    label: INSTALLMENT_STATUS_LABELS.PARTIALLY_PAID,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  PAID: {
    label: INSTALLMENT_STATUS_LABELS.PAID,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  OVERDUE: {
    label: INSTALLMENT_STATUS_LABELS.OVERDUE,
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  CANCELLED: {
    label: INSTALLMENT_STATUS_LABELS.CANCELLED,
    className: "border-slate-200 bg-slate-50 text-slate-400 line-through",
  },
};

export const obligationStatusBadge: Record<
  ObligationStatus,
  { label: string; className: string }
> = {
  DUE: {
    label: OBLIGATION_STATUS_LABELS.DUE,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  IN_PROGRESS: {
    label: OBLIGATION_STATUS_LABELS.IN_PROGRESS,
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  COMPLETED: {
    label: OBLIGATION_STATUS_LABELS.COMPLETED,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  NOT_DUE: {
    label: OBLIGATION_STATUS_LABELS.NOT_DUE,
    className: "border-slate-200 bg-slate-100 text-slate-500",
  },
};

export const relationshipTypeLabel = (value: unknown) =>
  RELATIONSHIP_TYPE_LABELS[String(value) as RelationshipType] || String(value || "—");

export const roleLabel = (value: unknown) =>
  SPORT_WORK_ROLE_LABELS[String(value) as SportWorkRole] || String(value || "—");

export const obligationKindLabel = (value: unknown) =>
  OBLIGATION_KIND_LABELS[String(value) as ObligationKind] || String(value || "—");

export const statusBadgeOf = <T extends string>(
  map: Record<T, { label: string; className: string }>,
  value: unknown,
  fallback: T,
) => map[String(value) as T] || map[fallback];

/**
 * Quanti giorni mancano a una data. Negativo se e passata.
 *
 * Serve a decidere il colore di una riga e il testo di un avviso: «scade fra
 * tre giorni» e «scaduta da tre giorni» sono due frasi diverse, e mostrare la
 * prima quando vale la seconda e il modo piu rapido per far perdere fiducia a
 * una segreteria.
 */
export const daysUntil = (value?: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const start = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((start(date) - start(new Date())) / 86400000);
};

export const dueLabel = (value?: unknown) => {
  const days = daysUntil(value);
  if (days === null) return "";
  if (days < 0) return `scaduta da ${Math.abs(days)} ${Math.abs(days) === 1 ? "giorno" : "giorni"}`;
  if (days === 0) return "scade oggi";
  if (days === 1) return "scade domani";
  return `fra ${days} giorni`;
};
