"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { CheckCircle, Clock, Lock, XCircle } from "lucide-react";

/**
 * La conferma di partecipazione della famiglia (G-20, Wave 2 §9).
 *
 * **Cosa era e cosa e diventato.** Questo componente esisteva gia, orfano:
 * nessuno lo importava, salvava le conferme in `localStorage` e la callback
 * `onConfirm` non aveva nessuna implementazione. Voleva dire che la conferma
 * viveva nel browser di chi l'aveva data — un altro dispositivo, o lo stesso
 * dopo una pulizia della cache, non l'aveva mai vista, e la societa non l'aveva
 * mai ricevuta. La **forma visiva** era buona ed e stata tenuta: due scelte,
 * una nota, un pulsante. Il resto ora passa dal server.
 *
 * **Lo stato «gia risposto» arriva dal server**, non da questo componente:
 * chi risponde dal telefono e poi apre il portatile deve vedere la stessa
 * cosa. Per la stessa ragione la risposta si puo **cambiare** finche la
 * scadenza non e passata: un imprevisto arriva dopo la conferma, non prima.
 *
 * **Cosa questo componente non fa, e non deve fare.** Non scrive nessuna
 * presenza. Il «si» e un'intenzione; la presenza la registra l'allenatore il
 * giorno dell'allenamento. Sono due fatti diversi sulla stessa riga, e
 * confonderli manderebbe una promessa nella rendicontazione di un contributo
 * pubblico.
 */

export type AttendanceConfirmationState = "yes" | "no" | "no_response";

export type AttendanceConfirmationResult = {
  trainingId: string;
  athleteId: string;
  status: "yes" | "no";
  note: string;
  answeredAt: string;
};

interface AttendanceConfirmationProps {
  trainingId: string;
  athleteId: string;
  trainingTitle: string;
  /** Data dell'allenamento in ISO, o vuota se il record non ne ha una. */
  trainingDate: string;
  trainingTime?: string;
  /** Ultimo istante utile per rispondere, in ISO. */
  deadline?: string | null;
  /** La risposta gia registrata dal server. */
  state?: AttendanceConfirmationState;
  note?: string;
  answeredAt?: string | null;
  /** Falso quando la scadenza e passata o l'evento e annullato. */
  canAnswer?: boolean;
  /** Il motivo, quando `canAnswer` e falso. */
  blockedMessage?: string;
  /** Notifica al chiamante che il server ha registrato la risposta. */
  onAnswered?: (result: AttendanceConfirmationResult) => void;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatDeadline = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("it-IT", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function AttendanceConfirmation({
  trainingId,
  athleteId,
  trainingTitle,
  trainingDate,
  trainingTime = "",
  deadline = null,
  state = "no_response",
  note = "",
  answeredAt = null,
  canAnswer = true,
  blockedMessage = "",
  onAnswered,
}: AttendanceConfirmationProps) {
  const { showToast } = useToast();
  const [answer, setAnswer] = useState<"yes" | "no" | null>(
    state === "no_response" ? null : state,
  );
  const [notes, setNotes] = useState(note);
  const [editing, setEditing] = useState(state === "no_response");
  const [saving, setSaving] = useState(false);

  /*
    Il server resta la fonte: se il riepilogo viene ricaricato — un'altra
    scheda, un altro dispositivo, un aggiornamento della pagina — lo stato
    locale si riallinea invece di restare indietro mostrando una risposta
    vecchia.
  */
  useEffect(() => {
    setAnswer(state === "no_response" ? null : state);
    setNotes(note);
    setEditing(state === "no_response");
  }, [state, note, trainingId, athleteId]);

  const dateLabel = formatDate(trainingDate);
  const deadlineLabel = formatDeadline(deadline);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!answer) {
      showToast("error", "Indica se l'atleta partecipera all'allenamento");
      return;
    }

    setSaving(true);
    const response = await apiRequest<AttendanceConfirmationResult>(
      "/api/v1/rsvp",
      {
        method: "POST",
        body: {
          training_id: trainingId,
          athlete_id: athleteId,
          status: answer,
          note: notes,
        },
      },
    );
    setSaving(false);

    if (response.error || !response.data) {
      showToast(
        "error",
        response.error?.message || "Risposta non registrata. Riprova.",
      );
      return;
    }

    setEditing(false);
    showToast("success", "Risposta inviata alla societa");
    onAnswered?.(response.data);
  };

  const header = (
    <div className="space-y-1">
      <h3 className="font-medium text-slate-900">{trainingTitle}</h3>
      <p className="text-sm text-muted-foreground">
        {[dateLabel, trainingTime].filter(Boolean).join(" • ")}
      </p>
      {deadlineLabel ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Rispondi entro il {deadlineLabel}
        </p>
      ) : null}
    </div>
  );

  // Scadenza passata o evento annullato: si mostra cosa e stato risposto e
  // perche non si puo piu cambiare. Un pulsante disabilitato senza spiegazione
  // produce una telefonata in segreteria.
  if (!canAnswer) {
    return (
      <Card className="w-full border-slate-200">
        <CardContent className="space-y-3 p-4 sm:p-6">
          {header}
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p>{blockedMessage || "Non e piu possibile rispondere."}</p>
              <p className="font-medium text-slate-900">
                {state === "yes"
                  ? "La tua risposta: ci sara."
                  : state === "no"
                    ? "La tua risposta: non ci sara."
                    : "Non hai risposto a questo invito."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!editing && state !== "no_response") {
    const confirmed = state === "yes";
    return (
      <Card className="w-full border-slate-200">
        <CardContent className="space-y-3 p-4 sm:p-6">
          {header}
          <div
            className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
              confirmed
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {confirmed ? (
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <div className="space-y-1">
              <p className="font-medium">
                {confirmed ? "Hai confermato: ci sara." : "Hai risposto: non ci sara."}
              </p>
              {notes ? <p className="text-xs opacity-90">Nota: {notes}</p> : null}
              {answeredAt ? (
                <p className="text-xs opacity-75">
                  Risposta del {formatDeadline(answeredAt)}
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setEditing(true)}
          >
            Cambia risposta
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Conferma partecipazione</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {header}

            <div className="space-y-2">
              <Label>L&apos;atleta partecipera all&apos;allenamento?</Label>
              <RadioGroup
                value={answer ?? undefined}
                onValueChange={(value) => setAnswer(value === "yes" ? "yes" : "no")}
                className="flex flex-col space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id={`rsvp-yes-${trainingId}`} />
                  <Label
                    htmlFor={`rsvp-yes-${trainingId}`}
                    className="font-normal"
                  >
                    Si, partecipera
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id={`rsvp-no-${trainingId}`} />
                  <Label htmlFor={`rsvp-no-${trainingId}`} className="font-normal">
                    No, non partecipera
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`rsvp-note-${trainingId}`}>Note (opzionale)</Label>
              <Textarea
                id={`rsvp-note-${trainingId}`}
                placeholder="Aggiungi eventuali note..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="h-20"
                maxLength={500}
              />
            </div>
          </div>

          <CardFooter className="flex flex-col gap-2 px-0 pt-4 sm:flex-row">
            <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
              {saving ? "Invio in corso..." : "Conferma"}
            </Button>
            {state !== "no_response" ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => {
                  // In questo ramo esiste gia una risposta: annullare vuol dire
                  // tornare a quella, non svuotare il modulo.
                  setAnswer(state);
                  setNotes(note);
                  setEditing(false);
                }}
                disabled={saving}
              >
                Annulla
              </Button>
            ) : null}
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
