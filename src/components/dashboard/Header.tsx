"use client";

import React, { memo, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  FileHeart,
  HelpCircle,
  LogOut,
  Trophy,
  UserCircle,
  UserPlus,
  Zap,
} from "lucide-react";
import { Button } from "../ui/button";
import { usePathname, useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import Image from "next/image";
import { useAuth } from "../providers/AuthProvider";
import { NotificationsDropdown } from "../ui/notifications-dropdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import {
  MobileTopBar,
  type MobileNavSection,
} from "@/components/layout/MobileTopBar";
import { EntityIcon } from "@/components/ui/entity-icon";
import {
  canAccessPath,
  getAccessRedirectPath,
  getPathAccessArea,
} from "@/lib/access-roles";

// Import default club logo
import clubLogoDefault from "@/../public/images/club_logo.png";

const ChatButton = dynamic<{ className?: string }>(
  () => import("../ui/chat").then((module) => module.ChatButton),
  { ssr: false },
);

const topBarButtonClassName =
  "relative h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900";
const quickActionClubButtonClassName =
  "relative h-10 shrink-0 rounded-full border border-blue-400/40 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 bg-[length:200%_200%] bg-[position:0%_50%] px-4 text-white shadow-md shadow-blue-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-[position:100%_50%] hover:text-white hover:shadow-lg hover:shadow-blue-500/25 focus-visible:ring-blue-500";

interface HeaderProps {
  title?: string;
  onSearch?: (query: string) => void;
  notificationCount?: number;
  userAvatar?: string;
  searchQuery?: string;
  showQuickActions?: boolean;
  mobileNavSections?: MobileNavSection[];
  showMobileHubLink?: boolean;
}

// Quick Actions data
const quickActions = [
  {
    id: "new-athlete",
    label: "Nuovo Atleta",
    icon: UserPlus,
    href: "/athletes?action=new",
    color: "bg-blue-500",
  },
  {
    id: "register-certificate",
    label: "Registra Certificato Medico",
    icon: FileHeart,
    href: "/medical?action=new",
    color: "bg-red-500",
  },
  {
    id: "new-training",
    label: "Nuovo Allenamento",
    icon: Calendar,
    href: "/training?action=new",
    color: "bg-green-500",
  },
  {
    id: "new-match",
    label: "Nuova Gara",
    icon: Trophy,
    href: "/matches?action=new",
    color: "bg-orange-500",
  },
  {
    id: "new-payment",
    label: "Registra Pagamento",
    icon: CreditCard,
    href: "/movements?action=new",
    color: "bg-purple-500",
  },
];

const Header = memo(
  ({
    title = "Dashboard",
    onSearch = () => {},
    notificationCount = 0,
    userAvatar = "",
    searchQuery = "",
    showQuickActions = true,
    mobileNavSections,
    showMobileHubLink = true,
  }: HeaderProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const [orgName, setOrgName] = React.useState("EasyGame");
    const [activeSeasonLabel, setActiveSeasonLabel] = React.useState<
      string | null
    >(null);
    const [quickActionsOpen, setQuickActionsOpen] = useState(false);

    const {
      activeClub,
      accessLoading,
      isTrainer,
      loading: authLoading,
      user,
      userRole,
    } = useAuth();
    const fullName = [
      user?.user_metadata?.firstName,
      user?.user_metadata?.lastName,
    ]
      .filter(Boolean)
      .join(" ");
    const userName = String(
      fullName ||
      user?.user_metadata?.name ||
      user?.user_metadata?.firstName ||
      user?.email?.split("@")[0] ||
      "Account EasyGame",
    );
    const accountAvatar =
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      userAvatar;
    const accountInitials = userName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("");

    React.useEffect(() => {
      if (typeof window !== "undefined") {
        // Immediately load club info from localStorage
        const loadClubInfo = () => {
          // First check user-specific active club if user is available
          if (user?.id) {
            const userSpecificClub = localStorage.getItem(
              `activeClub_${user.id}`,
            );
            if (userSpecificClub) {
              try {
                const parsedClub = JSON.parse(userSpecificClub);
                if (parsedClub.name) {
                  setOrgName(parsedClub.name);
                  setActiveSeasonLabel(parsedClub.activeSeasonLabel || null);
                  return true;
                }
              } catch (e) {
                console.error("Error parsing user-specific active club:", e);
              }
            }
          }

          // Get active club from localStorage (generic)
          const activeClub = localStorage.getItem("activeClub");
          if (activeClub) {
            try {
              const parsedClub = JSON.parse(activeClub);
              if (parsedClub.name) {
                setOrgName(parsedClub.name);
                setActiveSeasonLabel(parsedClub.activeSeasonLabel || null);
                return true; // Successfully loaded
              }
            } catch (e) {
              console.error("Error parsing active club:", e);
            }
          }

          // Fallback to stored organization name
          const storedOrgName = localStorage.getItem("organization-name");
          if (storedOrgName) {
            setOrgName(storedOrgName);
            return true;
          }
          return false;
        };

        // Load immediately
        loadClubInfo();

        // Listen for custom events to update immediately
        const handleClubUpdate = (event: CustomEvent) => {
          if (event.detail?.clubData) {
            const { name, activeSeasonLabel: nextSeasonLabel } =
              event.detail.clubData;
            if (name) setOrgName(name);
            setActiveSeasonLabel(nextSeasonLabel || null);
          }
        };

        // Listen for storage changes from other tabs/windows
        const handleStorageChange = (event: StorageEvent) => {
          if (
            event.key === "activeClub" ||
            event.key === "organization-name" ||
            (user?.id && event.key === `activeClub_${user.id}`)
          ) {
            loadClubInfo();
          }
        };

        window.addEventListener(
          "club-updated",
          handleClubUpdate as EventListener,
        );
        window.addEventListener("storage", handleStorageChange);

        return () => {
          window.removeEventListener(
            "club-updated",
            handleClubUpdate as EventListener,
          );
          window.removeEventListener("storage", handleStorageChange);
        };
      }
    }, [user?.id]);

    // Get club logo from localStorage
    const getClubLogo = () => {
      if (typeof window !== "undefined") {
        // First check user-specific active club if user is available
        if (user?.id) {
          const userSpecificClub = localStorage.getItem(
            `activeClub_${user.id}`,
          );
          if (userSpecificClub) {
            try {
              const parsedClub = JSON.parse(userSpecificClub);
              return parsedClub.logo_url || null;
            } catch (e) {
              console.error(
                "Error parsing user-specific active club for logo:",
                e,
              );
            }
          }
        }

        // Fallback to generic active club
        const activeClub = localStorage.getItem("activeClub");
        if (activeClub) {
          try {
            const parsedClub = JSON.parse(activeClub);
            return parsedClub.logo_url || null;
          } catch (e) {
            console.error("Error parsing active club for logo:", e);
          }
        }
        // Fallback to organization logo from localStorage
        const orgLogo = localStorage.getItem("organization-logo");
        if (orgLogo) {
          return orgLogo;
        }
      }
      return null;
    };

    const [clubLogo, setClubLogo] = React.useState<string | null>(null);

    // Update club logo when component mounts or active club changes
    React.useEffect(() => {
      if (typeof window !== "undefined") {
        // Immediately load logo
        const logo = getClubLogo();
        setClubLogo(logo);

        // Listen for storage changes to update logo when activeClub changes
        const handleStorageChange = (event?: StorageEvent) => {
          if (
            !event ||
            event.key === "activeClub" ||
            (user?.id && event.key === `activeClub_${user.id}`)
          ) {
            const newLogo = getClubLogo();
            setClubLogo(newLogo);
          }
        };

        // Listen for custom events to update immediately
        const handleClubUpdate = (event: CustomEvent) => {
          if (event.detail?.clubData) {
            const { logo_url } = event.detail.clubData;
            setClubLogo(logo_url || null);
          }
        };

        window.addEventListener("storage", handleStorageChange);
        window.addEventListener(
          "club-updated",
          handleClubUpdate as EventListener,
        );

        return () => {
          window.removeEventListener("storage", handleStorageChange);
          window.removeEventListener(
            "club-updated",
            handleClubUpdate as EventListener,
          );
        };
      }
    }, []);

    React.useEffect(() => {
      if (
        authLoading ||
        accessLoading ||
        !pathname ||
        getPathAccessArea(pathname) !== "management"
      ) {
        return;
      }

      const role = activeClub?.role || userRole || user?.user_metadata?.role;
      if (!canAccessPath(role, pathname)) {
        router.replace(
          getAccessRedirectPath(role, {
            organizationId: activeClub?.id,
            linkedAthleteId: activeClub?.linkedAthleteId,
          }),
        );
      }
    }, [
      accessLoading,
      activeClub?.id,
      activeClub?.linkedAthleteId,
      activeClub?.role,
      authLoading,
      pathname,
      router,
      user?.user_metadata?.role,
      userRole,
    ]);

    const handleNotificationClick = useCallback(() => {
      const notificationsHref = pathname?.startsWith("/trainer-dashboard")
        ? "/trainer-dashboard/notifications"
        : "/notifications";

      // Prevent navigation in storyboard environment
      if (
        typeof window !== "undefined" &&
        !window.location.href.includes("storyboard=true") &&
        window.location.pathname !== notificationsHref
      ) {
        window.location.href = notificationsHref;
      }
    }, [pathname]);

    const handleQuickAction = (href: string) => {
      setQuickActionsOpen(false);
      router.push(href);
    };

    const handleReturnToAccount = () => {
      router.push("/account");
    };

    const handleHelpClick = () => {
      window.open("https://www.cedisoft.it/contatti/", "_blank");
    };

    const handleBackNavigation = useCallback(() => {
      if (typeof window !== "undefined") {
        window.history.back();
        return;
      }
      router.back();
    }, [router]);

    const isTrainerHeaderContext =
      pathname?.startsWith("/trainer-dashboard") ||
      isTrainer ||
      String(activeClub?.role || "").toLowerCase() === "trainer";
    const backButtonClassName = isTrainerHeaderContext
      ? "shrink-0 rounded-full border border-border/70 text-foreground hover:bg-muted"
      : topBarButtonClassName;
    const quickActionButtonClassName = isTrainerHeaderContext
      ? "relative bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-[length:200%_200%] bg-[position:0%_50%] text-white transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-[position:100%_50%] hover:text-white hover:shadow-lg hover:shadow-blue-500/25"
      : quickActionClubButtonClassName;
    const helpButtonClassName = isTrainerHeaderContext
      ? "text-muted-foreground hover:text-foreground"
      : topBarButtonClassName;
    const accountButtonClassName = isTrainerHeaderContext
      ? "h-10 w-10 rounded-full border border-slate-200 bg-white p-0 hover:bg-slate-50"
      : topBarButtonClassName;
    const sharedActionButtonClassName = isTrainerHeaderContext
      ? "relative"
      : topBarButtonClassName;

    return (
      <>
        <div className="lg:hidden">
          <MobileTopBar
            showQuickActions={showQuickActions}
            showHubLink={showMobileHubLink}
            title={title}
            navSectionsOverride={mobileNavSections}
          />
        </div>

        <header className="sticky top-0 z-10 hidden h-20 w-full items-center justify-between border-b border-border bg-background px-4 py-4 md:px-6 lg:flex">
          <div className="flex min-w-0 items-center gap-3 mr-auto">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleBackNavigation}
                    className={backButtonClassName}
                    aria-label={`Torna indietro da ${title}`}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Torna indietro</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <span className="truncate text-sm font-semibold text-foreground md:hidden">
              {title}
            </span>

            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="h-12 w-12 relative header-org-logo">
                  <Image
                    src={clubLogo || clubLogoDefault}
                    alt={`${orgName || "EasyGame"} Logo`}
                    fill
                    className="object-contain rounded"
                    unoptimized={!!clubLogo}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-xl header-org-name">
                    {orgName || "EasyGame"}
                  </span>
                  {activeSeasonLabel ? (
                    <button
                      type="button"
                      title="Gestisci stagione sportiva"
                      aria-label="Gestisci stagione sportiva"
                      onClick={() => router.push("/organization?tab=stagioni")}
                      className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      Stagione {activeSeasonLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 md:space-x-4 ml-auto">
            {/* Quick Actions Button */}
            {showQuickActions ? (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size={isTrainerHeaderContext ? "icon" : "default"}
                        className={quickActionButtonClassName}
                        onClick={() => setQuickActionsOpen(true)}
                      >
                        <Zap className="h-5 w-5" />
                        {!isTrainerHeaderContext ? (
                          <span className="ml-2 hidden xl:inline">
                            Azioni rapide
                          </span>
                        ) : null}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Azioni Rapide</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Sheet
                  open={quickActionsOpen}
                  onOpenChange={setQuickActionsOpen}
                >
                  <SheetContent side="right" className="w-80">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-blue-500" />
                        Azioni Rapide
                      </SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-3">
                      {quickActions.map((action) => (
                        <button
                          key={action.id}
                          onClick={() => handleQuickAction(action.href)}
                          className="w-full flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left text-slate-900 transition-colors hover:bg-slate-50 hover:text-slate-900"
                        >
                          <div className={`p-2 rounded-lg ${action.color}`}>
                            <action.icon className="h-5 w-5 text-white" />
                          </div>
                          <span className="font-medium">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            ) : null}

            {/* Help Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleHelpClick}
                    className={helpButtonClassName}
                  >
                    <HelpCircle className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Assistenza - Contattaci</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <ChatButton className={sharedActionButtonClassName} />

            <NotificationsDropdown
              buttonClassName={sharedActionButtonClassName}
              notificationCount={notificationCount}
              allNotificationsHref={
                pathname?.startsWith("/trainer-dashboard")
                  ? "/trainer-dashboard/notifications"
                  : "/notifications"
              }
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={accountButtonClassName}
                  aria-label={`Account ${userName}`}
                  title={userName}
                >
                  <Avatar className="h-8 w-8">
                    {accountAvatar ? (
                      <AvatarImage src={accountAvatar} alt={userName} />
                    ) : null}
                    <AvatarFallback className="bg-transparent p-0">
                      <EntityIcon
                        type="user"
                        label={accountInitials || userName}
                        className="h-full w-full border-0"
                      />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="font-semibold text-slate-900">
                    {userName}
                  </span>
                  {user?.email ? (
                    <span className="text-xs font-normal text-slate-500">
                      {user.email}
                    </span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    router.push(user?.id ? `/profile/${user.id}` : "/account")
                  }
                >
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profilo
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleReturnToAccount}
                  className="text-red-600 focus:bg-red-50 focus:text-red-700"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Esci
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      </>
    );
  },
);

Header.displayName = "Header";

export default Header;
