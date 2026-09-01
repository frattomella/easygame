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
 * Gli inviti di partecipazione della famiglia.
 *
 * **Perche una sezione che si legge da sola il server.** L'elenco degli
 * allenamenti dell'area genitore arriva da `/api/parent-dashboard/[id]`, che
 * non sa niente di RSVP. Farglielo sapere avrebbe voluto dire allargare quel
 * payload — e la dashboard famiglia — per una funzione che riguarda solo
 * questa pagina. Qui la sezione chiede `/api/v1/rsvp?athlete_id=...`, che e la
 * stessa lettura che vede la scadenza e l'evento annullato con le stesse
 * regole dello staff.
 *
 * **Perche filtra per tipo.** La stessa lettura porta ormai allenamenti e
 * gare, e le due cose vivono su due pagine diverse dell'area famiglia. Gli
 * inviti stanno dove sta l'evento a cui appartengono: un invito a una gara in
 * fondo alla pagina «Allenamenti» e un invito che si legge nel posto
 * sbagliato, e il tipo predefinito e l'allenamento perche e quello il montaggio
 * che esisteva prima.
 *
 * **Quando non compare.** Se non c'e nessun evento di quel tipo con conferma
 * richiesta nei prossimi giorni, la sezione non si disegna: uno spazio vuoto
 * con un titolo racconta un problema che non c'e.
 */

type RsvpInvitationKind = "training" | "match";

type RsvpInvitation = {
  trainingId: string;
  athleteId: string;
  kind: RsvpInvitationKind;
  opponent: string;
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

const SECTION_TITLES: Record<RsvpInvitationKind, string> = {
  training: "Conferme di partecipazione",
  match: "Conferme per le gare",
};

export function ParentRsvpSection({
  kind = "training",
}: {
  kind?: RsvpInvitationKind;
} = {}) {
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
    const ricevuti =
      response.error || !Array.isArray(response.data?.invitations)
        ? []
        : response.data.invitations;

    /*
      Un invito senza `kind` e un invito letto da un server piu vecchio di
      questa schermata: si considera un allenamento, che e cio che l'elenco
      conteneva prima che le gare vi entrassero. Meglio mostrarlo dove stava
      che non mostrarlo affatto.
    */
    setInvitations(
      ricevuti.filter(
        (invitation) => (invitation.kind || "training") === kind,
      ),
    );
    setLoaded(true);
  }, [athleteId, kind]);

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
          {SECTION_TITLES[kind]}
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
              /*
                Il titolo dice **che cosa** si conferma: il server lo compone
                gia con l'avversario quando la gara non ha un titolo suo, e
                qui si aggiunge la categoria. Il ripiego segue il tipo, perche
                chiamare «Allenamento» una gara e la stessa confusione da cui
                nasceva il difetto.
              */
              trainingTitle={
                [invitation.title, invitation.categoryLabel]
                  .filter(Boolean)
                  .join(" · ") ||
                (kind === "match" ? "Gara" : "Allenamento")
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
