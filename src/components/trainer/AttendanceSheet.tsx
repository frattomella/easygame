"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  }[];
  onSave: (attendanceData: {
    trainingId: string;
    attendance: {
      athleteId: string;
      present: boolean;
      notes: string;
    }[];
  }) => void;
  onClose: () => void;
}

export function AttendanceSheet({
  trainingId,
  trainingTitle,
  trainingDate,
  trainingTime,
  categoryName,
  location,
  athletes = [],
  onSave,
  onClose,
}: AttendanceSheetProps) {
  const { showToast } = useToast();
  const [attendance, setAttendance] = useState(
    athletes.map((athlete) => ({
      athleteId: athlete.id,
      present: athlete.present || false,
      notes: athlete.notes || "",
    })),
  );

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

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>{trainingTitle}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDate(trainingDate)} • {trainingTime} • {categoryName} •{" "}
            {location}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm">
              Presenti: <strong>{getPresentCount()}</strong> / {athletes.length}
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

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 p-2 font-medium bg-muted text-muted-foreground text-sm">
              <div className="col-span-5">Atleta</div>
              <div className="col-span-2 text-center">Presenza</div>
              <div className="col-span-5">Note</div>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {athletes.map((athlete, index) => {
                const attendanceRecord = attendance.find(
                  (a) => a.athleteId === athlete.id,
                );

                return (
                  <div
                    key={athlete.id}
                    className={`grid grid-cols-12 gap-2 p-2 items-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${index !== athletes.length - 1 ? "border-b" : ""}`}
                  >
                    <div className="col-span-5">
                      <div className="flex items-center gap-2 font-medium">
                        <span>{athlete.name}</span>
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
                    </div>
                    <div className="col-span-2 flex justify-center">
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
                    <div className="col-span-5">
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

          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={onClose} className="mr-2">
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
