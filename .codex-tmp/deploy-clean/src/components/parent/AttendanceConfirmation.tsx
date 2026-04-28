"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { CheckCircle } from "lucide-react";

interface AttendanceConfirmationProps {
  trainingId: string;
  trainingTitle: string;
  trainingDate: string;
  trainingTime: string;
  onConfirm: (data: {
    trainingId: string;
    willAttend: boolean;
    notes: string;
  }) => void;
}

export function AttendanceConfirmation({
  trainingId,
  trainingTitle,
  trainingDate,
  trainingTime,
  onConfirm,
}: AttendanceConfirmationProps) {
  const [willAttend, setWillAttend] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { showToast } = useToast();

  // Controlla se questo allenamento è già stato confermato
  useEffect(() => {
    const confirmedTrainings = localStorage.getItem("confirmedTrainings");
    if (confirmedTrainings) {
      const trainings = JSON.parse(confirmedTrainings);
      if (trainings.includes(trainingId)) {
        setIsSubmitted(true);
      }
    }
  }, [trainingId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (willAttend === null) {
      showToast("error", "Seleziona se l'atleta parteciperà all'allenamento");
      return;
    }

    onConfirm({
      trainingId,
      willAttend,
      notes,
    });

    // Salva l'ID dell'allenamento come confermato
    const confirmedTrainings = localStorage.getItem("confirmedTrainings");
    let trainings = [];
    if (confirmedTrainings) {
      trainings = JSON.parse(confirmedTrainings);
    }
    trainings.push(trainingId);
    localStorage.setItem("confirmedTrainings", JSON.stringify(trainings));

    setIsSubmitted(true);
    showToast("success", "Conferma di partecipazione inviata con successo");
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

  if (isSubmitted) {
    return (
      <Card className="w-full bg-gray-50 dark:bg-gray-800">
        <CardContent className="p-6 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-green-100 p-3 mb-4">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="font-medium text-lg mb-2">
            Partecipazione Confermata
          </h3>
          <p className="text-sm text-muted-foreground">
            Hai già confermato la tua partecipazione per questo allenamento.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Conferma Partecipazione</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">{trainingTitle}</h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(trainingDate)} • {trainingTime}
              </p>
            </div>

            <div className="space-y-2">
              <Label>L'atleta parteciperà all'allenamento?</Label>
              <RadioGroup
                value={
                  willAttend === null ? undefined : willAttend ? "yes" : "no"
                }
                onValueChange={(value) => setWillAttend(value === "yes")}
                className="flex flex-col space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="attendance-yes" />
                  <Label htmlFor="attendance-yes" className="font-normal">
                    Sì, parteciperà
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="attendance-no" />
                  <Label htmlFor="attendance-no" className="font-normal">
                    No, non parteciperà
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Note (opzionale)</Label>
              <Textarea
                id="notes"
                placeholder="Aggiungi eventuali note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-20"
              />
            </div>
          </div>

          <CardFooter className="px-0 pt-4">
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Conferma
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
