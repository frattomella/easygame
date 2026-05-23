"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
  Trophy,
  Upload,
  UserCircle,
  Users,
} from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-notification";
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
  if (["requested", "richiesto", "in_verifica", "review", "pending_review"].includes(normalized)) {
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
          key={item.id}
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

function renderOpeningHours(openingHours: any) {
  if (!openingHours) {
    return <EmptyState text="Orari non inseriti dal club." />;
  }

  if (typeof openingHours === "string") {
    return <p className="text-sm leading-6 text-slate-600">{openingHours}</p>;
  }

  if (Array.isArray(openingHours)) {
    return (
      <div className="space-y-2">
        {openingHours.map((row, index) => (
          <div
            key={`${row?.day || "orario"}-${index}`}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
          >
            <span className="font-medium text-slate-700">
              {row?.day || row?.label || "Giorno"}
            </span>
            <span className="text-slate-500">
              {row?.hours || row?.time || row?.value || "-"}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (typeof openingHours === "object") {
    return (
      <div className="space-y-2">
        {Object.entries(openingHours).map(([day, hours]) => (
          <div
            key={day}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
          >
            <span className="font-medium capitalize text-slate-700">{day}</span>
            <span className="text-slate-500">{String(hours || "-")}</span>
          </div>
        ))}
      </div>
    );
  }

  return <EmptyState text="Orari non disponibili." />;
}

export function ParentDashboardHome() {
  const router = useRouter();
  const { data, athleteRouteId } = useParentDashboard();

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

  return (
    <div className="space-y-6">
      <PageHeading
        title="Atleta"
        subtitle="Profilo sportivo, contatti e situazione sanitaria."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>{data.athlete.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Data di nascita</p>
              <p className="mt-1 font-semibold text-slate-950">
                {formatDate(data.athlete.birth_date)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Categoria</p>
              <p className="mt-1 font-semibold text-slate-950">
                {data.athlete.category_name || "Da assegnare"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Presenze</p>
              <p className="mt-1 font-semibold text-slate-950">
                {data.attendance.rate}%
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Certificato</p>
              <p className="mt-1 font-semibold text-slate-950">
                {getStatusLabel(data.health.status)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Contatti familiari</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.athlete.guardians.length === 0 ? (
              <EmptyState text="Nessun contatto registrato." />
            ) : (
              data.athlete.guardians.map((guardian) => (
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
            <CardTitle>Salute</CardTitle>
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
    </div>
  );
}

export function ParentTrainingsPage() {
  const { data } = useParentDashboard();
  const [query, setQuery] = useState("");
  if (!data) return null;

  const history = data.trainings.history.filter((item) => matchesSearch(item, query));

  return (
    <div className="space-y-6">
      <PageHeading title="Allenamenti" subtitle="Calendario e presenze." />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Prossimi allenamenti</CardTitle>
        </CardHeader>
        <CardContent>
          <EventList
            items={data.trainings.upcoming}
            emptyText="Nessun allenamento in programma."
          />
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Storico allenamenti</CardTitle>
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
          <EventList items={history} emptyText="Nessun risultato." />
        </CardContent>
      </Card>
    </div>
  );
}

export function ParentMatchesPage() {
  const { data } = useParentDashboard();
  const [query, setQuery] = useState("");
  if (!data) return null;

  const allMatches = [...data.matches.upcoming, ...data.matches.history];
  const visibleMatches = allMatches.filter((item) => matchesSearch(item, query));

  return (
    <div className="space-y-6">
      <PageHeading title="Gare" subtitle="Programma, storico e convocazioni." />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Gare</CardTitle>
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
        <CardContent>
          <EventList items={visibleMatches} emptyText="Nessuna gara trovata." />
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
  const { data, bookAppointment } = useParentDashboard();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    reason: "",
    date: "",
    time: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  if (!data) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      await bookAppointment(form);
      setForm({ reason: "", date: "", time: "", notes: "" });
    } catch (error: any) {
      showToast("error", error?.message || "Errore prenotazione");
    } finally {
      setSaving(false);
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
            <CardTitle>Prenota appuntamento</CardTitle>
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
              <Button type="submit" disabled={saving} className="w-full">
                <Send className="mr-2 h-4 w-4" />
                {saving ? "Invio..." : "Invia richiesta"}
              </Button>
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
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("border", getStatusClassName(appointment.status))}
                  >
                    {getStatusLabel(appointment.status)}
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
