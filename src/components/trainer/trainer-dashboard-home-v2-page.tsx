"use client";

import {
  Bell,
  CalendarDays,
  Dumbbell,
  FolderKanban,
  Trophy,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  FeatureHighlightCard,
  SectionBlockedState,
  SummaryCard,
  formatTimeRange,
  getAthleteMedicalExpiry,
} from "@/components/trainer/trainer-dashboard-shared";
import { isSameTrainerDay } from "@/lib/trainer-dashboard-helpers";
import { formatMatchLocationLabel } from "@/lib/match-location";

export default function TrainerDashboardHomeV2Page() {
  const router = useRouter();
  const {
    assignedAthletes,
    assignedCategories,
    permissions,
    trainerProfile,
    visibleMatches,
    visibleReminders,
    visibleTrainings,
  } = useTrainerDashboard();

  if (!permissions.navigation.home) {
    return <SectionBlockedState section="home" />;
  }

  const now = new Date();
  const todayTrainings = visibleTrainings.filter((training) =>
    isSameTrainerDay(training?.startsAt, now),
  );
  const todayMatches = visibleMatches.filter((match) =>
    isSameTrainerDay(match?.startsAt, now),
  );
  const expiringMedicalAthletes = assignedAthletes.filter((athlete) => {
    const expiry = getAthleteMedicalExpiry(athlete);
    if (!expiry) {
      return false;
    }

    const parsed = new Date(String(expiry));
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 30);
    return parsed <= threshold;
  });

  return (
    <div className="space-y-6 pb-2">
      <div className="space-y-2">
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
          Dashboard
        </h1>
        <p className="text-gray-600">
          Benvenuto nella tua area tecnica, {trainerProfile?.name || "Allenatore"}.
          Qui vedi solo quello che il club ti ha abilitato.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {permissions.widgets.todayTrainings !== false ? (
          <FeatureHighlightCard
            tone="violet"
            title="Allenamenti di Oggi"
            count={todayTrainings.length}
            icon={CalendarDays}
            footer={
              <Button
                variant="secondary"
                className="w-full border-0 bg-transparent !text-white hover:!text-white hover:bg-transparent"
                onClick={() => router.push("/trainer-dashboard/trainings")}
              >
                Vai agli Allenamenti
              </Button>
            }
          >
            {todayTrainings.length > 0 ? (
              <div className="space-y-3">
                {todayTrainings.slice(0, 3).map((training) => (
                  <button
                    key={training.id}
                    className="w-full rounded-lg bg-white/10 p-3 text-left backdrop-blur-sm transition hover:bg-white/15"
                    onClick={() =>
                      router.push(`/trainer-dashboard/trainings?focus=${training.id}`)
                    }
                    type="button"
                  >
                    <p className="font-medium">
                      {training.title || "Allenamento"}
                    </p>
                    <p className="mt-1 text-sm text-white/80">
                      {formatTimeRange(training.time, training.endTime)}
                    </p>
                    <p className="text-sm text-white/80">
                      {training.displayCategory || training.category || "Categoria"}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-5 text-center text-white/75">
                <CalendarDays className="mx-auto mb-2 h-10 w-10 opacity-50" />
                <p>Nessun allenamento per oggi</p>
              </div>
            )}
          </FeatureHighlightCard>
        ) : null}

        {permissions.widgets.todayMatches !== false ? (
          <FeatureHighlightCard
            tone="orange"
            title="Gare di Oggi"
            count={todayMatches.length}
            icon={Trophy}
            footer={
              <Button
                variant="secondary"
                className="w-full border-0 bg-transparent !text-white hover:!text-white hover:bg-transparent"
                onClick={() => router.push("/trainer-dashboard/matches")}
              >
                Vai alle Gare
              </Button>
            }
          >
            {todayMatches.length > 0 ? (
              <div className="space-y-3">
                {todayMatches.slice(0, 3).map((match) => (
                  <button
                    key={match.id}
                    className="w-full rounded-lg bg-white/10 p-3 text-left backdrop-blur-sm transition hover:bg-white/15"
                    onClick={() =>
                      router.push(`/trainer-dashboard/matches?focus=${match.id}`)
                    }
                    type="button"
                  >
                    <p className="font-medium">
                      vs {match.opponent || "Avversario da definire"}
                    </p>
                    <p className="mt-1 text-sm text-white/80">
                      {formatTimeRange(match.time)}
                    </p>
                    <p className="text-sm text-white/80">
                      {formatMatchLocationLabel(match)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-5 text-center text-white/75">
                <Trophy className="mx-auto mb-2 h-10 w-10 opacity-50" />
                <p>Nessuna gara per oggi</p>
              </div>
            )}
          </FeatureHighlightCard>
        ) : null}

        <FeatureHighlightCard
          tone="emerald"
          title="Promemoria Attivi"
          count={visibleReminders.length}
          icon={Bell}
          footer={
            <Button
              variant="secondary"
              className="w-full border-0 bg-transparent !text-white hover:!text-white hover:bg-transparent"
              onClick={() => router.push("/trainer-dashboard/profile")}
            >
              Apri il Profilo
            </Button>
          }
        >
          {visibleReminders.length > 0 ? (
            <div className="space-y-3">
              {visibleReminders.slice(0, 3).map((reminder) => (
                <div
                  key={reminder.id}
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm backdrop-blur-sm"
                >
                  <p className="font-medium">{reminder.content || "Promemoria"}</p>
                  <p className="mt-1 text-white/80">
                    {reminder.targetSummary ||
                      (expiringMedicalAthletes.length > 0
                        ? `${expiringMedicalAthletes.length} atleti con alert medico`
                        : "Promemoria attivo")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-white/10 px-3 py-2 text-sm backdrop-blur-sm">
                Presenze {permissions.actions.manageAttendance ? "abilitate" : "nascoste"}
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2 text-sm backdrop-blur-sm">
                Convocazioni{" "}
                {permissions.actions.manageConvocations ? "abilitate" : "nascoste"}
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2 text-sm backdrop-blur-sm">
                {expiringMedicalAthletes.length > 0
                  ? `${expiringMedicalAthletes.length} atleti con alert medico`
                  : "Nessun promemoria attivo"}
              </div>
            </div>
          )}
        </FeatureHighlightCard>
      </div>

      {permissions.widgets.summary ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={Users}
            label="Atleti seguiti"
            value={assignedAthletes.length}
            accentClassName="bg-blue-50 text-blue-600"
            topBarClassName="from-blue-500 to-blue-600"
          />
          <SummaryCard
            icon={FolderKanban}
            label="Categorie attive"
            value={assignedCategories.length}
            accentClassName="bg-emerald-50 text-emerald-600"
            topBarClassName="from-emerald-500 to-emerald-600"
          />
          <SummaryCard
            icon={Dumbbell}
            label="Allenamenti oggi"
            value={todayTrainings.length}
            accentClassName="bg-orange-50 text-orange-600"
            topBarClassName="from-orange-500 to-orange-600"
          />
          <SummaryCard
            icon={Trophy}
            label="Gare oggi"
            value={todayMatches.length}
            accentClassName="bg-rose-50 text-rose-600"
            topBarClassName="from-rose-500 to-rose-600"
          />
        </div>
      ) : null}
    </div>
  );
}
