"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  getClubData,
  addClubData,
  deleteClubDataItem,
  getClubStaff,
  updateClubDataArray,
  getClubAthletes,
  getClubTrainers,
} from "@/lib/simplified-db";
import {
  getReminderTargetSummary,
  type ReminderTargetType,
} from "@/lib/reminder-targeting";
import {
  Clock,
  CalendarDays,
  FileText,
  Plus,
  Trash2,
  Edit,
  Check,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const parseTimeRange = (timeRange?: string) => {
  const [start = "", end = ""] = String(timeRange || "")
    .trim()
    .split("-", 2);

  return {
    start,
    end,
  };
};

const buildTimeRange = (start?: string, end?: string) => {
  if (!start && !end) {
    return "";
  }

  return `${start || ""}-${end || ""}`;
};

const buildAppointmentSlots = (timeRange: string) => {
  const match = String(timeRange || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);

  if (!match) {
    return [];
  }

  const [, startHour, startMin, endHour, endMin] = match;
  const startTime = parseInt(startHour, 10) * 60 + parseInt(startMin, 10);
  const endTime = parseInt(endHour, 10) * 60 + parseInt(endMin, 10);
  const slots: string[] = [];

  for (let time = startTime; time < endTime; time += 30) {
    const hours = Math.floor(time / 60);
    const minutes = time % 60;
    slots.push(
      `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
    );
  }

  return slots;
};

type ReminderTargetOption = {
  id: string;
  label: string;
};

export default function SecretariatPage() {
  const { showToast } = useToast();
  const { user, activeClub } = useAuth();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(
    undefined,
  );

  // Initialize dates on client side to avoid hydration mismatch
  useEffect(() => {
    if (!date) setDate(new Date());
    if (!appointmentDate) setAppointmentDate(new Date());
  }, []);
  const [appointments, setAppointments] = useState<
    Array<{
      id: string;
      title: string;
      date: Date;
      time: string;
      description: string;
      person?: string;
      athlete?: string;
    }>
  >([]);
  const [notes, setNotes] = useState<
    Array<{
      id: string;
      content: string;
      date: Date;
      expiryDate?: Date;
      notificationEnabled?: boolean;
      isAllDay?: boolean;
      notificationTime?: string;
      targetType?: ReminderTargetType;
      targetId?: string;
      targetLabel?: string;
    }>
  >([]);
  const [openingHours, setOpeningHours] = useState({
    monday: {
      morning: "",
      afternoon: "",
      morningStaff: "",
      afternoonStaff: "",
    },
    tuesday: {
      morning: "",
      afternoon: "",
      morningStaff: "",
      afternoonStaff: "",
    },
    wednesday: {
      morning: "",
      afternoon: "",
      morningStaff: "",
      afternoonStaff: "",
    },
    thursday: {
      morning: "",
      afternoon: "",
      morningStaff: "",
      afternoonStaff: "",
    },
    friday: {
      morning: "",
      afternoon: "",
      morningStaff: "",
      afternoonStaff: "",
    },
    saturday: {
      morning: "",
      afternoon: "",
      morningStaff: "",
      afternoonStaff: "",
    },
    sunday: {
      morning: "",
      afternoon: "",
      morningStaff: "",
      afternoonStaff: "",
    },
  });
  const [staffMembers, setStaffMembers] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [trainerOptions, setTrainerOptions] = useState<ReminderTargetOption[]>(
    [],
  );
  const [memberOptions, setMemberOptions] = useState<ReminderTargetOption[]>(
    [],
  );
  const [athleteOptions, setAthleteOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [personOptions, setPersonOptions] = useState<
    Array<{ id: string; label: string; athleteLabel?: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      if (!activeClub?.id) {
        console.log("[SecretariatPage] No active club available:", activeClub);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log(
          "[SecretariatPage] Starting data load for club:",
          activeClub.id,
        );

        // Load all secretariat data
        console.log("[SecretariatPage] Starting parallel data loading...");
        const [
          appointmentsData,
          notesData,
          openingHoursData,
          staffData,
          athletesData,
          trainersData,
          membersData,
        ] = await Promise.all([
          getClubData(activeClub.id, "appointments"),
          getClubData(activeClub.id, "secretariat_notes"),
          getClubData(activeClub.id, "opening_hours"),
          getClubStaff(activeClub.id),
          getClubAthletes(activeClub.id),
          getClubTrainers(activeClub.id),
          getClubData(activeClub.id, "members"),
        ]);

        console.log(
          "[SecretariatPage] Loaded appointments data:",
          appointmentsData,
        );
        console.log("[SecretariatPage] Loaded notes data:", notesData);
        console.log(
          "[SecretariatPage] Loaded opening hours data:",
          openingHoursData,
        );
        console.log("[SecretariatPage] Loaded staff data:", staffData);
        console.log("[SecretariatPage] Loaded athletes data:", athletesData);
        console.log("[SecretariatPage] Loaded trainers data:", trainersData);
        console.log(
          "[SecretariatPage] Staff data type:",
          typeof staffData,
          "Is array:",
          Array.isArray(staffData),
          "Length:",
          Array.isArray(staffData) ? staffData.length : "N/A",
        );

        // Convert date strings back to Date objects for appointments
        const processedAppointments = (appointmentsData || []).map((app) => ({
          ...app,
          date: new Date(app.date),
        }));

        // Convert date strings back to Date objects for notes
        const processedNotes = (notesData || []).map((note) => ({
          ...note,
          date: new Date(note.date),
          expiryDate: note.expiryDate ? new Date(note.expiryDate) : undefined,
          notificationEnabled: note.notificationEnabled || false,
          isAllDay: note.isAllDay !== false,
          notificationTime: note.notificationTime || "",
          targetType: (note.targetType || note.target_type || "club_dashboard") as ReminderTargetType,
          targetId: String(
            note.targetId ||
              note.target_id ||
              note.trainerId ||
              note.staffMemberId ||
              note.memberId ||
              "",
          ).trim(),
          targetLabel: String(
            note.targetLabel ||
              note.target_label ||
              note.trainerName ||
              note.staffMemberName ||
              note.memberName ||
              "",
          ).trim(),
        }));

        setAppointments(processedAppointments);
        setNotes(processedNotes);

        // Process staff data to ensure it has the right format
        const processedStaff = Array.isArray(staffData)
          ? staffData.map((staff: any) => {
              const processedStaffMember = {
                id: staff.id || `staff-${Date.now()}-${Math.random()}`,
                name: staff.name || "Nome non disponibile",
              };
              console.log(
                "[SecretariatPage] Processing staff member:",
                staff,
                "-> ",
                processedStaffMember,
              );
              return processedStaffMember;
            })
          : [];
        console.log(
          "[SecretariatPage] Final processed staff members:",
          processedStaff,
        );
        setStaffMembers(processedStaff);

        const normalizedAthletes = Array.isArray(athletesData)
          ? athletesData
              .map((athlete: any) => {
                const firstName = String(athlete?.first_name || "").trim();
                const lastName = String(athlete?.last_name || "").trim();
                const label = [firstName, lastName].filter(Boolean).join(" ").trim();

                if (!athlete?.id || !label) {
                  return null;
                }

                return {
                  id: String(athlete.id),
                  label,
                  guardians: Array.isArray(athlete?.data?.guardians)
                    ? athlete.data.guardians
                    : [],
                };
              })
              .filter(Boolean)
          : [];

        const trainerPeople = Array.isArray(trainersData)
          ? trainersData
              .map((trainer: any) => {
                const label = String(
                  trainer?.name ||
                    [trainer?.firstName, trainer?.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                    "",
                ).trim();

                if (!trainer?.id || !label) {
                  return null;
                }

                return {
                  id: `trainer-${trainer.id}`,
                  label,
                };
              })
              .filter(Boolean)
          : [];

        const processedTrainerOptions = Array.isArray(trainersData)
          ? trainersData
              .map((trainer: any) => {
                const label = String(
                  trainer?.name ||
                    [trainer?.firstName, trainer?.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                    "",
                ).trim();

                if (!trainer?.id || !label) {
                  return null;
                }

                return {
                  id: String(trainer.id),
                  label,
                };
              })
              .filter(Boolean)
          : [];

        const processedMemberOptions = Array.isArray(membersData)
          ? membersData
              .map((member: any) => {
                const label = String(
                  member?.fullName ||
                    member?.name ||
                    [member?.firstName, member?.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                    "",
                ).trim();

                if (!member?.id || !label) {
                  return null;
                }

                return {
                  id: String(member.id),
                  label,
                };
              })
              .filter(Boolean)
          : [];

        const guardianPeople = normalizedAthletes.flatMap((athlete: any) =>
          (athlete.guardians || [])
            .map((guardian: any, index: number) => {
              const label = [
                String(guardian?.name || "").trim(),
                String(guardian?.surname || "").trim(),
              ]
                .filter(Boolean)
                .join(" ")
                .trim();

              if (!label) {
                return null;
              }

              return {
                id: `guardian-${athlete.id}-${guardian.id || index}`,
                label,
                athleteLabel: athlete.label,
              };
            })
            .filter(Boolean),
        );

        const athletePeople = normalizedAthletes.map((athlete: any) => ({
          id: `athlete-${athlete.id}`,
          label: athlete.label,
          athleteLabel: athlete.label,
        }));

        const staffPeople = processedStaff.map((staff) => ({
          id: `staff-${staff.id}`,
          label: staff.name,
        }));

        const uniquePeople = [
          ...athletePeople,
          ...guardianPeople,
          ...staffPeople,
          ...trainerPeople,
        ].filter(
          (person, index, array) =>
            person &&
            array.findIndex(
              (entry) =>
                String(entry?.label || "").toLowerCase() ===
                String(person?.label || "").toLowerCase(),
            ) === index,
        );

        setAthleteOptions(
          normalizedAthletes.map((athlete: any) => ({
            id: athlete.id,
            label: athlete.label,
          })),
        );
        setTrainerOptions(processedTrainerOptions as ReminderTargetOption[]);
        setMemberOptions(processedMemberOptions as ReminderTargetOption[]);
        setPersonOptions(uniquePeople as Array<{
          id: string;
          label: string;
          athleteLabel?: string;
        }>);

        // Set opening hours if they exist
        if (openingHoursData && openingHoursData.length > 0) {
          setOpeningHours(openingHoursData[0]);
        }

        console.log("[SecretariatPage] Data loading completed successfully");
      } catch (error) {
        console.error(
          "[SecretariatPage] Error loading secretariat data:",
          error,
        );
        showToast("error", "Errore nel caricamento dei dati della segreteria");
      } finally {
        setLoading(false);
      }
    };

    if (user && activeClub) {
      console.log(
        "[SecretariatPage] User and active club available, starting data load",
      );
      loadData();
    } else {
      console.log("[SecretariatPage] Missing user or active club:", {
        user: !!user,
        activeClub: !!activeClub,
      });
      setLoading(false);
    }
  }, [user, activeClub, showToast]);

  const [newAppointment, setNewAppointment] = useState({
    title: "",
    time: "",
    description: "",
    person: "",
    athlete: "",
  });

  const [newNote, setNewNote] = useState("");
  const [newNoteExpiryDate, setNewNoteExpiryDate] = useState<Date | undefined>(
    undefined,
  );
  const [newNoteNotificationEnabled, setNewNoteNotificationEnabled] =
    useState(false);
  const [newNoteIsAllDay, setNewNoteIsAllDay] = useState(true);
  const [newNoteTime, setNewNoteTime] = useState("");
  const [newNoteTargetType, setNewNoteTargetType] =
    useState<ReminderTargetType>("club_dashboard");
  const [newNoteTargetId, setNewNoteTargetId] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editedNoteContent, setEditedNoteContent] = useState("");
  const [editedNoteExpiryDate, setEditedNoteExpiryDate] = useState<
    Date | undefined
  >(undefined);
  const [editedNoteNotificationEnabled, setEditedNoteNotificationEnabled] =
    useState(false);
  const [editedNoteIsAllDay, setEditedNoteIsAllDay] = useState(true);
  const [editedNoteTime, setEditedNoteTime] = useState("");
  const [editedNoteTargetType, setEditedNoteTargetType] =
    useState<ReminderTargetType>("club_dashboard");
  const [editedNoteTargetId, setEditedNoteTargetId] = useState("");

  const [isViewAppointmentOpen, setIsViewAppointmentOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(
    null,
  );

  const getReminderTargetOptions = (targetType: ReminderTargetType) => {
    switch (targetType) {
      case "trainer":
        return trainerOptions;
      case "staff_member":
        return staffMembers.map((staff) => ({
          id: staff.id,
          label: staff.name,
        }));
      case "member":
        return memberOptions;
      default:
        return [];
    }
  };

  const buildReminderTargetData = (
    targetType: ReminderTargetType,
    targetId: string,
  ) => {
    if (targetType === "club_dashboard" || targetType === "all_trainers") {
      return {
        targetType,
        targetId: "",
        targetLabel: "",
      };
    }

    const selectedOption = getReminderTargetOptions(targetType).find(
      (option) => option.id === targetId,
    );

    return {
      targetType,
      targetId,
      targetLabel: selectedOption?.label || "",
    };
  };

  const handleOpeningHoursChange = (
    day: string,
    field: string,
    value: string,
  ) => {
    setOpeningHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day as keyof typeof prev],
        [field]: value,
      },
    }));
  };

  const handleAppointmentChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    if (name === "person") {
      const matchedPerson = personOptions.find(
        (person) => person.label.toLowerCase() === value.trim().toLowerCase(),
      );

      setNewAppointment((prev) => ({
        ...prev,
        person: value,
        athlete:
          matchedPerson?.athleteLabel && !prev.athlete
            ? matchedPerson.athleteLabel
            : prev.athlete,
      }));
      return;
    }

    setNewAppointment((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const addAppointment = async () => {
    console.log("Adding appointment with data:", {
      appointmentDate,
      title: newAppointment.title,
      time: newAppointment.time,
      person: newAppointment.person,
      activeClubId: activeClub?.id,
    });

    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo trovato. Ricarica la pagina.");
      return;
    }

    if (
      !appointmentDate ||
      !newAppointment.title.trim() ||
      !newAppointment.time.trim() ||
      !newAppointment.person.trim()
    ) {
      showToast(
        "error",
        "Inserisci data, titolo, orario e nominativo per l'appuntamento",
      );
      return;
    }

    try {
      const appointment = {
        id: `appointment-${Date.now()}`,
        title: newAppointment.title,
        date: appointmentDate,
        time: newAppointment.time,
        description: newAppointment.description,
        person: newAppointment.person,
        athlete: newAppointment.athlete,
      };

      // Save to database
      await addClubData(activeClub.id, "appointments", appointment);

      setAppointments([...appointments, appointment]);
      setNewAppointment({
        title: "",
        time: "",
        description: "",
        person: "",
        athlete: "",
      });
      showToast("success", "Appuntamento aggiunto con successo");
    } catch (error) {
      console.error("Error adding appointment:", error);
      showToast("error", "Errore nel salvare l'appuntamento");
    }
  };

  const addNote = async () => {
    console.log("Adding note with data:", {
      newNote,
      trimmed: newNote.trim(),
      activeClubId: activeClub?.id,
    });

    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo trovato. Ricarica la pagina.");
      return;
    }

    if (!newNote || !newNote.trim()) {
      showToast("error", "Inserisci il contenuto della nota");
      return;
    }

    if (
      ["trainer", "staff_member", "member"].includes(newNoteTargetType) &&
      !newNoteTargetId
    ) {
      showToast("error", "Seleziona il destinatario del promemoria");
      return;
    }

    try {
      const targetData = buildReminderTargetData(newNoteTargetType, newNoteTargetId);
      const note = {
        id: `note-${Date.now()}`,
        content: newNote,
        date: new Date(),
        expiryDate: newNoteExpiryDate,
        notificationEnabled: newNoteNotificationEnabled,
        isAllDay: newNoteIsAllDay,
        notificationTime: newNoteIsAllDay ? "08:00" : newNoteTime,
        ...targetData,
      };

      // Save to database
      await addClubData(activeClub.id, "secretariat_notes", note);

      setNotes([...notes, note]);
      setNewNote("");
      setNewNoteExpiryDate(undefined);
      setNewNoteNotificationEnabled(false);
      setNewNoteIsAllDay(true);
      setNewNoteTime("");
      setNewNoteTargetType("club_dashboard");
      setNewNoteTargetId("");
      showToast("success", "Nota aggiunta con successo");
    } catch (error) {
      console.error("Error adding note:", error);
      showToast("error", "Errore nel salvare la nota");
    }
  };

  const deleteNote = async (id: string) => {
    if (!activeClub?.id) return;

    try {
      await deleteClubDataItem(activeClub.id, "secretariat_notes", id);
      setNotes(notes.filter((note) => note.id !== id));
      showToast("success", "Nota eliminata con successo");
    } catch (error) {
      console.error("Error deleting note:", error);
      showToast("error", "Errore nell'eliminare la nota");
    }
  };

  const startEditNote = (note: {
    id: string;
    content: string;
    expiryDate?: Date;
    notificationEnabled?: boolean;
    isAllDay?: boolean;
    notificationTime?: string;
    targetType?: ReminderTargetType;
    targetId?: string;
  }) => {
    setEditingNote(note.id);
    setEditedNoteContent(note.content);
    setEditedNoteExpiryDate(note.expiryDate);
    setEditedNoteNotificationEnabled(note.notificationEnabled || false);
    setEditedNoteIsAllDay(note.isAllDay !== false);
    setEditedNoteTime(note.notificationTime || "");
    setEditedNoteTargetType(note.targetType || "club_dashboard");
    setEditedNoteTargetId(note.targetId || "");
  };

  const saveEditedNote = async (id: string) => {
    if (!activeClub?.id) return;

    try {
      if (
        ["trainer", "staff_member", "member"].includes(editedNoteTargetType) &&
        !editedNoteTargetId
      ) {
        showToast("error", "Seleziona il destinatario del promemoria");
        return;
      }

      const targetData = buildReminderTargetData(
        editedNoteTargetType,
        editedNoteTargetId,
      );
      const updatedNotes = notes.map((note) =>
        note.id === id
          ? {
              ...note,
              content: editedNoteContent,
              expiryDate: editedNoteExpiryDate,
              notificationEnabled: editedNoteNotificationEnabled,
              isAllDay: editedNoteIsAllDay,
              notificationTime: editedNoteIsAllDay ? "08:00" : editedNoteTime,
              ...targetData,
            }
          : note,
      );

      await updateClubDataArray(
        activeClub.id,
        "secretariat_notes",
        updatedNotes,
      );
      setNotes(updatedNotes);
      setEditingNote(null);
      showToast("success", "Nota aggiornata con successo");
    } catch (error) {
      console.error("Error updating note:", error);
      showToast("error", "Errore nell'aggiornare la nota");
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!activeClub?.id) return;

    try {
      await deleteClubDataItem(activeClub.id, "appointments", id);
      setAppointments(appointments.filter((app) => app.id !== id));
      showToast("success", "Appuntamento eliminato con successo");
    } catch (error) {
      console.error("Error deleting appointment:", error);
      showToast("error", "Errore nell'eliminare l'appuntamento");
    }
  };

  const filteredAppointments = appointments.filter((app) => {
    if (!date) return false;
    const appDate = new Date(app.date);
    return (
      appDate.getDate() === date.getDate() &&
      appDate.getMonth() === date.getMonth() &&
      appDate.getFullYear() === date.getFullYear()
    );
  });

  const formatDate = (date: Date, includeTime: boolean = false) => {
    if (includeTime) {
      return date.toLocaleDateString("it-IT", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const saveOpeningHours = async () => {
    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo trovato. Ricarica la pagina.");
      return;
    }

    try {
      // Use updateClubDataArray to replace the entire opening_hours array
      await updateClubDataArray(activeClub.id, "opening_hours", [openingHours]);
      showToast("success", "Orari di apertura salvati con successo");
    } catch (error) {
      console.error("Error saving opening hours:", error);
      showToast("error", "Errore nel salvare gli orari di apertura");
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Segreteria" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-9xl space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Segreteria
                </h1>
                <p className="text-gray-600 mt-2">
                  Gestisci comunicazioni, documenti e attività di segreteria.
                </p>
              </div>

              <div className="flex justify-center items-center h-64">
                <div className="text-lg">Caricamento dati segreteria...</div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Segreteria" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Segreteria
              </h1>
              <p className="text-gray-600 mt-2">
                Gestisci comunicazioni, documenti e attività di segreteria.
              </p>
            </div>
            <Tabs defaultValue="opening-hours">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger
                  value="opening-hours"
                  className="flex items-center gap-2"
                >
                  <Clock className="h-4 w-4" />
                  <span>Orari di Apertura</span>
                </TabsTrigger>
                <TabsTrigger
                  value="appointments"
                  className="flex items-center gap-2"
                >
                  <CalendarDays className="h-4 w-4" />
                  <span>Appuntamenti</span>
                </TabsTrigger>
                <TabsTrigger value="notes" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>Note e Promemoria</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="opening-hours" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Orari di Apertura Segreteria</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        ["monday", "Lunedì"],
                        ["tuesday", "Martedì"],
                        ["wednesday", "Mercoledì"],
                        ["thursday", "Giovedì"],
                        ["friday", "Venerdì"],
                        ["saturday", "Sabato"],
                        ["sunday", "Domenica"],
                      ].map(([day, dayName]) => {
                        const hours =
                          openingHours[day as keyof typeof openingHours];

                        return (
                          <div
                            key={day}
                            className="grid grid-cols-3 gap-4 items-center"
                          >
                            <div className="font-medium">{dayName}</div>
                            <div className="space-y-2">
                              <Label htmlFor={`${day}-morning`}>Mattina</Label>
                              <div className="flex gap-2">
                                <Input
                                  id={`${day}-morning-start`}
                                  type="time"
                                  value={parseTimeRange(hours.morning).start}
                                  onChange={(e) =>
                                    handleOpeningHoursChange(
                                      day,
                                      "morning",
                                      buildTimeRange(
                                        e.target.value,
                                        parseTimeRange(hours.morning).end,
                                      ),
                                    )
                                  }
                                />
                                <Input
                                  id={`${day}-morning-end`}
                                  type="time"
                                  value={parseTimeRange(hours.morning).end}
                                  onChange={(e) =>
                                    handleOpeningHoursChange(
                                      day,
                                      "morning",
                                      buildTimeRange(
                                        parseTimeRange(hours.morning).start,
                                        e.target.value,
                                      ),
                                    )
                                  }
                                />
                                <select
                                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                  value={hours.morningStaff || ""}
                                  onChange={(e) =>
                                    handleOpeningHoursChange(
                                      day,
                                      "morningStaff",
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="">Seleziona staff</option>
                                  {Array.isArray(staffMembers) &&
                                  staffMembers.length > 0 ? (
                                    staffMembers.map((staff) => {
                                      console.log(
                                        "[SecretariatPage] Rendering morning staff option:",
                                        staff,
                                      );
                                      return (
                                        <option
                                          key={staff.id}
                                          value={staff.name}
                                        >
                                          {staff.name}
                                        </option>
                                      );
                                    })
                                  ) : (
                                    <option disabled>
                                      {loading
                                        ? "Caricamento staff..."
                                        : "Nessun membro dello staff trovato - Aggiungi staff dalla pagina Staff"}
                                    </option>
                                  )}
                                </select>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`${day}-afternoon`}>
                                Pomeriggio
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  id={`${day}-afternoon-start`}
                                  type="time"
                                  value={parseTimeRange(hours.afternoon).start}
                                  onChange={(e) =>
                                    handleOpeningHoursChange(
                                      day,
                                      "afternoon",
                                      buildTimeRange(
                                        e.target.value,
                                        parseTimeRange(hours.afternoon).end,
                                      ),
                                    )
                                  }
                                />
                                <Input
                                  id={`${day}-afternoon-end`}
                                  type="time"
                                  value={parseTimeRange(hours.afternoon).end}
                                  onChange={(e) =>
                                    handleOpeningHoursChange(
                                      day,
                                      "afternoon",
                                      buildTimeRange(
                                        parseTimeRange(hours.afternoon).start,
                                        e.target.value,
                                      ),
                                    )
                                  }
                                />
                                <select
                                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                  value={hours.afternoonStaff || ""}
                                  onChange={(e) =>
                                    handleOpeningHoursChange(
                                      day,
                                      "afternoonStaff",
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="">Seleziona staff</option>
                                  {Array.isArray(staffMembers) &&
                                  staffMembers.length > 0 ? (
                                    staffMembers.map((staff) => {
                                      console.log(
                                        "[SecretariatPage] Rendering afternoon staff option:",
                                        staff,
                                      );
                                      return (
                                        <option
                                          key={staff.id}
                                          value={staff.name}
                                        >
                                          {staff.name}
                                        </option>
                                      );
                                    })
                                  ) : (
                                    <option disabled>
                                      {loading
                                        ? "Caricamento staff..."
                                        : "Nessun membro dello staff trovato - Aggiungi staff dalla pagina Staff"}
                                    </option>
                                  )}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex justify-end mt-4">
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={saveOpeningHours}
                        >
                          Salva Orari
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="appointments" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 gap-6">
                  <Card>
                    <CardHeader className="flex flex-row justify-between items-center">
                      <CardTitle>
                        Appuntamenti del{" "}
                        {date?.toLocaleDateString("it-IT", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </CardTitle>
                      <div></div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-6">
                        <h4 className="font-medium mb-4">
                          Calendario Settimanale
                        </h4>
                        <style>
                          {
                            ".column-calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }"
                          }
                          {
                            ".column-calendar-header { padding: 8px; text-align: center; font-weight: 500; background-color: #f3f4f6; border-radius: 4px; }"
                          }
                          {
                            ".column-calendar-cell { min-height: 80px; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px; }"
                          }
                          {
                            "@media (max-width: 768px) { .column-calendar { grid-template-columns: repeat(7, 80px); overflow-x: auto; } }"
                          }
                        </style>
                        <div className="flex justify-between items-center mb-4">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => {
                              const prevWeek = new Date(date || new Date());
                              prevWeek.setDate(prevWeek.getDate() - 7);
                              setDate(prevWeek);
                              showToast("info", "Settimana precedente");
                            }}
                          >
                            <ChevronLeft size={16} />
                            Settimana precedente
                          </Button>
                          <div className="font-medium">
                            {new Date().toLocaleDateString("it-IT", {
                              month: "long",
                              year: "numeric",
                            })}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => {
                              const nextWeek = new Date(date || new Date());
                              nextWeek.setDate(nextWeek.getDate() + 7);
                              setDate(nextWeek);
                              showToast("info", "Settimana successiva");
                            }}
                          >
                            Settimana successiva
                            <ChevronRight size={16} />
                          </Button>
                        </div>
                        <div className="column-calendar w-full">
                          {Array.from({ length: 7 }, (_, i) => {
                            const currentDay = new Date(date || new Date());
                            const startOfWeek = new Date(currentDay);
                            startOfWeek.setDate(
                              currentDay.getDate() - currentDay.getDay() + 1,
                            );
                            const day = new Date(startOfWeek);
                            day.setDate(startOfWeek.getDate() + i);
                            const dayName = day.toLocaleDateString("it-IT", {
                              weekday: "short",
                            });
                            const dayNum = day.getDate();
                            return (
                              <div key={i} className="column-calendar-header">
                                {dayName}: {dayNum}
                              </div>
                            );
                          })}

                          {Array.from({ length: 7 }, (_, i) => {
                            const currentDay = new Date(date || new Date());
                            const startOfWeek = new Date(currentDay);
                            startOfWeek.setDate(
                              currentDay.getDate() - currentDay.getDay() + 1,
                            );
                            const day = new Date(startOfWeek);
                            day.setDate(startOfWeek.getDate() + i);

                            // Filter appointments for this specific day
                            const dayAppointments = appointments.filter(
                              (app) => {
                                const appDate = new Date(app.date);
                                return (
                                  appDate.getDate() === day.getDate() &&
                                  appDate.getMonth() === day.getMonth() &&
                                  appDate.getFullYear() === day.getFullYear()
                                );
                              },
                            );

                            return (
                              <div key={i} className="column-calendar-cell">
                                {dayAppointments.map((appointment) => (
                                  <div
                                    key={appointment.id}
                                    className="text-xs p-1 bg-blue-100 dark:bg-blue-900 rounded mb-1 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                                    onClick={() => {
                                      setSelectedAppointment(appointment);
                                      setIsViewAppointmentOpen(true);
                                    }}
                                  >
                                    {appointment.time} - {appointment.person}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="appointment-date">Data *</Label>
                            <Input
                              id="appointment-date"
                              type="date"
                              value={
                                appointmentDate
                                  ? appointmentDate.toISOString().split("T")[0]
                                  : ""
                              }
                              onChange={(e) => {
                                const selectedDate = e.target.value
                                  ? new Date(e.target.value)
                                  : undefined;
                                setAppointmentDate(selectedDate);
                              }}
                              min={new Date().toISOString().split("T")[0]}
                              className="w-full"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="appointment-title">
                                Titolo *
                              </Label>
                              <Input
                                id="appointment-title"
                                name="title"
                                value={newAppointment.title}
                                onChange={handleAppointmentChange}
                                placeholder="Titolo appuntamento"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="appointment-time">Orario *</Label>
                              {(() => {
                                if (!appointmentDate) {
                                  return (
                                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                        Seleziona prima una data per vedere gli
                                        orari disponibili
                                      </p>
                                    </div>
                                  );
                                }

                                const dayOfWeek = appointmentDate.getDay();
                                const dayNames = [
                                  "sunday",
                                  "monday",
                                  "tuesday",
                                  "wednesday",
                                  "thursday",
                                  "friday",
                                  "saturday",
                                ];
                                const dayKey = dayNames[
                                  dayOfWeek
                                ] as keyof typeof openingHours;
                                const dayHours = openingHours[dayKey];

                                const morningSlots = buildAppointmentSlots(
                                  dayHours.morning,
                                );
                                const afternoonSlots = buildAppointmentSlots(
                                  dayHours.afternoon,
                                );
                                const allSlots = [
                                  ...morningSlots,
                                  ...afternoonSlots,
                                ];

                                if (allSlots.length === 0) {
                                  const dayName =
                                    appointmentDate.toLocaleDateString(
                                      "it-IT",
                                      { weekday: "long" },
                                    );
                                  return (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                                      <p className="text-sm text-red-700 dark:text-red-300">
                                        ⚠️ Nessun orario di apertura configurato
                                        per {dayName}.
                                        <br />
                                        Configura gli orari nella sezione "Orari
                                        di Apertura" o seleziona un altro
                                        giorno.
                                      </p>
                                    </div>
                                  );
                                }

                                return (
                                  <select
                                    id="appointment-time"
                                    name="time"
                                    value={newAppointment.time}
                                    onChange={handleAppointmentChange}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    required
                                  >
                                    <option value="">Seleziona orario</option>
                                    {morningSlots.length > 0 && (
                                      <optgroup label="Mattina">
                                        {morningSlots.map((slot) => (
                                          <option key={slot} value={slot}>
                                            {slot}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                                    {afternoonSlots.length > 0 && (
                                      <optgroup label="Pomeriggio">
                                        {afternoonSlots.map((slot) => (
                                          <option key={slot} value={slot}>
                                            {slot}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </select>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="appointment-person">
                              Nominativo *
                            </Label>
                            <Input
                              id="appointment-person"
                              list="secretariat-person-options"
                              name="person"
                              value={newAppointment.person}
                              onChange={handleAppointmentChange}
                              placeholder="Cerca atleta, genitore, tutore, staff o allenatore"
                              required
                            />
                            <datalist id="secretariat-person-options">
                              {personOptions.map((person) => (
                                <option
                                  key={person.id}
                                  value={person.label}
                                  label={
                                    person.athleteLabel
                                      ? `${person.label} • collegato a ${person.athleteLabel}`
                                      : person.label
                                  }
                                />
                              ))}
                            </datalist>
                            <p className="text-xs text-muted-foreground">
                              La ricerca include atleti, tutori, genitori,
                              staff e allenatori registrati nel club.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="appointment-athlete">
                              Atleta collegato (opzionale)
                            </Label>
                            <Input
                              id="appointment-athlete"
                              list="secretariat-athlete-options"
                              name="athlete"
                              value={newAppointment.athlete}
                              onChange={handleAppointmentChange}
                              placeholder="Cerca un atleta registrato"
                            />
                            <datalist id="secretariat-athlete-options">
                              {athleteOptions.map((athlete) => (
                                <option
                                  key={athlete.id}
                                  value={athlete.label}
                                />
                              ))}
                            </datalist>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="appointment-description">
                            Descrizione (opzionale)
                          </Label>
                          <Textarea
                            id="appointment-description"
                            name="description"
                            value={newAppointment.description}
                            onChange={handleAppointmentChange}
                            placeholder="Dettagli appuntamento"
                            rows={3}
                          />
                        </div>

                        <Button
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          onClick={addAppointment}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Aggiungi Appuntamento
                        </Button>

                        <div className="border-t pt-4 mt-4">
                          {filteredAppointments.length > 0 ? (
                            <div className="space-y-4">
                              {filteredAppointments.map((appointment) => (
                                <div
                                  key={appointment.id}
                                  className="p-4 border rounded-lg"
                                >
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <h4 className="font-medium">
                                        {appointment.title}
                                      </h4>
                                      <p className="text-sm text-muted-foreground">
                                        Orario: {appointment.time}
                                      </p>
                                      {appointment.description && (
                                        <p className="text-sm mt-2">
                                          {appointment.description}
                                        </p>
                                      )}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        deleteAppointment(appointment.id)
                                      }
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-center text-muted-foreground py-4">
                              Nessun appuntamento per questa data
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Note e Promemoria</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="note-content">Nuova Nota</Label>
                        <Textarea
                          id="note-content"
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder="Scrivi una nota o un promemoria..."
                          rows={3}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="note-expiry">
                          Data di Scadenza (opzionale)
                        </Label>
                        <Input
                          id="note-expiry"
                          type="date"
                          value={
                            newNoteExpiryDate
                              ? newNoteExpiryDate.toISOString().split("T")[0]
                              : ""
                          }
                          onChange={(e) => {
                            const selectedDate = e.target.value
                              ? new Date(e.target.value)
                              : undefined;
                            setNewNoteExpiryDate(selectedDate);
                          }}
                          min={new Date().toISOString().split("T")[0]}
                          className="w-full"
                        />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="note-target-type">
                            Destinazione promemoria
                          </Label>
                          <select
                            id="note-target-type"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={newNoteTargetType}
                            onChange={(e) => {
                              setNewNoteTargetType(
                                e.target.value as ReminderTargetType,
                              );
                              setNewNoteTargetId("");
                            }}
                          >
                            <option value="club_dashboard">
                              Interno dashboard club
                            </option>
                            <option value="all_trainers">
                              Tutti gli allenatori
                            </option>
                            <option value="trainer">
                              Allenatore specifico
                            </option>
                            <option value="staff_member">
                              Membro staff specifico
                            </option>
                            <option value="member">Socio specifico</option>
                          </select>
                        </div>

                        {["trainer", "staff_member", "member"].includes(
                          newNoteTargetType,
                        ) ? (
                          <div className="space-y-2">
                            <Label htmlFor="note-target-id">
                              Seleziona destinatario
                            </Label>
                            <select
                              id="note-target-id"
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={newNoteTargetId}
                              onChange={(e) => setNewNoteTargetId(e.target.value)}
                            >
                              <option value="">Seleziona...</option>
                              {getReminderTargetOptions(newNoteTargetType).map(
                                (option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ),
                              )}
                            </select>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="note-notification"
                          checked={newNoteNotificationEnabled}
                          onChange={(e) =>
                            setNewNoteNotificationEnabled(e.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="note-notification">
                          Ricevi notifica alla scadenza
                        </Label>
                      </div>

                      {newNoteNotificationEnabled && (
                        <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="note-all-day"
                              name="notification-type"
                              checked={newNoteIsAllDay}
                              onChange={() => setNewNoteIsAllDay(true)}
                              className="h-4 w-4"
                            />
                            <Label
                              htmlFor="note-all-day"
                              className="cursor-pointer"
                            >
                              Promemoria per l'intera giornata (notifica alle
                              08:00)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="note-specific-time"
                              name="notification-type"
                              checked={!newNoteIsAllDay}
                              onChange={() => setNewNoteIsAllDay(false)}
                              className="h-4 w-4"
                            />
                            <Label
                              htmlFor="note-specific-time"
                              className="cursor-pointer"
                            >
                              Orario specifico (notifica 30 min prima)
                            </Label>
                          </div>
                          {!newNoteIsAllDay && (
                            <div className="ml-6">
                              <Label htmlFor="note-time">Orario</Label>
                              <Input
                                id="note-time"
                                type="time"
                                value={newNoteTime}
                                onChange={(e) => setNewNoteTime(e.target.value)}
                                className="w-32 mt-1"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <Button
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        onClick={addNote}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Aggiungi Nota
                      </Button>

                      <div className="border-t pt-4 mt-4">
                        {notes.length > 0 ? (
                          <div className="space-y-4">
                            {notes.map((note) => (
                              <div
                                key={note.id}
                                className="p-4 border rounded-lg"
                              >
                                {editingNote === note.id ? (
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label>Contenuto</Label>
                                      <Textarea
                                        value={editedNoteContent}
                                        onChange={(e) =>
                                          setEditedNoteContent(e.target.value)
                                        }
                                        rows={3}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Data di scadenza</Label>
                                      <Input
                                        type="date"
                                        value={
                                          editedNoteExpiryDate
                                            ? editedNoteExpiryDate
                                                .toISOString()
                                                .split("T")[0]
                                            : ""
                                        }
                                        onChange={(e) =>
                                          setEditedNoteExpiryDate(
                                            e.target.value
                                              ? new Date(e.target.value)
                                              : undefined,
                                          )
                                        }
                                      />
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2">
                                      <div className="space-y-2">
                                        <Label>Destinazione promemoria</Label>
                                        <select
                                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                          value={editedNoteTargetType}
                                          onChange={(e) => {
                                            setEditedNoteTargetType(
                                              e.target.value as ReminderTargetType,
                                            );
                                            setEditedNoteTargetId("");
                                          }}
                                        >
                                          <option value="club_dashboard">
                                            Interno dashboard club
                                          </option>
                                          <option value="all_trainers">
                                            Tutti gli allenatori
                                          </option>
                                          <option value="trainer">
                                            Allenatore specifico
                                          </option>
                                          <option value="staff_member">
                                            Membro staff specifico
                                          </option>
                                          <option value="member">
                                            Socio specifico
                                          </option>
                                        </select>
                                      </div>

                                      {["trainer", "staff_member", "member"].includes(
                                        editedNoteTargetType,
                                      ) ? (
                                        <div className="space-y-2">
                                          <Label>Seleziona destinatario</Label>
                                          <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={editedNoteTargetId}
                                            onChange={(e) =>
                                              setEditedNoteTargetId(e.target.value)
                                            }
                                          >
                                            <option value="">Seleziona...</option>
                                            {getReminderTargetOptions(
                                              editedNoteTargetType,
                                            ).map((option) => (
                                              <option
                                                key={option.id}
                                                value={option.id}
                                              >
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="checkbox"
                                        id={`edit-note-notification-${note.id}`}
                                        checked={editedNoteNotificationEnabled}
                                        onChange={(e) =>
                                          setEditedNoteNotificationEnabled(
                                            e.target.checked,
                                          )
                                        }
                                        className="h-4 w-4 rounded border-gray-300"
                                      />
                                      <Label
                                        htmlFor={`edit-note-notification-${note.id}`}
                                      >
                                        Ricevi notifica alla scadenza
                                      </Label>
                                    </div>

                                    {editedNoteNotificationEnabled && (
                                      <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                        <div className="flex items-center space-x-2">
                                          <input
                                            type="radio"
                                            id={`edit-note-all-day-${note.id}`}
                                            name={`edit-notification-type-${note.id}`}
                                            checked={editedNoteIsAllDay}
                                            onChange={() =>
                                              setEditedNoteIsAllDay(true)
                                            }
                                            className="h-4 w-4"
                                          />
                                          <Label
                                            htmlFor={`edit-note-all-day-${note.id}`}
                                            className="cursor-pointer"
                                          >
                                            Promemoria per l'intera giornata
                                            (notifica alle 08:00)
                                          </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <input
                                            type="radio"
                                            id={`edit-note-specific-time-${note.id}`}
                                            name={`edit-notification-type-${note.id}`}
                                            checked={!editedNoteIsAllDay}
                                            onChange={() =>
                                              setEditedNoteIsAllDay(false)
                                            }
                                            className="h-4 w-4"
                                          />
                                          <Label
                                            htmlFor={`edit-note-specific-time-${note.id}`}
                                            className="cursor-pointer"
                                          >
                                            Orario specifico (notifica 30 min
                                            prima)
                                          </Label>
                                        </div>
                                        {!editedNoteIsAllDay && (
                                          <div className="ml-6">
                                            <Label
                                              htmlFor={`edit-note-time-${note.id}`}
                                            >
                                              Orario
                                            </Label>
                                            <Input
                                              id={`edit-note-time-${note.id}`}
                                              type="time"
                                              value={editedNoteTime}
                                              onChange={(e) =>
                                                setEditedNoteTime(
                                                  e.target.value,
                                                )
                                              }
                                              className="w-32 mt-1"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <div className="flex justify-end gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingNote(null)}
                                      >
                                        Annulla
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700"
                                        onClick={() => saveEditedNote(note.id)}
                                      >
                                        <Check className="h-4 w-4 mr-1" />
                                        Salva
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex justify-between items-start">
                                      <div className="flex-1">
                                        <p className="whitespace-pre-wrap">
                                          {note.content}
                                        </p>
                                        <div className="text-xs text-muted-foreground mt-2 space-y-1">
                                          <p>Creata: {formatDate(note.date)}</p>
                                          <p>{getReminderTargetSummary(note)}</p>
                                          {note.expiryDate && (
                                            <p className="text-amber-600">
                                              Scade:{" "}
                                              {formatDate(note.expiryDate)}
                                              {!note.isAllDay &&
                                                note.notificationTime &&
                                                ` alle ${note.notificationTime}`}
                                            </p>
                                          )}
                                          {note.notificationEnabled && (
                                            <p className="text-blue-600">
                                              🔔 Notifica attiva
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => startEditNote(note)}
                                        >
                                          <Edit className="h-4 w-4 text-blue-500" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => deleteNote(note.id)}
                                        >
                                          <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-center text-muted-foreground py-4">
                            Nessuna nota presente
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* View Appointment Dialog */}
      <Dialog
        open={isViewAppointmentOpen}
        onOpenChange={setIsViewAppointmentOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAppointment?.title || "Dettagli Appuntamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedAppointment && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Data</p>
                    <p className="text-sm">
                      {new Date(selectedAppointment.date).toLocaleDateString(
                        "it-IT",
                        {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        },
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Orario</p>
                    <p className="text-sm">{selectedAppointment.time}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Nominativo</p>
                  <p className="text-sm">{selectedAppointment.person}</p>
                </div>
                {selectedAppointment.athlete && (
                  <div>
                    <p className="text-sm font-medium">Atleta collegato</p>
                    <p className="text-sm">{selectedAppointment.athlete}</p>
                  </div>
                )}
                {selectedAppointment.description && (
                  <div>
                    <p className="text-sm font-medium">Descrizione</p>
                    <p className="text-sm whitespace-pre-wrap">
                      {selectedAppointment.description}
                    </p>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsViewAppointmentOpen(false)}
                  >
                    Chiudi
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
