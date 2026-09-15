"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, Eyebrow, Hairline } from "@/components/web/primitives/Surface";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { InfoCard } from "@/components/web/page/Cards";
import { addDays, formatWeekTitle, formatWeekdayShort, isSameDay, weekDaysOf, type AgendaScope } from "@/components/secretariat/v2/secretariat-model";

/**
 * Il rail dell'agenda (pattern 10, «griglia + rail»): la forma V2 del
 * «Calendario Settimanale» della V1. Sette giorni lun → dom con il numero
 * di appuntamenti vivi per giorno, la navigazione a settimane, «Vai a
 * oggi», e l'ambito di cio che la griglia mostra — il giorno scelto, la
 * settimana, oppure tutto. La V1 poteva mostrare solo «oggi ± 7n»; qui si
 * sceglie il giorno.
 *
 * Sotto: la nota sulla disponibilita (W6-53); l'ingresso alla sua
 * configurazione e un'azione dell'intestazione di pagina.
 *
 * Sotto i 1024px il rail sta sopra la griglia e i sette giorni scorrono in
 * riga.
 */
export function AgendaRail({
  selectedDate,
  onSelectDate,
  scope,
  onScopeChange,
  countOnDay,
  className,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  scope: AgendaScope;
  onScopeChange: (scope: AgendaScope) => void;
  /** Quanti appuntamenti vivi (in attesa o confermati) in quel giorno. */
  countOnDay: (date: Date) => number;
  className?: string;
}) {
  const days = React.useMemo(() => weekDaysOf(selectedDate), [selectedDate]);
  const today = React.useMemo(() => new Date(), []);

  return (
    <div className={cn("flex flex-col gap-[18px]", className)}>
      <Panel as="aside" aria-label="Agenda della settimana" className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Eyebrow>Settimana</Eyebrow>
            <p className="egw-num mt-1 font-brand text-[13px] font-bold text-egw-ink">{formatWeekTitle(selectedDate)}</p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton aria-label="Settimana precedente" variant="row" size="xs" onClick={() => onSelectDate(addDays(selectedDate, -7))}>
              <ChevronLeft />
            </IconButton>
            <IconButton aria-label="Settimana successiva" variant="row" size="xs" onClick={() => onSelectDate(addDays(selectedDate, 7))}>
              <ChevronRight />
            </IconButton>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl<AgendaScope>
            aria-label="Ambito dell'agenda"
            size="sm"
            value={scope}
            onChange={onScopeChange}
            options={[
              { value: "day", label: "Giorno" },
              { value: "week", label: "Settimana" },
              { value: "all", label: "Tutti" },
            ]}
          />
          <Button variant="text" size="xs" onClick={() => onSelectDate(new Date())}>
            Vai a oggi
          </Button>
        </div>

        <Hairline className="my-3" />

        <ul className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0" role="list">
          {days.map((day) => {
            const selected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            const count = countOnDay(day);
            return (
              <li key={day.toISOString()} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${formatWeekdayShort(day)}, ${count} ${count === 1 ? "appuntamento" : "appuntamenti"}`}
                  onClick={() => onSelectDate(day)}
                  className={cn(
                    "flex h-[30px] w-full min-w-[88px] items-center justify-between gap-3 rounded-egw-chip border px-2.5 font-brand text-[12px] transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
                    selected
                      ? "border-egw-tint-blue-bd bg-egw-tint-blue font-semibold text-egw-blue-800"
                      : "border-transparent font-medium text-egw-ink-72 hover:bg-egw-page-100",
                  )}
                >
                  <span className={cn("capitalize", isToday && !selected && "text-egw-blue-700")}>{formatWeekdayShort(day)}</span>
                  <span className={cn("egw-num text-[11.5px] font-bold", selected ? "text-egw-blue-800" : count ? "text-egw-ink" : "text-egw-ink-42")}>{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <InfoCard eyebrow="Disponibilita">
        Quando la societa riceve — giorni, orari, durata del colloquio, sede e operatore — si dichiara nella disponibilita («Configura la disponibilita», in alto). Senza fasce dichiarate si ricade sull&apos;orario di apertura.
      </InfoCard>
    </div>
  );
}
