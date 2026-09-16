"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  FileHeart,
  FolderKanban,
  MapPin,
  Phone,
  ShieldCheck,
  UserCircle2,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow, InsetBlock, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { DataChip, IconChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { EmptyStateCard, KpiCard } from "@/components/web/page/Cards";
import { ACTIVITY_STATUS, type StatusSpec } from "@/lib/web/status";
import { cn } from "@/lib/utils";
import { type TrainerNavigationPermissionKey } from "@/lib/trainer-dashboard-permissions";

/**
 * Le superfici dell'area allenatore, sui pezzi del Web V2 (guideline 09):
 * stesse firme di prima — le dieci pagine le montano cosi — e sotto `Panel`,
 * `KpiCard`, `StatusPill`, `DataChip`, `EmptyStateCard`. Le card in
 * gradiente viola/arancio/verde dei moduli non esistono piu (deprecated.md):
 * un modulo e un pannello bianco con l'occhiello e il chip d'icona nel suo tono.
 */

export const formatDate = (value: unknown) => {
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/**
 * Lo stato di un evento, come pillola del sistema (`ACTIVITY_STATUS`). Resta
 * la stessa firma: chi la chiama riceve `spec` da passare a `StatusPill`, e
 * `label` per chi legge solo la parola.
 */
export const getStatusBadgeClasses = (
  status: string | null | undefined,
  startsAt?: Date | null,
  endsAt?: Date | null,
): { label: string; spec: StatusSpec } => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const now = new Date();

  if (normalizedStatus === "cancelled" || normalizedStatus === "annullato") {
    return { label: "Annullato", spec: ACTIVITY_STATUS.cancelled };
  }

  if (startsAt && endsAt && startsAt <= now && endsAt >= now) {
    return { label: "In corso", spec: ACTIVITY_STATUS.in_progress };
  }

  if (endsAt && endsAt < now) {
    return { label: "Concluso", spec: ACTIVITY_STATUS.completed };
  }

  return { label: "In programma", spec: ACTIVITY_STATUS.scheduled };
};

/** La pillola dello stato di un evento, pronta da montare. */
export function EventStatusPill({ status, startsAt, endsAt }: { status: string | null | undefined; startsAt?: Date | null; endsAt?: Date | null }) {
  return <StatusPill status={getStatusBadgeClasses(status, startsAt, endsAt).spec} size="sm" />;
}

export const getAthleteDisplayName = (athlete: any) =>
  [
    athlete?.first_name || athlete?.data?.name || athlete?.name || "",
    athlete?.last_name || athlete?.data?.surname || athlete?.surname || "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || "Atleta";

export const getAthleteCategoryName = (athlete: any) =>
  String(athlete?.category_name || athlete?.data?.categoryName || "-").trim() ||
  "-";

export const getAthletePhone = (athlete: any) =>
  String(
    athlete?.data?.phone ||
      athlete?.phone ||
      athlete?.data?.emergencyPhone ||
      "",
  ).trim() || "-";

export const getAthleteMedicalExpiry = (athlete: any) =>
  athlete?.data?.medicalCertExpiry ||
  athlete?.medical_cert_expiry ||
  athlete?.medicalCertExpiry ||
  null;

export const formatTimeValue = (value: unknown) => {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 5) : "--:--";
};

export const formatTimeRange = (
  startTime: unknown,
  endTime?: unknown,
) => {
  const start = formatTimeValue(startTime);
  const end = formatTimeValue(endTime);

  return endTime ? `${start} - ${end}` : start;
};

export function SectionEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <EmptyStateCard title={title} description={description} />;
}

export function SectionBlockedState({
  section,
}: {
  section: TrainerNavigationPermissionKey;
}) {
  const labels: Record<TrainerNavigationPermissionKey, string> = {
    home: "Dashboard",
    trainings: "Allenamenti",
    matches: "Gare",
    athletes: "Atleti",
    categories: "Squadre e categorie",
    board: "Bacheca",
    documents: "Documenti",
    appointments: "Appuntamenti",
    notifications: "Notifiche",
    compensation: "I miei compensi",
  };

  return (
    <SectionEmptyState
      title={`${labels[section]} non disponibile`}
      description="Questa sezione è stata disattivata dal club nella gestione dei permessi trainer."
    />
  );
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  accentClassName,
  topBarClassName,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  accentClassName: string;
  topBarClassName?: string;
}) {
  /* Il tono lo si legge dalla classe d'accento che le pagine passano gia. */
  const tone = accentClassName.includes("green")
    ? "green"
    : accentClassName.includes("orange")
      ? "orange"
      : accentClassName.includes("amber")
        ? "amber"
        : accentClassName.includes("red")
          ? "red"
          : "blue";
  void topBarClassName;
  return <KpiCard label={label} value={value} icon={<Icon />} iconTone={tone} />;
}

const FEATURE_TONE_STYLES = {
  violet: { chip: "blue" as const },
  orange: { chip: "orange" as const },
  emerald: { chip: "green" as const },
  blue: { chip: "blue" as const },
} as const;

export function FeatureHighlightCard({
  tone,
  title,
  count,
  icon: Icon,
  footer,
  children,
}: {
  tone: keyof typeof FEATURE_TONE_STYLES;
  title: string;
  count?: number | string;
  icon: typeof Users;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = FEATURE_TONE_STYLES[tone];

  return (
    <Panel as="section" className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip tone={styles.chip} size={36}>
            <Icon />
          </IconChip>
          <h3 className="font-brand text-[15px] font-bold leading-5 text-egw-ink">{title}</h3>
        </div>
        {count !== undefined ? <DataChip className="egw-num">{count}</DataChip> : null}
      </div>
      <div className="space-y-3">{children}</div>
      {footer ? <div className="[&_a]:text-egw-blue-700 [&_button]:text-egw-blue-700">{footer}</div> : null}
    </Panel>
  );
}

export function SurfacePanel({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: typeof Users;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel as="section" className={cn("min-w-0", className)}>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            {Icon ? (
              <IconChip tone="blue" size={30} className="[&>svg]:h-[15px] [&>svg]:w-[15px]">
                <Icon />
              </IconChip>
            ) : null}
            <span>{title}</span>
          </span>
        }
        description={description}
        actions={action}
      />
      {children}
    </Panel>
  );
}

export function CompactEntityCard({
  title,
  leadingBadge,
  badge,
  lines,
  footer,
  actions,
  className,
  onClick,
}: {
  title: string;
  leadingBadge?: React.ReactNode;
  badge?: React.ReactNode;
  lines: React.ReactNode[];
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-egw-field border border-egw-hairline bg-white p-4 transition-colors hover:bg-egw-page-050",
        onClick ? "cursor-pointer" : "",
        className,
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {leadingBadge}
            <p className="truncate text-sm font-semibold text-egw-ink">
              {title}
            </p>
          </div>
        </div>
        {badge}
      </div>
      <div className="mt-3 space-y-1.5 text-sm text-egw-ink-62">
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
      {footer ? <div className="mt-3 border-t border-egw-rule pt-3">{footer}</div> : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function HomeOverviewCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Panel as="section">
      <PanelHeader title={title} actions={action} />
      <div className="space-y-3">{children}</div>
    </Panel>
  );
}

export function TrainingMeta({
  date,
  time,
  endTime,
  location,
  category,
  showDetails,
}: {
  date: unknown;
  time: string | null | undefined;
  endTime?: string | null;
  location?: string | null;
  category?: string | null;
  showDetails: boolean;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-egw-panel-sm bg-egw-page-100 px-4 py-3 text-sm text-egw-ink-72">
          <div className="inline-flex items-center gap-2 font-medium text-egw-ink-72">
            <CalendarDays className="h-4 w-4 text-egw-blue-700" />
            Data
          </div>
          <p className="mt-1">{formatDate(date)}</p>
        </div>
        <div className="rounded-egw-panel-sm bg-egw-page-100 px-4 py-3 text-sm text-egw-ink-72">
          <div className="inline-flex items-center gap-2 font-medium text-egw-ink-72">
            <Clock3 className="h-4 w-4 text-egw-blue-700" />
            Orario
          </div>
          <p className="mt-1">
            {String(time || "").slice(0, 5)}
            {endTime ? ` - ${String(endTime).slice(0, 5)}` : ""}
          </p>
        </div>
      </div>

      {showDetails ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-egw-panel-sm bg-egw-page-100 px-4 py-3 text-sm text-egw-ink-72">
            <div className="inline-flex items-center gap-2 font-medium text-egw-ink-72">
              <MapPin className="h-4 w-4 text-egw-blue-700" />
              Luogo
            </div>
            <p className="mt-1">{location || "Campo"}</p>
          </div>
          <div className="rounded-egw-panel-sm bg-egw-page-100 px-4 py-3 text-sm text-egw-ink-72">
            <div className="inline-flex items-center gap-2 font-medium text-egw-ink-72">
              <FolderKanban className="h-4 w-4 text-egw-blue-700" />
              Categoria
            </div>
            <p className="mt-1">{category || "Categoria"}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AthleteInfoGrid({
  athlete,
  showDetails,
  showContacts,
  showMedical,
}: {
  athlete: any;
  showDetails: boolean;
  showContacts: boolean;
  showMedical: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showDetails ? (
        <div className="rounded-egw-panel-sm bg-egw-page-100 px-4 py-3 text-sm text-egw-ink-72">
          <div className="inline-flex items-center gap-2 font-medium text-egw-ink-72">
            <CalendarDays className="h-4 w-4 text-egw-green" />
            Data di nascita
          </div>
          <p className="mt-1">
            {athlete?.birth_date
              ? formatDate(athlete.birth_date)
              : athlete?.data?.birthDate
                ? formatDate(athlete.data.birthDate)
                : "-"}
          </p>
        </div>
      ) : null}

      {showContacts ? (
        <div className="rounded-egw-panel-sm bg-egw-page-100 px-4 py-3 text-sm text-egw-ink-72">
          <div className="inline-flex items-center gap-2 font-medium text-egw-ink-72">
            <Phone className="h-4 w-4 text-egw-green" />
            Contatto
          </div>
          <p className="mt-1">{getAthletePhone(athlete)}</p>
        </div>
      ) : null}

      {showMedical ? (
        <div className="rounded-egw-panel-sm bg-egw-page-100 px-4 py-3 text-sm text-egw-ink-72 sm:col-span-2">
          <div className="inline-flex items-center gap-2 font-medium text-egw-ink-72">
            <FileHeart className="h-4 w-4 text-egw-green" />
            Certificato medico
          </div>
          <p className="mt-1">
            {getAthleteMedicalExpiry(athlete)
              ? `Scadenza ${formatDate(getAthleteMedicalExpiry(athlete))}`
              : "Non registrato"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function CategoryVisibilitySummary({
  viewAthleteDetails,
  viewAthleteTechnicalSheet,
  viewAthleteContacts,
  viewMedicalStatus,
}: {
  viewAthleteDetails: boolean;
  viewAthleteTechnicalSheet: boolean;
  viewAthleteContacts: boolean;
  viewMedicalStatus: boolean;
}) {
  return (
    <InsetBlock className="space-y-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-egw-ink">
        <ShieldCheck className="h-4 w-4 text-egw-blue-700" />
        Visibilità attiva per questa categoria
      </div>
      <div className="flex flex-wrap gap-2">
        <DataChip>Scheda atleta {viewAthleteDetails ? "visibile" : "limitata"}</DataChip>
        <DataChip>Scheda tecnica {viewAthleteTechnicalSheet ? "visibile" : "nascosta"}</DataChip>
        <DataChip>Contatti {viewAthleteContacts ? "visibili" : "nascosti"}</DataChip>
        <DataChip>Medico {viewMedicalStatus ? "visibile" : "nascosto"}</DataChip>
      </div>
    </InsetBlock>
  );
}

export function ActionLinkButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Button asChild variant="outline">
      <Link className="inline-flex items-center gap-2" href={href}>
        {label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}

export function AthleteIdentityCard({ athlete }: { athlete: any }) {
  return (
    <div className="flex items-start gap-4">
      <IconChip tone="green" size={48} className="[&>svg]:h-5 [&>svg]:w-5">
        <UserCircle2 />
      </IconChip>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold text-egw-ink">
          {getAthleteDisplayName(athlete)}
        </p>
        <p className="truncate text-sm text-egw-ink-62">
          {getAthleteCategoryName(athlete)}
        </p>
      </div>
    </div>
  );
}
