"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  UserCircle,
  HelpCircle,
  UserPlus,
  Zap,
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
  ShieldCheck,
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
import { EasyGameLogo } from "@/components/brand/easygame-logo";
import { canAccessPath } from "@/lib/access-roles";

/**
 * Le stesse azioni rapide della topbar desktop.
 *
 * Su telefono non hanno un pulsante proprio nella barra — lo spazio va speso
 * su club e stagione — ma vivono in cima al menu, dove non costano larghezza.
 */
const quickActions = [
  { id: "new-athlete", label: "Nuovo atleta", icon: UserPlus, href: "/athletes/new" },
  {
    id: "register-certificate",
    label: "Registra certificato medico",
    icon: FileHeart,
    href: "/medical?action=new",
  },
  {
    id: "new-training",
    label: "Nuovo allenamento",
    icon: Calendar,
    href: "/training?action=new",
  },
  { id: "new-match", label: "Nuova gara", icon: Trophy, href: "/matches?action=new" },
  {
    id: "new-payment",
    label: "Registra pagamento",
    icon: CreditCard,
    href: "/movements?action=new",
  },
] as const;

const HELP_URL = "https://www.cedisoft.it/contatti/";

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
      { href: "/consensi", label: "Consensi", icon: ShieldCheck },
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

  const handleQuickAction = (href: string) => {
    setMenuOpen(false);
    router.push(buildUrl(href));
  };

  const activeRole = activeClub?.role || user?.user_metadata?.role;
  const visibleQuickActions = useMemo(
    () =>
      quickActions.filter((action) =>
        canAccessPath(activeRole, action.href.split("?")[0]),
      ),
    [activeRole],
  );

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
            <SheetTitle className="flex items-center gap-2">
              <EasyGameLogo className="h-6 w-6 shrink-0" />
              EasyGame
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-6">
            {visibleQuickActions.length ? (
              <div className="mb-4">
                <p className="eg-eyebrow px-2 text-gray-500">Azioni rapide</p>
                <div className="mt-1 space-y-1">
                  {visibleQuickActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleQuickAction(action.href)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                    >
                      <action.icon className="h-4 w-4" />
                      <span className="font-medium">{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

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
                    <span className="text-xs text-white/80">
                      Marketplace e servizi per il tuo club
                    </span>
                  </div>
                </Link>
              </div>
            ) : null}

            <nav className="space-y-4">
              {visibleNavSections.map((section) => (
                <div key={section.id}>
                  <p className="eg-eyebrow px-2 text-gray-500 dark:text-gray-400">
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

            <div className="mt-4 border-t pt-4">
              <a
                href={HELP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
              >
                <HelpCircle className="h-4 w-4" />
                <span className="font-medium">Assistenza</span>
              </a>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
