"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  matchNotes?: string;
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
      medicalCertificateAvailability?: string | null;
      medicalCertificateWarning?: string | null;
    }[];
  }) => void | Promise<void>;
  savedConvocations?: string[];
  savedConvocationEntries?: {
    athleteId: string;
    isExtraCategory?: boolean;
    isManualExtra?: boolean;
    categoryMembershipType?: string | null;
    medicalCertificateAvailability?: string | null;
    medicalCertificateWarning?: string | null;
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

const normalizeAthleteId = (value: unknown) => String(value || "").trim();

const toAthleteIdSet = (ids: string[] = []) =>
  new Set(ids.map(normalizeAthleteId).filter(Boolean));

const areStringSetsEqual = (left: Set<string>, right: Set<string>) => {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
};

const buildAthleteRowSignature = (athlete: Athlete) =>
  [
    normalizeAthleteId(athlete.id),
    athlete.name,
    athlete.medicalCertExpiry,
    athlete.participationContext,
    athlete.participationBadgeLabel,
    athlete.isExtraCategory ? "extra" : "",
    athlete.isManualExtra ? "manual" : "",
    athlete.primaryCategoryName,
  ]
    .map((value) => String(value || "").trim())
    .join("|");

const areAthleteRowsEqual = (left: Athlete[] = [], right: Athlete[] = []) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (athlete, index) =>
      buildAthleteRowSignature(athlete) === buildAthleteRowSignature(right[index]),
  );
};

const normalizeConvocationEntries = (
  entries: MatchConvocationsProps["savedConvocationEntries"] = [],
) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      athleteId: String(entry?.athleteId || "").trim(),
      isExtraCategory: Boolean(entry?.isExtraCategory),
      isManualExtra: Boolean(entry?.isManualExtra),
      categoryMembershipType: entry?.categoryMembershipType || null,
      medicalCertificateAvailability:
        entry?.medicalCertificateAvailability || null,
      medicalCertificateWarning: entry?.medicalCertificateWarning || null,
    }))
    .filter((entry) => entry.athleteId);

const areConvocationEntriesEqual = (
  left: MatchConvocationsProps["savedConvocationEntries"] = [],
  right: MatchConvocationsProps["savedConvocationEntries"] = [],
) => {
  const normalizedLeft = normalizeConvocationEntries(left);
  const normalizedRight = normalizeConvocationEntries(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((entry, index) => {
    const otherEntry = normalizedRight[index];
    return (
      entry.athleteId === otherEntry.athleteId &&
      entry.isExtraCategory === otherEntry.isExtraCategory &&
      entry.isManualExtra === otherEntry.isManualExtra &&
      entry.categoryMembershipType === otherEntry.categoryMembershipType &&
      entry.medicalCertificateAvailability ===
        otherEntry.medicalCertificateAvailability &&
      entry.medicalCertificateWarning === otherEntry.medicalCertificateWarning
    );
  });
};

const dedupeAthleteRows = (rows: Athlete[]) => {
  const seen = new Set<string>();
  const uniqueRows: Athlete[] = [];

  rows.forEach((athlete) => {
    const athleteId = normalizeAthleteId(athlete?.id);
    if (!athleteId || seen.has(athleteId)) {
      return;
    }

    seen.add(athleteId);
    uniqueRows.push(athlete);
  });

  return uniqueRows;
};

export function MatchConvocations({
  isOpen,
  onClose,
  matchId,
  matchTitle,
  matchDate,
  matchTime,
  matchNotes,
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
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Set<string>>(
    () =>
      toAthleteIdSet(
        resolveSelectedAthleteIds(savedConvocations, savedConvocationEntries),
      ),
  );
  const [convocationEntries, setConvocationEntries] = useState<
    {
      athleteId: string;
      isExtraCategory?: boolean;
      isManualExtra?: boolean;
      categoryMembershipType?: string | null;
      medicalCertificateAvailability?: string | null;
      medicalCertificateWarning?: string | null;
    }[]
  >(savedConvocationEntries);
  const [isEditing, setIsEditing] = useState(true);
  const initializedMatchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      initializedMatchKeyRef.current = null;
      return;
    }

    const initializationKey = normalizeAthleteId(matchId);
    if (initializedMatchKeyRef.current === initializationKey) {
      return;
    }
    initializedMatchKeyRef.current = initializationKey;

    const savedEntries = normalizeConvocationEntries(savedConvocationEntries);
    const savedIds = resolveSelectedAthleteIds(savedConvocations, savedEntries);
    const nextSelectedAthleteIds = toAthleteIdSet(savedIds);
    const savedIdSet = toAthleteIdSet(savedIds);
    const missingSavedAthletes = clubAthletes.filter((athlete) => {
      const athleteId = normalizeAthleteId(athlete?.id);
      return (
        savedIdSet.has(athleteId) &&
        !athletes.some(
          (currentAthlete) =>
            normalizeAthleteId(currentAthlete?.id) === athleteId,
        )
      );
    });

    const nextAthleteRows = dedupeAthleteRows([...athletes, ...missingSavedAthletes]);
    const nextConvocationEntries =
      savedEntries.length > 0
        ? savedEntries
        : savedIds.map((athleteId) => {
            const normalizedAthleteId = normalizeAthleteId(athleteId);
            const athlete = nextAthleteRows.find(
              (row) => normalizeAthleteId(row.id) === normalizedAthleteId,
            );
            const availability = getMedicalCertificateAvailability(
              athlete?.medicalCertExpiry,
            );
            return {
              athleteId: normalizedAthleteId,
              isExtraCategory:
                athlete?.participationContext === "extra" ||
                Boolean(athlete?.isExtraCategory),
              isManualExtra:
                athlete?.participationContext === "extra" ||
                Boolean(athlete?.isManualExtra),
              categoryMembershipType: athlete?.participationContext || "primary",
              medicalCertificateAvailability: availability,
              medicalCertificateWarning:
                availability !== "valid"
                  ? getMedicalCertificateAvailabilityLabel(availability)
                  : null,
            };
          });
    setAthleteRows((currentRows) =>
      areAthleteRowsEqual(currentRows, nextAthleteRows)
        ? currentRows
        : nextAthleteRows,
    );
    setSelectedAthleteIds((currentAthletes) =>
      areStringSetsEqual(currentAthletes, nextSelectedAthleteIds)
        ? currentAthletes
        : nextSelectedAthleteIds,
    );
    setConvocationEntries((currentEntries) =>
      areConvocationEntriesEqual(currentEntries, nextConvocationEntries)
        ? currentEntries
        : nextConvocationEntries,
    );
    setIsEditing((current) => (current ? current : true));
  }, [isOpen, matchId, savedConvocations, savedConvocationEntries, athletes, clubAthletes]);

  const syncConvocationEntry = (athleteId: string, selected: boolean) => {
    const normalizedAthleteId = normalizeAthleteId(athleteId);
    if (!normalizedAthleteId) {
      return;
    }

    setConvocationEntries((currentEntries) => {
      if (!selected) {
        return currentEntries.filter(
          (entry) => normalizeAthleteId(entry.athleteId) !== normalizedAthleteId,
        );
      }

      if (
        currentEntries.some(
          (entry) => normalizeAthleteId(entry.athleteId) === normalizedAthleteId,
        )
      ) {
        return currentEntries;
      }

      const athlete = athleteRows.find(
        (row) => normalizeAthleteId(row.id) === normalizedAthleteId,
      );
      const availability = getMedicalCertificateAvailability(
        athlete?.medicalCertExpiry,
      );
      return [
        ...currentEntries,
        {
          athleteId: normalizedAthleteId,
          isExtraCategory:
            athlete?.participationContext === "extra" ||
            Boolean(athlete?.isExtraCategory),
          isManualExtra:
            athlete?.participationContext === "extra" ||
            Boolean(athlete?.isManualExtra),
          categoryMembershipType: athlete?.participationContext || "primary",
          medicalCertificateAvailability: availability,
          medicalCertificateWarning:
            availability !== "valid"
              ? getMedicalCertificateAvailabilityLabel(availability)
              : null,
        },
      ];
    });
  };

  const handleSetAthleteSelected = (athleteId: string, selected: boolean) => {
    if (!isEditing) return;

    const normalizedAthleteId = normalizeAthleteId(athleteId);
    if (!normalizedAthleteId) {
      return;
    }

    setSelectedAthleteIds((currentAthletes) => {
      const nextAthletes = new Set(currentAthletes);
      if (selected) {
        nextAthletes.add(normalizedAthleteId);
      } else {
        nextAthletes.delete(normalizedAthleteId);
      }

      return nextAthletes;
    });
    syncConvocationEntry(normalizedAthleteId, selected);

    if (selected) {
      const athlete = athleteRows.find(
        (row) => normalizeAthleteId(row.id) === normalizedAthleteId,
      );
      const availability = getMedicalCertificateAvailability(
        athlete?.medicalCertExpiry,
      );

      if (availability !== "valid") {
        showToast(
          "info",
          `Attenzione: ${getMedicalCertificateAvailabilityLabel(availability).toLowerCase()}`,
        );
      }
    }
  };

  const handleToggleAthlete = (athleteId: string) => {
    const normalizedAthleteId = normalizeAthleteId(athleteId);
    handleSetAthleteSelected(
      normalizedAthleteId,
      !selectedAthleteIds.has(normalizedAthleteId),
    );
  };

  const handleAddExtraAthlete = (athlete: Athlete) => {
    const athleteId = normalizeAthleteId(athlete?.id);
    if (
      !athleteId ||
      athleteRows.some((row) => normalizeAthleteId(row.id) === athleteId)
    ) {
      return;
    }

    const availability = getMedicalCertificateAvailability(
      athlete.medicalCertExpiry,
    );
    setAthleteRows((currentRows) => [...currentRows, athlete]);
    setConvocationEntries((currentEntries) => [
      ...currentEntries,
      {
        athleteId,
        isExtraCategory:
          athlete.participationContext === "extra" || Boolean(athlete.isExtraCategory),
        isManualExtra:
          athlete.participationContext === "extra" || Boolean(athlete.isManualExtra),
        categoryMembershipType: athlete.participationContext || "primary",
        medicalCertificateAvailability: availability,
        medicalCertificateWarning:
          availability !== "valid"
            ? getMedicalCertificateAvailabilityLabel(availability)
            : null,
      },
    ]);
    setSelectedAthleteIds((currentAthletes) => {
      const nextAthletes = new Set(currentAthletes);
      nextAthletes.add(athleteId);
      return nextAthletes;
    });
    if (availability !== "valid") {
      showToast(
        "info",
        `Attenzione: ${getMedicalCertificateAvailabilityLabel(availability).toLowerCase()}`,
      );
    }
    setSearchQuery("");
  };

  const handleSaveConvocations = async () => {
    const convocatedAthletes = Array.from(selectedAthleteIds);
    const normalizedConvocationEntries = convocatedAthletes.map((athleteId) => {
      const normalizedAthleteId = normalizeAthleteId(athleteId);
      const existingEntry = convocationEntries.find(
        (entry) => normalizeAthleteId(entry.athleteId) === normalizedAthleteId,
      );

      const athlete = athleteRows.find(
        (row) => normalizeAthleteId(row.id) === normalizedAthleteId,
      );
      const availability = getMedicalCertificateAvailability(
        athlete?.medicalCertExpiry,
      );
      return {
        ...(existingEntry || {}),
        athleteId: normalizedAthleteId,
        isExtraCategory:
          existingEntry?.isExtraCategory ??
          (athlete?.participationContext === "extra" ||
            Boolean(athlete?.isExtraCategory)),
        isManualExtra:
          existingEntry?.isManualExtra ??
          (athlete?.participationContext === "extra" ||
            Boolean(athlete?.isManualExtra)),
        categoryMembershipType:
          existingEntry?.categoryMembershipType ||
          athlete?.participationContext ||
          "primary",
        medicalCertificateAvailability: availability,
        medicalCertificateWarning:
          availability !== "valid"
            ? getMedicalCertificateAvailabilityLabel(availability)
            : null,
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
      .filter((athlete) =>
        convocatedAthletes.includes(normalizeAthleteId(athlete.id)),
      )
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
        !athleteRows.some(
          (row) => normalizeAthleteId(row.id) === normalizeAthleteId(athlete.id),
        ) &&
        athlete.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
    )
    .slice(0, 6);

  const getParticipationBadgeClassName = (
    context?: "primary" | "secondary" | "extra",
  ) => {
    if (context === "extra") {
      return "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink";
    }

    if (context === "secondary") {
      return "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800";
    }

    return "border-egw-tint-green-bd bg-egw-tint-green text-egw-green";
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Convocazioni</DialogTitle>
          <DialogDescription>
            Seleziona gli atleti convocati per la gara e salva le modifiche.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-6 p-4 bg-egw-page-100 dark:bg-gray-800 rounded-egw-control">
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
          {matchNotes ? (
            <div className="mt-4 rounded-egw-control border border-egw-tint-blue-bd bg-white px-3 py-2 text-sm text-egw-ink-72">
              <span className="font-medium">Note gara:</span> {matchNotes}
            </div>
          ) : null}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold">
            Atleti convocati ({selectedAthleteIds.size} convocati)
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
                {selectedAthleteIds.size > 0 && (
                  <Button
                    className="bg-egw-green hover:bg-green-700 flex items-center gap-1"
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
                className="bg-egw-blue hover:bg-egw-blue-700 flex items-center gap-1"
                onClick={handleSaveConvocations}
              >
                <Save className="h-4 w-4" />
                Salva
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4 space-y-3 rounded-egw-control border border-dashed border-egw-hairline bg-egw-page-100 p-3">
          <div>
            <p className="text-sm font-medium text-egw-ink">
              Aggiungi atleta extra
            </p>
            <p className="text-xs text-egw-ink-62">
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
                {suggestedAthletes.map((athlete) => {
                  const athleteId = normalizeAthleteId(athlete.id);
                  return (
                  <button
                    key={`convocation-extra-${athleteId}`}
                    type="button"
                    onClick={() => handleAddExtraAthlete(athlete)}
                    className="flex w-full items-center justify-between rounded-egw-control border bg-white px-3 py-2 text-left hover:border-egw-tint-blue-bd hover:bg-egw-tint-blue"
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
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nessun atleta disponibile con questo filtro.
              </p>
            )
          ) : null}
        </div>

        <div className="space-y-2">
          {athleteRows.map((athlete) => {
            const athleteId = normalizeAthleteId(athlete.id);
            if (!athleteId) {
              return null;
            }

            const isSelected = selectedAthleteIds.has(athleteId);

            return (
            <div
              key={athleteId}
              className={`rounded-egw-control border p-4 transition-colors ${isSelected ? "border-egw-tint-blue-bd bg-egw-tint-blue dark:border-egw-navy-800 dark:bg-egw-navy-900/20" : "hover:bg-egw-page-050 dark:hover:bg-egw-navy-800"} ${!isEditing ? "cursor-default" : "cursor-pointer"}`}
              onClick={() => handleToggleAthlete(athleteId)}
              role={isEditing ? "button" : undefined}
              aria-pressed={isEditing ? isSelected : undefined}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Checkbox
                  /*
                    **Una casella senza nome non e usabile** (P0-6). Il nome
                    dell'atleta e accanto, non dentro: chi legge con lo schermo
                    sentiva sedici volte «casella di controllo» e nessun nome,
                    su una schermata che decide chi va in campo.
                  */
                  aria-label={`Convoca: ${athlete.name}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    handleSetAthleteSelected(athleteId, checked === true)
                  }
                  onClick={(event) => event.stopPropagation()}
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
                    <Badge className="border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink hover:bg-egw-tint-amber">
                      <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                      Attenzione
                    </Badge>
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
                  <p className="mt-1 text-xs font-medium text-egw-amber-ink">
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
                {isSelected ? (
                  <Badge className="bg-egw-blue text-white">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Convocato
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-egw-ink-62 border-egw-hairline"
                  >
                    Non convocato
                  </Badge>
                )}
              </div>
              </div>
            </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
