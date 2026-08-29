"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-notification";
import { TrainingRsvpSummary } from "@/components/trainer/TrainingRsvpSummary";
import { CheckCircle, Save, X, AlertTriangle } from "lucide-react";
import {
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";

interface AttendanceSheetProps {
  trainingId: string;
  trainingTitle: string;
  trainingDate: string;
  trainingTime: string;
  categoryName: string;
  location: string;
  athletes: {
    id: string;
    name: string;
    avatar?: string;
    present?: boolean;
    notes?: string;
    medicalCertExpiry?: string | null;
    participationContext?: "primary" | "secondary" | "extra";
    participationBadgeLabel?: string | null;
    isExtraCategory?: boolean;
    isManualExtra?: boolean;
    primaryCategoryName?: string | null;
  }[];
  clubAthletes?: {
    id: string;
    name: string;
    avatar?: string;
    medicalCertExpiry?: string | null;
    participationContext?: "primary" | "secondary" | "extra";
    participationBadgeLabel?: string | null;
    isExtraCategory?: boolean;
    isManualExtra?: boolean;
    primaryCategoryName?: string | null;
  }[];
  onSave: (attendanceData: {
    trainingId: string;
    attendance: {
      athleteId: string;
      present: boolean;
      notes: string;
      isExtraCategory?: boolean;
      isManualExtra?: boolean;
      categoryMembershipType?: string | null;
    }[];
  }) => void;
  onClose: () => void;
}

type AttendanceSheetAthlete = AttendanceSheetProps["athletes"][number];

export function AttendanceSheet({
  trainingId,
  trainingTitle,
  trainingDate,
  trainingTime,
  categoryName,
  location,
  athletes = [],
  clubAthletes = [],
  onSave,
  onClose,
}: AttendanceSheetProps) {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [athleteRows, setAthleteRows] = useState(athletes);
  const [attendance, setAttendance] = useState(
    athletes.map((athlete) => ({
      athleteId: athlete.id,
      present: athlete.present || false,
      notes: athlete.notes || "",
      isExtraCategory: Boolean(athlete.isExtraCategory),
      isManualExtra: Boolean(athlete.isManualExtra),
      categoryMembershipType: athlete.participationContext || "primary",
    })),
  );

  React.useEffect(() => {
    setAthleteRows(athletes);
    setAttendance(
      athletes.map((athlete) => ({
        athleteId: athlete.id,
        present: athlete.present || false,
        notes: athlete.notes || "",
        isExtraCategory: Boolean(athlete.isExtraCategory),
        isManualExtra: Boolean(athlete.isManualExtra),
        categoryMembershipType: athlete.participationContext || "primary",
      })),
    );
  }, [athletes]);

  const handleTogglePresence = (athleteId: string) => {
    setAttendance((currentAttendance) =>
      currentAttendance.map((item) =>
        item.athleteId === athleteId
          ? { ...item, present: !item.present }
          : item,
      ),
    );
  };

  const handleSetPresence = (athleteId: string, present: boolean) => {
    setAttendance((currentAttendance) =>
      currentAttendance.map((item) =>
        item.athleteId === athleteId ? { ...item, present } : item,
      ),
    );
  };

  const handleNotesChange = (athleteId: string, notes: string) => {
    setAttendance((currentAttendance) =>
      currentAttendance.map((item) =>
        item.athleteId === athleteId ? { ...item, notes } : item,
      ),
    );
  };

  const handleMarkAllPresent = () => {
    setAttendance((currentAttendance) =>
      currentAttendance.map((item) => ({ ...item, present: true })),
    );
  };

  const handleAddExtraAthlete = (athlete: AttendanceSheetAthlete) => {
    if (!athlete || athleteRows.some((row) => row.id === athlete.id)) {
      return;
    }

    setAthleteRows((currentRows) => [
      ...currentRows,
      {
        ...athlete,
        present: true,
      },
    ]);
    setAttendance((currentAttendance) => [
      ...currentAttendance,
      {
        athleteId: athlete.id,
        present: true,
        notes: "",
        isExtraCategory:
          athlete.participationContext === "extra" || Boolean(athlete.isExtraCategory),
        isManualExtra:
          athlete.participationContext === "extra" || Boolean(athlete.isManualExtra),
        categoryMembershipType: athlete.participationContext || "primary",
      },
    ]);
    setSearchQuery("");
  };

  const handleSave = () => {
    onSave({
      trainingId,
      attendance,
    });
    showToast("success", "Presenze salvate con successo");
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getPresentCount = () => {
    return attendance.filter((item) => item.present).length;
  };

  const suggestedAthletes = clubAthletes
    .filter(
      (athlete) =>
        !athleteRows.some((row) => row.id === athlete.id) &&
        athlete.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
    )
    .slice(0, 6);

  const getParticipationBadgeClassName = (
    context?: "primary" | "secondary" | "extra",
  ) => {
    if (context === "extra") {
      return "border-amber-200 bg-amber-50 text-amber-800";
    }

    if (context === "secondary") {
      return "border-sky-200 bg-sky-50 text-sky-800";
    }

    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  };

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{trainingTitle}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(trainingDate)} • {trainingTime} • {categoryName} •{" "}
            {location}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="self-end sm:self-auto">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              Presenti: <strong>{getPresentCount()}</strong> / {athleteRows.length}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllPresent}
              className="text-green-600 border-green-600 hover:bg-green-50"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Segna tutti presenti
            </Button>
          </div>

          {/*
            Le intenzioni dichiarate dalle famiglie stanno **sopra** l'appello e
            fuori da esso: si guardano prima di segnare le presenze, e nessuna
            delle due scritture tocca l'altra.
          */}
          <TrainingRsvpSummary trainingId={trainingId} />

          <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">
                Aggiungi atleta extra
              </p>
              <p className="text-xs text-slate-500">
                Cerca tra tutti gli atleti del club ed evita duplicati nella lista presenze.
              </p>
            </div>
            <Input
              placeholder="Cerca atleta del club..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery.trim() ? (
              suggestedAthletes.length > 0 ? (
                <div className="space-y-2">
                  {suggestedAthletes.map((athlete) => (
                    <button
                      key={`attendance-extra-${athlete.id}`}
                      type="button"
                      onClick={() => handleAddExtraAthlete(athlete)}
                      className="flex w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div>
                        <p className="text-sm font-medium">{athlete.name}</p>
                        {athlete.primaryCategoryName ? (
                          <p className="text-xs text-muted-foreground">
                            Categoria primaria: {athlete.primaryCategoryName}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant="outline"
                        className={getParticipationBadgeClassName(
                          athlete.participationContext,
                        )}
                      >
                        {athlete.participationBadgeLabel || "Aggiungi"}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nessun atleta disponibile con questo filtro.
                </p>
              )
            ) : null}
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {athleteRows.map((athlete) => {
                const attendanceRecord = attendance.find(
                  (a) => a.athleteId === athlete.id,
                );
                const isPresent = Boolean(attendanceRecord?.present);

                return (
                  <div
                    key={athlete.id}
                    onClick={() => handleTogglePresence(athlete.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                      isPresent
                        ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900"
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isPresent}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleTogglePresence(athlete.id);
                      }
                    }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <span
                        className="mt-1 inline-flex"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          id={`attendance-${athlete.id}`}
                          checked={isPresent}
                          onCheckedChange={(checked) =>
                            handleSetPresence(athlete.id, checked === true)
                          }
                          className="h-5 w-5 shrink-0 data-[state=checked]:bg-blue-600"
                        />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-950 dark:text-slate-100">
                            {athlete.name}
                          </p>
                          <Badge
                            className={
                              isPresent
                                ? "border-blue-200 bg-blue-600 text-white hover:bg-blue-600"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-white"
                            }
                          >
                            {isPresent ? "Presente" : "Assente"}
                          </Badge>
                          {athlete.participationBadgeLabel ? (
                            <Badge
                              variant="outline"
                              className={getParticipationBadgeClassName(
                                athlete.participationContext,
                              )}
                            >
                              {athlete.participationBadgeLabel}
                            </Badge>
                          ) : null}
                          {getMedicalCertificateAvailability(
                            athlete.medicalCertExpiry,
                          ) !== "valid" ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : null}
                        </div>

                        {getMedicalCertificateAvailability(
                          athlete.medicalCertExpiry,
                        ) !== "valid" ? (
                          <p className="mt-1 text-xs font-medium text-amber-600">
                            {getMedicalCertificateAvailabilityLabel(
                              getMedicalCertificateAvailability(
                                athlete.medicalCertExpiry,
                              ),
                            )}
                          </p>
                        ) : null}
                        {athlete.primaryCategoryName &&
                        athlete.participationContext !== "primary" ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Categoria primaria: {athlete.primaryCategoryName}
                          </p>
                        ) : null}

                        <div
                          className="mt-3"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Input
                            placeholder="Note per questo atleta"
                            value={attendanceRecord?.notes || ""}
                            onChange={(e) =>
                              handleNotesChange(athlete.id, e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Salva Presenze
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
