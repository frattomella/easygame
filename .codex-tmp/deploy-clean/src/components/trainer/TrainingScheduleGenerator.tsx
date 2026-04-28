"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { Calendar, Clock, MapPin, Users } from "lucide-react";

interface WeeklyTrainingItem {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  categoryId: string;
  trainerIds: string[];
  locationId: string;
}

interface TrainingSession {
  id: string;
  title: string;
  date: Date;
  time: string;
  category: string;
  trainer: string;
  location: string;
  attendees: number;
  categoryColor: string;
  status: "upcoming" | "completed" | "cancelled" | "annullato" | "concluded";
  expectedAttendees?: number;
}

interface TrainingScheduleGeneratorProps {
  weeklySchedule: WeeklyTrainingItem[];
  categories: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  onGenerateTrainings: (trainings: TrainingSession[]) => void;
}

export function TrainingScheduleGenerator({
  weeklySchedule,
  categories,
  trainers,
  locations,
  onGenerateTrainings,
}: TrainingScheduleGeneratorProps) {
  const { showToast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  // Funzione per generare automaticamente gli allenamenti in base al programma settimanale
  const generateTrainings = () => {
    setIsGenerating(true);

    // Ottieni la data corrente
    const today = new Date();
    const generatedTrainings: TrainingSession[] = [];

    // Genera allenamenti per le prossime 2 settimane
    for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
      weeklySchedule.forEach((scheduleItem) => {
        // Converti il giorno della settimana in numero (0 = domenica, 1 = lunedì, ecc.)
        const dayMap: { [key: string]: number } = {
          Lunedì: 1,
          Martedì: 2,
          Mercoledì: 3,
          Giovedì: 4,
          Venerdì: 5,
          Sabato: 6,
          Domenica: 0,
        };

        const dayNumber = dayMap[scheduleItem.day];
        if (dayNumber === undefined) return;

        // Calcola la data dell'allenamento
        const currentDate = new Date(today);
        const currentDay = currentDate.getDay();
        let daysToAdd = dayNumber - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7; // Se il giorno è già passato questa settimana, vai alla prossima
        daysToAdd += weekOffset * 7; // Aggiungi settimane

        currentDate.setDate(currentDate.getDate() + daysToAdd);

        // Trova i dettagli della categoria, allenatore e luogo
        const category = categories.find(
          (c) => c.id === scheduleItem.categoryId,
        );
        const trainerNames = scheduleItem.trainerIds
          .map((id) => trainers.find((t) => t.id === id)?.name || "")
          .filter(Boolean);
        const location = locations.find(
          (l) => l.id === scheduleItem.locationId,
        );

        if (!category || trainerNames.length === 0 || !location) return;

        // Crea l'allenamento
        const training: TrainingSession = {
          id: `training-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: `Allenamento ${category.name}`,
          date: new Date(currentDate),
          time: `${scheduleItem.startTime} - ${scheduleItem.endTime}`,
          category: category.name,
          trainer: trainerNames.join(", "),
          location: location.name,
          attendees: 0,
          expectedAttendees: Math.floor(Math.random() * 10) + 10, // Numero casuale tra 10 e 20
          categoryColor: getCategoryColor(category.name),
          status: "upcoming",
        };

        generatedTrainings.push(training);
      });
    }

    // Ordina gli allenamenti per data
    generatedTrainings.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Passa gli allenamenti generati al componente padre
    onGenerateTrainings(generatedTrainings);

    setIsGenerating(false);
    showToast(
      "success",
      "Allenamenti generati con successo dal programma settimanale",
    );
  };

  // Funzione per ottenere un colore per la categoria
  const getCategoryColor = (categoryName: string): string => {
    const colorMap: { [key: string]: string } = {
      "Under 10": "bg-purple-100 text-purple-800",
      "Under 12": "bg-green-100 text-green-800",
      "Under 14": "bg-blue-100 text-blue-800",
      "Under 16": "bg-orange-100 text-orange-800",
      "Under 18": "bg-red-100 text-red-800",
    };

    return colorMap[categoryName] || "bg-gray-100 text-gray-800";
  };

  // Genera automaticamente gli allenamenti quando il componente viene montato
  useEffect(() => {
    if (weeklySchedule.length > 0) {
      generateTrainings();
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generatore Allenamenti</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Genera automaticamente gli allenamenti in base al programma
            settimanale.
          </p>

          <Button
            onClick={generateTrainings}
            disabled={isGenerating || weeklySchedule.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isGenerating ? "Generazione in corso..." : "Genera Allenamenti"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
