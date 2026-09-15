"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, Eyebrow, Hairline } from "@/components/web/primitives/Surface";
import { Button, IconButton } from "@/components/web/primitives/Button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/web/primitives/Overlays";
import {
  addDays,
  formatWeekdayShort,
  isSameDay,
  monthGridOf,
  weekDaysOf,
} from "@/components/training/v2/training-page-model";

/**
 * Il rail della settimana per le gare (guideline 09 §9.7 «Prossime gare»,
 * stesso pattern del rail degli allenamenti): lun → dom con il numero di
 * gare del giorno in arancio, il giorno scelto evidenziato, la navigazione
 * settimana precedente/successiva, «Vai a oggi» e il calendario del mese in
 * popover — la forma V2 del «Calendario Settimanale» della V1.
 *
 * E una copia di `training/v2/WeekRail` con i conteggi di un solo tipo:
 * quel componente appartiene alla rotta degli allenamenti e nomina le
 * «sedute». Candidato alle fondamenta con un'API `counts` generica.
 *
 * Sotto i 1024px il rail sta sopra le gare e i sette giorni scorrono in riga.
 */
export function MatchWeekRail({
  selectedDate,
  onSelectDate,
  countMatches,
  className,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** Quante gare in quel giorno (tutti gli stati, filtrate dal contesto). */
  countMatches: (date: Date) => number;
  className?: string;
}) {
  const days = React.useMemo(() => weekDaysOf(selectedDate), [selectedDate]);
  const today = React.useMemo(() => new Date(), []);

  return (
    <Panel as="aside" aria-label="Settimana" className={cn("p-4", className)} data-test="match-week-rail">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Settimana</Eyebrow>
        <div className="flex items-center gap-1">
          <IconButton
            aria-label="Settimana precedente"
            variant="row"
            size="xs"
            onClick={() => onSelectDate(addDays(selectedDate, -7))}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            aria-label="Settimana successiva"
            variant="row"
            size="xs"
            onClick={() => onSelectDate(addDays(selectedDate, 7))}
          >
            <ChevronRight />
          </IconButton>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button variant="text" size="xs" onClick={() => onSelectDate(new Date())}>
          Vai a oggi
        </Button>
        <MonthPicker selectedDate={selectedDate} onSelectDate={onSelectDate} countMatches={countMatches} />
      </div>

      <Hairline className="my-3" />

      <ul className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0" role="list">
        {days.map((day) => {
          const selected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, today);
          const matches = countMatches(day);
          return (
            <li key={day.toISOString()} className="shrink-0 lg:shrink">
              <button
                type="button"
                aria-pressed={selected}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${formatWeekdayShort(day)}${matches ? ` · ${matches} ${matches === 1 ? "gara" : "gare"}` : ""}`}
                onClick={() => onSelectDate(day)}
                className={cn(
                  "flex h-[30px] w-full min-w-[88px] items-center justify-between gap-3 rounded-egw-chip border px-2.5 font-brand text-[12px] transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
                  selected
                    ? "border-egw-tint-orange-bd bg-egw-tint-orange font-semibold text-egw-orange"
                    : "border-transparent font-medium text-egw-ink-72 hover:bg-egw-page-100",
                )}
              >
                <span className={cn("capitalize", isToday && !selected && "text-egw-blue-700")}>
                  {formatWeekdayShort(day)}
                </span>
                <span
                  className={cn(
                    "egw-num text-[11.5px] font-bold",
                    matches > 0 ? "text-egw-orange" : selected ? "text-egw-orange" : "text-egw-ink-42",
                  )}
                >
                  {matches > 0 ? `${matches} ${matches === 1 ? "gara" : "gare"}` : "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const WEEKDAY_HEADERS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function MonthPicker({
  selectedDate,
  onSelectDate,
  countMatches,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  countMatches: (date: Date) => number;
}) {
  const [open, setOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );
  React.useEffect(() => {
    if (open) setAnchor(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [open, selectedDate]);

  const cells = React.useMemo(() => monthGridOf(anchor), [anchor]);
  const today = React.useMemo(() => new Date(), []);
  const monthLabel = anchor.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="text" size="xs" icon={<CalendarDays />} aria-label="Apri il calendario del mese">
          Calendario
        </Button>
      </PopoverTrigger>
      <PopoverContent width={300} align="end" aria-label="Calendario del mese">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <IconButton
            aria-label="Mese precedente"
            variant="row"
            size="xs"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </IconButton>
          <span className="font-brand text-[12.5px] font-bold capitalize text-egw-ink">{monthLabel}</span>
          <IconButton
            aria-label="Mese successivo"
            variant="row"
            size="xs"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 gap-1 px-1 text-center font-brand text-[9.5px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
          {WEEKDAY_HEADERS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1 px-1 pb-1">
          {cells.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} className="h-9" aria-hidden />;
            const count = countMatches(day);
            const selected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            return (
              <button
                key={day.toISOString()}
                type="button"
                aria-pressed={selected}
                aria-label={`${day.getDate()} ${monthLabel}${count ? ` · ${count} ${count === 1 ? "gara" : "gare"}` : ""}`}
                onClick={() => {
                  onSelectDate(day);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-9 flex-col items-center justify-center rounded-egw-chip border font-brand text-[12px] transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
                  selected
                    ? "border-transparent bg-egw-navy-800 text-white"
                    : count > 0
                      ? "border-egw-tint-orange-bd bg-egw-tint-orange text-egw-orange hover:bg-white"
                      : "border-transparent text-egw-ink-72 hover:bg-egw-page-100",
                )}
              >
                <span className={cn("egw-num leading-none", isToday && "font-extrabold underline decoration-2 underline-offset-2")}>
                  {day.getDate()}
                </span>
                {count > 0 ? (
                  <span className={cn("egw-num mt-0.5 text-[9px] font-bold leading-none", selected ? "text-white/80" : "text-egw-orange")}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
