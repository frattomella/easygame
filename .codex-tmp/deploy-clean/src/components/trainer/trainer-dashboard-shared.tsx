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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type TrainerNavigationPermissionKey } from "@/lib/trainer-dashboard-permissions";

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

export const getStatusBadgeClasses = (
  status: string | null | undefined,
  startsAt?: Date | null,
  endsAt?: Date | null,
) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const now = new Date();

  if (normalizedStatus === "cancelled" || normalizedStatus === "annullato") {
    return {
      label: "Annullato",
      className:
        "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50",
    };
  }

  if (startsAt && endsAt && startsAt <= now && endsAt >= now) {
    return {
      label: "In corso",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    };
  }

  if (endsAt && endsAt < now) {
    return {
      label: "Concluso",
      className:
        "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
    };
  }

  return {
    label: "In programma",
    className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
  };
};

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
  return (
    <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-10 text-center">
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
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
    categories: "Categorie",
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
  return (
    <Card className="bg-white shadow-md border-0 overflow-hidden">
      <div className={cn("h-1 w-full bg-gradient-to-r", topBarClassName || "from-blue-500 to-blue-600")}></div>
      <CardContent className="flex items-center gap-4 p-6">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl",
            accentClassName,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-3xl font-semibold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const FEATURE_TONE_STYLES = {
  violet: {
    container: "from-purple-500 to-fuchsia-600",
    surface: "bg-white/12",
    button: "bg-white/20 hover:bg-white/30",
  },
  orange: {
    container: "from-orange-500 to-red-600",
    surface: "bg-white/12",
    button: "bg-white/20 hover:bg-white/30",
  },
  emerald: {
    container: "from-emerald-500 to-teal-600",
    surface: "bg-white/12",
    button: "bg-white/20 hover:bg-white/30",
  },
  blue: {
    container: "from-blue-500 to-indigo-600",
    surface: "bg-white/12",
    button: "bg-white/20 hover:bg-white/30",
  },
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
    <Card
      className={cn(
        "border-0 bg-gradient-to-br text-white shadow-lg",
        styles.container,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        {count !== undefined ? (
          <Badge className="border-white/10 bg-white/20 text-white hover:bg-white/20">
            {count}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {footer ? <div className={cn("rounded-lg", styles.button)}>{footer}</div> : null}
      </CardContent>
    </Card>
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
    <Card
      className={cn(
        "rounded-[30px] border border-slate-200/70 bg-white/95 shadow-sm",
        className,
      )}
    >
      <CardHeader className="border-b border-slate-100 pb-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              {Icon ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Icon className="h-4 w-4" />
                </span>
              ) : null}
              <span>{title}</span>
            </CardTitle>
            {description ? (
              <p className="mt-2 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

export function CompactEntityCard({
  title,
  badge,
  lines,
  footer,
  actions,
  className,
  onClick,
}: {
  title: string;
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
        "rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50",
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
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
        </div>
        {badge}
      </div>
      <div className="mt-3 space-y-1.5 text-sm text-slate-500">
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
      {footer ? <div className="mt-3 border-t border-slate-100 pt-3">{footer}</div> : null}
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
    <Card className="rounded-[30px] border-white/80 bg-white/90 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-lg font-semibold text-slate-900">
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
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
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div className="inline-flex items-center gap-2 font-medium text-slate-700">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            Data
          </div>
          <p className="mt-1">{formatDate(date)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div className="inline-flex items-center gap-2 font-medium text-slate-700">
            <Clock3 className="h-4 w-4 text-blue-600" />
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
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="inline-flex items-center gap-2 font-medium text-slate-700">
              <MapPin className="h-4 w-4 text-blue-600" />
              Luogo
            </div>
            <p className="mt-1">{location || "Campo"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="inline-flex items-center gap-2 font-medium text-slate-700">
              <FolderKanban className="h-4 w-4 text-blue-600" />
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
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div className="inline-flex items-center gap-2 font-medium text-slate-700">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
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
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div className="inline-flex items-center gap-2 font-medium text-slate-700">
            <Phone className="h-4 w-4 text-emerald-600" />
            Contatto
          </div>
          <p className="mt-1">{getAthletePhone(athlete)}</p>
        </div>
      ) : null}

      {showMedical ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:col-span-2">
          <div className="inline-flex items-center gap-2 font-medium text-slate-700">
            <FileHeart className="h-4 w-4 text-emerald-600" />
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
    <div className="space-y-3 rounded-[24px] border border-slate-200/80 bg-slate-50/70 px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ShieldCheck className="h-4 w-4 text-blue-600" />
        Visibilità attiva per questa categoria
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge className="border-slate-200 bg-white text-slate-700 hover:bg-white">
          Scheda atleta {viewAthleteDetails ? "visibile" : "limitata"}
        </Badge>
        <Badge className="border-slate-200 bg-white text-slate-700 hover:bg-white">
          Scheda tecnica {viewAthleteTechnicalSheet ? "visibile" : "nascosta"}
        </Badge>
        <Badge className="border-slate-200 bg-white text-slate-700 hover:bg-white">
          Contatti {viewAthleteContacts ? "visibili" : "nascosti"}
        </Badge>
        <Badge className="border-slate-200 bg-white text-slate-700 hover:bg-white">
          Medico {viewMedicalStatus ? "visibile" : "nascosto"}
        </Badge>
      </div>
    </div>
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
    <Button asChild variant="outline" className="rounded-2xl">
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
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <UserCircle2 className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold text-slate-900">
          {getAthleteDisplayName(athlete)}
        </p>
        <p className="truncate text-sm text-slate-500">
          {getAthleteCategoryName(athlete)}
        </p>
      </div>
    </div>
  );
}
