"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";
import { useParentDashboard } from "@/components/parent-dashboard/parent-dashboard-context";
import {
  AttendanceConfirmation,
  type AttendanceConfirmationState,
} from "@/components/parent/AttendanceConfirmation";

/**
 * Gli inviti di partecipazione della famiglia, sulla pagina degli allenamenti.
 *
 * **Perche una sezione che si legge da sola il server.** L'elenco degli
 * allenamenti dell'area genitore arriva da `/api/parent-dashboard/[id]`, che
 * non sa niente di RSVP. Farglielo sapere avrebbe voluto dire allargare quel
 * payload — e la dashboard famiglia — per una funzione che riguarda solo
 * questa pagina. Qui la sezione chiede `/api/v1/rsvp?athlete_id=...`, che e la
 * stessa lettura che vede la scadenza e l'evento annullato con le stesse
 * regole dello staff.
 *
 * **Quando non compare.** Se non c'e nessun allenamento con conferma richiesta
 * nei prossimi giorni, la sezione non si disegna: uno spazio vuoto con un
 * titolo racconta un problema che non c'e.
 */

type RsvpInvitation = {
  trainingId: string;
  athleteId: string;
  title: string;
  categoryLabel: string;
  location: string;
  startsAt: string | null;
  time: string;
  deadline: string | null;
  state: AttendanceConfirmationState;
  note: string;
  answeredAt: string | null;
  canAnswer: boolean;
  blockedMessage: string;
};

export function ParentRsvpSection() {
  const { data } = useParentDashboard();
  const athleteId = data?.athlete?.id ? String(data.athlete.id) : "";
  const [invitations, setInvitations] = useState<RsvpInvitation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!athleteId) return;

    const response = await apiRequest<{ invitations: RsvpInvitation[] }>(
      `/api/v1/rsvp?athlete_id=${encodeURIComponent(athleteId)}`,
    );

    /*
      Un errore qui non e un errore della pagina: gli allenamenti restano
      leggibili anche se gli inviti non arrivano. Si smette di mostrare la
      sezione, non si rompe la schermata.
    */
    setInvitations(
      response.error || !Array.isArray(response.data?.invitations)
        ? []
        : response.data.invitations,
    );
    setLoaded(true);
  }, [athleteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded || invitations.length === 0) return null;

  const pending = invitations.filter(
    (invitation) => invitation.state === "no_response" && invitation.canAnswer,
  ).length;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>
          Conferme di partecipazione
          {pending > 0 ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pending} da confermare
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {invitations.map((invitation) => (
            <AttendanceConfirmation
              key={`${invitation.trainingId}-${invitation.athleteId}`}
              trainingId={invitation.trainingId}
              athleteId={invitation.athleteId}
              trainingTitle={
                [invitation.title, invitation.categoryLabel]
                  .filter(Boolean)
                  .join(" · ") || "Allenamento"
              }
              trainingDate={invitation.startsAt || ""}
              trainingTime={invitation.time}
              deadline={invitation.deadline}
              state={invitation.state}
              note={invitation.note}
              answeredAt={invitation.answeredAt}
              canAnswer={invitation.canAnswer}
              blockedMessage={invitation.blockedMessage}
              onAnswered={() => {
                void load();
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
