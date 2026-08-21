"use client";

import React, { memo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Mail,
  Stethoscope,
  Trophy,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { useParentDashboard } from "./parent-dashboard-context";

const ParentSidebar = memo(() => {
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = usePathname() || "";
  const router = useRouter();
  const { signOut } = useAuth();
  const { athleteRouteId } = useParentDashboard();

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
        { href: `${basePath}/documents`, label: "Documenti", icon: FileText },
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
      className={`flex h-screen ${collapsed ? "w-[80px]" : "w-[320px]"} flex-col overflow-hidden bg-gradient-to-b from-blue-600 to-blue-800 text-white transition-all duration-300`}
    >
      <div className="mb-6 flex flex-col items-center px-4 py-4">
        <div className="flex items-center gap-4">
          <div className="relative h-10 w-10">
            <Image
              src="https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png"
              alt="EasyGame Logo"
              width={40}
              height={40}
              className="object-contain"
              unoptimized
            />
          </div>
          {!collapsed ? (
            <h1 className="text-xl font-bold text-white">EasyGame</h1>
          ) : null}
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
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-blue-500/50",
                      isActive && "bg-blue-500/50",
                    )}
                  >
                    <Icon size={18} />
                    {!collapsed ? <span>{item.label}</span> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed ? (
        <div className="mt-auto border-t border-blue-500 p-4">
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
        <div className="mt-auto border-t border-blue-500 p-2">
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
