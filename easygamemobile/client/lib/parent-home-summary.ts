import type { ParentDashboardData, ParentDashboardEvent } from "@/services/api";
import { formatEventDateShort } from "@/lib/parent-calendar";

/**
 * Cio che la Home Parent mostra, derivato dal payload aggregato reale —
 * nessuna card o numero non presente nel `GET /api/parent-dashboard/
 * [athleteId]` (istruzione: "NON inventare card o dati non presenti").
 */
export interface ParentHomeSummary {
  nextTrainingLabel: string;
  nextMatchLabel: string;
  attendanceRateLabel: string;
  notificationsUnread: number;
  certificateStatusLabel: string;
  certificateStatus: string;
  upcomingTrainings: ParentDashboardEvent[];
  upcomingMatches: ParentDashboardEvent[];
}

export function summarizeParentHome(
  data: ParentDashboardData,
): ParentHomeSummary {
  return {
    nextTrainingLabel: formatEventDateShort(data.analytics?.nextTraining?.date),
    nextMatchLabel: formatEventDateShort(data.analytics?.nextMatch?.date),
    attendanceRateLabel: `${Math.round(data.attendance?.rate || 0)}%`,
    notificationsUnread: data.notificationsUnread || 0,
    certificateStatusLabel: data.health?.statusLabel || "Non disponibile",
    certificateStatus: data.health?.status || "missing",
    upcomingTrainings: (data.trainings?.upcoming || []).slice(0, 2),
    upcomingMatches: (data.matches?.upcoming || []).slice(0, 2),
  };
}
