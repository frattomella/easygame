"use client";

import React, { memo, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Home,
  LogOut,
  Megaphone,
  Stethoscope,
  Trophy,
  UserCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { SidebarItemTooltip } from "@/components/navigation/sidebar-item-tooltip";
import {
  EasyGameLogo,
  EasyGameWordmark,
} from "@/components/brand/easygame-logo";

/**
 * **La navigazione dell'atleta, e perche non e quella del club** (W6-33).
 *
 * La pagina profilo montava `components/dashboard/Sidebar`: un atleta vedeva
 * cliccabili Pagamenti, Movimenti, Impostazioni, Lavoro sportivo — trenta voci
 * gestionali — ci cliccava, e rimbalzava sulla guardia **senza una parola**.
 * Un menu che elenca cio che non si puo fare non e un menu: e un elenco di
 * porte chiuse, e dice a chi lo legge che il prodotto non e per lui.
 *
 * Qui ci sono nove voci, e sono tutte cose che un atleta puo davvero fare.
 */

export const ATHLETE_NAV_ITEMS = [
  { href: "/athlete-dashboard", label: "Home", icon: Home },
  { href: "/athlete-dashboard/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/athlete-dashboard/convocazioni", label: "Convocazioni", icon: ClipboardCheck },
  { href: "/athlete-dashboard/gare", label: "Gare", icon: Trophy },
  { href: "/athlete-dashboard/presenze", label: "Presenze", icon: ClipboardCheck },
  { href: "/athlete-dashboard/bacheca", label: "Bacheca", icon: Megaphone },
  { href: "/athlete-dashboard/notifiche", label: "Notifiche", icon: Bell },
  { href: "/athlete-dashboard/documenti", label: "Documenti", icon: FileText },
  { href: "/athlete-dashboard/appuntamenti", label: "Appuntamenti", icon: Stethoscope },
  { href: "/athlete-dashboard/profilo", label: "Il mio profilo", icon: UserCircle },
] as const;

const AthleteSidebar = memo(() => {
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = usePathname() || "";
  const router = useRouter();
  const { signOut } = useAuth();

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const salvato = localStorage.getItem("athlete-sidebar-collapsed");
    if (salvato === "true" || window.innerWidth < 768) setCollapsed(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    const prossimo = !collapsed;
    setCollapsed(prossimo);
    localStorage.setItem("athlete-sidebar-collapsed", String(prossimo));
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "flex h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-emerald-600 to-emerald-800 text-white transition-all duration-300",
        collapsed ? "w-[80px]" : "w-[280px]",
      )}
    >
      <div className="mb-6 flex flex-col items-center px-4 py-4">
        <div className="flex items-center gap-4">
          {collapsed ? (
            <EasyGameLogo tone="light" className="h-10 w-10 shrink-0" />
          ) : (
            <EasyGameWordmark tone="light" logoClassName="h-8" />
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCollapsed}
          className="mt-2 text-white hover:bg-emerald-500"
          title={collapsed ? "Espandi il menu" : "Comprimi il menu"}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4">
        {!collapsed ? (
          <div className="mb-2 text-sm font-bold text-emerald-200">
            LA MIA AREA
          </div>
        ) : null}
        <div className="space-y-1">
          {ATHLETE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isHome = item.href === "/athlete-dashboard";
            const isActive = isHome
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <SidebarItemTooltip
                key={item.href}
                label={item.label}
                collapsed={collapsed}
              >
                <Link
                  href={item.href}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-emerald-500/50",
                    collapsed && "justify-center px-0",
                    isActive && "bg-emerald-500/50",
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
              </SidebarItemTooltip>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto border-t border-emerald-500 p-4">
        <button
          type="button"
          onClick={() => router.push("/account")}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md bg-white px-3 py-2 font-medium text-emerald-700 transition-colors hover:bg-emerald-50",
            collapsed && "px-2",
          )}
          title="Torna al mio account"
        >
          <LogOut size={18} />
          {!collapsed ? <span>Torna al mio account</span> : null}
        </button>
        {!collapsed ? (
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-white/20 px-3 py-2 font-medium text-white transition-colors hover:bg-emerald-500/40"
          >
            <LogOut size={18} />
            <span>Esci</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
});

AthleteSidebar.displayName = "AthleteSidebar";

export default AthleteSidebar;
