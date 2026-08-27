"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import clubLogoDefault from "@/../public/images/club_logo.png";
import MetricsOverview from "@/components/dashboard/MetricsOverview";
import UpcomingTrainings from "@/components/dashboard/UpcomingTrainings";
import CertificationAlerts from "@/components/dashboard/CertificationAlerts";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { PageHeading } from "@/components/dashboard/page-heading";
import { OnboardingResumeCard } from "@/components/dashboard/onboarding-resume-card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import {
  buildCertificateAlerts,
  buildDashboardMetrics,
  loadClubDashboardOverview,
  selectActiveNotes,
  selectUpcomingAppointments,
  selectUpcomingMatches,
  type ClubDashboardOverview,
} from "@/lib/dashboard/club-overview";
import {
  getInvalidCertificatesForConvocatedAthletes,
  type MatchCertificateWarningResult,
} from "@/lib/match-certificate-warnings";
import {
  ArrowRight,
  Calendar,
  Trophy,
  Bell,
} from "lucide-react";

interface ClubInfo {
  id: string;
  name: string;
  logo_url?: string;
}

interface Appointment {
  id: string;
  title: string;
  date: Date;
  time: string;
  description?: string;
  person?: string;
  athlete?: string;
}

interface Note {
  id: string;
  content: string;
  date: Date;
  expiryDate?: Date;
  notificationEnabled?: boolean;
}

interface Match {
  id: string;
  title: string;
  date: Date;
  time: string;
  opponent: string;
  location: string;
  category: string;
  categoryColor?: string;
  status: string;
  [key: string]: any;
}

type DashboardSideCardItem = {
  id: string;
  title: string;
  meta?: string;
  detail?: string;
  certificateWarning?: MatchCertificateWarningResult;
};

type DashboardSideCardProps = {
  title: string;
  count: number;
  description: string;
  accent: string;
  icon: ReactNode;
  onClick: () => void;
  items: DashboardSideCardItem[];
  emptyText: string;
};

const formatDashboardDate = (date: Date) =>
  date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });

const DashboardSideCard = ({
  title,
  count,
  description,
  accent,
  icon,
  onClick,
  items,
  emptyText,
}: DashboardSideCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex min-h-[190px] w-full flex-col rounded-lg p-4 text-left text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${accent}`}
  >
    <div className="flex items-start justify-between gap-3 pb-3">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-white/20 p-2 text-white shadow-inner">
          {icon}
        </div>
        <div>
          <p className="text-lg font-black uppercase tracking-normal">
            {title}
          </p>
          <p className="text-xs font-medium text-white/80">{description}</p>
        </div>
      </div>
      <Badge className="border-0 bg-white/20 text-white hover:bg-white/20">
        {count}
      </Badge>
    </div>

    <div className="min-h-[76px] flex-1 space-y-2">
      {items.length > 0 ? (
        items.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="rounded-md bg-white/15 px-3 py-2 text-white shadow-sm ring-1 ring-white/15 backdrop-blur"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-semibold">
                  {item.title}
                </p>
                {item.meta || item.detail ? (
                  <p className="line-clamp-1 text-xs text-white/80">
                    {[item.meta, item.detail].filter(Boolean).join(" - ")}
                  </p>
                ) : null}
              </div>
              {item.certificateWarning?.hasInvalidCertificates ? (
                <MatchCertificateWarningBadge
                  warning={item.certificateWarning}
                  compact
                  className="shrink-0 border-amber-100 bg-amber-100 text-amber-900"
                />
              ) : null}
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-md border border-white/20 bg-white/10 px-3 py-3 text-sm text-white/85">
          {emptyText}
        </div>
      )}
    </div>

    <div className="pt-3">
      <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-normal text-white/90">
        Vedi tutte
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </div>
  </button>
);

export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubInfo, setClubInfo] = useState<ClubInfo | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [todayNotes, setTodayNotes] = useState<Note[]>([]);
  const [todayMatches, setTodayMatches] = useState<Match[]>([]);
  const [clubAthletes, setClubAthletes] = useState<any[]>([]);
  const [overview, setOverview] = useState<ClubDashboardOverview | null>(null);

  const metrics = useMemo(
    () =>
      buildDashboardMetrics({
        club: overview?.club || null,
        athletes: overview?.athletes || [],
        certificates: overview?.certificates || [],
      }),
    [overview],
  );

  const certificateAlerts = useMemo(
    () =>
      buildCertificateAlerts({
        athletes: overview?.athletes || [],
        certificates: overview?.certificates || [],
      }),
    [overview],
  );

  /**
   * Una lettura sola, in parallelo, all'apertura.
   *
   * Prima erano sei `await` consecutivi in questa pagina piu dieci letture
   * dai tre componenti, con l'archivio atleti chiesto quattro volte e per
   * intero: 29 richieste, 10 attese in fila, 1,9 MB su 200 atleti. La misura
   * sta in `scripts/measure-dashboard-performance.mjs` e la lettura in
   * `@/lib/dashboard/club-overview`.
   */
  useEffect(() => {
    let cancelled = false;

    const resolveClubId = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const fromUrl =
        searchParams.get("clubId") || searchParams.get("organizationId");
      if (fromUrl) return fromUrl;

      try {
        const stored = localStorage.getItem("activeClub");
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        return parsed?.id ? String(parsed.id) : null;
      } catch (error) {
        console.error("Error parsing active club:", error);
        return null;
      }
    };

    const syncActiveClubLocally = (club: ClubInfo) => {
      try {
        const stored = localStorage.getItem("activeClub");
        const parsed = stored ? JSON.parse(stored) : {};
        const merged = { ...parsed, ...club };
        localStorage.setItem("activeClub", JSON.stringify(merged));
        localStorage.setItem("organization-name", club.name);
        window.dispatchEvent(
          new CustomEvent("club-updated", { detail: { clubData: merged } }),
        );
      } catch (error) {
        console.error("Error syncing active club:", error);
      }
    };

    const load = async () => {
      const activeClubId = resolveClubId();

      if (!activeClubId) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (!cancelled) setClubId(activeClubId);

      try {
        const result = await loadClubDashboardOverview(activeClubId);
        if (cancelled) return;

        setOverview(result);

        if (result.club) {
          const club: ClubInfo = {
            id: result.club.id,
            name: result.club.name,
            logo_url: result.club.logoUrl || undefined,
          };
          setClubInfo(club);
          syncActiveClubLocally(club);
        }

        setTodayAppointments(
          selectUpcomingAppointments(result.club?.appointments || []),
        );
        setTodayNotes(selectActiveNotes(result.club?.notes || []));
        setTodayMatches(selectUpcomingMatches(result.club?.matches || []));
        setClubAthletes(result.athletes);
      } catch (error) {
        console.warn("Error loading dashboard data:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const matchItems: DashboardSideCardItem[] = todayMatches
    .slice(0, 3)
    .map((match) => ({
      id: match.id,
      title: match.opponent ? `vs ${match.opponent}` : match.title,
      meta: `${formatDashboardDate(match.date)} - ${match.time || "Orario da definire"}`,
      detail: match.category,
      certificateWarning: getInvalidCertificatesForConvocatedAthletes(
        match,
        clubAthletes,
      ),
    }));

  const appointmentItems: DashboardSideCardItem[] = todayAppointments
    .slice(0, 3)
    .map((appointment) => ({
      id: appointment.id,
      title: appointment.title,
      meta: `${formatDashboardDate(appointment.date)} - ${appointment.time || "Orario da definire"}`,
      detail: appointment.person || appointment.athlete,
    }));

  const reminderItems: DashboardSideCardItem[] = todayNotes
    .slice(0, 3)
    .map((note) => ({
      id: note.id,
      title: note.content,
      meta: note.expiryDate
        ? `Scade ${formatDashboardDate(note.expiryDate)}`
        : "Promemoria attivo",
    }));

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-[1500px] space-y-5">
        <div className="space-y-2 px-1">
          {clubInfo && (
            <div className="flex items-center gap-3 lg:hidden mb-2">
              <div className="relative h-10 w-10">
                <Image
                  src={clubInfo.logo_url || clubLogoDefault}
                  alt={clubInfo.name}
                  fill
                  className="object-contain rounded"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {clubInfo.name}
                </span>
              </div>
            </div>
          )}
          <OnboardingResumeCard />

          <PageHeading
            title="Dashboard"
            subtitle={
              clubInfo
                ? `Benvenuto nella dashboard di ${clubInfo.name}`
                : "Benvenuto nella dashboard di gestione del tuo club sportivo."
            }
            className="px-0"
          />
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-5">
          <div className="space-y-5">
            {/*
              `minmax(0,1fr)` anche a una colonna sola, e `min-w-0` sui figli.

              Senza, la traccia implicita del grid vale `auto` e rispetta la
              larghezza **minima del contenuto**: a 375 px il riquadro degli
              allenamenti chiedeva 396 px dentro una colonna da 317, usciva di
              cinquanta pixel e veniva **tagliato** da `overflow-x-hidden`
              della main — non nascosto dietro uno scorrimento, proprio
              tagliato via. Su un telefono era un ottavo della schermata, e
              intere schede laterali finivano fuori.
            */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-100/80 p-3 md:p-4">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
                  <div className="h-[420px] rounded-lg bg-white p-3 shadow-sm xl:h-[440px]">
                    <UpcomingTrainings
                      isLoading={isLoading}
                      trainings={[]}
                      organizationId={clubId}
                      showEmptyState={false}
                      maxHeight="390px"
                      variant="embedded"
                    />
                  </div>

                  <div className="flex h-[320px] min-h-0 overflow-hidden rounded-lg bg-white p-3 shadow-sm">
                    <CertificationAlerts
                      isLoading={isLoading}
                      alerts={certificateAlerts}
                      source="provided"
                      variant="embedded"
                      maxHeight="290px"
                    />
                  </div>
                </div>
              </div>

              <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <DashboardSideCard
                  title="Gare"
                  count={todayMatches.length}
                  description="Prossime gare"
                  accent="bg-gradient-to-br from-orange-500 via-orange-500 to-rose-500"
                  icon={<Trophy className="h-5 w-5" />}
                  onClick={() => router.push("/matches")}
                  items={matchItems}
                  emptyText="Nessuna gara in programma"
                />

                <DashboardSideCard
                  title="Appuntamenti"
                  count={todayAppointments.length}
                  description="Agenda"
                  accent="bg-gradient-to-br from-violet-500 via-fuchsia-500 to-purple-600"
                  icon={<Calendar className="h-5 w-5" />}
                  onClick={() => router.push("/secretariat")}
                  items={appointmentItems}
                  emptyText="Nessun appuntamento in agenda"
                />

                <DashboardSideCard
                  title="Promemoria"
                  count={todayNotes.length}
                  description="Note attive"
                  accent="bg-gradient-to-br from-lime-500 via-emerald-500 to-green-600"
                  icon={<Bell className="h-5 w-5" />}
                  onClick={() => router.push("/secretariat")}
                  items={reminderItems}
                  emptyText="Nessun promemoria attivo"
                />
              </aside>
            </div>
          </div>
        </section>

        {/*
          Le metriche arrivano dai dati gia letti: prima questo componente
          rileggeva tutti gli atleti con il `data` intero — due volte, e la
          seconda non la usava nessuno — solo per contarli.
        */}
        <MetricsOverview
          isLoading={isLoading}
          totalAthletes={metrics.totalAthletes}
          activeCategories={metrics.activeCategories}
          upcomingTrainings={metrics.upcomingTrainings}
          expiringCertificates={metrics.expiringCertificates}
          expiredCertificates={metrics.expiredCertificates}
        />
      </div>
    </div>
  );
}
