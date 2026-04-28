"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  AlertTriangle,
  Bell,
} from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { isValidTimeRange } from "@/lib/training-utils";

interface Trainer {
  id: string;
  name: string;
}

interface Training {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime?: string;
  location: string;
  trainerId: string;
  category: string;
}

interface EditTrainingFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (trainingData: Training, originalTraining: Training) => void;
  training: Training | null;
  trainers: Trainer[];
  locations: string[];
}

export function EditTrainingForm({
  isOpen,
  onClose,
  onSubmit,
  training,
  trainers,
  locations = ["Campo Principale", "Campo Secondario", "Palestra"],
}: EditTrainingFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Training>({
    id: "",
    title: "",
    date: "",
    time: "",
    endTime: "19:30",
    location: "",
    trainerId: "",
    category: "",
  });

  const [originalTraining, setOriginalTraining] = useState<Training | null>(
    null,
  );
  const [changes, setChanges] = useState<string[]>([]);
  const [sendNotifications, setSendNotifications] = useState(true);

  useEffect(() => {
    if (training) {
      setFormData({
        ...training,
      });
      setOriginalTraining({
        ...training,
      });
    }
  }, [training]);

  // Track changes between original and current form data
  useEffect(() => {
    if (!originalTraining) return;

    const newChanges: string[] = [];

    if (formData.date !== originalTraining.date) {
      newChanges.push("data");
    }

    if (formData.time !== originalTraining.time) {
      newChanges.push("orario");
    }

    if ((formData.endTime || "") !== (originalTraining.endTime || "")) {
      newChanges.push("fine");
    }

    if (formData.location !== originalTraining.location) {
      newChanges.push("campo");
    }

    if (formData.trainerId !== originalTraining.trainerId) {
      newChanges.push("allenatore");
    }

    setChanges(newChanges);
  }, [formData, originalTraining]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidTimeRange(formData.time, formData.endTime || "")) {
      showToast(
        "error",
        "L'orario di fine deve essere successivo all'orario di inizio",
      );
      return;
    }

    if (originalTraining) {
      onSubmit(formData, originalTraining);

      // Send notifications if there are changes and notifications are enabled
      if (changes.length > 0 && sendNotifications) {
        // In a real app, this would send actual notifications
        // For now, we'll just show a toast
        const changesText = changes.join(", ");
        const notificationMessage = `Allenamento modificato: ${changesText} per l'allenamento "${formData.title}" del ${formatDate(formData.date)} alle ${formData.time}`;

        showToast(
          "success",
          `Notifiche inviate agli atleti, genitori e allenatori riguardo le modifiche: ${changesText}`,
        );

        // Here you would trigger actual notifications to athletes, parents and trainers
        console.log("Notification sent:", notificationMessage);
      }
    }
    onClose();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getTrainerName = (trainerId: string) => {
    const trainer = trainers.find((t) => t.id === trainerId);
    return trainer ? trainer.name : "Sconosciuto";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica Allenamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="date"
                  name="date"
                  type="date"
                  className="pl-8"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="time">Orario inizio</Label>
                <div className="relative">
                  <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="time"
                    name="time"
                    type="time"
                    className="pl-8"
                    value={formData.time}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">Orario fine</Label>
                <div className="relative">
                  <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="endTime"
                    name="endTime"
                    type="time"
                    className="pl-8"
                    value={formData.endTime || ""}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Campo</Label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <select
                  id="location"
                  name="location"
                  className="w-full h-10 rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm ring-offset-background"
                  value={formData.location}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleziona un campo</option>
                  {locations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainerId">Allenatore</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <select
                  id="trainerId"
                  name="trainerId"
                  className="w-full h-10 rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm ring-offset-background"
                  value={formData.trainerId}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleziona un allenatore</option>
                  {trainers.map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {changes.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Modifiche rilevate
                  </p>
                  <p className="text-sm text-amber-700">
                    Stai modificando: {changes.join(", ")}.
                    <br />
                    Verrà inviata una notifica agli atleti, genitori e
                    allenatori coinvolti.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="sendNotifications"
                checked={sendNotifications}
                onChange={(e) => setSendNotifications(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label
                htmlFor="sendNotifications"
                className="flex items-center gap-1 text-sm font-normal"
              >
                <Bell className="h-4 w-4 text-blue-500" />
                Invia notifiche delle modifiche ad atleti, genitori e allenatori
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Salva Modifiche
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
