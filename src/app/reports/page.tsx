"use client";

import React from "react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Trophy,
  Users,
} from "lucide-react";
import {
  aggregateClubPayments,
  loadClubFinancialSources,
  type NormalizedClubMovement,
} from "@/lib/club-financial-summary";
import {
  calculateAttendanceReport,
  calculateCategoryReport,
  calculateMatchConvocationReport,
  calculatePaymentReport,
  getClubCategoryOptions,
  type AttendanceReport,
  type CategoryReport,
  type MatchConvocationReport,
  type PaymentReport,
  type ReportPeriodKey,
} from "@/lib/club-report-utils";
import { getClub, getClubAthletes, getClubData } from "@/lib/simplified-db";
import { supabase } from "@/lib/supabase";
import type { NormalizedCategoryOption } from "@/lib/category-utils";

type ClubData = {
  id: string;
  name?: string | null;
  categories?: unknown;
};

type StoredClub = Partial<ClubData> & {
  id?: string;
};

type ReportState = {
  club: ClubData | null;
  clubCategories: unknown;
  athletes: any[];
  trainings: any[];
  attendanceRecords: any[];
  matches: any[];
  movements: NormalizedClubMovement[];
};

type MetricCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
};

const PERIOD_OPTIONS: Array<{ value: ReportPeriodKey; label: string }> = [
  { value: "all", label: "Intero periodo" },
  { value: "last30", label: "Ultimo mese" },
  { value: "last90", label: "Ultimi 3 mesi" },
];

const emptyReportState: ReportState = {
  club: null,
  clubCategories: [],
  athletes: [],
  trainings: [],
  attendanceRecords: [],
  matches: [],
  movements: [],
};

const currencyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const readStoredActiveClub = (): StoredClub | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const keys = ["activeClub"];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("activeClub_")) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawValue) as StoredClub;
      if (parsed?.id) {
        return parsed;
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  return null;
};

const getActiveClubId = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("clubId") || readStoredActiveClub()?.id || "";
};

const safeArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const loadTrainingAttendance = async (clubId: string) => {
  try {
    const { data, error } = await supabase
      .from("training_attendance")
      .select("*")
      .eq("organization_id", clubId);

    if (error) {
      return [];
    }

    return safeArray(data);
  } catch {
    return [];
  }
};

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const formatAthleteLastFirst = (athlete: any, fallback: string) => {
  const lastName = String(athlete?.last_name || athlete?.lastName || "").trim();
  const firstName = String(
    athlete?.first_name || athlete?.firstName || "",
  ).trim();
  return [lastName, firstName].filter(Boolean).join(" ") || fallback;
};

const findSelectedCategory = (
  categories: NormalizedCategoryOption[],
  selectedCategoryId: string,
) =>
  selectedCategoryId === "all"
    ? null
    : categories.find(
        (category) =>
          String(category.id) === String(selectedCategoryId) ||
          String(category.name) === String(selectedCategoryId),
      ) || null;

function MetricCard({ title, value, description, icon }: MetricCardProps) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-semibold text-slate-950">{value}</p>
          {description ? (
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <div className="mb-3 text-slate-400">{icon}</div>
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mt-1 max-w-xl text-sm text-slate-500">{description}</p>
    </div>
  );
}

function CategoryAthleteTable({ report }: { report: CategoryReport }) {
  if (report.rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-10 w-10" />}
        title="Nessun dato categoria"
        description="Il report si popola quando esistono categorie salvate nel club e atleti associati."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Atleta</th>
            <th className="px-4 py-3 font-semibold">Categoria</th>
            <th className="px-4 py-3 font-semibold">Convocazioni / gare</th>
            <th className="px-4 py-3 font-semibold">
              Presenze / allenamenti
            </th>
            <th className="px-4 py-3 font-semibold">% convocazione</th>
            <th className="px-4 py-3 font-semibold">% presenza</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.rows.map((row) => (
            <tr key={`${row.categoryId}-${row.athleteId}`}>
              <td className="px-4 py-3 font-medium text-slate-900">
                {formatAthleteLastFirst(row.athlete, row.athleteName)}
              </td>
              <td className="px-4 py-3 text-slate-600">{row.categoryName}</td>
              <td className="px-4 py-3 text-slate-600">
                {row.convocations}/{row.totalMatches}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.presences}/{row.totalTrainings}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline">{row.convocationRate}%</Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline">{row.presenceRate}%</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceSection({ report }: { report: AttendanceReport }) {
  const hasData = report.totalTrainings > 0 || report.expectedAttendances > 0;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-blue-600" />
          Report presenze
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Allenamenti"
              value={report.totalTrainings}
              description="Allenamenti nel filtro"
              icon={<CalendarDays className="h-5 w-5" />}
            />
            <MetricCard
              title="Presenze registrate"
              value={`${report.presentAttendances}/${report.expectedAttendances}`}
              description={`${report.attendanceRate}% presenze`}
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <MetricCard
              title="Presenze mancanti"
              value={report.missingAttendances}
              description={`${report.absentAttendances} assenze registrate`}
              icon={<AlertCircle className="h-5 w-5" />}
            />
          </div>
        ) : (
          <EmptyState
            icon={<CalendarDays className="h-10 w-10" />}
            title="Nessuna presenza reale da mostrare"
            description="Quando verranno salvati allenamenti e presenze, questa sezione mostrerà totali e percentuali reali."
          />
        )}
      </CardContent>
    </Card>
  );
}

function MatchSection({ report }: { report: MatchConvocationReport }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-600" />
          Report gare e convocazioni
        </CardTitle>
      </CardHeader>
      <CardContent>
        {report.totalMatches > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Gare"
              value={report.totalMatches}
              description="Gare nel filtro"
              icon={<Trophy className="h-5 w-5" />}
            />
            <MetricCard
              title="Convocazioni"
              value={report.totalConvocations}
              description={`${report.uniqueAthletesConvocated} atleti convocati`}
              icon={<ClipboardList className="h-5 w-5" />}
            />
            <MetricCard
              title="Gare senza convocazioni"
              value={report.matchesWithoutConvocations}
              description={`${report.convocationCompletionRate}% gare compilate`}
              icon={<AlertCircle className="h-5 w-5" />}
            />
          </div>
        ) : (
          <EmptyState
            icon={<Trophy className="h-10 w-10" />}
            title="Nessuna gara reale nel filtro"
            description="Le convocazioni appariranno qui quando saranno salvate gare associate alle categorie."
          />
        )}
      </CardContent>
    </Card>
  );
}

function PaymentSection({ report }: { report: PaymentReport }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-emerald-600" />
          Report pagamenti atleti
        </CardTitle>
      </CardHeader>
      <CardContent>
        {report.hasPayments ? (
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard
              title="Totale dovuto"
              value={formatCurrency(report.totalDue)}
              description="Pagamenti atleti non annullati"
              icon={<CreditCard className="h-5 w-5" />}
            />
            <MetricCard
              title="Pagato"
              value={formatCurrency(report.totalPaid)}
              description={`${report.paidCount} pagamenti`}
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <MetricCard
              title="In attesa"
              value={formatCurrency(report.totalPending)}
              description={`${report.pendingCount} pagamenti`}
              icon={<FileText className="h-5 w-5" />}
            />
            <MetricCard
              title="Scaduto"
              value={formatCurrency(report.totalOverdue)}
              description={`${report.overdueCount} pagamenti`}
              icon={<AlertCircle className="h-5 w-5" />}
            />
          </div>
        ) : (
          <EmptyState
            icon={<CreditCard className="h-10 w-10" />}
            title="Nessun pagamento atleta reale"
            description="Questa sezione rimane vuota finché non esistono pagamenti salvati nel database."
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [reportState, setReportState] =
    React.useState<ReportState>(emptyReportState);
  const [loading, setLoading] = React.useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState("all");
  const [period, setPeriod] = React.useState<ReportPeriodKey>("all");
  const { showToast } = useToast();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const categoryId = params.get("categoryId");
    if (categoryId) {
      setSelectedCategoryId(categoryId);
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const loadReports = async () => {
      try {
        setLoading(true);
        const activeClub = readStoredActiveClub();
        const clubId = getActiveClubId();

        if (!clubId) {
          setReportState(emptyReportState);
          showToast("error", "Nessun club attivo trovato");
          return;
        }

        const loadResource = async <T,>(
          loader: () => Promise<T>,
          fallback: T,
        ) => {
          try {
            return await loader();
          } catch {
            return fallback;
          }
        };

        const [
          club,
          athletes,
          trainings,
          attendanceRecords,
          matches,
          clubCategories,
          financialSources,
        ] = await Promise.all([
          loadResource(() => getClub(clubId), activeClub as ClubData | null),
          loadResource(() => getClubAthletes(clubId), []),
          loadResource(() => getClubData(clubId, "trainings"), []),
          loadResource(() => loadTrainingAttendance(clubId), []),
          loadResource(() => getClubData(clubId, "matches"), []),
          loadResource(() => getClubData(clubId, "categories"), []),
          loadResource(() => loadClubFinancialSources(clubId), {}),
        ]);

        if (!isMounted) {
          return;
        }

        setReportState({
          club: (club || activeClub || null) as ClubData | null,
          clubCategories: club?.categories || clubCategories,
          athletes: safeArray(athletes),
          trainings: safeArray(trainings),
          attendanceRecords: safeArray(attendanceRecords),
          matches: safeArray(matches),
          movements: aggregateClubPayments(financialSources),
        });
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadReports();

    return () => {
      isMounted = false;
    };
  }, [showToast]);

  const categoryOptions = React.useMemo(
    () =>
      getClubCategoryOptions({
        clubCategories: reportState.clubCategories,
        athletes: reportState.athletes,
      }),
    [reportState.athletes, reportState.clubCategories],
  );

  React.useEffect(() => {
    if (
      selectedCategoryId !== "all" &&
      categoryOptions.length > 0 &&
      !findSelectedCategory(categoryOptions, selectedCategoryId)
    ) {
      setSelectedCategoryId("all");
    }
  }, [categoryOptions, selectedCategoryId]);

  const selectedCategory = React.useMemo(
    () => findSelectedCategory(categoryOptions, selectedCategoryId),
    [categoryOptions, selectedCategoryId],
  );

  const categoryReport = React.useMemo(
    () =>
      calculateCategoryReport({
        athletes: reportState.athletes,
        trainings: reportState.trainings,
        attendanceRecords: reportState.attendanceRecords,
        matches: reportState.matches,
        categories: categoryOptions,
        selectedCategoryId,
        period,
      }),
    [
      categoryOptions,
      period,
      reportState.athletes,
      reportState.attendanceRecords,
      reportState.matches,
      reportState.trainings,
      selectedCategoryId,
    ],
  );

  const attendanceReport = React.useMemo(
    () =>
      calculateAttendanceReport({
        athletes: reportState.athletes,
        trainings: reportState.trainings,
        attendanceRecords: reportState.attendanceRecords,
        categories: categoryOptions,
        selectedCategoryId,
        period,
      }),
    [
      categoryOptions,
      period,
      reportState.athletes,
      reportState.attendanceRecords,
      reportState.trainings,
      selectedCategoryId,
    ],
  );

  const matchReport = React.useMemo(
    () =>
      calculateMatchConvocationReport({
        matches: reportState.matches,
        categories: categoryOptions,
        selectedCategoryId,
        period,
      }),
    [categoryOptions, period, reportState.matches, selectedCategoryId],
  );

  const paymentReport = React.useMemo(
    () => calculatePaymentReport(reportState.movements),
    [reportState.movements],
  );

  const athleteCount = React.useMemo(() => {
    if (!selectedCategory) {
      return reportState.athletes.length;
    }

    return new Set(categoryReport.rows.map((row) => row.athleteId)).size;
  }, [categoryReport.rows, reportState.athletes.length, selectedCategory]);

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Report" />
          <main className={dashboardMainClassName}>
            <AppLoadingScreen subtitle="Caricamento report reali..." />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Report" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-7xl">
            <SharedPageHeader
              title="Report"
              subtitle={`Dati reali salvati per ${reportState.club?.name || "il club"}.`}
              actions={
              <div className="grid gap-3 sm:grid-cols-2 lg:w-[520px]">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase text-slate-500">
                    Categoria
                  </p>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={setSelectedCategoryId}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Tutte le categorie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le categorie</SelectItem>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase text-slate-500">
                    Periodo
                  </p>
                  <Select
                    value={period}
                    onValueChange={(value) => setPeriod(value as ReportPeriodKey)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Intero periodo" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIOD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              }
            />

            {categoryOptions.length === 0 ? (
              <EmptyState
                icon={<Users className="h-10 w-10" />}
                title="Nessuna categoria salvata"
                description="Il filtro categorie mostrerà le categorie reali appena saranno presenti in Club.categories o nelle associazioni atleta-categoria."
              />
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Atleti nel filtro"
                value={athleteCount}
                description={
                  selectedCategory?.name || "Tutte le categorie reali del club"
                }
                icon={<Users className="h-5 w-5" />}
              />
              <MetricCard
                title="Allenamenti"
                value={categoryReport.totalTrainings}
                description="Allenamenti nel filtro"
                icon={<CalendarDays className="h-5 w-5" />}
              />
              <MetricCard
                title="Gare"
                value={categoryReport.totalMatches}
                description="Gare nel filtro"
                icon={<Trophy className="h-5 w-5" />}
              />
              <MetricCard
                title="Pagato atleti"
                value={formatCurrency(paymentReport.totalPaid)}
                description="Pagamenti annullati esclusi"
                icon={<CreditCard className="h-5 w-5" />}
              />
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-slate-700" />
                  Report categoria per atleta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryAthleteTable report={categoryReport} />
              </CardContent>
            </Card>

            <AttendanceSection report={attendanceReport} />
            <MatchSection report={matchReport} />
            <PaymentSection report={paymentReport} />
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
