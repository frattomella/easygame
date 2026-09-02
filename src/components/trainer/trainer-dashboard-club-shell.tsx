"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  FolderOpen,
  Home,
  Megaphone,
  Trophy,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import TrainerSidebar from "@/components/trainer/TrainerSidebar";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  getFirstAccessibleTrainerRoute,
  TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY,
} from "@/lib/trainer-dashboard-permissions";
import type { MobileNavSection } from "@/components/layout/MobileTopBar";

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

export default function TrainerDashboardClubShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeClub, loading, operationalAlerts, permissions, trainerProfile } =
    useTrainerDashboard();

  /*
    **Il menu dell'allenatore sotto i 768 px.**

    `TrainerSidebar` sta dentro un `hidden md:block`: sotto i 768 px non e
    montata, e questo elenco e **l'unica** navigazione che resta. Ogni voce
    della barra laterale deve quindi comparire anche qui, con la **stessa**
    chiave di permesso: una voce filtrata da un lato e libera dall'altro
    sarebbe una porta che si apre o no a seconda della larghezza dello schermo.

    Questa lista aveva gia perso «Notifiche» una volta, e con la Wave 6 aveva
    perso anche «Squadre» e «I miei compensi»: tre voci nate nella barra
    desktop e mai arrivate qui, cioe tre pagine che un allenatore in palestra
    — dove il telefono e l'unico schermo — non poteva raggiungere. Adesso le
    due liste sono complete, e a tenerle tali c'e
    `tests/ui/navigazione-sotto-1024-e-768.test.mjs`, che ricava le chiavi da
    `TrainerSidebar.tsx` e pretende di ritrovarle in questo file: la prossima
    voce dimenticata fallisce da sola.
  */
  const trainerMobileNavSections: MobileNavSection[] = [
    {
      id: "trainer",
      label: "ALLENATORE",
      items: [
        permissions.navigation.home
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.home,
              label: "Home",
              icon: Home,
            }
          : null,
        permissions.navigation.trainings
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.trainings,
              label: "Allenamenti",
              icon: CalendarDays,
            }
          : null,
        permissions.navigation.matches
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.matches,
              label: "Gare",
              icon: Trophy,
            }
          : null,
        permissions.navigation.athletes
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.athletes,
              label: "Atleti",
              icon: UserCircle,
            }
          : null,
        /*
          **Le proprie squadre** (W6-31). Stessa etichetta e stessa icona della
          barra laterale: e la pagina dei gruppi del perimetro, e sul telefono
          e quella che si guarda prima di un allenamento.
        */
        permissions.navigation.categories
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.categories,
              label: "Squadre",
              icon: Users,
            }
          : null,
        permissions.navigation.board
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.board,
              label: "Bacheca",
              icon: Megaphone,
            }
          : null,
        permissions.navigation.appointments
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.appointments,
              label: "Appuntamenti",
              icon: CalendarClock,
            }
          : null,
        permissions.navigation.documents
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.documents,
              label: "Documenti",
              icon: FolderOpen,
            }
          : null,
        /*
          **La pagina che il menu non nominava** (W6-30). Dal telefono la
          campanella era l'unica strada, e una notifica chiusa era una notifica
          che non si poteva piu rileggere.
        */
        permissions.navigation.notifications
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.notifications,
              label: "Notifiche",
              icon: Bell,
            }
          : null,
        /*
          **«I miei compensi»** (W6-32): l'unica domanda economica che
          l'allenatore puo fare, ed e la sua.
        */
        permissions.navigation.compensation
          ? {
              href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.compensation,
              label: "I miei compensi",
              icon: Wallet,
            }
          : null,
      ].filter(Boolean) as MobileNavSection["items"],
    },
  ].filter((section) => section.items.length > 0);

  useEffect(() => {
    if (loading) {
      return;
    }

    const navigationKey = resolveNavigationKey(pathname || "");
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
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="hidden md:block">
        <TrainerSidebar />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          title={resolvePageTitle(pathname || "")}
          notificationCount={operationalAlerts.length}
          showMobileHubLink={false}
          mobileNavSections={trainerMobileNavSections}
        />

        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
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
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
