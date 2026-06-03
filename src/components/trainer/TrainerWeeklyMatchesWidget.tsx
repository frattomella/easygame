"use client";

import { CalendarDays, Clock3, Trophy } from "lucide-react";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { Badge } from "@/components/ui/badge";
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
              "rounded-2xl border border-slate-200 bg-white p-3",
              isToday && "border-blue-200 bg-blue-50/50",
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl text-sm font-semibold",
                    isToday ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700",
                  )}
                >
                  {day.getDate()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {weekDays[index]}
                  </p>
                  <p className="text-xs text-slate-500">
                    {day.toLocaleDateString("it-IT", {
                      month: "short",
                    })}
                  </p>
                </div>
              </div>
              <CalendarDays className="h-4 w-4 text-slate-400" />
            </div>

            {matchesOfDay.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
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
                      className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-xs font-semibold text-slate-700">
                          {formatTimeRange(match?.time)}
                        </span>
                        <MatchCertificateWarningBadge warning={warning} compact />
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                        {match?.opponent
                          ? `vs ${match.opponent}`
                          : match?.title || "Gara"}
                      </p>
                      <Badge className="mt-2 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50">
                        <Trophy className="mr-1 h-3 w-3" />
                        {match.displayCategory || match.category || "Categoria"}
                      </Badge>
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
