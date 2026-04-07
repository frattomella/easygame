"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  onSave: (data: {
    matchId: string;
    convocatedAthletes: string[];
  }) => void | Promise<void>;
  savedConvocations?: string[];
}

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
  onSave,
  savedConvocations = [],
}: MatchConvocationsProps) {
  const { showToast } = useToast();
  const [convocatedAthletes, setConvocatedAthletes] = useState<string[]>(
    savedConvocations.length > 0 ? savedConvocations : [],
  );
  const [isEditing, setIsEditing] = useState(savedConvocations.length === 0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setConvocatedAthletes(Array.isArray(savedConvocations) ? savedConvocations : []);
    setIsEditing(!(Array.isArray(savedConvocations) && savedConvocations.length > 0));
  }, [isOpen, matchId, savedConvocations]);

  const handleToggleAthlete = (athleteId: string) => {
    if (!isEditing) return;

    if (convocatedAthletes.includes(athleteId)) {
      setConvocatedAthletes(
        convocatedAthletes.filter((id) => id !== athleteId),
      );
    } else {
      setConvocatedAthletes([...convocatedAthletes, athleteId]);
    }
  };

  const handleSaveConvocations = async () => {
    await onSave({
      matchId,
      convocatedAthletes,
    });
    setIsEditing(false);
    showToast("success", "Convocazioni salvate con successo");

    const flaggedAthletes = athletes
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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

        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Atleti {categoryName} ({convocatedAthletes.length} convocati)
          </h3>
          <div className="flex gap-2">
            {!isEditing ? (
              <div className="flex gap-2">
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

        <div className="space-y-2">
          {athletes.map((athlete) => (
            <div
              key={athlete.id}
              className={`p-4 border rounded-lg flex items-center gap-4 cursor-pointer transition-colors ${convocatedAthletes.includes(athlete.id) ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" : "hover:bg-gray-50 dark:hover:bg-gray-800"} ${!isEditing ? "cursor-default" : ""}`}
              onClick={() => handleToggleAthlete(athlete.id)}
            >
              <Checkbox
                checked={convocatedAthletes.includes(athlete.id)}
                onCheckedChange={() => handleToggleAthlete(athlete.id)}
                disabled={!isEditing}
                className="h-5 w-5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-base">{athlete.name}</p>
                  {getMedicalCertificateAvailability(athlete.medicalCertExpiry) !==
                  "valid" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : null}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
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
              </div>
              <div>
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
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
