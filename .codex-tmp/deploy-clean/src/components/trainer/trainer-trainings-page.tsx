"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ClipboardCheck, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import { AttendanceSheet } from "@/components/trainer/AttendanceSheet";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  SectionBlockedState,
  SectionEmptyState,
  TrainingMeta,
  getStatusBadgeClasses,
} from "@/components/trainer/trainer-dashboard-shared";
import { cn } from "@/lib/utils";
import { saveTrainingAttendance, updateClubDataItem } from "@/lib/simplified-db";
import { useToast } from "@/components/ui/toast-notification";

export default function TrainerTrainingsPage() {
  const { activeClub, assignedAthletes, permissions, reload, visibleTrainings } =
    useTrainerDashboard();
  const { showToast } = useToast();
  const [selectedTraining, setSelectedTraining] = useState<any | null>(null);
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

  if (visibleTrainings.length === 0) {
    return (
      <SectionEmptyState
        title="Nessun allenamento disponibile"
        description="Qui vedrai soltanto gli allenamenti delle categorie a te assegnate."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Allenamenti
        </h1>
        <p className="text-gray-600 mt-2">
          Visualizzi e gestisci solo gli allenamenti delle categorie assegnate al trainer.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Allenamenti visibili</p>
            <p className="mt-2 text-3xl font-bold">{visibleTrainings.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-emerald-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Presenze</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {permissions.actions.manageAttendance ? "Abilitate" : "Disabilitate"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-orange-500 to-orange-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Stato allenamento</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {permissions.actions.manageTrainingStatus
                ? "Annullamento gestibile"
                : "Solo consultazione"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[30px] border-white/80 bg-white/90 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
              Allenamenti filtrati
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Visualizzi solo gli allenamenti delle tue categorie
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Il club controlla da qui visibilità e operatività del trainer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
              {visibleTrainings.length} allenamenti
            </Badge>
            <Badge
              className={cn(
                "hover:bg-transparent",
                permissions.actions.manageAttendance
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-100 text-slate-600",
              )}
            >
              {permissions.actions.manageAttendance
                ? "Presenze abilitate"
                : "Presenze disabilitate"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleTrainings.map((training) => {
          const status = getStatusBadgeClasses(
            training?.status,
            training?.startsAt,
            training?.endsAt,
          );
          const trainingCategoryTokens = [
            ...(Array.isArray(training?.categoryIds) ? training.categoryIds : []),
            ...String(training?.category || "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          ].map((value) => String(value || "").trim().toLowerCase());
          const trainingAthletes = assignedAthletes
            .filter((athlete) => {
              const athleteTokens = [
                athlete?.data?.category,
                athlete?.category_id,
                athlete?.category_name,
                athlete?.data?.categoryName,
              ]
                .map((value) => String(value || "").trim())
                .filter(Boolean)
                .map((value) => value.toLowerCase());

              return trainingCategoryTokens.some((token) =>
                athleteTokens.includes(token),
              );
            })
            .map((athlete) => {
              const attendanceRecord = Array.isArray(training?.attendance)
                ? training.attendance.find((entry: any) => entry.athleteId === athlete.id)
                : null;

              return {
                id: athlete.id,
                name:
                  `${athlete?.first_name || athlete?.data?.name || ""} ${athlete?.last_name || athlete?.data?.surname || ""}`.trim() ||
                  "Atleta",
                present: attendanceRecord?.present || false,
                notes: attendanceRecord?.notes || "",
              };
            });

          return (
            <Card
              key={training.id}
              className="bg-white shadow-md border-0 overflow-hidden"
            >
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-600"></div>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xl font-semibold text-slate-900">
                      {training.title || "Allenamento"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {training.category || "Categoria"}
                    </p>
                  </div>
                  <Badge className={status.className}>{status.label}</Badge>
                </div>

                <TrainingMeta
                  date={training.date}
                  time={training.time}
                  endTime={training.endTime}
                  location={training.location}
                  category={training.category}
                  showDetails={permissions.actions.viewTrainingDetails}
                />

                {permissions.actions.viewTrainingDetails &&
                Array.isArray(training?.trainerNames) &&
                training.trainerNames.length > 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Allenatori</p>
                    <p className="mt-1">{training.trainerNames.join(", ")}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {permissions.actions.manageAttendance ? (
                    <button
                      type="button"
                      onClick={() => setSelectedTraining(training)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Presenze
                    </button>
                  ) : null}

                  {permissions.actions.manageTrainingStatus &&
                  String(training?.status || "").toLowerCase() !== "annullato" &&
                  String(training?.status || "").toLowerCase() !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: "Annullare allenamento?",
                          description:
                            "L’allenamento verrà segnato come annullato per il trainer e per il club.",
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
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-600 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Annulla
                    </button>
                  ) : null}

                  {permissions.actions.manageTrainingStatus &&
                  ["annullato", "cancelled"].includes(
                    String(training?.status || "").toLowerCase(),
                  ) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: "Ripristinare allenamento?",
                          description:
                            "L’allenamento tornerà attivo e nuovamente operativo.",
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
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Ripristina
                    </button>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-700">Atleti coinvolti</p>
                  <p className="mt-1">
                    {trainingAthletes.length > 0
                      ? `${trainingAthletes.length} atleti collegati`
                      : "Nessun atleta collegato alle categorie dell’allenamento"}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
              trainingTime={`${String(selectedTraining.time || "").slice(0, 5)}${selectedTraining.endTime ? ` - ${String(selectedTraining.endTime).slice(0, 5)}` : ""}`}
              categoryName={selectedTraining.category || "Categoria"}
              location={selectedTraining.location || "Campo"}
              athletes={assignedAthletes
                .filter((athlete) => {
                  const trainingTokens = [
                    ...(Array.isArray(selectedTraining?.categoryIds)
                      ? selectedTraining.categoryIds
                      : []),
                    ...String(selectedTraining?.category || "")
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  ].map((value) => String(value || "").trim().toLowerCase());
                  const athleteTokens = [
                    athlete?.data?.category,
                    athlete?.category_id,
                    athlete?.category_name,
                    athlete?.data?.categoryName,
                  ]
                    .map((value) => String(value || "").trim().toLowerCase())
                    .filter(Boolean);

                  return trainingTokens.some((token) =>
                    athleteTokens.includes(token),
                  );
                })
                .map((athlete) => {
                  const attendanceRecord = Array.isArray(selectedTraining?.attendance)
                    ? selectedTraining.attendance.find((entry: any) => entry.athleteId === athlete.id)
                    : null;
                  return {
                    id: athlete.id,
                    name:
                      `${athlete?.first_name || athlete?.data?.name || ""} ${athlete?.last_name || athlete?.data?.surname || ""}`.trim() ||
                      "Atleta",
                    present: attendanceRecord?.present || false,
                    notes: attendanceRecord?.notes || "",
                    medicalCertExpiry:
                      athlete?.data?.medicalCertExpiry ||
                      athlete?.medical_cert_expiry ||
                      athlete?.medicalCertExpiry ||
                      null,
                  };
                })}
              onSave={async ({ attendance }) => {
                if (!activeClub?.id) return;
                try {
                  await saveTrainingAttendance(activeClub.id, selectedTraining.id, attendance);
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
