import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import type { RsvpInvitation } from "@/services/api";

/**
 * Gli inviti RSVP del figlio selezionato e la risposta della famiglia —
 * **una** implementazione per Home, Calendario e dettaglio evento (il
 * prototipo v3 mette "Ci sarà / Non ci sarà" sulla scheda dell'evento
 * ovunque compaia). Stessa query key `["parent-rsvp", athleteId]`, stessa
 * `answerParentRsvp`: mai ottimistica, l'esito arriva solo quando il server
 * ha confermato e la query e stata invalidata.
 */
export function useParentRsvp(selectedChildId: string | null) {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["parent-rsvp", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentRsvpInvitations(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });

  const invitations: RsvpInvitation[] = query.data || [];

  const answer = async (eventId: string, status: "yes" | "no") => {
    if (!selectedChildId) return;
    setUpdatingId(eventId);
    setErrors((current) => ({ ...current, [eventId]: "" }));
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
      const kind = classifyFetchError(error);
      setErrors((current) => ({
        ...current,
        [eventId]: fetchErrorMessage(
          error,
          kind === "forbidden"
            ? "Accesso non consentito."
            : "Risposta non salvata. Riprova.",
        ),
      }));
    } finally {
      setUpdatingId(null);
    }
  };

  return {
    invitations,
    loadFailed: query.isError,
    refetch: () => void query.refetch(),
    answer,
    updatingId,
    errorFor: (eventId: string) => errors[eventId] || "",
  };
}
