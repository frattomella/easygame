"use client";

import { usePathname } from "next/navigation";
import {
  Building2,
  Bell,
  CalendarDays,
  CreditCard,
  FileText,
  Home,
  FileSignature,
  Mail,
  Megaphone,
  ShieldCheck,
  Stethoscope,
  Trophy,
  UserCircle,
} from "lucide-react";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import type { MobileNavSection } from "@/components/layout/MobileTopBar";
import ParentSidebar from "./ParentSidebar";
import { useParentDashboard } from "./parent-dashboard-context";

const resolvePageTitle = (pathname: string) => {
  if (pathname.includes("/calendar")) return "Calendario";
  if (pathname.includes("/enrollment")) return "Iscrizione e rinnovo";
  if (pathname.includes("/board")) return "Bacheca";
  if (pathname.includes("/notifications")) return "Notifiche";
  if (pathname.includes("/consents")) return "Consensi";
  if (pathname.includes("/athlete")) return "Atleta";
  if (pathname.includes("/trainings")) return "Allenamenti";
  if (pathname.includes("/structures")) return "Strutture";
  if (pathname.includes("/matches")) return "Gare";
  if (pathname.includes("/payments")) return "Pagamenti";
  if (pathname.includes("/documents")) return "Documenti";
  if (pathname.includes("/secretariat")) return "Segreteria";
  if (pathname.includes("/contacts")) return "Contatti Club";
  return "Dashboard Genitore";
};

export default function ParentDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { athleteRouteId, data, loading, error, refresh } = useParentDashboard();
  const basePath = `/parent-view/${athleteRouteId}`;
  const isBlockingLoad = loading && !data;
  const isBlockingError = !data && Boolean(error);
  const mobileNavSections: MobileNavSection[] = [
    {
      id: "parent-main",
      label: "AREA FAMIGLIA",
      items: [
        { href: basePath, label: "Home", icon: Home },
        { href: `${basePath}/calendar`, label: "Calendario", icon: CalendarDays },
        { href: `${basePath}/athlete`, label: "Atleta", icon: UserCircle },
        {
          href: `${basePath}/trainings`,
          label: "Allenamenti",
          icon: CalendarDays,
        },
        { href: `${basePath}/structures`, label: "Strutture", icon: Building2 },
        { href: `${basePath}/matches`, label: "Gare", icon: Trophy },
      ],
    },
    {
      id: "parent-office",
      label: "SEGRETERIA",
      items: [
        { href: `${basePath}/payments`, label: "Pagamenti", icon: CreditCard },
        {
          href: `${basePath}/enrollment`,
          label: "Iscrizione",
          icon: FileSignature,
        },
        { href: `${basePath}/documents`, label: "Documenti", icon: FileText },
        { href: `${basePath}/consents`, label: "Consensi", icon: ShieldCheck },
        { href: `${basePath}/board`, label: "Bacheca", icon: Megaphone },
        { href: `${basePath}/notifications`, label: "Notifiche", icon: Bell },
        {
          href: `${basePath}/secretariat`,
          label: "Segreteria",
          icon: Stethoscope,
        },
        { href: `${basePath}/contacts`, label: "Contatti Club", icon: Mail },
      ],
    },
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="hidden md:block">
        <ParentSidebar />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Header
          title={resolvePageTitle(pathname || "")}
          showMobileHubLink={false}
          mobileNavSections={mobileNavSections}
        />

        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {isBlockingLoad ? (
              <div className="flex min-h-[55vh] items-center justify-center">
                <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-center text-slate-600 shadow-sm">
                  Caricamento dashboard...
                </div>
              </div>
            ) : isBlockingError || !data ? (
              <div className="flex min-h-[55vh] items-center justify-center">
                <div className="max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
                  <h2 className="text-2xl font-bold text-slate-900">
                    Accesso non disponibile
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {error || "Questo atleta non risulta collegato al tuo account."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void refresh();
                    }}
                    className="mt-5 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Riprova
                  </button>
                </div>
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
