"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { DataChip } from "@/components/web/primitives/StatusPill";
import type { ClubStructure, StructureBooking } from "@/lib/structures-utils";
import { fieldTone } from "@/components/structures/v2/structure-model";
import {
  WEEKDAY_SHORT,
  addMonths,
  bookingDateKey,
  bookingTimeLabel,
  getCalendarDays,
  localDateKey,
  monthLabel,
  sortBookings,
} from "@/components/structures/v2/booking-model";

/**
 * Il calendario mensile delle prenotazioni della V1, sulle superfici del
 * sistema: sei settimane da lunedi, al piu tre prenotazioni per giorno e
 * «+n altre», le annullate attenuate, un chip per campo con una tonalita
 * distinta. Un giorno apre la creazione su quella data; una prenotazione
 * apre la modifica. Sotto i 760 px scorre nel proprio contenitore.
 */
export function BookingsCalendar({
  structure,
  onPickDay,
  onPickBooking,
  actions,
}: {
  structure: ClubStructure;
  onPickDay: (date: Date) => void;
  onPickBooking: (booking: StructureBooking) => void;
  actions?: React.ReactNode;
}) {
  const [monthDate, setMonthDate] = React.useState(() => new Date());
  const days = React.useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const fieldIds = React.useMemo(() => structure.fields.map((field) => String(field.id)), [structure.fields]);
  const byDay = React.useMemo(() => {
    const map = new Map<string, StructureBooking[]>();
    for (const booking of sortBookings(structure.bookings || [])) {
      const key = bookingDateKey(booking);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(booking);
    }
    return map;
  }, [structure.bookings]);
  const todayKey = localDateKey(new Date());

  return (
    <Panel as="section" className="p-5">
      <PanelHeader
        eyebrow="Calendario"
        title={<span className="capitalize">{monthLabel(monthDate)}</span>}
        description="Prenotazioni dentro ai giorni, colori distinti per campo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <IconButton aria-label="Mese precedente" variant="secondary" size="sm" onClick={() => setMonthDate((current) => addMonths(current, -1))}>
              <ChevronLeft />
            </IconButton>
            <Button variant="secondary" size="sm" onClick={() => setMonthDate(new Date())}>
              Oggi
            </Button>
            <IconButton aria-label="Mese successivo" variant="secondary" size="sm" onClick={() => setMonthDate((current) => addMonths(current, 1))}>
              <ChevronRight />
            </IconButton>
            {actions}
          </div>
        }
      />
      <div className="egw-scroll overflow-x-auto">
        <div role="grid" aria-label={`Prenotazioni di ${monthLabel(monthDate)}`} className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-egw-field border border-egw-hairline bg-white">
          {WEEKDAY_SHORT.map((day) => (
            <div key={day} role="columnheader" className="border-b border-r border-egw-hairline px-2 py-1.5 text-center font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42 last:border-r-0">
              {day}
            </div>
          ))}
          {days.map((day) => {
            const key = localDateKey(day);
            const dayBookings = byDay.get(key) || [];
            const visible = dayBookings.slice(0, 3);
            const inMonth = day.getMonth() === monthDate.getMonth();
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                role="gridcell"
                tabIndex={0}
                onClick={() => onPickDay(day)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPickDay(day);
                  }
                }}
                aria-label={`${day.getDate()} ${monthLabel(day)}${dayBookings.length ? `, ${dayBookings.length} prenotazioni` : ""}`}
                className={cn(
                  "min-h-[104px] cursor-pointer border-b border-r border-egw-hairline p-1.5 text-left transition-colors duration-hover last:border-r-0 hover:bg-egw-tint-blue focus-visible:outline-none focus-visible:shadow-egw-focus",
                  inMonth ? "bg-white" : "bg-egw-page-100 text-egw-ink-42",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className={cn(
                      "egw-num inline-flex h-6 w-6 items-center justify-center rounded-egw-pill font-brand text-[11.5px] font-bold",
                      isToday ? "bg-egw-navy text-white" : "text-egw-ink",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayBookings.length ? <span className="egw-num font-brand text-[10.5px] text-egw-ink-42">{dayBookings.length}</span> : null}
                </div>
                <div className="flex flex-col gap-1">
                  {visible.map((booking) => (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPickBooking(booking);
                      }}
                      title={`${bookingTimeLabel(booking)} · ${booking.fieldName || "Campo"} · ${booking.bookedByName || booking.title}`}
                      className={cn("block w-full text-left focus-visible:outline-none focus-visible:shadow-egw-focus", booking.status === "cancelled" && "opacity-50")}
                    >
                      <DataChip size="sm" tone={fieldTone(String(booking.fieldId || ""), fieldIds)} className="w-full max-w-full">
                        <span className="egw-num">{bookingTimeLabel(booking)}</span> · {booking.bookedByName || booking.title}
                      </DataChip>
                    </button>
                  ))}
                  {dayBookings.length > visible.length ? (
                    <p className="egw-num font-brand text-[10.5px] font-semibold text-egw-ink-62">+{dayBookings.length - visible.length} altre</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
