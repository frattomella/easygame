"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ListChecks, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import { MatchConvocations } from "@/components/trainer/MatchConvocations";
import { updateClubDataItem } from "@/lib/simplified-db";
import { useToast } from "@/components/ui/toast-notification";
import {
  CompactEntityCard,
  FeatureHighlightCard,
  SectionBlockedState,
  SectionEmptyState,
  SummaryCard,
  SurfacePanel,
  formatDate,
  formatTimeRange,
  getAthleteDisplayName,
  getStatusBadgeClasses,
} from "@/components/trainer/trainer-dashboard-shared";
import {
  getTrainerEndOfWeek,
  isSameTrainerDay,
  recordMatchesCategory,
} from "@/lib/trainer-dashboard-helpers";
import { formatMatchLocationLabel } from "@/lib/match-location";

export default function TrainerMatchesDashboardPage() {
  const searchParams = useSearchParams();
  const {
    activeClub,
    assignedAthletes,
    assignedCategories,
    categories,
    permissions,
    reload,
    visibleMatches,
  } = useTrainerDashboard();
  const { showToast } = useToast();
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const focusedMatchId = searchParams.get("focus");

  if (!permissions.navigation.matches) {
    return <SectionBlockedState section="matches" />;
  }

  const now = new Date();
  const endOfWeek = getTrainerEndOfWeek(now);
  const todayMatches = visibleMatches.filter((match) =>
    isSameTrainerDay(match?.startsAt, now),
  );
  const weekMatches = visibleMatches.filter(
    (match) =>
      match?.startsAt &&
      match.startsAt >= now &&
      match.startsAt <= endOfWeek &&
      !isSameTrainerDay(match.startsAt, now),
  );
  const futureMatches = visibleMatches.filter(
    (match) => match?.startsAt && match.startsAt > endOfWeek,
  );

  const getMatchAthletes = (match: any) => {
    const matchCategories = assignedCategories.filter((category) =>
      recordMatchesCategory(match, category, categories),
    );

    return assignedAthletes
      .filter((athlete) =>
        matchCategories.some((category) =>
          recordMatchesCategory(athlete, category, categories),
        ),
      )
      .map((athlete) => ({
        id: athlete.id,
        name: getAthleteDisplayName(athlete),
        avatar: athlete?.avatar_url || athlete?.data?.avatar || "",
        medicalCertExpiry:
          athlete?.data?.medicalCertExpiry ||
          athlete?.medical_cert_expiry ||
          athlete?.medicalCertExpiry ||
          null,
      }));
  };

  const renderMatchList = (
    matches: any[],
    emptyTitle: string,
    emptyDescription: string,
  ) => {
    if (matches.length === 0) {
      return (
        <SectionEmptyState
          title={emptyTitle}
          description={emptyDescription}
        />
      );
    }

    return (
      <div className="space-y-3">
        {matches.map((match) => {
          const status = getStatusBadgeClasses(
            match?.status,
            match?.startsAt,
            match?.startsAt,
          );
          const availableAthletes = getMatchAthletes(match);

          return (
            <CompactEntityCard
              key={match.id}
              title={match.title || "Gara"}
              className={
                focusedMatchId === match.id
                  ? "border-blue-300 bg-blue-50/70 shadow-sm"
                  : undefined
              }
              badge={<Badge className={status.className}>{status.label}</Badge>}
              lines={[
                <span key="opponent">
                  vs {match.opponent || "Avversario da definire"}
                </span>,
                <span key="date">
                  {formatDate(match.date)} · {formatTimeRange(match.time)}
                </span>,
                <span key="location">
                  {permissions.actions.viewMatchDetails
                    ? formatMatchLocationLabel(match)
                    : "Dettagli luogo non visibili"}
                </span>,
                <span key="category">
                  {match.displayCategory || match.category || "Categoria"}
                </span>,
                <span key="roster">{availableAthletes.length} atleti convocabili</span>,
              ]}
              actions={
                permissions.actions.manageConvocations ? (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => setSelectedMatch(match)}
                  >
                    <ListChecks className="mr-2 h-4 w-4" />
                    Convocazioni
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-2">
      <div className="space-y-2">
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
          Gare
        </h1>
        <p className="text-gray-600">
          In alto trovi le gare di oggi, sotto il calendario della settimana e le
          gare successive in ordine cronologico.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={Trophy}
          label="Gare visibili"
          value={visibleMatches.length}
          accentClassName="bg-orange-50 text-orange-600"
          topBarClassName="from-orange-500 to-orange-600"
        />
        <SummaryCard
          icon={ListChecks}
          label="Gare di oggi"
          value={todayMatches.length}
          accentClassName="bg-blue-50 text-blue-600"
          topBarClassName="from-blue-500 to-blue-600"
        />
        <SummaryCard
          icon={Trophy}
          label="Convocazioni abilitate"
          value={permissions.actions.manageConvocations ? 1 : 0}
          accentClassName="bg-emerald-50 text-emerald-600"
          topBarClassName="from-emerald-500 to-emerald-600"
        />
      </div>

      <FeatureHighlightCard
        tone="orange"
        title="Gare di Oggi"
        count={todayMatches.length}
        icon={Trophy}
      >
        {todayMatches.length === 0 ? (
          <div className="py-5 text-center text-white/75">
            <Trophy className="mx-auto mb-2 h-10 w-10 opacity-50" />
            <p>Nessuna gara prevista per oggi</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayMatches.map((match) => (
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
                <p className="text-sm text-white/80">
                  {formatMatchLocationLabel(match)}
                </p>
              </div>
            ))}
          </div>
        )}
      </FeatureHighlightCard>

      {visibleMatches.length === 0 ? (
        <SectionEmptyState
          title="Nessuna gara disponibile"
          description="In questa sezione compariranno solo le gare delle tue categorie."
        />
      ) : (
        <div className="space-y-6">
          <SurfacePanel
            title="Gare della Settimana"
            description="Le prossime gare da oggi fino a fine settimana."
            icon={Trophy}
          >
            {renderMatchList(
              weekMatches,
              "Nessuna gara questa settimana",
              "Le nuove gare assegnate dal club compariranno qui.",
            )}
          </SurfacePanel>

          <SurfacePanel
            title="Gare Successive"
            description="Le gare delle settimane successive, ordinate per data."
            icon={Trophy}
          >
            {renderMatchList(
              futureMatches,
              "Nessuna gara futura",
              "Quando il club aggiorna il calendario gare, le vedrai qui.",
            )}
          </SurfacePanel>
        </div>
      )}

      {selectedMatch ? (
        <MatchConvocations
          isOpen={Boolean(selectedMatch)}
          onClose={() => setSelectedMatch(null)}
          matchId={selectedMatch.id}
          matchTitle={selectedMatch.title || "Gara"}
          matchDate={selectedMatch.date}
          matchTime={formatTimeRange(selectedMatch.time)}
          categoryName={
            selectedMatch.displayCategory ||
            selectedMatch.category ||
            "Categoria"
          }
          opponent={selectedMatch.opponent || "Avversario"}
          location={formatMatchLocationLabel(selectedMatch)}
          athletes={getMatchAthletes(selectedMatch)}
          onSave={async ({ convocatedAthletes }) => {
            if (!activeClub?.id) return;
            try {
              await updateClubDataItem(activeClub.id, "matches", selectedMatch.id, {
                convocatedAthletes,
                convocationsStatus: "completed",
              });
              await reload();
              showToast("success", "Convocazioni salvate correttamente");
              setSelectedMatch(null);
            } catch (error) {
              console.error("Error saving convocations:", error);
              showToast("error", "Errore nel salvataggio delle convocazioni");
            }
          }}
          savedConvocations={selectedMatch.convocatedAthletes || []}
        />
      ) : null}
    </div>
  );
}
