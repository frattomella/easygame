"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-notification";
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
    medicalCertExpiry?: string;
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
    medicalCertExpiry?: string;
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
    setAttendance(
      attendance.map((item) =>
        item.athleteId === athleteId
          ? { ...item, present: !item.present }
          : item,
      ),
    );
  };

  const handleNotesChange = (athleteId: string, notes: string) => {
    setAttendance(
      attendance.map((item) =>
        item.athleteId === athleteId ? { ...item, notes } : item,
      ),
    );
  };

  const handleMarkAllPresent = () => {
    setAttendance(attendance.map((item) => ({ ...item, present: true })));
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

          <div className="overflow-hidden rounded-md border">
            <div className="hidden grid-cols-12 gap-4 bg-muted p-3 text-sm font-medium text-muted-foreground sm:grid">
              <div className="col-span-5">Atleta</div>
              <div className="col-span-2 text-center">Presenza</div>
              <div className="col-span-5">Note</div>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {athleteRows.map((athlete, index) => {
                const attendanceRecord = attendance.find(
                  (a) => a.athleteId === athlete.id,
                );

                return (
                  <div
                    key={athlete.id}
                    className={`grid grid-cols-1 gap-3 p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 sm:grid-cols-12 sm:items-center sm:gap-4 ${index !== athleteRows.length - 1 ? "border-b" : ""}`}
                  >
                    <div className="sm:col-span-5">
                      <div className="flex items-center gap-2 font-medium">
                        <span>{athlete.name}</span>
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
                    </div>
                    <div className="sm:col-span-2">
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                        Presenza
                      </div>
                      <div className="flex justify-start sm:justify-center">
                      <div className="flex h-4 w-4 items-center justify-center rounded-sm border border-primary">
                        <Checkbox
                          id={`attendance-${athlete.id}`}
                          checked={attendanceRecord?.present || false}
                          onCheckedChange={() =>
                            handleTogglePresence(athlete.id)
                          }
                          className="h-4 w-4 rounded-sm border-none data-[state=checked]:bg-blue-600"
                        />
                      </div>
                    </div>
                    </div>
                    <div className="sm:col-span-5">
                      <div className="mb-1 pl-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                        Note
                      </div>
                      <Input
                        placeholder="Note (opzionale)"
                        value={attendanceRecord?.notes || ""}
                        onChange={(e) =>
                          handleNotesChange(athlete.id, e.target.value)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
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
