import { Athlete } from "@/services/api";
import { format, parseISO } from "date-fns";
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
