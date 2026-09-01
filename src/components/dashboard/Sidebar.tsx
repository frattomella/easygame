"use client";

import React, { memo, useCallback, useMemo } from "react";
import "../../app/globals.css";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BadgeEuro,
  Briefcase,
  Building,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileSignature,
  FileCheck,
  FileText,
  ScrollText,
  FileUp,
  GraduationCap,
  Handshake,
  HardHat,
  Home,
  Lock,
  MessageSquare,
  PieChart,
  Receipt,
  Scale,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Shirt,
  Sparkles,
  Stethoscope,
  Trophy,
  UserCircle,
  UserCog,
  UsersRound,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarItemTooltip } from "@/components/navigation/sidebar-item-tooltip";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { memoize } from "@/lib/performance";
import { canOpenAccounting } from "@/lib/accounting/permissions";
import { EasyGameLogo } from "@/components/brand/easygame-logo";

type SidebarItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

type SidebarGroup = {
  id: string;
  label: string;
  items: SidebarItem[];
};

const sidebarGroups: SidebarGroup[] = [
  {
    id: "overview",
    label: "PANORAMICA",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: Home },
      { id: "reports", label: "Report", href: "/reports", icon: PieChart },
    ],
  },
  {
    id: "people",
    label: "PERSONE",
    items: [
      { id: "athletes", label: "Atleti", href: "/athletes", icon: UserCircle },
      { id: "trainers", label: "Allenatori", href: "/trainers", icon: UserCog },
      { id: "staff", label: "Staff", href: "/staff", icon: Briefcase },
      { id: "members", label: "Soci", href: "/soci", icon: UsersRound },
      {
        id: "categories",
        label: "Categorie",
        href: "/categories",
        icon: GraduationCap,
      },
      {
        id: "medical",
        label: "Certificati Medici",
        href: "/medical",
        icon: Stethoscope,
      },
      { id: "procura", label: "Procure", href: "/procura", icon: Scale },
    ],
  },
  {
    id: "sport",
    label: "ATTIVITÀ SPORTIVA",
    items: [
      {
        id: "calendar",
        label: "Calendario",
        href: "/calendar",
        icon: CalendarDays,
      },
      {
        id: "training",
        label: "Allenamenti",
        href: "/training",
        icon: CalendarDays,
      },
      { id: "matches", label: "Gare", href: "/matches", icon: Trophy },
      { id: "structures", label: "Strutture", href: "/structures", icon: Building },
    ],
  },
  {
    id: "office",
    label: "SEGRETERIA",
    items: [
      {
        id: "registrations",
        label: "Gestione Iscrizioni",
        href: "/registration-management",
        icon: Receipt,
      },
      {
        id: "forms",
        label: "Modulistica",
        href: "/modulistica",
        icon: FileUp,
      },
      /*
        I consensi stanno accanto alla Modulistica e non dentro: un modulo si
        compila una volta, un consenso e uno stato della persona che nasce,
        vale e finisce. Sono due domande diverse, e cercare «chi ha revocato»
        dentro le compilazioni e esattamente il problema che G-17 chiude.
      */
      {
        id: "consents",
        label: "Consensi",
        href: "/consensi",
        icon: ShieldCheck,
      },
      {
        id: "secretariat",
        label: "Segreteria",
        href: "/secretariat",
        icon: FileText,
      },
      /*
        W6-39. La coda documentale del club. Senza questa voce la pagina
        nascerebbe irraggiungibile — che e esattamente la forma di difetto
        che la Wave 6 ha contato quattordici volte: dominio corretto, rotta
        corretta, test verdi, e nessuna strada che ci arrivi.

        Fino a qui la segreteria doveva aprire **scheda per scheda** per
        sapere se qualcuno aveva caricato qualcosa.
      */
      {
        id: "documents",
        label: "Documenti",
        href: "/documenti",
        icon: FileCheck,
      },
      {
        id: "notifications",
        label: "Notifiche",
        href: "/notifications",
        icon: MessageSquare,
      },
      /*
        Comunicazioni sta accanto a Notifiche, e non e la stessa cosa: li si
        **leggono** gli avvisi che il prodotto produce, qui si **scrive** alle
        famiglie. La bacheca e le automazioni sono sottopagine di questa, non
        due voci di menu in piu: sono modi diversi di mandare lo stesso
        messaggio, e tre voci suggerirebbero tre prodotti.
      */
      {
        id: "communications",
        label: "Comunicazioni",
        href: "/communications",
        icon: Send,
      },
    ],
  },
  {
    id: "accounting",
    label: "CONTABILITÀ",
    items: [
      { id: "movements", label: "Movimenti", href: "/movements", icon: Wallet },
      { id: "sponsors", label: "Sponsor", href: "/sponsors", icon: Handshake },
    ],
  },
  {
    id: "sport-work",
    label: "LAVORO SPORTIVO",
    items: [
      { id: "sport-work", label: "Dashboard", href: "/sport-work", icon: HardHat },
      {
        id: "sport-work-relationships",
        label: "Rapporti",
        href: "/sport-work/relationships",
        icon: FileSignature,
      },
      {
        id: "sport-work-compensations",
        label: "Compensi",
        href: "/sport-work/compensations",
        icon: BadgeEuro,
      },
      {
        id: "sport-work-deadlines",
        label: "Scadenze",
        href: "/sport-work/deadlines",
        icon: CalendarClock,
      },
      {
        id: "sport-work-obligations",
        label: "Adempimenti",
        href: "/sport-work/obligations",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    id: "warehouse",
    label: "MAGAZZINO",
    items: [
      { id: "clothing", label: "Abbigliamento", href: "/clothing", icon: Shirt },
    ],
  },
  {
    id: "configuration",
    label: "CONFIGURAZIONE",
    items: [
      { id: "organization", label: "Club", href: "/organization", icon: Shield },
      { id: "settings", label: "Impostazioni", href: "/settings", icon: Settings },
      { id: "permissions", label: "Permessi", href: "/permissions", icon: Lock },
      /*
        W6-1 e W6-2. Le due schermate della lane 6G. Senza queste righe
        nascerebbero irraggiungibili — e `/dashboard/access-management` lo era
        gia da mock: una schermata finta su questo dominio e peggio di una
        schermata assente, perche promette un controllo che non c e.

        Il registro degli eventi era **write-only**: 108 punti di scrittura e
        nessun lettore (WP-16). La rotta di lettura la protegge `audit.read`,
        che e una chiave di direzione.
      */
      {
        id: "access-management",
        label: "Ruoli e accessi",
        href: "/dashboard/access-management",
        icon: UserCog,
      },
      { id: "audit", label: "Registro attivita", href: "/audit", icon: ScrollText },
    ],
  },
];

const initialOpenGroups = Object.fromEntries(
  sidebarGroups.map((group) => [group.id, true]),
) as Record<string, boolean>;

const Sidebar = memo(() => {
  const [collapsed, setCollapsed] = React.useState(false);
  const [clubId, setClubId] = React.useState<string | null>(null);
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    () => ({ ...initialOpenGroups }),
  );
  const pathname = usePathname();
  const { user, isAthlete, activeClub } = useAuth();

  // Get club ID from URL or localStorage
  React.useEffect(() => {
    const getClubData = () => {
      // First check URL params
      const urlParams = new URLSearchParams(window.location.search);
      const urlClubId = urlParams.get("clubId");

      if (urlClubId) {
        setClubId(urlClubId);
        return;
      }

      if (activeClub?.id) {
        setClubId(activeClub.id);
        return;
      }

      if (user?.id) {
        const userSpecificClub = localStorage.getItem(`activeClub_${user.id}`);
        if (userSpecificClub) {
          try {
            const parsedClub = JSON.parse(userSpecificClub);
            if (parsedClub.id) {
              setClubId(parsedClub.id);
              return;
            }
          } catch (e) {
            console.error("Error parsing user-specific active club:", e);
          }
        }
      }

      // Then check localStorage
      const rawActiveClub = localStorage.getItem("activeClub");
      if (rawActiveClub) {
        try {
          const parsedClub = JSON.parse(rawActiveClub);
          if (parsedClub.id) {
            setClubId(parsedClub.id);
          }
        } catch (e) {
          console.error("Error parsing active club:", e);
        }
      }

      setClubId(null);
    };

    getClubData();
  }, [activeClub?.id, user?.id]);

  // Memoized helper function to build URL with clubId
  const buildUrl = useMemo(
    () =>
      memoize((path: string) => {
        if (clubId) {
          return `${path}?clubId=${clubId}`;
        }
        return path;
      }),
    [clubId],
  );

  const toggleCollapsed = useCallback(() => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
  }, [collapsed]);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }, []);

  const getItemHref = useCallback(
    (item: SidebarItem) => {
      if (item.id === "athletes" && isAthlete && user?.id) {
        return `/athletes/${user.id}/profile`;
      }

      return buildUrl(item.href);
    },
    [buildUrl, isAthlete, user?.id],
  );

  const getItemLabel = useCallback(
    (item: SidebarItem) =>
      item.id === "athletes" && isAthlete ? "Il Mio Profilo" : item.label,
    [isAthlete],
  );

  /*
    La voce «Movimenti» segue la stessa matrice della pagina e delle rotte
    contabili — `src/lib/accounting/permissions.ts` — e non un `if` sul ruolo
    scritto qui. Un allenatore non deve nemmeno vederla: una pagina che nega e
    piu onesta di una assente solo per chi aveva ragione di aspettarsela, ma
    chi non ha mai avuto niente a che fare con la cassa non ha ragione di
    aspettarsela affatto.
  */
  const isItemVisible = useCallback(
    (item: SidebarItem) =>
      item.id === "movements"
        ? canOpenAccounting(activeClub?.role || null)
        : true,
    [activeClub?.role],
  );

  const isItemActive = useCallback(
    (item: SidebarItem) => {
      if (!pathname) {
        return false;
      }

      if (item.id === "athletes" && isAthlete) {
        return pathname.includes("/athletes/") && pathname.includes("/profile");
      }

      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    },
    [isAthlete, pathname],
  );

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const savedState = localStorage.getItem("sidebar-collapsed");
      const isMobile = window.innerWidth < 1024;

      if (savedState === "true" || isMobile) {
        setCollapsed(true);
      }

      const handleResize = () => {
        if (window.innerWidth < 1024 && !collapsed) {
          setCollapsed(true);
          localStorage.setItem("sidebar-collapsed", "true");
        }
      };

      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [collapsed]);

  return (
    <aside
      className={`hidden lg:flex h-[100dvh] shrink-0 ${collapsed ? "w-[80px]" : "w-[320px]"} flex-col bg-gradient-to-b from-blue-600 to-blue-800 text-white transition-all duration-300 overflow-hidden relative`}
    >
      <div className="mb-6 flex items-center flex-col py-4 px-4">
        {/*
          Dal Blocco 7 il marchio sta solo qui, e da qui si torna all'elenco dei
          club: era l'unica funzione del logo tolto dalla topbar.
        */}
        <Link
          href="/account"
          aria-label="EasyGame: torna all'elenco dei club"
          title="EasyGame"
          className="flex items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <EasyGameLogo tone="light" className="h-10 w-10 shrink-0" />
          {!collapsed && (
            <h1 className="text-xl font-bold text-white">EasyGame</h1>
          )}
        </Link>

        <div className="flex mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(true)}
            className="md:hidden text-white hover:bg-blue-500 transition-all duration-300 z-10"
            title="Chiudi sidebar"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className="text-white hover:bg-blue-500 transition-all duration-300"
            title={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-4"
        style={{
          scrollbarWidth: "thin",
          msOverflowStyle: "auto",
          scrollbarColor: "rgba(255, 255, 255, 0.3) transparent",
        }}
      >
        <div className="mb-4">
          <Link
            href={buildUrl("/hub")}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg",
              collapsed && "justify-center px-0",
              pathname === "/hub" && "ring-2 ring-white/50",
            )}
            title="EasyGame HUB"
          >
            <Sparkles size={20} className="shrink-0 text-white" />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-white">EasyGame HUB</span>
                <span className="text-xs text-white/80">
                  Marketplace & Novità
                </span>
              </div>
            )}
          </Link>
        </div>

        {sidebarGroups.map((group) => {
          const isOpen = collapsed || openGroups[group.id] !== false;
          const groupContentId = `sidebar-group-${group.id}`;

          return (
            <div key={group.id} className="mb-1">
              {!collapsed ? (
                <button
                  type="button"
                  aria-expanded={openGroups[group.id] !== false}
                  aria-controls={groupContentId}
                  onClick={() => toggleGroup(group.id)}
                  className="mb-2 flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs font-bold uppercase tracking-wide text-blue-100/90 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <span>{group.label}</span>
                  {openGroups[group.id] !== false ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : null}

              <div
                id={groupContentId}
                className={cn(
                  "space-y-1 overflow-hidden transition-all duration-200",
                  isOpen ? "mb-5 max-h-[900px] opacity-100" : "mb-2 max-h-0 opacity-0",
                )}
              >
                {group.items.filter(isItemVisible).map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item);
                  const label = getItemLabel(item);

                  return (
                    <SidebarItemTooltip
                      key={item.id}
                      label={label}
                      collapsed={collapsed}
                    >
                      <Link
                        href={getItemHref(item)}
                        aria-label={collapsed ? label : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-blue-500/50 hover:text-white",
                          collapsed && "justify-center px-0",
                          active && "bg-blue-500/60 text-white",
                        )}
                      >
                        <Icon size={18} className="shrink-0" />
                        {!collapsed && <span>{label}</span>}
                      </Link>
                    </SidebarItemTooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-auto p-4 border-t border-blue-500">
          <p className="text-xs text-center text-blue-200">
            powered by Francesco srl
          </p>
        </div>
      )}
    </aside>
  );
});

Sidebar.displayName = "Sidebar";

export default Sidebar;
