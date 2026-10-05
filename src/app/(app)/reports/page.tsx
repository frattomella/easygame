"use client";

import React from "react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { CalendarDays, CreditCard, Trophy, Users } from "lucide-react";
import { PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard, KpiBar, KpiCard } from "@/components/web/page/Cards";
import { formatInteger, formatMoney } from "@/lib/web/format";
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
  type ReportPeriodKey,
} from "@/lib/club-report-utils";
import { getClub, getClubAthletes, getClubData } from "@/lib/simplified-db";
import { supabase } from "@/lib/supabase";
import type { NormalizedCategoryOption } from "@/lib/category-utils";
import {
  ALL_CATEGORIES_VALUE,
  CategoryContextControl,
  PeriodContextControl,
} from "@/components/reports/v2/report-context-controls";
import {
  AttendancePanel,
  CategoryAthleteGrid,
  MatchPanel,
  PaymentPanel,
} from "@/components/reports/v2/activity-report-panels";
import ManagementSummary from "./management-summary";

/*
  La pagina Report nel Web V2 (guideline 09 §9.1, pattern 4 «Analytics /
  report»): intestazione con i controlli di contesto — categoria e periodo —
  poi la riga dei KPI, poi un pannello per report, poi il riepilogo
  gestionale con i filtri propri. Nessuna azione primaria: un report non ne
  ha, e le uniche azioni sono le esportazioni dentro il loro pannello.

  La logica dati e la stessa della V1 — stesse funzioni, stessi endpoint,
  stessi calcoli in `src/lib/club-report-utils.ts` — e vive qui; cio che
  disegna i pannelli sta in `src/components/reports/v2/`.
*/

type ClubData = {
  id: string;
  name?: string | null;
  categories?: unknown;
  /** Le sedi: il filtro sede del riepilogo compare solo se sono piu di una. */
  club_sites?: unknown;
  /** Le stagioni vivono qui dentro: `settings.seasons`. */
  settings?: unknown;
};

type StoredClub = Partial<ClubData> & {
  id?: string;
  role?: string | null;
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

const emptyReportState: ReportState = {
  club: null,
  clubCategories: [],
  athletes: [],
  trainings: [],
  attendanceRecords: [],
  matches: [],
  movements: [],
};

/** L'ancora del collegamento `?report=categories` che arriva da Atleti. */
const CATEGORY_REPORT_ANCHOR = "report-categorie";

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

const findSelectedCategory = (
  categories: NormalizedCategoryOption[],
  selectedCategoryId: string,
) =>
  selectedCategoryId === ALL_CATEGORIES_VALUE
    ? null
    : categories.find(
        (category) =>
          String(category.id) === String(selectedCategoryId) ||
          String(category.name) === String(selectedCategoryId),
      ) || null;

export default function ReportsPage() {
  const [reportState, setReportState] =
    React.useState<ReportState>(emptyReportState);
  const [loading, setLoading] = React.useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState(
    ALL_CATEGORIES_VALUE,
  );
  const [period, setPeriod] = React.useState<ReportPeriodKey>("all");
  const [requestedReport, setRequestedReport] = React.useState<string | null>(null);
  /*
    Club e ruolo attivi si leggono una volta e si tengono nello stato: il
    riepilogo gestionale ne ha bisogno a ogni render, e rileggerli da
    `localStorage` dentro il corpo del componente farebbe divergere server e
    client alla prima idratazione.
  */
  const [activeClubId, setActiveClubId] = React.useState("");
  const [activeRole, setActiveRole] = React.useState<string | null>(null);
  const { showToast } = useToast();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const categoryId = params.get("categoryId");
    if (categoryId) {
      setSelectedCategoryId(categoryId);
    }
    setRequestedReport(params.get("report"));
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const loadReports = async () => {
      try {
        setLoading(true);
        const activeClub = readStoredActiveClub();
        const clubId = getActiveClubId();
        setActiveClubId(clubId);
        setActiveRole(activeClub?.role ? String(activeClub.role) : null);

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

  /*
    `?report=categories` arriva dal `···` di Atleti: la pagina si apre gia sul
    report categoria per atleta, senza che chi arriva debba cercarlo sotto la
    riga dei KPI.
  */
  React.useEffect(() => {
    if (loading || requestedReport !== "categories") return;
    document
      .getElementById(CATEGORY_REPORT_ANCHOR)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [loading, requestedReport]);

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
      selectedCategoryId !== ALL_CATEGORIES_VALUE &&
      categoryOptions.length > 0 &&
      !findSelectedCategory(categoryOptions, selectedCategoryId)
    ) {
      setSelectedCategoryId(ALL_CATEGORIES_VALUE);
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
        /*
          **La rosa e una riga, non una grafia del payload** (`D-AUD-9`).
          `attendanceRecords` sono le righe di `training_attendance`, che e
          `club_event_participants`: la convocazione vive li, nella colonna
          `convocation_status`. La pagina le caricava gia per le presenze e non
          le passava qui, e il rendiconto delle convocazioni diceva zero.
        */
        attendanceRecords: reportState.attendanceRecords,
        categories: categoryOptions,
        selectedCategoryId,
        period,
      }),
    [
      categoryOptions,
      period,
      reportState.attendanceRecords,
      reportState.matches,
      selectedCategoryId,
    ],
  );

  /*
    **Il filtro Periodo tocca anche i numeri finanziari.**

    Fino alla Wave 4 questo `useMemo` non dipendeva da `period` e non glielo
    passava: scegliere «Ultimo mese» cambiava allenamenti, presenze e gare e
    lasciava i quattro numeri del report pagamenti sull'intero storico, senza
    che niente sulla pagina lo dicesse. Un filtro che ne muove tre su quattro e
    peggio di un filtro assente, perche chi legge crede di guardare un periodo.
  */
  const paymentReport = React.useMemo(
    () => calculatePaymentReport(reportState.movements, period),
    [period, reportState.movements],
  );

  const athleteCount = React.useMemo(() => {
    if (!selectedCategory) {
      return reportState.athletes.length;
    }

    return new Set(categoryReport.rows.map((row) => row.athleteId)).size;
  }, [categoryReport.rows, reportState.athletes.length, selectedCategory]);

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Report" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Cassa e amministrazione"
              title="Report"
              description={`Dati reali salvati per ${reportState.club?.name || "il club"}.`}
              context={
                <>
                  <CategoryContextControl
                    categories={categoryOptions}
                    value={selectedCategoryId}
                    onChange={setSelectedCategoryId}
                  />
                  <PeriodContextControl value={period} onChange={setPeriod} />
                </>
              }
            />

            {!loading && categoryOptions.length === 0 ? (
              <EmptyStateCard
                icon={<Users />}
                iconTone="neutral"
                title="Nessuna categoria salvata"
                description="Il filtro categorie mostrerà le categorie reali appena saranno presenti in Club.categories o nelle associazioni atleta-categoria."
              />
            ) : null}

            {/* ── La riga dei KPI (§9.3, barra compressa) ─────────────── */}
            <KpiBar className="md:grid-cols-2 laptop:grid-cols-4">
              <KpiCard
                label="Atleti nel filtro"
                value={formatInteger(athleteCount)}
                qualifier={selectedCategory?.name || "Tutte le categorie reali del club"}
                icon={<Users />}
                iconTone="blue"
                loading={loading}
              />
              <KpiCard
                label="Allenamenti"
                value={formatInteger(categoryReport.totalTrainings)}
                qualifier="Allenamenti nel filtro"
                icon={<CalendarDays />}
                iconTone="blue"
                loading={loading}
              />
              <KpiCard
                label="Gare"
                value={formatInteger(categoryReport.totalMatches)}
                qualifier="Gare nel filtro"
                icon={<Trophy />}
                iconTone="amber"
                loading={loading}
              />
              <KpiCard
                label="Pagato atleti"
                value={formatMoney(paymentReport.totalPaid)}
                qualifier="Denaro incassato, annullati esclusi"
                icon={<CreditCard />}
                iconTone="green"
                loading={loading}
              />
            </KpiBar>

            <CategoryAthleteGrid
              report={categoryReport}
              loading={loading}
              gridId={CATEGORY_REPORT_ANCHOR}
            />
            <AttendancePanel report={attendanceReport} loading={loading} />
            <MatchPanel report={matchReport} loading={loading} />
            <PaymentPanel report={paymentReport} loading={loading} />

            {/*
              Il riepilogo gestionale ha filtri propri — date, anno fiscale,
              stagione, conto, causale, sede, verso, classificazione — e non
              eredita quelli sopra: «ultimo mese» sulle presenze e un'altra
              domanda rispetto a «l'anno fiscale 2026» sui movimenti, e
              legarli avrebbe prodotto un filtro che significa due cose.
            */}
            <ManagementSummary
              clubId={activeClubId}
              club={reportState.club}
              role={activeRole}
            />
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
