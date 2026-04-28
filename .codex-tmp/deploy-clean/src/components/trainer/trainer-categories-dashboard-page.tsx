"use client";

import { Badge } from "@/components/ui/badge";
import { FolderKanban, ShieldCheck, Users } from "lucide-react";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  CompactEntityCard,
  SectionBlockedState,
  SectionEmptyState,
  SummaryCard,
  SurfacePanel,
  getAthleteDisplayName,
} from "@/components/trainer/trainer-dashboard-shared";
import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";

export default function TrainerCategoriesDashboardPage() {
  const {
    assignedAthletes,
    assignedCategories,
    categories,
    permissions,
    visibleMatches,
    visibleTrainings,
  } = useTrainerDashboard();

  if (!permissions.navigation.categories) {
    return <SectionBlockedState section="categories" />;
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="space-y-2">
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
          Categorie
        </h1>
        <p className="text-gray-600">
          Qui trovi le categorie realmente assegnate al trainer, con atleti,
          allenamenti e gare filtrati in modo coerente.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={FolderKanban}
          label="Categorie assegnate"
          value={assignedCategories.length}
          accentClassName="bg-blue-50 text-blue-600"
          topBarClassName="from-blue-500 to-blue-600"
        />
        <SummaryCard
          icon={Users}
          label="Atleti filtrati"
          value={assignedAthletes.length}
          accentClassName="bg-emerald-50 text-emerald-600"
          topBarClassName="from-emerald-500 to-emerald-600"
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Scheda tecnica"
          value={permissions.actions.viewAthleteTechnicalSheet ? 1 : 0}
          accentClassName="bg-orange-50 text-orange-600"
          topBarClassName="from-orange-500 to-orange-600"
        />
      </div>

      <SurfacePanel
        title="Categorie Assegnate"
        description="Le categorie sottostanti sono derivate dal collegamento trainer-club e mostrano subito i roster filtrati."
        icon={FolderKanban}
      >
        {assignedCategories.length === 0 ? (
          <SectionEmptyState
            title="Nessuna categoria assegnata"
            description="Il club deve collegare il trainer ad almeno una categoria per attivare questa sezione."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {assignedCategories.map((category) => {
              const categoryAthletes = assignedAthletes.filter((athlete) =>
                recordMatchesCategory(athlete, category, categories),
              );
              const trainingsCount = visibleTrainings.filter((training) =>
                recordMatchesCategory(training, category, categories),
              ).length;
              const matchesCount = visibleMatches.filter((match) =>
                recordMatchesCategory(match, category, categories),
              ).length;

              return (
                <div
                  key={category.id}
                  className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
                        Categoria assegnata
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                        {category.name}
                      </h2>
                    </div>
                    <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                      Attiva
                    </Badge>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 px-4 py-4">
                      <p className="text-sm text-slate-500">Atleti</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">
                        {categoryAthletes.length}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-4">
                      <p className="text-sm text-slate-500">Allenamenti</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">
                        {trainingsCount}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-4">
                      <p className="text-sm text-slate-500">Gare</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">
                        {matchesCount}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">
                      Lista atleti collegati
                    </p>
                    {categoryAthletes.length === 0 ? (
                      <SectionEmptyState
                        title="Nessun atleta associato"
                        description="Quando il roster della categoria viene popolato, comparira qui."
                      />
                    ) : (
                      <div className="space-y-3">
                        {categoryAthletes.slice(0, 5).map((athlete) => (
                          <CompactEntityCard
                            key={athlete.id}
                            title={getAthleteDisplayName(athlete)}
                            badge={
                              <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                                {category.name}
                              </Badge>
                            }
                            lines={[
                              <span key="detail">
                                {permissions.actions.viewAthleteTechnicalSheet
                                  ? "Scheda tecnica consultabile"
                                  : "Scheda tecnica non visibile"}
                              </span>,
                            ]}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SurfacePanel>
    </div>
  );
}
