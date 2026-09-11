import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  GlassCard,
  InfoNote,
  MetaRow,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { ParentEventCard } from "@/components/parent/ParentEventCard";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentRsvp } from "@/hooks/useParentRsvp";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  buildParentCalendarItems,
  findParentCalendarItem,
} from "@/lib/parent-calendar";
import { findInvitationForEvent } from "@/lib/parent-rsvp";
import { formatItalianDate } from "@/lib/mobile-ui";
import type { ParentCalendarStackParamList } from "@/navigation/ParentCalendarStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentCalendarStackParamList,
  "ParentEventDetail"
>;
type Route = RouteProp<ParentCalendarStackParamList, "ParentEventDetail">;

/**
 * Il dettaglio di un allenamento o di una gara: la stessa `ParentEventCard`
 * della Home e del Calendario (con la risposta della famiglia sulla
 * scheda), piu la scheda "Dettagli" con cio che il payload aggiunge (data
 * estesa, categoria, stato, nota dell'invito). Nessuna fetch dedicata: lo
 * cerca nella lista gia caricata (stessa query key
 * `["parent-dashboard", athleteId]`).
 */
// Lo stato dell'evento come lo legge una famiglia, non la chiave del server.
const EVENT_STATUS_LABELS: Record<string, string> = {
  scheduled: "In programma",
  inProgress: "In corso",
  in_progress: "In corso",
  completed: "Svolto",
  cancelled: "Annullato",
  canceled: "Annullato",
  postponed: "Rinviato",
};
const describeEventStatus = (status: string) =>
  EVENT_STATUS_LABELS[status] || status;

export default function ParentEventDetailScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const { eventId, kind } = route.params;
  const { selectedChildId, selectedChild } = useParentContext();

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const rsvp = useParentRsvp(selectedChildId);
  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);

  const item = useMemo(() => {
    if (!dashboardQuery.data) return null;
    const items = buildParentCalendarItems(
      dashboardQuery.data.trainings.all,
      dashboardQuery.data.matches.all,
    );
    return findParentCalendarItem(items, eventId);
  }, [dashboardQuery.data, eventId]);
  const invitation = findInvitationForEvent(rsvp.invitations, eventId);

  return (
    <SecondaryScreenLayout
      title={kind === "match" ? "Gara" : "Allenamento"}
      eyebrow={`Calendario · ${selectedChild?.name || "Atleta"}`}
      onBack={() => navigation.goBack()}
      skyHeight={250}
      club={
        selectedChild
          ? {
              name: selectedChild.clubName,
              avatarUrl: selectedChild.clubLogoUrl,
            }
          : undefined
      }
    >
      {status === "loading" ? (
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
      ) : !item ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Evento non trovato"
          message="Questo evento non e piu disponibile."
        />
      ) : (
        <>
          <ParentEventCard
            item={item}
            invitations={rsvp.invitations}
            invitationsLoadFailed={rsvp.loadFailed}
            onAnswer={(id, answer) => void rsvp.answer(id, answer)}
            updatingId={rsvp.updatingId}
            errorMessage={rsvp.errorFor(item.id)}
            onRetry={rsvp.refetch}
          />
          {rsvp.loadFailed ? (
            // Non tacere: senza l'invito non si sa se l'evento richiede una
            // risposta, e "nessun controllo" si leggerebbe come "nessuna
            // risposta richiesta" — falso quando e solo la fetch a fallire.
            <InfoNote tone="warning">
              Impossibile verificare la conferma di partecipazione.{" "}
              <SignatureText
                style={{ color: "#1D4ED8", fontWeight: "700" }}
                onPress={rsvp.refetch}
              >
                Riprova
              </SignatureText>
            </InfoNote>
          ) : null}
          <GlassCard eyebrow="Dettagli">
            <MetaRow icon="calendar-outline">
              {formatItalianDate(item.date, "EEEE d MMMM yyyy")}
              {item.time ? ` · ${item.time}` : ""}
              {item.endTime ? ` – ${item.endTime}` : ""}
            </MetaRow>
            {item.location ? (
              <MetaRow icon="location-outline">{item.location}</MetaRow>
            ) : null}
            {item.categoryName ? (
              <MetaRow icon="people-outline">{item.categoryName}</MetaRow>
            ) : null}
            {item.kind === "match" && typeof item.isHome === "boolean" ? (
              <MetaRow icon="home-outline">
                {item.isHome ? "In casa" : "In trasferta"}
              </MetaRow>
            ) : null}
            {item.status ? (
              <MetaRow icon="information-circle-outline">
                {`Stato: ${describeEventStatus(String(item.status))}`}
              </MetaRow>
            ) : null}
            {invitation?.note ? (
              <MetaRow icon="chatbubble-outline">{`Nota: ${invitation.note}`}</MetaRow>
            ) : null}
          </GlassCard>
        </>
      )}
    </SecondaryScreenLayout>
  );
}
