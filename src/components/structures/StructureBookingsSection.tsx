"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import {
  hasBookingConflict,
  uid,
  type ClubStructure,
  type StructureBooking,
  type StructureBookingStatus,
} from "@/lib/structures-utils";

type StructureBookingsSectionProps = {
  structure: ClubStructure;
  onChange: (structure: ClubStructure) => void;
};

type BookingForm = {
  id: string;
  fieldId: string;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  status: StructureBookingStatus;
  bookedByName: string;
  amount: string;
  paymentStatus: "unpaid" | "paid" | "partial";
  notes: string;
};

const emptyForm = (): BookingForm => {
  const today = new Date().toISOString().split("T")[0];
  return {
    id: "",
    fieldId: "",
    title: "Prenotazione campo",
    startDate: today,
    startTime: "18:00",
    endDate: today,
    endTime: "19:00",
    status: "pending",
    bookedByName: "",
    amount: "",
    paymentStatus: "unpaid",
    notes: "",
  };
};

const statusLabel = (status: StructureBookingStatus) => {
  if (status === "confirmed") return "Confermata";
  if (status === "cancelled") return "Annullata";
  return "In attesa";
};

const statusClassName = (status: StructureBookingStatus) => {
  if (status === "confirmed") return "border-green-200 bg-green-50 text-green-700";
  if (status === "cancelled") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-yellow-200 bg-yellow-50 text-yellow-700";
};

const toDateTime = (date: string, time: string) => {
  if (!date || !time) return "";
  return new Date(`${date}T${time}`).toISOString();
};

const fromIso = (value: string) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };

  return {
    date: date.toISOString().split("T")[0],
    time: date.toTimeString().slice(0, 5),
  };
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const FIELD_COLOR_CLASSES = [
  "border-blue-200 bg-blue-50 text-blue-700",
  "border-emerald-200 bg-emerald-50 text-emerald-700",
  "border-violet-200 bg-violet-50 text-violet-700",
  "border-amber-200 bg-amber-50 text-amber-700",
  "border-rose-200 bg-rose-50 text-rose-700",
  "border-cyan-200 bg-cyan-50 text-cyan-700",
  "border-indigo-200 bg-indigo-50 text-indigo-700",
];

const localDateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

const monthLabel = (date: Date) =>
  date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

const getCalendarDays = (monthDate: Date) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstMondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstMondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
};

const bookingDateKey = (booking: StructureBooking) => {
  const date = new Date(booking.start);
  return Number.isNaN(date.getTime()) ? "" : localDateKey(date);
};

const bookingTimeLabel = (booking: StructureBooking) => {
  const start = new Date(booking.start);
  const end = new Date(booking.end);
  const format = (date: Date) =>
    Number.isNaN(date.getTime()) ? "--:--" : date.toTimeString().slice(0, 5);

  return `${format(start)}-${format(end)}`;
};

const fieldColorClass = (fieldId: string, fieldIds: string[]) => {
  const index = Math.max(0, fieldIds.indexOf(fieldId));
  return FIELD_COLOR_CLASSES[index % FIELD_COLOR_CLASSES.length];
};

export function StructureBookingsSection({
  structure,
  onChange,
}: StructureBookingsSectionProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<BookingForm>(() => emptyForm());
  const [monthDate, setMonthDate] = useState(() => new Date());
  const bookings = structure.bookings || [];
  const sortedBookings = useMemo(
    () =>
      [...bookings].sort(
        (left, right) =>
          new Date(left.start).getTime() - new Date(right.start).getTime(),
      ),
    [bookings],
  );
  const calendarDays = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const fieldIds = useMemo(
    () => structure.fields.map((field) => String(field.id)),
    [structure.fields],
  );
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, StructureBooking[]>();
    sortedBookings.forEach((booking) => {
      const key = bookingDateKey(booking);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(booking);
    });
    return map;
  }, [sortedBookings]);

  const patchForm = (next: Partial<BookingForm>) =>
    setForm((current) => ({ ...current, ...next }));

  const resetForm = () => setForm(emptyForm());

  const startCreateForDate = (date: Date) => {
    const key = localDateKey(date);
    setForm({
      ...emptyForm(),
      fieldId: structure.fields[0]?.id || "",
      startDate: key,
      endDate: key,
    });
  };

  const startEdit = (booking: StructureBooking) => {
    const start = fromIso(booking.start);
    const end = fromIso(booking.end);
    setForm({
      id: booking.id,
      fieldId: booking.fieldId || "",
      title: booking.title,
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      status: booking.status,
      bookedByName: booking.bookedByName || "",
      amount: booking.amount === undefined ? "" : String(booking.amount),
      paymentStatus: booking.paymentStatus || "unpaid",
      notes: booking.notes || "",
    });
  };

  const saveBooking = () => {
    const field = structure.fields.find((item) => item.id === form.fieldId);
    const start = toDateTime(form.startDate, form.startTime);
    const end = toDateTime(form.endDate, form.endTime);

    if (!field || !form.title || !start || !end) {
      showToast("error", "Campo, titolo e orari sono obbligatori");
      return;
    }

    if (new Date(start).getTime() >= new Date(end).getTime()) {
      showToast("error", "L'orario di fine deve essere successivo all'inizio");
      return;
    }

    const booking: StructureBooking = {
      id: form.id || uid("booking"),
      structureId: structure.id,
      fieldId: field.id,
      fieldName: field.name,
      title: form.title,
      start,
      end,
      status: form.status,
      bookedByType: "club",
      bookedByName: form.bookedByName,
      amount: form.amount ? Number(form.amount) : undefined,
      paymentStatus: form.paymentStatus,
      notes: form.notes,
      createdAt:
        bookings.find((item) => item.id === form.id)?.createdAt ||
        new Date().toISOString(),
    };

    if (hasBookingConflict(bookings, booking)) {
      showToast("error", "Slot gia occupato per questo campo");
      return;
    }

    const nextBookings = form.id
      ? bookings.map((item) => (item.id === form.id ? booking : item))
      : [...bookings, booking];

    onChange({ ...structure, bookings: nextBookings });
    resetForm();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-blue-600" />
          Calendario / Prenotazioni
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold capitalize text-slate-900">
                {monthLabel(monthDate)}
              </p>
              <p className="text-xs text-muted-foreground">
                Prenotazioni dentro ai giorni, colori distinti per campo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setMonthDate((current) => addMonths(current, -1))}
                title="Mese precedente"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMonthDate(new Date())}
              >
                Oggi
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setMonthDate((current) => addMonths(current, 1))}
                title="Mese successivo"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-7 rounded-lg border bg-white">
              {WEEKDAY_LABELS.map((day) => (
                <div
                  key={day}
                  className="border-b border-r p-2 text-center text-xs font-semibold uppercase text-slate-500 last:border-r-0"
                >
                  {day}
                </div>
              ))}
              {calendarDays.map((day) => {
                const key = localDateKey(day);
                const dayBookings = bookingsByDay.get(key) || [];
                const visibleBookings = dayBookings.slice(0, 3);
                const isCurrentMonth = day.getMonth() === monthDate.getMonth();
                const isToday = key === localDateKey(new Date());

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => startCreateForDate(day)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        startCreateForDate(day);
                      }
                    }}
                    className={`min-h-[118px] cursor-pointer border-b border-r p-2 text-left transition-colors hover:bg-blue-50 last:border-r-0 ${
                      isCurrentMonth ? "bg-white" : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          isToday ? "bg-blue-600 text-white" : ""
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {dayBookings.length > 0 ? (
                        <span className="text-[11px] text-slate-500">
                          {dayBookings.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {visibleBookings.map((booking) => (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(booking);
                          }}
                          className={`w-full rounded-md border px-2 py-1 text-left text-[11px] leading-tight shadow-sm ${fieldColorClass(
                            String(booking.fieldId || ""),
                            fieldIds,
                          )} ${
                            booking.status === "cancelled" ? "opacity-50" : ""
                          }`}
                        >
                          <span className="block font-semibold">
                            {bookingTimeLabel(booking)} ·{" "}
                            {booking.fieldName || "Campo"}
                          </span>
                          <span className="block truncate">
                            {booking.bookedByName || booking.title}
                          </span>
                        </button>
                      ))}
                      {dayBookings.length > visibleBookings.length ? (
                        <p className="text-[11px] font-medium text-slate-500">
                          +{dayBookings.length - visibleBookings.length} altre
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Campo</Label>
              <Select
                value={form.fieldId || undefined}
                onValueChange={(value) => patchForm({ fieldId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona campo" />
                </SelectTrigger>
                <SelectContent>
                  {structure.fields.map((field) => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Titolo</Label>
              <Input
                value={form.title}
                onChange={(event) => patchForm({ title: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data inizio</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    patchForm({
                      startDate: event.target.value,
                      endDate: form.endDate || event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Ora inizio</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => patchForm({ startTime: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data fine</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => patchForm({ endDate: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Ora fine</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(event) => patchForm({ endTime: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  patchForm({ status: value as StructureBookingStatus })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">In attesa</SelectItem>
                  <SelectItem value="confirmed">Confermata</SelectItem>
                  <SelectItem value="cancelled">Annullata</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Soggetto prenotante</Label>
              <Input
                value={form.bookedByName}
                onChange={(event) =>
                  patchForm({ bookedByName: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Importo</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(event) => patchForm({ amount: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Stato pagamento</Label>
              <Select
                value={form.paymentStatus}
                onValueChange={(value) =>
                  patchForm({
                    paymentStatus: value as BookingForm["paymentStatus"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Non pagato</SelectItem>
                  <SelectItem value="partial">Parziale</SelectItem>
                  <SelectItem value="paid">Pagato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Note</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(event) => patchForm({ notes: event.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {form.id ? (
              <Button type="button" variant="outline" onClick={resetForm}>
                Annulla modifica
              </Button>
            ) : null}
            <Button type="button" onClick={saveBooking}>
              <Plus className="mr-2 h-4 w-4" />
              {form.id ? "Salva prenotazione" : "Aggiungi prenotazione"}
            </Button>
          </div>
        </div>

        <div className="divide-y rounded-lg border">
          {sortedBookings.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Nessuna prenotazione registrata.
            </div>
          ) : (
            sortedBookings.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold">{booking.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.fieldName || "Campo"} -{" "}
                    {new Date(booking.start).toLocaleString("it-IT")} /{" "}
                    {new Date(booking.end).toLocaleString("it-IT")}
                  </p>
                  {booking.bookedByName ? (
                    <p className="text-sm text-muted-foreground">
                      Prenotante: {booking.bookedByName}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={statusClassName(booking.status)}
                  >
                    {statusLabel(booking.status)}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(booking)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Modifica
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      onChange({
                        ...structure,
                        bookings: bookings.filter((item) => item.id !== booking.id),
                      })
                    }
                    title="Elimina prenotazione"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
