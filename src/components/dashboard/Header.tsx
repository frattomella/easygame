"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

/**
 * Variante con etichetta dello stesso comando: stesso bordo, stesso fondo,
 * stesso colore. Prima le azioni rapide erano un pulsante in gradiente animato
 * che si mangiava l'attenzione di tutta la barra.
 */
const topBarActionClassName =
  "relative h-10 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900";

/**
 * Azioni rapide del club.
 *
 * Non duplicano la sidebar: ognuna apre direttamente il form di creazione
 * (`?action=new`), che dalla sidebar richiede comunque un secondo clic. Sono
 * filtrate dalla matrice permessi, cosi un allenatore non vede scorciatoie
 * verso aree che non puo aprire.
 */
const QUICK_ACTIONS = [
  {
    id: "new-athlete",
    label: "Nuovo atleta",
    icon: UserPlus,
    href: "/athletes/new",
  },
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
  {
    id: "new-match",
    label: "Nuova gara",
    icon: Trophy,
    href: "/matches?action=new",
  },
  {
    id: "new-payment",
    label: "Registra pagamento",
    icon: CreditCard,
    href: "/movements?action=new",
  },
] as const;

/**
 * **L'identita del club dichiarata dal chiamante, invece che dedotta dal
 * browser** (PP-02 §C).
 *
 * Nome e stagione della targhetta arrivavano **solo** da `localStorage`, e
 * quella e una copia: la scrive chi ha appena letto qualcosa dal server, e chi
 * non ha ancora letto niente legge cio che c'era prima. Per l'area famiglia il
 * risultato era «Nessuna stagione attiva» su un club che ne ha una — alla
 * prima pittura, su ogni pagina che non monta il contesto del genitore, e per
 * sempre su un tutore senza tessera, che quel `localStorage` non lo ha mai
 * visto scrivere da nessuno.
 *
 * Quando questa prop c'e, e lei l'autorita: il `localStorage` non viene
 * nemmeno consultato per l'identita. `seasonHref` a `null` toglie il rimando
 * — la targhetta della stagione porta a `/organization`, che per un genitore e
 * una porta chiusa.
 */
/** Una riga di notifica gia letta da chi monta l'intestazione. */
export type HeaderNotification = {
  id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  read?: boolean | null;
  created_at?: string | null;
};

export type HeaderClubIdentity = {
  name: string;
  seasonLabel: string | null;
  logoUrl?: string | null;
  seasonHref?: string | null;
};

interface HeaderProps {
  title?: string;
  /**
   * Le notifiche gia in mano a chi monta l'intestazione, quando le ha.
   *
   * Il pannello altrimenti se le prende dal registro **generico** del club,
   * che per un genitore e chiuso: la pastiglia diceva «tre» e il pannello
   * «Nessuna notifica».
   */
  notifications?: HeaderNotification[] | null;
  onSearch?: (query: string) => void;
  notificationCount?: number;
  userAvatar?: string;
  searchQuery?: string;
  mobileNavSections?: MobileNavSection[];
  showMobileHubLink?: boolean;
  clubIdentity?: HeaderClubIdentity | null;
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
    clubIdentity = null,
    notifications = null,
  }: HeaderProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const [quickActionsOpen, setQuickActionsOpen] = useState(false);
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
            linkedAthleteIds: activeClub?.linkedAthleteIds,
          }),
        );
      }
    }, [
      accessLoading,
      activeClub?.id,
      activeClub?.linkedAthleteId,
      activeClub?.linkedAthleteIds,
      activeClub?.role,
      authLoading,
      pathname,
      router,
      user?.user_metadata?.role,
      userRole,
    ]);

    /*
      **Le notifiche di un genitore non stanno in `/notifications`.**

      Quel percorso e fra i prefissi di gestione: la guardia respinge il
      genitore, e siccome la navigazione e un `window.location.href` — cioe un
      ricaricamento completo — lo buttava anche **fuori dall'area famiglia**.
      L'area ha la sua pagina, dentro il contesto del figlio, e il campanello
      deve portare li.
    */
    const notificationsHref = useMemo(() => {
      if (pathname?.startsWith("/trainer-dashboard")) {
        return "/trainer-dashboard/notifications";
      }

      if (pathname?.startsWith("/parent-view/")) {
        const figlio = pathname.split("/").filter(Boolean)[1];
        return figlio
          ? `/parent-view/${figlio}/notifications`
          : "/parent-view";
      }

      /*
        **E l'area atleta**, che e la gemella dimenticata del ramo qui sopra.
        `/notifications` sta fra i percorsi di gestione: la guardia respingeva
        il ragazzo sulla propria home, senza spiegazione, dopo che aveva
        premuto «Vedi tutte» su una pastiglia che il suo guscio accende gia.
      */
      if (pathname?.startsWith("/athlete-dashboard")) {
        return "/athlete-dashboard/notifiche";
      }

      return "/notifications";
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

    const handleQuickAction = useCallback(
      (href: string) => {
        setQuickActionsOpen(false);
        router.push(href);
      },
      [router],
    );

    const handleHelpClick = useCallback(() => {
      window.open(
        "https://www.cedisoft.it/contatti/",
        "_blank",
        "noopener,noreferrer",
      );
    }, []);

    const activeRole =
      activeClub?.role || userRole || user?.user_metadata?.role;
    const visibleQuickActions = React.useMemo(
      () =>
        QUICK_ACTIONS.filter((action) =>
          canAccessPath(activeRole, action.href.split("?")[0]),
        ),
      [activeRole],
    );

    return (
      <>
        <div className="lg:hidden">
          <MobileTopBar
            showHubLink={showMobileHubLink}
            title={title}
            /*
              **La stessa identita che vale sopra i 1024 px.** Senza questa
              riga la correzione di §C valeva solo su desktop, e il viewport
              che l'area famiglia usa davvero e l'altro.
            */
            clubIdentity={clubIdentity}
            navSectionsOverride={mobileNavSections}
          />
        </div>

        {/*
          Dove torni, dove sei, cosa fai in fretta, chi sei.

          Il marchio EasyGame **non** sta qui (Blocco 7): sta nella sidebar, che
          su desktop e sempre visibile accanto a questa barra. Ripeterlo a 30 px
          dal suo gemello non aggiungeva informazione e rubava larghezza al logo
          del club, che e l'unica identita che cambia da una schermata
          all'altra. Il ritorno all'elenco dei club resta sul marchio della
          sidebar e nel menu utente.

          La chat resta fuori finche non esiste una funzione vera: era un
          pannello senza backend. Azioni rapide e assistenza invece servono e
          sono tornate — erano state tolte per la sola console di piattaforma,
          che ha una shell tutta sua e non deve averle.
        */}
        <header className="sticky top-0 z-10 hidden h-20 w-full items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6 lg:flex">
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

          {/*
            PP-02 §C. `clubIdentity` vince sul `localStorage`: quando il
            chiamante conosce il club dalla risposta del server, la targhetta
            non deve aspettare che una copia nel browser si aggiorni.
          */}
          <ClubIdentity
            clubName={clubIdentity?.name || orgName || "EasyGame"}
            seasonLabel={
              clubIdentity ? clubIdentity.seasonLabel : activeSeasonLabel
            }
            logoUrl={clubIdentity ? clubIdentity.logoUrl ?? null : clubLogo}
            onSeasonClick={
              clubIdentity
                ? clubIdentity.seasonHref
                  ? () => router.push(clubIdentity.seasonHref as string)
                  : undefined
                : () => router.push("/organization?tab=stagioni")
            }
            className="min-w-0 flex-1"
          />

          <span className="hidden min-w-0 max-w-[12rem] truncate text-sm text-slate-500 2xl:block">
            {title}
          </span>

          <div className="flex shrink-0 items-center gap-2">
            {visibleQuickActions.length ? (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className={topBarActionClassName}
                        onClick={() => setQuickActionsOpen(true)}
                        aria-label="Azioni rapide"
                      >
                        <Zap className="h-5 w-5" />
                        <span className="ml-2 hidden xl:inline">
                          Azioni rapide
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Azioni rapide</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Sheet
                  open={quickActionsOpen}
                  onOpenChange={setQuickActionsOpen}
                >
                  <SheetContent side="right" className="w-80 max-w-[92vw] p-0">
                    <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
                      <SheetTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-slate-500" />
                        Azioni rapide
                      </SheetTitle>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4 pb-6">
                      {visibleQuickActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => handleQuickAction(action.href)}
                          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-left transition-colors hover:bg-slate-50"
                        >
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            <action.icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium text-slate-900">
                            {action.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            ) : null}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleHelpClick}
                    className={topBarButtonClassName}
                    aria-label="Assistenza"
                  >
                    <HelpCircle className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Assistenza</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <NotificationsDropdown
              buttonClassName={topBarButtonClassName}
              notificationCount={notificationCount}
              allNotificationsHref={notificationsHref}
              /*
                Quando chi monta l'intestazione le ha gia — l'area famiglia le
                riceve nel cruscotto — il pannello non va a chiederle al
                registro generico del club, che per quel ruolo e chiuso.
              */
              items={notifications}
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
                  onClick={() => router.push("/account?profile=1")}
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
