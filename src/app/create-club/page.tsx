export { default } from "@/components/account/create-club-redirect";
/*
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export default function CreateClubPage() {
  const router = useRouter();
  const [clubName, setClubName] = useState("Mio Club");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    router.replace("/account?openCreateClub=1");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-sm text-slate-600">
        Reindirizzamento alla gestione account e club...
      </div>
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setLoading(true);
    setError("");

    try {
      // Create a new club
      const { data: newClub, error: newClubError } = await supabase
        .from("clubs")
        .insert([
          {
            name: clubName,
            created_at: new Date().toISOString(),
            creator_id: userId,
            members: [
              {
                user_id: userId,
                role: "club_creator",
                is_primary: true,
                created_at: new Date().toISOString(),
              },
            ],
            dashboard_data: {
              settings: {
                theme: "default",
                layout: "standard",
                widgets: [
                  "metrics",
                  "activities",
                  "trainings",
                  "certifications",
                ],
              },
            },
          },
        ])
        .select();

      if (newClubError) {
        console.error("Error creating club:", newClubError);
        setError("Errore durante la creazione del club. Riprova più tardi.");
        setLoading(false);
        return;
      }

      if (newClub && newClub[0]) {
        // Create a dashboard for backward compatibility
        const { data: newDashboard, error: dashboardError } = await supabase
          .from("dashboards")
          .insert([
            {
              organization_id: newClub[0].id,
              created_at: new Date().toISOString(),
              creator_id: userId,
              slug: `dashboard-${newClub[0].id}`,
              settings: JSON.stringify({
                theme: "default",
                layout: "standard",
                widgets: [
                  "metrics",
                  "activities",
                  "trainings",
                  "certifications",
                ],
              }),
            },
          ])
          .select();

        // Create club object for localStorage
        const clubData = {
          id: newClub[0].id,
          name: clubName,
          role: "club_creator",
          roleLabel: "Creatore",
          color: "#3b82f6",
          addedAt: newClub[0].created_at,
          logo_url: null,
        };

        // Store the active club in localStorage
        localStorage.setItem(`activeClub_${userId}`, JSON.stringify(clubData));
        localStorage.setItem("activeClub", JSON.stringify(clubData));

        // Add to userClubs in localStorage
        const storedClubs = localStorage.getItem(`userClubs_${userId}`);
        let updatedClubs = [clubData];
        if (storedClubs) {
          try {
            const parsedClubs = JSON.parse(storedClubs);
            updatedClubs = [...parsedClubs, clubData];
          } catch (e) {
            console.error("Error parsing stored clubs:", e);
          }
        }
        localStorage.setItem(
          `userClubs_${userId}`,
          JSON.stringify(updatedClubs),
        );

        // Update user's club_access in the users table
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("club_access")
          .eq("id", userId)
          .single();

        const clubAccess = userData?.club_access || [];
        clubAccess.push({
          club_id: newClub[0].id,
          role: "club_creator",
          is_primary: true,
        });

        await supabase
          .from("users")
          .update({ club_access: clubAccess })
          .eq("id", userId);

        // Redirect to dashboard
        let redirectPath = `/dashboard?clubId=${newClub[0].id}`;
        if (dashboardError) {
          console.error("Error creating dashboard:", dashboardError);
        } else if (newDashboard && newDashboard[0]) {
          redirectPath = `/dashboard/${newDashboard[0].id}?clubId=${newClub[0].id}`;
        }

        router.push(redirectPath);
      }
    } catch (err) {
      console.error("Error creating club:", err);
      setError("Si è verificato un errore durante la creazione del club.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-cyan-400 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-6">
          <img
            src="https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png"
            alt="EasyGame Logo"
            className="h-16 w-auto mb-2"
          />
          <h1 className="text-2xl font-bold">Crea Nuovo Club</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="club-name">Nome del Club</Label>
            <Input
              id="club-name"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="Inserisci il nome del club"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => router.back()}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? "Creazione in corso..." : "Crea Club"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
*/
