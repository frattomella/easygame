"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MetricsOverview from "@/components/dashboard/MetricsOverview";
import RecentActivity from "@/components/dashboard/RecentActivity";
import UpcomingTrainings from "@/components/dashboard/UpcomingTrainings";
import CertificationAlerts from "@/components/dashboard/CertificationAlerts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { getClubData } from "@/lib/simplified-db";
import {
  Calendar,
  Clock,
  Trophy,
  MapPin,
  Users,
  Bell,
  FileText,
} from "lucide-react";

interface ClubInfo {
  id: string;
  name: string;
  logo_url?: string;
}

interface Appointment {
  id: string;
  title: string;
  date: Date;
  time: string;
  description?: string;
  person?: string;
  athlete?: string;
}

interface Note {
  id: string;
  content: string;
  date: Date;
  expiryDate?: Date;
  notificationEnabled?: boolean;
}

interface Match {
  id: string;
  title: string;
  date: Date;
  time: string;
  opponent: string;
  location: string;
  category: string;
  categoryColor?: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubInfo, setClubInfo] = useState<ClubInfo | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [todayNotes, setTodayNotes] = useState<Note[]>([]);
  const [todayMatches, setTodayMatches] = useState<Match[]>([]);

  useEffect(() => {
    // Get club ID from URL query parameter or active organization
    const getClubId = async () => {
      try {
        // First check URL query parameter - check both clubId and organizationId
        const searchParams = new URLSearchParams(window.location.search);
        const urlClubId =
          searchParams?.get("clubId") || searchParams?.get("organizationId");

        if (urlClubId) {
          setClubId(urlClubId);
          await fetchClubInfo(urlClubId);
          setIsLoading(false);
          return;
        }

        // Then check localStorage for active club
        const activeClub = localStorage.getItem("activeClub");
        if (activeClub) {
          try {
            const parsedClub = JSON.parse(activeClub);
            if (parsedClub.id) {
              setClubId(parsedClub.id);
              await fetchClubInfo(parsedClub.id);
              setIsLoading(false);
              return;
            }
          } catch (e) {
            console.error("Error parsing active club:", e);
          }
        }

        // If no club found, set loading to false
        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching club ID:", error);
        setIsLoading(false);
      }
    };

    const fetchClubInfo = async (organizationId: string) => {
      try {
        // Try organizations table first (new structure)
        let { data: organization } = await supabase
          .from("organizations")
          .select("id, name, logo_url")
          .eq("id", organizationId)
          .single();

        // If not found in organizations, try clubs table (legacy structure)
        if (!organization) {
          const { data: club } = await supabase
            .from("clubs")
            .select("id, name, logo_url")
            .eq("id", organizationId)
            .single();

          if (club) {
            organization = {
              id: club.id,
              name: club.name,
              logo_url: club.logo_url,
            };
          }
        }

        if (organization) {
          const clubData = {
            id: organization.id,
            name: organization.name,
            logo_url: organization.logo_url || undefined,
          };

          setClubInfo(clubData);

          // Update localStorage with club info
          localStorage.setItem("activeClub", JSON.stringify(clubData));
          localStorage.setItem("organization-name", organization.name);

          // Dispatch custom event to notify other components
          if (typeof window !== "undefined") {
            const event = new CustomEvent("club-updated", {
              detail: { clubData },
            });
            window.dispatchEvent(event);
          }

          // Load today's appointments, notes and matches
          await loadTodayData(organization.id);
        }
      } catch (error) {
        console.error("Error fetching club info:", error);
      }
    };

    const loadTodayData = async (orgId: string) => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Load appointments
        const appointmentsData = await getClubData(orgId, "appointments");
        if (Array.isArray(appointmentsData)) {
          const todayApps = appointmentsData
            .filter((app: any) => {
              const appDate = new Date(app.date);
              appDate.setHours(0, 0, 0, 0);
              return appDate.getTime() === today.getTime();
            })
            .map((app: any) => ({
              ...app,
              date: new Date(app.date),
            }));
          setTodayAppointments(todayApps);
        }

        // Load notes/reminders
        const notesData = await getClubData(orgId, "secretariat_notes");
        if (Array.isArray(notesData)) {
          const activeNotes = notesData
            .filter((note: any) => {
              if (!note.expiryDate) return true;
              const expiryDate = new Date(note.expiryDate);
              return expiryDate >= today;
            })
            .map((note: any) => ({
              ...note,
              date: new Date(note.date),
              expiryDate: note.expiryDate
                ? new Date(note.expiryDate)
                : undefined,
            }));
          setTodayNotes(activeNotes);
        }

        // Load matches
        const matchesData = await getClubData(orgId, "matches");
        if (Array.isArray(matchesData)) {
          const todayMatchesList = matchesData
            .filter((match: any) => {
              const matchDate = new Date(match.date);
              matchDate.setHours(0, 0, 0, 0);
              return matchDate.getTime() === today.getTime();
            })
            .map((match: any) => ({
              ...match,
              date: new Date(match.date),
            }));
          setTodayMatches(todayMatchesList);
        }
      } catch (error) {
        console.warn("Error loading today's data:", error);
      }
    };

    getClubId();
  }, [router]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-9xl mx-auto w-full bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 min-h-screen">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          {clubInfo
            ? `Benvenuto nella dashboard di ${clubInfo.name}`
            : "Benvenuto nella dashboard di gestione del tuo club sportivo."}
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-6">
          <MetricsOverview
            isLoading={isLoading}
            organizationId={clubId}
            showEmptyState={false}
          />

          {/* Today's Appointments and Matches Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Today's Appointments */}
            <Card className="bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg border-0">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Appuntamenti di Oggi
                </CardTitle>
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white hover:bg-white/30"
                >
                  {todayAppointments.length}
                </Badge>
              </CardHeader>
              <CardContent>
                {todayAppointments.length > 0 ? (
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {todayAppointments.slice(0, 5).map((app) => (
                      <div
                        key={app.id}
                        className="p-3 bg-white/10 rounded-lg backdrop-blur-sm"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{app.title}</p>
                            <p className="text-sm text-white/80 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {app.time}
                            </p>
                          </div>
                          {app.person && (
                            <Badge
                              variant="secondary"
                              className="bg-white/20 text-white text-xs"
                            >
                              {app.person}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-white/70">
                    <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>Nessun appuntamento per oggi</p>
                  </div>
                )}
                <Button
                  variant="secondary"
                  className="w-full mt-4 bg-white/20 hover:bg-white/30 text-white border-0"
                  onClick={() => router.push("/secretariat")}
                >
                  Vai alla Segreteria
                </Button>
              </CardContent>
            </Card>

            {/* Today's Matches */}
            <Card className="bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-lg border-0">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Gare di Oggi
                </CardTitle>
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white hover:bg-white/30"
                >
                  {todayMatches.length}
                </Badge>
              </CardHeader>
              <CardContent>
                {todayMatches.length > 0 ? (
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {todayMatches.slice(0, 5).map((match) => (
                      <div
                        key={match.id}
                        className="p-3 bg-white/10 rounded-lg backdrop-blur-sm"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{match.title}</p>
                            <p className="text-sm text-white/80 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {match.time}
                            </p>
                            <p className="text-sm text-white/80 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {match.location}
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            className="bg-white/20 text-white text-xs"
                          >
                            {match.category}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-white/70">
                    <Trophy className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>Nessuna gara per oggi</p>
                  </div>
                )}
                <Button
                  variant="secondary"
                  className="w-full mt-4 bg-white/20 hover:bg-white/30 text-white border-0"
                  onClick={() => router.push("/matches")}
                >
                  Vai alle Gare
                </Button>
              </CardContent>
            </Card>

            {/* Notes and Reminders */}
            <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg border-0">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Promemoria Attivi
                </CardTitle>
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white hover:bg-white/30"
                >
                  {todayNotes.length}
                </Badge>
              </CardHeader>
              <CardContent>
                {todayNotes.length > 0 ? (
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {todayNotes.slice(0, 5).map((note) => (
                      <div
                        key={note.id}
                        className="p-3 bg-white/10 rounded-lg backdrop-blur-sm"
                      >
                        <p className="font-medium line-clamp-2">
                          {note.content}
                        </p>
                        {note.expiryDate && (
                          <p className="text-sm text-white/80 flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            Scade: {note.expiryDate.toLocaleDateString("it-IT")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-white/70">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>Nessun promemoria attivo</p>
                  </div>
                )}
                <Button
                  variant="secondary"
                  className="w-full mt-4 bg-white/20 hover:bg-white/30 text-white border-0"
                  onClick={() => router.push("/secretariat")}
                >
                  Gestisci Promemoria
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
            <RecentActivity
              isLoading={isLoading}
              activities={[]}
              organizationId={clubId}
              showEmptyState={false}
            />
            <UpcomingTrainings
              isLoading={isLoading}
              trainings={[]}
              organizationId={clubId}
              showEmptyState={false}
            />
          </div>

          <CertificationAlerts
            isLoading={isLoading}
            alerts={[]}
            organizationId={clubId}
            showEmptyState={false}
          />
        </div>
      </div>
    </div>
  );
}
