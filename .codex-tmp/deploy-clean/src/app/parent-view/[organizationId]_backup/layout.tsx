"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";

export default function OrganizationViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params?.organizationId as string;
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [organizationData, setOrganizationData] = useState<any>(null);

  useEffect(() => {
    if (!organizationId || !user?.id) return;

    const loadData = async () => {
      try {
        setLoading(true);
        console.log(
          `Loading organization data for organization ${organizationId}`,
        );

        // Load organization data
        const { data: organization, error: organizationError } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", organizationId)
          .single();

        if (organizationError) {
          console.error("Error loading organization:", organizationError);
          showToast("error", "Errore nel caricamento dell'organizzazione");
          return;
        }

        if (!organization) {
          console.error("Organization not found");
          showToast("error", "Organizzazione non trovata");
          return;
        }

        setOrganizationData(organization);
        console.log(`Organization data loaded:`, organization);
      } catch (err) {
        console.error("Error loading data:", err);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [organizationId, user, showToast]);

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

  if (!organizationData) {
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
