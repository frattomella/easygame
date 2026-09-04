"use client";

import React, { memo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Home,
  LogOut,
  FileSignature,
  Mail,
  Megaphone,
  ShieldCheck,
  Stethoscope,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { SidebarItemTooltip } from "@/components/navigation/sidebar-item-tooltip";
import { useParentDashboard } from "./parent-dashboard-context";
import {
  EasyGameLogo,
  EasyGameWordmark,
} from "@/components/brand/easygame-logo";

const ParentSidebar = memo(() => {
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = usePathname() || "";
  const router = useRouter();
  const { signOut } = useAuth();
  const { athleteRouteId, data } = useParentDashboard();

  /*
    PP-02 §A. **Di chi si sta parlando, e come si cambia.**

    W6-12 lo diceva con una fascia bianca in cima al contenuto di ognuna delle
    tredici pagine. L'informazione era giusta, il posto no: su 375 px quella
    fascia stava sopra la piega e spingeva sotto cio per cui si era aperta la
    pagina. Qui sta accanto alle due porte d'uscita, che e la famiglia di
    gesti a cui «cambia figlio» appartiene, e non toglie una riga a nessuna
    schermata.

    Il pulsante compare **solo** con piu di un figlio: con uno solo
    porterebbe a una schermata che reindirizza subito indietro.
  */
  const figlio = data?.athlete;
  const piuFigli = (data?.athlete?.linkedAthletes?.length || 0) > 1;
  const inizialiFiglio =
    (figlio?.name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte: string) => parte[0]?.toUpperCase() || "")
      .join("") || "?";

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const savedState = localStorage.getItem("parent-sidebar-collapsed");
    const isMobile = window.innerWidth < 768;
    if (savedState === "true" || isMobile) {
      setCollapsed(true);
    }

    const handleResize = () => {
      if (window.innerWidth < 768 && !collapsed) {
        setCollapsed(true);
        localStorage.setItem("parent-sidebar-collapsed", "true");
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    const nextState = !collapsed;
    setCollapsed(nextState);
    localStorage.setItem("parent-sidebar-collapsed", String(nextState));
  }, [collapsed]);

  const basePath = `/parent-view/${athleteRouteId}`;
  const navSections = [
    {
      label: "AREA FAMIGLIA",
      items: [
        { href: basePath, label: "Home", icon: Home },
        /*
          Il calendario, la bacheca, le notifiche e i consensi: quattro voci che
          il §13 elencava come «backend pronto, nessuna pagina». Non erano
          funzioni mancanti, erano funzioni irraggiungibili.
        */
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
    <aside
      className={`flex h-[100dvh] ${collapsed ? "w-[80px]" : "w-[264px]"} flex-col overflow-hidden bg-gradient-to-b from-blue-600 to-blue-800 text-white transition-all duration-300`}
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
          className="mt-2 text-white hover:bg-blue-500"
          title={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-4"
        style={{
          scrollbarWidth: "thin",
          msOverflowStyle: "auto",
          scrollbarColor: "rgba(255, 255, 255, 0.3) transparent",
        }}
      >
        {navSections.map((section) => (
          <div key={section.label} className="mb-6">
            {!collapsed ? (
              <div className="mb-2 text-sm font-bold text-blue-200">
                {section.label}
              </div>
            ) : null}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isHome = item.href === basePath;
                const isActive =
                  pathname === item.href ||
                  (!isHome && pathname.startsWith(item.href));

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
                        "flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-blue-500/50",
                        collapsed && "justify-center px-0",
                        isActive && "bg-blue-500/50",
                      )}
                    >
                      <Icon size={18} className="shrink-0" />
                      {!collapsed ? <span>{item.label}</span> : null}
                    </Link>
                  </SidebarItemTooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed ? (
        <div className="mt-auto border-t border-blue-500 p-4">
          {figlio ? (
            <div className="mb-3 rounded-xl bg-blue-500/30 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90 text-sm font-semibold text-blue-700">
                  {figlio.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={figlio.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    inizialiFiglio
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-blue-200">
                    Stai vedendo
                  </p>
                  <p className="truncate font-semibold">{figlio.name}</p>
                </div>
              </div>
              {piuFigli ? (
                <Link
                  href="/parent-view"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500/50"
                >
                  <Users size={16} />
                  <span>Cambia figlio</span>
                </Link>
              ) : null}
            </div>
          ) : null}
          <button
            onClick={() => router.push("/account")}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-3 py-2 font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            <LogOut size={18} />
            <span>Torna al mio account</span>
          </button>
          <button
            onClick={() => {
              void signOut();
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-white/20 px-3 py-2 font-medium text-white transition-colors hover:bg-blue-500/40"
          >
            <LogOut size={18} />
            <span>Esci</span>
          </button>
        </div>
      ) : (
        <div className="mt-auto space-y-2 border-t border-blue-500 p-2">
          {figlio && piuFigli ? (
            <SidebarItemTooltip label={`Cambia figlio (${figlio.name})`} collapsed>
              <Link
                href="/parent-view"
                aria-label={`Cambia figlio, stai vedendo ${figlio.name}`}
                className="flex w-full items-center justify-center rounded-md border border-white/30 p-2 text-white transition-colors hover:bg-blue-500/50"
              >
                <Users size={18} />
              </Link>
            </SidebarItemTooltip>
          ) : null}
          <button
            onClick={() => router.push("/account")}
            className="flex w-full items-center justify-center rounded-md bg-white p-2 text-blue-600 transition-colors hover:bg-blue-50"
            title="Torna al mio account"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </aside>
  );
});

ParentSidebar.displayName = "ParentSidebar";

export default ParentSidebar;
