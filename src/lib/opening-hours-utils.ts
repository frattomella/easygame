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

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Lunedi",
  tuesday: "Martedi",
  wednesday: "Mercoledi",
  thursday: "Giovedi",
  friday: "Venerdi",
  saturday: "Sabato",
  sunday: "Domenica",
  lunedi: "Lunedi",
  martedi: "Martedi",
  mercoledi: "Mercoledi",
  giovedi: "Giovedi",
  venerdi: "Venerdi",
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
    .replace(/[\u0300-\u036f]/g, "");

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
    .filter(Boolean)
    .map((match) => ({
      start: normalizeTime(match?.[1]),
      end: normalizeTime(match?.[2]),
    }))
    .filter((slot) => slot.start && slot.end);
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

const timeToMinutes = (value: unknown) => {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
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

  const directRange = String(record.hours || record.time || record.value || "").trim();
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
    ...normalizeSlotRecord(record.afternoon, "Pomeriggio", record.afternoonStaff),
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
          DAY_LABELS[resolvedKey] || String(record.day || record.label || "Giorno"),
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

export const isDateTimeWithinOpeningHours = (
  openingHours: unknown,
  dateValue: unknown,
  timeValue: unknown,
) => {
  const date = new Date(String(dateValue || ""));
  const requestedMinutes = timeToMinutes(timeValue);

  if (Number.isNaN(date.getTime()) || requestedMinutes === null) {
    return { valid: false, reason: "Seleziona una data e un orario validi." };
  }

  const days = normalizeOpeningHours(openingHours);
  if (days.length === 0) {
    return {
      valid: false,
      reason: "Orari di apertura non configurati dalla segreteria.",
    };
  }

  const dayKey = DAY_KEYS[date.getDay()];
  const day =
    days.find((entry) => entry.key === dayKey) ||
    days.find((entry) => entry.key === "general");

  if (!day || day.closed || day.slots.length === 0) {
    return {
      valid: false,
      reason: "L'orario selezionato e fuori dagli orari di apertura della segreteria.",
    };
  }

  const valid = day.slots.some((slot) => {
    const start = timeToMinutes(slot.start);
    const end = timeToMinutes(slot.end);
    return start !== null && end !== null && requestedMinutes >= start && requestedMinutes < end;
  });

  return {
    valid,
    reason: valid
      ? ""
      : "L'orario selezionato e fuori dagli orari di apertura della segreteria.",
  };
};
