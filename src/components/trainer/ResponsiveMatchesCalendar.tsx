"use client";

import React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Trophy,
} from "lucide-react";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SectionEmptyState,
  formatDate,
  formatTimeRange,
} from "@/components/trainer/trainer-dashboard-shared";
import { formatMatchLocationLabel } from "@/lib/match-location";
import { getInvalidCertificatesForConvocatedAthletes } from "@/lib/match-certificate-warnings";
import {
  getMatchConvocationLabel,
  getMatchConvocationStatus,
} from "@/lib/trainer-operational-alerts";
import { cn } from "@/lib/utils";

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const getMonthStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const getMonthEnd = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

const toDayKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const getMatchDate = (match: any) => {
  const parsed = match?.startsAt
    ? new Date(match.startsAt)
    : match?.date
      ? new Date(String(match.date))
      : null;

  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

const compareMatches = (left: any, right: any) => {
  const leftDate = getMatchDate(left);
  const rightDate = getMatchDate(right);
  const leftTime = leftDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime || String(left?.time || "").localeCompare(String(right?.time || ""));
};

const buildMonthGrid = (month: Date) => {
  const firstDay = getMonthStart(month);
  const lastDay = getMonthEnd(month);
  const start = new Date(firstDay);
  const startOffset = start.getDay() === 0 ? -6 : 1 - start.getDay();
  start.setDate(start.getDate() + startOffset);

  const days: Date[] = [];
  const cursor = new Date(start);

  while (days.length < 42) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const lastVisible = days[days.length - 1];
  if (lastVisible < lastDay) {
    while (days.length < 49) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return days;
};

function MatchAgendaItem({
  match,
  athletes,
  totalAthletes,
  deadlineDays,
  onSelectMatch,
  showConvocationSummary = true,
}: {
  match: any;
  athletes: any[];
  totalAthletes: number;
  deadlineDays: number;
  onSelectMatch: (match: any) => void;
  showConvocationSummary?: boolean;
}) {
  const convocationStatus = getMatchConvocationStatus({
    match,
    totalAthletes,
    deadlineDays,
  });
  const certificateWarning = getInvalidCertificatesForConvocatedAthletes(
    match,
    athletes,
  );
  const category = match?.displayCategory || match?.category || "Categoria";

  return (
    <button
      type="button"
      onClick={() => onSelectMatch(match)}
      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
              {category}
            </Badge>
            <span className="text-xs font-medium text-slate-500">
              {formatTimeRange(match?.time)}
            </span>
            <MatchCertificateWarningBadge
              warning={certificateWarning}
              compact
            />
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-slate-950">
            {match?.opponent
              ? `vs ${match.opponent}`
              : match?.title || "Gara"}
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500">
            {formatMatchLocationLabel(match)}
          </p>
        </div>
        {showConvocationSummary ? (
          <div className="shrink-0 rounded-xl bg-slate-50 px-2 py-1 text-right text-xs text-slate-600">
            <div className="font-semibold">
              {convocationStatus.convocated}/{convocationStatus.total}
            </div>
            <div>{getMatchConvocationLabel(convocationStatus.state)}</div>
          </div>
        ) : null}
      </div>
    </button>
  );
}

export function ResponsiveMatchesCalendar({
  matches,
  athletes,
  getMatchAthletes,
  deadlineDays,
  onSelectMatch,
}: {
  matches: any[];
  athletes: any[];
  getMatchAthletes: (match: any) => any[];
  deadlineDays: number;
  onSelectMatch: (match: any) => void;
}) {
  const [visibleMonth, setVisibleMonth] = React.useState(() => new Date());
  const sortedMatches = React.useMemo(
    () => [...(Array.isArray(matches) ? matches : [])].sort(compareMatches),
    [matches],
  );
  const monthDays = React.useMemo(
    () => buildMonthGrid(visibleMonth),
    [visibleMonth],
  );
  const matchesByDay = React.useMemo(() => {
    const groups = new Map<string, any[]>();

    sortedMatches.forEach((match) => {
      const matchDate = getMatchDate(match);
      if (!matchDate) {
        return;
      }

      const key = toDayKey(matchDate);
      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key)?.push(match);
    });

    return groups;
  }, [sortedMatches]);
  const monthMatches = React.useMemo(
    () =>
      sortedMatches.filter((match) => {
        const matchDate = getMatchDate(match);
        return (
          matchDate &&
          matchDate.getFullYear() === visibleMonth.getFullYear() &&
          matchDate.getMonth() === visibleMonth.getMonth()
        );
      }),
    [sortedMatches, visibleMonth],
  );
  const monthLabel = visibleMonth.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const goToPreviousMonth = () =>
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
    );
  const goToNextMonth = () =>
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
    );

  if (sortedMatches.length === 0) {
    return (
      <SectionEmptyState
        title="Nessuna gara da mostrare"
        description="La vista calendario usa le stesse gare filtrate della lista."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Calendario gare
          </p>
          <h3 className="mt-1 text-xl font-semibold capitalize text-slate-950">
            {monthLabel}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={goToPreviousMonth}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Mese precedente
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleMonth(new Date())}
          >
            Oggi
          </Button>
          <Button variant="outline" size="sm" onClick={goToNextMonth}>
            Mese successivo
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="px-3 py-2 text-xs font-semibold text-slate-500">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthDays.map((day) => {
            const key = toDayKey(day);
            const dayMatches = matchesByDay.get(key) || [];
            const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
            const isToday = key === toDayKey(new Date());

            return (
              <div
                key={key}
                className={cn(
                  "min-h-[160px] border-b border-r border-slate-100 p-2",
                  !isCurrentMonth && "bg-slate-50/60 text-slate-400",
                  isToday && "bg-blue-50/60",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                      isToday ? "bg-blue-600 text-white" : "text-slate-700",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayMatches.length > 0 ? (
                    <span className="text-xs text-slate-400">
                      {dayMatches.length}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {dayMatches.slice(0, 3).map((match) => (
                    <MatchAgendaItem
                      key={match.id}
                      match={match}
                      athletes={athletes}
                      totalAthletes={getMatchAthletes(match).length}
                      deadlineDays={deadlineDays}
                      onSelectMatch={onSelectMatch}
                      showConvocationSummary={false}
                    />
                  ))}
                  {dayMatches.length > 3 ? (
                    <div className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">
                      +{dayMatches.length - 3} altre gare
                    </div>
                  ) : dayMatches.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-2 text-xs text-slate-400">
                      Nessuna gara
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {monthMatches.length === 0 ? (
          <SectionEmptyState
            title="Nessuna gara nel mese"
            description="Cambia mese o modifica la ricerca."
          />
        ) : (
          monthMatches.map((match, index) => {
            const matchDate = getMatchDate(match);
            const previousDate = index > 0 ? getMatchDate(monthMatches[index - 1]) : null;
            const showDateHeader =
              !previousDate ||
              !matchDate ||
              toDayKey(previousDate) !== toDayKey(matchDate);

            return (
              <div key={match.id} className="space-y-2">
                {showDateHeader ? (
                  <div className="flex items-center gap-2 pt-2 text-sm font-semibold text-slate-950">
                    <CalendarDays className="h-4 w-4 text-blue-600" />
                    {matchDate ? formatDate(matchDate) : "Data da definire"}
                  </div>
                ) : null}
                <MatchAgendaItem
                  match={match}
                  athletes={athletes}
                  totalAthletes={getMatchAthletes(match).length}
                  deadlineDays={deadlineDays}
                  onSelectMatch={onSelectMatch}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-blue-600" />
          {monthMatches.length} gare nel mese
        </div>
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-blue-600" />
          Convocazioni nella vista agenda
        </div>
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-blue-600" />
          Agenda mobile per data
        </div>
      </div>
    </div>
  );
}
