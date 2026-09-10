import { Athlete } from "@/services/api";
import {
  differenceInHours,
  format,
  formatDistanceToNowStrict,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";

export const getRoleLabel = (role?: string | null) => {
  switch (role) {
    case "owner":
      return "Proprietario";
    case "admin":
      return "Admin";
    case "trainer":
      return "Allenatore";
    case "assistant":
      return "Assistente";
    case "parent":
      return "Genitore";
    default:
      return "Accesso";
  }
};

export const getAthleteStatusVariant = (status: Athlete["status"]) => {
  switch (status) {
    case "attivo":
      return "success";
    case "infortunato":
      return "warning";
    case "squalificato":
      return "destructive";
    default:
      return "default";
  }
};

export const getAthleteStatusLabel = (status: Athlete["status"]) => {
  switch (status) {
    case "attivo":
      return "Attivo";
    case "infortunato":
      return "Infortunato";
    case "squalificato":
      return "Squalificato";
    default:
      return status;
  }
};

export const formatItalianDate = (
  value?: string | null,
  pattern = "d MMM yyyy",
) => {
  if (!value) {
    return "Data non disponibile";
  }

  try {
    return format(parseISO(value), pattern, { locale: it });
  } catch {
    return value;
  }
};

/**
 * `NotificationRow` (spec C6): "relative under 24h (`2 ore fa`), then
 * absolute (`12 set · 18:40`)". `date-fns` italian phrasing differs
 * slightly from the spec's exact wording ("circa 2 ore fa") — reused
 * rather than hand-rolled to avoid a second, drifting relative-time
 * implementation in the app.
 */
export const formatRelativeOrAbsolute = (value?: string | null) => {
  if (!value) {
    return "";
  }

  try {
    const date = parseISO(value);
    if (differenceInHours(new Date(), date) < 24) {
      return formatDistanceToNowStrict(date, { locale: it, addSuffix: true });
    }
    return format(date, "d MMM · HH:mm", { locale: it });
  } catch {
    return value;
  }
};

export const formatTimeRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) {
    return "Orario da definire";
  }

  if (start && end) {
    return `${start} - ${end}`;
  }

  return start || end || "Orario da definire";
};

export const getClubInitials = (value?: string | null) => {
  const parts = String(value || "EasyGame")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
};
