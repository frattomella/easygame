import { redirect } from "next/navigation";

export default function LegacyTrainerDashboardPage() {
  redirect("/trainer-dashboard");
}
/*
"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function TrainerDashboardPage() {
  const params = useParams<{ dashboardId: string }>();
  const searchParams = useSearchParams();
  const dashboardId = params?.dashboardId as string;
  const organizationId = searchParams?.get("organizationId");
  const { user, activeClub, setActiveClub } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [clubData, setClubData] = useState<any>(null);

  useEffect(() => {
    if (!dashboardId || !user?.id) return;

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        console.log(
          `Loading trainer dashboard data for dashboard ${dashboardId}`,
        );

        // Load dashboard data
        const { data: dashboard, error: dashboardError } = await supabase
          .from("dashboards")
          .select("*")
          .eq("id", dashboardId)
          .single();

        if (dashboardError) {
          console.error("Error loading dashboard:", dashboardError);
          showToast("error", "Errore nel caricamento della dashboard");
          return;
        }

        if (!dashboard) {
          console.error("Dashboard not found");
          showToast("error", "Dashboard non trovata");
          return;
        }

        setDashboardData(dashboard);
        console.log(`Dashboard data loaded:`, dashboard);

        // Load club data
        const orgId = organizationId || dashboard.organization_id;
        if (orgId) {
          const { data: club, error: clubError } = await supabase
            .from("organizations")
            .select("*")
            .eq("id", orgId)
            .single();

          if (clubError) {
            console.error("Error loading club:", clubError);
          } else if (club) {
            setClubData(club);
            console.log(`Club data loaded:`, club);

            // Check if user has access to this club
            const { data: access, error: accessError } = await supabase
              .from("organization_users")
              .select("role")
              .eq("organization_id", orgId)
              .eq("user_id", user.id)
              .single();

            if (accessError) {
              console.error("Error checking club access:", accessError);
            } else if (access) {
              // Update active club in context
              const clubWithRole = {
                id: club.id,
                name: club.name,
                role: access.role,
                roleLabel: getRoleLabel(access.role),
              };
              setActiveClub(clubWithRole);

              // Store in localStorage
              localStorage.setItem(
                `activeClub_${user.id}`,
                JSON.stringify(clubWithRole),
              );
              localStorage.setItem("activeClub", JSON.stringify(clubWithRole)); // For backward compatibility
            }
          }
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [dashboardId, organizationId, user, showToast, setActiveClub]);

  // Helper function to get role label
  const getRoleLabel = (role: string): string => {
    switch (role) {
      case "owner":
        return "Gestore";
      case "admin":
        return "Amministratore";
      case "trainer":
        return "Allenatore";
      case "athlete":
        return "Atleta";
      case "parent":
        return "Genitore";
      default:
        return "Utente";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto space-y-8 text-center">
          <div className="animate-pulse">
            <h2 className="text-2xl font-bold">
              Caricamento dashboard allenatore...
            </h2>
            <p className="mt-2">Attendere prego</p>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto space-y-8 text-center">
          <h2 className="text-2xl font-bold text-red-600">
            Dashboard non trovata
          </h2>
          <p className="mt-2">
            La dashboard richiesta non esiste o non hai i permessi per
            accedervi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <AppBackButton fallbackHref="/account" />
            <h1 className="text-xl font-semibold text-gray-900">
              Dashboard Allenatore - {clubData?.name || "Club"}
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {/* User profile or other header elements * /}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Informazioni Club</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Nome</p>
              <p className="font-medium">{clubData?.name || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Ruolo</p>
              <p className="font-medium">
                {activeClub?.roleLabel || "Allenatore"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Dashboard widgets would go here * /}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium mb-4">I miei Atleti</h3>
            <div className="text-3xl font-bold text-blue-600">0</div>
            <p className="text-sm text-gray-500 mt-2">Atleti assegnati</p>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium mb-4">Allenamenti</h3>
            <div className="text-3xl font-bold text-green-600">0</div>
            <p className="text-sm text-gray-500 mt-2">
              Allenamenti programmati
            </p>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium mb-4">Presenze</h3>
            <div className="text-3xl font-bold text-yellow-600">0%</div>
            <p className="text-sm text-gray-500 mt-2">Media presenze</p>
          </div>
        </div>
      </main>
    </div>
  );
}
*/
