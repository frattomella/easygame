"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import { AttendanceSheet } from "@/components/trainer/AttendanceSheet";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  compareTrainerRecordsByStart,
  getTrainerEndOfWeek,
  isSameTrainerDay,
  recordMatchesCategory,
} from "@/lib/trainer-dashboard-helpers";
import {
  canRecordTrainingAttendance,
  dedupeTrainings,
  getTrainingStableKey,
} from "@/lib/training-utils";
import {
  getTrainingAttendanceLabel,
  getTrainingAttendanceStatus,
  isTrainingMissingAttendance,
} from "@/lib/trainer-operational-alerts";
import {
  saveTrainingAttendance,
  updateClubDataItem,
} from "@/lib/simplified-db";
import { useToast } from "@/components/ui/toast-notification";

export default function TrainerTrainingsDashboardPage() {
  const searchParams = useSearchParams();
  const {
    activeClub,
    assignedAthletes,
    assignedCategories,
    categories,
    permissions,
    reload,
    visibleTrainings,
  } = useTrainerDashboard();
  const { showToast } = useToast();
  const [selectedTraining, setSelectedTraining] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );
  const [historySearch, setHistorySearch] = useState("");
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: (() => Promise<void>) | null;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: null,
  });

  if (!permissions.navigation.trainings) {
    return <SectionBlockedState section="trainings" />;
  }

  const now = new Date();
  const focusedTrainingId = searchParams.get("focus");
  const endOfWeek = getTrainerEndOfWeek(now);
  const uniqueVisibleTrainings = dedupeTrainings(visibleTrainings);
  const weekTrainings = uniqueVisibleTrainings.filter(
    (training) =>
      training?.startsAt &&
      training.startsAt >= now &&
      training.startsAt <= endOfWeek &&
      !isSameTrainerDay(training.startsAt, now),
  );
  const historyTrainings = uniqueVisibleTrainings
    .filter(
      (training) =>
        training?.startsAt &&
        training.startsAt < now &&
        !isSameTrainerDay(training.startsAt, now),
    )
    .sort((left, right) => {
      const leftTime = left?.startsAt ? left.startsAt.getTime() : 0;
      const rightTime = right?.startsAt ? right.startsAt.getTime() : 0;
      return rightTime - leftTime;
    });
  const normalizedHistorySearch = historySearch.trim().toLowerCase();
  const filteredHistoryTrainings = normalizedHistorySearch
    ? historyTrainings.filter((training) =>
        [
          training?.title,
          training?.date,
          training?.time,
          training?.displayCategory,
          training?.category,
          training?.status,
          training?.location,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedHistorySearch),
      )
    : historyTrainings;
  const selectedDateTrainings = uniqueVisibleTrainings.filter((training) =>
    selectedDate ? isSameTrainerDay(training?.startsAt, selectedDate) : false,
  ).sort(compareTrainerRecordsByStart);

  const getTrainingAthletes = (training: any) => {
    const trainingCategories = assignedCategories.filter((category) =>
      recordMatchesCategory(training, category, categories),
    );

    return assignedAthletes
      .filter((athlete) =>
        trainingCategories.some((category) =>
          recordMatchesCategory(athlete, category, categories),
        ),
      )
      .map((athlete) => {
        const attendanceRecord = Array.isArray(training?.attendance)
          ? training.attendance.find(
              (entry: any) => entry.athleteId === athlete.id,
            )
          : null;

        return {
          id: athlete.id,
          name: getAthleteDisplayName(athlete),
          present: attendanceRecord?.present || false,
          notes: attendanceRecord?.notes || "",
          medicalCertExpiry:
            athlete?.data?.medicalCertExpiry ||
            athlete?.medical_cert_expiry ||
            athlete?.medicalCertExpiry ||
            null,
        };
      });
  };

  const renderTrainingList = (
    trainings: any[],
    emptyTitle: string,
    emptyDescription: string,
  ) => {
    const uniqueTrainings = dedupeTrainings(trainings);

    if (uniqueTrainings.length === 0) {
      return (
        <SectionEmptyState title={emptyTitle} description={emptyDescription} />
      );
    }

    return (
      <div className="space-y-3">
        {uniqueTrainings.map((training) => {
          const status = getStatusBadgeClasses(
            training?.status,
            training?.startsAt,
            training?.endsAt,
          );
          const trainingAthletes = getTrainingAthletes(training);
          const attendanceStatus = getTrainingAttendanceStatus(
            training,
            trainingAthletes,
          );
          const missingAttendance = isTrainingMissingAttendance(
            training,
            trainingAthletes,
            now,
          );
          const canTakeAttendance =
            permissions.actions.manageAttendance &&
            canRecordTrainingAttendance({
              date: training?.date,
              time: training?.time,
              endTime: training?.endTime,
              status: training?.status,
            });

          return (
            <CompactEntityCard
              key={getTrainingStableKey(training)}
              title={training.title || "Allenamento"}
              className={
                focusedTrainingId === training.id
                  ? "border-blue-300 bg-blue-50/70 shadow-sm"
                  : missingAttendance
                    ? "border-rose-200 bg-rose-50/60"
                    : undefined
              }
              badge={<Badge className={status.className}>{status.label}</Badge>}
              lines={[
                <span key="category">
                  <Badge className="border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50">
                    {training.displayCategory || training.category || "Categoria"}
                  </Badge>
                </span>,
                <span key="date">
                  {formatDate(training.date)} ·{" "}
                  {formatTimeRange(training.time, training.endTime)}
                </span>,
                <span key="location">
                  {permissions.actions.viewTrainingDetails
                    ? training.location || "Luogo da definire"
                    : "Dettagli luogo non visibili"}
                </span>,
                <span key="attendance" className="font-medium text-slate-700">
                  {attendanceStatus.present}/{attendanceStatus.total} ·{" "}
                  {getTrainingAttendanceLabel(attendanceStatus.state)}
                </span>,
              ]}
              footer={
                missingAttendance ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-rose-700">
                    <XCircle className="h-4 w-4" />
                    Presenze da completare
                  </div>
                ) : null
              }
              actions={
                <>
                  {canTakeAttendance &&
                  !["annullato", "cancelled"].includes(
                    String(training?.status || "").toLowerCase(),
                  ) ? (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => setSelectedTraining(training)}
                    >
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      {attendanceStatus.state === "missing"
                        ? "Prendi presenze"
                        : attendanceStatus.state === "partial"
                          ? "Completa presenze"
                          : "Modifica presenze"}
                    </Button>
                  ) : null}

                  {permissions.actions.manageTrainingStatus &&
                  !["annullato", "cancelled"].includes(
                    String(training?.status || "").toLowerCase(),
                  ) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-500 text-amber-700 hover:bg-amber-50"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: "Annullare allenamento?",
                          description:
                            "L'allenamento verra segnato come annullato per il trainer e per il club.",
                          onConfirm: async () => {
                            if (!activeClub?.id) return;
                            await updateClubDataItem(
                              activeClub.id,
                              "trainings",
                              training.id,
                              { status: "annullato" },
                            );
                            await reload();
                            showToast("success", "Allenamento annullato");
                          },
                        })
                      }
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Annulla
                    </Button>
                  ) : null}

                  {permissions.actions.manageTrainingStatus &&
                  ["annullato", "cancelled"].includes(
                    String(training?.status || "").toLowerCase(),
                  ) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: "Ripristinare allenamento?",
                          description:
                            "L'allenamento tornera attivo e nuovamente operativo.",
                          onConfirm: async () => {
                            if (!activeClub?.id) return;
                            await updateClubDataItem(
                              activeClub.id,
                              "trainings",
                              training.id,
                              { status: "upcoming" },
                            );
                            await reload();
                            showToast("success", "Allenamento ripristinato");
                          },
                        })
                      }
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Ripristina
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
    <div className="space-y-6 pb-2">
      <PageHeading
        eyebrow="Dashboard trainer"
        title="Allenamenti"
        subtitle="Presenze, settimana e storico."
      />

      {uniqueVisibleTrainings.length === 0 ? (
        <SectionEmptyState
          title="Nessun allenamento disponibile"
          description="Il calendario è vuoto."
        />
      ) : (
        <div className="space-y-6">
          <SurfacePanel title="Calendario allenamenti" icon={CalendarDays}>
            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="mx-auto"
                  modifiers={{
                    scheduled: uniqueVisibleTrainings
                      .map((training) => training?.startsAt)
                      .filter(Boolean) as Date[],
                  }}
                  modifiersClassNames={{
                    scheduled:
                      "bg-blue-100 text-blue-700 font-semibold rounded-full",
                  }}
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedDate
                    ? isSameTrainerDay(selectedDate, now)
                      ? "Allenamenti di oggi"
                      : `Allenamenti del ${selectedDate.toLocaleDateString("it-IT")}`
                    : "Seleziona un giorno"}
                </p>
                {renderTrainingList(
                  selectedDateTrainings,
                  selectedDate && isSameTrainerDay(selectedDate, now)
                    ? "Nessun allenamento oggi"
                    : "Nessun allenamento nel giorno selezionato",
                  selectedDate && isSameTrainerDay(selectedDate, now)
                    ? "La giornata è libera."
                    : "Prova un'altra data.",
                )}
              </div>
            </div>
          </SurfacePanel>

          <div className="space-y-6">
            <SurfacePanel
              title="Allenamenti della settimana"
              description="Le sedute da oggi fino a fine settimana."
              icon={CalendarDays}
            >
              {renderTrainingList(
                weekTrainings,
                "Nessun altro allenamento questa settimana",
                "Settimana libera.",
              )}
            </SurfacePanel>

            <SurfacePanel
              title="Storico allenamenti"
              icon={ClipboardCheck}
              action={
                <div className="relative w-full md:w-80">
                  <Input
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Cerca per data, categoria, stato..."
                    className="rounded-2xl pl-10"
                  />
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              }
            >
              {renderTrainingList(
                filteredHistoryTrainings,
                historySearch ? "Nessun risultato" : "Storico vuoto",
                historySearch
                  ? "Modifica la ricerca."
                  : "Non ci sono allenamenti passati.",
              )}
            </SurfacePanel>
          </div>

        </div>
      )}

      {selectedTraining ? (
        <Dialog
          open={Boolean(selectedTraining)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTraining(null);
            }
          }}
        >
          <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Presenze allenamento</DialogTitle>
              <DialogDescription>
                Gestisci presenze e note degli atleti per questo allenamento.
              </DialogDescription>
            </DialogHeader>
            <AttendanceSheet
              trainingId={selectedTraining.id}
              trainingTitle={selectedTraining.title || "Allenamento"}
              trainingDate={selectedTraining.date}
              trainingTime={formatTimeRange(
                selectedTraining.time,
                selectedTraining.endTime,
              )}
              categoryName={
                selectedTraining.displayCategory ||
                selectedTraining.category ||
                "Categoria"
              }
              location={selectedTraining.location || "Campo"}
              athletes={getTrainingAthletes(selectedTraining)}
              onSave={async ({ attendance }) => {
                if (!activeClub?.id) return;
                try {
                  await saveTrainingAttendance(
                    activeClub.id,
                    selectedTraining.id,
                    attendance,
                  );
                  await reload();
                  showToast("success", "Presenze salvate correttamente");
                  setSelectedTraining(null);
                } catch (error) {
                  console.error("Error saving training attendance:", error);
                  showToast("error", "Errore nel salvataggio delle presenze");
                }
              }}
              onClose={() => setSelectedTraining(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <ConfirmDialog
        isOpen={confirmState.open}
        onClose={() =>
          setConfirmState({
            open: false,
            title: "",
            description: "",
            onConfirm: null,
          })
        }
        onConfirm={() => {
          void confirmState.onConfirm?.();
        }}
        title={confirmState.title}
        description={confirmState.description}
        confirmText="Conferma"
        cancelText="Annulla"
        type="warning"
      />
    </div>
  );
}
