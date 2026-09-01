"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  ListChecks,
  Search,
  Trophy,
} from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import { AttendanceSheet } from "@/components/trainer/AttendanceSheet";
import { MatchConvocations } from "@/components/trainer/MatchConvocations";
import { ResponsiveMatchesCalendar } from "@/components/trainer/ResponsiveMatchesCalendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listEventParticipants,
  saveEventAttendance,
  saveEventConvocations,
} from "@/lib/events/client";
import { useToast } from "@/components/ui/toast-notification";
import {
  CompactEntityCard,
  SectionBlockedState,
  SectionEmptyState,
  SurfacePanel,
  formatDate,
  formatTimeRange,
  getAthleteDisplayName,
  getStatusBadgeClasses,
} from "@/components/trainer/trainer-dashboard-shared";
import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";
import { formatMatchLocationLabel } from "@/lib/match-location";
import {
  getConvocatedAthleteIds,
  getMatchConvocationLabel,
  getMatchConvocationStatus,
} from "@/lib/trainer-operational-alerts";
import { getInvalidCertificatesForConvocatedAthletes } from "@/lib/match-certificate-warnings";

const getMatchNotes = (match: any) =>
  String(
    match?.notes ||
      match?.note ||
      match?.description ||
      match?.data?.notes ||
      match?.payload?.notes ||
      "",
  ).trim();

export default function TrainerMatchesDashboardPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const {
    activeClub,
    assignedAthletes,
    assignedCategories,
    categories,
    matchConvocationDeadlineDays,
    permissions,
    reload,
    visibleMatches,
  } = useTrainerDashboard();
  const { showToast } = useToast();
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  /*
    **L'appello anche sulla gara** (W5, §14).

    La presenza a una gara era irraggiungibile: c'era la convocazione — chi
    doveva esserci — e non c'era chi c'e stato davvero. Da quando l'evento e
    una riga, presenza e convocazione sono due colonne dello stesso fatto
    (ADR-0099), quindi la gara puo avere l'appello **senza** che questo tocchi
    le convocazioni gia salvate: sono due scrittori distinti.
  */
  const [attendanceMatch, setAttendanceMatch] = useState<any | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const focusedMatchId = searchParams.get("focus");

  if (!permissions.navigation.matches) {
    return <SectionBlockedState section="matches" />;
  }

  const now = new Date();
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredMatches = normalizedSearch
    ? visibleMatches.filter((match) =>
        [
          match?.title,
          match?.opponent,
          match?.homeTeam,
          match?.awayTeam,
          match?.displayCategory,
          match?.category,
          match?.date,
          match?.time,
          match?.status,
          getMatchNotes(match),
          formatMatchLocationLabel(match),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : visibleMatches;
  const programmedMatches = filteredMatches.filter(
    (match) => match?.startsAt && match.startsAt >= now,
  );
  const historyMatches = filteredMatches
    .filter((match) => match?.startsAt && match.startsAt < now)
    .sort((left, right) => {
      const leftTime = left?.startsAt ? left.startsAt.getTime() : 0;
      const rightTime = right?.startsAt ? right.startsAt.getTime() : 0;
      return rightTime - leftTime;
    });

  const getMatchAthletes = (match: any) => {
    const matchCategories = assignedCategories.filter((category) =>
      recordMatchesCategory(match, category, categories),
    );

    return assignedAthletes
      .filter((athlete) =>
        recordMatchesCategory(athlete, match, categories) ||
        matchCategories.some((category) =>
          recordMatchesCategory(athlete, category, categories),
        ),
      )
      .map((athlete) => ({
        id: athlete.id,
        name: getAthleteDisplayName(athlete),
        avatar: athlete?.avatar_url || athlete?.data?.avatar || "",
        medicalCertExpiry:
          athlete?.data?.medicalCertExpiry ||
          athlete?.medical_cert_expiry ||
          athlete?.medicalCertExpiry ||
          null,
        primaryCategoryName:
          athlete?.category_name ||
          athlete?.data?.categoryName ||
          athlete?.data?.category_name ||
          null,
      }));
  };

  /**
   * Apre l'appello leggendo le **righe**, non la copia dentro il payload.
   *
   * La forma storica della gara puo portarsi dietro un `attendance` scritto
   * quando le presenze vivevano nel JSON: rileggerlo da li vorrebbe dire
   * mostrare all'allenatore una lista che il rendiconto dei contributi
   * pubblici non riconosce. Le righe di `club_event_participants` sono l'unica
   * verita sull'appello, e sono quelle che si aprono.
   */
  const openAttendance = async (match: any) => {
    setAttendanceMatch(match);
    setAttendanceRows([]);
    try {
      setAttendanceRows(await listEventParticipants(String(match?.id || "")));
    } catch (error) {
      console.error("Errore lettura partecipanti gara:", error);
      showToast("error", "Errore nel caricamento dell'appello");
    }
  };

  const getMatchAttendanceAthletes = (match: any) => {
    const perAtleta = new Map(
      (Array.isArray(attendanceRows) ? attendanceRows : []).map((row: any) => [
        String(row?.athlete_id || ""),
        row,
      ]),
    );

    return getMatchAthletes(match).map((athlete) => {
      const riga = perAtleta.get(String(athlete.id));
      const stato = String(riga?.status || "").toLowerCase();

      return {
        ...athlete,
        /*
          `pending` e lo stato delle righe **nate da una risposta della
          famiglia** e mai passate dall'appello: non e una presenza, e non
          deve arrivare alla casella gia spuntata. Una promessa non diventa
          mai una presenza (ADR-0086).
        */
        present: stato === "present",
        notes: String(riga?.notes || ""),
      };
    });
  };

  const getTrainerAthleteOptions = () =>
    assignedAthletes.map((athlete) => ({
      id: athlete.id,
      name: getAthleteDisplayName(athlete),
      avatar: athlete?.avatar_url || athlete?.data?.avatar || "",
      medicalCertExpiry:
        athlete?.data?.medicalCertExpiry ||
        athlete?.medical_cert_expiry ||
        athlete?.medicalCertExpiry ||
        null,
      primaryCategoryName:
        athlete?.category_name ||
        athlete?.data?.categoryName ||
        athlete?.data?.category_name ||
        null,
    }));

  const renderMatchList = (
    matches: any[],
    emptyTitle: string,
    emptyDescription: string,
  ) => {
    if (matches.length === 0) {
      return (
        <SectionEmptyState title={emptyTitle} description={emptyDescription} />
      );
    }

    return (
      <div className="space-y-3">
        {matches.map((match) => {
          const status = getStatusBadgeClasses(
            match?.status,
            match?.startsAt,
            match?.startsAt,
          );
          const availableAthletes = getMatchAthletes(match);
          const convocationStatus = getMatchConvocationStatus({
            match,
            totalAthletes: availableAthletes.length,
            deadlineDays: matchConvocationDeadlineDays,
            now,
          });
          const missingConvocations =
            convocationStatus.state === "convocations_missing";
          const matchCategory =
            match.displayCategory || match.category || "Categoria";
          const matchNotes = getMatchNotes(match);
          const certificateWarning = getInvalidCertificatesForConvocatedAthletes(
            match,
            assignedAthletes,
          );
          const hasSavedConvocations =
            convocationStatus.convocated > 0 ||
            String(match?.convocationsStatus || "").toLowerCase() ===
              "completed" ||
            (Array.isArray(match?.convocationEntries) &&
              match.convocationEntries.length > 0);

          return (
            <CompactEntityCard
              key={match.id}
              title={match.title || "Gara"}
              leadingBadge={
                <Badge className="border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50">
                  {matchCategory}
                </Badge>
              }
              className={
                focusedMatchId === match.id
                  ? "border-blue-300 bg-blue-50/70 shadow-sm"
                  : missingConvocations
                    ? "border-rose-200 bg-rose-50/60"
                    : undefined
              }
              badge={<Badge className={status.className}>{status.label}</Badge>}
              lines={[
                <span key="opponent">
                  vs {match.opponent || "Avversario da definire"}
                </span>,
                <span key="date">
                  {formatDate(match.date)} · {formatTimeRange(match.time)}
                </span>,
                <span key="location">
                  {permissions.actions.viewMatchDetails
                    ? formatMatchLocationLabel(match)
                    : "Dettagli luogo non visibili"}
                </span>,
                <span
                  key="convocations"
                  className="flex flex-wrap items-center gap-2 font-medium text-slate-700"
                >
                  <span>
                    {convocationStatus.convocated}/{convocationStatus.total} ·{" "}
                    {getMatchConvocationLabel(convocationStatus.state)}
                  </span>
                  <MatchCertificateWarningBadge warning={certificateWarning} />
                </span>,
                ...(matchNotes
                  ? [
                      <span
                        key="notes"
                        className="line-clamp-2 text-slate-600"
                      >
                        Note: {matchNotes}
                      </span>,
                    ]
                  : []),
              ]}
              footer={
                missingConvocations ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                    Scadenza convocazioni vicina
                  </div>
                ) : null
              }
              actions={
                <>
                  {permissions.actions.manageConvocations ? (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => setSelectedMatch(match)}
                    >
                      <ListChecks className="mr-2 h-4 w-4" />
                      {hasSavedConvocations
                        ? "Modifica Convocazioni"
                        : "Convocazioni"}
                    </Button>
                  ) : null}
                  {/*
                    L'appello compare solo su una gara **gia iniziata**: prima
                    non c'e niente da registrare, e un pulsante che si puo
                    premere ma non ha senso premere insegna che l'applicazione
                    e imprecisa.
                  */}
                  {permissions.actions.manageAttendance &&
                  match?.startsAt &&
                  match.startsAt <= now ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => void openAttendance(match)}
                    >
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      Appello
                    </Button>
                  ) : null}
                </>
              }
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-0 space-y-6 pb-2">
      <PageHeading
        eyebrow="Dashboard trainer"
        title="Gare"
        subtitle="Programma, storico e convocazioni."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full md:w-[420px]">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Cerca gara, categoria, avversario, data..."
            className="rounded-2xl pl-10"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:w-auto">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "list" ? "default" : "ghost"}
            aria-pressed={viewMode === "list"}
            className={
              viewMode === "list"
                ? "flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 sm:flex-none"
                : "flex-1 rounded-xl sm:flex-none"
            }
            onClick={() => setViewMode("list")}
          >
            <ListChecks className="mr-2 h-4 w-4" />
            Lista/Card
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "calendar" ? "default" : "ghost"}
            aria-pressed={viewMode === "calendar"}
            className={
              viewMode === "calendar"
                ? "flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 sm:flex-none"
                : "flex-1 rounded-xl sm:flex-none"
            }
            onClick={() => setViewMode("calendar")}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            Calendario/Agenda
          </Button>
        </div>
      </div>

      {visibleMatches.length === 0 ? (
        <SectionEmptyState
          title="Nessuna gara disponibile"
          description="Calendario gare vuoto."
        />
      ) : viewMode === "calendar" ? (
        <SurfacePanel
          title="Calendario e agenda gare"
          description="Desktop in calendario mensile, mobile in agenda per data."
          icon={CalendarDays}
        >
          <ResponsiveMatchesCalendar
            matches={filteredMatches}
            athletes={assignedAthletes}
            getMatchAthletes={getMatchAthletes}
            deadlineDays={matchConvocationDeadlineDays}
            onSelectMatch={setSelectedMatch}
          />
        </SurfacePanel>
      ) : (
        <div className="space-y-6">
          <SurfacePanel title="Gare programmate" icon={Trophy}>
            {renderMatchList(
              programmedMatches,
              searchQuery ? "Nessun risultato" : "Nessuna gara programmata",
              searchQuery ? "Modifica la ricerca." : "Calendario futuro vuoto.",
            )}
          </SurfacePanel>

          <SurfacePanel title="Storico gare" icon={Trophy}>
            {renderMatchList(
              historyMatches,
              searchQuery ? "Nessun risultato" : "Storico vuoto",
              searchQuery
                ? "Modifica la ricerca."
                : "Non ci sono gare concluse.",
            )}
          </SurfacePanel>
        </div>
      )}

      {selectedMatch ? (
        <MatchConvocations
          isOpen={Boolean(selectedMatch)}
          onClose={() => setSelectedMatch(null)}
          matchId={selectedMatch.id}
          matchTitle={selectedMatch.title || "Gara"}
          matchDate={selectedMatch.date}
          matchTime={formatTimeRange(selectedMatch.time)}
          matchNotes={getMatchNotes(selectedMatch)}
          categoryName={
            selectedMatch.displayCategory ||
            selectedMatch.category ||
            "Categoria"
          }
          opponent={selectedMatch.opponent || "Avversario"}
          location={formatMatchLocationLabel(selectedMatch)}
          athletes={getMatchAthletes(selectedMatch)}
          clubAthletes={getTrainerAthleteOptions()}
          onSave={async ({ convocatedAthletes, convocationEntries }) => {
            if (!activeClub?.id) return;
            try {
              /*
                La convocazione e un **fatto**, non un campo dentro il payload
                della gara (ADR-0099). Le voci portano gia il fuori quota: era
                l'unica informazione che la vecchia forma sapeva dire, ed e
                quella che il rendiconto deve distinguere.
              */
              await saveEventConvocations(
                selectedMatch.id,
                (convocationEntries?.length
                  ? convocationEntries
                  : (convocatedAthletes || []).map((id: any) => ({ athleteId: id }))
                ).map((entry: any) => ({
                  athleteId: String(entry?.athleteId || entry?.id || entry),
                  status: "convocated",
                  isExtraCategory: Boolean(entry?.isExtraCategory),
                })),
              );
              await reload();
              showToast("success", "Convocazioni salvate correttamente");
              setSelectedMatch(null);
            } catch (error) {
              console.error("Error saving convocations:", error);
              showToast("error", "Errore nel salvataggio delle convocazioni");
            }
          }}
          savedConvocations={getConvocatedAthleteIds(selectedMatch)}
          savedConvocationEntries={
            selectedMatch.convocationEntries ||
            selectedMatch.convocation_entries ||
            []
          }
        />
      ) : null}

      {attendanceMatch ? (
        <Dialog
          open={Boolean(attendanceMatch)}
          onOpenChange={(open) => {
            if (!open) {
              setAttendanceMatch(null);
              setAttendanceRows([]);
            }
          }}
        >
          <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Presenze gara</DialogTitle>
              <DialogDescription>
                Registra chi e sceso in campo per questa gara.
              </DialogDescription>
            </DialogHeader>
            <AttendanceSheet
              trainingId={attendanceMatch.id}
              trainingTitle={attendanceMatch.title || "Gara"}
              trainingDate={attendanceMatch.date}
              trainingTime={formatTimeRange(attendanceMatch.time)}
              categoryName={
                attendanceMatch.displayCategory ||
                attendanceMatch.category ||
                "Categoria"
              }
              location={formatMatchLocationLabel(attendanceMatch)}
              athletes={getMatchAttendanceAthletes(attendanceMatch)}
              clubAthletes={getTrainerAthleteOptions()}
              onSave={async ({ attendance }) => {
                try {
                  /*
                    `present` diventa `present` / `absent`: lo stato e una
                    parola, non un booleano, perche `pending` deve poter
                    esistere accanto ai due — ed e cio che distingue «non ha
                    giocato» da «nessuno ha ancora fatto l'appello».
                  */
                  await saveEventAttendance(
                    String(attendanceMatch.id),
                    (attendance || []).map((entry: any) => ({
                      athleteId: String(entry?.athleteId || ""),
                      status: entry?.present ? "present" : "absent",
                      notes: entry?.notes || null,
                    })),
                  );
                  await reload();
                  showToast("success", "Presenze gara salvate correttamente");
                  setAttendanceMatch(null);
                  setAttendanceRows([]);
                } catch (error) {
                  console.error("Errore salvataggio presenze gara:", error);
                  showToast(
                    "error",
                    "Errore nel salvataggio delle presenze di gara",
                  );
                }
              }}
              onClose={() => {
                setAttendanceMatch(null);
                setAttendanceRows([]);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
