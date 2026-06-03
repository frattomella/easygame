"use client";

import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  ListChecks,
  MapPin,
  Trophy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrainerWeeklyMatchesWidget } from "@/components/trainer/TrainerWeeklyMatchesWidget";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  CompactEntityCard,
  SectionBlockedState,
  SectionEmptyState,
  SurfacePanel,
  formatDate,
  formatTimeRange,
  getStatusBadgeClasses,
} from "@/components/trainer/trainer-dashboard-shared";
import {
  compareTrainerRecordsByStart,
  isSameTrainerDay,
} from "@/lib/trainer-dashboard-helpers";
import { getTrainingStableKey } from "@/lib/training-utils";
import { formatMatchLocationLabel } from "@/lib/match-location";
import {
  getMatchConvocationLabel,
  getMatchConvocationStatus,
  getTrainerRecordAthletes,
  getTrainingAttendanceLabel,
  getTrainingAttendanceStatus,
  isTrainingMissingAttendance,
} from "@/lib/trainer-operational-alerts";
import { getInvalidCertificatesForConvocatedAthletes } from "@/lib/match-certificate-warnings";
import { cn } from "@/lib/utils";

const convocationBadgeClassName = (state: string) => {
  if (state === "convocations_complete") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  if (state === "convocations_missing") {
    return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50";
  }

  return "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50";
};

export default function TrainerDashboardHomeV2Page() {
  const router = useRouter();
  const {
    assignedAthletes,
    assignedCategories,
    categories,
    matchConvocationDeadlineDays,
    operationalAlerts,
    permissions,
    trainerProfile,
    user,
    visibleMatches,
    visibleTrainings,
  } = useTrainerDashboard();

  if (!permissions.navigation.home) {
    return <SectionBlockedState section="home" />;
  }

  const now = new Date();
  const todayTrainings = visibleTrainings
    .filter((training) => isSameTrainerDay(training?.startsAt, now))
    .sort(compareTrainerRecordsByStart);
  const todayMatches = visibleMatches
    .filter((match) => isSameTrainerDay(match?.startsAt, now))
    .sort(compareTrainerRecordsByStart);
  const nextMatches: any[] = [];
  const matchOfTheDay = todayMatches[0] || null;
  const trainerDisplayName =
    trainerProfile?.name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.firstName ||
    user?.email?.split("@")[0] ||
    "Allenatore";
  const trainerFirstName =
    String(trainerDisplayName).trim().split(/\s+/)[0] || "Allenatore";

  const getAthletesForRecord = (record: any) =>
    getTrainerRecordAthletes({
      record,
      assignedAthletes,
      assignedCategories,
      categories,
    });

  return (
    <div className="space-y-6 pb-2">
      <section className="rounded-[30px] border border-slate-200/70 bg-white/95 px-5 py-5 shadow-sm md:px-7">
        <p className="text-xs font-semibold tracking-[0.18em] text-blue-600">
          Home
        </p>
        <h1 className="mt-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold leading-tight tracking-tight text-transparent md:text-4xl">
          Bentornato, {trainerFirstName} 👋
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Hai tutto pronto per presenze e convocazioni.
        </p>
      </section>

      {matchOfTheDay ? (
        <section className="overflow-hidden rounded-[30px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-slate-50 p-5 shadow-sm md:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-5">
              <div>
                <h2 className="text-3xl font-bold leading-tight text-slate-950 md:text-4xl">
                  Gara di oggi
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Trophy className="h-4 w-4" />
                    Categoria
                  </div>
                  <p className="mt-1 font-semibold text-slate-950">
                    {matchOfTheDay.displayCategory ||
                      matchOfTheDay.category ||
                      "Categoria"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Clock3 className="h-4 w-4" />
                    Orario
                  </div>
                  <p className="mt-1 font-semibold text-slate-950">
                    {formatTimeRange(matchOfTheDay.time)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm sm:col-span-2">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <MapPin className="h-4 w-4" />
                    Luogo
                  </div>
                  <p className="mt-1 font-semibold text-slate-950">
                    {formatMatchLocationLabel(matchOfTheDay)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-blue-100 bg-white/90 p-4 shadow-sm">
              {(() => {
                const matchAthletes = getAthletesForRecord(matchOfTheDay);
                const convocationStatus = getMatchConvocationStatus({
                  match: matchOfTheDay,
                  totalAthletes: matchAthletes.length,
                  deadlineDays: matchConvocationDeadlineDays,
                  now,
                });
                const certificateWarning = getInvalidCertificatesForConvocatedAthletes(
                  matchOfTheDay,
                  assignedAthletes,
                );

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-700">
                        Convocazioni
                      </p>
                      <Badge
                        className={cn(
                          "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
                          convocationStatus.state === "convocations_missing"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "",
                        )}
                      >
                        {convocationStatus.convocated}/{convocationStatus.total}
                      </Badge>
                    </div>
                    <MatchCertificateWarningBadge warning={certificateWarning} />
                    <p className="text-xl font-semibold text-slate-950">
                      {getMatchConvocationLabel(convocationStatus.state)}
                    </p>
                    <Button
                      className="w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() =>
                        router.push(
                          `/trainer-dashboard/matches?focus=${matchOfTheDay.id}`,
                        )
                      }
                    >
                      <ListChecks className="mr-2 h-4 w-4" />
                      Gestisci convocazioni
                    </Button>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>
      ) : null}

      {operationalAlerts.length > 0 ? (
        <SurfacePanel
          title="Da completare"
          icon={AlertTriangle}
          className="border-rose-200 bg-rose-50/90 shadow-md"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {operationalAlerts.slice(0, 6).map((alert) => (
              <button
                key={alert.key}
                type="button"
                onClick={() => router.push(alert.actionHref)}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                    {alert.type === "missing_attendance" ? (
                      <ClipboardCheck className="h-4 w-4" />
                    ) : (
                      <ListChecks className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-950">
                      {alert.title}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      {alert.message}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </SurfacePanel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SurfacePanel
          title="Allenamenti di oggi"
          icon={CalendarDays}
          action={
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => router.push("/trainer-dashboard/trainings")}
            >
              Storico
            </Button>
          }
        >
          {todayTrainings.length > 0 ? (
            <div className="space-y-3">
              {todayTrainings.map((training) => {
                const status = getStatusBadgeClasses(
                  training?.status,
                  training?.startsAt,
                  training?.endsAt,
                );
                const trainingAthletes = getAthletesForRecord(training);
                const attendanceStatus = getTrainingAttendanceStatus(
                  training,
                  trainingAthletes,
                );
                const missingAttendance = isTrainingMissingAttendance(
                  training,
                  trainingAthletes,
                  now,
                );

                return (
                  <CompactEntityCard
                    key={getTrainingStableKey(training)}
                    title={training.title || "Allenamento"}
                    className={
                      missingAttendance
                        ? "border-rose-200 bg-rose-50/60"
                        : undefined
                    }
                    badge={
                      <Badge className={status.className}>{status.label}</Badge>
                    }
                    lines={[
                      <span key="category">
                        <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                          {training.displayCategory ||
                            training.category ||
                            "Categoria"}
                        </Badge>
                      </span>,
                      <span key="time">
                        {formatTimeRange(training.time, training.endTime)}
                      </span>,
                      <span key="location">
                        {training.location || "Luogo da definire"}
                      </span>,
                      <span key="attendance" className="font-medium">
                        {attendanceStatus.present}/{attendanceStatus.total} ·{" "}
                        {getTrainingAttendanceLabel(attendanceStatus.state)}
                      </span>,
                    ]}
                    footer={
                      missingAttendance ? (
                        <div className="flex items-center gap-2 text-sm font-medium text-rose-700">
                          <AlertTriangle className="h-4 w-4" />
                          Completa le presenze
                        </div>
                      ) : null
                    }
                    actions={
                      permissions.actions.manageAttendance ? (
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={() =>
                            router.push(
                              `/trainer-dashboard/trainings?focus=${training.id}`,
                            )
                          }
                        >
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          {attendanceStatus.state === "missing"
                            ? "Prendi presenze"
                            : "Modifica presenze"}
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          ) : (
            <SectionEmptyState
              title="Nessun allenamento oggi"
              description="La giornata è libera."
            />
          )}
        </SurfacePanel>

        <SurfacePanel
          title="Agenda gare settimanale"
          icon={Trophy}
          action={
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => router.push("/trainer-dashboard/matches")}
            >
              Apri gare
            </Button>
          }
        >
          <TrainerWeeklyMatchesWidget
            matches={visibleMatches}
            athletes={assignedAthletes}
            onSelectMatch={(match) =>
              router.push(`/trainer-dashboard/matches?focus=${match.id}`)
            }
          />
          <div className="hidden">
          {nextMatches.length > 0 ? (
            <div className="space-y-3">
              {nextMatches.slice(0, 4).map((match) => {
                const matchAthletes = getAthletesForRecord(match);
                const convocationStatus = getMatchConvocationStatus({
                  match,
                  totalAthletes: matchAthletes.length,
                  deadlineDays: matchConvocationDeadlineDays,
                  now,
                });
                const certificateWarning = getInvalidCertificatesForConvocatedAthletes(
                  match,
                  assignedAthletes,
                );

                return (
                  <CompactEntityCard
                    key={match.id}
                    title={match.title || `vs ${match.opponent || "Gara"}`}
                    badge={
                      <Badge
                        className={convocationBadgeClassName(
                          convocationStatus.state,
                        )}
                      >
                        {convocationStatus.convocated}/{convocationStatus.total}
                      </Badge>
                    }
                    lines={[
                      <span key="category">
                        <Badge className="border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50">
                          {match.displayCategory ||
                            match.category ||
                            "Categoria"}
                        </Badge>
                      </span>,
                      <span key="date">
                        {formatDate(match.date)} · {formatTimeRange(match.time)}
                      </span>,
                      <span key="opponent">
                        vs {match.opponent || "Avversario da definire"}
                      </span>,
                      <span key="convocations">
                        {getMatchConvocationLabel(convocationStatus.state)}
                      </span>,
                      ...(certificateWarning.hasInvalidCertificates
                        ? [
                            <span key="certificate-warning">
                              <MatchCertificateWarningBadge warning={certificateWarning} />
                            </span>,
                          ]
                        : []),
                    ]}
                    onClick={() =>
                      router.push(`/trainer-dashboard/matches?focus=${match.id}`)
                    }
                  />
                );
              })}
            </div>
          ) : (
            <SectionEmptyState
              title="Nessuna gara programmata"
              description="Calendario gare vuoto."
            />
          )}
          </div>
        </SurfacePanel>
      </div>

    </div>
  );
}
