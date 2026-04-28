"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import { AttendanceSheet } from "@/components/trainer/AttendanceSheet";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  CompactEntityCard,
  FeatureHighlightCard,
  SectionBlockedState,
  SectionEmptyState,
  SummaryCard,
  SurfacePanel,
  formatDate,
  formatTimeRange,
  getAthleteDisplayName,
  getStatusBadgeClasses,
} from "@/components/trainer/trainer-dashboard-shared";
import {
  getTrainerEndOfWeek,
  isSameTrainerDay,
  recordMatchesCategory,
} from "@/lib/trainer-dashboard-helpers";
import { canRecordTrainingAttendance } from "@/lib/training-utils";
import { saveTrainingAttendance, updateClubDataItem } from "@/lib/simplified-db";
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
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
  const todayTrainings = visibleTrainings.filter((training) =>
    isSameTrainerDay(training?.startsAt, now),
  );
  const weekTrainings = visibleTrainings.filter(
    (training) =>
      training?.startsAt &&
      training.startsAt >= now &&
      training.startsAt <= endOfWeek &&
      !isSameTrainerDay(training.startsAt, now),
  );
  const futureTrainings = visibleTrainings.filter(
    (training) => training?.startsAt && training.startsAt > endOfWeek,
  );
  const selectedDateTrainings = visibleTrainings.filter((training) =>
    selectedDate ? isSameTrainerDay(training?.startsAt, selectedDate) : false,
  );

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
          ? training.attendance.find((entry: any) => entry.athleteId === athlete.id)
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
    if (trainings.length === 0) {
      return (
        <SectionEmptyState
          title={emptyTitle}
          description={emptyDescription}
        />
      );
    }

    return (
      <div className="space-y-3">
        {trainings.map((training) => {
          const status = getStatusBadgeClasses(
            training?.status,
            training?.startsAt,
            training?.endsAt,
          );
          const trainingAthletes = getTrainingAthletes(training);
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
              key={training.id}
              title={training.title || "Allenamento"}
              className={
                focusedTrainingId === training.id
                  ? "border-blue-300 bg-blue-50/70 shadow-sm"
                  : undefined
              }
              badge={<Badge className={status.className}>{status.label}</Badge>}
              lines={[
                <span key="category">
                  {training.displayCategory || training.category || "Categoria"}
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
                <span key="athletes">
                  {trainingAthletes.length} atleti collegati
                </span>,
              ]}
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
                      Presenze
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
      <div className="space-y-2">
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
          Allenamenti
        </h1>
        <p className="text-gray-600">
          In alto trovi gli allenamenti del giorno, sotto la settimana corrente e
          il calendario delle prossime attivita delle tue categorie.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={CalendarDays}
          label="Allenamenti visibili"
          value={visibleTrainings.length}
          accentClassName="bg-blue-50 text-blue-600"
          topBarClassName="from-blue-500 to-blue-600"
        />
        <SummaryCard
          icon={ClipboardCheck}
          label="Allenamenti di oggi"
          value={todayTrainings.length}
          accentClassName="bg-emerald-50 text-emerald-600"
          topBarClassName="from-emerald-500 to-emerald-600"
        />
        <SummaryCard
          icon={XCircle}
          label="Stato operativo"
          value={
            permissions.actions.manageTrainingStatus &&
            permissions.actions.manageAttendance
              ? 2
              : permissions.actions.manageAttendance ||
                  permissions.actions.manageTrainingStatus
                ? 1
                : 0
          }
          accentClassName="bg-orange-50 text-orange-600"
          topBarClassName="from-orange-500 to-orange-600"
        />
      </div>

      <FeatureHighlightCard
        tone="violet"
        title="Allenamenti di Oggi"
        count={todayTrainings.length}
        icon={CalendarDays}
      >
        {todayTrainings.length === 0 ? (
          <div className="py-5 text-center text-white/75">
            <CalendarDays className="mx-auto mb-2 h-10 w-10 opacity-50" />
            <p>Nessun allenamento previsto per oggi</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayTrainings.map((training) => (
              <div
                key={training.id}
                className="rounded-lg bg-white/10 p-3 backdrop-blur-sm"
              >
                <p className="font-medium">{training.title || "Allenamento"}</p>
                <p className="mt-1 text-sm text-white/80">
                  {formatTimeRange(training.time, training.endTime)}
                </p>
                <p className="text-sm text-white/80">
                  {training.displayCategory || training.category || "Categoria"}
                </p>
              </div>
            ))}
          </div>
        )}
      </FeatureHighlightCard>

      {visibleTrainings.length === 0 ? (
        <SectionEmptyState
          title="Nessun allenamento disponibile"
          description="Qui vedrai soltanto gli allenamenti delle categorie assegnate al trainer."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <SurfacePanel
              title="Allenamenti della Settimana"
              description="Le sedute da oggi fino a fine settimana."
              icon={CalendarDays}
            >
              {renderTrainingList(
                weekTrainings,
                "Nessun altro allenamento questa settimana",
                "Le nuove attivita assegnate dal club compariranno qui.",
              )}
            </SurfacePanel>

            <SurfacePanel
              title="Allenamenti Successivi"
              description="Le settimane successive in ordine cronologico."
              icon={CalendarDays}
            >
              {renderTrainingList(
                futureTrainings,
                "Nessun allenamento nelle settimane successive",
                "Quando il programma si estende, i nuovi appuntamenti compariranno qui.",
              )}
            </SurfacePanel>
          </div>

          <SurfacePanel
            title="Calendario Allenamenti"
            description="Seleziona un giorno per vedere subito le sedute programmate."
            icon={CalendarDays}
          >
            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="mx-auto"
                  modifiers={{
                    scheduled: visibleTrainings
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
                    ? `Allenamenti del ${selectedDate.toLocaleDateString("it-IT")}`
                    : "Seleziona un giorno"}
                </p>
                {selectedDateTrainings.length > 0 ? (
                  selectedDateTrainings.map((training) => {
                    const status = getStatusBadgeClasses(
                      training?.status,
                      training?.startsAt,
                      training?.endsAt,
                    );

                    return (
                      <CompactEntityCard
                        key={training.id}
                        title={training.title || "Allenamento"}
                        badge={
                          <Badge className={status.className}>{status.label}</Badge>
                        }
                        lines={[
                          <span key="time">
                            {formatTimeRange(training.time, training.endTime)}
                          </span>,
                          <span key="location">
                            {training.location || "Luogo da definire"}
                          </span>,
                          <span key="category">
                            {training.displayCategory || training.category || "Categoria"}
                          </span>,
                        ]}
                      />
                    );
                  })
                ) : (
                  <SectionEmptyState
                    title="Nessun allenamento nel giorno selezionato"
                    description="Prova un'altra data del calendario."
                  />
                )}
              </div>
            </div>
          </SurfacePanel>
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
