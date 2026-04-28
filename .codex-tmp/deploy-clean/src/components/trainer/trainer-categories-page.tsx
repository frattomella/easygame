"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  CategoryVisibilitySummary,
  SectionBlockedState,
  SectionEmptyState,
} from "@/components/trainer/trainer-dashboard-shared";

export default function TrainerCategoriesPage() {
  const {
    assignedAthletes,
    assignedCategories,
    permissions,
    visibleMatches,
    visibleTrainings,
  } = useTrainerDashboard();

  if (!permissions.navigation.categories) {
    return <SectionBlockedState section="categories" />;
  }

  if (assignedCategories.length === 0) {
    return (
      <SectionEmptyState
        title="Nessuna categoria assegnata"
        description="Il club deve collegare il trainer ad almeno una categoria per attivare questa sezione."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Categorie
        </h1>
        <p className="text-gray-600 mt-2">
          Panoramica delle categorie assegnate al trainer con relativi atleti, allenamenti e gare.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Categorie assegnate</p>
            <p className="mt-2 text-3xl font-bold">{assignedCategories.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-emerald-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Schede atleta</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {permissions.actions.viewAthleteTechnicalSheet ? "Scheda tecnica visibile" : "Scheda tecnica nascosta"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-purple-500 to-purple-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Area medica</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {permissions.actions.viewMedicalStatus ? "Visibile" : "Nascosta"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {assignedCategories.map((category) => {
        const categoryId = String(category?.id || "").trim();
        const athletesCount = assignedAthletes.filter(
          (athlete) =>
            String(athlete?.data?.category || athlete?.category_id || "").trim() ===
            categoryId,
        ).length;
        const trainingsCount = visibleTrainings.filter((training) =>
          Array.isArray(training?.categoryIds)
            ? training.categoryIds.includes(categoryId)
            : false,
        ).length;
        const matchesCount = visibleMatches.filter((match) =>
          Array.isArray(match?.categoryIds)
            ? match.categoryIds.includes(categoryId)
            : false,
        ).length;

        return (
          <Card
            key={category.id}
            className="bg-white shadow-md border-0 overflow-hidden"
          >
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-purple-600"></div>
            <CardContent className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-4">
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

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-sm text-slate-500">Atleti</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {athletesCount}
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

              <CategoryVisibilitySummary
                viewAthleteDetails={permissions.actions.viewAthleteDetails}
                viewAthleteTechnicalSheet={permissions.actions.viewAthleteTechnicalSheet}
                viewAthleteContacts={permissions.actions.viewAthleteContacts}
                viewMedicalStatus={permissions.actions.viewMedicalStatus}
              />
            </CardContent>
          </Card>
        );
      })}
      </div>
    </div>
  );
}
