import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  EventCard,
  RSVPControl,
  SecondaryScreenLayout,
  StateMessage,
} from "@/components/signature";
import type { EventCardMeta } from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  buildParentCalendarItems,
  findParentCalendarItem,
  formatEventDateRail,
  type ParentCalendarItem,
} from "@/lib/parent-calendar";
import {
  findInvitationForEvent,
  resolveRsvpControlView,
} from "@/lib/parent-rsvp";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import type { ParentCalendarStackParamList } from "@/navigation/ParentCalendarStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentCalendarStackParamList,
  "ParentEventDetail"
>;
type Route = RouteProp<ParentCalendarStackParamList, "ParentEventDetail">;

/**
 * Il dettaglio di un allenamento o di una gara — dove vive `RSVPControl`
 * (spec C2: "sostituisce la riga azioni del trainer"). Nessuna fetch
 * dedicata all'evento: lo cerca nella stessa lista gia caricata dal
 * Calendario (stessa query key `["parent-dashboard", athleteId]`).
 */
export default function ParentEventDetailScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const { eventId, kind } = route.params;
  const { selectedChildId } = useParentContext();
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const rsvpQuery = useQuery({
    queryKey: ["parent-rsvp", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentRsvpInvitations(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });

  const [updating, setUpdating] = useState(false);
  const [rsvpError, setRsvpError] = useState("");

  const item = useMemo(() => {
    if (!dashboardQuery.data) return null;
    const items = buildParentCalendarItems(
      dashboardQuery.data.trainings.all,
      dashboardQuery.data.matches.all,
    );
    return findParentCalendarItem(items, eventId);
  }, [dashboardQuery.data, eventId]);

  const invitation = findInvitationForEvent(rsvpQuery.data || [], eventId);
  const rsvpView = resolveRsvpControlView(invitation);
  const rail = item ? formatEventDateRail(item.date) : null;

  const handleAnswer = async (status: "yes" | "no") => {
    if (!selectedChildId) return;
    setUpdating(true);
    setRsvpError("");
    try {
      await mobileBackendStorage.answerParentRsvp({
        athleteId: selectedChildId,
        trainingId: eventId,
        status,
      });
      await queryClient.invalidateQueries({
        queryKey: ["parent-rsvp", selectedChildId],
      });
    } catch (error) {
      const kindError = classifyFetchError(error);
      setRsvpError(
        fetchErrorMessage(
          error,
          kindError === "forbidden"
            ? "Accesso non consentito."
            : "Risposta non salvata. Riprova.",
        ),
      );
    } finally {
      setUpdating(false);
    }
  };

  return (
    <SecondaryScreenLayout
      title={kind === "match" ? "Gara" : "Allenamento"}
      eyebrow="Dettaglio"
      onBack={() => navigation.goBack()}
    >
      {dashboardQuery.isPending ? (
        <StateMessage kind="loading" tone="dark" />
      ) : !item ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Evento non trovato"
          message="Questo evento non e piu disponibile."
        />
      ) : (
        <EventCard
          kind={item.kind}
          title={
            item.kind === "match"
              ? item.opponent
                ? `vs ${item.opponent}`
                : item.title || "Gara"
              : item.title || item.categoryName || "Allenamento"
          }
          dateLabel={
            rail
              ? `${rail.dayName.toUpperCase()} ${rail.dayNumber} ${rail.monthLabel.toUpperCase()}`
              : undefined
          }
          time={item.time || "--:--"}
          endTime={item.endTime}
          meta={buildEventMeta(item)}
          footer={
            <RSVPControl
              view={rsvpView}
              updating={updating}
              errorMessage={rsvpError || undefined}
              onAnswer={handleAnswer}
              onRetry={() => setRsvpError("")}
            />
          }
        />
      )}
    </SecondaryScreenLayout>
  );
}

function buildEventMeta(item: ParentCalendarItem): EventCardMeta[] {
  const rows: EventCardMeta[] = [];
  if (item.location) {
    rows.push({ icon: "location-outline", label: item.location });
  }
  if (item.categoryName) {
    rows.push({ icon: "people-outline", label: item.categoryName });
  }
  return rows;
}
