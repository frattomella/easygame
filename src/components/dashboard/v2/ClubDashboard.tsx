"use client";

import * as React from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { DashboardPageContainer } from "@/components/dashboard/dashboard-page-container";
import { OnboardingResumeCard } from "@/components/dashboard/onboarding-resume-card";
import { Eyebrow, SkyProvider } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { AlertBlock } from "@/components/web/page/Alerts";
import { formatDateEyebrow, joinMeta } from "@/lib/web/format";
import {
  buildCertificateAlerts,
  buildDashboardMetrics,
  loadClubDashboardOverview,
  selectActiveNotes,
  selectUpcomingAppointments,
  selectUpcomingMatches,
  type ClubDashboardOverview,
} from "@/lib/dashboard/club-overview";
import { DashboardKpiBar } from "@/components/dashboard/v2/DashboardKpiBar";
import { CertificateAlertCards } from "@/components/dashboard/v2/CertificateAlertCards";
import { TodayTrainingsPanel } from "@/components/dashboard/v2/TodayTrainingsPanel";
import {
  ActiveNotesPanel,
  UpcomingAppointmentsPanel,
  UpcomingMatchesPanel,
} from "@/components/dashboard/v2/DayRail";
import { useTodayTrainings } from "@/components/dashboard/v2/today-trainings";
import {
  buildGreetingSummary,
  countWeekendMatches,
  greetingName,
  greetingWord,
} from "@/components/dashboard/v2/dashboard-facts";

/**
 * La Dashboard del club, Web V2 (guideline 09 §9.7, ambiente 2).
 *
 * Risponde a due domande, in quest'ordine: **che cosa ha bisogno di me?** e
 * **che cosa succede oggi?** Tutto il resto e un link a un modulo.
 *
 * - blocco di saluto sul cielo (occhiello data · club · stagione, saluto,
 *   una riga di fatti);
 * - barra KPI a cavallo dell'orizzonte;
 * - a sinistra la coda di lavoro: ripresa dell'onboarding, le card di avviso
 *   in ordine di gravita, poi «Oggi in palestra»;
 * - a destra la colonna del giorno: prossime gare, appuntamenti, promemoria.
 *
 * I dati sono gli stessi della V1: **una** lettura parallela con
 * `loadClubDashboardOverview` (club + atleti in proiezione `summary` +
 * certificati), da cui metriche, avvisi e le tre liste si **ricavano** senza
 * altre richieste; gli allenamenti di oggi li legge `useTodayTrainings` come
 * faceva il riquadro V1. La stessa schermata la disegnano `/dashboard` e la
 * rotta legacy `/dashboard/<id>`, che il completamento dell'invito raggiunge
 * ancora.
 */
type ClubInfo = { id: string; name: string; logo_url?: string };

const resolveClubId = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const fromUrl = searchParams.get("clubId") || searchParams.get("organizationId");
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
    window.dispatchEvent(new CustomEvent("club-updated", { detail: { clubData: merged } }));
  } catch (error) {
    console.error("Error syncing active club:", error);
  }
};

export function ClubDashboard() {
  const { user, activeClub } = useAuth();
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [clubId, setClubId] = React.useState<string | null>(null);
  const [clubInfo, setClubInfo] = React.useState<ClubInfo | null>(null);
  const [overview, setOverview] = React.useState<ClubDashboardOverview | null>(null);

  /*
    Una lettura sola, in parallelo, all'apertura (RC Fix 1, punto 11): la
    misura sta in `scripts/measure-dashboard-performance.mjs` e la lettura in
    `@/lib/dashboard/club-overview`.
  */
  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const activeClubId = resolveClubId();
      if (!activeClubId) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      if (!cancelled) {
        setClubId(activeClubId);
        setIsLoading(true);
        setLoadError(false);
      }

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
      } catch (error) {
        console.warn("Error loading dashboard data:", error);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = React.useCallback(() => setAttempt((value) => value + 1), []);

  const metrics = React.useMemo(
    () =>
      buildDashboardMetrics({
        club: overview?.club || null,
        athletes: overview?.athletes || [],
        certificates: overview?.certificates || [],
      }),
    [overview],
  );
  const certificateAlerts = React.useMemo(
    () =>
      buildCertificateAlerts({
        athletes: overview?.athletes || [],
        certificates: overview?.certificates || [],
      }),
    [overview],
  );
  const upcomingMatches = React.useMemo(
    () => selectUpcomingMatches(overview?.club?.matches || []),
    [overview],
  );
  const upcomingAppointments = React.useMemo(
    () => selectUpcomingAppointments(overview?.club?.appointments || []),
    [overview],
  );
  const activeNotes = React.useMemo(
    () => selectActiveNotes(overview?.club?.notes || []),
    [overview],
  );

  const loadedTrainings = useTodayTrainings(clubId);
  /*
    Il club si risolve nel primo effetto, un giro dopo il primo disegno: senza
    questo, il riquadro mostrava per un fotogramma «nessun allenamento» prima
    ancora di sapere quale club leggere.
  */
  const todayTrainings = React.useMemo(
    () => ({ ...loadedTrainings, loading: isLoading || loadedTrainings.loading }),
    [isLoading, loadedTrainings],
  );

  const clubName = clubInfo?.name || activeClub?.name || "";
  const seasonLabel: string | null = activeClub?.activeSeasonLabel || null;
  const name = greetingName(user);
  const summary = buildGreetingSummary({
    trainingsToday: todayTrainings.trainings.length,
    weekendMatches: countWeekendMatches(upcomingMatches),
    expiringCertificates: metrics.expiringCertificates,
  });
  const factsReady = !isLoading && !todayTrainings.loading && !loadError;

  return (
    <DashboardPageContainer className="gap-5">
      {/* ── Blocco di saluto, sul cielo ─────────────────────────────── */}
      <header className="pt-1">
        <Eyebrow tone="white" as="p" className="text-[11px]">
          {joinMeta(formatDateEyebrow(new Date()), clubName, seasonLabel ? `Stagione ${seasonLabel}` : null)}
        </Eyebrow>
        <h1 className="mt-3 font-brand text-[34px] font-extrabold leading-[1.05] tracking-[var(--egw-track-display)] text-white">
          {name ? `${greetingWord()}, ${name}` : greetingWord()}
        </h1>
        {factsReady ? (
          <p className="egw-num mt-2 font-brand text-[13.5px] leading-[1.5] text-white/80">{summary}</p>
        ) : (
          <Skeleton className="mt-3 h-4 w-[min(100%,420px)]" style={{ background: "rgba(255,255,255,.25)" }} />
        )}
      </header>

      {/* ── Barra KPI a cavallo dell'orizzonte ───────────────────────── */}
      <DashboardKpiBar
        metrics={metrics}
        trainingsToday={todayTrainings.trainings.length}
        loading={isLoading}
      />

      {loadError ? (
        /* A cavallo dell'orizzonte: il blocco si dichiara sul cielo e resta bianco e leggibile. */
        <SkyProvider>
          <AlertBlock
            severity="danger"
            title="Impossibile caricare la dashboard"
            actions={
              <Button variant="secondary" size="sm" onClick={retry}>
                Riprova
              </Button>
            }
          >
            I dati del club non sono arrivati. Controlla la connessione e riprova.
          </AlertBlock>
        </SkyProvider>
      ) : null}

      {/* ── Coda di lavoro (2fr) e colonna del giorno (1fr) ───────────── */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 laptop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <OnboardingResumeCard />
          {isLoading ? (
            <div className="rounded-egw-panel border border-egw-panel-border bg-egw-panel p-5 shadow-egw-plane-1" aria-busy="true">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-2/3" />
              <Skeleton className="mt-2 h-3.5 w-1/2" />
              <Skeleton className="mt-4 h-11 w-full" />
              <Skeleton className="mt-2 h-11 w-full" />
            </div>
          ) : (
            <>
              <CertificateAlertCards alerts={certificateAlerts} clubId={clubId} />
              {!loadError && certificateAlerts.length === 0 ? (
                <AlertBlock severity="info" role="status" title="Nessun avviso sui certificati">
                  Gli avvisi sui certificati in scadenza appariranno qui.
                </AlertBlock>
              ) : null}
            </>
          )}
          <TodayTrainingsPanel state={todayTrainings} clubId={clubId} />
        </div>

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-3 laptop:grid-cols-1" aria-label="La giornata">
          <UpcomingMatchesPanel
            matches={upcomingMatches}
            athletes={overview?.athletes || []}
            loading={isLoading}
          />
          <UpcomingAppointmentsPanel appointments={upcomingAppointments} loading={isLoading} />
          <ActiveNotesPanel notes={activeNotes} loading={isLoading} />
        </aside>
      </div>
    </DashboardPageContainer>
  );
}
