"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  UserCircle,
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
  CreditCard,
  ClipboardList,
  Bell,
  BarChart3,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/components/providers/AuthProvider";
import logoBianco from "@/logo-bianco.png";

const quickActions = [
  {
    id: "new-athlete",
    label: "Nuovo Atleta",
    href: "/athletes?action=new",
  },
  {
    id: "register-certificate",
    label: "Registra Certificato Medico",
    href: "/medical?action=new",
  },
  {
    id: "new-training",
    label: "Nuovo Allenamento",
    href: "/training?action=new",
  },
  {
    id: "new-match",
    label: "Nuova Gara",
    href: "/matches?action=new",
  },
];

const navSections = [
  {
    id: "club",
    label: "CLUB",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home },
      { href: "/organization", label: "Organizzazione", icon: Building },
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

interface MobileTopBarProps {
  showQuickActions?: boolean;
  title?: string;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  showQuickActions = true,
  title,
}) => {
  const { user } = useAuth();
  const router = useRouter();
  const [quickOpen, setQuickOpen] = useState(false);
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

  const handleQuickAction = (href: string) => {
    setQuickOpen(false);
    router.push(buildUrl(href));
  };

  const handleProfileClick = () => {
    if (user?.id) {
      router.push(`/profile/${user.id}`);
    }
  };

  return (
    <>
      <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-3 text-white shadow-md lg:hidden">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8 rounded-lg overflow-hidden bg-white/10">
            <Image
              src={logoBianco}
              alt="EasyGame Logo"
              fill
              className="object-contain p-1"
            />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold">EasyGame</span>
            {title ? (
              <span className="block truncate text-[11px] text-blue-100">
                {title}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Quick actions */}
          {showQuickActions ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => setQuickOpen(true)}
            >
              <Zap className="h-5 w-5" />
            </Button>
          ) : null}

          {/* Profile */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={handleProfileClick}
          >
            <UserCircle className="h-6 w-6" />
          </Button>

          {/* Burger menu */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
      </header>

      {/* Quick actions sheet */}
      <Sheet open={quickOpen} onOpenChange={setQuickOpen}>
        <SheetContent side="right" className="w-80 max-w-[92vw] p-0">
          <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <SheetTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />
              Azioni Rapide
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 pb-6">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.href)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Navigation sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 max-w-[86vw] p-0">
          <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-6">
            {/* EasyGame HUB featured link */}
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

            <nav className="space-y-4">
              {navSections.map((section) => (
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
