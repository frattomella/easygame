"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { DataChip } from "@/components/web/primitives/StatusPill";
import {
  SectionEmptyState,
  formatTimeRange,
} from "@/components/trainer/trainer-dashboard-shared";
import { getInvalidCertificatesForConvocatedAthletes } from "@/lib/match-certificate-warnings";
import { cn } from "@/lib/utils";

const weekDays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const startOfWeek = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const getMatchDate = (match: any) => {
  const parsed = match?.startsAt
    ? new Date(match.startsAt)
    : match?.date
      ? new Date(String(match.date))
      : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

export function TrainerWeeklyMatchesWidget({
  matches,
  athletes,
  onSelectMatch,
}: {
  matches: any[];
  athletes: any[];
  onSelectMatch: (match: any) => void;
}) {
  const today = new Date();
  const weekStart = startOfWeek(today);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const weekMatches = (Array.isArray(matches) ? matches : [])
    .filter((match) => {
      const date = getMatchDate(match);
      return date && date >= weekStart && date < weekEnd;
    })
    .sort((left, right) => {
      const leftTime = getMatchDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = getMatchDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });

  if (weekMatches.length === 0) {
    return (
      <SectionEmptyState
        title="Nessuna gara questa settimana"
        description="La settimana non contiene gare per le tue categorie."
      />
    );
  }

  return (
    <div className="space-y-2">
      {days.map((day, index) => {
        const matchesOfDay = weekMatches.filter((match) => {
          const date = getMatchDate(match);
          return date ? dayKey(date) === dayKey(day) : false;
        });
        const isToday = dayKey(day) === dayKey(today);

        return (
          <div
            key={dayKey(day)}
            className={cn(
              "rounded-egw-panel-sm border border-egw-hairline bg-white p-3",
              isToday && "border-egw-tint-blue-bd bg-egw-tint-blue",
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-egw-field text-sm font-semibold",
                    isToday ? "bg-egw-blue text-white" : "bg-egw-page-100 text-egw-ink-72",
                  )}
                >
                  {day.getDate()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-egw-ink">
                    {weekDays[index]}
                  </p>
                  <p className="text-xs text-egw-ink-62">
                    {day.toLocaleDateString("it-IT", {
                      month: "short",
                    })}
                  </p>
                </div>
              </div>
              <CalendarDays className="h-4 w-4 text-egw-ink-42" />
            </div>

            {matchesOfDay.length === 0 ? (
              <p className="rounded-egw-field border border-dashed border-egw-hairline px-3 py-2 text-xs text-egw-ink-42">
                Nessuna gara
              </p>
            ) : (
              <div className="space-y-2">
                {matchesOfDay.map((match) => {
                  const warning = getInvalidCertificatesForConvocatedAthletes(
                    match,
                    athletes,
                  );

                  return (
                    <button
                      type="button"
                      key={match.id}
                      onClick={() => onSelectMatch(match)}
                      className="w-full rounded-egw-field border border-egw-rule bg-egw-page-100 px-3 py-2 text-left transition hover:border-egw-tint-blue-bd hover:bg-egw-tint-blue"
                    >
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-3.5 w-3.5 text-egw-blue-700" />
                        <span className="text-xs font-semibold text-egw-ink-72">
                          {formatTimeRange(match?.time)}
                        </span>
                        <MatchCertificateWarningBadge warning={warning} compact />
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-egw-ink">
                        {match?.opponent
                          ? `vs ${match.opponent}`
                          : match?.title || "Gara"}
                      </p>
                      <DataChip tone="orange" size="sm" className="mt-2">
                        {match.displayCategory || match.category || "Categoria"}
                      </DataChip>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
