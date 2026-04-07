"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Home,
  LifeBuoy,
  Loader2,
  LogOut,
  Menu,
  ShieldCheck,
  Trophy,
  Users,
  UserCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  getFirstAccessibleTrainerRoute,
  TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY,
  type TrainerNavigationPermissionKey,
} from "@/lib/trainer-dashboard-permissions";

const EASYGAME_LOGO = "/logo-blu.png";

const NAV_ITEMS: Array<{
  key: TrainerNavigationPermissionKey;
  label: string;
  description: string;
  href: string;
  icon: typeof Home;
}> = [
  {
    key: "home",
    label: "Dashboard",
    description: "Panoramica operativa",
    href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.home,
    icon: Home,
  },
  {
    key: "trainings",
    label: "Allenamenti",
    description: "Le tue categorie",
    href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.trainings,
    icon: CalendarDays,
  },
  {
    key: "matches",
    label: "Gare",
    description: "Partite assegnate",
    href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.matches,
    icon: Trophy,
  },
  {
    key: "athletes",
    label: "Atleti",
    description: "Roster filtrato",
    href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.athletes,
    icon: Users,
  },
  {
    key: "categories",
    label: "Categorie",
    description: "Le tue categorie",
    href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY.categories,
    icon: FolderKanban,
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/trainer-dashboard": "Dashboard Allenatore",
  "/trainer-dashboard/trainings": "Allenamenti",
  "/trainer-dashboard/matches": "Gare",
  "/trainer-dashboard/athletes": "Atleti",
  "/trainer-dashboard/categories": "Categorie",
};

const getCurrentNavigationKey = (pathname: string) => {
  const orderedItems = [...NAV_ITEMS].sort(
    (left, right) => right.href.length - left.href.length,
  );

  const match = orderedItems.find((item) =>
    item.href === "/trainer-dashboard"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return match?.key || null;
};

const getInitials = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk.charAt(0).toUpperCase())
    .join("");

function TrainerSidebarContent({
  collapsed,
  onNavigate,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    activeClub,
    assignedAthletes,
    assignedCategories,
    permissions,
    signOut,
    trainerProfile,
  } = useTrainerDashboard();

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => permissions.navigation[item.key],
  );

  const handleSignOut = async () => {
    onNavigate?.();
    await signOut();
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-gradient-to-b from-blue-600 via-blue-700 to-blue-900 text-white transition-all duration-300",
        collapsed ? "w-[86px]" : "w-[320px]",
      )}
    >
      <div className="border-b border-white/10 px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Image
              src={EASYGAME_LOGO}
              alt="EasyGame"
              fill
              className="object-contain p-2"
            />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">EasyGame</p>
              <p className="truncate text-sm text-blue-100">
                Dashboard Allenatore
              </p>
            </div>
          ) : null}
        </div>

        <div className={cn("mt-4 flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white/90">
                {activeClub?.name || "Club"}
              </p>
              <p className="truncate text-xs text-blue-100">
                {trainerProfile?.name || "Profilo trainer"}
              </p>
            </div>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapsed}
            className="h-9 w-9 rounded-full text-white hover:bg-white/10 hover:text-white"
            title={collapsed ? "Espandi menu" : "Comprimi menu"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/trainer-dashboard" && pathname.startsWith(item.href));

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                router.push(item.href);
                onNavigate?.();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all",
                isActive
                  ? "border-white/25 bg-white/14 shadow-lg shadow-blue-950/15"
                  : "border-transparent hover:border-white/10 hover:bg-white/10",
                collapsed ? "justify-center" : "justify-start",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.label}</p>
                  <p className="truncate text-xs text-blue-100">
                    {item.description}
                  </p>
                </div>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="space-y-4 border-t border-white/10 px-4 py-5">
        {!collapsed ? (
          <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-blue-100" />
              Permessi attivi
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="border-white/20 bg-white/12 text-white hover:bg-white/12">
                {assignedCategories.length} categorie
              </Badge>
              <Badge className="border-white/20 bg-white/12 text-white hover:bg-white/12">
                {assignedAthletes.length} atleti
              </Badge>
              {permissions.actions.manageAttendance ? (
                <Badge className="border-emerald-300/30 bg-emerald-400/20 text-emerald-50 hover:bg-emerald-400/20">
                  Presenze abilitate
                </Badge>
              ) : null}
              {permissions.actions.manageConvocations ? (
                <Badge className="border-amber-300/30 bg-amber-400/20 text-amber-50 hover:bg-amber-400/20">
                  Convocazioni abilitate
                </Badge>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Button
            variant="ghost"
            className={cn(
              "w-full rounded-2xl text-white hover:bg-white/10 hover:text-white",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={() => {
              router.push("/account");
              onNavigate?.();
            }}
          >
            <ArrowLeftRight className="mr-0 h-4 w-4 shrink-0" />
            {!collapsed ? <span className="ml-3">Home account</span> : null}
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "w-full rounded-2xl text-white hover:bg-white/10 hover:text-white",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={handleSignOut}
          >
            <LogOut className="mr-0 h-4 w-4 shrink-0" />
            {!collapsed ? <span className="ml-3">Esci</span> : null}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function TrainerTopBar({
  onOpenMobileMenu,
}: {
  onOpenMobileMenu: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeClub, signOut, trainerProfile, user } = useTrainerDashboard();

  const pageTitle = PAGE_TITLES[pathname] || "Dashboard Allenatore";
  const trainerName =
    trainerProfile?.name || user?.user_metadata?.name || "Allenatore";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-9xl items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-2xl border-slate-200 lg:hidden"
            onClick={onOpenMobileMenu}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
              EasyGame Trainer
            </p>
            <h1 className="truncate text-2xl font-semibold text-slate-900">
              {pageTitle}
            </h1>
            <p className="truncate text-sm text-slate-500">
              {activeClub?.name || "Club"} · accesso allenatore
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="hidden rounded-2xl border-slate-200 md:inline-flex"
            onClick={() => router.push("/account")}
          >
            <LifeBuoy className="mr-2 h-4 w-4" />
            Assistenza
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-12 rounded-2xl border-slate-200 px-3"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={trainerProfile?.avatar || undefined}
                    alt={trainerName}
                  />
                  <AvatarFallback className="bg-blue-100 text-blue-700">
                    {getInitials(trainerName)}
                  </AvatarFallback>
                </Avatar>
                <div className="ml-3 hidden min-w-0 text-left md:block">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {trainerName}
                  </p>
                  <p className="truncate text-xs text-slate-500">Allenatore</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl">
              <DropdownMenuLabel className="space-y-1">
                <p className="font-semibold text-slate-900">{trainerName}</p>
                <p className="text-xs font-normal text-slate-500">
                  {user?.email || "Account EasyGame"}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/account")}>
                <UserCircle2 className="mr-2 h-4 w-4" />
                Apri account
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/trainer-dashboard")}
              >
                <Home className="mr-2 h-4 w-4" />
                Dashboard allenatore
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void signOut();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export default function TrainerDashboardLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { activeClub, loading, permissions, trainerProfile } =
    useTrainerDashboard();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedState = localStorage.getItem("trainer-sidebar-collapsed");
    if (storedState === "true") {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    const allowedPath = getCurrentNavigationKey(pathname);

    if (allowedPath && !permissions.navigation[allowedPath]) {
      router.replace(getFirstAccessibleTrainerRoute(permissions));
    }
  }, [loading, pathname, permissions, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_38%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-6">
        <div className="flex items-center gap-3 rounded-3xl border border-white/70 bg-white/90 px-6 py-5 text-slate-600 shadow-2xl">
          <Loader2 className="h-5 w-5 animate-spin" />
          Caricamento dashboard allenatore...
        </div>
      </div>
    );
  }

  if (!activeClub?.id) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_36%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_52%,#f8fafc_100%)]">
      <div className="hidden lg:block">
        <TrainerSidebarContent
          collapsed={collapsed}
          onToggleCollapsed={() => {
            const nextValue = !collapsed;
            setCollapsed(nextValue);
            localStorage.setItem("trainer-sidebar-collapsed", String(nextValue));
          }}
        />
      </div>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TrainerTopBar onOpenMobileMenu={() => setMobileSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <div className="mx-auto max-w-9xl">
            {!trainerProfile ? (
              <div className="rounded-[32px] border border-amber-200 bg-white/90 px-6 py-10 shadow-xl">
                <div className="mx-auto max-w-2xl text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-600">
                    Profilo non collegato
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-slate-900">
                    L&apos;accesso al club è attivo, ma manca ancora il collegamento
                    con la scheda allenatore.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Chiedi al club di generare il token dalla tua scheda
                    allenatore e riscattalo dalla tua home account. Appena il
                    collegamento sarà completato, qui vedrai soltanto categorie,
                    allenamenti e gare assegnate a te.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <Button
                      className="rounded-2xl"
                      onClick={() => router.push("/account")}
                    >
                      Torna alla home account
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          side="left"
          className="w-[320px] border-none bg-transparent p-0 sm:max-w-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu dashboard allenatore</SheetTitle>
          </SheetHeader>
          <TrainerSidebarContent
            collapsed={false}
            onNavigate={() => setMobileSidebarOpen(false)}
            onToggleCollapsed={() => setMobileSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
