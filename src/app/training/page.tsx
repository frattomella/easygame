"use client";

import { sameCategory } from "@/lib/categories/identity";
import { apiRequest } from "@/lib/api/client";
import { listEventParticipants } from "@/lib/events/client";
import { readRecordedAttendance } from "@/lib/trainer-operational-alerts";
import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { CalendarRange, MoreHorizontal, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import {
  cancelEvent,
  createEvent,
  deleteEventIfEmpty,
  restoreEvent,
  updateEvent,
} from "@/lib/events/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { roleHasPermission } from "@/lib/permissions/catalog";
import {
  getParticipationCategoryBadgeLabel,
  getParticipationCategoryContext,
  getPrimaryAthleteCategoryMembership,
} from "@/lib/athlete-category-memberships";
import {
  athleteMatchesAnyCategory,
  selectableCategoryOptions,
} from "@/lib/category-utils";
import {
  buildCategoryDisplayIndex,
  type CategoryDisplayIndex,
} from "@/lib/categories/display";
import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import {
  getClubCategories,
  getClubTrainings,
  getClubTrainers,
  getClubWeeklySchedule,
  getClubData,
  getClubStructures,
  cleanupOrphanScheduledTrainings,
  saveTrainingAttendance,
  getClubAthletes,
} from "@/lib/simplified-db";
import {
  buildTrainingLocationOptions,
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import {
  buildCategoryGroups,
  buildSiteIndex,
  getActiveCategoryGroups,
  getAthleteGroupIds,
  getActiveClubSites,
  isCrossSiteEvent,
  isMultiSiteClub,
  normalizeClubSites,
  readSiteReference,
  readTrainingGroupIds,
  recordMatchesSite,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";
import { SiteContextControl } from "@/components/athletes/v2/athletes-context-controls";
import {
  canRecordTrainingAttendance,
  compareTrainingsByStart,
  dedupeTrainings,
  findTrainingsWithMissingCategories,
  findTrainingCollisions,
  getTrainingCategoryColor,
  getTrainingCategoryLabel,
  getTrainingCategoryReferences,
  getTrainingDate,
  getTrainingEndTime,
  getTrainingStartTime,
  getTrainingTimeLabel,
  getTrainingTrainerLabel,
  isTrainingOnDate,
} from "@/lib/training-utils";
import {
  normalizeTrainingAttendanceEntries,
} from "@/lib/athlete-participation-utils";
import { PageHeader } from "@/components/web/page/PageHeader";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip } from "@/components/web/primitives/StatusPill";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/web/primitives/Overlays";
import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { AlertBlock } from "@/components/web/page/Alerts";
import { CollapsedSection } from "@/components/web/record/Record";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import { formatInteger } from "@/lib/web/format";
import {
  countMatchesOnDate,
  formatDayTitle,
  formatWeekTitle,
  weekDaysOf,
  type TrainingSession,
} from "@/components/training/v2/training-page-model";
import { WeekRail } from "@/components/training/v2/WeekRail";
import { DaySessions, type SessionActions } from "@/components/training/v2/DaySessions";
import {
  buildTrainingColumns,
  buildTrainingFilters,
  buildTrainingRowActions,
  TRAINING_GRID_MODULE,
  TRAINING_VIEWS,
  trainingRowKey,
} from "@/components/training/v2/training-grid";
import {
  AttendanceDrawer,
  type AttendanceDrawerAthlete,
  type AttendanceSavePayload,
} from "@/components/training/v2/AttendanceDrawer";

/*
  La pagina Allenamenti nel Web V2 (mockup P4, pattern «giornata sportiva»):
  intestazione con il giorno e i numeri, il rail della settimana a sinistra, le
  sedute del giorno come card sul rail dell'ora, le presenze in un cassetto da
  480, la vista settimana come griglia, e il programma settimanale (regole
  ricorrenti + automazione) in una sezione chiudibile in fondo.

  **La logica dati e quella della V1, riga per riga**: stesse funzioni
  (`getClubTrainings`, `listEventParticipants`, lo scrittore canonico degli
  eventi), stessi endpoint, stesse regole (sovrapposizione, sede diversa,
  versione ottimistica, pulizia delle categorie orfane). Cio che disegna vive
  in `src/components/training/v2/`.
*/
const WeeklyTrainingSchedule = dynamic(
  () =>
    import("@/components/dashboard/WeeklyTrainingSchedulePanel").then(
      (module) => module.WeeklyTrainingSchedule,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="egw-skeleton h-56 rounded-egw-field" aria-hidden />
    ),
  },
);

const AddTrainingForm = dynamic(
  () =>
    import("@/components/forms/AddTrainingForm").then(
      (module) => module.AddTrainingForm,
    ),
  { ssr: false },
);

const EditTrainingForm = dynamic(
  () =>
    import("@/components/forms/EditTrainingForm").then(
      (module) => module.EditTrainingForm,
    ),
  { ssr: false },
);

type TrainingPersonOption = {
  id: string;
  name: string;
  [key: string]: unknown;
};

type TrainingCategoryOption = TrainingPersonOption & {
  color?: string;
  /** Falso solo per una voce nata da una scheda e non configurata (ADR-0185). */
  configured?: boolean | null;
};

type AttendanceSheetAthlete = AttendanceDrawerAthlete & {
  rawAthlete?: any;
};

type AttendanceModalState = {
  training: TrainingSession;
  athletes: AttendanceSheetAthlete[];
  clubAthletes: AttendanceSheetAthlete[];
};

type TrainingView = "day" | "week";

/**
 * **La quarta copia privata di «questo record e di questa categoria»**
 * (D-INT-2, D-AUD-5).
 *
 * Qui c'era un confronto scritto a mano che metteva identificativi ed
 * etichette nello stesso elenco su tutti e due i lati. Con due categorie
 * omonime su due sedi — la configurazione ordinaria di una societa
 * multi-sede — l'intersezione era non vuota, e l'appello di un allenamento
 * di Scauri si apriva **anche** sugli atleti di Formia.
 *
 * Quelle presenze non restavano sullo schermo: `assertAtletiDelClub`
 * controlla il club e basta, e un allenatore ordinario non ha un perimetro
 * di sede, quindi «Segna tutti presenti» le scriveva. Da li passavano a
 * `funding/attendance-measure.ts`, cioe a un contributo rendicontato.
 *
 * Adesso risponde la primitiva, con il catalogo del club in mano.
 */
const trainingMatchesCategory = (
  training: any,
  category: { id?: string | null; name?: string | null },
  catalog: Array<{ id?: string | null; name?: string | null }> = [],
) => sameCategory(training, category, catalog);
const formatTrainingSession = ({
  training,
  categories,
  trainers,
  athletes,
  locations,
  siteIndex,
  categoryDisplay,
}: {
  training: any;
  categories: any[];
  trainers: any[];
  athletes: any[];
  locations: any[];
  siteIndex: ReturnType<typeof buildSiteIndex>;
  /** L'indice canonico della pagina (ADR-0185): la riga dice «Pulcini · Scauri» come il filtro. */
  categoryDisplay?: CategoryDisplayIndex;
}): TrainingSession | null => {
  const trainingDate = getTrainingDate(training);
  if (!trainingDate) {
    return null;
  }

  const matchedCategories = categories.filter((category: any) =>
    trainingMatchesCategory(training, category, categories),
  );

  /*
    Quanti sono attesi: la squadra, non la fascia. Con i gruppi dichiarati
    contare tutti i Pulcini gonfierebbe il denominatore di ogni percentuale di
    presenza di questo allenamento (ADR-0055).
  */
  const declaredGroupIds = readTrainingGroupIds(training);
  /*
    **Il denominatore lo conta l'organico di oggi, non un numero congelato**
    (P0-5).

    La squadra attesa si calcolava, ma solo **se** la riga non portava gia un
    `expected_attendees` — e le righe piu vecchie lo portano, scritto una volta
    e mai piu toccato. La scheda diceva «3/18» sopra un registro che elencava
    sedici nomi: due numeri diversi per la stessa domanda, a due centimetri
    l'uno dall'altro, e quello sbagliato era il piu visibile.

    Il numero salvato resta il ripiego di chi non ha un organico da contare —
    l'elenco non ancora caricato, o un allenamento di una categoria che non
    esiste piu — perche «3 su 0» sarebbe peggio di un numero vecchio.
  */
  const attesiDallOrganico = declaredGroupIds.length
    ? athletes.filter((athlete: any) =>
        getAthleteGroupIds(athlete, siteIndex).some((groupId) =>
          declaredGroupIds.includes(groupId),
        ),
      ).length
    : athletes.filter((athlete: any) =>
        athleteMatchesAnyCategory(athlete, matchedCategories, categories),
      ).length;

  const attesiSalvati =
    typeof training?.expectedAttendees === "number"
      ? training.expectedAttendees
      : typeof training?.expected_attendees === "number"
        ? training.expected_attendees
        : 0;

  const expectedAttendees = attesiDallOrganico || attesiSalvati;

  const matchedLocation = findTrainingLocationOption(locations, {
    structureId: training.structureId,
    fieldId: training.locationId || training.fieldId,
    locationId: training.locationId || training.fieldId,
    location: training.location,
  });
  const source =
    training?.data && typeof training.data === "object" ? training.data : {};

  return {
    id: String(
      training?.id || globalThis.crypto?.randomUUID?.() || Math.random(),
    ),
    title: String(training?.title || source?.title || "Allenamento"),
    date: trainingDate,
    time: getTrainingStartTime(training) || getTrainingTimeLabel(training),
    endTime: getTrainingEndTime(training),
    category: getTrainingCategoryLabel(training, categories, categoryDisplay),
    /* Il nome salvato, separato dall'etichetta: un'etichetta derivata non torna mai in archivio come nome. */
    categoryName:
      String(training?.category_name || training?.categoryName || (typeof training?.category === "string" ? training.category : "") || "").trim() || null,
    categoryId:
      String(
        training?.categoryId ||
          training?.category_id ||
          training?.category?.id ||
          source?.categoryId ||
          source?.category_id ||
          source?.category?.id ||
          "",
      ).trim() || null,
    categoryReferences: getTrainingCategoryReferences(training),
    groupIds: readTrainingGroupIds(training),
    historicalCategoryName:
      String(
        training?.category_name ||
          training?.categoryName ||
          training?.category?.name ||
          source?.category_name ||
          source?.categoryName ||
          source?.category?.name ||
          "",
      ).trim() || null,
    trainer: getTrainingTrainerLabel(training, trainers),
    // Gli id servono alla modifica per ripresentare la selezione multipla.
    trainerIds: (Array.isArray(training?.trainerIds)
      ? training.trainerIds
      : Array.isArray(source?.trainerIds)
        ? source.trainerIds
        : []
    )
      .map((id: unknown) => String(id || "").trim())
      .filter(Boolean),
    location:
      matchedLocation?.name ||
      training?.location ||
      source?.location ||
      "Campo",
    locationId:
      matchedLocation?.fieldId || training?.locationId || training?.fieldId || null,
    structureId: matchedLocation?.structureId || training?.structureId || null,
    attendees:
      typeof training?.attendees === "number" ? training.attendees : 0,
    categoryColor: getTrainingCategoryColor(training, categories),
    status: training?.status || "upcoming",
    attendance: Array.isArray(training?.attendance) ? training.attendance : [],
    /*
      **I due numeri dell'appello, che qui si perdevano** (P0-5).

      La rotta del calendario manda quanti sono stati registrati e quanti
      presenti; questa funzione ricostruisce la seduta campo per campo, e cio
      che non nomina non arriva. Senza queste due righe la scheda continuava a
      dire «Presenze mancanti» sopra un registro appena salvato, e la
      correzione dentro `readRecordedAttendance` non aveva niente da leggere.
    */
    attendanceRecorded:
      typeof training?.attendance_recorded === "number"
        ? training.attendance_recorded
        : typeof training?.attendanceRecorded === "number"
          ? training.attendanceRecorded
          : null,
    attendancePresent:
      typeof training?.attendance_present === "number"
        ? training.attendance_present
        : typeof training?.attendancePresent === "number"
          ? training.attendancePresent
          : null,
    expectedAttendees,
    /*
      PP-02 §O. La versione viaggia dalla lettura al salvataggio: la forma
      storica la porta gia (`toEventLegacyShape`), e qui si perdeva.
    */
    version:
      typeof training?.version === "number"
        ? training.version
        : typeof source?.version === "number"
          ? source.version
          : null,
  };
};

const buildTrainingAttendanceAthlete = ({
  athlete,
  eventCategories,
  existingEntry,
  recorded = false,
}: {
  athlete: any;
  eventCategories: any[];
  existingEntry?: ReturnType<typeof normalizeTrainingAttendanceEntries>[number];
  /**
   * Vero se l'archivio ha **una voce di appello** per questo atleta: il
   * cassetto distingue «da segnare» da «assente», e la distinzione sta qui.
   */
  recorded?: boolean;
}): AttendanceSheetAthlete => {
  const context = getParticipationCategoryContext({
    athlete,
    eventCategories,
    entry: existingEntry || null,
  });
  const primaryCategory = getPrimaryAthleteCategoryMembership(athlete);

  return {
    id: athlete.id,
    name: getAthleteDisplayName(athlete) || "Atleta",
    firstName: athlete.first_name || "",
    lastName: athlete.last_name || "",
    jerseyNumber:
      String(
        athlete.jersey_number ??
          athlete.jerseyNumber ??
          athlete.data?.jerseyNumber ??
          athlete.data?.jersey_number ??
          "",
      ).trim() || null,
    present: existingEntry?.present || false,
    recorded,
    notes: existingEntry?.notes || "",
    medicalCertExpiry:
      athlete.data?.medicalCertExpiry ||
      athlete.medical_cert_expiry ||
      athlete.medicalCertExpiry ||
      null,
    participationContext: context,
    participationBadgeLabel:
      context === "primary" ? null : getParticipationCategoryBadgeLabel(context),
    isExtraCategory:
      context === "extra" ||
      Boolean(existingEntry?.isExtraCategory),
    isManualExtra:
      context === "extra" ||
      Boolean(existingEntry?.isManualExtra),
    primaryCategoryName: primaryCategory?.categoryName || null,
    rawAthlete: athlete,
  };
};


export default function TrainingPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [view, setView] = React.useState<TrainingView>("day");
  const [loading, setLoading] = useState(true);
  const [trainers, setTrainers] = useState<TrainingPersonOption[]>([]);
  const [categories, setCategories] = useState<TrainingCategoryOption[]>([]);
  const [locations, setLocations] = useState<TrainingLocationOption[]>([]);
  const [sites, setSites] = useState<ClubSite[]>([]);
  const [siteFilter, setSiteFilter] = useState("");
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [siteIdByStructureId, setSiteIdByStructureId] = useState<
    Record<string, string>
  >({});
  const [trainings, setTrainings] = React.useState<TrainingSession[]>([]);
  /** Le gare del club, solo per la nota «n gara» sul rail della settimana. */
  const [matches, setMatches] = React.useState<any[]>([]);
  const [weeklySchedule, setWeeklySchedule] = React.useState<any[]>([]);
  const [clubAthletes, setClubAthletes] = useState<any[]>([]);
  const [showAddTrainingModal, setShowAddTrainingModal] = useState(false);
  /*
    **Un salvataggio alla volta** (PP-01 §C). Due clic rapidi sul pulsante di
    salvataggio mandavano due richieste, e con la sovrapposizione ora
    scavalcabile la seconda non viene piu fermata dal conflitto: creerebbe il
    doppione che prima l'errore nascondeva.
  */
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);
  /*
    La conferma della sovrapposizione, come promessa: `window.confirm` non e
    solo brutto — il browser lo sopprime dopo il primo uso e in una webview puo
    non comparire affatto, cioe l'operazione parte senza che nessuno abbia
    confermato niente. E la stessa primitiva che la scheda atleta usa gia.
  */
  const [confermaInSospeso, setConfermaInSospeso] = useState<{
    title: string;
    description: string;
    confirmText: string;
    risolvi: (esito: boolean) => void;
  } | null>(null);
  const richiediConferma = React.useCallback(
    (richiesta: { title: string; description: string; confirmText?: string }) =>
      new Promise<boolean>((risolvi) => {
        setConfermaInSospeso({
          title: richiesta.title,
          description: richiesta.description,
          confirmText: richiesta.confirmText ?? "Conferma",
          risolvi,
        });
      }),
    [],
  );

  const chiudiConferma = React.useCallback((esito: boolean) => {
    setConfermaInSospeso((corrente) => {
      corrente?.risolvi(esito);
      return null;
    });
  }, []);
  const [showEditTrainingModal, setShowEditTrainingModal] = useState(false);
  const [editingTraining, setEditingTraining] =
    useState<TrainingSession | null>(null);
  const [modificaInCorso, setModificaInCorso] = useState(false);
  /*
    Il PIN di club e stato rimosso (Blocco 7, punto 17).

    Eliminare un allenamento chiedeva quattro cifre uguali per tutto il club,
    con valore predefinito `1234` scritto in chiaro: non diceva chi stesse
    cancellando e non impediva a nessuno di farlo, perche l'API era comunque
    raggiungibile. Resta una conferma esplicita, che e cio che serve davvero
    contro il clic sbagliato.
  */
  const [showDeleteTraining, setShowDeleteTraining] = useState(false);
  const [trainingToDelete, setTrainingToDelete] =
    useState<TrainingSession | null>(null);
  const [deletingTraining, setDeletingTraining] = useState(false);
  /*
    Annulla e Ripristina erano gli ultimi due `window.confirm` di questa
    pagina (audit §3.13): adesso sono dialoghi dell'applicazione, con le
    stesse parole.
  */
  const [trainingToCancel, setTrainingToCancel] =
    useState<TrainingSession | null>(null);
  const [trainingToRestore, setTrainingToRestore] =
    useState<TrainingSession | null>(null);
  const [cambioStatoInCorso, setCambioStatoInCorso] = useState(false);
  const [attendanceModalState, setAttendanceModalState] =
    useState<AttendanceModalState | null>(null);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [autoOpenedAttendanceId, setAutoOpenedAttendanceId] = useState<
    string | null
  >(null);
  const [cleaningMissingCategories, setCleaningMissingCategories] =
    useState(false);
  /* PP-02 §O: la conferma e un dialogo dell'applicazione, non del sistema. */
  const [puliziaCategorieAperta, setPuliziaCategorieAperta] = useState(false);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const scheduleSectionRef = React.useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const requestedTrainingId = searchParams.get("trainingId");
  const requestedFocus = searchParams.get("focus");
  const requestedDate = React.useMemo(() => {
    const dateParam = searchParams.get("date");

    if (!dateParam) {
      return new Date();
    }

    const parsedDate = new Date(`${dateParam}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  }, [searchParams]);

  // Initialize dates on client side to avoid hydration mismatch
  React.useEffect(() => {
    if (!date) setDate(requestedDate);
  }, [date, requestedDate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) {
      return;
    }

    if (action === "new") {
      setShowAddTrainingModal(true);
    }

    params.delete("action");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

/**
 * **Il messaggio del server, e la ricarica quando serve.**
 *
 * I due pulsanti «Annulla» e «Ripristina» adesso mandano la versione, quindi
 * possono fallire per conflitto — per esempio se qualcun altro ha salvato le
 * convocazioni, che la incrementano. I loro rami d'errore pero inghiottivano
 * il messaggio e non ricaricavano: la versione locale restava vecchia e ogni
 * tentativo successivo falliva allo stesso modo, per sempre, finche non si
 * ricaricava la pagina a mano.
 *
 * E la stessa forma della High appena chiusa sulla modifica, sui due pulsanti
 * accanto.
 */
const messaggioDiErrore = (error: any, ripiego: string) => {
  const messaggio = String(error?.message || "").trim();
  return messaggio || ripiego;
};

/**
 * **La versione che il server ha appena scritto.**
 *
 * `PATCH /api/v1/events/[id]` risponde con la riga aggiornata sotto `row`,
 * piu la sua forma storica appiattita. La versione si legge di li: senza, la
 * copia in memoria resta a quella **di prima** del salvataggio, e il controllo
 * ottimistico del salvataggio successivo fallisce contro una modifica che ha
 * fatto la stessa persona un istante prima.
 */
const versioneSalvata = (risposta: any): number | null => {
  if (typeof risposta?.row?.version === "number") return risposta.row.version;
  if (typeof risposta?.version === "number") return risposta.version;
  return null;
};

  /**
   * **Ricarica, e restituisce cio che ha ricaricato.**
   *
   * Serve al ramo del conflitto ottimistico: dopo la ricarica il modale di
   * modifica va risincronizzato sulla riga fresca, e leggerlo da `trainings`
   * subito dopo darebbe la copia vecchia — lo stato di React non e ancora
   * cambiato dentro la stessa funzione.
   */
  const loadData = React.useCallback(async (): Promise<
    TrainingSession[] | undefined
  > => {
    if (!activeClub?.id) {
      return undefined;
    }

    let risultato: TrainingSession[] | undefined;

    try {
      const settledResults = await Promise.allSettled([
        getClubCategories(activeClub.id),
        getClubTrainers(activeClub.id),
        getClubStructures(activeClub.id),
        getClubAthletes(activeClub.id),
        getClubTrainings(activeClub.id),
        getClubWeeklySchedule(activeClub.id),
        getClubData(activeClub.id, "club_sites"),
        getClubData(activeClub.id, "category_groups"),
        /*
          **I due numeri dell'appello, dalla rotta che li conta** (P0-5).

          Questa pagina legge gli allenamenti dalla proiezione storica
          (`getClubTrainings`), e la proiezione non porta l'appello: l'appello
          e righe di `club_event_participants`, non colonne dell'evento. Il
          risultato era una scheda che diceva «Presenze mancanti» sopra un
          registro appena salvato — anche dopo un ricaricamento.

          Di qui si prendono **solo** i due conteggi. Portare l'intera lettura
          sulla rotta canonica e il lavoro di WP-07 e non si fa in coda a una
          correzione: sarebbe cambiare la fonte di ogni campo di questa
          schermata per sistemare un badge.
        */
        apiRequest<any[]>("/api/v1/events?kind=training&include_cancelled=1", {
          method: "GET",
          headers: { "x-active-club-id": activeClub.id },
        }),
        /*
          Le gare, solo per la nota «n gara» sul rail della settimana (mockup
          P4): una lettura in piu, tollerante al fallimento come le altre.
        */
        getClubData(activeClub.id, "matches"),
      ]);

      const failedSections: string[] = [];
      const readArrayResult = (
        index: number,
        fallbackLabel: string,
      ): any[] => {
        const result = settledResults[index];
        if (result.status === "fulfilled") {
          return Array.isArray(result.value) ? result.value : [];
        }

        console.error(`Error loading training ${fallbackLabel}:`, result.reason);
        failedSections.push(fallbackLabel);
        return [];
      };

      const clubCategories = readArrayResult(0, "categorie");
      const clubTrainers = readArrayResult(1, "allenatori");
      const clubStructures = readArrayResult(2, "strutture");
      const allAthletes = readArrayResult(3, "atleti");
      const clubTrainings = readArrayResult(4, "allenamenti");
      const clubWeeklySchedule = readArrayResult(5, "programma settimanale");
      const clubSites = readArrayResult(6, "sedi");
      const clubCategoryGroups = readArrayResult(7, "gruppi operativi");
      setMatches(readArrayResult(9, "gare"));

      const normalizedCategories = Array.isArray(clubCategories)
        ? clubCategories
        : [];
      const normalizedTrainers = Array.isArray(clubTrainers) ? clubTrainers : [];
      /*
        L'appello si indicizza con **tutte e due** le chiavi dell'evento: la
        proiezione porta l'identificativo storico, la riga porta il proprio.
      */
      const rispostaAppello = settledResults[8];
      const eventiConAppello: any[] =
        rispostaAppello.status === "fulfilled"
          ? Array.isArray(rispostaAppello.value)
            ? rispostaAppello.value
            : Array.isArray((rispostaAppello.value as any)?.data)
              ? (rispostaAppello.value as any).data
              : []
          : [];
      const appelloPerEvento = new Map<string, any>();
      for (const evento of eventiConAppello) {
        const conteggi = {
          attendance_recorded: Number(evento?.attendance_recorded || 0),
          attendance_present: Number(evento?.attendance_present || 0),
        };
        for (const chiave of [evento?.eventId, evento?.id]) {
          const testo = String(chiave || "").trim();
          if (testo) appelloPerEvento.set(testo, conteggi);
        }
      }

      const normalizedTrainings = (
        Array.isArray(clubTrainings) ? clubTrainings : []
      ).map((training: any) => {
        const conteggi =
          appelloPerEvento.get(String(training?.eventId || "").trim()) ||
          appelloPerEvento.get(String(training?.id || "").trim());
        return conteggi ? { ...training, ...conteggi } : training;
      });
      const normalizedWeeklySchedule = Array.isArray(clubWeeklySchedule)
        ? clubWeeklySchedule
        : [];
      const normalizedAthletes = Array.isArray(allAthletes) ? allAthletes : [];

      setCategories(normalizedCategories);
      setTrainers(normalizedTrainers);
      setClubAthletes(normalizedAthletes);
      setWeeklySchedule(normalizedWeeklySchedule);

      const normalizedSites = normalizeClubSites(clubSites);
      setSites(normalizedSites);
      /*
        I gruppi operativi: e a questi che un allenamento si assegna, non alla
        categoria. Le presenze che ne discendono riguardano una squadra sola
        (ADR-0055).
      */
      const gruppiCostruiti = buildCategoryGroups({
        categories: normalizedCategories,
        sites: normalizedSites,
        groups: clubCategoryGroups,
      });
      setCategoryGroups(gruppiCostruiti);
      /* Lo stesso indice del filtro, per le righe: un solo modo di scrivere una categoria (ADR-0185). */
      const indiceCategorie = buildCategoryDisplayIndex({
        categories: normalizedCategories,
        groups: gruppiCostruiti,
        sites: normalizedSites,
      });
      // Un allenamento non porta una sede propria: si allena in una struttura,
      // e la struttura appartiene a una sede (ADR-0038). Un secondo campo si
      // disallineerebbe al primo allenamento in trasferta.
      setSiteIdByStructureId(
        Object.fromEntries(
          (Array.isArray(clubStructures) ? clubStructures : [])
            .map((structure) => [
              String(structure?.id || ""),
              readSiteReference(structure),
            ])
            .filter(([id]) => Boolean(id)),
        ),
      );

      const builtLocations = buildTrainingLocationOptions(clubStructures);
      const normalizedLocations =
        builtLocations.length > 0
          ? builtLocations
          : getFallbackTrainingLocationOptions();
      setLocations(normalizedLocations);

      const formattedTrainings = normalizedTrainings
        .map((training: any) =>
          formatTrainingSession({
            training,
            categories: normalizedCategories,
            categoryDisplay: indiceCategorie,
            trainers: normalizedTrainers,
            athletes: normalizedAthletes,
            locations: normalizedLocations,
            siteIndex: buildSiteIndex(normalizedSites),
          }),
        )
        .filter(Boolean)
        .sort(compareTrainingsByStart) as TrainingSession[];

      const elencoFresco = dedupeTrainings(formattedTrainings);
      setTrainings(elencoFresco);

      risultato = elencoFresco;

      if (failedSections.length > 0) {
        setLoadWarning(
          `Alcune sezioni non sono state caricate correttamente: ${failedSections.join(", ")}.`,
        );
      } else {
        setLoadWarning(null);
      }
    } catch (error) {
      console.error("Error loading training data:", error);
      setLoadWarning(
        "Non è stato possibile caricare tutti i dati degli allenamenti. Riprova tra qualche istante.",
      );
      showToast("error", "Errore nel caricamento dei dati");
    } finally {
      setLoading(false);
    }
    return risultato;
    /* La stagione mostrata e una dipendenza: A → B → A senza F5 ricarica (ADR-0197 §26). */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, activeClub?.activeSeasonId, showToast]);

  // Load data from database
  useEffect(() => {
    loadData();
  }, [loadData]);

  const missingWeeklyScheduleCategories = React.useMemo(
    () => findTrainingsWithMissingCategories(weeklySchedule, categories),
    [categories, weeklySchedule],
  );

  const missingUpcomingTrainingCategories = React.useMemo(
    () =>
      findTrainingsWithMissingCategories(trainings, categories, {
        scheduledOnly: true,
      }),
    [categories, trainings],
  );

  const missingCategoryPanel = React.useMemo(() => {
    const combined = [
      ...missingWeeklyScheduleCategories,
      ...missingUpcomingTrainingCategories,
    ];

    if (!combined.length) {
      return null;
    }

    const labels = Array.from(
      new Set(
        combined
          .map((item) => String(item.label || "").trim())
          .filter(Boolean),
      ),
    );
    const references = Array.from(
      new Set(
        combined.flatMap((item) =>
          Array.isArray(item.references) ? item.references : [],
        ),
      ),
    );

    return {
      labels,
      references,
      weeklyCount: missingWeeklyScheduleCategories.length,
      upcomingCount: missingUpcomingTrainingCategories.length,
    };
  }, [missingUpcomingTrainingCategories, missingWeeklyScheduleCategories]);

  /*
    **PP-02 §O. La pulizia esce dal browser, e l'esito dice la verita.**

    Erano due difetti in dieci righe. La funzione scriveva `clubs.trainings`
    direttamente e il server la rifiutava da ADR-0098, quindi il pulsante
    falliva **sempre**; e la conferma era un `window.confirm`, che e la stessa
    finestra di sistema che PP-01 ha tolto da questa pagina per la
    sovrapposizione.

    E l'esito contava cio che si voleva togliere, non cio che si e tolto: un
    allenamento con l'appello gia fatto non si cancella — si annulla — e il
    dominio lo rifiuta con un messaggio che lo dice. Adesso quel rifiuto si
    **conta e si nomina**, invece di scomparire dentro un totale.
  */
  const eseguiPuliziaCategorie = React.useCallback(async () => {
    if (!activeClub?.id || !missingCategoryPanel?.references.length) {
      return;
    }

    try {
      setCleaningMissingCategories(true);
      const result = await cleanupOrphanScheduledTrainings(
        activeClub.id,
        missingCategoryPanel.references,
      );

      /*
        **Due conteggi, perche sono due cose.** Una riga del programma
        settimanale non e un allenamento in programma: sommarle e chiamarle
        «allenamenti» dava un numero che non torna con cio che si vede sparire
        dal calendario.
      */
      const righeDelProgramma = Array.isArray(
        result?.removedWeeklyScheduleItems,
      )
        ? result.removedWeeklyScheduleItems.length
        : 0;
      const allenamentiRimossi = Array.isArray(result?.removedUpcomingTrainings)
        ? result.removedUpcomingTrainings.length
        : 0;
      const rimossi = righeDelProgramma + allenamentiRimossi;
      const dettaglioRimossi = [
        allenamentiRimossi
          ? `${allenamentiRimossi} allenamenti in programma`
          : "",
        righeDelProgramma
          ? `${righeDelProgramma} righe del programma settimanale`
          : "",
      ]
        .filter(Boolean)
        .join(" e ");
      const trattenuti = Array.isArray(result?.keptWithHistory)
        ? result.keptWithHistory.length
        : 0;

      await loadData();

      if (!rimossi && !trattenuti) {
        showToast("success", "Nessun allenamento programmato da ripulire");
      } else if (trattenuti) {
        /*
          Una pulizia che lascia indietro qualcosa non e riuscita: chi legge
          deve sapere che gli resta del lavoro a mano.

          **E il ramo senza niente da rimuovere esiste**, ed e proprio quello
          per cui questo messaggio e stato scritto: quando ogni allenamento
          orfano ha gia l'appello fatto, i due elenchi tornano vuoti e
          `dettaglioRimossi` e la stringa vuota. La prima stesura scriveva
          «Rimossi . 3 non si possono cancellare», che non e una frase.
        */
        showToast(
          "warning",
          dettaglioRimossi
            ? `Rimossi ${dettaglioRimossi}. ${trattenuti} non si possono cancellare perche hanno gia presenze o risposte: vanno annullati uno per uno.`
            : `Non e stato rimosso niente: ${trattenuti} allenamenti hanno gia presenze o risposte e vanno annullati uno per uno.`,
        );
      } else {
        showToast(
          "success",
          `Rimossi ${dettaglioRimossi}, collegati a categorie eliminate`,
        );
      }
    } catch (error) {
      console.error("Error cleaning orphan scheduled trainings:", error);
      showToast(
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Errore durante la pulizia degli allenamenti con categorie non rilevate",
      );
    } finally {
      setCleaningMissingCategories(false);
      setPuliziaCategorieAperta(false);
    }
  }, [activeClub?.id, loadData, missingCategoryPanel, showToast]);

  const handleCleanupMissingCategories = React.useCallback(() => {
    if (!activeClub?.id || !missingCategoryPanel?.references.length) return;
    setPuliziaCategorieAperta(true);
  }, [activeClub?.id, missingCategoryPanel]);

  const handleAddTraining = async (trainingData: any): Promise<boolean> => {
    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo selezionato");
      return false;
    }
    if (salvataggioInCorso) return false;
    setSalvataggioInCorso(true);

    try {
      // Map category and trainer IDs to names for display
      const selectedCategories = categories.filter((category) =>
        trainingMatchesCategory(
          { categories: trainingData.categories || [] },
          category,
          categories,
        ),
      );
      const selectedTrainers = trainers.filter((trainer) =>
        trainingData.trainers?.includes(trainer.id),
      );
      const selectedLocation = findTrainingLocationOption(locations, {
        structureId: trainingData.structureId,
        fieldId: trainingData.locationId,
        locationId: trainingData.locationId,
        location: trainingData.location,
      });

      const collisionCandidate = {
        date: trainingData.date,
        time: trainingData.time,
        endTime: trainingData.endTime || null,
        locationId: selectedLocation?.fieldId || trainingData.locationId || null,
      };
      const collisions = findTrainingCollisions(trainings, collisionCandidate);

      /*
        **L'avviso lo da il browser, ma a decidere e il server** (PP-01 §C).

        Prima il controllo del client guardava il **campo** e quello del server
        la **struttura**, perche il modulo non mandava mai `fieldId`: due
        allenamenti su due campi della stessa struttura non davano nessun avviso
        qui e venivano rifiutati la, con un messaggio che non nominava il
        conflitto. Adesso il campo viaggia — vedi `fieldId` piu sotto — e le due
        domande sono la stessa domanda.

        E soprattutto: la conferma **viaggia**. Prima restava nel browser, e
        l'unica cosa che arrivava al server era una richiesta identica a quella
        che aveva gia rifiutato.
      */
      let sovrapposizioneConfermata = false;
      if (collisions.length > 0) {
        sovrapposizioneConfermata = await richiediConferma({
          title: "Il campo risulta gia occupato",
          confirmText: "Inseriscilo comunque",
          description:
            `In quel campo e a quell'ora ci sono gia ${collisions.length} ` +
            `${collisions.length === 1 ? "allenamento" : "allenamenti"}. ` +
            "Puoi inserirlo lo stesso — due squadre su meta campo, o un " +
            "allenamento congiunto, sono situazioni normali — e l'allenamento " +
            "verra creato accanto agli altri.",
        });
        if (!sovrapposizioneConfermata) return false;
      }

      /*
        **La struttura scelta e di un'altra sede rispetto al gruppo?** Un
        avviso da confermare, non un blocco: l'evento puo essere
        eccezionalmente cross-site, la categoria non si sposta e gli atleti
        restano dove sono (issue UAT).

        Il confronto vale solo quando i gruppi selezionati condividono
        **una** sede: con gruppi di sedi diverse, o senza gruppi con sede
        (club mono-sede, categoria non ancora collocata), non c'e un
        riferimento unico con cui essere in conflitto.
      */
      const gruppiSelezionati = groupOptions.filter((group) =>
        Array.isArray(trainingData.groupIds)
          ? trainingData.groupIds.includes(group.id)
          : false,
      );
      const sediDeiGruppi = Array.from(
        new Set(gruppiSelezionati.map((group) => group.siteId).filter(Boolean)),
      );
      const sedeDelGruppo = sediDeiGruppi.length === 1 ? sediDeiGruppi[0] : "";
      const sedeDellaStruttura = selectedLocation?.siteId || "";

      if (isCrossSiteEvent(sedeDelGruppo, sedeDellaStruttura)) {
        const siteIndexPerAvviso = buildSiteIndex(sites);
        const confermatoCrossSite = await richiediConferma({
          title: "La struttura appartiene a un'altra sede",
          confirmText: "Conferma comunque",
          description:
            `La categoria e a «${siteIndexPerAvviso.getSiteName(sedeDelGruppo)}», ` +
            `la struttura scelta e a «${siteIndexPerAvviso.getSiteName(sedeDellaStruttura)}». ` +
            "Puoi salvarlo lo stesso: e una proprieta di questo allenamento, non " +
            "cambia la sede della categoria ne sposta nessun atleta.",
        });
        if (!confermatoCrossSite) return false;
      }

      const newTraining = {
        id: `training-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: trainingData.title,
        date: trainingData.date,
        time: trainingData.time,
        endTime: trainingData.endTime || null,
        categories: trainingData.categories || [],
        // Le squadre concrete a cui l'allenamento si riferisce (ADR-0055).
        groupIds: trainingData.groupIds || [],
        category:
          selectedCategories.length > 0
            ? selectedCategories.map((cat) => cat.name).join(", ")
            : "Categoria",
        categoryId: trainingData.categories?.[0] || null,
        trainerIds: trainingData.trainers || [],
        trainer:
          selectedTrainers.length > 0
            ? selectedTrainers.map((trainer) => trainer.name).join(", ")
            : "Allenatore",
        structureId: selectedLocation?.structureId || trainingData.structureId || null,
        locationId: selectedLocation?.fieldId || trainingData.locationId || null,
        /*
          **`fieldId` non partiva mai** (PP-01 §C). Il server legge il campo da
          `fieldId` / `field_id` e non da `locationId`: senza, la colonna
          restava vuota e il controllo di sovrapposizione ricadeva sulla
          struttura, cioe rifiutava due allenamenti su due campi diversi dello
          stesso impianto.
        */
        fieldId: selectedLocation?.fieldId || trainingData.locationId || null,
        location: selectedLocation?.name || trainingData.location,
        allowOverlap: sovrapposizioneConfermata,
        attendees: 0,
        categoryColor: "bg-blue-500 text-white",
        status: "upcoming",
        generated: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };


      // Save to database
      /*
        L'allenamento nasce come **riga** (ADR-0098): non si rilegge piu
        l'intera collezione del club per riscriverla con un elemento in piu.
      */
      const savedTraining = await createEvent("training", newTraining);

      // Calculate expected attendees
      const allAthletes = await getClubAthletes(activeClub.id);
      const expectedAttendees = allAthletes.filter((athlete: any) =>
        athleteMatchesAnyCategory(athlete, selectedCategories, categories),
      ).length;

      // Update local state
      const formattedTraining: TrainingSession = {
        id: newTraining.id,
        title: newTraining.title,
        date: getTrainingDate(newTraining) || new Date(),
        time: newTraining.time,
        endTime: newTraining.endTime,
        category: newTraining.category,
        categoryId: newTraining.categoryId,
        categoryReferences: Array.isArray(newTraining.categories)
          ? newTraining.categories
          : newTraining.categoryId
            ? [newTraining.categoryId]
            : [],
        groupIds: newTraining.groupIds,
        historicalCategoryName: newTraining.category,
        trainer: newTraining.trainer,
        location: newTraining.location,
        locationId: newTraining.locationId,
        structureId: newTraining.structureId,
        attendees: 0,
        categoryColor: "bg-blue-500 text-white",
        status: "upcoming",
        attendance: [],
        expectedAttendees: expectedAttendees,
      };

      setTrainings((current) =>
        dedupeTrainings([...current, formattedTraining]).sort(compareTrainingsByStart),
      );
      setShowAddTrainingModal(false);
      showToast(
        "success",
        `Allenamento ${formattedTraining.title} aggiunto e salvato con successo`,
      );
      return true;
    } catch (error: any) {
      console.error("Error adding training:", error);
      /*
        **Il server diceva gia perche, e qui veniva buttato via** (PP-01 §C).

        «Il campo e gia occupato in quell'orario da «Under 15»» oppure «La
        struttura e chiusa a quell'ora» diventavano tutti «Errore durante
        l'aggiunta dell'allenamento», e chi salvava restava senza sapere ne cosa
        fosse successo ne cosa cambiare.
      */
      const messaggio = String(error?.message || "").trim();
      showToast(
        "error",
        messaggio || "Errore durante l'aggiunta dell'allenamento",
      );
      return false;
    } finally {
      setSalvataggioInCorso(false);
    }
  };

  /**
   * Le squadre a cui un allenamento si puo assegnare.
   *
   * Solo i gruppi **attivi**: una categoria che in quella sede non si svolge
   * piu non deve comparire fra le scelte, ma il suo storico resta leggibile
   * (ADR-0055).
   */
  const groupOptions = React.useMemo(
    () => getActiveCategoryGroups(categoryGroups),
    [categoryGroups],
  );

  const openAttendanceSheet = React.useCallback(
    async (training: TrainingSession) => {
      const eventCategories = categories.filter((category) =>
        trainingMatchesCategory(training, category, categories),
      );
      /*
        **L'appello gia preso si rilegge dall'archivio** (P0-5).

        `training.attendance` non e mai arrivato dalla rotta del calendario:
        questa schermata riapriva il registro sempre vuoto, e salvarlo una
        seconda volta cancellava la prima. Le righe stanno in
        `club_event_participants`, e le legge la rotta dei partecipanti — la
        stessa che il perimetro dell'allenatore gia filtra.

        La proiezione, se un giorno tornera a portarle, **vince**: e la copia
        che la schermata ha gia in mano, e chiederle due volte sarebbe un giro
        di rete per niente.
      */
      let existingEntries = normalizeTrainingAttendanceEntries(
        training.attendance,
      );
      /*
        **Chi ha davvero una voce di appello.** La proiezione porta solo voci
        di appello; le righe dei partecipanti portano anche convocazioni e
        risposte delle famiglie, che non sono un appello (`pending` o senza
        stato). Il cassetto mostra «da segnare» a chi non ce l'ha.
      */
      const appelloFatto = new Set(existingEntries.map((entry) => entry.athleteId));

      if (!existingEntries.length && activeClub?.id) {
        try {
          const righe = await listEventParticipants(
            String((training as any).eventId || training.id || ""),
          );
          existingEntries = normalizeTrainingAttendanceEntries(righe);
          for (const riga of righe as any[]) {
            const atleta = String(riga?.athlete_id || riga?.athleteId || "").trim();
            const stato = String(riga?.status || "").trim().toLowerCase();
            if (atleta && stato && stato !== "pending") appelloFatto.add(atleta);
          }
        } catch (errore) {
          console.error("Error reading training attendance:", errore);
        }
      }

      const existingEntriesByAthleteId = new Map(
        existingEntries.map((entry) => [entry.athleteId, entry]),
      );
      const activeAthletes = clubAthletes.filter(
        (athlete: any) =>
          !athlete.data?.status || athlete.data.status === "active",
      );

      /*
        **Chi c'e in campo, non chi e nella fascia** (ADR-0055). Un allenamento
        di `Pulcini · Santi Cosma` apre l'appello dei Pulcini di Santi Cosma:
        quelli di Scauri a quell'ora sono a trenta chilometri, e vederseli
        davanti da segnare e il modo piu rapido per registrare una presenza che
        non c'e stata — e per farla poi diventare un contributo rendicontato.

        Un allenamento che non dichiara gruppi e un dato precedente: li si
        ricade sulla categoria, cioe sul comportamento di prima.
      */
      const trainingGroupIds = readTrainingGroupIds(training);
      const siteIndex = buildSiteIndex(sites);
      const groupAthletes = trainingGroupIds.length
        ? activeAthletes.filter((athlete: any) =>
            getAthleteGroupIds(athlete, siteIndex).some((groupId) =>
              trainingGroupIds.includes(groupId),
            ),
          )
        : null;

      const categoryAthletes =
        groupAthletes ??
        (eventCategories.length > 0
          ? activeAthletes.filter((athlete: any) =>
              athleteMatchesAnyCategory(athlete, eventCategories, categories),
            )
          : activeAthletes);
      const savedOutsideCategoryAthletes = clubAthletes.filter(
        (athlete: any) =>
          existingEntriesByAthleteId.has(athlete.id) &&
          !categoryAthletes.some(
            (candidate: any) => candidate.id === athlete.id,
          ),
      );
      const visibleAthletes = [...categoryAthletes, ...savedOutsideCategoryAthletes]
        .reduce<any[]>((collection, athlete) => {
          if (collection.some((candidate) => candidate.id === athlete.id)) {
            return collection;
          }

          collection.push(athlete);
          return collection;
        }, [])
        .sort(compareAthletesByLastName);

      setAttendanceModalState({
        training,
        athletes: visibleAthletes.map((athlete) =>
          buildTrainingAttendanceAthlete({
            athlete,
            eventCategories,
            existingEntry: existingEntriesByAthleteId.get(athlete.id),
            recorded: appelloFatto.has(athlete.id),
          }),
        ),
        clubAthletes: activeAthletes
          .map((athlete: any) =>
            buildTrainingAttendanceAthlete({
              athlete,
              eventCategories,
              existingEntry: existingEntriesByAthleteId.get(athlete.id),
              recorded: appelloFatto.has(athlete.id),
            }),
          )
          .sort((left, right) =>
            compareAthletesByLastName(
              left.rawAthlete || {
                first_name: left.firstName,
                last_name: left.lastName,
              },
              right.rawAthlete || {
                first_name: right.firstName,
                last_name: right.lastName,
              },
            ),
          ),
      });
    },
    [activeClub?.id, categories, clubAthletes, sites],
  );

  React.useEffect(() => {
    if (
      requestedFocus !== "attendance" ||
      !requestedTrainingId ||
      autoOpenedAttendanceId === requestedTrainingId
    ) {
      return;
    }

    const requestedTraining = trainings.find(
      (training) => training.id === requestedTrainingId,
    );

    if (!requestedTraining) {
      return;
    }

    setView("day");
    setDate(requestedTraining.date);

    if (canRecordTrainingAttendance(requestedTraining)) {
      openAttendanceSheet(requestedTraining);
    }

    setAutoOpenedAttendanceId(requestedTrainingId);
  }, [
    autoOpenedAttendanceId,
    openAttendanceSheet,
    requestedFocus,
    requestedTrainingId,
    trainings,
  ]);

  const handleSaveAttendanceSheet = React.useCallback(
    async (data: AttendanceSavePayload) => {
      if (!activeClub?.id) {
        showToast("error", "Nessun club attivo selezionato");
        return;
      }

      setSavingAttendance(true);
      try {
        await saveTrainingAttendance(activeClub.id, data.trainingId, data.attendance);
        setTrainings((currentTrainings) =>
          currentTrainings.map((training) =>
            training.id === data.trainingId
              ? {
                  ...training,
                  attendance: data.attendance,
                  attendees: data.attendance.filter((entry) => entry.present)
                    .length,
                }
              : training,
          ),
        );
        setAttendanceModalState(null);
        showToast(
          "success",
          `Presenze salvate · ${data.attendance.filter((entry) => entry.present).length}/${data.attendance.length}`,
        );
      } catch (error) {
        console.error("Error saving attendance:", error);
        showToast("error", "Errore nel salvataggio delle presenze");
      } finally {
        setSavingAttendance(false);
      }
    },
    [activeClub?.id, showToast],
  );


  /**
   * La modifica, con la versione e il messaggio del server (PP-01 §B, PP-02 §O).
   * Torna `true` se ha salvato: il cassetto si chiude solo allora.
   */
  const handleEditTraining = async (
    updatedTraining: {
      id: string;
      title: string;
      date: string;
      time: string;
      endTime?: string;
      location: string;
      trainerIds: string[];
      categories: string[];
      groupIds?: string[];
    },
    _originalTraining: unknown,
  ): Promise<boolean> => {
    if (!editingTraining) return false;
    setModificaInCorso(true);
    try {
            if (!activeClub?.id) {
              showToast("error", "Nessun club attivo selezionato");
              return false;
            }

            try {
              const resolvedLocationId =
                locations.find(
                  (location) => location.name === updatedTraining.location,
                )?.id || null;
              const collisions = findTrainingCollisions(
                trainings,
                {
                  id: updatedTraining.id,
                  date: updatedTraining.date,
                  time: updatedTraining.time,
                  endTime: updatedTraining.endTime || null,
                  locationId: resolvedLocationId,
                },
                { ignoreId: updatedTraining.id },
              );

              let sovrapposizioneConfermata = false;
              if (collisions.length > 0) {
                sovrapposizioneConfermata = await richiediConferma({
                  title: "Il campo risulta gia occupato",
                  confirmText: "Salva comunque",
                  description:
                    `In quel campo e in quella fascia ci sono gia ${collisions.length} ` +
                    `${collisions.length === 1 ? "allenamento" : "allenamenti"}. ` +
                    "Puoi salvare lo stesso: l'allenamento restera accanto agli altri.",
                });
                if (!sovrapposizioneConfermata) return false;
              }

              // Prepare the update data
              const updateData = {
                title: updatedTraining.title,
                date: updatedTraining.date,
                time: updatedTraining.time,
                endTime: updatedTraining.endTime || null,
                location: updatedTraining.location,
                /*
                  Allenatori e categorie si salvano per intero.

                  Qui `trainerIds` veniva riscritto con **un** solo id, quello
                  scelto in una tendina singola: un allenamento con tre
                  allenatori, aperto in modifica e salvato, ne perdeva due.
                  Le categorie non venivano toccate affatto, quindi non c'era
                  modo di cambiarle dopo la creazione.
                */
                trainerIds: updatedTraining.trainerIds,
                trainer:
                  trainers
                    .filter((tr) => updatedTraining.trainerIds.includes(tr.id))
                    .map((tr) => tr.name)
                    .join(", ") || editingTraining.trainer,
                categories: updatedTraining.categories,
                /*
                  I gruppi dicono **quali squadre**: la categoria da sola non
                  basta quando la stessa si svolge in piu sedi (ADR-0055).
                */
                groupIds: updatedTraining.groupIds || [],
                categoryId: updatedTraining.categories[0] || null,
                category:
                  categories
                    .filter((category) =>
                      updatedTraining.categories.includes(category.id),
                    )
                    .map((category) => category.name)
                    .join(", ") ||
                  editingTraining.categoryName ||
                  "Categoria",
                locationId: resolvedLocationId,
                /* Il campo deve arrivare al server: vedi PP-01 §C in creazione. */
                fieldId: resolvedLocationId,
                allowOverlap: sovrapposizioneConfermata,
                updated_at: new Date().toISOString(),
              };


              /*
                **PP-02 §O. La versione parte con la modifica.**

                Senza, `expectedVersion` era `null` e il server ricadeva sulla
                versione corrente: il controllo ottimistico non poteva fallire,
                e due segretarie che salvavano insieme tornavano a «vince
                l'ultimo». Il messaggio del server dice gia di ricaricare; qui
                si ricarica **davvero**, cosi la seconda persona non deve
                ricordarsene.
              */
              const salvato = await updateEvent(
                updatedTraining.id,
                updateData,
                editingTraining.version ?? null,
              );

              /*
                **La versione torna indietro, e va scritta.**

                Mandarla non bastava: la copia in memoria veniva ricomposta
                campo per campo e `version` non era fra i campi, quindi restava
                quella **di prima**. Il modale non si chiude da solo dopo un
                salvataggio riuscito, percio la seconda modifica di fila
                ripartiva da una versione gia consumata e si sentiva rispondere
                «modificato da qualcun altro» con nessun altro che aveva toccato
                niente.
              */
              const versioneNuova = versioneSalvata(salvato);

              // Update the training in the local state
              const updatedTrainings = trainings.map((t) =>
                t.id === updatedTraining.id
                  ? {
                      ...t,
                      version: versioneNuova ?? t.version,
                      title: updatedTraining.title,
                      date: new Date(updatedTraining.date),
                      time: updatedTraining.time,
                      endTime: updatedTraining.endTime || null,
                      location: updatedTraining.location,
                      locationId: resolvedLocationId,
                      trainer: updateData.trainer,
                      category: updateData.category,
                      categoryId: updateData.categoryId,
                      categoryReferences: updatedTraining.categories,
                      groupIds: updatedTraining.groupIds || [],
                    }
                  : t,
              );
              setTrainings(updatedTrainings);
              /*
                E il modale resta aperto: va risincronizzato anche lui, o la
                riga fresca vive solo nell'elenco sotto.
              */
              setEditingTraining((corrente) =>
                corrente && corrente.id === updatedTraining.id
                  ? updatedTrainings.find((t) => t.id === updatedTraining.id) ||
                    corrente
                  : corrente,
              );
              showToast(
                "success",
                `Allenamento ${updatedTraining.title} modificato e salvato con successo`,
              );
              return true;
            } catch (error: any) {
              console.error("Error updating training:", error);
              /*
                **Qui il messaggio del server e la funzione** (PP-01 §B).

                Se l'allenamento ha gia una storia, il dominio rifiuta e dice
                **quali** campi non si possono piu cambiare e cosa resta
                modificabile. Sostituirlo con «Errore durante la modifica»
                lascerebbe chi salva davanti a una porta chiusa senza cartello.
              */
              const messaggio = String(error?.message || "").trim();
              showToast(
                "error",
                messaggio || "Errore durante la modifica dell'allenamento",
              );
              /*
                **PP-02 §O. Sul conflitto si ricarica, e non lo si chiede.**

                Il server dice «ricarica la pagina e riprova», ed e la cosa
                giusta da dire; ma lasciarla come istruzione vuol dire che chi
                non la esegue continua a salvare su una versione vecchia e a
                ricevere lo stesso errore per sempre. Qui la ricarica avviene, e
                il modulo resta aperto con i dati freschi sotto.

                Solo sul conflitto: su un campo congelato o su una
                sovrapposizione ricaricare butterebbe via cio che la persona ha
                appena scritto, senza servire a niente.
              */
              if (/modificato da qualcun altro/i.test(messaggio)) {
                /*
                  Ricaricare l'elenco non bastava: il modale legge
                  `editingTraining`, che e una copia a se stante. Senza questa
                  risincronizzazione ogni nuovo tentativo dallo stesso modale
                  rimandava la **stessa** versione stantia, e l'errore si
                  ripeteva per sempre — cioe l'opposto di cio che il commento
                  qui sopra promette.
                */
                const freschi = await loadData();
                const fresco = freschi?.find(
                  (t) => t.id === updatedTraining.id,
                );
                if (fresco) setEditingTraining(fresco);
              }
            }
    } finally {
      setModificaInCorso(false);
    }
    return false;
  };

  /* ── Annulla / Ripristina / Elimina, con la conferma dell'applicazione ── */

  const confermaAnnullamento = React.useCallback(async () => {
    const training = trainingToCancel;
    if (!training) return;
    setCambioStatoInCorso(true);
    try {
      /*
        Anche qui la versione: partendo senza, il server ricadeva sulla
        corrente e la incrementava, e la copia locale non lo sapeva. Il primo
        salvataggio dopo un «Annulla» falliva per un conflitto che non
        esisteva.
      */
      const annullato = await cancelEvent(training.id, training.version ?? null);
      const versioneAnnullata = versioneSalvata(annullato);
      setTrainings((current) =>
        current.map((t) =>
          t.id === training.id
            ? { ...t, version: versioneAnnullata ?? t.version, status: "annullato" as const }
            : t,
        ),
      );
      showToast("success", "Allenamento annullato");
      setTrainingToCancel(null);
    } catch (error) {
      console.error("Error cancelling training:", error);
      showToast("error", messaggioDiErrore(error, "Errore durante l'annullamento"));
      setTrainingToCancel(null);
      if (/modificato da qualcun altro/i.test(String((error as any)?.message || ""))) {
        await loadData();
      }
    } finally {
      setCambioStatoInCorso(false);
    }
  }, [loadData, showToast, trainingToCancel]);

  const confermaRipristino = React.useCallback(async () => {
    const training = trainingToRestore;
    if (!training) return;
    setCambioStatoInCorso(true);
    try {
      const ripristinato = await restoreEvent(training.id, training.version ?? null);
      const versioneRipristinata = versioneSalvata(ripristinato);
      setTrainings((current) =>
        current.map((t) =>
          t.id === training.id
            ? { ...t, version: versioneRipristinata ?? t.version, status: "upcoming" as const }
            : t,
        ),
      );
      showToast("success", "Allenamento ripristinato");
      setTrainingToRestore(null);
    } catch (error) {
      console.error("Error restoring training:", error);
      showToast("error", messaggioDiErrore(error, "Errore durante il ripristino"));
      setTrainingToRestore(null);
      if (/modificato da qualcun altro/i.test(String((error as any)?.message || ""))) {
        await loadData();
      }
    } finally {
      setCambioStatoInCorso(false);
    }
  }, [loadData, showToast, trainingToRestore]);

  const confermaEliminazione = React.useCallback(async () => {
    if (!trainingToDelete || !activeClub?.id) return;
    setDeletingTraining(true);
    try {
      /*
        Cancellare, ma solo se non ha lasciato una traccia: un allenamento con
        presenze o risposte si annulla, e il dominio lo rifiuta con un
        messaggio che lo dice.
      */
      await deleteEventIfEmpty(trainingToDelete.id);
      setTrainings((current) => current.filter((t) => t.id !== trainingToDelete.id));
      showToast("success", "Allenamento eliminato con successo");
    } catch (error) {
      console.error("Error deleting training:", error);
      showToast("error", messaggioDiErrore(error, "Errore durante l'eliminazione"));
    } finally {
      setDeletingTraining(false);
      setShowDeleteTraining(false);
      setTrainingToDelete(null);
    }
  }, [activeClub?.id, showToast, trainingToDelete]);

  /* ── Le sedute del giorno e della settimana ────────────────────────────── */

  const siteIdOfTraining = React.useCallback(
    (training: TrainingSession) =>
      training.structureId
        ? siteIdByStructureId[String(training.structureId)] || ""
        : "",
    [siteIdByStructureId],
  );

  // Filter trainings for the selected date (including all statuses)
  const filteredTrainings = React.useMemo(
    () =>
      trainings
        .filter((training) => Boolean(date && isTrainingOnDate(training, date)))
        .filter((training) => {
          const siteId = siteIdOfTraining(training);
          // Sede vuota = non dichiarata: l'allenamento resta visibile con
          // qualunque filtro.
          return recordMatchesSite(siteId ? [siteId] : [], siteFilter);
        })
        .sort(compareTrainingsByStart),
    [date, siteFilter, siteIdOfTraining, trainings],
  );

  const weekTrainings = React.useMemo(() => {
    if (!date) return [];
    const days = weekDaysOf(date);
    return trainings
      .filter((training) => days.some((day) => isTrainingOnDate(training, day)))
      .filter((training) => {
        const siteId = siteIdOfTraining(training);
        return recordMatchesSite(siteId ? [siteId] : [], siteFilter);
      })
      .sort(compareTrainingsByStart);
  }, [date, siteFilter, siteIdOfTraining, trainings]);

  const countTrainingsOn = React.useCallback(
    (day: Date) => trainings.filter((training) => isTrainingOnDate(training, day)).length,
    [trainings],
  );
  const countMatchesOn = React.useCallback(
    (day: Date) => countMatchesOnDate(matches, day),
    [matches],
  );

  const visibleTrainings = view === "day" ? filteredTrainings : weekTrainings;
  /*
    «n senza presenze registrate»: l'appello lo legge una primitiva sola
    (`readRecordedAttendance`), e conta solo chi lo puo ancora fare (data
    arrivata, non annullato) — come i «Presenze mancanti» della V1.
  */
  const senzaPresenze = visibleTrainings.filter(
    (training) =>
      readRecordedAttendance(training).recorded === 0 &&
      canRecordTrainingAttendance(training),
  ).length;

  const siteIndex = React.useMemo(() => buildSiteIndex(sites), [sites]);
  const siteNameOfTraining = React.useCallback(
    (training: TrainingSession) => {
      const siteId = siteIdOfTraining(training);
      return siteId ? siteIndex.getSiteName(siteId) : "";
    },
    [siteIdOfTraining, siteIndex],
  );

  const sessionActions = React.useMemo<SessionActions>(
    () => ({
      onAttendance: (training) => void openAttendanceSheet(training),
      onEdit: (training) => {
        setEditingTraining(training);
        setShowEditTrainingModal(true);
      },
      onCancel: (training) => setTrainingToCancel(training),
      onRestore: (training) => setTrainingToRestore(training),
      onDelete: (training) => {
        setTrainingToDelete(training);
        setShowDeleteTraining(true);
      },
    }),
    [openAttendanceSheet],
  );

  const gridColumns = React.useMemo(
    () => buildTrainingColumns({ siteNameOf: siteNameOfTraining }),
    [siteNameOfTraining],
  );
  /* Come si scrive una categoria nel filtro (ADR-0185): la sede solo dove serve, niente voci storiche. */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories, groups: categoryGroups }),
    [categories, categoryGroups],
  );
  /*
    Le persone in prova nel registro presenze (ADR-0188): il ruolo decide se
    la sezione c'e e cosa puo fare; la categoria dell'allenamento e quella
    proposta alla registrazione rapida. Le opzioni sono le stesse del filtro.
  */
  const ruoloAttivo = activeClub?.role || null;
  const trialOptions = React.useMemo(
    () =>
      roleHasPermission(ruoloAttivo, "trials.read")
        ? {
            canRecord: roleHasPermission(ruoloAttivo, "trials.attendance"),
            canCreate: roleHasPermission(ruoloAttivo, "trials.manage"),
            canReadContacts: roleHasPermission(ruoloAttivo, "trials.contacts_read"),
            defaultCategoryId: attendanceModalState?.training?.categoryId || null,
            categoryOptions: selectableCategoryOptions(categories).map((category) => ({
              id: String(category.id),
              name: String(category.name),
              label: categoryDisplay.label(category.id),
            })),
          }
        : null,
    [attendanceModalState?.training?.categoryId, categories, categoryDisplay, ruoloAttivo],
  );
  const gridFilters = React.useMemo(
    () =>
      buildTrainingFilters({
        categoryOptions: selectableCategoryOptions(categories).map((category) => ({
          value: String(category.id),
          label: categoryDisplay.label(category.id),
        })),
        trainerOptions: trainers.map((trainer) => ({
          value: String(trainer.id),
          label: String(trainer.name),
        })),
        siteOptions: isMultiSiteClub(sites)
          ? getActiveClubSites(sites).map((site) => ({ value: site.id, label: site.name }))
          : [],
        siteIdOf: siteIdOfTraining,
      }),
    [categories, categoryDisplay, siteIdOfTraining, sites, trainers],
  );
  const gridRowActions = React.useMemo(
    () =>
      buildTrainingRowActions({
        onAttendance: sessionActions.onAttendance,
        onEdit: sessionActions.onEdit,
        onCancel: sessionActions.onCancel,
        onRestore: sessionActions.onRestore,
        onDelete: sessionActions.onDelete,
      }),
    [sessionActions],
  );

  const scrollToSchedule = () => {
    scheduleSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectedDate = date ?? requestedDate;
  const pageTitle =
    view === "day"
      ? `Allenamenti · ${formatDayTitle(selectedDate)}`
      : `Allenamenti · ${formatWeekTitle(selectedDate)}`;
  const sedute = visibleTrainings.length;
  /* La stagione mostrata (ADR-0197 §9, §15): sedute e programma settimanale sono i suoi. */
  const stagioneMostrata = activeClub?.activeSeasonLabel ? `Stagione ${activeClub.activeSeasonLabel}` : null;
  const pageDescription = loading
    ? "Caricamento delle sedute…"
    : [
        stagioneMostrata,
        `${formatInteger(sedute)} ${sedute === 1 ? "seduta" : "sedute"}${view === "week" ? " nella settimana" : ""} · ${formatInteger(senzaPresenze)} senza presenze registrate`,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Allenamenti" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Attività sportiva"
              title={pageTitle}
              description={pageDescription}
              context={
                <SiteContextControl
                  sites={sites}
                  value={siteFilter}
                  onChange={setSiteFilter}
                  id="trainings-site-filter"
                />
              }
              actions={
                <>
                  <SegmentedControl<TrainingView>
                    aria-label="Vista"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "day", label: "Vista giorno" },
                      { value: "week", label: "Vista settimana" },
                    ]}
                  />
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton aria-label="Altre azioni" variant="secondary" size="md">
                        <MoreHorizontal />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent align="end" width={240}>
                      <MenuItem onSelect={scrollToSchedule}>
                        <CalendarRange />
                        Programma settimanale
                      </MenuItem>
                      {missingCategoryPanel ? (
                        <MenuItem onSelect={handleCleanupMissingCategories} tone="danger">
                          <Trash2 />
                          Rimuovi allenamenti in programma
                        </MenuItem>
                      ) : null}
                    </MenuContent>
                  </Menu>
                  <Button variant="primary" onClick={() => setShowAddTrainingModal(true)}>
                    Nuovo allenamento
                  </Button>
                </>
              }
            >
              {loadWarning ? (
                <AlertBlock
                  severity="warning"
                  title="Alcuni dati non sono arrivati"
                  actions={
                    <Button variant="secondary" size="sm" onClick={() => void loadData()}>
                      Riprova
                    </Button>
                  }
                >
                  {loadWarning}
                </AlertBlock>
              ) : null}
              {missingCategoryPanel ? (
                <AlertBlock
                  severity="warning"
                  title="Categorie non rilevate nel programma allenamenti"
                  className={loadWarning ? "mt-3" : undefined}
                  actions={
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={cleaningMissingCategories}
                      onClick={handleCleanupMissingCategories}
                    >
                      {cleaningMissingCategories ? "Pulizia in corso..." : "Rimuovi allenamenti in programma"}
                    </Button>
                  }
                >
                  <p>
                    Alcuni allenamenti in programma fanno riferimento a categorie che probabilmente sono state
                    eliminate o rinominate fuori sincronizzazione.
                  </p>
                  <p className="egw-num mt-1">
                    Programma settimanale: {missingCategoryPanel.weeklyCount} · Allenamenti futuri:{" "}
                    {missingCategoryPanel.upcomingCount}
                  </p>
                  {missingCategoryPanel.labels.length > 0 ? (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {missingCategoryPanel.labels.slice(0, 6).map((label) => (
                        <DataChip key={label} tone="amber" size="sm">
                          {label}
                        </DataChip>
                      ))}
                    </span>
                  ) : null}
                </AlertBlock>
              ) : null}
            </PageHeader>

            <div className="grid min-w-0 gap-[18px] lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
              <WeekRail
                className="lg:sticky lg:top-0"
                selectedDate={selectedDate}
                onSelectDate={(next) => setDate(next)}
                countTrainings={countTrainingsOn}
                countMatches={countMatchesOn}
              />

              <div className="min-w-0">
                {view === "day" ? (
                  <DaySessions
                    trainings={filteredTrainings}
                    loading={loading}
                    actions={sessionActions}
                    onCreate={() => setShowAddTrainingModal(true)}
                    filtered={Boolean(siteFilter)}
                  />
                ) : (
                  <DataGrid<TrainingSession>
                    module={TRAINING_GRID_MODULE}
                    aria-label="Allenamenti della settimana"
                    rows={weekTrainings}
                    getRowId={trainingRowKey}
                    rowLabel={(row) => row.title}
                    columns={gridColumns}
                    filters={gridFilters}
                    views={TRAINING_VIEWS}
                    search={{
                      placeholder: "Cerca per titolo, categoria, allenatore",
                      match: (row, query) =>
                        [row.title, row.category, row.trainer, row.location]
                          .join(" ")
                          .toLowerCase()
                          .includes(query),
                    }}
                    defaultSort={{ columnId: "data", direction: "asc" }}
                    rowActions={gridRowActions}
                    onOpenRow={(row) => {
                      if (canRecordTrainingAttendance(row)) void openAttendanceSheet(row);
                      else sessionActions.onEdit(row);
                    }}
                    state={loading ? "loading" : "ready"}
                    canSelect={false}
                    empty={{
                      title: "Nessun allenamento in questa settimana",
                      description: siteFilter
                        ? "Con la sede scelta non c'è nessuna seduta: prova a cambiare il contesto."
                        : "Scegli un'altra settimana dal rail, oppure aggiungi una seduta.",
                      primary: (
                        <Button variant="neutral" onClick={() => setShowAddTrainingModal(true)}>
                          Nuovo allenamento
                        </Button>
                      ),
                    }}
                    noun={{ singular: "allenamento", plural: "allenamenti" }}
                    hideFooter={weekTrainings.length <= 25}
                  />
                )}
              </div>
            </div>

            <div ref={scheduleSectionRef}>
              <CollapsedSection
                id="programma-settimanale"
                recordType={TRAINING_GRID_MODULE}
                title={stagioneMostrata ? `Programma settimanale · ${stagioneMostrata}` : "Programma settimanale"}
                summary={`Le regole ricorrenti della settimana e la generazione automatica delle sedute${activeClub?.activeSeasonLabel ? ` della stagione ${activeClub.activeSeasonLabel}` : ""}.`}
                count={weeklySchedule.length}
              >
                <WeeklyTrainingSchedule
                  categories={categories}
                  groups={groupOptions}
                  trainers={trainers}
                  locations={locations}
                  initialSchedule={weeklySchedule}
                  autoSave={true}
                  onSave={async (nextSchedule) => {
                    setWeeklySchedule(
                      Array.isArray(nextSchedule) ? nextSchedule : [],
                    );
                  }}
                  allowDragDrop={true}
                  onTrainingsGenerated={loadData}
                />
              </CollapsedSection>
            </div>
          </DashboardPageContainer>
        </main>
      </div>

      <AttendanceDrawer
        open={Boolean(attendanceModalState)}
        onOpenChange={(open) => {
          if (!open) setAttendanceModalState(null);
        }}
        training={attendanceModalState?.training ?? null}
        athletes={attendanceModalState?.athletes ?? EMPTY_ATHLETES}
        clubAthletes={attendanceModalState?.clubAthletes ?? EMPTY_ATHLETES}
        onSave={handleSaveAttendanceSheet}
        saving={savingAttendance}
        trials={trialOptions}
      />

      {showAddTrainingModal ? (
        <AddTrainingForm
          isOpen={showAddTrainingModal}
          onClose={() => setShowAddTrainingModal(false)}
          onSubmit={handleAddTraining}
          categories={categories}
          groups={groupOptions}
          trainers={trainers}
          locations={locations}
          selectedDate={date}
          saving={salvataggioInCorso}
        />
      ) : null}

      {/* Edit Training Form */}
      {editingTraining && (
        <EditTrainingForm
          isOpen={showEditTrainingModal}
          onClose={() => {
            setShowEditTrainingModal(false);
            setEditingTraining(null);
          }}
          onSubmit={handleEditTraining}
          saving={modificaInCorso}
          training={{
            id: editingTraining.id,
            title: editingTraining.title,
            date: editingTraining.date.toISOString().split("T")[0],
            time: editingTraining.time,
            endTime: editingTraining.endTime || "",
            location: editingTraining.location,
            /*
              Gli allenatori si ricavano dai nomi solo se il record non porta
              gia gli id: i record piu vecchi hanno solo la stringa unita.
            */
            trainerIds:
              editingTraining.trainerIds?.length
                ? editingTraining.trainerIds
                : trainers
                    .filter((trainer) =>
                      editingTraining.trainer
                        ?.split(",")
                        .map((name) => name.trim())
                        .includes(trainer.name),
                    )
                    .map((trainer) => trainer.id),
            categories: editingTraining.categoryReferences || [],
            groupIds: editingTraining.groupIds || [],
          }}
          trainers={trainers}
          categories={categories}
          groups={groupOptions}
          locations={locations.map((loc) => loc.name)}
          /*
            **Un avviso, non un presidio** (PP-01 §B). Il client sa se
            l'appello e stato fatto, e con questo anticipa la regola invece di
            farla scoprire a salvataggio fallito. L'autorita resta il server —
            `campiCongelatiToccati` conta anche convocazioni e risposte delle
            famiglie, che qui non sono caricate — e se dice di no lo dice con il
            proprio messaggio, che la pagina ora mostra per intero.
          */
          consolidato={
            normalizeTrainingAttendanceEntries(editingTraining.attendance)
              .length > 0
          }
        />
      )}

      {/*
        Conferma proporzionata (guideline 10 §10.5, regola 9): annullare e
        ripristinare sono notevoli e reversibili → `ConfirmDialog`;
        eliminare e distruttivo → `DangerConfirmDialog` con cio che se ne va.
        Le parole sono quelle della V1.
      */}
      <ConfirmDialog
        open={Boolean(trainingToCancel)}
        onOpenChange={(open) => {
          if (!open && !cambioStatoInCorso) setTrainingToCancel(null);
        }}
        title="Vuoi davvero annullare questo allenamento?"
        description={
          trainingToCancel
            ? `«${trainingToCancel.title}» resta in calendario come annullato: presenze, convocazioni e risposte già registrate non si toccano, e potrai ripristinarlo.`
            : undefined
        }
        confirmLabel="Annulla allenamento"
        cancelLabel="Torna indietro"
        onConfirm={confermaAnnullamento}
        loading={cambioStatoInCorso}
      />

      <ConfirmDialog
        open={Boolean(trainingToRestore)}
        onOpenChange={(open) => {
          if (!open && !cambioStatoInCorso) setTrainingToRestore(null);
        }}
        title="Vuoi ripristinare questo allenamento annullato?"
        description={
          trainingToRestore
            ? `«${trainingToRestore.title}» torna in programma con la sua storia.`
            : undefined
        }
        confirmLabel="Ripristina"
        onConfirm={confermaRipristino}
        loading={cambioStatoInCorso}
      />

      <DangerConfirmDialog
        open={showDeleteTraining}
        onOpenChange={(open) => {
          if (!open && !deletingTraining) {
            setShowDeleteTraining(false);
            setTrainingToDelete(null);
          }
        }}
        title="Eliminare l'allenamento?"
        description={
          trainingToDelete?.title
            ? `«${trainingToDelete.title}» verrà rimosso dal calendario. L'operazione non può essere annullata.`
            : "L'allenamento verrà rimosso dal calendario. L'operazione non può essere annullata."
        }
        consequences={[
          "La seduta sparisce dal calendario e dal programma della settimana.",
          "Si può eliminare solo un allenamento senza presenze, convocazioni o risposte: uno con una storia va annullato, non eliminato.",
        ]}
        confirmLabel="Elimina"
        onConfirm={confermaEliminazione}
        loading={deletingTraining}
      />

      {/*
        PP-02 §O. La conferma della pulizia, dentro l'applicazione. Dice
        esattamente cosa succede alle due meta — il programma settimanale e gli
        allenamenti gia in calendario — e cosa **non** succede allo storico,
        che e la domanda che una segreteria si fa prima di premere.
      */}
      <DangerConfirmDialog
        open={puliziaCategorieAperta}
        onOpenChange={(open) => {
          if (!open && !cleaningMissingCategories) setPuliziaCategorieAperta(false);
        }}
        title="Rimuovere gli allenamenti in programma?"
        description="Vengono tolti dal programma settimanale e dal calendario soltanto gli allenamenti ancora da svolgere collegati a categorie che non esistono più."
        consequences={[
          "Le righe del programma settimanale collegate a categorie eliminate vengono rimosse.",
          "Gli allenamenti futuri di quelle categorie vengono eliminati.",
          "Gli allenamenti già svolti restano, e quelli su cui è stato fatto l'appello o è arrivata una risposta non si cancellano: vanno annullati uno per uno.",
        ]}
        confirmLabel="Rimuovi"
        onConfirm={eseguiPuliziaCategorie}
        loading={cleaningMissingCategories}
      />

      {/*
        La conferma della sovrapposizione (PP-01 §C). E la stessa primitiva
        della cancellazione qui sopra: un dialogo dell'applicazione, non il
        `confirm` del browser, che il browser sopprime dopo il primo uso e che
        in una webview puo non comparire affatto.
      */}
      <ConfirmDialog
        open={Boolean(confermaInSospeso)}
        onOpenChange={(aperto) => {
          if (!aperto) chiudiConferma(false);
        }}
        title={confermaInSospeso?.title ?? ""}
        description={confermaInSospeso?.description}
        confirmLabel={confermaInSospeso?.confirmText ?? "Conferma"}
        onConfirm={() => chiudiConferma(true)}
      />
    </div>
  );
}

const EMPTY_ATHLETES: AttendanceSheetAthlete[] = [];
