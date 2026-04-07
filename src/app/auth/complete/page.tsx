"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/api/client";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

type OrganizationMembership = {
  organization_id: string;
  role: string;
  is_primary?: boolean;
  organizations?: {
    name?: string | null;
    logo_url?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    settings?: Record<string, any> | null;
  } | null;
};

const getRoleLabel = (role: string) => {
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

export default function AuthCompletePage() {
  const [message, setMessage] = useState("Verifica sessione in corso...");

  useEffect(() => {
    let active = true;

    const completeAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (!session?.user) {
        window.location.replace("/login");
        return;
      }

      const user = session.user;
      const role = String(user.user_metadata?.role || "user");

      const membershipsResponse = await apiRequest<OrganizationMembership[]>(
        "/api/v1/auth/memberships",
      );

      const memberships = Array.isArray(membershipsResponse.data)
        ? (membershipsResponse.data as OrganizationMembership[])
        : [];

      const primaryMembership =
        memberships.find((membership) => membership.is_primary) ||
        memberships.find((membership) => membership.role === "owner") ||
        memberships[0] ||
        null;

      if (primaryMembership) {
        const seasonState = normalizeClubSeasons(
          primaryMembership.organizations?.settings || {},
        );
        const activeClub = {
          id: primaryMembership.organization_id,
          role: primaryMembership.role,
          roleLabel: getRoleLabel(primaryMembership.role),
          name: primaryMembership.organizations?.name || "Club",
          logo_url: primaryMembership.organizations?.logo_url || null,
          email: primaryMembership.organizations?.contact_email || null,
          phone: primaryMembership.organizations?.contact_phone || null,
          activeSeasonId: seasonState.activeSeasonId,
          activeSeasonLabel: seasonState.activeSeason?.label || null,
        };

        window.localStorage.setItem("activeClub", JSON.stringify(activeClub));
        window.localStorage.setItem(
          `activeClub_${user.id}`,
          JSON.stringify(activeClub),
        );
      }

      if (user.user_metadata?.isClubCreator || role === "club_creator") {
        setMessage("Accesso confermato. Apertura home account...");
        window.location.replace("/account?openCreateClub=1");
        return;
      }

      setMessage("Accesso confermato. Apertura home account...");
      window.location.replace("/account");
    };

    completeAccess();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_40%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <Card className="w-full max-w-xl border-white/70 bg-white/90 shadow-2xl backdrop-blur">
          <CardContent className="space-y-4 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-900">
                Accesso confermato
              </h1>
              <p className="text-sm text-slate-600">{message}</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reindirizzamento in corso...
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
