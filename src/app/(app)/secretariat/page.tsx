"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, CalendarDays, Check, ChevronRight, Pencil, Plus, StickyNote, Trash2, UserX, X } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { RowActionDef } from "@/components/web/datagrid/types";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { formatInteger } from "@/lib/web/format";
import { getClubData, addClubData, deleteClubDataItem, getClubStaff, updateClubDataArray, getClubAthletes, getClubTrainers } from "@/lib/simplified-db";
import {
  cancelClubAppointment,
  closeClubAppointment,
  confirmClubAppointment,
  createClubAppointment,
  listClubAppointments,
  rejectClubAppointment,
  rescheduleClubAppointment,
  type ClubAppointment,
} from "@/lib/api/appointments-client";
import { AgendaRail } from "@/components/secretariat/v2/agenda-rail";
import { AppointmentInspector, type AppointmentDecision } from "@/components/secretariat/v2/appointment-inspector";
import { NewAppointmentDrawer, type NewAppointmentValues } from "@/components/secretariat/v2/new-appointment-drawer";
import { NoteDrawer, type NoteFormValues } from "@/components/secretariat/v2/note-drawer";
import { OpeningHoursPanel } from "@/components/secretariat/v2/opening-hours-panel";
import { APPOINTMENT_VIEWS, NOTE_VIEWS, appointmentColumns, appointmentFilters, appointmentSearch, noteColumns, noteFilters, noteSearch } from "@/components/secretariat/v2/secretariat-grids";
import {
  SECRETARIAT_AREAS,
  appointmentDay,
  buildSecretariatPeople,
  countOpenDays,
  emptyOpeningHours,
  intestazioniClub,
  isAppointmentOnDay,
  isInWeekOf,
  isLiveAppointment,
  isSameDay,
  isSecretariatArea,
  normalizeNote,
  normalizeOpeningHours,
  reminderTargetOptions,
  type AgendaScope,
  type OpeningHours,
  type SecretariatArea,
  type SecretariatNote,
  type SecretariatPeople,
} from "@/components/secretariat/v2/secretariat-model";

/**
 * `/secretariat` — la Segreteria (Web V2). Tre aree al posto delle tre schede
 * della V1, scelte da un controllo segmentato sotto l'intestazione e
 * rispecchiate in `?area=`: **Appuntamenti** (la coda, pattern 10: griglia +
 * rail della settimana), **Note e promemoria** (griglia + cassetto),
 * **Orari di apertura** (pannello con salvataggio unico).
 *
 * Gli appuntamenti arrivano dal dominio, non da `clubs.appointments`: con la
 * riga arrivano lo stato vero, la versione per il controllo ottimistico e le
 * mosse ammesse (`actions`, W6-51), che decide il dominio e non questa
 * schermata. Ogni scrittura e quella della V1: gli stessi sette verbi del
 * trasporto, `x-active-club-id` nell'intestazione, la `version` nella
 * decisione. Le note e gli orari restano in `clubs.secretariat_notes` e
 * `clubs.opening_hours` via `simplified-db`, letti anche dalla bacheca
 * dell'allenatore e dalla Dashboard.
 *
 * Nessun predicato client sui permessi, come la V1: i quattro ruoli di
 * gestione che passano la guardia hanno tutte le chiavi (`appointments.read`,
 * `appointments.manage`, `appointments.request` = GESTIONE), e per un ruolo
 * personalizzato il browser ha solo lo slug — risponde la rotta.
 */
const NO_CLUB = "Nessun club attivo trovato. Ricarica la pagina.";

export default function SecretariatPage() {
  const { showToast } = useToast();
  const { user, activeClub } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/secretariat";
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);
  const [confirm, confirmDialog] = useConfirm();

  /* ── L'area attiva e l'indirizzo ───────────────────────────────────────── */
  const [area, setArea] = React.useState<SecretariatArea>(() => {
    const requested = searchParams.get("area");
    return isSecretariatArea(requested) ? requested : "appuntamenti";
  });

  const selectArea = React.useCallback(
    (next: SecretariatArea) => {
      setArea(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "appuntamenti") params.delete("area");
      else params.set("area", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    const requested = searchParams.get("area");
    if (isSecretariatArea(requested) && requested !== area) setArea(requested);
    // L'indirizzo guida l'area; `area` cambia per il clic e non deve rieseguire l'effetto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* ── Dati ──────────────────────────────────────────────────────────────── */
  const [appointments, setAppointments] = React.useState<ClubAppointment[]>([]);
  const [notes, setNotes] = React.useState<SecretariatNote[]>([]);
  const [openingHours, setOpeningHours] = React.useState<OpeningHours>(emptyOpeningHours);
  const [savedOpeningHours, setSavedOpeningHours] = React.useState<OpeningHours>(emptyOpeningHours);
  const [people, setPeople] = React.useState<SecretariatPeople>({ staff: [], trainers: [], members: [], athletes: [], nominativi: [] });
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!user || !activeClub?.id) {
      setLoading(false);
      return;
    }
    const clubId = activeClub.id;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [appointmentsData, notesData, openingHoursData, staffData, athletesData, trainersData, membersData] = await Promise.all([
          listClubAppointments(intestazioniClub(clubId)),
          getClubData(clubId, "secretariat_notes"),
          getClubData(clubId, "opening_hours"),
          getClubStaff(clubId),
          getClubAthletes(clubId),
          getClubTrainers(clubId),
          getClubData(clubId, "members"),
        ]);
        if (cancelled) return;
        /*
          Nessuna conversione: la proiezione del dominio porta gia `date` e
          `time` nel fuso del club. Convertirle con `new Date` le riporterebbe
          nel fuso del browser.
        */
        setAppointments((appointmentsData || []) as ClubAppointment[]);
        setNotes((notesData || []).map((note: Record<string, any>) => normalizeNote(note)));
        const hours = openingHoursData && openingHoursData.length > 0 ? normalizeOpeningHours(openingHoursData[0]) : emptyOpeningHours();
        setOpeningHours(hours);
        setSavedOpeningHours(hours);
        setPeople(buildSecretariatPeople({ staff: staffData, athletes: athletesData, trainers: trainersData, members: membersData }));
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error("[SecretariatPage] Error loading secretariat data:", error);
        setLoadError(error instanceof Error && error.message ? error.message : "Errore nel caricamento dei dati della segreteria");
        showToast("error", "Errore nel caricamento dei dati della segreteria");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeClub?.id, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  /* ── Agenda: giorno, settimana, ambito ─────────────────────────────────── */
  const [selectedDate, setSelectedDate] = React.useState<Date>(() => new Date());
  const [scope, setScope] = React.useState<AgendaScope>("week");

  const agendaRows = React.useMemo(() => {
    if (scope === "all") return appointments;
    return appointments.filter((appointment) => {
      const day = appointmentDay(appointment);
      if (!day) return false;
      return scope === "day" ? isSameDay(day, selectedDate) : isInWeekOf(day, selectedDate);
    });
  }, [appointments, scope, selectedDate]);

  const countOnDay = React.useCallback((date: Date) => appointments.filter((appointment) => isLiveAppointment(appointment) && isAppointmentOnDay(appointment, date)).length, [appointments]);

  /* ── Cassetti e ispettore ──────────────────────────────────────────────── */
  const [newAppointmentOpen, setNewAppointmentOpen] = React.useState(false);
  const [inspecting, setInspecting] = React.useState<ClubAppointment | null>(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [noteDrawer, setNoteDrawer] = React.useState<{ open: boolean; note: SecretariatNote | null }>({ open: false, note: null });
  const [decidendo, setDecidendo] = React.useState(false);
  const [requestedAppointmentView, setRequestedAppointmentView] = React.useState<string | null>(null);

  const openInspector = (appointment: ClubAppointment) => {
    setInspecting(appointment);
    setInspectorOpen(true);
  };

  /* `?action=new` apre il modulo di creazione dell'area corrente (azioni rapide). */
  React.useEffect(() => {
    if (searchParams.get("action") !== "new") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    const requested = params.get("area");
    const target: SecretariatArea = isSecretariatArea(requested) ? requested : "appuntamenti";
    if (target === "note") setNoteDrawer({ open: true, note: null });
    else if (target === "appuntamenti") setNewAppointmentOpen(true);
    const query = params.toString();
    const frame = window.requestAnimationFrame(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, router, searchParams]);

  /* ── Scritture: appuntamenti (gli stessi verbi della V1) ───────────────── */
  const addAppointment = async (values: NewAppointmentValues) => {
    if (!activeClub?.id) {
      showToast("error", NO_CLUB);
      return false;
    }
    try {
      /*
        `outsideAvailability` e il colloquio preso al telefono: la
        disponibilita configurata vale per chi prenota da casa, non per chi sta
        parlando con la segretaria. Lo dichiara con il permesso di farlo
        (`appointments.manage`, verificato dal server) e resta nell'audit.
      */
      const creato = await createClubAppointment(
        {
          date: values.date,
          time: values.time,
          reason: values.title,
          notes: values.description,
          internalNotes: values.person ? `Nominativo: ${values.person}` : null,
          outsideAvailability: true,
          idempotencyKey: `desk-${activeClub.id}-${values.date}-${values.time}-${values.title}`,
        },
        intestazioniClub(activeClub.id),
      );
      if (creato) setAppointments((prev) => [...prev, creato]);
      showToast("success", "Appuntamento aggiunto con successo");
      return true;
    } catch (error) {
      console.error("Error adding appointment:", error);
      // Il messaggio del dominio arriva fin qui: «quell'orario e appena stato preso» dice cosa fare, «errore» no.
      showToast("error", String((error as Error)?.message || "Errore nel salvare l'appuntamento"));
      return false;
    }
  };

  /**
   * **Un appuntamento non si cancella: si annulla.** La riga resta, la
   * famiglia legge «Annullato dalla segreteria» e il motivo, e l'audit
   * conserva chi ha deciso.
   */
  const annullaAppuntamento = async (appuntamento: ClubAppointment, nota: string) => {
    if (!activeClub?.id) return;
    const aggiornato = await cancelClubAppointment(appuntamento.id, { note: nota || null, version: appuntamento.version ?? null }, intestazioniClub(activeClub.id));
    setAppointments((prev) => prev.map((app) => (app.id === appuntamento.id && aggiornato ? aggiornato : app)));
    if (aggiornato) setInspecting(aggiornato);
    showToast("success", "Appuntamento annullato: la famiglia lo vedra");
  };

  /**
   * Le due risposte a una richiesta. La **versione** viaggia con la decisione:
   * due operatori che rispondono insieme non si sovrascrivono, il secondo
   * riceve un rifiuto e ricarica.
   */
  const decidiAppuntamento = async (appuntamento: ClubAppointment, azione: "confirm" | "reject", nota: string) => {
    if (!activeClub?.id) return;
    const input = { note: nota || null, version: appuntamento.version ?? null };
    const aggiornato =
      azione === "confirm"
        ? await confirmClubAppointment(appuntamento.id, input, intestazioniClub(activeClub.id))
        : await rejectClubAppointment(appuntamento.id, input, intestazioniClub(activeClub.id));
    if (aggiornato) {
      setAppointments((prev) => prev.map((app) => (app.id === appuntamento.id ? aggiornato : app)));
      setInspecting(aggiornato);
    }
    showToast("success", azione === "confirm" ? "Appuntamento confermato: la famiglia riceve la notifica" : "Richiesta rifiutata: alla famiglia arriva il motivo");
  };

  /**
   * **Spostare non e modificare la data.** Il dominio chiude la riga vecchia
   * e ne crea una nuova collegata (ADR-0101): la risposta porta due righe e
   * questa schermata non puo aggiornarne una sola. Si rilegge dalla sorgente.
   */
  const riprogrammaAppuntamento = async (appuntamento: ClubAppointment, nuovaData: string, nuovaOra: string, nota: string) => {
    if (!activeClub?.id || decidendo) return false;
    if (!nuovaData || !nuovaOra) {
      showToast("error", "Indica il nuovo giorno e il nuovo orario");
      return false;
    }
    setDecidendo(true);
    try {
      await rescheduleClubAppointment(
        appuntamento.id,
        { date: nuovaData, time: nuovaOra, note: nota || null, version: appuntamento.version ?? null },
        intestazioniClub(activeClub.id),
      );
      const aggiornati = await listClubAppointments(intestazioniClub(activeClub.id));
      setAppointments(aggiornati);
      setInspecting(null);
      showToast("success", "Appuntamento spostato: la famiglia riceve il nuovo orario");
      return true;
    } catch (error) {
      console.error("Error rescheduling appointment:", error);
      showToast("error", String((error as Error)?.message || "Non riesco a spostarlo adesso"));
      return false;
    } finally {
      setDecidendo(false);
    }
  };

  /**
   * La chiusura di un appuntamento avvenuto, o mancato. La nota qui non e per
   * la famiglia: finisce in `internal_notes` e non parte nessuna notifica.
   */
  const chiudiAppuntamento = async (appuntamento: ClubAppointment, esito: "complete" | "no-show", nota: string) => {
    if (!activeClub?.id) return;
    const aggiornato = await closeClubAppointment(appuntamento.id, { outcome: esito, note: nota || null, version: appuntamento.version ?? null }, intestazioniClub(activeClub.id));
    if (aggiornato) {
      setAppointments((prev) => prev.map((app) => (app.id === appuntamento.id ? aggiornato : app)));
      setInspecting(aggiornato);
    }
    showToast("success", esito === "complete" ? "Appuntamento concluso" : "Assenza registrata: resta una nota interna");
  };

  /**
   * Una mossa dall'ispettore o dalla riga. Rifiuto e annullo sono terminali e
   * avvisano la famiglia: chiedono conferma (§8.9, «notevole»); conferma,
   * concluso e assente no — come la V1, con il toast.
   */
  const decide = async (appuntamento: ClubAppointment, decision: AppointmentDecision, nota: string) => {
    if (!activeClub?.id || decidendo) return;
    if (decision === "reject") {
      const ok = await confirm({
        title: `Rifiutare la richiesta di ${appuntamento.title || "appuntamento"}?`,
        description: "La famiglia riceve il rifiuto con il motivo che hai scritto. Una richiesta rifiutata non si riapre.",
        confirmLabel: "Rifiuta",
        tone: "danger",
      });
      if (!ok) return;
    }
    if (decision === "cancel") {
      const ok = await confirm({
        title: `Annullare ${appuntamento.title || "l'appuntamento"}?`,
        description: "Non e una cancellazione: la riga resta con «Annullato dalla segreteria» e la famiglia legge la nota. Un appuntamento annullato non si riapre.",
        confirmLabel: "Annulla l'appuntamento",
        cancelLabel: "Torna indietro",
        tone: "danger",
      });
      if (!ok) return;
    }
    setDecidendo(true);
    try {
      if (decision === "confirm" || decision === "reject") await decidiAppuntamento(appuntamento, decision, nota);
      else if (decision === "cancel") await annullaAppuntamento(appuntamento, nota);
      else await chiudiAppuntamento(appuntamento, decision, nota);
    } catch (error) {
      console.error("Error deciding appointment:", error);
      const fallback = decision === "cancel" ? "Errore nell'annullare l'appuntamento" : decision === "confirm" || decision === "reject" ? "Non riesco a rispondere adesso" : "Non riesco a chiuderlo adesso";
      showToast("error", String((error as Error)?.message || fallback));
    } finally {
      setDecidendo(false);
    }
  };

  /* ── Scritture: note (le stesse funzioni della V1) ─────────────────────── */
  const buildReminderTargetData = (targetType: NoteFormValues["targetType"], targetId: string) => {
    if (targetType === "club_dashboard" || targetType === "all_trainers") return { targetType, targetId: "", targetLabel: "" };
    const selected = reminderTargetOptions(people, targetType).find((option) => option.id === targetId);
    return { targetType, targetId, targetLabel: selected?.label || "" };
  };

  const saveNote = async (values: NoteFormValues, existing: SecretariatNote | null) => {
    if (!activeClub?.id) {
      showToast("error", NO_CLUB);
      return false;
    }
    const targetData = buildReminderTargetData(values.targetType, values.targetId);
    const expiryDate = values.expiryDate ? new Date(values.expiryDate) : undefined;
    const notificationTime = values.isAllDay ? "08:00" : values.notificationTime;
    if (!existing) {
      try {
        const note = {
          id: `note-${Date.now()}`,
          content: values.content,
          date: new Date(),
          expiryDate,
          notificationEnabled: values.notificationEnabled,
          isAllDay: values.isAllDay,
          notificationTime,
          ...targetData,
        };
        await addClubData(activeClub.id, "secretariat_notes", note);
        setNotes((prev) => [...prev, normalizeNote(note)]);
        showToast("success", "Nota aggiunta con successo");
        return true;
      } catch (error) {
        console.error("Error adding note:", error);
        showToast("error", "Errore nel salvare la nota");
        return false;
      }
    }
    try {
      const updatedNotes = notes.map((note) =>
        note.id === existing.id
          ? { ...note, content: values.content, expiryDate, notificationEnabled: values.notificationEnabled, isAllDay: values.isAllDay, notificationTime, ...targetData }
          : note,
      );
      await updateClubDataArray(activeClub.id, "secretariat_notes", updatedNotes);
      setNotes(updatedNotes);
      showToast("success", "Nota aggiornata con successo");
      return true;
    } catch (error) {
      console.error("Error updating note:", error);
      showToast("error", "Errore nell'aggiornare la nota");
      return false;
    }
  };

  const deleteNote = async (note: SecretariatNote) => {
    if (!activeClub?.id) return;
    const ok = await confirm({
      title: "Eliminare questa nota?",
      description: note.content.length > 120 ? `${note.content.slice(0, 120)}…` : note.content,
      confirmLabel: "Elimina",
      tone: "danger",
      consequences: note.notificationEnabled ? ["La notifica programmata non parte piu"] : undefined,
      irreversible: true,
    });
    if (!ok) return;
    try {
      await deleteClubDataItem(activeClub.id, "secretariat_notes", note.id);
      setNotes((prev) => prev.filter((row) => row.id !== note.id));
      showToast("success", "Nota eliminata con successo");
    } catch (error) {
      console.error("Error deleting note:", error);
      showToast("error", "Errore nell'eliminare la nota");
    }
  };

  /* ── Scritture: orari di apertura ──────────────────────────────────────── */
  const [savingHours, setSavingHours] = React.useState(false);
  const hoursDirty = JSON.stringify(openingHours) !== JSON.stringify(savedOpeningHours);

  const saveOpeningHours = async () => {
    if (!activeClub?.id) {
      showToast("error", NO_CLUB);
      return;
    }
    setSavingHours(true);
    try {
      await updateClubDataArray(activeClub.id, "opening_hours", [openingHours]);
      setSavedOpeningHours(openingHours);
      showToast("success", "Orari di apertura salvati con successo");
    } catch (error) {
      console.error("Error saving opening hours:", error);
      showToast("error", "Errore nel salvare gli orari di apertura");
    } finally {
      setSavingHours(false);
    }
  };

  /* ── Griglie ───────────────────────────────────────────────────────────── */
  const appointmentCols = React.useMemo(() => appointmentColumns(), []);
  const appointmentFilterDefs = React.useMemo(() => appointmentFilters(agendaRows), [agendaRows]);
  const appointmentRowActions = React.useMemo<RowActionDef<ClubAppointment>[]>(
    () => [
      { id: "open", label: "Apri", icon: <ChevronRight />, primary: true, onClick: openInspector },
      // Le mosse le dichiara il dominio (`actions`, W6-51): un'azione assente e una transizione non ammessa.
      { id: "confirm", label: "Conferma", icon: <Check />, hidden: (row) => !(row.actions || []).includes("confirm"), onClick: (row) => void decide(row, "confirm", "") },
      { id: "reschedule", label: "Sposta", icon: <CalendarClock />, hidden: (row) => !(row.actions || []).includes("reschedule"), onClick: openInspector },
      { id: "complete", label: "Concluso", icon: <Check />, hidden: (row) => !(row.actions || []).includes("complete"), onClick: (row) => void decide(row, "complete", "") },
      { id: "no-show", label: "Assente", icon: <UserX />, hidden: (row) => !(row.actions || []).includes("no-show"), onClick: (row) => void decide(row, "no-show", "") },
      // Rifiuto e annullo passano dall'ispettore, dove la nota per la famiglia si scrive.
      { id: "reject", label: "Rifiuta", icon: <X />, tone: "danger", hidden: (row) => !(row.actions || []).includes("reject"), onClick: openInspector },
      { id: "cancel", label: "Annulla l'appuntamento", icon: <Trash2 />, tone: "danger", hidden: (row) => !(row.actions || []).includes("cancel"), onClick: (row) => void decide(row, "cancel", "") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeClub?.id, decidendo],
  );

  const noteCols = React.useMemo(() => noteColumns(), []);
  const noteFilterDefs = React.useMemo(() => noteFilters(notes), [notes]);
  const noteRowActions = React.useMemo<RowActionDef<SecretariatNote>[]>(
    () => [
      { id: "edit", label: "Modifica", icon: <Pencil />, primary: true, onClick: (row) => setNoteDrawer({ open: true, note: row }) },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => void deleteNote(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeClub?.id, notes],
  );

  /* ── Numeri dell'intestazione ──────────────────────────────────────────── */
  const today = React.useMemo(() => new Date(), []);
  const pendingCount = appointments.filter((appointment) => appointment.status === "requested").length;
  const todayCount = appointments.filter((appointment) => isLiveAppointment(appointment) && isAppointmentOnDay(appointment, today)).length;
  const openDays = countOpenDays(openingHours);
  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  const primaryAction =
    area === "appuntamenti" ? (
      <Button variant="primary" icon={<Plus />} onClick={() => setNewAppointmentOpen(true)} disabled={loading}>
        Nuovo appuntamento
      </Button>
    ) : area === "note" ? (
      <Button variant="primary" icon={<Plus />} onClick={() => setNoteDrawer({ open: true, note: null })} disabled={loading}>
        Nuova nota
      </Button>
    ) : null;

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Segreteria" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Segreteria"
              title="Segreteria"
              description="Ricevi le famiglie, tieni l'agenda e i promemoria dell'ufficio."
              stats={
                <>
                  <HeaderStat
                    value={formatInteger(pendingCount)}
                    label="in attesa di risposta"
                    tone={pendingCount ? "amber" : "ink"}
                    onClick={() => {
                      selectArea("appuntamenti");
                      setScope("all");
                      setRequestedAppointmentView("requested");
                    }}
                  />
                  <HeaderStat
                    value={formatInteger(todayCount)}
                    label={todayCount === 1 ? "appuntamento oggi" : "appuntamenti oggi"}
                    onClick={() => {
                      selectArea("appuntamenti");
                      setSelectedDate(new Date());
                      setScope("day");
                    }}
                  />
                  <HeaderStat value={formatInteger(notes.length)} label="promemoria" onClick={() => selectArea("note")} />
                  <HeaderStat value={formatInteger(openDays)} label="giorni di apertura" tone={openDays ? "ink" : "amber"} onClick={() => selectArea("orari")} />
                </>
              }
              actions={
                <>
                  {primaryAction}
                  {area === "appuntamenti" ? (
                    <Button asChild variant="secondary">
                      <Link href="/appuntamenti">Configura la disponibilita</Link>
                    </Button>
                  ) : null}
                </>
              }
            >
              <SegmentedControl<SecretariatArea>
                aria-label="Aree della segreteria"
                value={area}
                onChange={selectArea}
                options={SECRETARIAT_AREAS.map((item) => ({
                  ...item,
                  count: item.value === "appuntamenti" ? (pendingCount || null) : item.value === "note" ? (notes.length || null) : null,
                }))}
                className="max-w-full overflow-x-auto"
              />
            </PageHeader>

            {/* ── Appuntamenti: griglia + rail ──────────────────────────────── */}
            <div className={area === "appuntamenti" ? "grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_300px]" : "hidden"}>
              <AgendaRail
                className="lg:order-2"
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  if (scope === "all") setScope("day");
                }}
                scope={scope}
                onScopeChange={setScope}
                countOnDay={countOnDay}
              />
              <DataGrid<ClubAppointment>
                className="lg:order-1"
                module="segreteria-appuntamenti"
                aria-label="Coda degli appuntamenti"
                rows={agendaRows}
                getRowId={(row) => row.id}
                rowLabel={(row) => row.title || "Appuntamento"}
                columns={appointmentCols}
                filters={appointmentFilterDefs}
                views={APPOINTMENT_VIEWS}
                requestedViewId={requestedAppointmentView}
                search={appointmentSearch}
                defaultSort={{ columnId: "date", direction: "asc" }}
                rowActions={appointmentRowActions}
                onOpenRow={openInspector}
                activeRowId={inspectorOpen ? inspecting?.id ?? null : null}
                canSelect={false}
                state={gridState}
                errorMessage={loadError}
                onRetry={reload}
                noun={{ singular: "appuntamento", plural: "appuntamenti" }}
                empty={{
                  icon: <CalendarDays />,
                  title: scope === "all" ? "Nessun appuntamento in agenda" : scope === "day" ? "Nessun appuntamento per questa data" : "Nessun appuntamento in questa settimana",
                  description: "Le richieste delle famiglie e i colloqui presi allo sportello compaiono qui, con le mosse che ammettono.",
                  primary: (
                    <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setNewAppointmentOpen(true)}>
                      Nuovo appuntamento
                    </Button>
                  ),
                }}
              />
            </div>

            {/* ── Note e promemoria ─────────────────────────────────────────── */}
            <div className={area === "note" ? "flex flex-col gap-[18px]" : "hidden"}>
              <DataGrid<SecretariatNote>
                module="segreteria-note"
                aria-label="Note e promemoria"
                rows={notes}
                getRowId={(row) => row.id}
                rowLabel={(row) => row.content}
                columns={noteCols}
                filters={noteFilterDefs}
                views={NOTE_VIEWS}
                search={noteSearch}
                defaultSort={{ columnId: "created", direction: "desc" }}
                rowActions={noteRowActions}
                onOpenRow={(row) => setNoteDrawer({ open: true, note: row })}
                canSelect={false}
                state={gridState}
                errorMessage={loadError}
                onRetry={reload}
                noun={{ singular: "nota", plural: "note" }}
                empty={{
                  icon: <StickyNote />,
                  title: "Nessuna nota presente",
                  description: "Un promemoria per la segreteria, per la Dashboard o per una persona del club.",
                  primary: (
                    <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setNoteDrawer({ open: true, note: null })}>
                      Nuova nota
                    </Button>
                  ),
                }}
              />
            </div>

            {/* ── Orari di apertura ─────────────────────────────────────────── */}
            <div className={area === "orari" ? "flex flex-col gap-[18px]" : "hidden"}>
              <OpeningHoursPanel value={openingHours} onChange={setOpeningHours} staff={people.staff} dirty={hoursDirty} saving={savingHours} loading={loading} onSave={() => void saveOpeningHours()} />
            </div>
          </DashboardPageContainer>
        </main>
      </div>

      <NewAppointmentDrawer
        open={newAppointmentOpen}
        onOpenChange={setNewAppointmentOpen}
        openingHours={openingHours}
        nominativi={people.nominativi}
        onSubmit={addAppointment}
        onConfigureHours={() => {
          setNewAppointmentOpen(false);
          selectArea("orari");
        }}
      />

      <AppointmentInspector
        open={inspectorOpen}
        onOpenChange={(open) => {
          setInspectorOpen(open);
          if (!open) setInspecting(null);
        }}
        appointment={inspecting}
        busy={decidendo}
        onDecide={decide}
        onReschedule={riprogrammaAppuntamento}
      />

      <NoteDrawer open={noteDrawer.open} onOpenChange={(open) => setNoteDrawer((current) => ({ ...current, open }))} note={noteDrawer.note} people={people} onSubmit={saveNote} />

      {confirmDialog}
    </div>
  );
}
