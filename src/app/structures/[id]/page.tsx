"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { StructureDetailPage } from "@/components/structures/StructureDetailPage";
import {
  findStructureById,
  normalizeStructure,
  type ClubStructure,
} from "@/lib/structures-utils";

const readStoredClubId = (userId?: string | null) => {
  if (typeof window === "undefined") return null;

  try {
    if (userId) {
      const userClub = localStorage.getItem(`activeClub_${userId}`);
      if (userClub) {
        const parsed = JSON.parse(userClub);
        if (parsed?.id) return parsed.id as string;
      }
    }

    const activeClub = localStorage.getItem("activeClub");
    if (!activeClub) return null;
    const parsed = JSON.parse(activeClub);
    return parsed?.id || null;
  } catch {
    return null;
  }
};

export default function StructureDetailRoute() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeClub, user } = useAuth();
  const { showToast } = useToast();
  const [clubId, setClubId] = useState<string | null>(
    searchParams?.get("clubId") || null,
  );
  const [structures, setStructures] = useState<ClubStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const structureId = String(params?.id || "");

  useEffect(() => {
    const nextClubId =
      searchParams?.get("clubId") ||
      (activeClub as any)?.id ||
      readStoredClubId(user?.id);
    setClubId(nextClubId || null);
  }, [activeClub, searchParams, user?.id]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!clubId) {
        setLoading(false);
        setStructures([]);
        return;
      }

      setLoading(true);
      try {
        const { getClubStructures } = await import("@/lib/simplified-db");
        const items = await getClubStructures(clubId);
        if (mounted) {
          setStructures((items || []).map(normalizeStructure));
        }
      } catch (error) {
        console.error(error);
        showToast("error", "Errore nel caricamento della struttura");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [clubId, showToast]);

  const structure = useMemo(
    () => findStructureById(structures, structureId),
    [structureId, structures],
  );

  const saveStructure = async (nextStructure: ClubStructure) => {
    if (!clubId) return false;

    const nextStructures = structures.map((item) =>
      item.id === nextStructure.id ? normalizeStructure(nextStructure) : item,
    );
    setStructures(nextStructures);

    const { saveClubStructures } = await import("@/lib/simplified-db");
    const ok = await saveClubStructures(clubId, nextStructures);
    if (!ok) {
      showToast("error", "Salvataggio struttura fallito");
    }
    return ok;
  };

  const backUrl = `/structures${clubId ? `?clubId=${clubId}` : ""}`;

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Scheda struttura" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {loading ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Caricamento struttura...
                </CardContent>
              </Card>
            ) : !structure ? (
              <Card>
                <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      Struttura non trovata
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      La struttura richiesta non esiste o non appartiene al club attivo.
                    </p>
                  </div>
                  <Button onClick={() => router.push(backUrl)}>
                    Torna alle strutture
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <StructureDetailPage
                structure={structure}
                onBack={() => router.push(backUrl)}
                onSave={saveStructure}
              />
            )}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

