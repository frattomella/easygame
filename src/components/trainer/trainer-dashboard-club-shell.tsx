"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "@/components/dashboard/Header";
import TrainerSidebar from "@/components/trainer/TrainerSidebar";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import { getFirstAccessibleTrainerRoute } from "@/lib/trainer-dashboard-permissions";

const PAGE_TITLES: Record<string, string> = {
  "/trainer-dashboard": "Dashboard Allenatore",
  "/trainer-dashboard/trainings": "Allenamenti",
  "/trainer-dashboard/matches": "Gare",
  "/trainer-dashboard/athletes": "Atleti",
  "/trainer-dashboard/categories": "Categorie",
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
  if (pathname.startsWith("/trainer-dashboard/categories")) return "categories";
  return null;
};

export default function TrainerDashboardClubShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeClub, loading, permissions, trainerProfile } =
    useTrainerDashboard();

  useEffect(() => {
    if (loading) {
      return;
    }

    const navigationKey = resolveNavigationKey(pathname);
    if (navigationKey && !permissions.navigation[navigationKey]) {
      router.replace(getFirstAccessibleTrainerRoute(permissions));
    }
  }, [loading, pathname, permissions, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-slate-600 shadow-sm">
          Caricamento dashboard allenatore...
        </div>
      </div>
    );
  }

  if (!activeClub?.id) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="hidden md:block">
        <TrainerSidebar />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Header
          title={resolvePageTitle(pathname)}
          showQuickActions={false}
        />

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6 pb-8">
          <div className="mx-auto max-w-9xl space-y-6">
            {!trainerProfile ? (
              <div className="rounded-3xl border border-amber-200 bg-white p-10 text-center shadow-sm">
                <h2 className="text-3xl font-bold text-slate-900">
                  Profilo allenatore non collegato
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  L’accesso al club è attivo, ma il tuo account EasyGame non è
                  ancora stato collegato a una scheda allenatore. Chiedi al club
                  di generare il token dalla tua scheda e riscattalo dalla home
                  account.
                </p>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
