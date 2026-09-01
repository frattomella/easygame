"use client";

import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import type { MobileNavSection } from "@/components/layout/MobileTopBar";
import { Button } from "@/components/ui/button";

import AthleteSidebar, { ATHLETE_NAV_ITEMS } from "./athlete-sidebar";
import { useAthleteArea } from "./athlete-area-context";

/**
 * Il guscio dell'area atleta.
 *
 * **Non monta la sidebar gestionale** (W6-33), e non e una differenza estetica:
 * la sidebar del club elenca trenta voci che per un atleta rimbalzano sulla
 * guardia. Qui il menu del desktop e quello del telefono mostrano **le stesse**
 * dieci voci, che e il difetto che la Wave 6 ha trovato tre volte — una pagina
 * raggiungibile da un menu e non dall'altro.
 */

const TITOLI: Record<string, string> = {
  "/athlete-dashboard": "La mia area",
  "/athlete-dashboard/calendario": "Calendario",
  "/athlete-dashboard/convocazioni": "Convocazioni",
  "/athlete-dashboard/gare": "Gare",
  "/athlete-dashboard/presenze": "Presenze",
  "/athlete-dashboard/bacheca": "Bacheca",
  "/athlete-dashboard/notifiche": "Notifiche",
  "/athlete-dashboard/documenti": "Documenti",
  "/athlete-dashboard/appuntamenti": "Appuntamenti",
  "/athlete-dashboard/profilo": "Il mio profilo",
};

const mobileNavSections: MobileNavSection[] = [
  {
    id: "athlete-main",
    label: "LA MIA AREA",
    items: ATHLETE_NAV_ITEMS.map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
    })),
  },
];

export default function AthleteAreaShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/athlete-dashboard";
  const { data, loading, error, refresh } = useAthleteArea();

  const titolo = TITOLI[pathname] || "La mia area";

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-sky-50">
      <div className="hidden md:block">
        <AthleteSidebar />
      </div>

      {/*
        `min-w-0` accanto a `overflow-hidden`: senza, a 768 px il guscio si
        allarga fino alla larghezza del proprio contenuto invece di lasciarlo
        scorrere. E la stessa coppia delle altre aree.
      */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          title={titolo}
          showMobileHubLink={false}
          mobileNavSections={mobileNavSections}
          notificationCount={data?.notificationsUnread || 0}
        />

        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {loading && !data ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
              </div>
            ) : null}

            {!loading && !data ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-amber-900">
                      Non riesco a mostrarti la tua area
                    </h2>
                    <p className="mt-1 text-sm text-amber-800">
                      {error ||
                        "Nessuna scheda atleta risulta collegata a questo account. Chiedi alla tua societa di collegarla."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        void refresh();
                      }}
                    >
                      Riprova
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {data ? children : null}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
