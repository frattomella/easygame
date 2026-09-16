"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/web/primitives/Surface";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { formatTime } from "@/lib/web/format";
import { formatLocalDateOnly } from "@/lib/date-only";
import { isSameDay, monthGridOf } from "@/components/training/v2/training-page-model";
import {
  isAnnullato,
  isGara,
  linkOperativo,
  titoloDi,
  type EventoCalendario,
} from "@/components/calendar/v2/calendar-model";

/**
 * La griglia del mese del calendario unico (guideline 09 §9.3, §9.7): sette
 * colonne lun → dom, il giorno di oggi segnato, il giorno scelto in
 * evidenza, e in ogni cella fino a tre tessere — ora + titolo, blu per
 * l'allenamento e con il filo arancio del modulo per la gara, barrate se
 * annullate — piu «+n» quando ce ne sono di piu. Una tessera porta alla
 * pagina che opera sull'evento, aperta sul suo giorno; una cella sceglie il
 * giorno e ne mostra l'elenco sotto.
 *
 * Sotto i 768 px le tessere lasciano il posto a un puntino per tipo e al
 * conteggio: la cella resta leggibile a 375 px senza traboccare.
 */
const WEEKDAY_HEADERS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MAX_TILES = 3;

export function MonthGrid({
  anchor,
  onAnchorChange,
  selectedDay,
  onSelectDay,
  eventsByDay,
  loading,
}: {
  anchor: Date;
  onAnchorChange: (next: Date) => void;
  selectedDay: Date | null;
  onSelectDay: (day: Date) => void;
  eventsByDay: Map<string, EventoCalendario[]>;
  loading: boolean;
}) {
  const cells = React.useMemo(() => monthGridOf(anchor), [anchor]);
  const today = React.useMemo(() => new Date(), []);
  const monthLabel = anchor.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  return (
    <Panel className="p-0" data-test="calendar-month-grid">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-egw-hairline px-4 py-3">
        <div className="flex items-center gap-1">
          <IconButton
            aria-label="Mese precedente"
            variant="row"
            size="sm"
            onClick={() => onAnchorChange(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </IconButton>
          <h2 className="min-w-[150px] text-center font-brand text-[14px] font-bold capitalize text-egw-ink">{monthLabel}</h2>
          <IconButton
            aria-label="Mese successivo"
            variant="row"
            size="sm"
            onClick={() => onAnchorChange(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </IconButton>
        </div>
        <Button variant="text" size="xs" onClick={() => onAnchorChange(new Date(today.getFullYear(), today.getMonth(), 1))}>
          Vai a oggi
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[320px]">
          <div className="grid grid-cols-7 border-b border-egw-hairline text-center font-brand text-[9.5px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
            {WEEKDAY_HEADERS.map((label) => (
              <span key={label} className="py-2">
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7" role="grid" aria-label={`Calendario di ${monthLabel}`} aria-busy={loading || undefined}>
            {cells.map((day, index) => {
              if (!day) {
                return <span key={`empty-${index}`} className="min-h-[64px] border-b border-r border-egw-rule bg-egw-page-100 md:min-h-[112px]" aria-hidden />;
              }
              const key = formatLocalDateOnly(day);
              const events = eventsByDay.get(key) || [];
              const selected = selectedDay ? isSameDay(day, selectedDay) : false;
              const isToday = isSameDay(day, today);
              const gare = events.filter(isGara).length;
              const allenamenti = events.length - gare;
              return (
                <div
                  key={key}
                  role="gridcell"
                  aria-selected={selected}
                  className={cn(
                    "group relative flex min-h-[64px] flex-col border-b border-r border-egw-rule p-1 md:min-h-[112px] md:p-1.5",
                    selected && "bg-egw-tint-blue",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    aria-label={`${day.getDate()} ${monthLabel}${events.length ? ` · ${events.length} ${events.length === 1 ? "evento" : "eventi"}` : ""}`}
                    aria-pressed={selected}
                    className="flex items-center justify-between rounded-egw-chip px-1 text-left focus-visible:outline-none focus-visible:shadow-egw-focus"
                  >
                    <span
                      className={cn(
                        "egw-num inline-flex h-6 w-6 items-center justify-center rounded-egw-pill font-brand text-[12px] font-bold",
                        isToday ? "bg-egw-navy-800 text-white" : "text-egw-ink-72",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {events.length ? (
                      <span className="egw-num flex items-center gap-1 font-brand text-[10px] font-bold md:hidden">
                        {gare ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-egw-orange" aria-hidden /> : null}
                        {allenamenti ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-egw-blue" aria-hidden /> : null}
                        <span className="text-egw-ink-62">{events.length}</span>
                      </span>
                    ) : null}
                  </button>
                  {loading && !events.length ? (
                    <Skeleton className="mt-1.5 hidden h-4 w-3/4 md:block" />
                  ) : (
                    <ul className="mt-1 hidden flex-col gap-0.5 md:flex" aria-label="Eventi del giorno">
                      {events.slice(0, MAX_TILES).map((evento) => (
                        <li key={evento.eventId || evento.id}>
                          <EventTile evento={evento} />
                        </li>
                      ))}
                      {events.length > MAX_TILES ? (
                        <li>
                          <button
                            type="button"
                            onClick={() => onSelectDay(day)}
                            className="egw-num w-full rounded-egw-micro px-1.5 py-0.5 text-left font-brand text-[10.5px] font-bold text-egw-blue-700 hover:bg-white focus-visible:outline-none focus-visible:shadow-egw-focus"
                          >
                            +{events.length - MAX_TILES} altri
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function EventTile({ evento }: { evento: EventoCalendario }) {
  const gara = isGara(evento);
  const annullato = isAnnullato(evento);
  const titolo = titoloDi(evento);
  return (
    <Link
      href={linkOperativo(evento)}
      title={`${evento.time ? `${formatTime(evento.time)} · ` : ""}${titolo}${evento.category ? ` · ${evento.category}` : ""}`}
      className={cn(
        "relative block truncate rounded-egw-micro border py-0.5 pl-2 pr-1.5 font-brand text-[10.5px] leading-4 transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
        gara ? "border-egw-tint-orange-bd bg-egw-tint-orange text-egw-ink hover:bg-white" : "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-ink hover:bg-white",
        annullato && "text-egw-ink-42 line-through",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0.5 left-0 w-[3px] rounded-full", gara ? "bg-egw-match" : "bg-egw-blue")} />
      {evento.time ? <span className="egw-num font-bold">{formatTime(evento.time)}</span> : null}
      {evento.time ? " " : ""}
      <span className="font-medium">{titolo}</span>
    </Link>
  );
}
