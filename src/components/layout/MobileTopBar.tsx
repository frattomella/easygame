"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  UserCircle,
  Home,
  Building,
  Users,
  Dumbbell,
  Calendar,
  Trophy,
  Settings,
  FileHeart,
  FileText,
  Shield,
  CreditCard,
  ClipboardList,
  Bell,
  BarChart3,
  FolderKanban,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { ClubIdentity } from "@/components/brand/club-identity";

const navSections = [
  {
    id: "club",
    label: "CLUB",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home },
      { href: "/organization", label: "Club", icon: Building },
      { href: "/staff", label: "Staff", icon: Users },
      { href: "/soci", label: "Soci", icon: Users },
      { href: "/sponsors", label: "Sponsor", icon: Building },
      { href: "/modulistica", label: "Modulistica", icon: FileText },
      { href: "/procura", label: "Procura", icon: Shield },
    ],
  },
  {
    id: "tesserati",
    label: "TESSERATI",
    items: [
      { href: "/athletes", label: "Atleti", icon: Users },
      { href: "/trainers", label: "Allenatori", icon: Users },
      { href: "/categories", label: "Categorie", icon: FolderKanban },
      { href: "/medical", label: "Certificati", icon: FileHeart },
    ],
  },
  {
    id: "attivita",
    label: "ATTIVITÀ",
    items: [
      { href: "/training", label: "Allenamenti", icon: Dumbbell },
      { href: "/matches", label: "Gare", icon: Trophy },
    ],
  },
  {
    id: "contabilita",
    label: "CONTABILITÀ",
    items: [
      {
        href: "/registration-management",
        label: "Gestione Iscrizioni",
        icon: CreditCard,
      },
      { href: "/movements", label: "Movimenti", icon: CreditCard },
    ],
  },
  {
    id: "altro",
    label: "ALTRO",
    items: [
      { href: "/secretariat", label: "Segreteria", icon: ClipboardList },
      { href: "/notifications", label: "Notifiche", icon: Bell },
      { href: "/reports", label: "Report", icon: BarChart3 },
      { href: "/settings", label: "Impostazioni", icon: Settings },
      { href: "/permissions", label: "Permessi", icon: Shield },
    ],
  },
];

export type MobileNavSection = {
  id: string;
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: LucideIcon;
  }>;
};

interface MobileTopBarProps {
  showHubLink?: boolean;
  title?: string;
  navSectionsOverride?: MobileNavSection[];
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  showHubLink = true,
  title,
  navSectionsOverride,
}) => {
  const { user, activeClub } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [clubId, setClubId] = useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlClubId = urlParams.get("clubId");

    if (urlClubId) {
      setClubId(urlClubId);
      return;
    }

    const activeClub = localStorage.getItem("activeClub");
    if (!activeClub) {
      return;
    }

    try {
      const parsedClub = JSON.parse(activeClub);
      if (parsedClub?.id) {
        setClubId(parsedClub.id);
      }
    } catch (error) {
      console.error("Error parsing active club:", error);
    }
  }, []);

  const buildUrl = useMemo(
    () => (href: string) => {
      if (!clubId) {
        return href;
      }

      const separator = href.includes("?") ? "&" : "?";
      return `${href}${separator}clubId=${clubId}`;
    },
    [clubId],
  );

  const handleProfileClick = () => {
    if (user?.id) {
      router.push(`/profile/${user.id}`);
    }
  };

  const visibleNavSections = navSectionsOverride || navSections;

  return (
    <>
      {/*
        Su telefono lo spazio e poco e va speso su cosa serve davvero sapere:
        in che club sei e in che stagione. Prima la barra ripeteva "EasyGame",
        che e sempre vero e quindi non informa.
      */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
        <ClubIdentity
          compact
          clubName={activeClub?.name || "EasyGame"}
          seasonLabel={activeClub?.activeSeasonLabel || null}
          logoUrl={activeClub?.logo_url || null}
          className="min-w-0 flex-1"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-slate-600"
          onClick={handleProfileClick}
          aria-label="Profilo"
        >
          <UserCircle className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-slate-600"
          onClick={() => setMenuOpen(true)}
          aria-label="Apri il menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {title ? (
        <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 lg:hidden">
          {title}
        </p>
      ) : null}

      {/* Navigation sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 max-w-[86vw] p-0">
          <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-6">
            {showHubLink ? (
              <div className="mb-4">
                <Link
                  href={buildUrl("/hub")}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-3 shadow-md transition-all hover:from-purple-600 hover:to-pink-600"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <Home className="h-4 w-4 text-white" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">
                      EasyGame HUB
                    </span>
                    <span className="text-[11px] text-white/80">
                      Marketplace e servizi per il tuo club
                    </span>
                  </div>
                </Link>
              </div>
            ) : null}

            <nav className="space-y-4">
              {visibleNavSections.map((section) => (
                <div key={section.id}>
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {section.label}
                  </p>
                  <div className="mt-1 space-y-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={buildUrl(item.href)}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <Icon className="h-4 w-4" />
                          <span className="font-medium text-sm">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
