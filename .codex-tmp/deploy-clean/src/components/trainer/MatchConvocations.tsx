"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-notification";
import { CheckCircle, X, Save, Edit, Mail, AlertTriangle } from "lucide-react";
import {
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";

interface Athlete {
  id: string;
  name: string;
  avatar: string;
  matchesPlayed?: number;
  matchesAbsent?: number;
  isConvocated?: boolean;
  medicalCertExpiry?: string;
  participationContext?: "primary" | "secondary" | "extra";
  participationBadgeLabel?: string | null;
  isExtraCategory?: boolean;
  isManualExtra?: boolean;
  primaryCategoryName?: string | null;
}

interface MatchConvocationsProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  matchTitle: string;
  matchDate: string;
  matchTime: string;
  categoryName: string;
  opponent: string;
  location: string;
  athletes: Athlete[];
  clubAthletes?: Athlete[];
  onSave: (data: {
    matchId: string;
    convocatedAthletes: string[];
    convocationEntries: {
      athleteId: string;
      isExtraCategory?: boolean;
      isManualExtra?: boolean;
      categoryMembershipType?: string | null;
    }[];
  }) => void | Promise<void>;
  savedConvocations?: string[];
  savedConvocationEntries?: {
    athleteId: string;
    isExtraCategory?: boolean;
    isManualExtra?: boolean;
    categoryMembershipType?: string | null;
  }[];
}

const resolveSelectedAthleteIds = (
  savedConvocations: string[] = [],
  savedConvocationEntries: MatchConvocationsProps["savedConvocationEntries"] = [],
) => {
  const explicitIds = Array.isArray(savedConvocations)
    ? savedConvocations.filter(Boolean)
    : [];

  if (explicitIds.length > 0) {
    return [...new Set(explicitIds)];
  }

  const derivedIds = Array.isArray(savedConvocationEntries)
    ? savedConvocationEntries
        .map((entry) => String(entry?.athleteId || "").trim())
        .filter(Boolean)
    : [];

  return [...new Set(derivedIds)];
};

export function MatchConvocations({
  isOpen,
  onClose,
  matchId,
  matchTitle,
  matchDate,
  matchTime,
  categoryName,
  opponent,
  location,
  athletes,
  clubAthletes = [],
  onSave,
  savedConvocations = [],
  savedConvocationEntries = [],
}: MatchConvocationsProps) {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [athleteRows, setAthleteRows] = useState<Athlete[]>(athletes);
  const [convocatedAthletes, setConvocatedAthletes] = useState<string[]>(
    resolveSelectedAthleteIds(savedConvocations, savedConvocationEntries),
  );
  const [convocationEntries, setConvocationEntries] = useState<
    {
      athleteId: string;
      isExtraCategory?: boolean;
      isManualExtra?: boolean;
      categoryMembershipType?: string | null;
    }[]
  >(savedConvocationEntries);
  const [isEditing, setIsEditing] = useState(savedConvocations.length === 0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const savedEntries = Array.isArray(savedConvocationEntries)
      ? savedConvocationEntries
      : [];
    const savedIds = resolveSelectedAthleteIds(savedConvocations, savedEntries);
    const missingSavedAthletes = clubAthletes.filter(
      (athlete) =>
        savedIds.includes(athlete.id) &&
        !athletes.some((currentAthlete) => currentAthlete.id === athlete.id),
    );

    const nextAthleteRows = [...athletes, ...missingSavedAthletes];
    setAthleteRows(nextAthleteRows);
    setConvocatedAthletes(savedIds);
    setConvocationEntries(
      savedEntries.length > 0
        ? savedEntries
        : savedIds.map((athleteId) => {
            const athlete = nextAthleteRows.find((row) => row.id === athleteId);
            return {
              athleteId,
              isExtraCategory:
                athlete?.participationContext === "extra" ||
                Boolean(athlete?.isExtraCategory),
              isManualExtra:
                athlete?.participationContext === "extra" ||
                Boolean(athlete?.isManualExtra),
              categoryMembershipType: athlete?.participationContext || "primary",
            };
          }),
    );
    setIsEditing(!(Array.isArray(savedConvocations) && savedConvocations.length > 0));
  }, [isOpen, matchId, savedConvocations, savedConvocationEntries, athletes, clubAthletes]);

  const handleToggleAthlete = (athleteId: string) => {
    if (!isEditing) return;

    if (convocatedAthletes.includes(athleteId)) {
      setConvocatedAthletes(
        convocatedAthletes.filter((id) => id !== athleteId),
      );
    } else {
      setConvocatedAthletes([...convocatedAthletes, athleteId]);
    }

    const athlete = athleteRows.find((row) => row.id === athleteId);
    if (!athlete) {
      return;
    }

    setConvocationEntries((currentEntries) => {
      if (currentEntries.some((entry) => entry.athleteId === athleteId)) {
        return currentEntries;
      }

      return [
        ...currentEntries,
        {
          athleteId,
          isExtraCategory:
            athlete.participationContext === "extra" || Boolean(athlete.isExtraCategory),
          isManualExtra:
            athlete.participationContext === "extra" || Boolean(athlete.isManualExtra),
          categoryMembershipType: athlete.participationContext || "primary",
        },
      ];
    });
  };

  const handleAddExtraAthlete = (athlete: Athlete) => {
    if (!athlete || athleteRows.some((row) => row.id === athlete.id)) {
      return;
    }

    setAthleteRows((currentRows) => [...currentRows, athlete]);
    setConvocationEntries((currentEntries) => [
      ...currentEntries,
      {
        athleteId: athlete.id,
        isExtraCategory:
          athlete.participationContext === "extra" || Boolean(athlete.isExtraCategory),
        isManualExtra:
          athlete.participationContext === "extra" || Boolean(athlete.isManualExtra),
        categoryMembershipType: athlete.participationContext || "primary",
      },
    ]);
    setConvocatedAthletes((currentAthletes) =>
      currentAthletes.includes(athlete.id)
        ? currentAthletes
        : [...currentAthletes, athlete.id],
    );
    setSearchQuery("");
  };

  const handleSaveConvocations = async () => {
    const normalizedConvocationEntries = convocatedAthletes.map((athleteId) => {
      const existingEntry = convocationEntries.find(
        (entry) => entry.athleteId === athleteId,
      );

      if (existingEntry) {
        return existingEntry;
      }

      const athlete = athleteRows.find((row) => row.id === athleteId);
      return {
        athleteId,
        isExtraCategory:
          athlete?.participationContext === "extra" ||
          Boolean(athlete?.isExtraCategory),
        isManualExtra:
          athlete?.participationContext === "extra" ||
          Boolean(athlete?.isManualExtra),
        categoryMembershipType: athlete?.participationContext || "primary",
      };
    });

    await onSave({
      matchId,
      convocatedAthletes,
      convocationEntries: normalizedConvocationEntries,
    });
    setIsEditing(false);
    showToast("success", "Convocazioni salvate con successo");

    const flaggedAthletes = athleteRows
      .filter((athlete) => convocatedAthletes.includes(athlete.id))
      .map((athlete) => ({
        name: athlete.name,
        availability: getMedicalCertificateAvailability(
          athlete.medicalCertExpiry,
        ),
      }))
      .filter(
        (athlete) =>
          athlete.availability === "missing" ||
          athlete.availability === "expired",
      );

    if (flaggedAthletes.length > 0) {
      showToast(
        "info",
        flaggedAthletes
          .map(
            (athlete) =>
              `${athlete.name}: ${getMedicalCertificateAvailabilityLabel(athlete.availability)}`,
          )
          .join(" • "),
      );
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Convocazioni</DialogTitle>
        </DialogHeader>

        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">{matchTitle}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p>
                <span className="font-medium">Data:</span>{" "}
                {formatDate(matchDate)}
              </p>
              <p>
                <span className="font-medium">Orario:</span> {matchTime}
              </p>
              <p>
                <span className="font-medium">Categoria:</span> {categoryName}
              </p>
            </div>
            <div>
              <p>
                <span className="font-medium">Avversario:</span> {opponent}
              </p>
              <p>
                <span className="font-medium">Luogo:</span> {location}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold">
            Atleti convocati ({convocatedAthletes.length} convocati)
          </h3>
          <div className="flex flex-wrap gap-2">
            {!isEditing ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1"
                >
                  <Edit className="h-4 w-4" />
                  Modifica
                </Button>
                {convocatedAthletes.length > 0 && (
                  <Button
                    className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
                    onClick={() => {
                      showToast(
                        "success",
                        "Promemoria inviato agli atleti convocati",
                      );
                    }}
                  >
                    <Mail className="h-4 w-4" />
                    Invia Promemoria
                  </Button>
                )}
              </div>
            ) : (
              <Button
                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
                onClick={handleSaveConvocations}
              >
                <Save className="h-4 w-4" />
                Salva
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4 space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-3">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Aggiungi atleta extra
            </p>
            <p className="text-xs text-slate-500">
              Cerca tra tutti gli atleti del club e aggiungi solo chi non è già in lista.
            </p>
          </div>
          <Input
            placeholder="Cerca atleta del club..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            disabled={!isEditing}
          />
          {isEditing && searchQuery.trim() ? (
            suggestedAthletes.length > 0 ? (
              <div className="space-y-2">
                {suggestedAthletes.map((athlete) => (
                  <button
                    key={`convocation-extra-${athlete.id}`}
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

        <div className="space-y-2">
          {athleteRows.map((athlete) => (
            <div
              key={athlete.id}
              className={`rounded-lg border p-4 transition-colors ${convocatedAthletes.includes(athlete.id) ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800"} ${!isEditing ? "cursor-default" : "cursor-pointer"}`}
              onClick={() => handleToggleAthlete(athlete.id)}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Checkbox
                  checked={convocatedAthletes.includes(athlete.id)}
                  onCheckedChange={() => handleToggleAthlete(athlete.id)}
                  disabled={!isEditing}
                  className="h-5 w-5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-base">{athlete.name}</p>
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
                  {getMedicalCertificateAvailability(athlete.medicalCertExpiry) !==
                  "valid" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {athlete.matchesPlayed !== undefined && (
                    <span>Gare giocate: {athlete.matchesPlayed}</span>
                  )}
                  {athlete.matchesAbsent !== undefined && (
                    <span>Assenze: {athlete.matchesAbsent}</span>
                  )}
                </div>
                {getMedicalCertificateAvailability(athlete.medicalCertExpiry) !==
                "valid" ? (
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
              <div className="sm:self-center">
                {convocatedAthletes.includes(athlete.id) ? (
                  <Badge className="bg-blue-500 text-white">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Convocato
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-gray-500 border-gray-300"
                  >
                    Non convocato
                  </Badge>
                )}
              </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
