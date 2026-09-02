"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Building2,
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
import { ParentRsvpSection } from "@/components/parent/ParentRsvpSection";
import { EnrollmentPaymentBreakdown } from "@/components/payments/EnrollmentPaymentBreakdown";
import { findFirstPayableAthletePayment } from "@/lib/athlete-payment-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { downloadAttachment } from "@/lib/client-files";
import { useToast } from "@/components/ui/toast-notification";
/*
  `isDateTimeWithinOpeningHours` non si importa piu: gli orari di apertura sono
  il **ripiego** con cui il server calcola gli slot quando il club non ha
  dichiarato regole di disponibilita, non una seconda regola da applicare qui.
  Ricontrollarli sul client rifiutava slot che il server offriva, e comunque
  non diceva niente sull'unica cosa che conta — se quell'istante e libero.
*/
import {
  formatOpeningHourSlots,
  normalizeOpeningHours,
} from "@/lib/opening-hours-utils";
import { getTrainingStableKey } from "@/lib/training-utils";
/*
  Le classi dello stato documentale arrivano dal dominio e non da una seconda
  tabella scritta qui: e la stessa che il server usa per costruire l'etichetta,
  e due copie sarebbero due badge diversi sullo stesso documento.
*/
import { getFamilyDocumentStateClassName } from "@/lib/documents/family-dossier";
import {
  useParentDashboard,
  type AppointmentSlot,
} from "./parent-dashboard-context";

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
  if (["requested", "required", "richiesto"].includes(normalized)) {
    return "Richiesto";
  }
  if (["uploaded", "caricato"].includes(normalized)) {
    return "Caricato";
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
  if (["under_review", "in_verifica", "review", "pending_review"].includes(normalized)) {
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
      "required",
      "richiesto",
      "pending",
      "in_attesa",
      "under_review",
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

  /*
    W6-40. Il conteggio filtrava `document.status === "richiesto"`, e quel
    confronto era **gia sempre falso**: gli stati erano token inglesi. Adesso
    il campo non esiste nemmeno piu — l area DA FARE e gia, per costruzione,
    l elenco di cio che la famiglia deve ancora fare.
  */
  const missingDocuments = data.documents.required.length;
  /*
    W6-16, W6-17, W6-18. L'etichetta la dice il server, che la ricava dal
    dominio: qui c'era una terza scrittura degli stessi tre nomi, e non
    conosceva «in scadenza».
  */
  const certificateLabel = data.health.statusLabel;
  const certificatoDaRifare =
    data.health.status === "expiring" ||
    data.health.status === "expired" ||
    data.health.status === "missing";

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Area famiglia"
        title={`Ciao, ${data.user.name.split(" ")[0] || "benvenuto"}`}
        subtitle={`Tutto quello che serve per ${data.athlete.name}.`}
      />

      {/*
        W6-12. Le pastiglie di scelta figlio stavano qui, e su una pagina
        sola: le altre dodici non avevano nessun selettore. Adesso la scelta si
        fa in una schermata sua e il guscio dice sempre di chi si sta
        parlando — cioe su tutte e tredici, non su una.
      */}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={UserCircle}
          title="Atleta"
          value={data.athlete.name}
          /*
            W6-14. Un atleta puo stare in piu categorie, e la famiglia ne
            vedeva una: la primaria. Un ragazzo che si allena con l Under 15
            e gioca con la prima squadra leggeva meta della propria vita
            sportiva — e il calendario, che dalle stesse appartenenze
            dipende, gli mostrava meta degli impegni.
          */
          note={
            data.athlete.categories?.length
              ? data.athlete.categories
                  .map((categoria: any) =>
                    categoria.isPrimary
                      ? `${categoria.name} (principale)`
                      : categoria.name,
                  )
                  .join(" · ")
              : data.athlete.category_name || "Categoria da assegnare"
          }
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
                {/*
                  W6-17. La data e quella del certificato che **governa**, e
                  arriva dal server: qui si leggeva `certificates[0]`, cioe la
                  prima riga di un elenco ordinato per scadenza crescente —
                  tipicamente il certificato piu vecchio. La Home accostava
                  «Certificato valido» alla data di uno gia scaduto.

                  W6-16. La data si mostra **sempre**, in tutti e quattro gli
                  stati: e la cosa che una famiglia deve poter leggere per
                  sapere se ha tempo.
                */}
                <p className="mt-1 text-sm text-slate-500">
                  {data.health.expiryDate
                    ? data.health.status === "expired"
                      ? `Scaduto il ${formatDate(data.health.expiryDate)}`
                      : `Scade il ${formatDate(data.health.expiryDate)}`
                    : "Data di scadenza non disponibile"}
                </p>
                {/*
                  W6-18. Sapere che il certificato scade fra dieci giorni e
                  non avere un posto dove portarlo e meta informazione. Il
                  caricamento esiste gia: mancava la strada che ci arriva
                  **da dove il problema si vede**.
                */}
                {certificatoDaRifare ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() =>
                      router.push(
                        `/parent-view/${data.athlete.id}/documents?tipo=medical_certificate`,
                      )
                    }
                  >
                    Aggiorna il certificato
                  </Button>
                ) : null}
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

          <EnrollmentPaymentBreakdown
            summary={paymentSummary}
            payments={data.payments.items}
            mode="parent"
            showPayNow
          />

          {enrollment.notes ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              {enrollment.notes}
            </div>
          ) : null}

          <div className="grid gap-6">
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

/**
 * Le gare della famiglia, e — da qui — anche le conferme che chiedono.
 *
 * Questa pagina era in **sola lettura**: il servizio RSVP rispondeva gia a una
 * gara, ma l'unico controllo di risposta stava sulla pagina degli allenamenti
 * e la famiglia non aveva nessun modo di confermare una convocazione. Gli
 * inviti stanno **sopra** l'elenco per la stessa ragione per cui ci stanno
 * negli allenamenti: sono l'unica cosa della pagina su cui c'e da fare
 * qualcosa, il resto e consultazione.
 */
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
      <ParentRsvpSection kind="match" />
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

/**
 * La rata che si sta per aprire al pagamento.
 *
 * **E un tipo debole di proposito.** TypeScript rifiuta di assegnare a un
 * parametro fatto di sole proprieta opzionali un oggetto che non ne ha
 * **nessuna** in comune — e un SyntheticEvent non ha `id`. E la regola che
 * impedisce di ricollegare `apriPagamento` direttamente a un `onClick`: il
 * difetto §4.4, dove il pulsante appariva abilitato e non faceva niente
 * perche riceveva l'evento al posto della rata.
 */
type RataDaPagare = { id?: unknown };

export function ParentPaymentsPage() {
  const { data } = useParentDashboard();
  const { showToast } = useToast();
  const [pagamentoInCorso, setPagamentoInCorso] = useState(false);

  /*
    **«Paga ora» era disabilitato, e le ricevute non si scaricavano.**

    Il checkout esisteva per intero e la famiglia non aveva una porta con la
    propria identita; la ricevuta era elencata e il documento stampabile
    chiedeva un permesso di **ruolo** che un genitore non ha. Due difetti
    diversi con la stessa forma: una funzione completa a cui manca l'ultimo
    metro (§13).

    Si paga la **prima rata non saldata**: e cio che una famiglia intende
    premendo il pulsante, e chiederle quale sarebbe una domanda a cui non ha
    modo di rispondere meglio del prodotto.
  */
  /*
    W6-08. Qui c'era un elenco di token inglesi confrontato con `rata.status`,
    che e l'**etichetta italiana** («Da incassare», «Scaduto», «Parzialmente
    pagato»). Non corrispondeva mai: `rataDaPagare` era sempre `null`, il
    pulsante sempre disabilitato, e il messaggio d'aiuto diceva «Nessuna rata
    da saldare» a chi ne aveva tre aperte.

    Adesso la domanda la fa il dominio, che possiede entrambe le forme.
  */
  const rataDaPagare = useMemo(
    () => findFirstPayableAthletePayment(data?.payments.items),
    [data?.payments.items],
  );

  /*
    Una rata per volta, scelta da chi paga. Il pulsante in cima resta e apre
    la **prima** aperta — e cio che una famiglia intende premendolo — ma con un
    piano a piu rate «la prima» non e sempre quella che si vuole saldare, e
    chiederlo con un elenco a tendina sarebbe una domanda a cui il prodotto
    sa gia rispondere riga per riga.
  */
  /*
    Il parametro e tipizzato `RataDaPagare` e non `any` **di proposito**: con
    `any` questa funzione si poteva collegare dritta a un `onClick`, React le
    consegnava il SyntheticEvent, `rataScelta` risultava truthy, `rata?.id` era
    `undefined` e la funzione usciva in silenzio — pulsante abilitato e morto.
    Adesso quel collegamento non compila.
  */
  const apriPagamento = useCallback(async (rataScelta?: RataDaPagare) => {
    const rata = rataScelta || rataDaPagare;
    if (!data?.athlete.id || !rata?.id) return;
    setPagamentoInCorso(true);
    try {
      const risposta = await fetch(
        `/api/parent-dashboard/${data.athlete.id}/checkout`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ payment_id: rata.id }),
        },
      );
      const payload = await risposta.json().catch(() => ({}));
      if (!risposta.ok || payload?.error) {
        throw new Error(
          payload?.error?.message || "Pagamento online non disponibile",
        );
      }
      if (payload?.data?.url) {
        window.location.href = payload.data.url;
        return;
      }
      throw new Error("Pagamento online non disponibile");
    } catch (errore: any) {
      showToast("error", errore?.message || "Pagamento online non disponibile");
    } finally {
      setPagamentoInCorso(false);
    }
  }, [data?.athlete.id, rataDaPagare, showToast]);

  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeading
        title="Pagamenti"
        subtitle="Iscrizione, scadenze e ricevute."
        actions={
          <Button
            disabled={!rataDaPagare || pagamentoInCorso}
            /*
              **Mai `onClick={apriPagamento}`.** `Button` spande le props su un
              `<button>` nativo, quindi il primo argomento sarebbe l'evento:
              verrebbe scambiato per la rata scelta e il pulsante uscirebbe
              senza aprire niente. La rata la sceglie la funzione.
            */
            onClick={() => void apriPagamento()}
            title={
              rataDaPagare
                ? "Apre il pagamento sicuro del club"
                : "Nessuna rata da saldare"
            }
          >
            {pagamentoInCorso ? "Apertura…" : "Paga ora"}
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
          <CardTitle>Dettaglio piano e pagamenti</CardTitle>
        </CardHeader>
        <CardContent>
          <EnrollmentPaymentBreakdown
            summary={data.payments.summary}
            payments={data.payments.items}
            mode="parent"
            showPayNow
            onPayNow={rataDaPagare ? () => void apriPagamento() : undefined}
            onPayInstalment={(rata) => void apriPagamento(rata)}
            payNowPending={pagamentoInCorso}
          />
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
              {/*
                La riga e passata da due blocchi a tre quando «Scarica» si e
                affiancato all'importo. A 375 px una descrizione con una parola
                lunga la porta oltre il bordo, e il contenitore ha
                `overflow-hidden`: il pulsante non sporge, viene **tagliato**.
                Cioe la ricevuta torna a non essere scaricabile, che e
                esattamente il difetto appena chiuso.
              */}
              {data.payments.receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">
                      {receipt.description || receipt.receipt_number || "Ricevuta"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDate(receipt.issue_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">
                      {formatCurrency(receipt.amount)}
                    </span>
                    {/*
                      La ricevuta si stampa dalla rotta che la ristampa dallo
                      snapshot: il gate e adesso il **legame**, non il ruolo.
                    */}
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/v1/documents/receipt/${receipt.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Scarica
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/*
        W6-19. **Le fatture erano nel payload e non le disegnava nessuno.**

        Il server le calcola, il tipo le dichiara, e il controllo di accesso
        sul documento le prevede gia — `kind === "invoice"` passa dallo stesso
        gate del legame delle ricevute. Mancava la card: una famiglia che
        riceve fattura invece di ricevuta vedeva un elenco vuoto e nessuna
        spiegazione.
      */}
      {data.payments.invoices.length > 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Fatture</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {data.payments.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">
                      {invoice.description ||
                        invoice.invoice_number ||
                        "Fattura"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDate(invoice.issue_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">
                      {formatCurrency(invoice.amount)}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/v1/documents/invoice/${invoice.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Scarica
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * **Le tre aree documentali del genitore** (Wave 6, lane 6E, §5.1).
 *
 * ---
 *
 * ## Cosa c'era prima, e perche non funzionava (W6-40)
 *
 * Due card, «Documenti richiesti» e «Documenti caricati», che erano **la stessa
 * lista frullata due volte**: il server costruiva la prima come «i modelli di
 * stampa del club **piu** i caricamenti gia fatti che risultano obbligatori».
 * Un certificato consegnato a settembre compariva in tutte e due, con due stati
 * che sembravano diversi, e il genitore lo ricaricava. Accanto, una terza card
 * «Carica documento» con una tendina che ripeteva la prima lista una terza
 * volta.
 *
 * ## Le tre aree, e cosa le distingue
 *
 * 1. **DA FARE** — cio che il club sta aspettando: cosa serve, entro quando,
 *    perche e stato rifiutato se lo e stato, e **una** CTA. Non c'e piu una
 *    tendina da cui scegliere il documento: la riga sa gia di cosa parla, e il
 *    file si allega li.
 * 2. **DOCUMENTI** — l'archivio di cio che e stato consegnato e non chiede
 *    niente: in verifica, approvato. Con data, tipo e download.
 * 3. **MODULI ONLINE** — non sono file. Sono compilazioni che il club pubblica
 *    e il genitore riempie, e vivono nella pagina Iscrizione, che e la loro. Qui
 *    c'e il rimando: fingere di ospitarli sarebbe la seconda implementazione di
 *    un dominio che ne ha gia una.
 *
 * Una voce sta in **una** area sola. La regola — «la famiglia deve ancora fare
 * qualcosa?» — vive in `src/lib/documents/family-dossier.ts`, dove un test la
 * interroga, e non e riscritta qui.
 *
 * ## E soprattutto: la sorgente e il fascicolo vero
 *
 * `data.documents` non arriva piu da `athletes.data.sharedDocuments` ma da
 * `document_requests` / `document_submissions` (W6-37). Una richiesta creata
 * dalla segreteria adesso arriva.
 */
export function ParentDocumentsPage() {
  const { data, uploadDocument } = useParentDashboard();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  /*
    W6-18. Il tipo puo arrivare dall indirizzo: e cosi che «Aggiorna il
    certificato», premuto dalla Home, dice a questa schermata di cosa si sta
    parlando invece di lasciare il genitore davanti a una tendina.
  */
  const tipoRichiesto = String(searchParams?.get("tipo") || "").trim();
  /* La riga su cui si sta caricando. Vuoto = il caricamento spontaneo. */
  const [voceAperta, setVoceAperta] = useState("");
  /*
    **Due moduli, due stati.**

    Prima ce n'era uno solo, condiviso fra il modulo della riga aperta e il
    modulo libero in fondo. Chi sceglieva il file per «Certificato medico» e
    poi apriva il riquadro «Devi consegnare qualcosa che non e in elenco?»
    trovava un campo **vuoto** e un pulsante **gia abilitato**, perche leggeva
    lo stesso stato: un clic mandava quel certificato come deposito
    **spontaneo**, la richiesta restava scoperta e il club riceveva un file
    non classificato.
  */
  const [fileRichiesta, setFileRichiesta] = useState<File | null>(null);
  const [fileSpontaneo, setFileSpontaneo] = useState<File | null>(null);
  /*
    Un `<input type="file">` non si controlla con `value`: azzerare lo stato
    non svuota il campo, e resterebbe un nome di file a schermo che non
    corrisponde a cio che si invierebbe. Il contatore rimonta l'input, cosi
    campo e stato dicono la stessa cosa.
  */
  const [azzeraRichiesta, setAzzeraRichiesta] = useState(0);
  const [azzeraSpontaneo, setAzzeraSpontaneo] = useState(0);
  const [inCaricamento, setInCaricamento] = useState(false);
  if (!data) return null;

  const daFare = data.documents.required;
  const archivio = data.documents.uploaded;
  const voceScelta = daFare.find((document) => document.id === voceAperta);

  const carica = async (
    voce: Record<string, any> | null,
    file: File | null,
  ) => {
    if (!file) {
      showToast("error", "Seleziona un file");
      return;
    }

    try {
      setInCaricamento(true);
      await uploadDocument({
        /*
          La richiesta a cui il file risponde. Vuota per un deposito
          **spontaneo**, che il dominio accetta e mette nella stessa coda: non e
          un caso degradato, e meta del traffico vero.
        */
        templateId: voce?.requestId || voce?.id || "",
        title: voce?.title || file.name,
        /*
          W6-18. Senza il tipo il documento entra come «altro», e un
          certificato medico caricato dalla famiglia non muove lo stato
          sanitario: il genitore continuava a leggere «scaduto» il giorno
          dopo averlo caricato, e aveva ragione lui.
        */
        documentType: voce?.documentKind || tipoRichiesto || undefined,
        file,
      });
      /*
        Si azzera **il modulo che ha inviato**, non entrambi: `voce` vuota vuol
        dire deposito spontaneo, e un file scelto nell'altro modulo non deve
        sparire per un invio che non lo riguardava.
      */
      if (voce) {
        setFileRichiesta(null);
        setAzzeraRichiesta((numero) => numero + 1);
        setVoceAperta("");
      } else {
        setFileSpontaneo(null);
        setAzzeraSpontaneo((numero) => numero + 1);
      }
    } catch (error: any) {
      showToast("error", error?.message || "Errore caricamento documento");
    } finally {
      setInCaricamento(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Documenti"
        subtitle="Cosa serve al club, cosa hai gia consegnato, e i moduli da compilare online."
      />

      {/* ------------------------------------------------------- DA FARE --- */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Da fare</CardTitle>
          <p className="text-sm text-slate-500">
            {daFare.length === 0
              ? "Il club non sta aspettando niente da te."
              : `Il club sta aspettando ${daFare.length} document${daFare.length === 1 ? "o" : "i"}.`}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {daFare.length === 0 ? (
            <EmptyState text="Nessun documento da consegnare." />
          ) : (
            daFare.map((document) => (
              <div
                key={document.id}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">
                        {document.title}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border",
                          getFamilyDocumentStateClassName(document.state),
                        )}
                      >
                        {document.stateLabel}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                      {document.documentKindLabel}
                    </p>
                    {document.description ? (
                      <p className="mt-2 text-sm text-slate-600">
                        {document.description}
                      </p>
                    ) : null}
                    {document.dueDate ? (
                      <p
                        className={cn(
                          "mt-2 text-xs",
                          Number(document.daysLeft) < 0
                            ? "font-semibold text-red-600"
                            : "text-slate-500",
                        )}
                      >
                        {Number(document.daysLeft) < 0
                          ? `Scaduto il ${formatDate(document.dueDate)}`
                          : `Da consegnare entro il ${formatDate(document.dueDate)}`}
                      </p>
                    ) : null}
                    {document.rejectionReason ? (
                      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                        Il club chiede di rifarlo: {document.rejectionReason}
                      </p>
                    ) : null}
                    {document.fileUrl ? (
                      // Un <a href="data:…"> non scarica niente su nessun
                      // browser recente: va convertito in object URL.
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center text-xs font-medium text-slate-600 underline"
                        onClick={() =>
                          downloadAttachment(document.fileUrl, {
                            documentType: document.title || "Documento",
                            fullName: data.athlete?.name,
                            date: document.submittedAt,
                            fileName: document.fileName,
                            mimeType: document.mimeType,
                          })
                        }
                      >
                        <Download className="mr-1 h-3 w-3" />
                        {document.submittedAt
                          ? "Vedi il file che hai inviato"
                          : "Scarica il modulo da compilare"}
                      </button>
                    ) : null}
                  </div>

                  {/*
                    **Una CTA sola.** Prima ce n'erano fino a tre sulla stessa
                    riga — «Scarica», «Carica», «Sostituisci» — e il genitore
                    doveva dedurre quale fosse la sua. Il download resta, ma
                    come collegamento dentro il testo: non e l'azione.
                  */}
                  <Button
                    variant={voceAperta === document.id ? "secondary" : "default"}
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      /*
                        Cambiando riga il file scelto per la precedente non
                        vale piu: si azzera lo stato **e** il campo.
                      */
                      setFileRichiesta(null);
                      setAzzeraRichiesta((numero) => numero + 1);
                      setVoceAperta(
                        voceAperta === document.id ? "" : String(document.id),
                      );
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {document.actionLabel || "Carica"}
                  </Button>
                </div>

                {voceAperta === document.id ? (
                  <form
                    className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center"
                    onSubmit={(event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      void carica(voceScelta || document, fileRichiesta);
                    }}
                  >
                    <Input
                      key={`richiesta-${azzeraRichiesta}`}
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/heic,image/heif"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setFileRichiesta(event.target.files?.[0] || null)
                      }
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={inCaricamento || !fileRichiesta}
                    >
                      {inCaricamento ? "Invio..." : "Invia al club"}
                    </Button>
                  </form>
                ) : null}
              </div>
            ))
          )}

          {/*
            Il caricamento **spontaneo**: la famiglia consegna qualcosa che
            nessuno ha chiesto. Il dominio lo accetta da sempre e nessuna
            schermata lo offriva senza costringere a scegliere una riga
            dall'elenco delle richieste.
          */}
          <details className="rounded-2xl border border-dashed border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Devi consegnare qualcosa che non e in elenco?
            </summary>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void carica(null, fileSpontaneo);
              }}
            >
              <Input
                key={`spontaneo-${azzeraSpontaneo}`}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/heic,image/heif"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setFileSpontaneo(event.target.files?.[0] || null)
                }
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={inCaricamento || !fileSpontaneo}
              >
                {inCaricamento ? "Invio..." : "Invia al club"}
              </Button>
            </form>
          </details>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- DOCUMENTI --- */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Documenti</CardTitle>
          <p className="text-sm text-slate-500">
            Cio che hai gia consegnato. Non serve fare altro.
          </p>
        </CardHeader>
        <CardContent>
          {archivio.length === 0 ? (
            <EmptyState text="Nessun documento consegnato." />
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {archivio.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">
                      {document.title}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {document.documentKindLabel}
                      {document.fileName ? ` · ${document.fileName}` : ""}
                      {document.submittedAt
                        ? ` · ${formatDate(document.submittedAt)}`
                        : ""}
                    </p>
                    {document.validUntil ? (
                      <p className="text-xs text-slate-500">
                        Valido fino al {formatDate(document.validUntil)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "border",
                        getFamilyDocumentStateClassName(document.state),
                      )}
                    >
                      {document.stateLabel}
                    </Badge>
                    {document.fileUrl ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadAttachment(document.fileUrl, {
                            documentType: document.title || "Documento",
                            fullName: data.athlete?.name,
                            date: document.submittedAt,
                            fileName: document.fileName,
                            mimeType: document.mimeType,
                          })
                        }
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Scarica
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------- MODULI ONLINE --- */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Moduli online</CardTitle>
          <p className="text-sm text-slate-500">
            Non sono file da caricare: si compilano qui dentro, e il club li
            riceve firmati.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            I moduli che il club ha pubblicato — iscrizione, rinnovo,
            questionari — stanno nella pagina Iscrizione, insieme allo stato
            della pratica. Un modulo gia compilato non si ricompila.
          </p>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() =>
              router.push(`/parent-view/${data.athlete.id}/enrollment`)
            }
          >
            <FileText className="mr-2 h-4 w-4" />
            Vai ai moduli
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Il giorno di uno slot, scritto come lo legge una persona.
 *
 * Si formatta `slot.day` — il giorno gia risolto nel fuso del club — e non
 * l'istante: ricostruire la data dall'istante nel fuso del browser puo
 * spostare di un giorno chi apre l'area famiglia da un altro paese.
 */
const formatSlotDay = (day: string) => {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;

  return date.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

/**
 * Gli slot liberi raccolti per giorno.
 *
 * **Un istante compare una volta sola.** Un club con due sedi o due operatori
 * puo avere due slot alla stessa ora: alla famiglia sarebbero due pulsanti
 * identici fra cui non ha modo di scegliere, e il server accetta comunque il
 * primo libero a quell'istante.
 */
const groupSlotsByDay = (slots: AppointmentSlot[]) => {
  const perDay = new Map<string, Map<string, AppointmentSlot>>();

  for (const slot of slots) {
    const day = String(slot?.day || "").trim();
    const startsAt = String(slot?.startsAt || "").trim();
    if (!day || !startsAt) continue;

    const orari = perDay.get(day) || new Map<string, AppointmentSlot>();
    if (!orari.has(startsAt)) orari.set(startsAt, slot);
    perDay.set(day, orari);
  }

  return Array.from(perDay.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, orari]) => ({
      day,
      label: formatSlotDay(day),
      slots: Array.from(orari.values()).sort((left, right) =>
        String(left.startsAt).localeCompare(String(right.startsAt)),
      ),
    }));
};

/**
 * La segreteria vista dalla famiglia: orari, richiesta di appuntamento, elenco.
 *
 * **Perche non ci sono piu un campo data e un campo ora.** Il server accetta
 * solo un istante che cada **esattamente** su uno slot libero
 * (`findFreeSlotAt` confronta `getTime()` su una griglia di trenta minuti):
 * chi scriveva 09:15 riceveva «scegli uno slot fra quelli liberi» da un elenco
 * che nessuna schermata gli aveva mai mostrato. Adesso l'elenco e la
 * schermata: un giorno fra quelli che hanno posto, e gli orari liberi di quel
 * giorno come pulsanti.
 *
 * **E se non c'e nessuno slot** non si disegna un modulo che fallira: si dice
 * che non ci sono orari e perche.
 */
export function ParentSecretariatPage() {
  const {
    data,
    loadAppointmentSlots,
    bookAppointment,
    updateAppointment,
    cancelAppointment,
  } = useParentDashboard();
  const { showToast } = useToast();
  const [form, setForm] = useState({ reason: "", notes: "" });
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [slotsState, setSlotsState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [slotsError, setSlotsError] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  /** L'istante ISO dello slot scelto: e la chiave con cui il server lo cerca. */
  const [selectedStartsAt, setSelectedStartsAt] = useState("");
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  /*
    L'appuntamento in attesa di conferma di disdetta. La conferma passa da un
    dialogo del prodotto e non da `window.confirm()`: e la stessa scelta,
    motivata, di `/appuntamenti` — stesso dominio, stessa Wave — dove la
    fascia oraria si elimina con `AlertDialog`. Due modi di chiedere «sei
    sicuro?» dentro lo stesso dominio sono uno di troppo.
  */
  const [daDisdire, setDaDisdire] = useState<Record<string, any> | null>(null);

  const refreshSlots = useCallback(async () => {
    setSlotsState("loading");
    try {
      const disponibili = await loadAppointmentSlots();
      setSlots(disponibili);
      setSlotsError("");
      setSlotsState("ready");
    } catch (error: any) {
      /*
        Tre stati, non due: un errore di rete raccontato come «nessun orario
        disponibile» fa credere che la segreteria non riceva nessuno.
      */
      setSlots([]);
      setSlotsError(
        error?.message || "Impossibile leggere gli orari disponibili",
      );
      setSlotsState("error");
    }
  }, [loadAppointmentSlots]);

  useEffect(() => {
    void refreshSlots();
  }, [refreshSlots]);

  const days = useMemo(() => groupSlotsByDay(slots), [slots]);

  if (!data) return null;

  /*
    Il giorno scelto vale finche esiste: quando gli slot si rileggono — dopo
    una prenotazione, o perche un'altra famiglia ha preso l'ultimo orario — si
    ricade sul primo giorno con posto, invece di mostrare un elenco vuoto sotto
    un giorno che non c'e piu.
  */
  const activeDay =
    days.find((entry) => entry.day === selectedDay) || days[0] || null;
  const selectedSlot =
    activeDay?.slots.find((slot) => slot.startsAt === selectedStartsAt) || null;

  const resetForm = () => {
    setForm({ reason: "", notes: "" });
    setSelectedStartsAt("");
    setEditingAppointmentId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.reason.trim()) {
      showToast("error", "Indica il motivo dell'appuntamento.");
      return;
    }

    if (!selectedSlot) {
      showToast("error", "Scegli uno degli orari disponibili.");
      return;
    }

    const richiesta = {
      reason: form.reason,
      notes: form.notes,
      startsAt: selectedSlot.startsAt,
      slotId: selectedSlot.slotId,
      siteId: selectedSlot.siteId,
    };

    try {
      setSaving(true);
      if (editingAppointmentId) {
        await updateAppointment(editingAppointmentId, richiesta);
      } else {
        await bookAppointment(richiesta);
      }
      resetForm();
    } catch (error: any) {
      showToast("error", error?.message || "Errore prenotazione");
    } finally {
      setSaving(false);
      /*
        L'orario appena preso non e piu libero — e se la richiesta e fallita,
        spesso e fallita proprio perche l'ha preso qualcun altro. La griglia si
        rilegge in entrambi i casi.
      */
      void refreshSlots();
    }
  };

  const startEditAppointment = (appointment: Record<string, any>) => {
    setEditingAppointmentId(String(appointment.id));
    setForm({
      reason: appointment.reason || appointment.title || "",
      notes: appointment.notes || "",
    });
    /*
      Spostare un appuntamento vuol dire sceglierne un altro orario: quello di
      adesso non e fra i liberi, perche lo occupa la richiesta stessa. La
      selezione riparte vuota invece di proporre un orario che verrebbe
      rifiutato.
    */
    setSelectedStartsAt("");
  };

  const handleCancelAppointment = async () => {
    const appointment = daDisdire;
    if (!appointment) return;

    setDaDisdire(null);
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
              {editingAppointmentId ? "Sposta appuntamento" : "Prenota appuntamento"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {slotsState === "loading" ? (
              <p
                className="text-sm text-slate-500"
                role="status"
                aria-live="polite"
              >
                Caricamento degli orari disponibili...
              </p>
            ) : slotsState === "error" ? (
              <div className="space-y-3" role="alert">
                <p className="text-sm text-slate-600">{slotsError}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => void refreshSlots()}
                >
                  Riprova
                </Button>
              </div>
            ) : days.length === 0 ? (
              <div className="space-y-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-900">
                  Nessun orario disponibile per un appuntamento.
                </p>
                <p>
                  La segreteria non ha ancora aperto orari prenotabili, oppure
                  quelli delle prossime settimane sono gia stati presi tutti.
                  Puoi contattarla negli orari indicati in questa pagina.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => void refreshSlots()}
                >
                  Aggiorna
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="appointment-reason">Motivo</Label>
                  <Input
                    id="appointment-reason"
                    value={form.reason}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        reason: event.target.value,
                      }))
                    }
                    placeholder="Es. consegna del certificato medico"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appointment-day">Giorno</Label>
                  <Select
                    value={activeDay?.day || ""}
                    onValueChange={(value) => {
                      setSelectedDay(value);
                      // Cambiando giorno l'orario scelto non esiste piu.
                      setSelectedStartsAt("");
                    }}
                  >
                    <SelectTrigger id="appointment-day">
                      <SelectValue placeholder="Scegli un giorno" />
                    </SelectTrigger>
                    <SelectContent>
                      {days.map((entry) => (
                        <SelectItem key={entry.day} value={entry.day}>
                          {entry.label} ·{" "}
                          {entry.slots.length === 1
                            ? "1 orario libero"
                            : `${entry.slots.length} orari liberi`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-700">
                    Orario
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(activeDay?.slots || []).map((slot) => {
                      const scelto = slot.startsAt === selectedStartsAt;

                      return (
                        <Button
                          key={slot.startsAt}
                          type="button"
                          size="sm"
                          variant={scelto ? "default" : "outline"}
                          aria-pressed={scelto}
                          className="eg-tabular"
                          onClick={() => setSelectedStartsAt(slot.startsAt)}
                        >
                          {slot.time}
                        </Button>
                      );
                    })}
                  </div>
                  <p
                    className="text-xs text-slate-500"
                    role="status"
                    aria-live="polite"
                  >
                    {selectedSlot
                      ? `Hai scelto ${activeDay?.label} alle ${selectedSlot.time} (${selectedSlot.durationMinutes} minuti).`
                      : "Scegli uno degli orari liberi: la segreteria riceve solo in questi."}
                  </p>
                </fieldset>

                <div className="space-y-2">
                  <Label htmlFor="appointment-notes">Note (facoltative)</Label>
                  <Textarea
                    id="appointment-notes"
                    value={form.notes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Qualcosa che la segreteria deve sapere prima"
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="submit"
                    disabled={saving || !selectedSlot}
                    className="flex-1"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {saving
                      ? "Salvataggio..."
                      : editingAppointmentId
                        ? "Sposta a questo orario"
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
            )}

            {/*
              Chi ha premuto «Modifica» e si trova davanti un caricamento, un
              errore o nessun orario libero non avrebbe altrimenti nessun modo
              di uscire dallo spostamento: il pulsante «Annulla» vive dentro il
              modulo, e in quei tre casi il modulo non c'e.
            */}
            {editingAppointmentId && (slotsState !== "ready" || days.length === 0) ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-3 w-full sm:w-auto"
                onClick={resetForm}
              >
                Annulla lo spostamento
              </Button>
            ) : null}
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
                        onClick={() => setDaDisdire(appointment)}
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

      {/*
        La disdetta passa da un dialogo, non da `confirm()`: e la stessa
        lezione di W6-07 e la stessa forma gia in uso su `/appuntamenti`, dove
        la fascia oraria si elimina cosi. Il popup del browser non si puo
        scrivere, non dice cosa succede dopo, e su mobile arriva staccato dal
        prodotto.
      */}
      <AlertDialog
        open={Boolean(daDisdire)}
        onOpenChange={(aperto) => {
          if (!aperto) setDaDisdire(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disdire questo appuntamento?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;orario torna libero per un&apos;altra famiglia e la
              segreteria vede la richiesta come annullata. Per spostarlo senza
              perderlo, usa «Modifica».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Lascialo</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(evento) => {
                evento.preventDefault();
                void handleCancelAppointment();
              }}
            >
              Disdici
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ParentStructuresPage() {
  const { data, bookStructure } = useParentDashboard();
  const { showToast } = useToast();
  const structures = data?.structures?.items || [];
  const bookings = data?.structures?.bookings || [];
  const linkedAthletes = data?.athlete.linkedAthletes?.length
    ? data.athlete.linkedAthletes
    : data?.athlete
      ? [data.athlete]
      : [];
  const [form, setForm] = useState({
    structureId: "",
    fieldId: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "18:00",
    endTime: "19:00",
    athleteId: data?.athlete.id || "",
    notes: "",
  });
  if (!data) return null;

  const currentStructure = structures.find(
    (structure) => String(structure.id) === form.structureId,
  );
  const currentFields = Array.isArray(currentStructure?.fields)
    ? currentStructure.fields
    : [];

  const patchForm = (next: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...next }));

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.structureId || !form.fieldId) {
      showToast("error", "Seleziona struttura e campo");
      return;
    }

    const start = new Date(`${form.date}T${form.startTime}`);
    const end = new Date(`${form.date}T${form.endTime}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      showToast("error", "Inserisci data e orari validi");
      return;
    }
    if (start.getTime() >= end.getTime()) {
      showToast("error", "L'orario di fine deve essere successivo all'inizio");
      return;
    }

    try {
      await bookStructure({
        structureId: form.structureId,
        fieldId: form.fieldId,
        start: start.toISOString(),
        end: end.toISOString(),
        athleteId: data.athlete.id,
        notes: form.notes,
      });
      patchForm({ notes: "" });
    } catch (error: any) {
      showToast("error", error?.message || "Richiesta prenotazione fallita");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Strutture"
        subtitle="Consulta campi prenotabili e richiedi una prenotazione."
      />

      {structures.length === 0 ? (
        <Card className="border-dashed border-slate-200 bg-white">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <Building2 className="mb-4 h-12 w-12 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900">
              Nessuna struttura prenotabile al momento.
            </h3>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {structures.map((structure) => (
              <Card key={structure.id} className="border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    {structure.name}
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    {[structure.address, structure.city].filter(Boolean).join(", ") ||
                      "Indirizzo non disponibile"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(structure.fields || []).map((field: any) => (
                    <div key={field.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{field.name}</p>
                        <Badge variant="outline">Prenotabile</Badge>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            Disponibilita
                          </p>
                          <div className="mt-1 space-y-1 text-sm text-slate-600">
                            {Object.entries(field.availability || {}).some(
                              ([, slots]) => Array.isArray(slots) && slots.length,
                            ) ? (
                              Object.entries(field.availability || {}).map(
                                ([day, slots]) =>
                                  Array.isArray(slots) && slots.length ? (
                                    <p key={day}>
                                      <span className="font-medium">{day}:</span>{" "}
                                      {slots
                                        .map((slot: any) => `${slot.start}-${slot.end}`)
                                        .join(", ")}
                                    </p>
                                  ) : null,
                              )
                            ) : (
                              <p>Nessuna fascia pubblicata.</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            Tariffe
                          </p>
                          <div className="mt-1 space-y-1 text-sm text-slate-600">
                            {field.pricing?.length ? (
                              field.pricing.map((price: any) => (
                                <p key={price.id}>
                                  {price.durationMinutes} min -{" "}
                                  {formatCurrency(price.price)}
                                </p>
                              ))
                            ) : (
                              <p>Tariffe non pubblicate.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Richiedi prenotazione</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submitBooking}>
                <div className="space-y-2">
                  <Label>Struttura</Label>
                  <Select
                    value={form.structureId || undefined}
                    onValueChange={(value) => {
                      const selected = structures.find(
                        (structure) => String(structure.id) === value,
                      );
                      patchForm({
                        structureId: value,
                        fieldId: selected?.fields?.[0]?.id || "",
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona struttura" />
                    </SelectTrigger>
                    <SelectContent>
                      {structures.map((structure) => (
                        <SelectItem key={structure.id} value={String(structure.id)}>
                          {structure.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Campo</Label>
                  <Select
                    value={form.fieldId || undefined}
                    onValueChange={(value) => patchForm({ fieldId: value })}
                    disabled={!currentFields.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentFields.map((field: any) => (
                        <SelectItem key={field.id} value={String(field.id)}>
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/*
                  W6-12 e W6-13. Qui si poteva prenotare **per un altro
                  figlio**, restando nell area del figlio scelto.

                  Da quando l elenco delle prenotazioni e filtrato per figlio
                  — e deve esserlo: prima mostrava anche quelle degli altri —
                  quel campo sarebbe diventato una trappola, perche la
                  prenotazione appena creata sarebbe **sparita** dalla stessa
                  schermata che l ha creata.

                  Si prenota per il figlio scelto. Per l altro si cambia
                  figlio, che e l unico posto dove la scelta si fa.
                */}
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(event) => patchForm({ date: event.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Ora inizio</Label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(event) =>
                        patchForm({ startTime: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ora fine</Label>
                    <Input
                      type="time"
                      value={form.endTime}
                      onChange={(event) =>
                        patchForm({ endTime: event.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea
                    rows={3}
                    value={form.notes}
                    onChange={(event) => patchForm({ notes: event.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full">
                  <Send className="mr-2 h-4 w-4" />
                  Richiedi prenotazione
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Le tue prenotazioni</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="text-sm text-slate-500">
              Non hai ancora richiesto prenotazioni.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {booking.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {booking.structureName} - {booking.fieldName} -{" "}
                      {new Date(booking.start).toLocaleString("it-IT")}
                    </p>
                  </div>
                  <Badge variant="outline" className={getStatusClassName(booking.status)}>
                    {getStatusLabel(booking.status)}
                  </Badge>
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

  const sitoDelClub = data.club.website;

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
            {sitoDelClub ? (
              <Button variant="outline" asChild>
                <a href={sitoDelClub} target="_blank" rel="noreferrer">
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
