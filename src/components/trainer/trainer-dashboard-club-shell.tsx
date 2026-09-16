"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AreaLoading, AreaShell, AreaUnavailable } from "@/components/web/shell/AreaShell";
import { trainerAreaNavGroups } from "@/components/web/shell/area-navigation";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import { getFirstAccessibleTrainerRoute } from "@/lib/trainer-dashboard-permissions";

const PAGE_TITLES: Record<string, string> = {
  "/trainer-dashboard": "Home",
  "/trainer-dashboard/notifications": "Notifiche",
  "/trainer-dashboard/trainings": "Allenamenti",
  "/trainer-dashboard/matches": "Gare",
  "/trainer-dashboard/athletes": "Atleti",
  "/trainer-dashboard/categories": "Squadre",
  "/trainer-dashboard/board": "Bacheca",
  "/trainer-dashboard/documents": "Documenti",
  "/trainer-dashboard/appointments": "Appuntamenti",
  "/trainer-dashboard/compensi": "I miei compensi",
};

const resolvePageTitle = (pathname: string) => {
  const matchedPath = Object.keys(PAGE_TITLES)
    .sort((left, right) => right.length - left.length)
    .find((entry) => pathname === entry || pathname.startsWith(`${entry}/`));

  return PAGE_TITLES[matchedPath || "/trainer-dashboard"];
};

const resolveNavigationKey = (pathname: string) => {
  if (pathname === "/trainer-dashboard") return "home";
  if (pathname.startsWith("/trainer-dashboard/trainings")) return "trainings";
  if (pathname.startsWith("/trainer-dashboard/matches")) return "matches";
  if (pathname.startsWith("/trainer-dashboard/athletes")) return "athletes";
  if (pathname.startsWith("/trainer-dashboard/board")) return "board";
  if (pathname.startsWith("/trainer-dashboard/documents")) return "documents";
  if (pathname.startsWith("/trainer-dashboard/appointments")) {
    return "appointments";
  }
  return null;
};

/**
 * Il guscio dell'allenatore: `AreaShell` con le voci che
 * `permissions.navigation` accende. **Un elenco solo** — barra larga e menu
 * sotto la soglia leggono entrambi `trainerAreaNavGroups` — quindi la voce
 * dimenticata da un lato (successo tre volte: Notifiche, Squadre, I miei
 * compensi) non puo piu esistere; la rotta viene dalla mappa
 * `TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY`, mai scritta a mano.
 */
export default function TrainerDashboardClubShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeClub, loading, operationalAlerts, permissions, trainerProfile } = useTrainerDashboard();

  const groups = React.useMemo(() => trainerAreaNavGroups(permissions), [permissions]);

  React.useEffect(() => {
    if (loading) {
      return;
    }

    const navigationKey = resolveNavigationKey(pathname || "");
    if (navigationKey && !permissions.navigation[navigationKey]) {
      router.replace(getFirstAccessibleTrainerRoute(permissions));
    }
  }, [loading, pathname, permissions, router]);

  if (!loading && !activeClub?.id) {
    return null;
  }

  return (
    <AreaShell
      groups={groups}
      title={resolvePageTitle(pathname || "")}
      notificationCount={operationalAlerts.length}
      identity={
        activeClub
          ? {
              eyebrow: "Allenatore",
              name: trainerProfile?.name || activeClub.name || "Allenatore",
              meta: activeClub.name || null,
              avatarSrc: (trainerProfile as { avatar_url?: string | null } | null)?.avatar_url || null,
              actions: [{ id: "account", label: "Torna al mio account", onSelect: () => router.push("/account"), tone: "muted" }],
            }
          : undefined
      }
    >
      {loading ? (
        <AreaLoading label="Area allenatore in caricamento" />
      ) : !trainerProfile ? (
        <AreaUnavailable
          title="Profilo allenatore non collegato"
          description="L'accesso al club è attivo, ma il tuo account EasyGame non è ancora stato collegato a una scheda allenatore. Chiedi al club di generare il token dalla tua scheda e riscattalo dalla home account."
        />
      ) : (
        children
      )}
    </AreaShell>
  );
}
