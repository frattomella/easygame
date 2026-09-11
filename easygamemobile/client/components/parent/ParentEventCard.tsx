import React from "react";

import { EventCard, RSVPControl } from "@/components/signature";
import type { EventCardMeta } from "@/components/signature";
import { formatEventDateRail, ParentCalendarItem } from "@/lib/parent-calendar";
import {
  findInvitationForEvent,
  resolveCalendarRsvpBadge,
  resolveRsvpControlView,
} from "@/lib/parent-rsvp";
import type { RsvpInvitation } from "@/services/api";

interface ParentEventCardProps {
  item: ParentCalendarItem;
  invitations: RsvpInvitation[];
  invitationsLoadFailed: boolean;
  /** Quando c'e, la scheda porta "Ci sarà / Non ci sarà" (prototipo: sulla Home e in Calendario). */
  onAnswer?: (eventId: string, status: "yes" | "no") => void;
  updatingId?: string | null;
  errorMessage?: string;
  onRetry?: () => void;
  onPress?: () => void;
  /** Senza giorno nella rotaia (la Home lo dice gia nel titolo di sezione). */
  hideDate?: boolean;
}

/**
 * L'`EventCard` di un allenamento o di una gara vista dalla famiglia —
 * **una** composizione per Home, Calendario e dettaglio (prototipo
 * `metaParentTraining` / `actionsRsvp`): rotaia con giorno e ora, titolo,
 * luogo e "Rispondi entro …" (quando c'e un invito aperto), poi la risposta
 * sulla scheda. Lo stato dell'invito lo decide il server; la scheda non
 * inventa un "confermato" da una lettura fallita (`resolveCalendarRsvpBadge`).
 */
export function ParentEventCard({
  item,
  invitations,
  invitationsLoadFailed,
  onAnswer,
  updatingId,
  errorMessage,
  onRetry,
  onPress,
  hideDate = false,
}: ParentEventCardProps) {
  const rail = formatEventDateRail(item.date);
  const invitation = findInvitationForEvent(invitations, item.id);
  const view = resolveRsvpControlView(invitation);
  const badge = resolveCalendarRsvpBadge({
    rsvpRequired: item.rsvpRequired,
    invitation,
    invitationsLoadFailed,
  });

  const meta: EventCardMeta[] = [];
  if (item.location) {
    meta.push({ icon: "location-outline", label: item.location });
  }
  if (view.kind === "pending" && view.deadlineLabel) {
    meta.push({
      icon: "time-outline",
      label: `Rispondi entro ${view.deadlineLabel}`,
    });
  } else if (item.categoryName) {
    meta.push({ icon: "people-outline", label: item.categoryName });
  }

  const title =
    item.kind === "match"
      ? item.opponent
        ? `vs ${item.opponent}`
        : item.title || "Gara"
      : item.title || item.categoryName || "Allenamento";

  return (
    <EventCard
      kind={item.kind}
      title={title}
      dateLabel={
        hideDate || !rail ? undefined : `${rail.dayName} ${rail.dayNumber}`
      }
      time={item.time || "--:--"}
      endTime={item.endTime}
      meta={meta}
      pill={
        badge === "unknown"
          ? { label: "Da verificare", variant: "default" }
          : !onAnswer && badge === "pending"
            ? { label: "Da confermare", variant: "warning" }
            : undefined
      }
      cancelled={["cancelled", "annullato"].includes(
        String(item.status || "").toLowerCase(),
      )}
      onPress={onPress}
      footer={
        onAnswer && view.kind !== "none" ? (
          <RSVPControl
            view={
              view.kind === "pending" ? { ...view, deadlineLabel: null } : view
            }
            updating={updatingId === item.id}
            errorMessage={errorMessage}
            onAnswer={(status) => onAnswer(item.id, status)}
            onRetry={onRetry}
          />
        ) : undefined
      }
    />
  );
}
