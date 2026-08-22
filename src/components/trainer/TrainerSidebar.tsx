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
  CalendarDays,
  Trophy,
  LogOut,
} from "lucide-react";
import { EasyGameLogo } from "@/components/brand/easygame-logo";

const TrainerSidebar = memo(() => {
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = usePathname() || "";
  const router = useRouter();
  const { permissions } = useTrainerDashboard();

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
        ? [{ href: "/trainer-dashboard", label: "Home", icon: Home }]
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
      className={`flex h-[100dvh] ${collapsed ? "w-[80px]" : "w-[320px]"} flex-col bg-gradient-to-b from-blue-600 to-blue-800 text-white transition-all duration-300 overflow-hidden relative`}
    >
      <div className="mb-6 flex items-center flex-col py-4 px-4">
        <div className="flex items-center gap-4">
          <EasyGameLogo tone="light" className="h-10 w-10 shrink-0" />
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
              title="Esci"
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
