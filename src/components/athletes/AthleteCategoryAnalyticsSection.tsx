"use client";

import { CalendarDays, ListChecks, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { membershipRoleLabel } from "@/lib/categories/display";
import type {
  AthleteCategoryAnalytics,
  AthleteCategoryAnalyticsResult,
  AthleteUnclassifiedAnalyticsEvent,
} from "@/lib/athlete-category-analytics";

const formatDate = (value: string | null) => {
  if (!value) {
    return "Data non disponibile";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const statusBadgeClass = (status: string) => {
  const normalized = status.trim().toLowerCase();

  if (normalized === "presente" || normalized === "convocato") {
    return "border-egw-tint-green-bd bg-egw-tint-green text-egw-green hover:bg-egw-tint-green";
  }

  if (normalized === "non registrato" || normalized === "non convocato") {
    return "border-egw-hairline bg-white text-egw-ink-62 hover:bg-white";
  }

  return "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink hover:bg-egw-tint-amber";
};

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 p-3">
      <p className="text-xs font-medium text-egw-ink-62">{label}</p>
      <p className="mt-1 text-xl font-semibold text-egw-ink">{value}</p>
    </div>
  );
}

function RecentEventList({
  title,
  icon: Icon,
  events,
  emptyLabel,
}: {
  title: string;
  icon: typeof CalendarDays;
  events: AthleteCategoryAnalytics["recentTrainings"];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-egw-field border border-egw-hairline bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-egw-blue-700" />
        <h4 className="text-sm font-semibold text-egw-ink">{title}</h4>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-egw-ink-62">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 5).map((event) => (
            <div
              key={event.id}
              className="rounded-egw-control border border-egw-rule bg-egw-page-100 p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-egw-ink">
                    {event.title}
                  </p>
                  <p className="mt-1 text-xs text-egw-ink-62">
                    {formatDate(event.date)}
                  </p>
                  {event.notes ? (
                    <p className="mt-1 text-xs text-egw-ink-72">
                      Note: {event.notes}
                    </p>
                  ) : null}
                </div>
                <Badge
                  variant="outline"
                  className={statusBadgeClass(event.statusLabel)}
                >
                  {event.statusLabel}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnclassifiedEvents({
  events,
}: {
  events: AthleteUnclassifiedAnalyticsEvent[];
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Eventi non classificati</CardTitle>
        <p className="text-sm text-muted-foreground">
          Eventi con presenza o convocazione dell&apos;atleta ma senza categoria
          ricostruibile. Non sono sommati alle statistiche per categoria.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {events.slice(0, 8).map((event) => (
            <div
              key={event.id}
              className="rounded-egw-field border border-dashed border-egw-hairline bg-egw-page-100 p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-egw-ink">
                    {event.title}
                  </p>
                  <p className="text-xs text-egw-ink-62">
                    {event.type === "training" ? "Allenamento" : "Gara"} -{" "}
                    {formatDate(event.date)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={statusBadgeClass(event.statusLabel)}
                >
                  {event.statusLabel}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AthleteCategoryAnalyticsSection({
  analytics,
  categoryLabel,
}: {
  analytics: AthleteCategoryAnalyticsResult;
  /** Come si scrive una categoria (ADR-0185): lo dice la pagina con il suo indice; senza, il nome che l'analisi porta. */
  categoryLabel?: (reference: { categoryId: string; categoryName: string }) => string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Analitiche per categoria</CardTitle>
          <p className="text-sm text-muted-foreground">
            Presenze, convocazioni e storico sono calcolati separando le
            categorie dell&apos;atleta.
          </p>
        </CardHeader>
        <CardContent>
          {analytics.categories.length === 0 ? (
            <div className="rounded-egw-field border border-dashed border-egw-hairline bg-egw-page-100 p-6 text-center text-sm text-muted-foreground">
              Nessuna categoria disponibile per calcolare le analitiche.
            </div>
          ) : (
            <div className="space-y-4">
              {analytics.categories.map((category) => (
                <div
                  key={category.categoryId}
                  className="rounded-egw-panel-sm border border-egw-hairline bg-white p-4 shadow-egw-plane-1"
                >
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-egw-ink">
                        {categoryLabel
                          ? categoryLabel({ categoryId: category.categoryId, categoryName: category.categoryName })
                          : category.categoryName}
                      </h3>
                      <p className="text-sm text-egw-ink-62">
                        {category.isPrimary
                          ? "Categoria primaria"
                          : "Categoria secondaria"}
                      </p>
                    </div>
                    <Badge className="w-fit border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-700 hover:bg-egw-tint-blue">
                      {membershipRoleLabel(Boolean(category.isPrimary))}
                    </Badge>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile
                      label="Presenze / Allenamenti"
                      value={`${category.attendancesPresent}/${category.trainingsTotal}`}
                    />
                    <MetricTile
                      label="Convocazioni / Gare"
                      value={`${category.convocationsTotal}/${category.matchesTotal}`}
                    />
                    <MetricTile
                      label="% Presenza"
                      value={
                        category.trainingsTotal
                          ? `${category.attendanceRate}%`
                          : "-"
                      }
                    />
                    <MetricTile
                      label="% Convocazione"
                      value={
                        category.matchesTotal
                          ? `${category.convocationRate}%`
                          : "-"
                      }
                    />
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <RecentEventList
                      title="Ultimi allenamenti"
                      icon={ListChecks}
                      events={category.recentTrainings}
                      emptyLabel="Nessun allenamento per questa categoria."
                    />
                    <RecentEventList
                      title="Ultime gare"
                      icon={Trophy}
                      events={category.recentMatches}
                      emptyLabel="Nessuna gara per questa categoria."
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <UnclassifiedEvents events={analytics.unclassifiedEvents} />
    </div>
  );
}
