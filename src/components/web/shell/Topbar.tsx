"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, HelpCircle, LogOut, Plus, Search, UserCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { useShell } from "@/components/web/shell/ShellProvider";
import { HELP_URL, buildBreadcrumb, visibleQuickActions } from "@/components/web/shell/navigation";
import { QuickActionsDrawer } from "@/components/web/shell/QuickActionsDrawer";
import { NotificationDrawer, type NotificationItem } from "@/components/web/shell/NotificationDrawer";
import { Avatar } from "@/components/web/primitives/Identity";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tooltip, TooltipProvider } from "@/components/web/primitives/Overlays";
import { MobileTopBar, type MobileIdentity, type MobileNavSection } from "@/components/layout/MobileTopBar";
import { canAccessPath, getAccessRedirectPath, getPathAccessArea } from "@/lib/access-roles";
import { openExternalUrl } from "@/lib/navigation/external-link";

/**
 * La topbar del Web V2 (guideline 06 §6.3–6.4).
 *
 * Chiara su ogni pagina di lavoro (60px, bianca, filo di gradiente sotto);
 * trasparente sul cielo della Dashboard (64px, comandi bianchi al 14%).
 * Da sinistra: breadcrumb (l'unico «indietro»: niente freccia), ricerca
 * globale, poi stagione · Azioni rapide · campanello · account.
 *
 * Accetta le prop dell'intestazione V1 (`title`, `notifications`,
 * `onMarkRead`, `clubIdentity`, `mobileNavSections`…) perche 45 pagine la
 * montano cosi, e sotto i 1024px continua a montare la barra mobile.
 */
export type HeaderClubIdentity = {
  name: string;
  seasonLabel: string | null;
  logoUrl?: string | null;
  seasonHref?: string | null;
};

export interface TopbarProps {
  title?: string;
  notifications?: NotificationItem[] | null;
  onMarkRead?: (id: string) => void;
  onSearch?: (query: string) => void;
  notificationCount?: number;
  userAvatar?: string;
  searchQuery?: string;
  mobileNavSections?: MobileNavSection[];
  /** L'identita dell'area (il figlio), per il menu sotto i 1024 px. */
  mobileIdentity?: MobileIdentity | null;
  showMobileHubLink?: boolean;
  clubIdentity?: HeaderClubIdentity | null;
  /** La variante sul cielo: la chiede la Dashboard V2 (ambiente 2), nessun altro. */
  variant?: "light" | "sky";
}

export function Topbar({
  title = "Dashboard",
  notifications = null,
  onMarkRead,
  notificationCount = 0,
  userAvatar = "",
  mobileNavSections,
  mobileIdentity = null,
  showMobileHubLink = true,
  clubIdentity = null,
  variant,
}: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const { activeClub, accessLoading, loading: authLoading, user, userRole, signOut } = auth;
  const { quickActionsOpen, setQuickActionsOpen, notificationsOpen, setNotificationsOpen, breadcrumbLabel, areaNav } = useShell();

  const onSky = variant === "sky";
  const activeRole = activeClub?.role || userRole || user?.user_metadata?.role;

  /* La guardia di rotta che l'intestazione V1 faceva: resta identica. */
  React.useEffect(() => {
    if (authLoading || accessLoading || !pathname || getPathAccessArea(pathname) !== "management") return;
    if (!canAccessPath(activeRole, pathname)) {
      router.replace(
        getAccessRedirectPath(activeRole, {
          organizationId: activeClub?.id,
          linkedAthleteId: activeClub?.linkedAthleteId,
          linkedAthleteIds: activeClub?.linkedAthleteIds,
        }),
      );
    }
  }, [accessLoading, activeClub?.id, activeClub?.linkedAthleteId, activeClub?.linkedAthleteIds, activeRole, authLoading, pathname, router]);

  const fullName = [user?.user_metadata?.firstName, user?.user_metadata?.lastName].filter(Boolean).join(" ");
  const userName = String(fullName || user?.user_metadata?.name || user?.user_metadata?.firstName || user?.email?.split("@")[0] || "Account");
  const firstName = String(user?.user_metadata?.firstName || userName.split(" ")[0] || "Account");
  const accountAvatar: string = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || userAvatar || "";

  const clubName: string = clubIdentity?.name || activeClub?.name || "EasyGame";
  const seasonLabel: string | null = clubIdentity ? clubIdentity.seasonLabel : activeClub?.activeSeasonLabel || null;
  const seasonHref = clubIdentity ? clubIdentity.seasonHref ?? null : "/organization?tab=stagioni";

  const crumbs = React.useMemo(
    () => buildBreadcrumb(pathname, { clubName, currentLabel: breadcrumbLabel || (title !== "Dashboard" ? title : null), groups: areaNav }),
    [areaNav, breadcrumbLabel, clubName, pathname, title],
  );

  /*
    Dentro un'area (famiglia, allenatore, atleta) le azioni rapide del
    gestionale e la ricerca globale — che porta a `/athletes`, una rotta del
    gestionale — non hanno una destinazione: non si disegnano.
  */
  const inArea = Boolean(areaNav);
  const quickActions = React.useMemo(
    () =>
      inArea
        ? []
        : visibleQuickActions({
            role: activeRole,
            linkedAthleteId: activeClub?.linkedAthleteId ?? null,
            linkedAthleteIds: activeClub?.linkedAthleteIds ?? null,
          }),
    [activeClub?.linkedAthleteId, activeClub?.linkedAthleteIds, activeRole, inArea],
  );

  const notificationsHref = React.useMemo(() => {
    if (pathname?.startsWith("/trainer-dashboard")) return "/trainer-dashboard/notifications";
    if (pathname?.startsWith("/parent-view/")) {
      const child = pathname.split("/").filter(Boolean)[1];
      return child ? `/parent-view/${child}/notifications` : "/parent-view";
    }
    if (pathname?.startsWith("/athlete-dashboard")) return "/athlete-dashboard/notifiche";
    return "/notifications";
  }, [pathname]);

  const unread = notifications ? notifications.filter((n) => !n.read).length : notificationCount;

  const searchRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [search, setSearch] = React.useState("");
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = search.trim();
    if (!q) return;
    /*
      Finche la tavolozza dei comandi (§6.6) non esiste, la ricerca porta
      all'elenco atleti con il termine: e cio che il prodotto sa cercare oggi.
      Non si costruisce una seconda ricerca.
    */
    router.push(`/athletes?q=${encodeURIComponent(q)}`);
  };

  const controlOnSky = "border-white/26 bg-white/14 text-white hover:bg-white/22 focus-visible:shadow-egw-focus-dark";
  const controlLight = "border-transparent bg-egw-page-100 text-egw-ink hover:bg-[#e9eef9] focus-visible:shadow-egw-focus";

  return (
    <>
      <div className="lg:hidden">
        <MobileTopBar
          showHubLink={showMobileHubLink}
          title={title}
          clubIdentity={clubIdentity}
          navSectionsOverride={mobileNavSections}
          identity={mobileIdentity}
        />
      </div>

      <TooltipProvider>
        <header
          data-variant={onSky ? "sky" : "light"}
          className={cn(
            "sticky top-0 z-30 hidden shrink-0 lg:block",
            onSky ? "bg-transparent" : "bg-white shadow-[0_1px_0_rgba(11,26,58,.09)]",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-4 px-6 xl:px-8",
              onSky ? "h-16" : "h-[60px]",
            )}
          >
            {/* Breadcrumb */}
            <nav aria-label="Percorso" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-1.5 font-brand text-[12.5px] font-medium">
                {crumbs.map((crumb, index) => {
                  const last = index === crumbs.length - 1;
                  return (
                    <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                      {index > 0 ? (
                        <span aria-hidden className={cn("shrink-0", onSky ? "text-white/45" : "text-[rgba(11,26,58,.3)]")}>
                          /
                        </span>
                      ) : null}
                      {crumb.href && !last ? (
                        <a
                          href={crumb.href}
                          className={cn("egw-ellipsis max-w-[220px] rounded-egw-micro hover:underline focus-visible:outline-none focus-visible:underline", onSky ? "text-white/72" : "text-[rgba(11,26,58,.5)]")}
                        >
                          {crumb.label}
                        </a>
                      ) : (
                        <span
                          aria-current={last ? "page" : undefined}
                          className={cn(
                            "egw-ellipsis max-w-[260px]",
                            last ? (onSky ? "font-bold text-white" : "font-bold text-egw-ink") : onSky ? "text-white/72" : "text-[rgba(11,26,58,.5)]",
                          )}
                        >
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* Ricerca globale */}
            {!inArea ? (
            <form onSubmit={submitSearch} role="search" className="hidden xl:block">
              <label className="sr-only" htmlFor="egw-global-search">
                Cerca in tutto il club
              </label>
              <div
                className={cn(
                  "flex h-9 w-[280px] items-center gap-2 rounded-egw-control border px-3 transition-colors duration-hover focus-within:shadow-egw-focus",
                  onSky ? "border-white/26 bg-white/14 text-white" : "border-transparent bg-egw-page-100 text-egw-ink",
                )}
              >
                <Search className={cn("h-[15px] w-[15px] shrink-0", onSky ? "text-white/75" : "text-egw-ink-42")} />
                <input
                  id="egw-global-search"
                  ref={searchRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cerca in tutto il club"
                  className={cn(
                    "min-w-0 flex-1 bg-transparent font-brand text-[12.5px] outline-none",
                    onSky ? "text-white placeholder:text-white/75" : "text-egw-ink placeholder:text-egw-ink-42",
                  )}
                />
                <kbd className={cn("shrink-0 font-mono text-[10px] font-semibold", onSky ? "text-white/60" : "text-egw-ink-42")}>⌘K</kbd>
              </div>
            </form>
            ) : null}
            {!inArea ? (
            <Tooltip content="Cerca in tutto il club">
              <button
                type="button"
                aria-label="Cerca in tutto il club"
                onClick={() => router.push("/athletes")}
                className={cn("inline-flex h-[38px] w-[38px] items-center justify-center rounded-egw-control border transition-colors duration-hover focus-visible:outline-none xl:hidden", onSky ? controlOnSky : controlLight)}
              >
                <Search className="h-[17px] w-[17px]" />
              </button>
            </Tooltip>
            ) : null}

            {/* Cluster destro */}
            <div className="flex shrink-0 items-center gap-2.5">
              {seasonLabel ? (
                <button
                  type="button"
                  onClick={seasonHref ? () => router.push(seasonHref) : undefined}
                  disabled={!seasonHref}
                  aria-label={`Stagione ${seasonLabel}`}
                  className={cn(
                    "hidden h-[38px] items-center gap-2 rounded-egw-chip border px-3 text-left transition-colors duration-hover focus-visible:outline-none 2xl:flex",
                    onSky ? controlOnSky : controlLight,
                    !seasonHref && "cursor-default",
                  )}
                >
                  <span className={cn("text-[9.5px] font-bold uppercase tracking-[var(--egw-track-eyebrow)]", onSky ? "text-white/70" : "text-egw-ink-42")}>
                    Stagione
                  </span>
                  <span className="egw-num text-[12.5px] font-bold">{seasonLabel}</span>
                </button>
              ) : null}

              {quickActions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setQuickActionsOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={quickActionsOpen}
                  className={cn(
                    "inline-flex h-[38px] items-center gap-2 rounded-egw-control border pl-1.5 pr-3.5 font-brand text-[12px] font-bold uppercase tracking-[.06em] transition-[filter,background-color] duration-hover focus-visible:outline-none",
                    onSky
                      ? "border-transparent bg-white text-egw-navy-800 hover:brightness-[.97] focus-visible:shadow-egw-focus-dark"
                      : "border-white/28 bg-egw-action text-white shadow-egw-glow hover:brightness-[1.06] focus-visible:shadow-egw-focus-dark",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-egw-micro",
                      onSky ? "bg-egw-action text-white" : "bg-white/20 text-white",
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                  <span className="hidden xl:inline">Azioni rapide</span>
                </button>
              ) : null}

              <Tooltip content="Assistenza">
                <button
                  type="button"
                  onClick={() => openExternalUrl(HELP_URL)}
                  aria-label="Assistenza"
                  className={cn("hidden h-[38px] w-[38px] items-center justify-center rounded-egw-control border transition-colors duration-hover focus-visible:outline-none 2xl:inline-flex", onSky ? controlOnSky : controlLight)}
                >
                  <HelpCircle className="h-[17px] w-[17px]" />
                </button>
              </Tooltip>

              <Tooltip content={unread > 0 ? `Notifiche · ${unread} da leggere` : "Notifiche"}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(true)}
                  aria-label={unread > 0 ? `Notifiche, ${unread} da leggere` : "Notifiche"}
                  aria-haspopup="dialog"
                  aria-expanded={notificationsOpen}
                  className={cn("relative inline-flex h-[38px] w-[38px] items-center justify-center rounded-egw-control border transition-colors duration-hover focus-visible:outline-none", onSky ? controlOnSky : controlLight)}
                >
                  <Bell className="h-[17px] w-[17px]" />
                  {unread > 0 ? (
                    <span
                      aria-hidden
                      className={cn("absolute right-2 top-[7px] h-[7px] w-[7px] rounded-full bg-[#f59e0b] ring-2", onSky ? "ring-[rgba(16,32,78,.9)]" : "ring-white")}
                    />
                  ) : null}
                </button>
              </Tooltip>

              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Account ${userName}`}
                    className={cn(
                      "group inline-flex h-[38px] items-center gap-2 rounded-egw-control border pl-1.5 pr-[11px] transition-colors duration-hover focus-visible:outline-none data-[state=open]:border-[rgba(37,99,235,.35)] data-[state=open]:bg-egw-page",
                      onSky ? cn(controlOnSky, "data-[state=open]:bg-white data-[state=open]:text-egw-ink") : controlLight,
                    )}
                  >
                    <Avatar src={accountAvatar} name={userName} size={27} />
                    <span className="hidden max-w-[120px] truncate font-brand text-[12px] font-bold xl:inline">{firstName}</span>
                    <ChevronDown className="h-3 w-3 opacity-70 transition-transform duration-panel group-data-[state=open]:rotate-180" />
                  </button>
                </MenuTrigger>
                <MenuContent align="end" width={262}>
                  <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-2">
                    <Avatar src={accountAvatar} name={userName} size={38} />
                    <div className="min-w-0">
                      <div className="egw-ellipsis text-[13px] font-bold text-egw-ink">{userName}</div>
                      <div className="egw-ellipsis text-[10.5px] text-[rgba(11,26,58,.55)]">
                        {[roleLabel(activeRole), clubName].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <MenuSeparator />
                  <MenuItem onSelect={() => router.push("/account?profile=1")}>
                    <UserCircle />
                    Profilo
                  </MenuItem>
                  <MenuItem onSelect={() => router.push("/account")} tone="muted">
                    <Users />
                    {inArea ? "Torna al mio account" : "I miei club"}
                  </MenuItem>
                  <MenuItem onSelect={() => openExternalUrl(HELP_URL)} tone="muted">
                    <HelpCircle />
                    Assistenza
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem onSelect={() => void signOut()} tone="danger">
                    <LogOut />
                    Esci
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>
          {!onSky ? <div className="egw-hairline-strip" aria-hidden /> : null}
        </header>
      </TooltipProvider>

      <QuickActionsDrawer open={quickActionsOpen} onOpenChange={setQuickActionsOpen} actions={quickActions} />
      <NotificationDrawer
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        items={notifications}
        onMarkRead={onMarkRead}
        allNotificationsHref={notificationsHref}
      />
    </>
  );
}

const roleLabel = (role: string | null | undefined): string => {
  const r = String(role || "").toLowerCase();
  if (r.startsWith("custom:")) return r.split(":").pop()?.replace(/-/g, " ") || "Ruolo personalizzato";
  const map: Record<string, string> = {
    owner: "Proprietario",
    club_manager: "Gestore",
    admin: "Gestore",
    collaborator: "Collaboratore",
    staff: "Segreteria",
    trainer: "Allenatore",
    parent: "Genitore",
    athlete: "Atleta",
  };
  return map[r] || "";
};

export default Topbar;
