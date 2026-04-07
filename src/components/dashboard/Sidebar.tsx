"use client";

import React, { memo, useCallback, useMemo } from "react";
import "../../app/globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/components/providers/AuthProvider";
import { memoize } from "@/lib/performance";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Calendar,
  FileHeart,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  Building,
  ClipboardList,
  CreditCard,
  Shield,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Facebook,
  Twitter,
  Home,
  Briefcase,
  UserCog,
  UsersRound,
  Handshake,
  UserCircle,
  GraduationCap,
  FolderOpen,
  Stethoscope,
  CalendarDays,
  Trophy,
  Receipt,
  Wallet,
  FileText,
  MessageSquare,
  PieChart,
  Lock,
  FileUp,
  Shirt,
  Scale,
  Sparkles,
} from "lucide-react";
import { ChatButton } from "@/components/ui/chat";
import Image from "next/image";

const Sidebar = memo(() => {
  const [collapsed, setCollapsed] = React.useState(false);
  const [clubId, setClubId] = React.useState<string | null>(null);

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

      // Then check localStorage
      const activeClub = localStorage.getItem("activeClub");
      if (activeClub) {
        try {
          const parsedClub = JSON.parse(activeClub);
          if (parsedClub.id) {
            setClubId(parsedClub.id);
          }
        } catch (e) {
          console.error("Error parsing active club:", e);
        }
      }
    };

    getClubData();
  }, []);

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

  // Memoized toggle function
  const toggleCollapsed = useCallback(() => {
    const newState = !collapsed;
    setCollapsed(newState);
    // Save preference to localStorage
    localStorage.setItem("sidebar-collapsed", String(newState));
  }, [collapsed]);

  React.useEffect(() => {
    // Check if there's a saved preference in localStorage or if it's a mobile device
    if (typeof window !== "undefined") {
      const savedState = localStorage.getItem("sidebar-collapsed");
      const isMobile = window.innerWidth < 768;

      if (savedState === "true" || isMobile) {
        setCollapsed(true);
      }

      // Add resize listener to collapse sidebar on mobile
      const handleResize = () => {
        if (window.innerWidth < 768 && !collapsed) {
          setCollapsed(true);
          localStorage.setItem("sidebar-collapsed", "true");
        }
      };

      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [collapsed]);

  const pathname = usePathname();
  const router = useRouter();
  const { user, isAthlete } = useAuth();

  return (
    <aside
      className={`flex h-screen ${collapsed ? "w-[80px]" : "w-[320px]"} flex-col bg-gradient-to-b from-blue-600 to-blue-800 text-white transition-all duration-300 overflow-hidden relative`}
    >
      <div className="mb-6 flex items-center flex-col py-4 px-4">
        <div className="flex items-center gap-4">
          <div className="relative h-10 w-10">
            <Image
              src="https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png"
              alt="EasyGame Logo"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          {!collapsed && (
            <h1 className="text-xl font-bold text-white">EasyGame</h1>
          )}
        </div>

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
        {/* EasyGame HUB - Featured Link */}
        <div className="mb-4">
          <Link
            href={buildUrl("/hub")}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg",
              pathname === "/hub" && "ring-2 ring-white/50",
            )}
          >
            <Sparkles size={20} className="text-white" />
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

        {/* CLUB Section */}
        {!collapsed && (
          <div className="text-sm font-bold text-blue-200 mb-2">CLUB</div>
        )}
        <div className="space-y-1 mb-6">
          <Link
            href={buildUrl("/dashboard")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/dashboard" && "bg-blue-500/50",
            )}
          >
            <Home size={18} />
            {!collapsed && <span>Dashboard</span>}
          </Link>
          <Link
            href={buildUrl("/organization")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/organization" && "bg-blue-500/50",
            )}
          >
            <Shield size={18} />
            {!collapsed && <span>Organizzazione</span>}
          </Link>

          <Link
            href={buildUrl("/structures")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/structures" && "bg-blue-500/50",
            )}
          >
            <Building size={18} />
            {!collapsed && <span>Strutture</span>}
          </Link>
          <Link
            href={buildUrl("/clothing")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/clothing" && "bg-blue-500/50",
            )}
          >
            <Shirt size={18} />
            {!collapsed && <span>Abbigliamento</span>}
          </Link>
          <Link
            href={buildUrl("/staff")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/staff" && "bg-blue-500/50",
            )}
          >
            <Briefcase size={18} />
            {!collapsed && <span>Staff</span>}
          </Link>
          <Link
            href={buildUrl("/soci")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/soci" && "bg-blue-500/50",
            )}
          >
            <UsersRound size={18} />
            {!collapsed && <span>Soci</span>}
          </Link>
          <Link
            href={buildUrl("/modulistica")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/modulistica" && "bg-blue-500/50",
            )}
          >
            <FileUp size={18} />
            {!collapsed && <span>Modulistica</span>}
          </Link>
          <Link
            href={buildUrl("/sponsors")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/sponsors" && "bg-blue-500/50",
            )}
          >
            <Handshake size={18} />
            {!collapsed && <span>Sponsor</span>}
          </Link>
          <Link
            href={buildUrl("/procura")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/procura" && "bg-blue-500/50",
            )}
          >
            <Scale size={18} />
            {!collapsed && <span>Procura</span>}
          </Link>
        </div>

        {/* TESSERATI Section */}
        {!collapsed && (
          <div className="text-sm font-bold text-blue-200 mb-2">TESSERATI</div>
        )}
        <div className="space-y-1 mb-6">
          {isAthlete ? (
            <Link
              href={`/athletes/${user?.id}/profile`}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
                pathname.includes("/athletes/") &&
                  pathname.includes("/profile") &&
                  "bg-blue-500/50",
              )}
            >
              <UserCircle size={18} />
              {!collapsed && <span>Il Mio Profilo</span>}
            </Link>
          ) : (
            <Link
              href={buildUrl("/athletes")}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
                pathname === "/athletes" && "bg-blue-500/50",
              )}
            >
              <UserCircle size={18} />
              {!collapsed && <span>Atleti</span>}
            </Link>
          )}
          <Link
            href={buildUrl("/trainers")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/trainers" && "bg-blue-500/50",
            )}
          >
            <UserCog size={18} />
            {!collapsed && <span>Allenatori</span>}
          </Link>
          <Link
            href={buildUrl("/categories")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/categories" && "bg-blue-500/50",
            )}
          >
            <GraduationCap size={18} />
            {!collapsed && <span>Categorie</span>}
          </Link>
          <Link
            href={buildUrl("/medical")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/medical" && "bg-blue-500/50",
            )}
          >
            <Stethoscope size={18} />
            {!collapsed && <span>Certificati</span>}
          </Link>
        </div>

        {/* ATTIVITÀ Section */}
        {!collapsed && (
          <div className="text-sm font-bold text-blue-200 mb-2">ATTIVITÀ</div>
        )}
        <div className="space-y-1 mb-6">
          <Link
            href={buildUrl("/training")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/training" && "bg-blue-500/50",
            )}
          >
            <CalendarDays size={18} />
            {!collapsed && <span>Allenamenti</span>}
          </Link>
          <Link
            href={buildUrl("/matches")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/matches" && "bg-blue-500/50",
            )}
          >
            <Trophy size={18} />
            {!collapsed && <span>Gare</span>}
          </Link>
        </div>

        {/* CONTABILITÀ Section */}
        {!collapsed && (
          <div className="text-sm font-bold text-blue-200 mb-2">
            CONTABILITÀ
          </div>
        )}
        <div className="space-y-1 mb-6">
          <Link
            href={buildUrl("/registration-management")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/registration-management" && "bg-blue-500/50",
            )}
          >
            <Receipt size={18} />
            {!collapsed && <span>Gestione Iscrizioni</span>}
          </Link>
          <Link
            href={buildUrl("/movements")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/movements" && "bg-blue-500/50",
            )}
          >
            <Wallet size={18} />
            {!collapsed && <span>Movimenti</span>}
          </Link>
          <Link
            href={buildUrl("/payments")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/payments" && "bg-blue-500/50",
            )}
          >
            <CreditCard size={18} />
            {!collapsed && <span>Pagamenti</span>}
          </Link>
        </div>

        {/* Other items */}
        <div className="space-y-1">
          <Link
            href={buildUrl("/secretariat")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/secretariat" && "bg-blue-500/50",
            )}
          >
            <FileText size={18} />
            {!collapsed && <span>Segreteria</span>}
          </Link>
          <Link
            href={buildUrl("/notifications")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/notifications" && "bg-blue-500/50",
            )}
          >
            <MessageSquare size={18} />
            {!collapsed && <span>Notifiche</span>}
          </Link>
          <Link
            href={buildUrl("/reports")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/reports" && "bg-blue-500/50",
            )}
          >
            <PieChart size={18} />
            {!collapsed && <span>Report</span>}
          </Link>
          <Link
            href={buildUrl("/settings")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/settings" && "bg-blue-500/50",
            )}
          >
            <Settings size={18} />
            {!collapsed && <span>Impostazioni</span>}
          </Link>
          <Link
            href={buildUrl("/permissions")}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
              pathname === "/permissions" && "bg-blue-500/50",
            )}
          >
            <Lock size={18} />
            {!collapsed && <span>Permessi</span>}
          </Link>
        </div>
      </nav>

      {!collapsed && (
        <div className="mt-auto p-4 border-t border-blue-500">
          <div className="flex justify-center space-x-6 mb-4">
            <a
              href="#"
              className="text-white hover:text-blue-200 transition-colors"
            >
              <Instagram size={20} />
            </a>
            <a
              href="#"
              className="text-white hover:text-blue-200 transition-colors"
            >
              <Facebook size={20} />
            </a>
            <a
              href="#"
              className="text-white hover:text-blue-200 transition-colors"
            >
              <Twitter size={20} />
            </a>
          </div>
          {/* Chat button moved to header */}
          <button
            onClick={() => router.push("/account")}
            className="w-full flex items-center justify-center gap-2 bg-white text-blue-600 rounded-md px-3 py-2 hover:bg-blue-50 transition-colors font-medium"
          >
            <LogOut size={18} />
            <span>Torna al mio account</span>
          </button>
          <p className="text-xs text-center text-blue-200 mt-2">
            powered by Francesco srl
          </p>
        </div>
      )}
      {collapsed && (
        <div className="mt-auto p-2 border-t border-blue-500">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.push("/account")}
              className="w-full flex items-center justify-center bg-white text-blue-600 rounded-md p-2 hover:bg-blue-50 transition-colors"
              title="Torna al mio account"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
});

Sidebar.displayName = "Sidebar";

export default Sidebar;
