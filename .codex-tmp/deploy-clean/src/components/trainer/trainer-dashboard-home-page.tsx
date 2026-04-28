"use client";

import {
  Bell,
  CalendarDays,
  Dumbbell,
  FolderKanban,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  ActionLinkButton,
  CompactEntityCard,
  FeatureHighlightCard,
  SectionBlockedState,
  SectionEmptyState,
  SummaryCard,
  SurfacePanel,
  formatDate,
  formatTimeRange,
  getAthleteDisplayName,
  getAthleteMedicalExpiry,
  getStatusBadgeClasses,
} from "@/components/trainer/trainer-dashboard-shared";
import {
  getTrainerEndOfWeek,
  getRecordDisplayCategory,
  isSameTrainerDay,
} from "@/lib/trainer-dashboard-helpers";

export default function TrainerDashboardHomePage() {
  const router = useRouter();
  const {
    assignedAthletes,
    assignedCategories,
    permissions,
    trainerProfile,
    visibleMatches,
    visibleTrainings,
  } = useTrainerDashboard();

  if (!permissions.navigation.home) {
    return <SectionBlockedState section="home" />;
  }

  const now = new Date();
  const endOfWeek = getTrainerEndOfWeek(now);

  const todayTrainings = visibleTrainings.filter((training) =>
    isSameTrainerDay(training?.startsAt, now),
  );
  const todayMatches = visibleMatches.filter((match) =>
    isSameTrainerDay(match?.startsAt, now),
  );
  const weekTrainings = visibleTrainings
    .filter(
      (training) =>
        training?.startsAt &&
        training.startsAt >= now &&
        training.startsAt <= endOfWeek &&
        !isSameTrainerDay(training.startsAt, now),
    )
    .slice(0, 4);
  const weekMatches = visibleMatches
    .filter(
      (match) =>
        match?.startsAt &&
        match.startsAt >= now &&
        match.startsAt <= endOfWeek &&
        !isSameTrainerDay(match.startsAt, now),
    )
    .slice(0, 4);
  const highlightedAthletes = assignedAthletes.slice(0, 6);
  const expiringMedicalAthletes = assignedAthletes
    .filter((athlete) => {
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
    })
    .slice(0, 3);

  return (
    <div className="space-y-6 pb-2">
      <div className="space-y-2">
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
          Dashboard
        </h1>
        <p className="text-gray-600">
          Benvenuto nella tua area tecnica, {trainerProfile?.name || "Allenatore"}.
          Qui trovi solo le attivita consentite dal club e collegate alle tue
          categorie.
        </p>
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
            label="Categorie assegnate"
            value={assignedCategories.length}
            accentClassName="bg-emerald-50 text-emerald-600"
            topBarClassName="from-emerald-500 to-emerald-600"
          />
          <SummaryCard
            icon={Dumbbell}
            label="Allenamenti visibili"
            value={visibleTrainings.length}
            accentClassName="bg-orange-50 text-orange-600"
            topBarClassName="from-orange-500 to-orange-600"
          />
          <SummaryCard
            icon={Trophy}
            label="Gare visibili"
            value={visibleMatches.length}
            accentClassName="bg-rose-50 text-rose-600"
            topBarClassName="from-rose-500 to-rose-600"
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {permissions.widgets.upcomingTrainings || permissions.navigation.trainings ? (
          <FeatureHighlightCard
            tone="violet"
            title="Allenamenti di Oggi"
            count={todayTrainings.length}
            icon={CalendarDays}
            footer={
              <Button
                variant="secondary"
                className="w-full border-0 bg-transparent text-white hover:bg-transparent"
                onClick={() => router.push("/trainer-dashboard/trainings")}
              >
                Vai agli Allenamenti
              </Button>
            }
          >
            {todayTrainings.length > 0 ? (
              <div className="space-y-3">
                {todayTrainings.slice(0, 3).map((training) => (
                  <div
                    key={training.id}
                    className="rounded-lg bg-white/10 p-3 backdrop-blur-sm"
                  >
                    <p className="font-medium">{training.title || "Allenamento"}</p>
                    <p className="mt-1 text-sm text-white/80">
                      {formatTimeRange(training.time, training.endTime)}
                    </p>
                    <p className="text-sm text-white/80">
                      {training.displayCategory || training.category || "Categoria"}
                    </p>
                  </div>
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

        {permissions.widgets.upcomingMatches || permissions.navigation.matches ? (
          <FeatureHighlightCard
            tone="orange"
            title="Gare di Oggi"
            count={todayMatches.length}
            icon={Trophy}
            footer={
              <Button
                variant="secondary"
                className="w-full border-0 bg-transparent text-white hover:bg-transparent"
                onClick={() => router.push("/trainer-dashboard/matches")}
              >
                Vai alle Gare
              </Button>
            }
          >
            {todayMatches.length > 0 ? (
              <div className="space-y-3">
                {todayMatches.slice(0, 3).map((match) => (
                  <div
                    key={match.id}
                    className="rounded-lg bg-white/10 p-3 backdrop-blur-sm"
                  >
                    <p className="font-medium">{match.title || "Gara"}</p>
                    <p className="mt-1 text-sm text-white/80">
                      vs {match.opponent || "Avversario da definire"}
                    </p>
                    <p className="text-sm text-white/80">
                      {formatTimeRange(match.time)}
                    </p>
                  </div>
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
          title="Permessi e Alert"
          count={expiringMedicalAthletes.length}
          icon={Bell}
          footer={
            <Button
              variant="secondary"
              className="w-full border-0 bg-transparent text-white hover:bg-transparent"
              onClick={() => router.push("/trainer-dashboard/athletes")}
            >
              Apri il Roster
            </Button>
          }
        >
          <div className="space-y-3">
            {permissions.actions.manageAttendance ? (
              <div className="rounded-lg bg-white/10 px-3 py-2 text-sm backdrop-blur-sm">
                Presenze abilitate
              </div>
            ) : null}
            {permissions.actions.manageConvocations ? (
              <div className="rounded-lg bg-white/10 px-3 py-2 text-sm backdrop-blur-sm">
                Convocazioni abilitate
              </div>
            ) : null}
            <div className="rounded-lg bg-white/10 px-3 py-2 text-sm backdrop-blur-sm">
              {expiringMedicalAthletes.length > 0
                ? `${expiringMedicalAthletes.length} atleti con certificato in scadenza`
                : "Nessun alert medico immediato"}
            </div>
          </div>
        </FeatureHighlightCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {permissions.widgets.upcomingTrainings ? (
          <SurfacePanel
            title="Allenamenti della Settimana"
            description="Gli allenamenti assegnati da oggi fino a fine settimana."
            icon={Dumbbell}
            action={
              <ActionLinkButton
                href="/trainer-dashboard/trainings"
                label="Apri allenamenti"
              />
            }
          >
            {weekTrainings.length === 0 ? (
              <SectionEmptyState
                title="Nessun altro allenamento questa settimana"
                description="Quando il club aggiorna il calendario, qui trovi subito i prossimi slot."
              />
            ) : (
              <div className="space-y-3">
                {weekTrainings.map((training) => {
                  const status = getStatusBadgeClasses(
                    training?.status,
                    training?.startsAt,
                    training?.endsAt,
                  );

                  return (
                    <CompactEntityCard
                      key={training.id}
                      title={training.title || "Allenamento"}
                      badge={
                        <Badge className={status.className}>{status.label}</Badge>
                      }
                      lines={[
                        <span key="category">
                          {training.displayCategory || training.category || "Categoria"}
                        </span>,
                        <span key="date">
                          {formatDate(training.date)} ·{" "}
                          {formatTimeRange(training.time, training.endTime)}
                        </span>,
                        <span key="location">
                          {permissions.actions.viewTrainingDetails
                            ? training.location || "Luogo da definire"
                            : "Dettagli luogo non visibili"}
                        </span>,
                      ]}
                    />
                  );
                })}
              </div>
            )}
          </SurfacePanel>
        ) : null}

        <div className="space-y-6">
          {permissions.widgets.upcomingMatches ? (
            <SurfacePanel
              title="Gare della Settimana"
              description="Le prossime gare in ordine cronologico."
              icon={Trophy}
              action={
                <ActionLinkButton
                  href="/trainer-dashboard/matches"
                  label="Apri gare"
                />
              }
            >
              {weekMatches.length === 0 ? (
                <SectionEmptyState
                  title="Nessuna gara nel breve periodo"
                  description="Appena una gara rientra in agenda la vedi qui."
                />
              ) : (
                <div className="space-y-3">
                  {weekMatches.map((match) => {
                    const status = getStatusBadgeClasses(
                      match?.status,
                      match?.startsAt,
                      match?.startsAt,
                    );

                    return (
                      <CompactEntityCard
                        key={match.id}
                        title={match.title || "Gara"}
                        badge={
                          <Badge className={status.className}>{status.label}</Badge>
                        }
                        lines={[
                          <span key="opponent">
                            vs {match.opponent || "Avversario da definire"}
                          </span>,
                          <span key="date">
                            {formatDate(match.date)} · {formatTimeRange(match.time)}
                          </span>,
                          <span key="category">
                            {match.displayCategory || match.category || "Categoria"}
                          </span>,
                        ]}
                      />
                    );
                  })}
                </div>
              )}
            </SurfacePanel>
          ) : null}

          {permissions.widgets.assignedCategories ? (
            <SurfacePanel
              title="Categorie Assegnate"
              description="Le categorie realmente collegate al tuo profilo trainer."
              icon={FolderKanban}
              action={
                <ActionLinkButton
                  href="/trainer-dashboard/categories"
                  label="Apri categorie"
                />
              }
            >
              {assignedCategories.length === 0 ? (
                <SectionEmptyState
                  title="Nessuna categoria collegata"
                  description="Se qui non vedi card, il club deve assegnarti la categoria dal profilo allenatore."
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignedCategories.map((category) => (
                    <Badge
                      key={category.id}
                      className="rounded-full border-blue-200 bg-blue-50 px-3 py-2 text-blue-700 hover:bg-blue-50"
                    >
                      {category.name}
                    </Badge>
                  ))}
                </div>
              )}
            </SurfacePanel>
          ) : null}
        </div>
      </div>

      {permissions.widgets.assignedAthletes ? (
        <SurfacePanel
          title="Lista Giocatori"
          description="Anteprima del roster tecnico delle categorie assegnate."
          icon={Users}
          action={
            <ActionLinkButton
              href="/trainer-dashboard/athletes"
              label="Apri atleti"
            />
          }
        >
          {highlightedAthletes.length === 0 ? (
            <SectionEmptyState
              title="Nessun atleta assegnato"
              description="Quando il club collega gli atleti alle tue categorie, li vedrai qui."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {highlightedAthletes.map((athlete) => (
                <CompactEntityCard
                  key={athlete.id}
                  title={getAthleteDisplayName(athlete)}
                  badge={
                    <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                      {getRecordDisplayCategory(athlete, assignedCategories)}
                    </Badge>
                  }
                  lines={[
                    <span key="medical">
                      Certificato:{" "}
                      {permissions.actions.viewMedicalStatus
                        ? getAthleteMedicalExpiry(athlete)
                          ? formatDate(getAthleteMedicalExpiry(athlete))
                          : "Non registrato"
                        : "Nascosto"}
                    </span>,
                    <span key="contacts">
                      {permissions.actions.viewAthleteContacts
                        ? athlete?.data?.phone ||
                          athlete?.phone ||
                          athlete?.data?.email ||
                          "-"
                        : "Contatti nascosti"}
                    </span>,
                  ]}
                />
              ))}
            </div>
          )}
        </SurfacePanel>
      ) : null}
    </div>
  );
}
