"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { getClubAthletes, getClubData } from "@/lib/simplified-db";
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

  useEffect(() => {
    // Get club ID from URL query parameter or active organization
    const getClubId = async () => {
      try {
        // First check URL query parameter - check both clubId and organizationId
        const searchParams = new URLSearchParams(window.location.search);
        const urlClubId =
          searchParams?.get("clubId") || searchParams?.get("organizationId");

        if (urlClubId) {
          setClubId(urlClubId);
          await fetchClubInfo(urlClubId);
          setIsLoading(false);
          return;
        }

        // Then check localStorage for active club
        const activeClub = localStorage.getItem("activeClub");
        if (activeClub) {
          try {
            const parsedClub = JSON.parse(activeClub);
            if (parsedClub.id) {
              setClubId(parsedClub.id);
              await fetchClubInfo(parsedClub.id);
              setIsLoading(false);
              return;
            }
          } catch (e) {
            console.error("Error parsing active club:", e);
          }
        }

        // If no club found, set loading to false
        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching club ID:", error);
        setIsLoading(false);
      }
    };

    const fetchClubInfo = async (organizationId: string) => {
      try {
        // Try organizations table first (new structure)
        let { data: organization } = await supabase
          .from("organizations")
          .select("id, name, logo_url")
          .eq("id", organizationId)
          .single();

        // If not found in organizations, try clubs table (legacy structure)
        if (!organization) {
          const { data: club } = await supabase
            .from("clubs")
            .select("id, name, logo_url")
            .eq("id", organizationId)
            .single();

          if (club) {
            organization = {
              id: club.id,
              name: club.name,
              logo_url: club.logo_url,
            };
          }
        }

        if (organization) {
          const existingActiveClub =
            typeof window !== "undefined"
              ? window.localStorage.getItem("activeClub")
              : null;
          const parsedActiveClub =
            existingActiveClub && existingActiveClub.trim()
              ? (() => {
                  try {
                    return JSON.parse(existingActiveClub);
                  } catch {
                    return {};
                  }
                })()
              : {};

          const clubData = {
            ...parsedActiveClub,
            id: organization.id,
            name: organization.name,
            logo_url: organization.logo_url || undefined,
          };

          setClubInfo(clubData);

          // Update localStorage with club info
          localStorage.setItem("activeClub", JSON.stringify(clubData));
          localStorage.setItem("organization-name", organization.name);

          // Dispatch custom event to notify other components
          if (typeof window !== "undefined") {
            const event = new CustomEvent("club-updated", {
              detail: { clubData },
            });
            window.dispatchEvent(event);
          }

          // Load upcoming appointments, active reminders and upcoming matches
          await loadTodayData(organization.id);
        }
      } catch (error) {
        console.error("Error fetching club info:", error);
      }
    };

    const loadTodayData = async (orgId: string) => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Load appointments
        const appointmentsData = await getClubData(orgId, "appointments");
        if (Array.isArray(appointmentsData)) {
          const todayApps = appointmentsData
            .filter((app: any) => {
              const appDate = new Date(app.date);
              appDate.setHours(0, 0, 0, 0);
              return appDate >= today;
            })
            .map((app: any) => ({
              ...app,
              date: new Date(app.date),
            }))
            .sort((left: Appointment, right: Appointment) => {
              const byDate = left.date.getTime() - right.date.getTime();
              return byDate || left.time.localeCompare(right.time);
            });
          setTodayAppointments(todayApps);
        }

        // Load notes/reminders
        const notesData = await getClubData(orgId, "secretariat_notes");
        if (Array.isArray(notesData)) {
          const activeNotes = notesData
            .filter((note: any) => {
              if (!note.expiryDate) return true;
              const expiryDate = new Date(note.expiryDate);
              return expiryDate >= today;
            })
            .map((note: any) => ({
              ...note,
              date: new Date(note.date),
              expiryDate: note.expiryDate
                ? new Date(note.expiryDate)
                : undefined,
            }));
          setTodayNotes(activeNotes);
        }

        // Load matches
        const matchesData = await getClubData(orgId, "matches");
        if (Array.isArray(matchesData)) {
          const todayMatchesList = matchesData
            .filter((match: any) => {
              const matchDate = new Date(match.date);
              matchDate.setHours(0, 0, 0, 0);
              return matchDate >= today && match.status !== "cancelled";
            })
            .map((match: any) => ({
              ...match,
              date: new Date(match.date),
            }))
            .sort((left: Match, right: Match) => {
              const byDate = left.date.getTime() - right.date.getTime();
              return byDate || left.time.localeCompare(right.time);
            });
          setTodayMatches(todayMatchesList);
        }

        const athletesData = await getClubAthletes(orgId);
        setClubAthletes(Array.isArray(athletesData) ? athletesData : []);
      } catch (error) {
        console.warn("Error loading today's data:", error);
      }
    };

    getClubId();
  }, [router]);

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
                      alerts={[]}
                      organizationId={clubId}
                      showEmptyState={false}
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

        <MetricsOverview
          isLoading={isLoading}
          organizationId={clubId}
          showEmptyState={false}
        />
      </div>
    </div>
  );
}
