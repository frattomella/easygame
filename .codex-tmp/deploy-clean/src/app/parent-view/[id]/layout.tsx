"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";

export default function ParentViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [athleteData, setAthleteData] = useState<any>(null);

  useEffect(() => {
    if (!id || !user?.id) return;

    const loadData = async () => {
      try {
        setLoading(true);
        console.log(`Loading athlete data for athlete ${id}`);

        // Load athlete data
        const { data: athlete, error: athleteError } = await supabase
          .from("athletes")
          .select("*")
          .eq("id", id)
          .single();

        if (athleteError) {
          console.error("Error loading athlete:", athleteError);
          showToast("error", "Errore nel caricamento dell'atleta");
          return;
        }

        if (!athlete) {
          console.error("Athlete not found");
          showToast("error", "Atleta non trovato");
          return;
        }

        setAthleteData(athlete);
        console.log(`Athlete data loaded:`, athlete);
      } catch (err) {
        console.error("Error loading data:", err);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, user, showToast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto space-y-8 text-center">
          <div className="animate-pulse">
            <h2 className="text-2xl font-bold">Caricamento dati...</h2>
            <p className="mt-2">Attendere prego</p>
          </div>
        </div>
      </div>
    );
  }

  if (!athleteData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto space-y-8 text-center">
          <h2 className="text-2xl font-bold text-red-600">Dati non trovati</h2>
          <p className="mt-2">
            I dati richiesti non esistono o non hai i permessi per accedervi.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
