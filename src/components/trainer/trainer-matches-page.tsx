"use client";

import { useState } from "react";
import { ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import { MatchConvocations } from "@/components/trainer/MatchConvocations";
import { updateClubDataItem } from "@/lib/simplified-db";
import { useToast } from "@/components/ui/toast-notification";
import {
  SectionBlockedState,
  SectionEmptyState,
  formatDate,
  getStatusBadgeClasses,
} from "@/components/trainer/trainer-dashboard-shared";
import { cn } from "@/lib/utils";
import { formatMatchLocationLabel } from "@/lib/match-location";

export default function TrainerMatchesPage() {
  const { activeClub, assignedAthletes, permissions, reload, visibleMatches } =
    useTrainerDashboard();
  const { showToast } = useToast();
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

  if (!permissions.navigation.matches) {
    return <SectionBlockedState section="matches" />;
  }

  if (visibleMatches.length === 0) {
    return (
      <SectionEmptyState
        title="Nessuna gara disponibile"
        description="In questa sezione compariranno solo le gare delle tue categorie."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Gare
        </h1>
        <p className="text-gray-600 mt-2">
          Visualizzi e gestisci solo le gare delle categorie assegnate al trainer.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-orange-500 to-orange-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Gare visibili</p>
            <p className="mt-2 text-3xl font-bold">{visibleMatches.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Convocazioni</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {permissions.actions.manageConvocations ? "Abilitate" : "Disabilitate"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-emerald-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Dettagli gara</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {permissions.actions.viewMatchDetails ? "Visibili" : "Limitati"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[30px] border-white/80 bg-white/90 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">
              Gare assegnate
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Calendario gare del trainer
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              L’elenco è filtrato sulle categorie e sui collegamenti attivi del
              tuo profilo.
            </p>
          </div>
          <Badge
            className={cn(
              "hover:bg-transparent",
              permissions.actions.manageConvocations
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-slate-100 text-slate-600",
            )}
          >
            {permissions.actions.manageConvocations
              ? "Convocazioni abilitate"
              : "Convocazioni disabilitate"}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleMatches.map((match) => {
          const status = getStatusBadgeClasses(
            match?.status,
            match?.startsAt,
            match?.startsAt,
          );

          return (
            <Card
              key={match.id}
              className="bg-white shadow-md border-0 overflow-hidden"
            >
              <div className="h-1 w-full bg-gradient-to-r from-orange-500 to-orange-600"></div>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xl font-semibold text-slate-900">
                      {match.title || "Gara"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {match.category || "Categoria"}
                    </p>
                  </div>
                  <Badge className={status.className}>{status.label}</Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Data</p>
                    <p className="mt-1">{formatDate(match.date)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Orario</p>
                    <p className="mt-1">{String(match.time || "").slice(0, 5) || "-"}</p>
                  </div>
                </div>

                {permissions.actions.viewMatchDetails ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-700">Avversario</p>
                      <p className="mt-1">{match.opponent || "Da definire"}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-700">Luogo</p>
                      <p className="mt-1">
                        {formatMatchLocationLabel(match)}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-700">Atleti convocabili</p>
                  <p className="mt-1">
                    {assignedAthletes.filter((athlete) => {
                      const athleteTokens = [
                        athlete?.data?.category,
                        athlete?.category_id,
                        athlete?.category_name,
                        athlete?.data?.categoryName,
                      ]
                        .map((value) => String(value || "").trim().toLowerCase())
                        .filter(Boolean);

                      return (match?.categoryIds || []).some((categoryId: string) =>
                        athleteTokens.includes(String(categoryId || "").trim().toLowerCase()),
                      );
                    }).length}{" "}
                    atleti
                  </p>
                </div>

                {permissions.actions.manageConvocations ? (
                  <button
                    type="button"
                    onClick={() => setSelectedMatch(match)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    <ListChecks className="h-4 w-4" />
                    Convocazioni
                  </button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedMatch ? (
        <MatchConvocations
          isOpen={Boolean(selectedMatch)}
          onClose={() => setSelectedMatch(null)}
          matchId={selectedMatch.id}
          matchTitle={selectedMatch.title || "Gara"}
          matchDate={selectedMatch.date}
          matchTime={String(selectedMatch.time || "").slice(0, 5)}
          categoryName={selectedMatch.category || "Categoria"}
          opponent={selectedMatch.opponent || "Avversario"}
          location={formatMatchLocationLabel(selectedMatch)}
          athletes={assignedAthletes
            .filter((athlete) => {
              const athleteTokens = [
                athlete?.data?.category,
                athlete?.category_id,
                athlete?.category_name,
                athlete?.data?.categoryName,
              ]
                .map((value) => String(value || "").trim().toLowerCase())
                .filter(Boolean);

              return (selectedMatch?.categoryIds || []).some((categoryId: string) =>
                athleteTokens.includes(String(categoryId || "").trim().toLowerCase()),
              );
            })
            .map((athlete) => ({
              id: athlete.id,
              name:
                `${athlete?.first_name || athlete?.data?.name || ""} ${athlete?.last_name || athlete?.data?.surname || ""}`.trim() ||
                "Atleta",
              avatar: athlete?.avatar_url || athlete?.data?.avatar || "",
              medicalCertExpiry:
                athlete?.data?.medicalCertExpiry ||
                athlete?.medical_cert_expiry ||
                athlete?.medicalCertExpiry ||
                null,
            }))}
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
