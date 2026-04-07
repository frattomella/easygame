import TrainerDashboardHomeV2Page from "@/components/trainer/trainer-dashboard-home-v2-page";

export default function TrainerDashboardPage() {
  return <TrainerDashboardHomeV2Page />;
}
/*
"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  MessageSquare,
  LogOut,
  Mail,
  Phone,
  ListChecks,
  Moon,
  Sun,
  DollarSign,
  Trophy,
  Bell,
  ChevronLeft,
  ChevronRight,
  User,
  Download,
} from "lucide-react";
import Image from "next/image";
import { AttendanceSheet } from "@/components/trainer/AttendanceSheet";
import { TrainerCategories } from "@/components/trainer/TrainerCategories";
import { TrainerPayments } from "@/components/trainer/TrainerPayments";
import { MatchConvocations } from "@/components/trainer/MatchConvocations";

export default function TrainerDashboardPage() {
  // Add theme toggle functionality
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") || "light";
    }
    return "light";
  });

  // State for showing salary
  const [showSalary, setShowSalary] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("show-salary-trainer") === "true";
    }
    return false;
  });

  // Ref for tabs scrolling
  const tabsListRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check if tabs can be scrolled
  useEffect(() => {
    const checkScroll = () => {
      if (tabsListRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = tabsListRef.current;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5); // 5px buffer
      }
    };

    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, []);

  // Scroll tabs
  const scrollTabs = (direction: "left" | "right") => {
    if (tabsListRef.current) {
      const scrollAmount = 150; // Adjust as needed
      if (direction === "left") {
        tabsListRef.current.scrollBy({
          left: -scrollAmount,
          behavior: "smooth",
        });
      } else {
        tabsListRef.current.scrollBy({
          left: scrollAmount,
          behavior: "smooth",
        });
      }

      // Update scroll buttons state after scrolling
      setTimeout(() => {
        if (tabsListRef.current) {
          const { scrollLeft, scrollWidth, clientWidth } = tabsListRef.current;
          setCanScrollLeft(scrollLeft > 0);
          setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
        }
      }, 300);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };
  const router = useRouter();
  const { showToast } = useToast();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [newMessage, setNewMessage] = useState("");
  
  // Initialize date on client side to avoid hydration mismatch
  useEffect(() => {
    if (!date) setDate(new Date());
  }, []);
  const [selectedTraining, setSelectedTraining] = useState<any | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

  // Real trainer and organization data
  const [trainer, setTrainer] = useState<any>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load real data from localStorage and database
  useEffect(() => {
    const loadTrainerData = async () => {
      try {
        setIsLoading(true);

        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login/trainer");
          return;
        }

        // Get active club from localStorage
        const activeClubData = localStorage.getItem("activeClub");
        if (!activeClubData) {
          showToast("error", "Nessun club attivo trovato");
          return;
        }

        const activeClub = JSON.parse(activeClubData);
        setOrganization({
          name: activeClub.name || "Club",
          address: activeClub.address || "",
          email: activeClub.email || "",
          phone: activeClub.phone || "",
          logo: activeClub.logo_url || "/logo-blu.png",
        });

        // Get trainer data from user metadata or database
        const trainerName =
          user.user_metadata?.firstName && user.user_metadata?.lastName
            ? `${user.user_metadata.firstName} ${user.user_metadata.lastName}`
            : user.user_metadata?.name ||
              user.email?.split("@")[0] ||
              "Allenatore";

        setTrainer({
          name: trainerName,
          email: user.email || "",
          phone: user.user_metadata?.phone || "",
          avatar:
            user.user_metadata?.avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(trainerName)}`,
          categories: [
            {
              id: "1",
              name: "Categoria Assegnata",
              color: "bg-blue-500 text-white",
              athletesCount: 0,
            },
          ],
        });
      } catch (error) {
        console.error("Error loading trainer data:", error);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setIsLoading(false);
      }
    };

    loadTrainerData();
  }, [router, showToast]);

  // Real training sessions data
  const [trainingSessions, setTrainingSessions] = useState<any[]>([]);

  // Load training sessions from database
  useEffect(() => {
    const loadTrainingSessions = async () => {
      try {
        const activeClubData = localStorage.getItem("activeClub");
        if (!activeClubData) return;

        const activeClub = JSON.parse(activeClubData);
        const clubId = activeClub.id;

        // Get club data including trainings
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("trainings")
          .eq("id", clubId)
          .single();

        if (error) {
          console.error("Error loading trainings:", error);
          return;
        }

        const trainings = clubData?.trainings || [];
        setTrainingSessions(trainings);
      } catch (error) {
        console.error("Error loading training sessions:", error);
      }
    };

    loadTrainingSessions();
  }, []);

  // Real payments data
  const [payments, setPayments] = useState<any[]>([]);

  // Load payments from database
  useEffect(() => {
    const loadPayments = async () => {
      try {
        const activeClubData = localStorage.getItem("activeClub");
        if (!activeClubData) return;

        const activeClub = JSON.parse(activeClubData);
        const clubId = activeClub.id;

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Get trainers from club data instead of trainer_payments
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("trainers")
          .eq("id", clubId)
          .single();

        if (error) {
          console.error("Error loading payments:", error);
          return;
        }

        // Find current trainer and get their payments
        const currentTrainer = (clubData?.trainers || []).find(
          (trainer: any) =>
            trainer.email === user.email || trainer.id === user.id,
        );

        const trainerPayments = currentTrainer?.payments || [];
        setPayments(trainerPayments);
      } catch (error) {
        console.error("Error loading payments:", error);
      }
    };

    loadPayments();
  }, []);

  // Mock data for messages
  const [messages, setMessages] = useState([
    {
      id: "1",
      content:
        "Ciao Marco, puoi confermare la tua disponibilità per l'allenamento di sabato?",
      date: "2024-04-10T14:30:00",
      sender: "admin",
      read: true,
    },
    {
      id: "2",
      content: "Certo, sarò presente. A che ora inizia?",
      date: "2024-04-10T15:45:00",
      sender: "trainer",
      read: true,
    },
    {
      id: "3",
      content: "L'allenamento inizia alle 10:00. Grazie per la conferma!",
      date: "2024-04-10T16:20:00",
      sender: "admin",
      read: true,
    },
  ]);

  // Mock data for athletes
  const mockAthletes = {
    "1": [
      // Under 10
      {
        id: "a1",
        name: "Mario Rossi",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mario",
        matchesPlayed: 5,
        matchesAbsent: 1,
      },
      {
        id: "a2",
        name: "Luigi Verdi",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Luigi",
        matchesPlayed: 4,
        matchesAbsent: 2,
      },
      {
        id: "a3",
        name: "Anna Bianchi",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Anna",
        matchesPlayed: 6,
        matchesAbsent: 0,
      },
      {
        id: "a4",
        name: "Giulia Neri",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Giulia",
        matchesPlayed: 3,
        matchesAbsent: 3,
      },
      {
        id: "a5",
        name: "Paolo Gialli",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Paolo",
        matchesPlayed: 5,
        matchesAbsent: 0,
      },
      {
        id: "a6",
        name: "Luca Marroni",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Luca",
        matchesPlayed: 4,
        matchesAbsent: 1,
      },
      {
        id: "a7",
        name: "Sofia Blu",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sofia",
        matchesPlayed: 5,
        matchesAbsent: 0,
      },
      {
        id: "a8",
        name: "Marco Viola",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marco",
        matchesPlayed: 3,
        matchesAbsent: 2,
      },
      {
        id: "a9",
        name: "Elena Rosa",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elena",
        matchesPlayed: 4,
        matchesAbsent: 1,
      },
      {
        id: "a10",
        name: "Davide Arancio",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Davide",
        matchesPlayed: 3,
        matchesAbsent: 2,
      },
      {
        id: "a11",
        name: "Chiara Celeste",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Chiara",
        matchesPlayed: 5,
        matchesAbsent: 0,
      },
      {
        id: "a12",
        name: "Matteo Indaco",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Matteo",
        matchesPlayed: 4,
        matchesAbsent: 1,
      },
    ],
    "3": [
      // Under 14
      {
        id: "b1",
        name: "Alessandro Rossi",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alessandro",
        matchesPlayed: 7,
        matchesAbsent: 0,
      },
      {
        id: "b2",
        name: "Francesca Verdi",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Francesca",
        matchesPlayed: 6,
        matchesAbsent: 1,
      },
      {
        id: "b3",
        name: "Lorenzo Bianchi",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Lorenzo",
        matchesPlayed: 5,
        matchesAbsent: 2,
      },
      {
        id: "b4",
        name: "Martina Neri",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Martina",
        matchesPlayed: 4,
        matchesAbsent: 3,
      },
      {
        id: "b5",
        name: "Gabriele Gialli",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Gabriele",
        matchesPlayed: 6,
        matchesAbsent: 1,
      },
      {
        id: "b6",
        name: "Elisa Marroni",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elisa",
        matchesPlayed: 5,
        matchesAbsent: 2,
      },
      {
        id: "b7",
        name: "Riccardo Blu",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Riccardo",
        matchesPlayed: 7,
        matchesAbsent: 0,
      },
      {
        id: "b8",
        name: "Giorgia Viola",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Giorgia",
        matchesPlayed: 6,
        matchesAbsent: 1,
      },
      {
        id: "b9",
        name: "Tommaso Rosa",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Tommaso",
        matchesPlayed: 5,
        matchesAbsent: 2,
      },
      {
        id: "b10",
        name: "Beatrice Arancio",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Beatrice",
        matchesPlayed: 4,
        matchesAbsent: 3,
      },
      {
        id: "b11",
        name: "Simone Celeste",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Simone",
        matchesPlayed: 7,
        matchesAbsent: 0,
      },
      {
        id: "b12",
        name: "Valentina Indaco",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Valentina",
        matchesPlayed: 6,
        matchesAbsent: 1,
      },
      {
        id: "b13",
        name: "Federico Verde",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Federico",
        matchesPlayed: 5,
        matchesAbsent: 2,
      },
      {
        id: "b14",
        name: "Caterina Azzurra",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Caterina",
        matchesPlayed: 4,
        matchesAbsent: 3,
      },
      {
        id: "b15",
        name: "Nicola Grigio",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Nicola",
        matchesPlayed: 7,
        matchesAbsent: 0,
      },
    ],
  };

  // Filter trainings for the selected date
  const filteredTrainings = trainingSessions.filter((training) => {
    if (!date) return false;

    const trainingDate = new Date(training.date);
    return (
      trainingDate.getDate() === date.getDate() &&
      trainingDate.getMonth() === date.getMonth() &&
      trainingDate.getFullYear() === date.getFullYear()
    );
  });

  // Filter trainings for the current week
  const weeklyTrainings = trainingSessions.filter((training) => {
    const trainingDate = new Date(training.date);
    const weekDates = getCurrentWeekDates();
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];

    return trainingDate >= weekStart && trainingDate <= weekEnd;
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) {
      showToast("error", "Inserisci un messaggio");
      return;
    }

    const message = {
      id: `msg-${Date.now()}`,
      content: newMessage,
      date: new Date().toISOString(),
      sender: "trainer",
      read: false,
    };

    setMessages([...messages, message]);
    setNewMessage("");
    showToast("success", "Messaggio inviato");
  };

  const handleLogout = () => {
    showToast("success", "Logout effettuato con successo");
    router.push("/login/trainer");
  };

  const handleTakeAttendance = (training: any) => {
    setSelectedTraining(training);
  };

  const handleSaveAttendance = (attendanceData: any) => {
    console.log("Saving attendance data:", attendanceData);
    showToast("success", "Presenze salvate con successo");
    setSelectedTraining(null);
  };

  const handleOpenConvocations = (match: any) => {
    setSelectedMatch(match);
  };

  const handleSaveConvocations = (data: {
    matchId: string;
    convocatedAthletes: string[];
  }) => {
    console.log("Saving convocations:", data);
    showToast("success", "Convocazioni salvate con successo");
    setSelectedMatch(null);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
      </div>
    );
  }

  // Show error state if no trainer data
  if (!trainer || !organization) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Errore nel caricamento</h2>
          <p className="text-gray-600 mb-4">
            Impossibile caricare i dati dell'allenatore
          </p>
          <Button onClick={() => router.push("/login/trainer")}>
            Torna al Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
      {/* Header * /}
      <header className="sticky top-0 z-10 flex h-16 w-full items-center justify-between border-b border-border bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-6 py-4">
        <div className="flex items-center gap-2">
          <AppBackButton
            fallbackHref="/account"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          />
          <div className="h-8 w-8 relative">
            <Image
              src={organization.logo || "/logo-white.png"}
              alt={`${organization.name} Logo`}
              fill
              className="object-contain"
              onError={(e) => {
                e.currentTarget.src = "/logo-white.png";
              }}
            />
          </div>
          <span className="font-semibold text-lg text-white">
            {organization.name}
          </span>
          <Badge className="ml-2 bg-white text-blue-600 hidden md:inline-flex">
            Area Allenatori
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => {
                // Create a notification dropdown
                const notificationDropdown = document.createElement("div");
                notificationDropdown.className =
                  "fixed inset-0 z-50 flex items-start justify-end pt-16 pr-6";
                notificationDropdown.innerHTML = `
                  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-80 overflow-hidden">
                    <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                      <h3 class="font-medium">Notifiche</h3>
                      <button id="close-notifications" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                    <div class="max-h-80 overflow-y-auto">
                      <div class="p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                        <div class="flex items-start gap-3">
                          <div class="bg-blue-100 dark:bg-blue-900 p-2 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600 dark:text-blue-400"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                          </div>
                          <div class="flex-1">
                            <p class="font-medium text-sm">Allenamento confermato</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">L'allenamento di domani è stato confermato</p>
                            <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">10 minuti fa</p>
                          </div>
                        </div>
                      </div>
                      <div class="p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                        <div class="flex items-start gap-3">
                          <div class="bg-green-100 dark:bg-green-900 p-2 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600 dark:text-green-400"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          </div>
                          <div class="flex-1">
                            <p class="font-medium text-sm">Pagamento ricevuto</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Il pagamento di Aprile è stato elaborato</p>
                            <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">2 ore fa</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="p-3 border-t dark:border-gray-700 text-center">
                      <button class="text-sm text-blue-600 dark:text-blue-400 hover:underline">Vedi tutte le notifiche</button>
                    </div>
                  </div>
                  <div id="notification-backdrop" class="fixed inset-0 bg-black/20 dark:bg-black/50 z-[-1]"></div>
                `;
                document.body.appendChild(notificationDropdown);

                // Add event listeners
                document
                  .getElementById("close-notifications")
                  ?.addEventListener("click", () => {
                    notificationDropdown.remove();
                  });

                document
                  .getElementById("notification-backdrop")
                  ?.addEventListener("click", () => {
                    notificationDropdown.remove();
                  });
              }}
            >
              <Bell className="h-5 w-5 text-white" />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
                2
              </span>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium hidden md:inline-block text-white">
              {trainer.name}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={
              theme === "dark"
                ? "Passa alla modalità chiara"
                : "Passa alla modalità scura"
            }
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-white" />
            ) : (
              <Moon className="h-4 w-4 text-white" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-4 w-4 text-white" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-6 overflow-x-hidden">
        {selectedTraining ? (
          <AttendanceSheet
            trainingId={selectedTraining.id}
            trainingTitle={selectedTraining.title}
            trainingDate={selectedTraining.date}
            trainingTime={selectedTraining.time}
            categoryName={selectedTraining.category}
            location={selectedTraining.location}
            athletes={mockAthletes[selectedTraining.categoryId] || []}
            onSave={handleSaveAttendance}
            onClose={() => setSelectedTraining(null)}
          />
        ) : selectedMatch ? (
          <MatchConvocations
            isOpen={true}
            onClose={() => setSelectedMatch(null)}
            matchId={selectedMatch.id}
            matchTitle={selectedMatch.title}
            matchDate={selectedMatch.date}
            matchTime={selectedMatch.time}
            categoryName={selectedMatch.category}
            opponent={selectedMatch.opponent}
            location={selectedMatch.location}
            athletes={mockAthletes[selectedMatch.categoryId] || []}
            onSave={handleSaveConvocations}
            savedConvocations={selectedMatch.savedConvocations || []}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Organization Info Card - Mobile Only * /}
            <div className="lg:hidden w-full mb-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">
                    Informazioni Società
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center text-center">
                    <div className="h-16 w-16 relative mb-4">
                      <Image
                        src={organization.logo}
                        alt={organization.name}
                        fill
                        className="object-contain"
                      />
                    </div>
                    <h3 className="text-lg font-semibold">
                      {organization.name}
                    </h3>
                    <div className="w-full mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{organization.address}</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{organization.email}</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{organization.phone}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Left Column * /}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Il Mio Profilo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center text-center">
                    <div className="relative group">
                      <Avatar className="h-24 w-24 mb-4 group-hover:opacity-80 transition-opacity">
                        <AvatarImage src={trainer.avatar} alt={trainer.name} />
                        <AvatarFallback>
                          {trainer.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <label
                          htmlFor="profile-photo-upload"
                          className="bg-black bg-opacity-50 text-white text-xs p-1 rounded cursor-pointer"
                        >
                          Cambia foto
                        </label>
                        <input
                          id="profile-photo-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (e) => {
                                if (e.target?.result) {
                                  setTrainer((prev) => ({
                                    ...prev,
                                    avatar: e.target.result as string,
                                  }));
                                  showToast(
                                    "success",
                                    "Foto profilo aggiornata con successo",
                                  );
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold">{trainer.name}</h3>
                    <div className="w-full mt-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{trainer.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{trainer.phone}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <TrainerCategories categories={trainer.categories} />

              <Card>
                <CardHeader>
                  <CardTitle>Prenota Appuntamento con la Segreteria</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="appointment-date">Data</Label>
                        <Input
                          id="appointment-date"
                          type="date"
                          className="w-full"
                          min={new Date().toISOString().split("T")[0]}
                        />
                      </div>
                      <div>
                        <Label htmlFor="appointment-time">Orario</Label>
                        <select
                          id="appointment-time"
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                        >
                          <option value="">Seleziona un orario</option>
                          <option value="09:30">09:30 - 10:00</option>
                          <option value="10:00">10:00 - 10:30</option>
                          <option value="10:30">10:30 - 11:00</option>
                          <option value="11:00">11:00 - 11:30</option>
                          <option value="15:30">15:30 - 16:00</option>
                          <option value="16:00">16:00 - 16:30</option>
                          <option value="16:30">16:30 - 17:00</option>
                          <option value="17:00">17:00 - 17:30</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="appointment-reason">
                        Motivo dell'appuntamento
                      </Label>
                      <textarea
                        id="appointment-reason"
                        className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                        placeholder="Descrivi brevemente il motivo dell'appuntamento..."
                      ></textarea>
                    </div>
                    <div className="pt-2">
                      <Button
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          const date = document.getElementById(
                            "appointment-date",
                          ) as HTMLInputElement;
                          const time = document.getElementById(
                            "appointment-time",
                          ) as HTMLSelectElement;
                          const reason = document.getElementById(
                            "appointment-reason",
                          ) as HTMLTextAreaElement;

                          if (!date.value || !time.value || !reason.value) {
                            showToast(
                              "error",
                              "Compila tutti i campi per prenotare un appuntamento",
                            );
                            return;
                          }

                          showToast(
                            "success",
                            "Appuntamento prenotato con successo",
                          );
                          date.value = "";
                          time.value = "";
                          reason.value = "";
                        }}
                      >
                        Prenota Appuntamento
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hidden lg:block">
                <CardHeader>
                  <CardTitle className="text-center">
                    Informazioni Società
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center text-center">
                    <div className="h-16 w-16 relative mb-4">
                      <Image
                        src={organization.logo}
                        alt={organization.name}
                        fill
                        className="object-contain"
                      />
                    </div>
                    <h3 className="text-lg font-semibold">
                      {organization.name}
                    </h3>
                    <div className="w-full mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{organization.address}</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{organization.email}</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{organization.phone}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Middle Column * /}
            <div className="space-y-6 lg:col-span-2">
              <Tabs defaultValue="calendar">
              {/* Scrollable tabs with navigation buttons * /}
                <div className="relative flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`absolute left-0 z-10 h-8 w-8 rounded-full bg-background shadow-sm ${!canScrollLeft ? "opacity-0" : "opacity-100"}`}
                    onClick={() => scrollTabs("left")}
                    disabled={!canScrollLeft}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div
                    className="overflow-x-auto scrollbar-hide mx-8"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                    ref={tabsListRef}
                  >
                    <TabsList className="w-max px-2">
                      <TabsTrigger
                        value="calendar"
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <CalendarIcon className="h-4 w-4" />
                        Calendario
                      </TabsTrigger>
                      <TabsTrigger
                        value="weekly"
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <ListChecks className="h-4 w-4" />
                        Allenamenti Settimanali
                      </TabsTrigger>
                      <TabsTrigger
                        value="matches"
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <Trophy className="h-4 w-4" />
                        Gare
                      </TabsTrigger>
                      <TabsTrigger
                        value="payments"
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <DollarSign className="h-4 w-4" />
                        Pagamenti
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className={`absolute right-0 z-10 h-8 w-8 rounded-full bg-background shadow-sm ${!canScrollRight ? "opacity-0" : "opacity-100"}`}
                    onClick={() => scrollTabs("right")}
                    disabled={!canScrollRight}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <TabsContent value="calendar" className="pt-4 overflow-x-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle>Calendario Allenamenti</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <div className="bg-white p-4 rounded-md border">
                            <Calendar
                              mode="single"
                              selected={date}
                              onSelect={setDate}
                              className="mx-auto w-full max-w-sm lg:max-w-md"
                              classNames={{
                                day_selected:
                                  "bg-blue-600 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white font-bold",
                                day_today:
                                  "bg-blue-100 text-blue-900 font-bold border-2 border-blue-600",
                                day: "h-10 w-10 p-0 font-normal text-base hover:bg-blue-50",
                                head_cell:
                                  "text-blue-700 font-medium text-[0.9rem]",
                                cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-blue-50 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
                                nav_button:
                                  "border p-1 rounded-md border-gray-300 bg-white hover:bg-gray-50",
                                table: "w-full border-collapse space-y-1",
                                caption: "text-lg font-bold py-2",
                                root: "w-full max-w-sm lg:max-w-md mx-auto",
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium mb-4">
                            Allenamenti del{" "}
                            {date?.toLocaleDateString("it-IT", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}
                          </h3>
                          {filteredTrainings.length > 0 ? (
                            <div className="space-y-4">
                              {filteredTrainings.map((training) => (
                                <div
                                  key={training.id}
                                  className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                                >
                                  <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-medium">
                                      {training.title}
                                    </h4>
                                    <Badge className="bg-blue-500 text-white">
                                      {training.category}
                                    </Badge>
                                  </div>
                                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-3.5 w-3.5" />
                                      <span>{training.time}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <MapPin className="h-3.5 w-3.5" />
                                      <span>{training.location}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Users className="h-3.5 w-3.5" />
                                      <span>
                                        {training.attendees} atleti ·{" "}
                                        <span className="text-green-600">
                                          {training.expectedAttendees ||
                                            training.attendees}{" "}
                                          previsti
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex justify-between mt-4">
                                    {training.status === "annullato" ||
                                    training.status === "cancelled" ? (
                                      <Badge className="bg-red-100 text-red-800">
                                        Annullato
                                      </Badge>
                                    ) : training.status === "completed" ||
                                      training.status === "concluded" ? (
                                      <Badge className="bg-green-100 text-green-800">
                                        Completato
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-blue-100 text-blue-800">
                                        In Programma
                                      </Badge>
                                    )}
                                    <div>
                                      {training.status === "upcoming" && (
                                        <Button
                                          size="sm"
                                          className="bg-blue-600 hover:bg-blue-700"
                                          onClick={() =>
                                            handleTakeAttendance(training)
                                          }
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                          Presenze
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    {training.attendanceSaved ? (
                                      <span className="text-green-600 flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" />{" "}
                                        Presenze salvate
                                      </span>
                                    ) : (
                                      <span className="text-amber-600">
                                        Presenze non registrate
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500 p-6">
                              <CalendarIcon className="h-12 w-12 mb-2 opacity-50" />
                              <p>
                                Nessun allenamento programmato per questa data
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="weekly" className="pt-4 overflow-x-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle>Allenamenti Settimanali</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {weeklyTrainings.length > 0 ? (
                          weeklyTrainings.map((training) => (
                            <div
                              key={training.id}
                              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h4 className="font-medium">
                                    {training.title}
                                  </h4>
                                  <p className="text-sm text-muted-foreground">
                                    {new Date(training.date).toLocaleDateString(
                                      "it-IT",
                                      {
                                        weekday: "long",
                                        day: "numeric",
                                        month: "long",
                                      },
                                    )}
                                  </p>
                                </div>
                                <Badge className="bg-blue-500 text-white">
                                  {training.category}
                                </Badge>
                              </div>
                              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>{training.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span>{training.location}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5" />
                                  <span>
                                    {training.attendees} atleti ·{" "}
                                    <span className="text-green-600">
                                      {training.expectedAttendees ||
                                        training.attendees}{" "}
                                      previsti
                                    </span>
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between mt-4">
                                {training.status === "annullato" ||
                                training.status === "cancelled" ? (
                                  <Badge className="bg-red-100 text-red-800">
                                    Annullato
                                  </Badge>
                                ) : training.status === "completed" ||
                                  training.status === "concluded" ? (
                                  <Badge className="bg-green-100 text-green-800">
                                    Completato
                                  </Badge>
                                ) : (
                                  <Badge className="bg-blue-100 text-blue-800">
                                    In Programma
                                  </Badge>
                                )}
                                <div>
                                  {training.status === "upcoming" && (
                                    <Button
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700"
                                      onClick={() =>
                                        handleTakeAttendance(training)
                                      }
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                      Presenze
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {training.attendanceSaved ? (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />{" "}
                                    Presenze salvate
                                  </span>
                                ) : (
                                  <span className="text-amber-600">
                                    Presenze non registrate
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500 p-6">
                            <CalendarIcon className="h-12 w-12 mb-2 opacity-50" />
                            <p>
                              Nessun allenamento programmato per questa
                              settimana
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="matches" className="pt-4 overflow-x-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle>Gare Programmate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                      {/* Match 1 * /}
                        <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-medium">Partita Under 14</h4>
                              <p className="text-sm text-muted-foreground">
                                Domenica, 28 aprile 2024
                              </p>
                            </div>
                            <Badge className="bg-blue-500 text-white">
                              Under 14
                            </Badge>
                          </div>
                          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5" />
                              <span>16:30 - 18:00</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>Campo Principale</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Trophy className="h-3.5 w-3.5" />
                              <span>vs Juventus Academy</span>
                            </div>
                          </div>
                          <div className="flex justify-end mt-4">
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700"
                              onClick={() => {
                                const match = {
                                  id: "match-1",
                                  title: "Partita Under 14",
                                  date: "2024-04-28",
                                  time: "16:30 - 18:00",
                                  category: "Under 14",
                                  categoryId: "3",
                                  opponent: "Juventus Academy",
                                  location: "Campo Principale",
                                  savedConvocations: [
                                    "b1",
                                    "b2",
                                    "b3",
                                    "b4",
                                    "b5",
                                    "b6",
                                    "b7",
                                    "b8",
                                    "b9",
                                    "b10",
                                    "b11",
                                  ],
                                };
                                handleOpenConvocations(match);
                              }}
                            >
                              Convocazioni
                            </Button>
                          </div>
                        </div>

                      {/* Match 2 * /}
                        <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-medium">Torneo Under 10</h4>
                              <p className="text-sm text-muted-foreground">
                                Sabato, 4 maggio 2024
                              </p>
                            </div>
                            <Badge className="bg-green-500 text-white">
                              Under 10
                            </Badge>
                          </div>
                          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5" />
                              <span>09:00 - 17:00</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>Centro Sportivo Comunale</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Trophy className="h-3.5 w-3.5" />
                              <span>Torneo a gironi</span>
                            </div>
                          </div>
                          <div className="flex justify-end mt-4">
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700"
                              onClick={() => {
                                const match = {
                                  id: "match-2",
                                  title: "Torneo Under 10",
                                  date: "2024-05-04",
                                  time: "09:00 - 17:00",
                                  category: "Under 10",
                                  categoryId: "1",
                                  opponent: "Vari",
                                  location: "Centro Sportivo Comunale",
                                  savedConvocations: [],
                                };
                                handleOpenConvocations(match);
                              }}
                            >
                              Convocazioni
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="payments" className="pt-4 overflow-x-auto">
                  <TrainerPayments
                    payments={payments}
                    showSalary={showSalary}
                    onViewSalary={() => {
                      setShowSalary(true);
                      localStorage.setItem("show-salary-trainer", "true");
                    }}
                  />
                </TabsContent>
              </Tabs>

              <Card>
                <CardHeader>
                  <CardTitle>Messaggi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] flex flex-col">
                    <div className="flex-1 overflow-y-auto mb-4 space-y-3">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex flex-col ${message.sender === "trainer" ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${message.sender === "trainer" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800"}`}
                          >
                            <p className="text-sm">{message.content}</p>
                          </div>
                          <span className="text-xs text-muted-foreground mt-1">
                            {formatMessageDate(message.date)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Scrivi un messaggio..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSendMessage()
                        }
                      />
                      <Button
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={handleSendMessage}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
*/
