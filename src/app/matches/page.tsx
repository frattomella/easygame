"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, MoreHorizontal, Settings2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  cancelEvent,
  createEvent,
  deleteEventIfEmpty,
  listEventParticipants,
  listEvents,
  restoreEvent,
  saveEventConvocations,
  updateEvent,
} from "@/lib/events/client";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  getClubData,
  getClubAthletes,
  getClubCategories,
  getClubStructures,
  getClubTrainers,
  getClubSettings,
  saveClubSettings,
} from "@/lib/simplified-db";
import { athleteMatchesAnyCategory } from "@/lib/category-utils";
import { formatLocalDateOnly } from "@/lib/date-only";
import {
  buildCategoryGroups,
  buildSiteIndex,
  getActiveClubSites,
  getAthleteGroupIds,
  isCrossSiteEvent,
  isMultiSiteClub,
  normalizeClubSites,
  readSiteReference,
  readTrainingGroupIds,
} from "@/lib/club-sites";
import {
  getParticipationCategoryBadgeLabel,
  getParticipationCategoryContext,
  getPrimaryAthleteCategoryMembership,
} from "@/lib/athlete-category-memberships";
import {
  buildTrainingLocationOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import { formatMatchLocationLabel } from "@/lib/match-location";
import { getInvalidCertificatesForConvocatedAthletes } from "@/lib/match-certificate-warnings";
import { normalizeMatchConvocationEntries } from "@/lib/athlete-participation-utils";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { PageHeader } from "@/components/web/page/PageHeader";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/web/primitives/Overlays";
import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { AlertBlock } from "@/components/web/page/Alerts";
import { CollapsedSection } from "@/components/web/record/Record";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import { Field, FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { formatInteger } from "@/lib/web/format";
import { SiteContextControl } from "@/components/athletes/v2/athletes-context-controls";
import { formatDayTitle, weekDaysOf } from "@/components/training/v2/training-page-model";
import { MatchWeekRail } from "@/components/matches/v2/MatchWeekRail";
import { DayMatches, type MatchActions, type RsvpCounts } from "@/components/matches/v2/DayMatches";
import { CategoryContextControl } from "@/components/matches/v2/matches-context-controls";
import {
  buildMatchColumns,
  buildMatchFilters,
  buildMatchRowActions,
  buildRosterFilters,
  MATCH_GRID_MODULE,
  MATCH_VIEWS,
  matchRowKey,
  ROSTER_COLUMNS,
  ROSTER_GRID_MODULE,
  rosterRowKey,
  type RosterRow,
} from "@/components/matches/v2/match-grid";
import {
  compareMatchesByStart,
  convocationTone,
  describeScheduleConflicts,
  findScheduleConflicts,
  GENERIC_MATCH_CANCEL_ERROR,
  GENERIC_MATCH_DELETE_ERROR,
  GENERIC_MATCH_EDIT_ERROR,
  GENERIC_MATCH_RESTORE_ERROR,
  getEffectiveMatchStatus,
  getReadableMatchErrorMessage,
  hasScheduleConflicts,
  isHomeMatch,
  isMatchOnDate,
  type MatchRecord,
} from "@/components/matches/v2/match-page-model";
import {
  ConvocationsDrawer,
  type ConvocationAthlete,
  type ConvocationsSavePayload,
} from "@/components/matches/v2/ConvocationsDrawer";
import {
  MatchFormDrawer,
  type MatchFormInitialData,
  type MatchFormPayload,
} from "@/components/matches/v2/MatchFormDrawer";
import { MultipleMatchesDrawer } from "@/components/matches/v2/MultipleMatchesDrawer";

/*
  La pagina Gare nel Web V2 (pattern «giornata sportiva», come `/training`):
  intestazione con il giorno e i numeri, il rail della settimana con le gare
  per giorno, le gare del giorno come card sul rail dell'ora con il filo
  arancio del modulo, la «Vista elenco» come griglia di tutte le gare, le
  convocazioni in un cassetto da 480, crea/modifica/duplica in un cassetto da
  720, la rosa convocabile e la scadenza convocazioni in due sezioni
  chiudibili in fondo.

  **La logica dati e quella della V1** (audit `wave-d-gare-calendario.md`):
  la proiezione storica `clubs.matches` in lettura con il conteggio dei
  convocati dalla rotta canonica (P0-6), lo scrittore canonico degli eventi
  per creare, modificare, annullare, ripristinare ed eliminare (ADR-0098), la
  convocazione come riga di `club_event_participants` (ADR-0099), la conferma
  cross-site e il controllo dei conflitti prima di salvare. Cio che disegna
  vive in `src/components/matches/v2/`.
*/

type Match = MatchRecord;
type MatchView = "day" | "list";

const buildMatchAthleteOption = ({
  athlete,
  match,
}: {
  athlete: any;
  match: Match;
}): ConvocationAthlete => {
  const existingEntry = normalizeMatchConvocationEntries(match).find(
    (entry) => entry.athleteId === athlete.id,
  );
  const context = getParticipationCategoryContext({
    athlete,
    eventCategories: [match.categoryId, match.category],
    entry: existingEntry || null,
  });
  const primaryCategory = getPrimaryAthleteCategoryMembership(athlete);

  return {
    id: athlete.id,
    name: getAthleteDisplayName(athlete) || "Atleta",
    avatar: athlete.avatar_url || athlete.data?.avatar || "",
    jerseyNumber:
      String(
        athlete.jersey_number ?? athlete.jerseyNumber ?? athlete.data?.jerseyNumber ?? athlete.data?.jersey_number ?? "",
      ).trim() || null,
    matchesPlayed: 0,
    matchesAbsent: 0,
    medicalCertExpiry:
      athlete.data?.medicalCertExpiry ||
      athlete.medical_cert_expiry ||
      athlete.medicalCertExpiry ||
      null,
    participationContext: context,
    participationBadgeLabel:
      context === "primary" ? null : getParticipationCategoryBadgeLabel(context),
    isExtraCategory: context === "extra" || Boolean(existingEntry?.isExtraCategory),
    isManualExtra: context === "extra" || Boolean(existingEntry?.isManualExtra),
    primaryCategoryName: primaryCategory?.categoryName || null,
  };
};

/** La versione che il server ha appena scritto (`row.version`), come in `/training`. */
const versioneSalvata = (risposta: any): number | null => {
  if (typeof risposta?.row?.version === "number") return risposta.row.version;
  if (typeof risposta?.version === "number") return risposta.version;
  return null;
};

const toMatchRecord = (match: any, convocatedCount: number | null): Match => {
  const normalized = {
    ...match,
    date: new Date(match.date),
    trainers: Array.isArray(match?.trainers) ? match.trainers : [],
    convocated_count: convocatedCount,
  };
  return { ...normalized, status: getEffectiveMatchStatus(normalized) };
};

const EMPTY_ATHLETES: ConvocationAthlete[] = [];

export default function MatchesPage() {
  const searchParams = useSearchParams();
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [view, setView] = React.useState<MatchView>("day");
  const [matches, setMatches] = React.useState<Match[]>([]);
  const [categories, setCategories] = React.useState<any[]>([]);
  const [trainers, setTrainers] = React.useState<any[]>([]);
  const [athletes, setAthletes] = React.useState<any[]>([]);
  const [clubSites, setClubSites] = React.useState<any[]>([]);
  const [clubCategoryGroups, setClubCategoryGroups] = React.useState<any[]>([]);
  const [homeLocations, setHomeLocations] = useState<TrainingLocationOption[]>([]);
  const [siteIdByStructureId, setSiteIdByStructureId] = useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [matchConvocationDeadlineDays, setMatchConvocationDeadlineDays] = useState(2);
  const [savingMatchSettings, setSavingMatchSettings] = useState(false);

  /* I cassetti */
  const [showAddMatchModal, setShowAddMatchModal] = useState(false);
  const [showMultipleAddMatchModal, setShowMultipleAddMatchModal] = useState(false);
  const [showConvocationsModal, setShowConvocationsModal] = useState(false);
  const [showEditMatchModal, setShowEditMatchModal] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<Match | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);
  const [savingConvocations, setSavingConvocations] = useState(false);
  /* La rosa gia convocata, letta dalle righe (P0-6, `D-AUD-9`). */
  const [rosaConvocata, setRosaConvocata] = useState<string[]>([]);
  /* Le risposte delle famiglie per gara, per la riga «n senza risposta». */
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, RsvpCounts>>({});

  /* Annulla / Ripristina / Elimina, con la conferma dell'applicazione. */
  const [matchToCancel, setMatchToCancel] = useState<Match | null>(null);
  const [matchToRestore, setMatchToRestore] = useState<Match | null>(null);
  const [matchToDelete, setMatchToDelete] = useState<Match | null>(null);
  const [cambioStatoInCorso, setCambioStatoInCorso] = useState(false);

  /*
    Le conferme a promessa (cross-site, conflitti di programmazione): il
    dialogo del sistema, non `window.confirm`, e con annullamento che risolve
    davvero — nella V1 annullare il conflitto lasciava il modulo in
    «Salvataggio...» per sempre.
  */
  const [richiediConferma, dialogoConferma] = useConfirm();
  const settingsSectionRef = React.useRef<HTMLDivElement | null>(null);

  const { showToast } = useToast();
  const { activeClub, user } = useAuth();

  const requestedDate = React.useMemo(() => {
    const dateParam = searchParams?.get("date") ?? null;
    if (!dateParam) return new Date();
    const parsedDate = new Date(`${dateParam}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  }, [searchParams]);

  React.useEffect(() => {
    if (!date) setDate(requestedDate);
  }, [date, requestedDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) return;
    if (action === "new") setShowAddMatchModal(true);
    params.delete("action");
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  /**
   * I gruppi operativi del club (ADR-0055): la gara si assegna a **questi**,
   * cosi il perimetro dell'allenatore la riconosce come riconosce
   * l'allenamento della stessa squadra.
   */
  const matchGroupOptions = React.useMemo(
    () =>
      buildCategoryGroups({
        categories,
        sites: normalizeClubSites(clubSites),
        groups: clubCategoryGroups,
      }),
    [categories, clubSites, clubCategoryGroups],
  );

  /** Come si scrive una categoria in questa pagina (N3): la sede solo dove serve. */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories, groups: matchGroupOptions }),
    [categories, matchGroupOptions],
  );

  const sites = React.useMemo(() => normalizeClubSites(clubSites), [clubSites]);
  const siteIndex = React.useMemo(() => buildSiteIndex(sites), [sites]);

  const loadData = React.useCallback(async (options: { silent?: boolean } = {}) => {
    if (!activeClub?.id || !user) {
      setLoading(false);
      return;
    }
    try {
      if (!options.silent) setLoading(true);
      const settled = await Promise.allSettled([
        getClubData(activeClub.id, "matches"),
        /*
          **Quante convocazioni ha ogni gara, dalla rotta che le conta**
          (P0-6). La proiezione non porta le convocazioni: sono righe di
          `club_event_participants`. Di qui si prende **solo** il conteggio.
        */
        listEvents({ kind: "match", include_cancelled: "1" }),
        getClubCategories(activeClub.id),
        getClubTrainers(activeClub.id),
        getClubSettings(activeClub.id),
        getClubStructures(activeClub.id),
        getClubAthletes(activeClub.id),
        getClubData(activeClub.id, "club_sites"),
        getClubData(activeClub.id, "category_groups"),
      ]);

      const failed: string[] = [];
      const read = (index: number, label: string): any => {
        const result = settled[index];
        if (result.status === "fulfilled") return result.value;
        console.error(`Error loading matches ${label}:`, result.reason);
        failed.push(label);
        return null;
      };
      const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

      const matchesData = asArray(read(0, "gare"));
      const eventiGara = asArray(read(1, "convocazioni"));
      const convocatiPerGara = new Map<string, number>();
      for (const evento of eventiGara) {
        const quanti = Number((evento as any)?.convocated_count || 0);
        for (const chiave of [(evento as any)?.eventId, (evento as any)?.id]) {
          const testo = String(chiave || "").trim();
          if (testo) convocatiPerGara.set(testo, quanti);
        }
      }
      setMatches(
        matchesData.map((match: any) =>
          toMatchRecord(
            match,
            convocatiPerGara.get(String(match?.eventId || "").trim()) ??
              convocatiPerGara.get(String(match?.id || "").trim()) ??
              null,
          ),
        ),
      );

      setCategories(asArray(read(2, "categorie")));
      setTrainers(asArray(read(3, "allenatori")));

      const clubSettings = read(4, "impostazioni");
      const deadlineDays = Number(
        clubSettings?.matchConvocationDeadlineDays ?? clubSettings?.match_convocation_deadline_days ?? 2,
      );
      setMatchConvocationDeadlineDays(
        Number.isFinite(deadlineDays) ? Math.max(0, Math.min(Math.round(deadlineDays), 30)) : 2,
      );

      const structuresData = asArray(read(5, "strutture"));
      setHomeLocations(buildTrainingLocationOptions(structuresData));
      /* La sede di una gara in casa e quella della sua struttura (ADR-0038). */
      setSiteIdByStructureId(
        Object.fromEntries(
          structuresData
            .map((structure: any) => [String(structure?.id || ""), readSiteReference(structure)])
            .filter(([id]) => Boolean(id)),
        ),
      );

      setAthletes(asArray(read(6, "atleti")));
      setClubSites(asArray(read(7, "sedi")));
      setClubCategoryGroups(asArray(read(8, "gruppi operativi")));

      setLoadWarning(
        failed.length ? `Alcune sezioni non sono state caricate correttamente: ${failed.join(", ")}.` : null,
      );
    } catch (error) {
      console.error("Error loading matches data:", error);
      setLoadWarning("Non è stato possibile caricare tutti i dati delle gare. Riprova tra qualche istante.");
      showToast("error", "Errore nel caricamento dei dati");
    } finally {
      setLoading(false);
    }
  }, [activeClub?.id, user, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resolveSelectedHomeLocation = (matchData: { structureId?: string; fieldId?: string }) =>
    homeLocations.find(
      (location) => location.structureId === matchData.structureId && location.fieldId === matchData.fieldId,
    );

  /**
   * Le due conferme prima di salvare, comuni a creazione e modifica: la
   * struttura di un'altra sede (non per le trasferte) e i conflitti di
   * programmazione (allenatori e categorie gia impegnati, durata presunta di
   * tre ore). Torna `false` se chi salva rinuncia.
   */
  const confermeDiSalvataggio = async (
    matchData: MatchFormPayload,
    options: { ignoreId?: string | null; verb: string },
  ): Promise<boolean> => {
    if (matchData.venueMode !== "away") {
      const gruppiSelezionati = matchGroupOptions.filter((group) =>
        Array.isArray(matchData.groupIds) ? matchData.groupIds.includes(group.id) : false,
      );
      const sediDeiGruppi = Array.from(new Set(gruppiSelezionati.map((group) => group.siteId).filter(Boolean)));
      const sedeDelGruppo = sediDeiGruppi.length === 1 ? sediDeiGruppi[0] : "";
      const sedeDellaStruttura = resolveSelectedHomeLocation(matchData)?.siteId || "";

      if (isCrossSiteEvent(sedeDelGruppo, sedeDellaStruttura)) {
        const confermatoCrossSite = await richiediConferma({
          title: "La struttura appartiene a un'altra sede",
          confirmLabel: "Conferma comunque",
          description:
            `La categoria e a «${siteIndex.getSiteName(sedeDelGruppo)}», ` +
            `la struttura scelta e a «${siteIndex.getSiteName(sedeDellaStruttura)}». ` +
            "Puoi salvarla lo stesso: e una proprieta di questa gara, non " +
            "cambia la sede della categoria ne sposta nessun atleta.",
        });
        if (!confermatoCrossSite) return false;
      }
    }

    const conflicts = findScheduleConflicts({
      matches,
      candidate: {
        date: matchData.date,
        time: matchData.time,
        trainerIds: matchData.trainerIds,
        categoryIds: matchData.categoryIds,
      },
      trainers,
      ignoreId: options.ignoreId,
    });
    if (hasScheduleConflicts(conflicts)) {
      const procedi = await richiediConferma({
        title: "Conflitto di programmazione",
        confirmLabel: options.verb,
        description: (
          <span className="block space-y-1.5">
            {describeScheduleConflicts(conflicts).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            <span className="block">Vuoi procedere comunque?</span>
          </span>
        ),
      });
      if (!procedi) return false;
    }
    return true;
  };

  /**
   * Ritorna `false` per ogni esito che non e un salvataggio riuscito —
   * validazione, cross-site o conflitto annullati, errore del writer — cosi
   * il cassetto resta aperto e compilato.
   */
  const handleAddMatch = async (matchData: MatchFormPayload): Promise<boolean> => {
    if (!activeClub?.id || !user) {
      showToast("error", "Club o utente non trovato");
      return false;
    }
    if (!matchData.categoryIds || matchData.categoryIds.length === 0) {
      showToast("error", "Seleziona almeno una categoria per la gara");
      return false;
    }
    if (!(await confermeDiSalvataggio(matchData, { verb: "Procedi comunque" }))) return false;
    return proceedWithMatchCreation(matchData);
  };

  /** `true` se la gara e stata salvata davvero — vedi `handleAddMatch`. */
  const proceedWithMatchCreation = async (matchData: MatchFormPayload): Promise<boolean> => {
    if (salvataggioInCorso) return false;
    setSalvataggioInCorso(true);
    try {
      const trainerNames = matchData.trainerIds
        .map((id: string) => trainers.find((t) => t.id === id)?.name || "")
        .filter(Boolean);
      const selectedHomeLocation = resolveSelectedHomeLocation(matchData);

      /* Una gara per ogni categoria selezionata, come la V1. */
      const newMatches = await Promise.all(
        matchData.categoryIds.map(async (categoryId: string) => {
          const categoryObj = categories.find((c) => c.id === categoryId);
          /* Il giorno civile scelto, non l'istante UTC (fix `768ef05`). */
          const matchDateIso = formatLocalDateOnly(matchData.date);
          /* Solo i gruppi di **questa** categoria. */
          const groupIdsForThisCategory: string[] = Array.isArray(matchData.groupIds)
            ? matchGroupOptions
                .filter((group) => group.categoryId === categoryId && matchData.groupIds.includes(group.id))
                .map((group) => group.id)
            : [];
          const effectiveStatus = getEffectiveMatchStatus({
            date: matchDateIso,
            time: matchData.time,
            status: "upcoming",
          });

          const newMatchData = {
            title: matchData.title || `Partita ${categoryObj?.name || ""} vs ${matchData.opponent}`,
            date: matchDateIso,
            time: matchData.time,
            category: categoryObj?.name || "Categoria",
            categoryId,
            groupIds: groupIdsForThisCategory,
            opponent: matchData.opponent,
            location: matchData.location,
            isHome: matchData.isHome !== false,
            structureId: matchData.structureId || null,
            structureName: selectedHomeLocation?.structureName || null,
            fieldId: matchData.fieldId || null,
            fieldName: selectedHomeLocation?.fieldName || null,
            locationId: matchData.fieldId || null,
            trainers: trainerNames,
            notes: matchData.notes,
            matchNumber: matchData.matchNumber || "",
            categoryColor: "bg-blue-500 text-white",
            status: effectiveStatus,
            convocationsStatus: "none",
            convocatedAthletes: [],
            convocationEntries: [],
            /* La gara ottiene cio che l'allenamento aveva gia (W5-03, W5-05). */
            rsvpRequired: matchData.rsvpRequired ?? false,
            rsvpDeadline: matchData.rsvpDeadline ?? null,
            capacity: matchData.capacity ?? null,
            siteId: selectedHomeLocation?.siteId || null,
          };

          /* La gara nasce come **riga**, come l'allenamento (ADR-0098). */
          const savedMatch = await createEvent("match", newMatchData);
          return toMatchRecord(savedMatch, 0);
        }),
      );

      setMatches((current) => [...current, ...newMatches]);

      const categoryNames = matchData.categoryIds
        .map((id: string) => categories.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      showToast("success", `Gare per ${categoryNames} aggiunte con successo`);
      setDuplicateSource(null);
      return true;
    } catch (error) {
      console.error("Error adding match:", error);
      showToast("error", getReadableMatchErrorMessage(error));
      return false;
    } finally {
      setSalvataggioInCorso(false);
    }
  };

  /**
   * **La modifica passa dallo scrittore canonico** (D-AUD-WD-1). La V1
   * riscriveva la proiezione `clubs.matches`, che il server rifiuta con 403
   * da ADR-0098: la modifica di una gara non funzionava. `updateEvent` porta
   * la versione, e un conflitto ricarica la copia locale.
   */
  const handleEditMatch = async (matchData: MatchFormPayload): Promise<boolean> => {
    if (!activeClub?.id || !selectedMatch) {
      showToast("error", "Errore nella modifica della gara");
      return false;
    }
    if (!(await confermeDiSalvataggio(matchData, { ignoreId: selectedMatch.eventId || selectedMatch.id, verb: "Salva comunque" }))) {
      return false;
    }
    setSalvataggioInCorso(true);
    try {
      const trainerNames = matchData.trainerIds
        .map((id: string) => trainers.find((t) => t.id === id)?.name || "")
        .filter(Boolean);
      const selectedHomeLocation = resolveSelectedHomeLocation(matchData);
      const categoryId = matchData.categoryIds[0] || selectedMatch.categoryId;
      const categoryObj = categories.find((c) => c.id === categoryId);
      /* Stessa correzione della creazione: il giorno civile, non l'istante UTC. */
      const matchDateIso = formatLocalDateOnly(matchData.date);
      const groupIds = Array.isArray(matchData.groupIds)
        ? matchGroupOptions
            .filter((group) => group.categoryId === categoryId && matchData.groupIds.includes(group.id))
            .map((group) => group.id)
        : [];

      const updateData = {
        title: matchData.title || `Partita ${categoryObj?.name || ""} vs ${matchData.opponent}`,
        date: matchDateIso,
        time: matchData.time,
        category: categoryObj?.name || "Categoria",
        categoryId,
        groupIds,
        opponent: matchData.opponent,
        location: matchData.location,
        isHome: matchData.isHome !== false,
        structureId: matchData.structureId || null,
        structureName: selectedHomeLocation?.structureName || null,
        fieldId: matchData.fieldId || null,
        fieldName: selectedHomeLocation?.fieldName || null,
        locationId: matchData.fieldId || null,
        trainers: trainerNames,
        notes: matchData.notes,
        matchNumber: matchData.matchNumber || "",
        rsvpRequired: matchData.rsvpRequired ?? false,
        rsvpDeadline: matchData.rsvpDeadline ?? null,
        capacity: matchData.capacity ?? null,
        siteId: selectedHomeLocation?.siteId || null,
        updated_at: new Date().toISOString(),
      };

      const eventId = String(selectedMatch.eventId || selectedMatch.id);
      const salvato = await updateEvent(eventId, updateData, selectedMatch.version ?? null);
      const versioneNuova = versioneSalvata(salvato);

      setMatches((current) =>
        current.map((match) =>
          match.id === selectedMatch.id || match.eventId === eventId
            ? toMatchRecord(
                { ...match, ...updateData, version: versioneNuova ?? match.version },
                match.convocated_count ?? null,
              )
            : match,
        ),
      );
      showToast("success", "Gara modificata con successo");
      setSelectedMatch(null);
      return true;
    } catch (error) {
      console.error("Error editing match:", error);
      showToast("error", getReadableMatchErrorMessage(error, GENERIC_MATCH_EDIT_ERROR));
      if (/modificato da qualcun altro/i.test(String((error as any)?.message || ""))) {
        await loadData();
      }
      return false;
    } finally {
      setSalvataggioInCorso(false);
    }
  };

  /**
   * **Elimina il canonico, non la proiezione**: `deleteEventIfEmpty` passa dal
   * writer (`DELETE /api/v1/events/:id`), che rifiuta da solo — con un
   * messaggio reale — una gara che ha gia una storia: quella si annulla.
   */
  const handleDeleteMatch = async (matchId: string) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }
    setCambioStatoInCorso(true);
    try {
      await deleteEventIfEmpty(matchId);
      setMatches((prev) => prev.filter((match) => match.id !== matchId && match.eventId !== matchId));
      showToast("success", "Gara eliminata con successo");
    } catch (error) {
      console.error("Error deleting match:", error);
      showToast("error", getReadableMatchErrorMessage(error, GENERIC_MATCH_DELETE_ERROR));
    } finally {
      setCambioStatoInCorso(false);
      setMatchToDelete(null);
    }
  };

  /** Stesso principio, per `cancelEvent` (`PATCH` → `status: "cancelled"`), con la versione. */
  const handleCancelMatch = async (matchId: string) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }
    const gara = matches.find((match) => match.id === matchId || match.eventId === matchId);
    setCambioStatoInCorso(true);
    try {
      const annullata = await cancelEvent(matchId, gara?.version ?? null);
      const versioneAnnullata = versioneSalvata(annullata);
      setMatches((prev) =>
        prev.map((match) =>
          match.id === matchId || match.eventId === matchId
            ? { ...match, status: "cancelled" as const, version: versioneAnnullata ?? match.version }
            : match,
        ),
      );
      showToast("success", "Gara annullata");
    } catch (error) {
      console.error("Error cancelling match:", error);
      showToast("error", getReadableMatchErrorMessage(error, GENERIC_MATCH_CANCEL_ERROR));
      if (/modificato da qualcun altro/i.test(String((error as any)?.message || ""))) {
        await loadData();
      }
    } finally {
      setCambioStatoInCorso(false);
      setMatchToCancel(null);
    }
  };

  /** Il ripristino (D-AUD-WD-2): `restoreEvent` = `PATCH` → `status: "scheduled"`. */
  const handleRestoreMatch = async (matchId: string) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }
    const gara = matches.find((match) => match.id === matchId || match.eventId === matchId);
    setCambioStatoInCorso(true);
    try {
      const ripristinata = await restoreEvent(matchId, gara?.version ?? null);
      const versioneRipristinata = versioneSalvata(ripristinata);
      setMatches((prev) =>
        prev.map((match) =>
          match.id === matchId || match.eventId === matchId
            ? toMatchRecord(
                { ...match, status: "scheduled", version: versioneRipristinata ?? match.version },
                match.convocated_count ?? null,
              )
            : match,
        ),
      );
      showToast("success", "Gara ripristinata");
    } catch (error) {
      console.error("Error restoring match:", error);
      showToast("error", getReadableMatchErrorMessage(error, GENERIC_MATCH_RESTORE_ERROR));
      if (/modificato da qualcun altro/i.test(String((error as any)?.message || ""))) {
        await loadData();
      }
    } finally {
      setCambioStatoInCorso(false);
      setMatchToRestore(null);
    }
  };

  /**
   * Apre le convocazioni leggendo le **righe**, non la copia dentro il payload
   * (P0-6, `D-AUD-9`): la convocazione e una colonna di
   * `club_event_participants` con il suo scrittore (ADR-0099). Si legge prima
   * di aprire, cosi la rosa non lampeggia vuota.
   */
  const handleOpenConvocations = async (match: Match) => {
    setRosaConvocata([]);
    try {
      const righe = await listEventParticipants(String(match?.id || ""));
      setRosaConvocata(
        (Array.isArray(righe) ? righe : [])
          .filter((riga: any) => String(riga?.convocation_status || "").trim().toLowerCase() === "convocated")
          .map((riga: any) => String(riga?.athlete_id || "").trim())
          .filter(Boolean),
      );
    } catch (error) {
      console.error("Errore lettura convocazioni:", error);
      showToast("error", "Errore nel caricamento delle convocazioni");
    }
    setSelectedMatch(match);
    setShowConvocationsModal(true);
  };

  const handleOpenEditMatch = (match: Match) => {
    setSelectedMatch(match);
    setShowEditMatchModal(true);
  };

  const handleSaveConvocations = async (data: ConvocationsSavePayload) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }
    setSavingConvocations(true);
    try {
      /*
        **La convocazione e un fatto, non un campo del payload** (ADR-0099,
        P0-6): passa dallo scrittore del dominio, mai dalla proiezione.
      */
      await saveEventConvocations(
        String(data.matchId),
        (data.convocationEntries?.length
          ? data.convocationEntries
          : (data.convocatedAthletes || []).map((id: any) => ({ athleteId: id }))
        ).map((entry: any) => ({
          athleteId: String(entry?.athleteId || entry?.id || entry),
          status: "convocated",
          isExtraCategory: Boolean(entry?.isExtraCategory),
        })),
      );

      setRosaConvocata(data.convocatedAthletes || []);
      setMatches((current) =>
        current.map((match) =>
          match.id === data.matchId
            ? {
                ...match,
                convocated_count: (data.convocatedAthletes || []).length,
                convocationsStatus: "completed" as const,
                /* Il server incrementa la versione al salvataggio: si rilegge al prossimo caricamento. */
              }
            : match,
        ),
      );
      showToast("success", `Convocazioni salvate · ${(data.convocatedAthletes || []).length} convocati`);
      setShowConvocationsModal(false);
      setSelectedMatch(null);
      /* La versione e incrementata dal server: si rilegge senza spegnere la pagina. */
      void loadData({ silent: true });
    } catch (error) {
      console.error("Error saving convocations:", error);
      showToast("error", getReadableMatchErrorMessage(error, "Errore nel salvataggio delle convocazioni"));
    } finally {
      setSavingConvocations(false);
    }
  };

  const handleSaveMatchSettings = async () => {
    if (!activeClub?.id) return;
    try {
      setSavingMatchSettings(true);
      const deadlineDays = Math.max(0, Math.min(Math.round(Number(matchConvocationDeadlineDays) || 2), 30));
      await saveClubSettings(activeClub.id, { matchConvocationDeadlineDays: deadlineDays });
      setMatchConvocationDeadlineDays(deadlineDays);
      showToast("success", "Impostazioni convocazioni salvate");
    } catch (error) {
      console.error("Error saving match settings:", error);
      showToast("error", "Errore nel salvataggio delle impostazioni gare");
    } finally {
      setSavingMatchSettings(false);
    }
  };

  /* ── Contesto, giornata, settimana ─────────────────────────────────────── */

  const matchMatchesCategory = React.useCallback(
    (match: Match, categoryId: string) => {
      if (!categoryId) return true;
      const category = categories.find((item) => item.id === categoryId);
      return match.categoryId === categoryId || category?.name === match.category || category?.id === match.category;
    },
    [categories],
  );

  const siteIdOfMatch = React.useCallback(
    (match: Match) => {
      const declared = String(match.siteId || match.site_id || "").trim();
      if (declared) return declared;
      return match.structureId ? siteIdByStructureId[String(match.structureId)] || "" : "";
    },
    [siteIdByStructureId],
  );
  const siteNameOfMatch = React.useCallback(
    (match: Match) => {
      const siteId = siteIdOfMatch(match);
      return siteId ? siteIndex.getSiteName(siteId) : "";
    },
    [siteIdOfMatch, siteIndex],
  );

  const contextMatches = React.useMemo(
    () =>
      matches.filter((match) => {
        if (!matchMatchesCategory(match, selectedCategory)) return false;
        if (!siteFilter) return true;
        const siteId = siteIdOfMatch(match);
        /* Una sede non dichiarata resta visibile con qualunque filtro (V1). */
        return !siteId || siteId === siteFilter;
      }),
    [matches, matchMatchesCategory, selectedCategory, siteFilter, siteIdOfMatch],
  );

  const selectedDate = date ?? requestedDate;

  const dayMatches = React.useMemo(
    () => contextMatches.filter((match) => isMatchOnDate(match, selectedDate)).sort(compareMatchesByStart),
    [contextMatches, selectedDate],
  );

  const weekMatches = React.useMemo(() => {
    const days = weekDaysOf(selectedDate);
    return contextMatches.filter((match) => days.some((day) => isMatchOnDate(match, day)));
  }, [contextMatches, selectedDate]);

  const countMatchesOn = React.useCallback(
    (day: Date) => contextMatches.filter((match) => isMatchOnDate(match, day)).length,
    [contextMatches],
  );

  const warningOf = React.useCallback(
    (match: Match) => getInvalidCertificatesForConvocatedAthletes(match, athletes),
    [athletes],
  );

  /*
    Le risposte delle famiglie per le gare della settimana che le chiedono: la
    rotta RSVP risponde per un evento alla volta, quindi si chiede solo per le
    gare in vista e una volta sola per gara. Un 403 e una risposta legittima.
  */
  useEffect(() => {
    const daChiedere = weekMatches.filter(
      (match) => Boolean(match.rsvpRequired) && !(String(match.eventId || match.id) in rsvpCounts),
    );
    if (!daChiedere.length) return;
    let cancelled = false;
    void (async () => {
      const risposte = await Promise.all(
        daChiedere.map(async (match) => {
          const key = String(match.eventId || match.id);
          const response = await apiRequest<any>(`/api/v1/rsvp?training_id=${encodeURIComponent(key)}`);
          const totals = response.error || !response.data?.rsvpRequired ? null : response.data.totals;
          return [key, totals ? { yes: totals.yes, no: totals.no, noResponse: totals.noResponse } : null] as const;
        }),
      );
      if (cancelled) return;
      setRsvpCounts((current) => ({ ...current, ...Object.fromEntries(risposte) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [weekMatches, rsvpCounts]);

  const rsvpOf = React.useCallback(
    (match: Match) => rsvpCounts[String(match.eventId || match.id)] ?? null,
    [rsvpCounts],
  );

  const senzaConvocazioni = dayMatches.filter((match) => convocationTone(match) === "missing").length;

  const matchActions = React.useMemo<MatchActions>(
    () => ({
      onConvocations: (match) => void handleOpenConvocations(match),
      onEdit: handleOpenEditMatch,
      onDuplicate: (match) => {
        setDuplicateSource(match);
        setShowAddMatchModal(true);
      },
      onCancel: (match) => setMatchToCancel(match),
      onRestore: (match) => setMatchToRestore(match),
      onDelete: (match) => setMatchToDelete(match),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const gridColumns = React.useMemo(
    () => buildMatchColumns({ siteNameOf: siteNameOfMatch, warningOf, rsvpOf }),
    [rsvpOf, siteNameOfMatch, warningOf],
  );
  const gridFilters = React.useMemo(
    () =>
      buildMatchFilters({
        categoryOptions: categories.map((category) => ({
          value: String(category.id),
          label: categoryDisplay.label(category.id) || String(category.name),
        })),
        siteOptions: isMultiSiteClub(sites)
          ? getActiveClubSites(sites).map((site) => ({ value: site.id, label: site.name }))
          : [],
        siteIdOf: siteIdOfMatch,
        categoryMatches: matchMatchesCategory,
      }),
    [categories, categoryDisplay, matchMatchesCategory, siteIdOfMatch, sites],
  );
  const gridRowActions = React.useMemo(() => buildMatchRowActions(matchActions), [matchActions]);

  /* ── La rosa convocabile per categoria (la tab «Convocazioni» della V1) ── */

  const rosterRows = React.useMemo<RosterRow[]>(
    () =>
      categories.flatMap((category) =>
        athletes
          .filter((athlete: any) =>
            /* Il catalogo viaggia con la domanda (D-INT-2): due «Under 15» non si fondono. */
            athleteMatchesAnyCategory(athlete, [category, category.id, category.name], categories),
          )
          .map((athlete: any) => ({
            id: `${category.id}:${athlete.id}`,
            athleteId: String(athlete.id),
            name: getAthleteDisplayName(athlete) || "Atleta",
            categoryId: String(category.id),
            categoryName: categoryDisplay.label(category.id) || String(category.name),
            status: athlete.data?.status || "active",
            matchesPlayed: null,
            matchesAbsent: null,
          })),
      ),
    [athletes, categories, categoryDisplay],
  );
  const rosterFilters = React.useMemo(
    () =>
      buildRosterFilters({
        categoryOptions: categories.map((category) => ({
          value: String(category.id),
          label: categoryDisplay.label(category.id) || String(category.name),
        })),
      }),
    [categories, categoryDisplay],
  );

  /* ── Le rose per il cassetto delle convocazioni ────────────────────────── */

  const convocationAthletes = React.useMemo<ConvocationAthlete[]>(() => {
    if (!selectedMatch) return EMPTY_ATHLETES;
    /*
      **Prima il gruppo operativo, poi la categoria** (ADR-0055). Una gara che
      dichiara i suoi gruppi riguarda solo gli atleti di quelle squadre; una
      che non li dichiara e un dato precedente e ricade sulla categoria.
    */
    const gruppiDellaGara = readTrainingGroupIds(selectedMatch);
    const perGruppo = gruppiDellaGara.length
      ? athletes.filter((athlete: any) =>
          getAthleteGroupIds(athlete, siteIndex).some((groupId) => gruppiDellaGara.includes(groupId)),
        )
      : null;
    const baseAthletes =
      perGruppo ??
      athletes.filter((athlete: any) =>
        athleteMatchesAnyCategory(athlete, [selectedMatch.categoryId, selectedMatch.category], categories),
      );
    const savedConvocationEntries = normalizeMatchConvocationEntries(selectedMatch);
    const savedExtraAthletes = athletes.filter(
      (athlete: any) =>
        savedConvocationEntries.some((entry) => entry.athleteId === athlete.id) &&
        !baseAthletes.some((currentAthlete: any) => currentAthlete.id === athlete.id),
    );
    return [...baseAthletes, ...savedExtraAthletes]
      .reduce<any[]>((collection, athlete) => {
        if (collection.some((candidate) => candidate.id === athlete.id)) return collection;
        collection.push(athlete);
        return collection;
      }, [])
      .map((athlete: any) => buildMatchAthleteOption({ athlete, match: selectedMatch }));
  }, [athletes, categories, selectedMatch, siteIndex]);

  const convocationClubAthletes = React.useMemo<ConvocationAthlete[]>(
    () => (selectedMatch ? athletes.map((athlete: any) => buildMatchAthleteOption({ athlete, match: selectedMatch })) : EMPTY_ATHLETES),
    [athletes, selectedMatch],
  );

  const savedConvocations = React.useMemo(
    () => (rosaConvocata.length ? rosaConvocata : selectedMatch?.convocatedAthletes || []),
    [rosaConvocata, selectedMatch],
  );
  const savedConvocationEntries = React.useMemo(
    () => (selectedMatch?.convocationEntries || []) as ConvocationsSavePayload["convocationEntries"],
    [selectedMatch],
  );

  /* ── Il modulo: modifica o duplica ─────────────────────────────────────── */

  const formInitialData = React.useMemo<MatchFormInitialData | undefined>(() => {
    const source = showEditMatchModal ? selectedMatch : duplicateSource;
    if (!source) return undefined;
    return {
      title: showEditMatchModal ? source.title : "",
      date: source.date,
      time: source.time,
      categoryIds: [source.categoryId],
      groupIds: readTrainingGroupIds(source),
      opponent: source.opponent,
      location: source.location,
      venueMode: isHomeMatch(source) ? "home" : "away",
      structureId: source.structureId || "",
      fieldId: source.fieldId || source.locationId || "",
      manualLocation: isHomeMatch(source) ? "" : source.location,
      trainerIds: trainers.filter((trainer) => (source.trainers || []).includes(trainer.name)).map((trainer) => trainer.id),
      notes: source.notes || "",
      matchNumber: showEditMatchModal ? source.matchNumber || "" : "",
      rsvpRequired: Boolean(source.rsvpRequired),
      rsvpDeadline: source.rsvpDeadline || null,
      capacity: source.capacity ?? null,
    };
  }, [duplicateSource, selectedMatch, showEditMatchModal, trainers]);

  const pageTitle = view === "day" ? `Gare · ${formatDayTitle(selectedDate)}` : "Gare · Vista elenco";
  const pageDescription = loading
    ? "Caricamento delle gare…"
    : view === "day"
      ? `${formatInteger(dayMatches.length)} ${dayMatches.length === 1 ? "gara" : "gare"} · ${formatInteger(senzaConvocazioni)} senza convocazioni`
      : `${formatInteger(contextMatches.length)} ${contextMatches.length === 1 ? "gara" : "gare"} · ${formatInteger(contextMatches.filter((match) => getEffectiveMatchStatus(match) === "upcoming").length)} in programma`;

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Gare" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Attività sportiva"
              title={pageTitle}
              description={pageDescription}
              context={
                categories.length >= 2 || isMultiSiteClub(sites) ? (
                  <>
                    <CategoryContextControl
                      categories={categories.map((category) => ({
                        id: String(category.id),
                        label: categoryDisplay.label(category.id) || String(category.name),
                      }))}
                      value={selectedCategory}
                      onChange={setSelectedCategory}
                    />
                    <SiteContextControl sites={sites} value={siteFilter} onChange={setSiteFilter} id="matches-site-filter" />
                  </>
                ) : undefined
              }
              actions={
                <>
                  <SegmentedControl<MatchView>
                    aria-label="Vista"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "day", label: "Vista giorno" },
                      { value: "list", label: "Vista elenco" },
                    ]}
                  />
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton aria-label="Altre azioni" variant="secondary" size="md">
                        <MoreHorizontal />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent align="end" width={240}>
                      <MenuItem onSelect={() => setShowMultipleAddMatchModal(true)}>
                        <CalendarPlus />
                        Aggiungi più gare
                      </MenuItem>
                      <MenuItem
                        onSelect={() =>
                          settingsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        <Settings2 />
                        Scadenza convocazioni
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setDuplicateSource(null);
                      setShowAddMatchModal(true);
                    }}
                  >
                    Nuova gara
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
            </PageHeader>

            {view === "day" ? (
              <div className="grid min-w-0 gap-[18px] lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
                <MatchWeekRail
                  className="lg:sticky lg:top-0"
                  selectedDate={selectedDate}
                  onSelectDate={(next) => setDate(next)}
                  countMatches={countMatchesOn}
                />
                <div className="min-w-0">
                  <DayMatches
                    matches={dayMatches}
                    loading={loading}
                    actions={matchActions}
                    onCreate={() => {
                      setDuplicateSource(null);
                      setShowAddMatchModal(true);
                    }}
                    filtered={Boolean(selectedCategory || siteFilter)}
                    warningOf={warningOf}
                    rsvpOf={rsvpOf}
                    siteNameOf={siteNameOfMatch}
                  />
                </div>
              </div>
            ) : (
              <DataGrid<Match>
                module={MATCH_GRID_MODULE}
                aria-label="Tutte le gare"
                rows={contextMatches}
                getRowId={matchRowKey}
                rowLabel={(row) => (row.opponent ? `vs ${row.opponent}` : row.title)}
                columns={gridColumns}
                filters={gridFilters}
                views={MATCH_VIEWS}
                search={{
                  placeholder: "Cerca per avversario, titolo, categoria, luogo, numero",
                  match: (row, query) =>
                    [row.opponent, row.title, row.category, formatMatchLocationLabel(row), row.matchNumber]
                      .filter(Boolean)
                      .join(" ")
                      .toLowerCase()
                      .includes(query),
                }}
                defaultSort={{ columnId: "data", direction: "asc" }}
                rowActions={gridRowActions}
                onOpenRow={(row) => {
                  if (getEffectiveMatchStatus(row) === "upcoming") void handleOpenConvocations(row);
                  else if (getEffectiveMatchStatus(row) !== "cancelled") handleOpenEditMatch(row);
                }}
                state={loading ? "loading" : "ready"}
                canSelect={false}
                empty={{
                  title: "Nessuna gara trovata",
                  description: selectedCategory || siteFilter
                    ? "Cambia il contesto o aggiungi una nuova gara."
                    : "Aggiungi la prima gara della stagione.",
                  primary: (
                    <Button
                      variant="neutral"
                      onClick={() => {
                        setDuplicateSource(null);
                        setShowAddMatchModal(true);
                      }}
                    >
                      Nuova gara
                    </Button>
                  ),
                }}
                noun={{ singular: "gara", plural: "gare" }}
                hideFooter={contextMatches.length <= 25}
              />
            )}

            <CollapsedSection
              id="rosa-convocabile"
              recordType={MATCH_GRID_MODULE}
              title="Rosa convocabile per categoria"
              summary="Gli atleti che si possono convocare, per categoria e stato di tesseramento."
              count={rosterRows.length}
            >
              <DataGrid<RosterRow>
                module={ROSTER_GRID_MODULE}
                aria-label="Rosa convocabile"
                rows={rosterRows}
                getRowId={rosterRowKey}
                rowLabel={(row) => row.name}
                columns={ROSTER_COLUMNS}
                filters={rosterFilters}
                initialFilters={{ stato: "active" }}
                search={{
                  placeholder: "Cerca atleta",
                  match: (row, query) => `${row.name} ${row.categoryName}`.toLowerCase().includes(query),
                }}
                defaultSort={{ columnId: "atleta", direction: "asc" }}
                state={loading ? "loading" : "ready"}
                canSelect={false}
                hideViews
                empty={{
                  title: "Nessuna categoria o atleta registrato",
                  description: "Aggiungi categorie e atleti per vedere la rosa convocabile.",
                }}
                noun={{ singular: "atleta", plural: "atleti" }}
                hideFooter={rosterRows.length <= 25}
              />
            </CollapsedSection>

            <div ref={settingsSectionRef}>
            <CollapsedSection
              id="scadenza-convocazioni"
              recordType={MATCH_GRID_MODULE}
              title="Scadenza convocazioni"
              summary="Avvisa gli allenatori quando una gara si avvicina e mancano le convocazioni."
            >
              <FieldSizeProvider size="sm">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Convocare entro" htmlFor="match-convocation-deadline" helper="Giorni prima della gara (0–30)." width="16ch">
                    <TextInput
                      id="match-convocation-deadline"
                      type="number"
                      numeric
                      inputMode="numeric"
                      min={0}
                      max={30}
                      value={matchConvocationDeadlineDays}
                      onChange={(event) =>
                        setMatchConvocationDeadlineDays(Math.max(0, Math.min(Number(event.target.value) || 0, 30)))
                      }
                      trailing={<span className="font-brand text-[11px] text-egw-ink-42">giorni</span>}
                    />
                  </Field>
                  <Button variant="secondary" size="md" onClick={() => void handleSaveMatchSettings()} loading={savingMatchSettings}>
                    Salva
                  </Button>
                </div>
              </FieldSizeProvider>
            </CollapsedSection>
            </div>
          </DashboardPageContainer>
        </main>
      </div>

      <MatchFormDrawer
        open={showAddMatchModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddMatchModal(false);
            setDuplicateSource(null);
          }
        }}
        onSubmit={handleAddMatch}
        categories={categories}
        groups={matchGroupOptions}
        trainers={trainers}
        selectedDate={selectedDate}
        mode={duplicateSource ? "duplicate" : "create"}
        homeFields={homeLocations}
        initialData={showEditMatchModal ? undefined : formInitialData}
        saving={salvataggioInCorso}
      />

      <MultipleMatchesDrawer
        open={showMultipleAddMatchModal}
        onOpenChange={(open) => {
          if (!open) setShowMultipleAddMatchModal(false);
        }}
        onSubmit={async (matchesData) => {
          /* Una per volta, cosi conferme e conflitti si presentano in ordine. */
          let salvate = 0;
          for (const matchData of matchesData) {
            if (await handleAddMatch(matchData)) salvate += 1;
          }
          if (salvate > 0) {
            showToast("success", `${salvate} ${salvate === 1 ? "gara aggiunta" : "gare aggiunte"} con successo`);
          }
          return salvate > 0;
        }}
        categories={categories}
        groups={matchGroupOptions}
        trainers={trainers}
        selectedDate={selectedDate}
        homeFields={homeLocations}
        saving={salvataggioInCorso}
      />

      <ConvocationsDrawer
        open={showConvocationsModal && Boolean(selectedMatch)}
        onOpenChange={(open) => {
          if (!open) {
            setShowConvocationsModal(false);
            setSelectedMatch(null);
          }
        }}
        match={showConvocationsModal ? selectedMatch : null}
        athletes={convocationAthletes}
        clubAthletes={convocationClubAthletes}
        savedConvocations={savedConvocations}
        savedConvocationEntries={savedConvocationEntries}
        onSave={handleSaveConvocations}
        saving={savingConvocations}
      />

      <MatchFormDrawer
        open={showEditMatchModal && Boolean(selectedMatch)}
        onOpenChange={(open) => {
          if (!open) {
            setShowEditMatchModal(false);
            setSelectedMatch(null);
          }
        }}
        onSubmit={handleEditMatch}
        categories={categories}
        groups={matchGroupOptions}
        trainers={trainers}
        selectedDate={selectedMatch?.date}
        mode="edit"
        homeFields={homeLocations}
        initialData={showEditMatchModal ? formInitialData : undefined}
        saving={salvataggioInCorso}
      />

      {/*
        Conferma proporzionata (guideline 10 §10.5, regola 9): annullare e
        ripristinare sono notevoli e reversibili → `ConfirmDialog`; eliminare
        e distruttivo → `DangerConfirmDialog` con cio che se ne va.
      */}
      <ConfirmDialog
        open={Boolean(matchToCancel)}
        onOpenChange={(open) => {
          if (!open && !cambioStatoInCorso) setMatchToCancel(null);
        }}
        title="Sei sicuro di voler annullare questa gara?"
        description={
          matchToCancel
            ? `«${matchToCancel.title}» resta in calendario come annullata: convocazioni e risposte già registrate non si toccano, e potrai ripristinarla.`
            : undefined
        }
        confirmLabel="Annulla gara"
        cancelLabel="Torna indietro"
        onConfirm={() => void handleCancelMatch(String(matchToCancel?.eventId || matchToCancel?.id || ""))}
        loading={cambioStatoInCorso}
      />

      <ConfirmDialog
        open={Boolean(matchToRestore)}
        onOpenChange={(open) => {
          if (!open && !cambioStatoInCorso) setMatchToRestore(null);
        }}
        title="Vuoi ripristinare questa gara annullata?"
        description={matchToRestore ? `«${matchToRestore.title}» torna in programma con la sua storia.` : undefined}
        confirmLabel="Ripristina"
        onConfirm={() => void handleRestoreMatch(String(matchToRestore?.eventId || matchToRestore?.id || ""))}
        loading={cambioStatoInCorso}
      />

      <DangerConfirmDialog
        open={Boolean(matchToDelete)}
        onOpenChange={(open) => {
          if (!open && !cambioStatoInCorso) setMatchToDelete(null);
        }}
        title="Sei sicuro di voler eliminare questa gara?"
        description={
          matchToDelete
            ? `«${matchToDelete.title}» verrà rimossa dal calendario. L'operazione non può essere annullata.`
            : "La gara verrà rimossa dal calendario. L'operazione non può essere annullata."
        }
        consequences={[
          "La gara sparisce dal calendario e dalla vista elenco.",
          "Si può eliminare solo una gara senza convocazioni, presenze o risposte: una con una storia va annullata, non eliminata.",
        ]}
        confirmLabel="Elimina"
        onConfirm={() => void handleDeleteMatch(String(matchToDelete?.eventId || matchToDelete?.id || ""))}
        loading={cambioStatoInCorso}
      />

      {dialogoConferma}
    </div>
  );
}
