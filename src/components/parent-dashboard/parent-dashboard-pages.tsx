"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  Edit,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  MinusCircle,
  Phone,
  Search,
  Send,
  Trash2,
  Trophy,
  Upload,
  UserCircle,
  Users,
  XCircle,
} from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-notification";
import {
  formatOpeningHourSlots,
  isDateTimeWithinOpeningHours,
  normalizeOpeningHours,
} from "@/lib/opening-hours-utils";
import { getTrainingStableKey } from "@/lib/training-utils";
import { useParentDashboard } from "./parent-dashboard-context";

const formatDate = (value?: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTime = (value?: unknown) => String(value || "").trim() || "-";

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getStatusLabel = (status: unknown) => {
  const normalized = normalizeText(status);
  if (["completed", "concluded", "concluso", "conclusa"].includes(normalized)) {
    return "Concluso";
  }
  if (["cancelled", "annullato", "annullata"].includes(normalized)) {
    return "Annullato";
  }
  if (["paid", "pagato", "saldato"].includes(normalized)) {
    return "Saldato";
  }
  if (["requested", "richiesto"].includes(normalized)) {
    return "Richiesto";
  }
  if (["pending", "in_attesa"].includes(normalized)) {
    return "In attesa";
  }
  if (["confirmed", "confermato"].includes(normalized)) {
    return "Confermato";
  }
  if (["approved", "approvato"].includes(normalized)) {
    return "Approvato";
  }
  if (["rejected", "rifiutato"].includes(normalized)) {
    return "Rifiutato";
  }
  if (["in_verifica", "review", "pending_review"].includes(normalized)) {
    return "In verifica";
  }
  if (["valid"].includes(normalized)) {
    return "Valido";
  }
  if (["expired"].includes(normalized)) {
    return "Scaduto";
  }
  if (["missing"].includes(normalized)) {
    return "Mancante";
  }
  return "In programma";
};

const getStatusClassName = (status: unknown) => {
  const normalized = normalizeText(status);
  if (
    ["completed", "concluded", "concluso", "conclusa", "paid", "pagato", "saldato", "approved", "approvato", "valid"].includes(
      normalized,
    )
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (
    ["cancelled", "annullato", "annullata", "rejected", "rifiutato", "expired"].includes(
      normalized,
    )
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (
    [
      "requested",
      "richiesto",
      "pending",
      "in_attesa",
      "in_verifica",
      "review",
      "pending_review",
    ].includes(normalized)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (normalized === "missing") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
};

const matchesSearch = (record: Record<string, any>, query: string) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  return [
    record.title,
    record.name,
    record.category,
    record.location,
    record.opponent,
    record.status,
    record.attendanceStatus,
    record.participationStatus,
    record.date,
    record.time,
  ]
    .map(normalizeText)
    .some((value) => value.includes(normalizedQuery));
};

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
      {text}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  note,
  tone = "blue",
}: {
  icon: typeof UserCircle;
  title: string;
  value: string;
  note?: string;
  tone?: "blue" | "emerald" | "amber" | "purple";
}) {
  const toneClassName = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
        </div>
        <span
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
            toneClassName,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function EventList({
  items,
  emptyText,
  limit,
}: {
  items: Array<Record<string, any>>;
  emptyText: string;
  limit?: number;
}) {
  const visibleItems = limit ? items.slice(0, limit) : items;

  if (visibleItems.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {visibleItems.map((item) => (
        <div
          key={[
            item.id,
            item.startsAt,
            item.date,
            item.time,
            item.category,
            item.title,
          ]
            .filter(Boolean)
            .join("|")}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(item.startsAt || item.date)} · {formatTime(item.time)}
              {item.location ? ` · ${item.location}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="border-slate-200 bg-slate-50">
              {item.category || "Categoria"}
            </Badge>
            <Badge
              variant="outline"
              className={cn("border", getStatusClassName(item.status))}
            >
              {getStatusLabel(item.status)}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentList({ items }: { items: Array<Record<string, any>> }) {
  if (items.length === 0) {
    return <EmptyState text="Nessun pagamento registrato." />;
  }

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {items.map((payment) => (
        <div
          key={payment.id}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-semibold text-slate-950">
              {payment.description || "Pagamento"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Scadenza {formatDate(payment.due_date)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-950">
              {formatCurrency(payment.amount)}
            </span>
            <Badge
              variant="outline"
              className={cn("border", getStatusClassName(payment.status))}
            >
              {payment.paid_at ? "Saldato" : getStatusLabel(payment.status)}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

const getAge = (birthDate?: unknown) => {
  if (!birthDate) return "-";
  const date = new Date(String(birthDate));
  if (Number.isNaN(date.getTime())) return "-";
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age > 0 ? `${age} anni` : "-";
};

const readAthleteData = (athlete: Record<string, any>, ...keys: string[]) => {
  const data = athlete.data && typeof athlete.data === "object" ? athlete.data : {};
  for (const key of keys) {
    const value = athlete[key] ?? data[key];
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

function InfoGrid({
  items,
}: {
  items: Array<{ label: string; value?: unknown }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">{item.label}</p>
          <p className="mt-1 font-semibold text-slate-950">
            {String(item.value || "").trim() || "-"}
          </p>
        </div>
      ))}
    </div>
  );
}

function AttendanceIndicator({ status }: { status?: unknown }) {
  const normalized = normalizeText(status);
  if (["present", "presente", "late", "ritardo"].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Presente
      </span>
    );
  }
  if (["absent", "assente", "justified", "giustificato"].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        <XCircle className="h-3.5 w-3.5" />
        Assente
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
      <MinusCircle className="h-3.5 w-3.5" />
      Non registrato
    </span>
  );
}

function ParticipationIndicator({ status }: { status?: unknown }) {
  const normalized = normalizeText(status);
  if (["participated", "called", "convocato", "presente"].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {normalized === "participated" ? "Partecipato" : "Convocato"}
      </span>
    );
  }
  if (["not_called", "not_participated", "assente"].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        <XCircle className="h-3.5 w-3.5" />
        Non convocato
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
      <MinusCircle className="h-3.5 w-3.5" />
      Non registrato
    </span>
  );
}

function TrainingHistoryList({
  items,
  emptyText,
}: {
  items: Array<Record<string, any>>;
  emptyText: string;
}) {
  if (items.length === 0) return <EmptyState text={emptyText} />;

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {items.map((item) => (
        <div
          key={getTrainingStableKey(item)}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(item.startsAt || item.date)} - {formatTime(item.time)}
              {item.location ? ` - ${item.location}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-slate-200 bg-slate-50">
              {item.category || "Categoria"}
            </Badge>
            <AttendanceIndicator status={item.attendanceStatus} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchListWithParticipation({
  items,
  emptyText,
}: {
  items: Array<Record<string, any>>;
  emptyText: string;
}) {
  if (items.length === 0) return <EmptyState text={emptyText} />;

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(item.startsAt || item.date)} - {formatTime(item.time)}
              {item.location ? ` - ${item.location}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-slate-200 bg-slate-50">
              {item.category || "Categoria"}
            </Badge>
            <Badge
              variant="outline"
              className={cn("border", getStatusClassName(item.status))}
            >
              {getStatusLabel(item.status)}
            </Badge>
            <ParticipationIndicator status={item.participationStatus} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend({
  type,
}: {
  type: "attendance" | "participation";
}) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        {type === "attendance" ? "Presente" : "Convocato/partecipato"}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        {type === "attendance" ? "Assente" : "Non convocato"}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        Non registrato
      </span>
    </div>
  );
}

function renderOpeningHours(openingHours: any) {
  const days = normalizeOpeningHours(openingHours);

  if (days.length === 0) {
    return <EmptyState text="Orari non configurati" />;
  }

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <div
          key={day.key}
          className="flex flex-col gap-1 rounded-xl bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="font-medium text-slate-700">{day.label}</span>
          <span
            className={cn(
              "text-slate-600",
              day.closed && "font-medium text-slate-400",
            )}
          >
            {formatOpeningHourSlots(day)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ParentDashboardHome() {
  const router = useRouter();
  const { data } = useParentDashboard();

  if (!data) return null;

  const missingDocuments = data.documents.required.filter(
    (document) => normalizeText(document.status) === "richiesto",
  ).length;
  const certificateLabel =
    data.health.status === "valid"
      ? "Certificato valido"
      : data.health.status === "expired"
        ? "Certificato scaduto"
        : "Certificato mancante";

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Area famiglia"
        title={`Ciao, ${data.user.name.split(" ")[0] || "benvenuto"}`}
        subtitle={`Tutto quello che serve per ${data.athlete.name}.`}
      />

      {data.athlete.linkedAthletes.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {data.athlete.linkedAthletes.map((athlete) => (
            <button
              key={athlete.id}
              type="button"
              onClick={() => router.push(`/parent-view/${athlete.id}`)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                athlete.id === data.athlete.id
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {athlete.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={UserCircle}
          title="Atleta"
          value={data.athlete.name}
          note={data.athlete.category_name || "Categoria da assegnare"}
        />
        <MetricCard
          icon={HeartPulse}
          title="Certificato"
          value={certificateLabel}
          tone={data.health.status === "valid" ? "emerald" : "amber"}
        />
        <MetricCard
          icon={CreditCard}
          title="Da saldare"
          value={formatCurrency(data.payments.remaining)}
          note={`${data.payments.pending} pagamenti aperti`}
          tone="purple"
        />
        <MetricCard
          icon={FileText}
          title="Documenti"
          value={`${missingDocuments} richiesti`}
          note={`${data.documents.uploaded.length} caricati`}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5 text-blue-600" />
                Prossimi allenamenti
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EventList
                items={data.trainings.upcoming}
                emptyText="Nessun allenamento in programma."
                limit={4}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Trophy className="h-5 w-5 text-blue-600" />
                Gare e convocazioni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EventList
                items={data.matches.upcoming}
                emptyText="Nessuna gara in programma."
                limit={4}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Avvisi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">{certificateLabel}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {data.health.certificates[0]?.expiry_date
                    ? `Scadenza ${formatDate(data.health.certificates[0].expiry_date)}`
                    : "Nessuna scadenza registrata"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">Segreteria</p>
                <p className="mt-1 text-sm text-slate-500">
                  {data.appointments.items.length
                    ? `${data.appointments.items.length} appuntamenti collegati`
                    : "Puoi richiedere un appuntamento dalla sezione Segreteria"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5 text-blue-600" />
                Contatti rapidi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-600" />
                {data.club.contact_email || "Email non inserita"}
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-blue-600" />
                {data.club.contact_phone || "Telefono non inserito"}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-600" />
                {[data.club.address, data.club.city].filter(Boolean).join(", ") ||
                  "Indirizzo non inserito"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function ParentAthletePage() {
  const { data } = useParentDashboard();
  if (!data) return null;

  const athlete = data.athlete;
  const athleteData =
    athlete.data && typeof athlete.data === "object" ? athlete.data : {};
  const enrollment = data.enrollment || {};
  const paymentSummary = data.payments.summary || {};
  const enrollmentDocuments = Array.isArray(enrollment.documents)
    ? enrollment.documents
    : [];
  const medicalVisits = Array.isArray(athleteData.medicalVisits)
    ? athleteData.medicalVisits
    : [];

  return (
    <div className="space-y-6">
      <PageHeading
        title="Atleta"
        subtitle="Profilo, salute, iscrizione e pagamenti."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>{athlete.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid
              items={[
                { label: "Data di nascita", value: formatDate(athlete.birth_date) },
                { label: "Eta", value: getAge(athlete.birth_date) },
                { label: "Luogo di nascita", value: athlete.birth_place },
                { label: "Categoria", value: athlete.category_name || "Da assegnare" },
                { label: "Numero maglia", value: athlete.jersey_number },
                { label: "Codice fiscale", value: athlete.fiscal_code },
                { label: "Telefono atleta", value: athlete.phone },
                { label: "Email atleta", value: athlete.email },
                {
                  label: "Indirizzo",
                  value:
                    [
                      athlete.address,
                      athlete.city,
                      athlete.province,
                      athlete.postal_code,
                    ]
                      .filter(Boolean)
                      .join(", ") || readAthleteData(athlete, "address"),
                },
                { label: "Nazionalita", value: athlete.nationality },
                { label: "Genere", value: athlete.gender },
                { label: "Stato", value: getStatusLabel(athlete.status) },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Contatti familiari</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {athlete.guardians.length === 0 ? (
              <EmptyState text="Nessun contatto registrato." />
            ) : (
              athlete.guardians.map((guardian) => (
                <div
                  key={guardian.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <p className="font-semibold text-slate-950">
                    {[guardian.name, guardian.surname].filter(Boolean).join(" ") ||
                      "Genitore"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {guardian.relationship || "Contatto familiare"}
                  </p>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>{guardian.email || "Email non inserita"}</p>
                    <p>{guardian.phone || "Telefono non inserito"}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Dati sanitari</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Certificati</p>
              <div className="mt-3 space-y-2">
                {data.health.certificates.length === 0 ? (
                  <EmptyState text="Nessun certificato registrato." />
                ) : (
                  data.health.certificates.map((certificate) => (
                    <div
                      key={certificate.id}
                      className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                    >
                      <span className="font-medium text-slate-800">
                        {certificate.type || "Certificato medico"}
                      </span>
                      <span className="text-sm text-slate-500">
                        {formatDate(certificate.expiry_date)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Visite mediche</p>
              <div className="mt-3 space-y-2">
                {medicalVisits.length === 0 ? (
                  <EmptyState text="Nessuna visita registrata." />
                ) : (
                  medicalVisits.map((visit: any, index: number) => (
                    <div
                      key={visit.id || `medical-visit-${index}`}
                      className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                    >
                      <span className="font-medium text-slate-800">
                        {visit.type || visit.title || "Visita medica"}
                      </span>
                      <span className="text-sm text-slate-500">
                        {formatDate(visit.date || visit.visitDate)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Allergie</p>
              <p className="mt-2 text-sm text-slate-700">
                {data.health.allergies.length
                  ? data.health.allergies.join(", ")
                  : "Nessuna allergia registrata"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Note sanitarie</p>
              <p className="mt-2 text-sm text-slate-700">
                {data.health.notes || "Nessuna nota registrata"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Analitiche</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={CheckCircle2}
                title="Presenze"
                value={String(data.attendance.present)}
                tone="emerald"
              />
              <MetricCard
                icon={AlertCircle}
                title="Assenze"
                value={String(data.attendance.absent)}
                tone="amber"
              />
              <MetricCard
                icon={HeartPulse}
                title="Percentuale"
                value={`${data.attendance.rate}%`}
                tone="blue"
              />
            </div>
            <EventList
              items={[...data.trainings.history].slice(0, 4)}
              emptyText="Nessuno storico allenamenti."
            />
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Iscrizione e pagamenti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard
              icon={FileText}
              title="Iscrizione"
              value={enrollment.status === "enrolled" ? "Iscritto" : "Non iscritto"}
              tone={enrollment.status === "enrolled" ? "emerald" : "amber"}
            />
            <MetricCard
              icon={CreditCard}
              title="Dovuto"
              value={formatCurrency(data.payments.totalDue)}
            />
            <MetricCard
              icon={CheckCircle2}
              title="Incassato"
              value={formatCurrency(data.payments.totalPaid)}
              tone="emerald"
            />
            <MetricCard
              icon={AlertCircle}
              title="Residuo"
              value={formatCurrency(data.payments.remaining)}
              tone="amber"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Piano pagamento</p>
              <p className="mt-1 font-semibold text-slate-950">
                {paymentSummary.planName || enrollment.selectedPlan || "-"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Sconti</p>
              <p className="mt-1 font-semibold text-slate-950">
                {formatCurrency(paymentSummary.totalDiscounts || 0)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Totale registrato</p>
              <p className="mt-1 font-semibold text-slate-950">
                {formatCurrency(paymentSummary.recordedTotal || 0)}
              </p>
            </div>
          </div>

          {Array.isArray(paymentSummary.appliedDiscounts) &&
          paymentSummary.appliedDiscounts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {paymentSummary.appliedDiscounts.map((discount: any) => (
                <Badge
                  key={discount.id}
                  variant="secondary"
                  className="bg-amber-100 text-amber-900"
                >
                  {discount.label}: -{formatCurrency(discount.amount)}
                </Badge>
              ))}
            </div>
          ) : null}

          {enrollment.notes ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              {enrollment.notes}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">
                Storico pagamenti
              </p>
              <PaymentList items={data.payments.items} />
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">
                Documenti iscrizione
              </p>
              {enrollmentDocuments.length === 0 ? (
                <EmptyState text="Nessun documento iscrizione registrato." />
              ) : (
                <div className="space-y-2">
                  {enrollmentDocuments.map((document: any, index: number) => (
                    <div
                      key={document.id || `enrollment-document-${index}`}
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <p className="font-semibold text-slate-950">
                        {document.name || document.title || "Documento"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {document.type || "Documento iscrizione"} -{" "}
                        {formatDate(document.uploadDate || document.date)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ParentTrainingsPage() {
  const { data } = useParentDashboard();
  const [query, setQuery] = useState("");
  if (!data) return null;

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  const weeklyTrainings = data.trainings.all.filter((training) => {
    const date = new Date(String(training.startsAt || training.date || ""));
    return (
      !Number.isNaN(date.getTime()) &&
      date >= startOfWeek &&
      date < endOfWeek &&
      normalizeText(training.status) !== "cancelled"
    );
  });
  const history = data.trainings.history.filter((item) => matchesSearch(item, query));

  return (
    <div className="space-y-6">
      <PageHeading title="Allenamenti" subtitle="Calendario e presenze." />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Allenamenti della settimana</CardTitle>
        </CardHeader>
        <CardContent>
          <EventList
            items={weeklyTrainings}
            emptyText="Nessun allenamento questa settimana."
          />
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <CardTitle>Storico allenamenti</CardTitle>
            <Legend type="attendance" />
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca nello storico"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <TrainingHistoryList items={history} emptyText="Nessun risultato." />
        </CardContent>
      </Card>
    </div>
  );
}

export function ParentMatchesPage() {
  const { data } = useParentDashboard();
  const [query, setQuery] = useState("");
  if (!data) return null;

  const upcomingMatches = data.matches.upcoming.filter((item) =>
    matchesSearch(item, query),
  );
  const historyMatches = data.matches.history.filter((item) =>
    matchesSearch(item, query),
  );

  return (
    <div className="space-y-6">
      <PageHeading title="Gare" subtitle="Programma, storico e convocazioni." />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <CardTitle>Gare</CardTitle>
            <Legend type="participation" />
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca gara"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">
              Gare programmate
            </h3>
            <MatchListWithParticipation
              items={upcomingMatches}
              emptyText="Nessuna gara programmata."
            />
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Storico gare</h3>
            <MatchListWithParticipation
              items={historyMatches}
              emptyText="Nessuna gara nello storico."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ParentPaymentsPage() {
  const { data } = useParentDashboard();
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeading
        title="Pagamenti"
        subtitle="Iscrizione, scadenze e ricevute."
        actions={
          <Button disabled title="Disponibile prossimamente">
            Paga ora
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={CreditCard}
          title="Totale dovuto"
          value={formatCurrency(data.payments.totalDue)}
        />
        <MetricCard
          icon={CheckCircle2}
          title="Totale pagato"
          value={formatCurrency(data.payments.totalPaid)}
          tone="emerald"
        />
        <MetricCard
          icon={AlertCircle}
          title="Rimanente"
          value={formatCurrency(data.payments.remaining)}
          tone="amber"
        />
      </div>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Pagamenti</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentList items={data.payments.items} />
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Ricevute</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payments.receipts.length === 0 ? (
            <EmptyState text="Nessuna ricevuta disponibile." />
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {data.payments.receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-slate-950">
                      {receipt.description || receipt.receipt_number || "Ricevuta"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDate(receipt.issue_date)}
                    </p>
                  </div>
                  <span className="font-semibold">
                    {formatCurrency(receipt.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ParentDocumentsPage() {
  const { data, uploadDocument } = useParentDashboard();
  const { showToast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  if (!data) return null;

  const selectedTemplate = data.documents.required.find(
    (document) => document.id === selectedTemplateId,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      showToast("error", "Seleziona un file");
      return;
    }

    try {
      setUploading(true);
      await uploadDocument({
        templateId: selectedTemplateId,
        title: selectedTemplate?.title || selectedFile.name,
        file: selectedFile,
      });
      setSelectedFile(null);
      setSelectedTemplateId("");
    } catch (error: any) {
      showToast("error", error?.message || "Errore caricamento documento");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading title="Documenti" subtitle="Moduli richiesti e caricamenti." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Documenti richiesti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.documents.required.length === 0 ? (
              <EmptyState text="Nessun documento richiesto dal club." />
            ) : (
              data.documents.required.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-950">
                      {document.title}
                    </p>
                    {document.description ? (
                      <p className="mt-1 text-sm text-slate-500">
                        {document.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("border", getStatusClassName(document.status))}
                    >
                      {getStatusLabel(document.status)}
                    </Badge>
                    {document.fileUrl ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={document.fileUrl} target="_blank" rel="noreferrer">
                          <Download className="mr-2 h-4 w-4" />
                          Scarica
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Carica documento</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Documento
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Documento generico</option>
                  {data.documents.required.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                File
                <Input
                  type="file"
                  accept=".pdf,image/*,.doc,.docx"
                  className="mt-2"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setSelectedFile(event.target.files?.[0] || null)
                  }
                />
              </label>
              <Button type="submit" disabled={uploading} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Caricamento..." : "Carica documento"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Documenti caricati</CardTitle>
        </CardHeader>
        <CardContent>
          {data.documents.uploaded.length === 0 ? (
            <EmptyState text="Nessun documento caricato." />
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {data.documents.uploaded.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-950">
                      {document.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {document.fileName || "File"} · {formatDate(document.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("border", getStatusClassName(document.status))}
                    >
                      {getStatusLabel(document.status)}
                    </Badge>
                    {document.assetId ? (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/parent-dashboard/${data.athlete.id}/documents/${document.assetId}`}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Scarica
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ParentSecretariatPage() {
  const {
    data,
    bookAppointment,
    updateAppointment,
    cancelAppointment,
  } = useParentDashboard();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    reason: "",
    date: "",
    time: "",
    notes: "",
  });
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  if (!data) return null;

  const resetForm = () => {
    setForm({ reason: "", date: "", time: "", notes: "" });
    setEditingAppointmentId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = isDateTimeWithinOpeningHours(
      data.appointments.openingHours,
      form.date,
      form.time,
    );
    if (!validation.valid) {
      showToast(
        "error",
        validation.reason ||
          "L'orario selezionato e fuori dagli orari di apertura della segreteria.",
      );
      return;
    }

    try {
      setSaving(true);
      if (editingAppointmentId) {
        await updateAppointment(editingAppointmentId, form);
      } else {
        await bookAppointment(form);
      }
      resetForm();
    } catch (error: any) {
      showToast("error", error?.message || "Errore prenotazione");
    } finally {
      setSaving(false);
    }
  };

  const startEditAppointment = (appointment: Record<string, any>) => {
    setEditingAppointmentId(String(appointment.id));
    setForm({
      reason: appointment.reason || appointment.title || "",
      date: appointment.date ? String(appointment.date).slice(0, 10) : "",
      time: appointment.time || "",
      notes: appointment.notes || "",
    });
  };

  const handleCancelAppointment = async (appointment: Record<string, any>) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Vuoi cancellare questa richiesta appuntamento?")
    ) {
      return;
    }

    try {
      await cancelAppointment(String(appointment.id));
      if (editingAppointmentId === appointment.id) {
        resetForm();
      }
    } catch (error: any) {
      showToast("error", error?.message || "Errore cancellazione appuntamento");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading title="Segreteria" subtitle="Orari e appuntamenti." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Orari</CardTitle>
          </CardHeader>
          <CardContent>{renderOpeningHours(data.appointments.openingHours)}</CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>
              {editingAppointmentId ? "Modifica appuntamento" : "Prenota appuntamento"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Motivo"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
                <Input
                  type="time"
                  value={form.time}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      time: event.target.value,
                    }))
                  }
                />
              </div>
              <Textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Note"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={saving} className="flex-1">
                  <Send className="mr-2 h-4 w-4" />
                  {saving
                    ? "Salvataggio..."
                    : editingAppointmentId
                      ? "Salva modifica"
                      : "Invia richiesta"}
                </Button>
                {editingAppointmentId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={resetForm}
                  >
                    Annulla
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Appuntamenti</CardTitle>
        </CardHeader>
        <CardContent>
          {data.appointments.items.length === 0 ? (
            <EmptyState text="Nessun appuntamento prenotato." />
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {data.appointments.items.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-950">
                      {appointment.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDate(appointment.date)} · {formatTime(appointment.time)}
                    </p>
                    {appointment.notes ? (
                      <span className="mt-1 block text-sm text-slate-500">
                        {appointment.notes}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("border", getStatusClassName(appointment.status))}
                    >
                      {getStatusLabel(appointment.status)}
                    </Badge>
                    {["pending", "requested", "richiesto"].includes(
                      normalizeText(appointment.status),
                    ) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEditAppointment(appointment)}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Modifica
                      </Button>
                    ) : null}
                    {normalizeText(appointment.status) !== "cancelled" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCancelAppointment(appointment)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Elimina
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ParentContactsPage() {
  const { data } = useParentDashboard();
  if (!data) return null;

  const settings = data.club.settings || {};

  return (
    <div className="space-y-6">
      <PageHeading title="Contatti Club" subtitle={data.club.name} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Recapiti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-slate-700">
            <p className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-blue-600" />
              {data.club.contact_email || "Email non inserita"}
            </p>
            <p className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-blue-600" />
              {data.club.contact_phone || "Telefono non inserito"}
            </p>
            <p className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-blue-600" />
              {[data.club.address, data.club.city, data.club.province]
                .filter(Boolean)
                .join(", ") || "Indirizzo non inserito"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Segreteria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderOpeningHours(data.club.opening_hours)}
            {settings.website || settings.site ? (
              <Button variant="outline" asChild>
                <a
                  href={settings.website || settings.site}
                  target="_blank"
                  rel="noreferrer"
                >
                  Sito web
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
