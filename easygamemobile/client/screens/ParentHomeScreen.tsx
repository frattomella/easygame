import React from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import {
  HighlightCard,
  ParentPrimaryScreenLayout,
  SectionHero,
  StateMessage,
  StatCard,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { summarizeParentHome } from "@/lib/parent-home-summary";
import { formatEventDateShort } from "@/lib/parent-calendar";
import { Spacing } from "@/constants/theme";
import type { ParentHomeStackParamList } from "@/navigation/ParentHomeStackNavigator";

type Navigation = NativeStackNavigationProp<ParentHomeStackParamList>;

const CERTIFICATE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  valid: "shield-checkmark-outline",
  expiring: "alert-circle-outline",
  expired: "close-circle-outline",
  missing: "help-circle-outline",
};

const CERTIFICATE_COLOR: Record<string, string> = {
  valid: "#22C55E",
  expiring: "#F59E0B",
  expired: "#EF4444",
  missing: "#94A3B8",
};

/**
 * Il cruscotto reale Parent (WP5): quanto la Home Web mostra davvero,
 * adattato alla UX mobile — non un layout copiato. Legge lo stesso
 * `GET /api/parent-dashboard/[athleteId]` che alimenta anche il Calendario
 * (vedi `useParentSectionStatus`): condividono la stessa query key, quindi
 * cambiare tab non rifa la fetch per lo stesso figlio.
 */
export default function ParentHomeScreen() {
  const navigation = useNavigation<Navigation>();
  const { children, selectedChildId, selectedChild, switching, selectChild } =
    useParentContext();

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);
  const fixedLayout = status !== "ready";

  const summary = dashboardQuery.data
    ? summarizeParentHome(dashboardQuery.data)
    : null;

  const openCalendar = () =>
    navigation.getParent()?.navigate("ParentCalendarTab" as never);

  return (
    <ParentPrimaryScreenLayout
      title="Home"
      eyebrow={selectedChild ? selectedChild.clubName : "EasyGame"}
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      scrollable={!fixedLayout}
      content={
        status === "loading" ? (
          <StateMessage kind="loading" tone="dark" />
        ) : status === "forbidden" ? (
          <StateMessage kind="forbidden" tone="dark" message={errorMessage} />
        ) : status === "network" || status === "error" ? (
          <StateMessage
            kind="error"
            tone="dark"
            message={errorMessage}
            actionLabel="Riprova"
            onAction={() => void dashboardQuery.refetch()}
          />
        ) : summary && selectedChild ? (
          <>
            <SectionHero
              icon="home-outline"
              eyebrow={selectedChild.clubName}
              title={selectedChild.name}
              subtitle={selectedChild.categoryName || undefined}
              chips={[
                {
                  label: "Prossimo allenamento",
                  value: summary.nextTrainingLabel,
                },
                { label: "Prossima gara", value: summary.nextMatchLabel },
                { label: "Presenze", value: summary.attendanceRateLabel },
              ]}
            />

            <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
              <View style={{ flexDirection: "row", gap: Spacing.md }}>
                <StatCard
                  icon={
                    CERTIFICATE_ICON[summary.certificateStatus] ||
                    "shield-checkmark-outline"
                  }
                  iconColor={
                    CERTIFICATE_COLOR[summary.certificateStatus] || "#2563EB"
                  }
                  statusColor={CERTIFICATE_COLOR[summary.certificateStatus]}
                  value={summary.certificateStatusLabel}
                  label="Certificato medico"
                />
                <StatCard
                  icon="notifications-outline"
                  iconColor="#2563EB"
                  value={String(summary.notificationsUnread)}
                  label="Notifiche"
                />
              </View>

              <HighlightCard
                icon="fitness-outline"
                moduleColor="#2563EB"
                stripe="action"
                eyebrow="Prossimi"
                title="Allenamenti"
                count={summary.upcomingTrainings.length}
                emptyLabel="Nessun allenamento in programma."
                previewRows={summary.upcomingTrainings.map((training) => ({
                  id: training.id,
                  time: formatEventDateShort(training.date),
                  title:
                    training.title || training.categoryName || "Allenamento",
                  meta: training.location || "Luogo da definire",
                }))}
                actionLabel="Vedi calendario"
                onAction={openCalendar}
              />

              <HighlightCard
                icon="football-outline"
                moduleColor="#F97316"
                stripe="match"
                eyebrow="Prossime"
                title="Gare"
                count={summary.upcomingMatches.length}
                emptyLabel="Nessuna gara in programma."
                previewRows={summary.upcomingMatches.map((match) => ({
                  id: match.id,
                  time: formatEventDateShort(match.date),
                  title: match.opponent ? `vs ${match.opponent}` : "Gara",
                  meta: match.location || "Luogo da definire",
                }))}
                actionLabel="Vedi calendario"
                onAction={openCalendar}
              />
            </View>
          </>
        ) : null
      }
    />
  );
}
