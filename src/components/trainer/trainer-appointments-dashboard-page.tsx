"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { APPOINTMENT_STATUS, resolveStatus } from "@/lib/web/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

/* Lo stato di un appuntamento e una parola in una pillola: APPOINTMENT_STATUS, la stessa dell'area famiglia. */

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
  /*
    **Il motivo del rifiuto e obbligatorio a livello di dominio**
    (`rejectAppointment`, `src/lib/server/appointments.ts`): la famiglia lo
    riceve nel messaggio che chiude la richiesta, ed e cosi da quando questo
    dominio esiste (lane 5E). Questa pagina lo chiamava senza raccoglierlo, e
    ogni «Rifiuta» falliva con 400 «Il motivo del rifiuto e obbligatorio» —
    un'azione offerta dal permesso e mai eseguibile. Il contratto non cambia:
    cambia solo il fatto che qualcuno lo compili prima di inviarlo, come gia
    avviene per la riprogrammazione qui sopra.
  */
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [motivoRifiuto, setMotivoRifiuto] = useState("");

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
      setRejectingId(null);
      setMotivoRifiuto("");
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
      /*
        **`min-w-0` sulla scheda, che e la casella della griglia.**

        La larghezza minima automatica di un elemento di griglia e il suo
        `min-content`, e dentro la scheda c'e un titolo `truncate` — cioe
        `white-space: nowrap` — che di `min-content` ha l'intera riga di testo.
        La colonna non poteva quindi scendere sotto quella misura: a 375 px la
        scheda restava larga 634 px e il `<main>` la **tagliava**, perche
        dichiara `overflow-x-hidden`.

        Tagliata, non scorrevole: il documento non traboccava — la misura di
        §12 e rimasta a zero su tutte e quattro le larghezze — e sul telefono
        sparivano lo stato dell'appuntamento e il terzo pulsante, «Rifiuta».

        Il `min-w-0` sul blocco del testo qui sotto era gia scritto e non
        bastava: quello lascia scendere il **figlio flex**, questo lascia
        scendere la **casella della griglia**. Servono entrambi, e solo insieme
        il `truncate` fa il proprio mestiere invece di gonfiare l'antenato.
      */
      <article
        key={appointment.id}
        className="min-w-0 rounded-egw-panel-sm border border-egw-hairline bg-white p-4 shadow-egw-plane-1"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-egw-ink">
              {appointment.reason || "Colloquio"}
            </p>
            <p className="mt-1 text-xs text-egw-ink-62">
              {nomeAtleta(appointment.athlete_id)}
            </p>
          </div>
          <StatusPill
            status={APPOINTMENT_STATUS[appointment.status as keyof typeof APPOINTMENT_STATUS] || resolveStatus(appointment.status)}
            size="sm"
            className="shrink-0"
          />
        </div>

        <p className="mt-3 text-sm text-egw-ink-72">
          {formatDate(appointment.date)} · {String(appointment.time || "")}
        </p>
        {appointment.notes ? (
          <p className="mt-2 whitespace-pre-line text-sm text-egw-ink-72">
            {appointment.notes}
          </p>
        ) : null}
        {appointment.decision_note ? (
          <p className="mt-2 text-sm text-egw-ink-62">
            Motivo: {appointment.decision_note}
          </p>
        ) : null}

        {rejectingId === appointment.id ? (
          <div className="mt-4 space-y-3 rounded-egw-panel-sm border border-egw-tint-red-bd bg-egw-tint-red p-3">
            <label className="block text-xs font-medium text-egw-ink-72">
              Motivo del rifiuto (obbligatorio, la famiglia lo legge)
              <Textarea
                value={motivoRifiuto}
                onChange={(event) => setMotivoRifiuto(event.target.value)}
                className="mt-1 w-full rounded-egw-field bg-white"
                rows={2}
                placeholder="Es. Orario non disponibile, contatterò la famiglia per una nuova data"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-egw-field text-egw-red"
                disabled={inCorso || !motivoRifiuto.trim()}
                onClick={() =>
                  esegui(
                    appointment.id,
                    () =>
                      rejectClubAppointment(
                        appointment.id,
                        { note: motivoRifiuto.trim(), version: appointment.version },
                        headers,
                      ),
                    "Appuntamento rifiutato",
                  )
                }
              >
                <XCircle className="mr-2 h-4 w-4" />
                Conferma rifiuto
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-egw-field"
                onClick={() => {
                  setRejectingId(null);
                  setMotivoRifiuto("");
                }}
              >
                Annulla
              </Button>
            </div>
          </div>
        ) : null}

        {reschedulingId === appointment.id ? (
          <div className="mt-4 space-y-3 rounded-egw-panel-sm border border-egw-tint-blue-bd bg-egw-tint-blue p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-egw-ink-72">
                Nuova data
                <Input
                  type="date"
                  value={nuovaData}
                  onChange={(event) => setNuovaData(event.target.value)}
                  className="mt-1 w-full rounded-egw-field bg-white"
                />
              </label>
              <label className="block text-xs font-medium text-egw-ink-72">
                Nuovo orario
                <Input
                  type="time"
                  value={nuovaOra}
                  onChange={(event) => setNuovaOra(event.target.value)}
                  className="mt-1 w-full rounded-egw-field bg-white"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-egw-blue hover:bg-egw-blue-700"
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
                className="rounded-egw-field"
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
                className="bg-egw-green hover:bg-egw-green/90"
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
                className="rounded-egw-field"
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
            {puoRifiutare && rejectingId !== appointment.id ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-egw-field text-egw-red"
                disabled={inCorso}
                onClick={() => {
                  setRejectingId(appointment.id);
                  setMotivoRifiuto("");
                }}
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
            className="w-full justify-center gap-2 rounded-egw-panel-sm sm:w-auto"
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
