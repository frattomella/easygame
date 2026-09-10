/**
 * Orari di apertura — porto fedele (non un import: CLAUDE.md §6 vieta
 * import tra i due alberi) di `src/lib/opening-hours-utils.ts`
 * (`normalizeOpeningHours`/`formatOpeningHourSlots`). `data.club.opening_hours`
 * arriva grezzo dal server, senza normalizzazione — la stessa forma libera
 * che i Contatti Parent devono leggere sul Web (stringa, array, oggetto
 * per giorno con alias italiani/inglesi, sotto-fasce mattina/pomeriggio/
 * sera). Solo le due funzioni di presentazione: la validazione oraria
 * (`isDateTimeWithinOpeningHours`) resta lato server, il mobile non la
 * duplica per un campo libero che gia dichiara il gap (vedi
 * `client/lib/parent-appointments.ts`).
 */

export type OpeningHourSlot = {
  start: string;
  end: string;
  label?: string;
  staff?: string;
};

export type NormalizedOpeningDay = {
  key: string;
  label: string;
  closed: boolean;
  slots: OpeningHourSlot[];
};

const DAY_LABELS: Record<string, string> = {
  monday: "Lunedì",
  tuesday: "Martedì",
  wednesday: "Mercoledì",
  thursday: "Giovedì",
  friday: "Venerdì",
  saturday: "Sabato",
  sunday: "Domenica",
  lunedi: "Lunedì",
  martedi: "Martedì",
  mercoledi: "Mercoledì",
  giovedi: "Giovedì",
  venerdi: "Venerdì",
  sabato: "Sabato",
  domenica: "Domenica",
};

const DAY_ALIASES: Record<string, string> = {
  lunedi: "monday",
  monday: "monday",
  mon: "monday",
  martedi: "tuesday",
  tuesday: "tuesday",
  tue: "tuesday",
  mercoledi: "wednesday",
  wednesday: "wednesday",
  wed: "wednesday",
  giovedi: "thursday",
  thursday: "thursday",
  thu: "thursday",
  venerdi: "friday",
  friday: "friday",
  fri: "friday",
  sabato: "saturday",
  saturday: "saturday",
  sat: "saturday",
  domenica: "sunday",
  sunday: "sunday",
  sun: "sunday",
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const normalizeDayKey = (value: unknown) => {
  const normalized = normalizeText(value);
  return DAY_ALIASES[normalized] || normalized;
};

const normalizeTime = (value: unknown) => {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const parseSlotFromString = (value: unknown): OpeningHourSlot[] => {
  const text = String(value || "").trim();
  if (!text) return [];

  if (["chiuso", "closed", "non disponibile"].includes(normalizeText(text))) {
    return [];
  }

  return text
    .split(/[,;|/]+/)
    .map((entry) => entry.trim())
    .map((entry) => entry.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      start: normalizeTime(match[1]),
      end: normalizeTime(match[2]),
    }))
    .filter((slot) => slot.start && slot.end);
};

const normalizeSlotRecord = (
  value: unknown,
  fallbackLabel?: string,
  fallbackStaff?: string,
): OpeningHourSlot[] => {
  if (typeof value === "string") {
    return parseSlotFromString(value).map((slot) => ({
      ...slot,
      label: fallbackLabel,
      staff: fallbackStaff,
    }));
  }

  const record = asRecord(value);
  if (!Object.keys(record).length) return [];

  const directRange = String(
    record.hours || record.time || record.value || "",
  ).trim();
  if (directRange) {
    return parseSlotFromString(directRange).map((slot) => ({
      ...slot,
      label: String(record.label || fallbackLabel || "").trim() || undefined,
      staff: String(record.staff || fallbackStaff || "").trim() || undefined,
    }));
  }

  const start = normalizeTime(record.start || record.from || record.open);
  const end = normalizeTime(record.end || record.to || record.close);
  if (!start || !end) return [];

  return [
    {
      start,
      end,
      label: String(record.label || fallbackLabel || "").trim() || undefined,
      staff: String(record.staff || fallbackStaff || "").trim() || undefined,
    },
  ];
};

const normalizeDayValue = (
  key: string,
  label: string,
  value: unknown,
): NormalizedOpeningDay => {
  const record = asRecord(value);
  const closed =
    value === null ||
    value === false ||
    ["chiuso", "closed"].includes(normalizeText(value)) ||
    Boolean(record.closed || record.isClosed);

  if (closed) {
    return { key, label, closed: true, slots: [] };
  }

  const slots = [
    ...normalizeSlotRecord(record.morning, "Mattina", record.morningStaff),
    ...normalizeSlotRecord(
      record.afternoon,
      "Pomeriggio",
      record.afternoonStaff,
    ),
    ...normalizeSlotRecord(record.evening, "Sera", record.eveningStaff),
    ...normalizeSlotRecord(record.hours || record.time || record.value),
    ...asArray(record.slots).flatMap((slot) => normalizeSlotRecord(slot)),
    ...asArray(record.ranges).flatMap((slot) => normalizeSlotRecord(slot)),
    ...normalizeSlotRecord(value),
  ].filter((slot, index, allSlots) => {
    if (!slot.start || !slot.end) return false;
    return (
      allSlots.findIndex(
        (candidate) =>
          candidate.start === slot.start &&
          candidate.end === slot.end &&
          candidate.label === slot.label,
      ) === index
    );
  });

  return { key, label, closed: slots.length === 0, slots };
};

export const normalizeOpeningHours = (
  openingHours: unknown,
): NormalizedOpeningDay[] => {
  const source =
    Array.isArray(openingHours) && openingHours.length === 1
      ? openingHours[0]
      : openingHours;

  if (!source) return [];

  if (typeof source === "string") {
    const slots = parseSlotFromString(source);
    return slots.length
      ? [{ key: "general", label: "Orari", closed: false, slots }]
      : [];
  }

  if (Array.isArray(source)) {
    return source
      .map((entry, index) => {
        const record = asRecord(entry);
        const key = normalizeDayKey(record.day || record.key || record.label);
        const resolvedKey = key || `day-${index}`;
        return normalizeDayValue(
          resolvedKey,
          DAY_LABELS[resolvedKey] ||
            String(record.day || record.label || "Giorno"),
          record,
        );
      })
      .filter((day) => day.key);
  }

  const record = asRecord(source);
  return Object.entries(record).map(([day, value]) => {
    const key = normalizeDayKey(day);
    return normalizeDayValue(key, DAY_LABELS[key] || day, value);
  });
};

export const formatOpeningHourSlots = (day: NormalizedOpeningDay) => {
  if (day.closed || day.slots.length === 0) return "Chiuso";

  return day.slots
    .map((slot) => {
      const range = `${slot.start}-${slot.end}`;
      return slot.label ? `${slot.label}: ${range}` : range;
    })
    .join(" / ");
};
