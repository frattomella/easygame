"use client";

import React, { memo, useCallback } from "react";
import { ArrowLeft, LogOut, UserCircle } from "lucide-react";
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
import { useAuth } from "../providers/AuthProvider";
import { NotificationsDropdown } from "../ui/notifications-dropdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  MobileTopBar,
  type MobileNavSection,
} from "@/components/layout/MobileTopBar";
import { ClubIdentity } from "@/components/brand/club-identity";
import { EntityIcon } from "@/components/ui/entity-icon";
import {
  canAccessPath,
  getAccessRedirectPath,
  getPathAccessArea,
} from "@/lib/access-roles";

/**
 * Un solo stile per i comandi della topbar.
 *
 * Prima ce n'erano cinque, ciascuno con la propria variante per il contesto
 * allenatore, piu un pulsante in gradiente animato: la barra sembrava una
 * fiera di stili e nessuno dei comandi aveva evidentemente piu peso degli
 * altri.
 */
const topBarButtonClassName =
  "relative h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white p-0 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900";

interface HeaderProps {
  title?: string;
  onSearch?: (query: string) => void;
  notificationCount?: number;
  userAvatar?: string;
  searchQuery?: string;
  mobileNavSections?: MobileNavSection[];
  showMobileHubLink?: boolean;
}

const Header = memo(
  ({
    title = "Dashboard",
    onSearch = () => {},
    notificationCount = 0,
    userAvatar = "",
    searchQuery = "",
    mobileNavSections,
    showMobileHubLink = true,
  }: HeaderProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const [orgName, setOrgName] = React.useState("EasyGame");
    const [activeSeasonLabel, setActiveSeasonLabel] = React.useState<
      string | null
    >(null);
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

    const handleReturnToAccount = () => {
      router.push("/account");
    };

    const handleBackNavigation = useCallback(() => {
      if (typeof window !== "undefined") {
        window.history.back();
        return;
      }
      router.back();
    }, [router]);


    return (
      <>
        <div className="lg:hidden">
          <MobileTopBar
            showHubLink={showMobileHubLink}
            title={title}
            navSectionsOverride={mobileNavSections}
          />
        </div>

        {/*
          Tre cose e basta: dove torni, dove sei, chi sei.
          Chat, azioni rapide e assistenza sono state tolte: la chat non
          aveva un backend, le azioni rapide duplicavano voci gia presenti
          nella sidebar e l'assistenza era un link a un sito esterno.
        */}
        <header className="sticky top-0 z-10 hidden h-16 w-full items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6 lg:flex">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBackNavigation}
                  className={topBarButtonClassName}
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

          <ClubIdentity
            clubName={orgName || "EasyGame"}
            seasonLabel={activeSeasonLabel}
            logoUrl={clubLogo}
            onSeasonClick={() => router.push("/organization?tab=stagioni")}
            className="min-w-0 flex-1"
          />

          <span className="hidden min-w-0 max-w-[16rem] truncate text-sm text-slate-500 xl:block">
            {title}
          </span>

          <div className="flex shrink-0 items-center gap-2">
            <NotificationsDropdown
              buttonClassName={topBarButtonClassName}
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
                  className={topBarButtonClassName}
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
