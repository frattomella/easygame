"use client";

import React from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-notification";
import {
  BarChart3,
  FileText,
  Download,
  Calendar,
  Users,
  FileHeart,
  Printer,
  Clock,
  AlertCircle,
  Trophy,
  CheckCircle,
  User,
  TrendingUp,
  TrendingDown,
  Target,
  Lightbulb,
  Activity,
  DollarSign,
  Zap,
  Layers,
} from "lucide-react";
import {
  getClub,
  getClubAthletes,
  getClubData,
  loadWeeklyTrainingSchedule,
  getClubStaff,
} from "@/lib/simplified-db";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = React.useState("attendance");
  const [clubData, setClubData] = React.useState(null);
  const [athletes, setAthletes] = React.useState([]);
  const [trainings, setTrainings] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [aiRecommendations, setAiRecommendations] = React.useState([]);
  const [performanceMetrics, setPerformanceMetrics] = React.useState({});
  const { showToast } = useToast();

  // Load club data on component mount
  React.useEffect(() => {
    loadClubData();
  }, [showToast]);

  // Generate AI recommendations based on real club data
  const generateAIRecommendations = (
    club,
    athletes,
    trainings,
    staff,
    categories,
  ) => {
    const recommendations = [];

    console.log("Generating AI recommendations with data:", {
      athletesCount: athletes.length,
      trainingsCount: trainings.length,
      staffCount: staff.length,
      categoriesCount: categories.length,
    });

    // Analyze athlete participation
    const activeAthletes = athletes.filter(
      (a) => a.data?.status === "active" || !a.data?.status,
    );
    const athleteParticipationRate =
      activeAthletes.length / Math.max(athletes.length, 1);

    if (athletes.length === 0) {
      recommendations.push({
        type: "info",
        category: "Gestione Atleti",
        title: "Nessun atleta registrato",
        description:
          "Inizia aggiungendo i primi atleti al tuo club per vedere statistiche dettagliate.",
        priority: "medium",
        icon: <Users className="h-5 w-5" />,
      });
    } else if (athleteParticipationRate < 0.8) {
      recommendations.push({
        type: "warning",
        category: "Partecipazione Atleti",
        title: "Bassa partecipazione degli atleti",
        description: `Solo il ${Math.round(athleteParticipationRate * 100)}% degli atleti è attivo. Considera di organizzare eventi di coinvolgimento o rivedere i programmi di allenamento.`,
        priority: "high",
        icon: <Users className="h-5 w-5" />,
      });
    }

    // Analyze training frequency
    const today = new Date();
    const thirtyDaysFromNow = new Date(
      today.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const upcomingTrainings = trainings.filter((t) => {
      if (!t.date) return false;
      const trainingDate = new Date(t.date);
      return trainingDate >= today && trainingDate <= thirtyDaysFromNow;
    });

    if (trainings.length === 0) {
      recommendations.push({
        type: "info",
        category: "Programmazione Allenamenti",
        title: "Nessun allenamento programmato",
        description: "Inizia programmando i primi allenamenti per il tuo club.",
        priority: "medium",
        icon: <Calendar className="h-5 w-5" />,
      });
    } else if (upcomingTrainings.length < 8) {
      recommendations.push({
        type: "info",
        category: "Programmazione Allenamenti",
        title: "Aumenta la frequenza degli allenamenti",
        description: `Hai solo ${upcomingTrainings.length} allenamenti programmati nei prossimi 30 giorni. Considera di aumentare la frequenza per migliorare le prestazioni degli atleti.`,
        priority: "medium",
        icon: <Calendar className="h-5 w-5" />,
      });
    }

    // Analyze staff-to-athlete ratio
    if (staff.length === 0 && athletes.length > 0) {
      recommendations.push({
        type: "warning",
        category: "Gestione Staff",
        title: "Nessun membro dello staff registrato",
        description:
          "Aggiungi allenatori e staff di supporto per gestire meglio il club.",
        priority: "high",
        icon: <User className="h-5 w-5" />,
      });
    } else if (staff.length > 0 && activeAthletes.length > 0) {
      const staffToAthleteRatio = staff.length / activeAthletes.length;
      if (staffToAthleteRatio < 0.1) {
        recommendations.push({
          type: "warning",
          category: "Gestione Staff",
          title: "Rapporto staff-atleti insufficiente",
          description: `Il rapporto staff-atleti è di 1:${Math.round(1 / staffToAthleteRatio)}. Considera di assumere più allenatori o staff di supporto.`,
          priority: "high",
          icon: <User className="h-5 w-5" />,
        });
      }
    }

    // Check for certificate management
    const athletesWithExpiredCerts = athletes.filter((a) => {
      if (!a.data?.medicalCertExpiry) return true;
      return new Date(a.data.medicalCertExpiry) < new Date();
    });

    if (athletesWithExpiredCerts.length > 0) {
      recommendations.push({
        type: "error",
        category: "Certificati Medici",
        title: "Certificati medici scaduti",
        description: `${athletesWithExpiredCerts.length} atleti hanno certificati medici scaduti o mancanti. Priorità assoluta per la conformità legale.`,
        priority: "critical",
        icon: <FileHeart className="h-5 w-5" />,
      });
    }

    // Check categories
    if (categories.length === 0 && athletes.length > 0) {
      recommendations.push({
        type: "info",
        category: "Organizzazione",
        title: "Crea categorie per organizzare gli atleti",
        description:
          "Organizza i tuoi atleti in categorie per una migliore gestione degli allenamenti.",
        priority: "medium",
        icon: <Layers className="h-5 w-5" />,
      });
    }

    // Positive recommendations
    if (athletes.length > 0 && athleteParticipationRate > 0.9) {
      recommendations.push({
        type: "success",
        category: "Eccellenza",
        title: "Ottima partecipazione degli atleti",
        description: `Il ${Math.round(athleteParticipationRate * 100)}% degli atleti è attivo. Continua con le strategie attuali!`,
        priority: "low",
        icon: <Trophy className="h-5 w-5" />,
      });
    }

    console.log("Generated recommendations:", recommendations);
    setAiRecommendations(recommendations);
  };

  // Calculate performance metrics
  const calculatePerformanceMetrics = (athletes, trainings, staff) => {
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Calculate trends
    const recentAthletes = athletes.filter(
      (a) => new Date(a.created_at) >= lastMonth,
    ).length;
    const previousAthletes = athletes.filter((a) => {
      const createdDate = new Date(a.created_at);
      return createdDate >= twoMonthsAgo && createdDate < lastMonth;
    }).length;

    const recentTrainings = trainings.filter((t) => {
      const trainingDate = new Date(t.date || t.created_at);
      return trainingDate >= lastMonth;
    }).length;

    const previousTrainings = trainings.filter((t) => {
      const trainingDate = new Date(t.date || t.created_at);
      return trainingDate >= twoMonthsAgo && trainingDate < lastMonth;
    }).length;

    const athleteTrend =
      previousAthletes > 0
        ? ((recentAthletes - previousAthletes) / previousAthletes) * 100
        : 0;
    const trainingTrend =
      previousTrainings > 0
        ? ((recentTrainings - previousTrainings) / previousTrainings) * 100
        : 0;

    setPerformanceMetrics({
      athleteTrend: {
        value: Math.abs(athleteTrend).toFixed(1),
        positive: athleteTrend >= 0,
        description: athleteTrend >= 0 ? "Crescita" : "Diminuzione",
      },
      trainingTrend: {
        value: Math.abs(trainingTrend).toFixed(1),
        positive: trainingTrend >= 0,
        description: trainingTrend >= 0 ? "Aumento" : "Diminuzione",
      },
      efficiency: {
        value: Math.min(
          100,
          Math.round(
            (trainings.filter((t) => t.status === "concluded").length /
              Math.max(trainings.length, 1)) *
              100,
          ),
        ),
        description: "Efficienza allenamenti",
      },
      engagement: {
        value: Math.round(
          (athletes.filter(
            (a) => a.data?.status === "active" || !a.data?.status,
          ).length /
            Math.max(athletes.length, 1)) *
            100,
        ),
        description: "Coinvolgimento atleti",
      },
    });
  };

  // Function to handle print button click
  const handlePrint = () => {
    if (!clubData) {
      showToast("error", "Dati del club non disponibili");
      return;
    }

    // Create a printable version with better styling
    const printContent = document.createElement("div");
    printContent.innerHTML = `
      <style>
        @media print {
          body { font-family: Arial, sans-serif; }
          h1 { font-size: 24px; margin-bottom: 20px; color: #1e40af; }
          h2 { font-size: 18px; margin: 15px 0; color: #1e40af; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background-color: #f1f5f9; text-align: left; padding: 8px; border: 1px solid #e2e8f0; }
          td { padding: 8px; border: 1px solid #e2e8f0; }
          .metrics { display: flex; justify-content: space-between; margin: 20px 0; }
          .metric { text-align: center; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; width: 30%; }
          .metric-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; }
          .metric-value { font-size: 24px; font-weight: bold; color: #1e40af; }
          .metric-subtitle { font-size: 12px; color: #64748b; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .logo { height: 50px; }
          .date { font-size: 14px; color: #64748b; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #64748b; }
        }
      </style>
      <div class="header">
        <img src="${clubData.logo_url || "/logo-blu.png"}" alt="${clubData.name} Logo" class="logo" />
        <div>
          <h1>${clubData.name} - Report ${activeTab === "attendance" ? "Presenze" : activeTab === "athletes" ? "Atleti" : "Certificati"}</h1>
          <div class="date">Generato il ${new Date().toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
      </div>
    `;

    // Add report content based on active tab
    const reportData = getReportData(activeTab);
    if (activeTab === "attendance") {
      printContent.innerHTML += `
        <div class="metrics">
          <div class="metric">
            <div class="metric-title">Allenamenti Totali</div>
            <div class="metric-value">${reportData.totalTrainings}</div>
            <div class="metric-subtitle">Registrati nel sistema</div>
          </div>
          <div class="metric">
            <div class="metric-title">Allenamenti Conclusi</div>
            <div class="metric-value">${reportData.concludedTrainings}</div>
            <div class="metric-subtitle">Con presenze registrate</div>
          </div>
          <div class="metric">
            <div class="metric-title">Staff Attivo</div>
            <div class="metric-value">${reportData.activeStaff}</div>
            <div class="metric-subtitle">Membri dello staff</div>
          </div>
        </div>
        <h2>Allenamenti Recenti</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Categoria</th>
              <th>Stato</th>
              <th>Orario</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.recentTrainings
              .map(
                (training) => `
              <tr>
                <td>${training.date}</td>
                <td>${training.category}</td>
                <td>${training.status}</td>
                <td>${training.time}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else if (activeTab === "athletes") {
      printContent.innerHTML += `
        <div class="metrics">
          <div class="metric">
            <div class="metric-title">Atleti Totali</div>
            <div class="metric-value">${reportData.totalAthletes}</div>
            <div class="metric-subtitle">Iscritti alla società</div>
          </div>
          <div class="metric">
            <div class="metric-title">Atleti Attivi</div>
            <div class="metric-value">${reportData.activeAthletes}</div>
            <div class="metric-subtitle">${Math.round((reportData.activeAthletes / Math.max(reportData.totalAthletes, 1)) * 100)}% del totale</div>
          </div>
          <div class="metric">
            <div class="metric-title">Categorie</div>
            <div class="metric-value">${reportData.categories}</div>
            <div class="metric-subtitle">Categorie attive</div>
          </div>
        </div>
        <h2>Lista Atleti</h2>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cognome</th>
              <th>Categoria</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.athletesList
              .map(
                (athlete) => `
              <tr>
                <td>${athlete.firstName}</td>
                <td>${athlete.lastName}</td>
                <td>${athlete.category}</td>
                <td>${athlete.status}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else if (activeTab === "certificates") {
      printContent.innerHTML += `
        <div class="metrics">
          <div class="metric">
            <div class="metric-title">Certificati Totali</div>
            <div class="metric-value">${reportData.totalCertificates}</div>
            <div class="metric-subtitle">Nel sistema</div>
          </div>
          <div class="metric">
            <div class="metric-title">In Scadenza</div>
            <div class="metric-value">${reportData.expiringCertificates}</div>
            <div class="metric-subtitle">Prossimi 30 giorni</div>
          </div>
          <div class="metric">
            <div class="metric-title">Scaduti</div>
            <div class="metric-value">${reportData.expiredCertificates}</div>
            <div class="metric-subtitle">Da rinnovare</div>
          </div>
        </div>
        <h2>Certificati in Scadenza</h2>
        <table>
          <thead>
            <tr>
              <th>Atleta</th>
              <th>Categoria</th>
              <th>Data Scadenza</th>
              <th>Giorni Rimanenti</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.expiringCertificatesList
              .map(
                (cert) => `
              <tr>
                <td>${cert.athlete}</td>
                <td>${cert.category}</td>
                <td>${cert.expiryDate}</td>
                <td>${cert.daysRemaining}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    printContent.innerHTML += `
      <div class="footer">
        <p>© ${new Date().getFullYear()} ${clubData.name} - Tutti i diritti riservati</p>
      </div>
    `;

    // Create a new window for printing
    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.close();
    printWindow.focus();

    // Print after images have loaded
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  // Function to handle export button click
  const handleExport = () => {
    if (!clubData) {
      showToast("error", "Dati del club non disponibili");
      return;
    }

    // Create CSV data based on active tab
    const reportData = getReportData(activeTab);
    let csvContent = "";
    let filename = "";

    if (activeTab === "attendance") {
      csvContent = "Data,Categoria,Stato,Orario\n";
      reportData.recentTrainings.forEach((training) => {
        csvContent += `${training.date},${training.category},${training.status},${training.time}\n`;
      });
      filename = `allenamenti-${new Date().toISOString().split("T")[0]}.csv`;
    } else if (activeTab === "athletes") {
      csvContent = "Nome,Cognome,Categoria,Stato\n";
      reportData.athletesList.forEach((athlete) => {
        csvContent += `${athlete.firstName},${athlete.lastName},${athlete.category},${athlete.status}\n`;
      });
      filename = `atleti-${new Date().toISOString().split("T")[0]}.csv`;
    } else if (activeTab === "certificates") {
      csvContent = "Atleta,Categoria,Data Scadenza,Giorni Rimanenti\n";
      reportData.expiringCertificatesList.forEach((cert) => {
        csvContent += `${cert.athlete},${cert.category},${cert.expiryDate},${cert.daysRemaining}\n`;
      });
      filename = `certificati-${new Date().toISOString().split("T")[0]}.csv`;
    }

    // Create and download CSV file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("success", "Report CSV esportato con successo");
  };

  // Function to get report data based on active tab using real data
  const getReportData = (tab) => {
    console.log(`Getting report data for tab: ${tab}`, {
      athletesCount: athletes.length,
      trainingsCount: trainings.length,
      staffCount: staff.length,
    });

    switch (tab) {
      case "attendance":
        const concludedTrainings = trainings.filter(
          (t) => t.status === "concluded" || t.status === "completed",
        ).length;
        const recentTrainings = trainings
          .sort((a, b) => {
            const dateA = new Date(a.date || a.created_at);
            const dateB = new Date(b.date || b.created_at);
            return dateB.getTime() - dateA.getTime();
          })
          .slice(0, 10)
          .map((training) => ({
            date: new Date(
              training.date || training.created_at,
            ).toLocaleDateString("it-IT"),
            category: training.category || "N/A",
            status:
              training.status === "concluded" || training.status === "completed"
                ? "Concluso"
                : training.status === "upcoming"
                  ? "Programmato"
                  : training.status === "cancelled" ||
                      training.status === "annullato"
                    ? "Annullato"
                    : "In corso",
            time: training.time || "N/A",
          }));

        const activeStaffCount = staff.filter(
          (s) => s.status === "active" || !s.status,
        ).length;

        return {
          totalTrainings: trainings.length,
          concludedTrainings,
          activeStaff: activeStaffCount,
          recentTrainings,
        };

      case "athletes":
        const activeAthletes = athletes.filter(
          (a) => a.data?.status === "active" || !a.data?.status,
        ).length;
        const uniqueCategories = [
          ...new Set(athletes.map((a) => a.data?.category).filter(Boolean)),
        ].length;
        const currentDate = new Date();
        const monthlyAthleteTrend = Array.from({ length: 6 }, (_, index) => {
          const monthDate = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() - (5 - index),
            1,
          );
          const nextMonthDate = new Date(
            monthDate.getFullYear(),
            monthDate.getMonth() + 1,
            1,
          );
          const count = athletes.filter((athlete) => {
            const createdAt = athlete.created_at || athlete.data?.created_at;
            if (!createdAt) {
              return false;
            }

            const createdDate = new Date(createdAt);
            return createdDate >= monthDate && createdDate < nextMonthDate;
          }).length;

          return {
            label: monthDate.toLocaleDateString("it-IT", {
              month: "short",
            }),
            value: count,
          };
        });
        const categoryBreakdownMap = new Map<string, number>();
        athletes.forEach((athlete) => {
          const categoryName =
            String(
              athlete.data?.categoryName ||
                athlete.data?.category ||
                athlete.category ||
                "Senza categoria",
            ).trim() || "Senza categoria";
          categoryBreakdownMap.set(
            categoryName,
            (categoryBreakdownMap.get(categoryName) || 0) + 1,
          );
        });
        const categoryBreakdown = Array.from(categoryBreakdownMap.entries())
          .map(([label, value]) => ({ label, value }))
          .sort((left, right) => right.value - left.value);
        const athletesList = athletes.slice(0, 20).map((athlete) => ({
          firstName: athlete.first_name || "N/A",
          lastName: athlete.last_name || "N/A",
          category: athlete.data?.category || "N/A",
          status:
            athlete.data?.status === "active" || !athlete.data?.status
              ? "Attivo"
              : athlete.data?.status === "suspended"
                ? "Sospeso"
                : "Inattivo",
        }));

        return {
          totalAthletes: athletes.length,
          activeAthletes,
          categories: uniqueCategories,
          athletesList,
          monthlyAthleteTrend,
          categoryBreakdown,
        };

      case "certificates":
        const today = new Date();
        const thirtyDaysFromNow = new Date(
          today.getTime() + 30 * 24 * 60 * 60 * 1000,
        );

        const athletesWithCerts = athletes.filter(
          (a) => a.data?.medicalCertExpiry,
        );
        const athletesWithoutCerts = athletes.filter(
          (a) => !a.data?.medicalCertExpiry,
        );

        const expiringCerts = athletesWithCerts.filter((a) => {
          const expiryDate = new Date(a.data.medicalCertExpiry);
          return expiryDate > today && expiryDate <= thirtyDaysFromNow;
        });

        const expiredCerts = athletesWithCerts.filter((a) => {
          const expiryDate = new Date(a.data.medicalCertExpiry);
          return expiryDate <= today;
        });

        const expiringCertificatesList = expiringCerts.map((athlete) => {
          const expiryDate = new Date(athlete.data.medicalCertExpiry);
          const daysRemaining = Math.ceil(
            (expiryDate - today) / (1000 * 60 * 60 * 24),
          );
          return {
            athlete: `${athlete.first_name} ${athlete.last_name}`,
            category: athlete.data?.category || "N/A",
            expiryDate: expiryDate.toLocaleDateString("it-IT"),
            daysRemaining,
          };
        });

        return {
          totalCertificates: athletesWithCerts.length,
          expiringCertificates: expiringCerts.length,
          expiredCertificates:
            expiredCerts.length + athletesWithoutCerts.length,
          expiringCertificatesList,
        };

      default:
        return {};
    }
  };

  const loadClubData = async () => {
    try {
      setLoading(true);

      // Get active club from localStorage
      const activeClub = localStorage.getItem("activeClub");
      if (!activeClub) {
        console.warn("No active club found in localStorage");
        setLoading(false);
        return;
      }

      const club = JSON.parse(activeClub);
      const clubId = club.id;

      console.log("Loading data for club:", clubId);

      // Fetch club data
      const [clubInfo, athletesData, trainingsData, staffData, categoriesData] =
        await Promise.all([
          getClub(clubId),
          getClubAthletes(clubId),
          getClubData(clubId, "trainings"),
          getClubStaff(clubId),
          getClubData(clubId, "categories"),
        ]);

      console.log("Loaded club data:", {
        clubInfo,
        athletesCount: athletesData?.length || 0,
        trainingsCount: trainingsData?.length || 0,
        staffCount: staffData?.length || 0,
        categoriesCount: categoriesData?.length || 0,
      });

      setClubData(clubInfo);
      setAthletes(athletesData || []);
      setTrainings(trainingsData || []);
      setStaff(staffData || []);

      // Generate AI recommendations based on real data
      generateAIRecommendations(
        clubInfo,
        athletesData || [],
        trainingsData || [],
        staffData || [],
        categoriesData || [],
      );

      // Calculate performance metrics based on real data
      calculatePerformanceMetrics(
        athletesData || [],
        trainingsData || [],
        staffData || [],
      );
    } catch (error) {
      console.error("Error loading club data:", error);
      showToast("error", "Errore nel caricamento dei dati del club");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Report" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-9xl space-y-6">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Report
                </h1>
                <p className="text-gray-600 mt-2">
                  Esporta e visualizza i report di presenze, atleti e
                  certificati.
                </p>
              </div>
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">
                    Caricamento dati del club...
                  </p>
                </div>
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
        <Header title="Report" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Report
              </h1>
              <p className="text-gray-600 mt-2">
                Esporta e visualizza i report di presenze, atleti e certificati.
              </p>
            </div>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle>
                    Genera Report - {clubData?.name || "Club"}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 mr-2"
                      onClick={handlePrint}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Stampa
                    </Button>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={handleExport}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Esporta CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview" onValueChange={setActiveTab}>
                  <TabsList className="grid grid-cols-1 md:grid-cols-5 w-full">
                    <TabsTrigger
                      value="overview"
                      className="flex items-center gap-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      Panoramica
                    </TabsTrigger>
                    <TabsTrigger
                      value="attendance"
                      className="flex items-center gap-2"
                    >
                      <Calendar className="h-4 w-4" />
                      Allenamenti
                    </TabsTrigger>
                    <TabsTrigger
                      value="athletes"
                      className="flex items-center gap-2"
                    >
                      <Users className="h-4 w-4" />
                      Atleti
                    </TabsTrigger>
                    <TabsTrigger
                      value="certificates"
                      className="flex items-center gap-2"
                    >
                      <FileHeart className="h-4 w-4" />
                      Certificati
                    </TabsTrigger>
                    <TabsTrigger
                      value="ai-insights"
                      className="flex items-center gap-2"
                    >
                      <Lightbulb className="h-4 w-4" />
                      AI Insights
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="pt-6">
                    <OverviewReport
                      data={{
                        attendance: getReportData("attendance"),
                        athletes: getReportData("athletes"),
                        certificates: getReportData("certificates"),
                        performance: performanceMetrics,
                      }}
                    />
                  </TabsContent>
                  <TabsContent value="attendance" className="pt-6">
                    <AttendanceReport data={getReportData("attendance")} />
                  </TabsContent>
                  <TabsContent value="athletes" className="pt-6">
                    <AthletesReport data={getReportData("athletes")} />
                  </TabsContent>
                  <TabsContent value="certificates" className="pt-6">
                    <CertificatesReport data={getReportData("certificates")} />
                  </TabsContent>
                  <TabsContent value="ai-insights" className="pt-6">
                    <AIInsightsReport
                      recommendations={aiRecommendations}
                      metrics={performanceMetrics}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

function OverviewReport({ data }) {
  return (
    <div className="space-y-6">
      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-blue-100 p-3 mb-4">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.performance.efficiency?.value || 0}%
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {data.performance.efficiency?.description || "Efficienza"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-green-100 p-3 mb-4">
              <Target className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.performance.engagement?.value || 0}%
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {data.performance.engagement?.description || "Coinvolgimento"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-purple-100 p-3 mb-4">
              {data.performance.athleteTrend?.positive ? (
                <TrendingUp className="h-6 w-6 text-green-600" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-600" />
              )}
            </div>
            <CardTitle className="text-xl font-bold">
              {data.performance.athleteTrend?.positive ? "+" : "-"}
              {data.performance.athleteTrend?.value || 0}%
            </CardTitle>
            <p className="text-sm text-muted-foreground">Trend Atleti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-orange-100 p-3 mb-4">
              {data.performance.trainingTrend?.positive ? (
                <TrendingUp className="h-6 w-6 text-green-600" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-600" />
              )}
            </div>
            <CardTitle className="text-xl font-bold">
              {data.performance.trainingTrend?.positive ? "+" : "-"}
              {data.performance.trainingTrend?.value || 0}%
            </CardTitle>
            <p className="text-sm text-muted-foreground">Trend Allenamenti</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Atleti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {data.athletes.totalAthletes}
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              {data.athletes.activeAthletes} attivi • {data.athletes.categories}{" "}
              categorie
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{
                  width: `${(data.athletes.activeAthletes / Math.max(data.athletes.totalAthletes, 1)) * 100}%`,
                }}
              ></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Allenamenti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {data.attendance.totalTrainings}
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              {data.attendance.concludedTrainings} conclusi •{" "}
              {data.attendance.activeStaff} staff
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{
                  width: `${(data.attendance.concludedTrainings / Math.max(data.attendance.totalTrainings, 1)) * 100}%`,
                }}
              ></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileHeart className="h-5 w-5" />
              Certificati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {data.certificates.totalCertificates}
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              {data.certificates.expiringCertificates} in scadenza •{" "}
              {data.certificates.expiredCertificates} scaduti
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-red-600 h-2 rounded-full"
                style={{
                  width: `${((data.certificates.expiringCertificates + data.certificates.expiredCertificates) / Math.max(data.certificates.totalCertificates, 1)) * 100}%`,
                }}
              ></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Andamento Mensile Atleti</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(data.athletes.monthlyAthleteTrend) &&
            data.athletes.monthlyAthleteTrend.length > 0 ? (
              <div className="h-64 rounded-lg bg-slate-50 p-4">
                <div className="flex h-full items-end justify-between gap-3">
                  {data.athletes.monthlyAthleteTrend.map((entry, index) => {
                    const maxValue = Math.max(
                      ...data.athletes.monthlyAthleteTrend.map(
                        (item) => item.value,
                      ),
                      1,
                    );

                    return (
                      <div
                        key={`${entry.label}-${index}`}
                        className="flex flex-1 flex-col items-center gap-2"
                      >
                        <span className="text-xs font-medium text-slate-500">
                          {entry.value}
                        </span>
                        <div className="flex w-full flex-1 items-end rounded-full bg-white/80 px-1 py-2">
                          <div
                            className="w-full rounded-full bg-gradient-to-t from-blue-600 to-cyan-400"
                            style={{
                              height: `${Math.max((entry.value / maxValue) * 100, entry.value > 0 ? 12 : 4)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium uppercase text-slate-600">
                          {entry.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Nessun dato storico disponibile</p>
                  <p className="text-sm text-gray-400">
                    Il grafico si popolerà appena iniziano le registrazioni.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuzione per Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(data.athletes.categoryBreakdown) &&
            data.athletes.categoryBreakdown.length > 0 ? (
              <div className="space-y-4 rounded-lg bg-slate-50 p-4">
                {data.athletes.categoryBreakdown.map((entry, index) => {
                  const totalAthletes = Math.max(data.athletes.totalAthletes, 1);
                  const percentage = Math.round((entry.value / totalAthletes) * 100);
                  const colors = [
                    "from-blue-600 to-cyan-400",
                    "from-emerald-600 to-lime-400",
                    "from-fuchsia-600 to-pink-400",
                    "from-amber-500 to-orange-400",
                    "from-violet-600 to-indigo-400",
                  ];

                  return (
                    <div key={`${entry.label}-${index}`} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-700">
                          {entry.label}
                        </span>
                        <span className="text-slate-500">
                          {entry.value} atleti • {percentage}%
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-white">
                        <div
                          className={`h-3 rounded-full bg-gradient-to-r ${colors[index % colors.length]}`}
                          style={{ width: `${Math.max(percentage, 6)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Nessuna categoria disponibile</p>
                  <p className="text-sm text-gray-400">
                    Le categorie appariranno qui appena gli atleti vengono
                    associati.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AIInsightsReport({ recommendations, metrics }) {
  const getPriorityColor = (priority) => {
    switch (priority) {
      case "critical":
        return "border-red-500 bg-red-50";
      case "high":
        return "border-orange-500 bg-orange-50";
      case "medium":
        return "border-yellow-500 bg-yellow-50";
      case "low":
        return "border-green-500 bg-green-50";
      default:
        return "border-blue-500 bg-blue-50";
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "error":
        return "text-red-600";
      case "warning":
        return "text-orange-600";
      case "info":
        return "text-blue-600";
      case "success":
        return "text-green-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Performance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-600" />
            Analisi AI delle Prestazioni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Punti di Forza</h4>
              <div className="space-y-2">
                {recommendations.filter((r) => r.type === "success").length >
                0 ? (
                  recommendations
                    .filter((r) => r.type === "success")
                    .map((rec, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 text-green-600"
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">{rec.title}</span>
                      </div>
                    ))
                ) : (
                  <div className="text-sm text-gray-500">
                    Continua a lavorare per migliorare le prestazioni
                  </div>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Aree di Miglioramento</h4>
              <div className="space-y-2">
                {recommendations
                  .filter((r) => r.type !== "success")
                  .slice(0, 3)
                  .map((rec, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 ${getTypeColor(rec.type)}`}
                    >
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">{rec.title}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-600" />
            Raccomandazioni AI Dettagliate
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recommendations.length > 0 ? (
            <div className="space-y-4">
              {recommendations.map((recommendation, index) => (
                <div
                  key={index}
                  className={`border-l-4 p-4 rounded-r-lg ${getPriorityColor(recommendation.priority)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={getTypeColor(recommendation.type)}>
                      {recommendation.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">
                          {recommendation.title}
                        </h4>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            recommendation.priority === "critical"
                              ? "bg-red-100 text-red-800"
                              : recommendation.priority === "high"
                                ? "bg-orange-100 text-orange-800"
                                : recommendation.priority === "medium"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-green-100 text-green-800"
                          }`}
                        >
                          {recommendation.priority === "critical"
                            ? "Critico"
                            : recommendation.priority === "high"
                              ? "Alto"
                              : recommendation.priority === "medium"
                                ? "Medio"
                                : "Basso"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {recommendation.description}
                      </p>
                      <div className="text-xs text-gray-500">
                        Categoria: {recommendation.category}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Lightbulb className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                Nessuna raccomandazione disponibile al momento
              </p>
              <p className="text-sm text-gray-400">
                L'AI analizzerà i dati quando saranno disponibili più
                informazioni
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            Azioni Prioritarie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recommendations
              .filter((r) => r.priority === "critical" || r.priority === "high")
              .slice(0, 5)
              .map((rec, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        rec.priority === "critical"
                          ? "bg-red-500"
                          : "bg-orange-500"
                      }`}
                    ></div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{rec.title}</p>
                    <p className="text-xs text-gray-500">{rec.category}</p>
                  </div>
                  <Button size="sm" variant="outline">
                    Azione
                  </Button>
                </div>
              ))}
            {recommendations.filter(
              (r) => r.priority === "critical" || r.priority === "high",
            ).length === 0 && (
              <div className="text-center py-4">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-green-600 font-medium">Ottimo lavoro!</p>
                <p className="text-sm text-gray-500">
                  Non ci sono azioni prioritarie al momento
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceReport({ data }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-blue-100 p-3 mb-4">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.totalTrainings}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Allenamenti Totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-green-100 p-3 mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.concludedTrainings}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Allenamenti Conclusi
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-amber-100 p-3 mb-4">
              <Users className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.activeStaff}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Staff Attivo</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allenamenti Recenti</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentTrainings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Data</th>
                    <th className="text-left py-3 px-4 font-medium">
                      Categoria
                    </th>
                    <th className="text-left py-3 px-4 font-medium">Stato</th>
                    <th className="text-left py-3 px-4 font-medium">Orario</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTrainings.map((training, index) => (
                    <tr
                      key={index}
                      className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="py-3 px-4">{training.date}</td>
                      <td className="py-3 px-4">{training.category}</td>
                      <td className="py-3 px-4">{training.status}</td>
                      <td className="py-3 px-4">{training.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                Nessun allenamento trovato
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AthletesReport({ data }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-blue-100 p-3 mb-4">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.totalAthletes}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Atleti Totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-green-100 p-3 mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.activeAthletes}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Atleti Attivi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-amber-100 p-3 mb-4">
              <Trophy className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.categories}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Categorie Attive</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista Atleti</CardTitle>
        </CardHeader>
        <CardContent>
          {data.athletesList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Nome</th>
                    <th className="text-left py-3 px-4 font-medium">Cognome</th>
                    <th className="text-left py-3 px-4 font-medium">
                      Categoria
                    </th>
                    <th className="text-left py-3 px-4 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {data.athletesList.map((athlete, index) => (
                    <tr
                      key={index}
                      className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="py-3 px-4">{athlete.firstName}</td>
                      <td className="py-3 px-4">{athlete.lastName}</td>
                      <td className="py-3 px-4">{athlete.category}</td>
                      <td className="py-3 px-4">{athlete.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                Nessun atleta trovato
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CertificatesReport({ data }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-blue-100 p-3 mb-4">
              <FileHeart className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.totalCertificates}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Certificati Totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-amber-100 p-3 mb-4">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.expiringCertificates}
            </CardTitle>
            <p className="text-sm text-muted-foreground">In Scadenza</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-red-100 p-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-xl font-bold">
              {data.expiredCertificates}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Scaduti</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Certificati in Scadenza (Prossimi 30 giorni)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.expiringCertificatesList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Atleta</th>
                    <th className="text-left py-3 px-4 font-medium">
                      Categoria
                    </th>
                    <th className="text-left py-3 px-4 font-medium">
                      Data Scadenza
                    </th>
                    <th className="text-left py-3 px-4 font-medium">
                      Giorni Rimanenti
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.expiringCertificatesList.map((cert, index) => (
                    <tr
                      key={index}
                      className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="py-3 px-4">{cert.athlete}</td>
                      <td className="py-3 px-4">{cert.category}</td>
                      <td className="py-3 px-4">{cert.expiryDate}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            cert.daysRemaining <= 7
                              ? "bg-red-100 text-red-800"
                              : cert.daysRemaining <= 15
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {cert.daysRemaining} giorni
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                Nessun certificato in scadenza nei prossimi 30 giorni
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
