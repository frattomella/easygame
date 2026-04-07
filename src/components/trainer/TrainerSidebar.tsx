"use client";

import React, { memo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  UserCircle,
  GraduationCap,
  CalendarDays,
  Trophy,
  LogOut,
  Sparkles,
} from "lucide-react";

const TrainerSidebar = memo(() => {
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { permissions, signOut } = useTrainerDashboard();

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedState = localStorage.getItem("trainer-sidebar-collapsed");
    const isMobile = window.innerWidth < 768;

    if (savedState === "true" || isMobile) {
      setCollapsed(true);
    }

    const handleResize = () => {
      if (window.innerWidth < 768 && !collapsed) {
        setCollapsed(true);
        localStorage.setItem("trainer-sidebar-collapsed", "true");
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    const nextState = !collapsed;
    setCollapsed(nextState);
    localStorage.setItem("trainer-sidebar-collapsed", String(nextState));
  }, [collapsed]);

  const navSections = [
    {
      label: "CLUB",
      items: permissions.navigation.home
        ? [{ href: "/trainer-dashboard", label: "Dashboard", icon: Home }]
        : [],
    },
    {
      label: "TESSERATI",
      items: [
        permissions.navigation.athletes
          ? {
              href: "/trainer-dashboard/athletes",
              label: "Atleti",
              icon: UserCircle,
            }
          : null,
        permissions.navigation.categories
          ? {
              href: "/trainer-dashboard/categories",
              label: "Categorie",
              icon: GraduationCap,
            }
          : null,
      ].filter(Boolean) as Array<{
        href: string;
        label: string;
        icon: typeof Home;
      }>,
    },
    {
      label: "ATTIVITÀ",
      items: [
        permissions.navigation.trainings
          ? {
              href: "/trainer-dashboard/trainings",
              label: "Allenamenti",
              icon: CalendarDays,
            }
          : null,
        permissions.navigation.matches
          ? {
              href: "/trainer-dashboard/matches",
              label: "Gare",
              icon: Trophy,
            }
          : null,
      ].filter(Boolean) as Array<{
        href: string;
        label: string;
        icon: typeof Home;
      }>,
    },
  ].filter((section) => section.items.length > 0);

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
            href="/trainer-dashboard"
            className={cn(
              "flex items-center gap-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-3 shadow-lg transition-all hover:from-purple-600 hover:to-pink-600",
              pathname === "/trainer-dashboard" && "ring-2 ring-white/50",
            )}
          >
            <Sparkles size={20} className="text-white" />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-white">Area Allenatore</span>
                <span className="text-xs text-white/80">
                  Dashboard tecnica personale
                </span>
              </div>
            )}
          </Link>
        </div>

        {navSections.map((section) => (
          <div key={section.label} className="mb-6">
            {!collapsed && (
              <div className="text-sm font-bold text-blue-200 mb-2">
                {section.label}
              </div>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/trainer-dashboard" &&
                    pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-blue-500/50 transition-colors",
                      isActive && "bg-blue-500/50",
                    )}
                  >
                    <Icon size={18} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="mt-auto p-4 border-t border-blue-500">
          <button
            onClick={() => router.push("/account")}
            className="w-full flex items-center justify-center gap-2 bg-white text-blue-600 rounded-md px-3 py-2 hover:bg-blue-50 transition-colors font-medium"
          >
            <LogOut size={18} />
            <span>Torna al mio account</span>
          </button>
          <button
            onClick={() => {
              void signOut();
            }}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-md border border-white/20 px-3 py-2 text-white hover:bg-blue-500/40 transition-colors font-medium"
          >
            <LogOut size={18} />
            <span>Esci</span>
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

TrainerSidebar.displayName = "TrainerSidebar";

export default TrainerSidebar;
