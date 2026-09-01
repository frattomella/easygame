"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-notification";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  SectionBlockedState,
  SectionEmptyState,
  SurfacePanel,
  formatDate,
  getAthleteDisplayName,
} from "@/components/trainer/trainer-dashboard-shared";
import {
  confirmClubAppointment,
  listClubAppointments,
  rejectClubAppointment,
  rescheduleClubAppointment,
  type ClubAppointment,
} from "@/lib/api/appointments-client";
import { cn } from "@/lib/utils";

/**
 * **Gli appuntamenti assegnati all'allenatore.**
 *
 * Nel piano questo e il caso d'uso che «oggi non esiste affatto»: il dominio
 * degli appuntamenti e stato costruito dalla lane 5E, l'allenatore ha
 * `appointments.read_own` e `appointments.manage` ristretti a
 * `assigned_to_user_id = userId`, e non c'era **nessuna schermata** da cui
 * usarli. Un colloquio con la famiglia di un proprio atleta arrivava in coda
 * alla segreteria e li restava.
 *
 * **Il perimetro non e disegnato qui.** Questa pagina chiede
 * `GET /api/v1/appointments` senza filtri: e il servizio che, per chi ha
 * soltanto `read_own`, impone `assigned_to_user_id = <chi chiede>` prima di
 * qualunque altra condizione. Se domani qualcuno aggiungesse qui un filtro «i
 * miei», il confine sembrerebbe vivere nel browser — e la prima persona che
 * legge il codice penserebbe che togliendolo si vede tutto. Non si vede.
 *
 * **La riprogrammazione non sposta la data.** Chiude la riga e ne crea una
 * nuova collegata (ADR della lane 5E): per questo dopo l'azione si **ricarica**
 * invece di aggiornare la riga in mano, che a quel punto e chiusa.
 */

const STATUS_BADGE_CLASSES: Record<string, string> = {
  requested: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50",
  confirmed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  rejected: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50",
  rescheduled: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
  completed: "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
  no_show: "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
  cancelled_by_family:
    "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
  cancelled_by_club:
    "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
};

const APERTI = new Set(["requested", "confirmed", "rescheduled"]);

export default function ClubAppointmentsDashboardPage() {
  const { activeClub, assignedAthletes, permissions } = useTrainerDashboard();
  const { showToast } = useToast();
  const [appointments, setAppointments] = useState<ClubAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [nuovaData, setNuovaData] = useState("");
  const [nuovaOra, setNuovaOra] = useState("");

  const headers = useMemo<Record<string, string>>(
    () => {
      const value: Record<string, string> = {};
      if (activeClub?.id) value["x-active-club-id"] = String(activeClub.id);
      return value;
    },
    [activeClub?.id],
  );

  const carica = useCallback(async () => {
    if (!activeClub?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setAppointments(await listClubAppointments(headers));
    } catch (error) {
      console.error("Errore lettura appuntamenti allenatore:", error);
      /*
        Un 403 qui non e un caso limite: e la risposta corretta per un ruolo a
        cui il club non ha dato `appointments.read_own`. Va detto, non
        inghiottito — inghiottirlo e esattamente il difetto D-2, dove sette
        403 al caricamento passavano per «nessun dato».
      */
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Errore nel caricamento degli appuntamenti",
      );
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [activeClub?.id, headers, showToast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const nomeAtleta = useCallback(
    (athleteId: string | null) => {
      if (!athleteId) return "Appuntamento di segreteria";
      const atleta = assignedAthletes.find(
        (entry: any) => String(entry?.id || "") === athleteId,
      );
      return atleta ? getAthleteDisplayName(atleta) : "Atleta";
    },
    [assignedAthletes],
  );

  if (!permissions.navigation.appointments) {
    return <SectionBlockedState section="appointments" />;
  }

  const esegui = async (
    id: string,
    azione: () => Promise<unknown>,
    successo: string,
  ) => {
    setBusyId(id);
    try {
      await azione();
      showToast("success", successo);
      setReschedulingId(null);
      setNuovaData("");
      setNuovaOra("");
      await carica();
    } catch (error) {
      console.error("Errore aggiornamento appuntamento:", error);
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Errore nell'aggiornamento dell'appuntamento",
      );
    } finally {
      setBusyId(null);
    }
  };

  const aperti = appointments.filter((entry) => APERTI.has(entry.status));
  const chiusi = appointments.filter((entry) => !APERTI.has(entry.status));

  const renderCard = (appointment: ClubAppointment) => {
    const transizioni = Array.isArray(appointment.transitions)
      ? appointment.transitions
      : [];
    /*
      I pulsanti li detta la **macchina a stati del dominio**, non questa
      schermata: `transitions` dice cosa e ammesso da questo stato per questo
      lato. Disegnare tre pulsanti fissi vorrebbe dire offrire azioni che il
      server rifiuta, e insegnare a chi le usa che l'applicazione da errore.
    */
    const puoConfermare = transizioni.includes("confirmed");
    const puoRifiutare = transizioni.includes("rejected");
    const puoRiprogrammare = transizioni.includes("rescheduled");
    const inCorso = busyId === appointment.id;

    return (
      <article
        key={appointment.id}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">
              {appointment.reason || "Colloquio"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {nomeAtleta(appointment.athlete_id)}
            </p>
          </div>
          <Badge
            className={cn(
              "shrink-0",
              STATUS_BADGE_CLASSES[appointment.status] ||
                "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
            )}
          >
            {appointment.status_label}
          </Badge>
        </div>

        <p className="mt-3 text-sm text-slate-600">
          {formatDate(appointment.date)} · {String(appointment.time || "")}
        </p>
        {appointment.notes ? (
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
            {appointment.notes}
          </p>
        ) : null}
        {appointment.decision_note ? (
          <p className="mt-2 text-sm text-slate-500">
            Motivo: {appointment.decision_note}
          </p>
        ) : null}

        {reschedulingId === appointment.id ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-700">
                Nuova data
                <Input
                  type="date"
                  value={nuovaData}
                  onChange={(event) => setNuovaData(event.target.value)}
                  className="mt-1 w-full rounded-xl bg-white"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Nuovo orario
                <Input
                  type="time"
                  value={nuovaOra}
                  onChange={(event) => setNuovaOra(event.target.value)}
                  className="mt-1 w-full rounded-xl bg-white"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={inCorso || !nuovaData || !nuovaOra}
                onClick={() =>
                  esegui(
                    appointment.id,
                    () =>
                      rescheduleClubAppointment(
                        appointment.id,
                        {
                          date: nuovaData,
                          time: nuovaOra,
                          version: appointment.version,
                        },
                        headers,
                      ),
                    "Appuntamento riprogrammato",
                  )
                }
              >
                Conferma spostamento
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => setReschedulingId(null)}
              >
                Annulla
              </Button>
            </div>
          </div>
        ) : null}

        {puoConfermare || puoRifiutare || puoRiprogrammare ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {puoConfermare ? (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={inCorso}
                onClick={() =>
                  esegui(
                    appointment.id,
                    () =>
                      confirmClubAppointment(
                        appointment.id,
                        { version: appointment.version },
                        headers,
                      ),
                    "Appuntamento confermato",
                  )
                }
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Conferma
              </Button>
            ) : null}
            {puoRiprogrammare ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={inCorso}
                onClick={() => {
                  setReschedulingId(appointment.id);
                  setNuovaData(String(appointment.date || ""));
                  setNuovaOra(String(appointment.time || ""));
                }}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Riprogramma
              </Button>
            ) : null}
            {puoRifiutare ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl text-rose-700"
                disabled={inCorso}
                onClick={() =>
                  esegui(
                    appointment.id,
                    () =>
                      rejectClubAppointment(
                        appointment.id,
                        { version: appointment.version },
                        headers,
                      ),
                    "Appuntamento rifiutato",
                  )
                }
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rifiuta
              </Button>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <div className="space-y-6 pb-2">
      <PageHeading
        eyebrow="Dashboard trainer"
        title="Appuntamenti"
        subtitle="Solo gli appuntamenti assegnati a te."
      />

      <SurfacePanel
        title="Da gestire"
        description="Richieste in attesa e appuntamenti confermati."
        icon={CalendarClock}
        action={
          <Button
            variant="outline"
            className="w-full justify-center gap-2 rounded-2xl sm:w-auto"
            onClick={() => void carica()}
            disabled={loading}
          >
            <RefreshCcw className="h-4 w-4" />
            Aggiorna
          </Button>
        }
      >
        {loading ? (
          <SectionEmptyState
            title="Caricamento appuntamenti"
            description="Sto leggendo gli appuntamenti assegnati a te."
          />
        ) : aperti.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {aperti.map(renderCard)}
          </div>
        ) : (
          <SectionEmptyState
            title="Nessun appuntamento aperto"
            description="La segreteria non ti ha assegnato colloqui da gestire."
          />
        )}
      </SurfacePanel>

      {chiusi.length > 0 ? (
        <SurfacePanel title="Storico" icon={CalendarClock}>
          <div className="grid gap-3 xl:grid-cols-2">
            {chiusi.map(renderCard)}
          </div>
        </SurfacePanel>
      ) : null}
    </div>
  );
}
