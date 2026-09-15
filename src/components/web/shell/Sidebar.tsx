"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { useShell } from "@/components/web/shell/ShellProvider";
import { HELP_URL, visibleNavGroups, type NavGroup, type NavItem } from "@/components/web/shell/navigation";
import { Tooltip, TooltipProvider, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/web/primitives/Overlays";
import { Avatar } from "@/components/web/primitives/Identity";
import { usePreference } from "@/components/web/hooks/use-preference";
import { openExternalUrl } from "@/lib/navigation/external-link";
import logoWhite from "@/../public/images/brand/logotipo-w.png";
import iconWhite from "@/../public/images/brand/icon-w.png";

/**
 * La barra laterale del Web V2 (guideline 06 §6.1–6.2).
 *
 * Un gradiente blu pulito — niente fari, niente linee di campo: quelle stanno
 * nel cielo della Dashboard. Logotipo bianco centrato, selettore del club,
 * sei gruppi con la voce attiva in bianco pieno, «Centro assistenza» in fondo.
 * Compressa e un binario di 72px con i tooltip su ogni voce.
 *
 * Sotto i 1024px non si disegna: li vale la barra mobile che il prodotto ha
 * gia (CLAUDE.md: ogni pagina resta usabile a 375 e 768px).
 */

type NavContextSource = ReturnType<typeof useAuth>;

const buildNavContext = (auth: NavContextSource) => ({
  role: auth.activeClub?.role || auth.userRole || auth.user?.user_metadata?.role,
  linkedAthleteId: auth.activeClub?.linkedAthleteId ?? null,
  linkedAthleteIds: auth.activeClub?.linkedAthleteIds ?? null,
});

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, activeClub } = auth;
  const { collapsed, toggleCollapsed, hydrated } = useShell();
  const [closedGroups, setClosedGroups] = usePreference<Record<string, boolean>>("shell", "groups", {});

  const groups = React.useMemo(() => visibleNavGroups(buildNavContext(auth)), [auth]);
  const flat = groups.reduce((n, g) => n + g.items.length, 0) < 4;

  const clubId = activeClub?.id as string | undefined;
  const withClub = React.useCallback(
    (href: string) => (clubId ? `${href}${href.includes("?") ? "&" : "?"}clubId=${clubId}` : href),
    [clubId],
  );

  const isActive = React.useCallback(
    (item: NavItem) => {
      if (!pathname) return false;
      // La corrispondenza piu lunga vince: /dashboard/access-management non accende Dashboard.
      const candidates = groups.flatMap((g) => g.items).filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
      const best = candidates.sort((a, b) => b.href.length - a.href.length)[0];
      return best?.id === item.id;
    },
    [groups, pathname],
  );

  const clubName: string = activeClub?.name || "EasyGame";
  const seasonLabel: string | null = activeClub?.activeSeasonLabel || null;
  const clubLogo: string | null = activeClub?.logo_url || null;

  return (
    <TooltipProvider>
      <aside
        aria-label="Navigazione principale"
        data-collapsed={collapsed}
        className={cn(
          "relative hidden h-[100dvh] shrink-0 flex-col overflow-hidden bg-egw-sidebar font-brand text-white lg:flex",
          "shadow-[inset_-1px_0_0_rgba(255,255,255,.14),6px_0_24px_-12px_rgba(11,26,58,.45)]",
          "transition-[width] duration-panel ease-egw",
          collapsed ? "w-[72px]" : "w-[256px]",
          !hydrated && "transition-none",
        )}
      >
        {/* sheen in alto */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-white/10 to-transparent" />

        {/* Logotipo — l'asset ufficiale, mai testo */}
        <div className={cn("relative flex shrink-0 flex-col items-center", collapsed ? "px-2 pb-3 pt-5" : "px-5 pb-[18px] pt-[26px]")}>
          <Link
            href="/account"
            aria-label="EasyGame: torna all'elenco dei club"
            className="rounded-egw-chip focus-visible:outline-none focus-visible:shadow-egw-focus-dark"
          >
            {collapsed ? (
              <Image src={iconWhite} alt="EasyGame" width={30} height={30} className="h-[30px] w-[30px] object-contain" priority />
            ) : (
              <Image src={logoWhite} alt="EasyGame" width={168} height={40} className="h-auto w-[168px] object-contain" priority />
            )}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Espandi la barra laterale" : "Comprimi la barra laterale"}
            aria-expanded={!collapsed}
            className={cn(
              "mt-3 inline-flex h-7 w-7 items-center justify-center rounded-egw-chip border border-white/22 bg-white/12 text-white/85 transition-colors duration-hover hover:bg-white/20 focus-visible:outline-none focus-visible:shadow-egw-focus-dark",
            )}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Selettore del club */}
        <div className={cn("relative shrink-0", collapsed ? "px-3 pb-3" : "px-4 pb-4")}>
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label={`Club attivo: ${clubName}${seasonLabel ? `, stagione ${seasonLabel}` : ""}`}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-egw-field border border-white/26 bg-white/14 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors duration-hover hover:bg-white/20 focus-visible:outline-none focus-visible:shadow-egw-focus-dark",
                  collapsed ? "justify-center p-1.5" : "px-3 py-[11px]",
                )}
              >
                <Avatar src={clubLogo} name={clubName} size={32} />
                {!collapsed ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="egw-ellipsis block text-[12.5px] font-bold leading-4 text-white">{clubName}</span>
                      <span className="egw-num block text-[10px] font-medium leading-[14px] text-white/68">
                        {seasonLabel ? `Stagione ${seasonLabel}` : "Nessuna stagione attiva"}
                      </span>
                    </span>
                    <ChevronDown className="h-[13px] w-[13px] shrink-0 text-white/80" />
                  </>
                ) : null}
              </button>
            </MenuTrigger>
            <MenuContent align="start" width={262} side="bottom">
              <MenuLabel>Club attivo</MenuLabel>
              <div className="flex items-center gap-2.5 px-2.5 pb-2">
                <Avatar src={clubLogo} name={clubName} size={28} />
                <div className="min-w-0">
                  <div className="egw-ellipsis text-[12.5px] font-bold text-egw-ink">{clubName}</div>
                  <div className="egw-num text-[10.5px] text-egw-ink-62">
                    {seasonLabel ? `Stagione ${seasonLabel}` : "Nessuna stagione attiva"}
                  </div>
                </div>
              </div>
              <MenuSeparator />
              <MenuItem onSelect={() => router.push("/organization?tab=stagioni")}>Stagioni del club</MenuItem>
              <MenuItem onSelect={() => router.push("/account")}>Cambia club</MenuItem>
            </MenuContent>
          </Menu>
        </div>

        {/* Voci */}
        <nav className={cn("egw-scroll-onblue relative min-h-0 flex-1 overflow-y-auto", collapsed ? "px-3.5" : "px-3.5")}>
          {groups.map((group, index) => (
            <SidebarGroup
              key={group.id}
              group={group}
              collapsed={collapsed}
              flat={flat}
              first={index === 0}
              closed={Boolean(closedGroups[group.id])}
              hasActive={group.items.some(isActive)}
              onToggle={() =>
                setClosedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))
              }
              isActive={isActive}
              withClub={withClub}
            />
          ))}
        </nav>

        {/* Centro assistenza */}
        <div className={cn("relative shrink-0", collapsed ? "p-3" : "p-3.5")}>
          <Tooltip content="Centro assistenza" side="right" disabled={!collapsed}>
            <button
              type="button"
              onClick={() => openExternalUrl(HELP_URL)}
              aria-label="Centro assistenza"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-egw-field border border-white/22 bg-white/12 text-white/90 transition-colors duration-hover hover:bg-white/18 focus-visible:outline-none focus-visible:shadow-egw-focus-dark",
                collapsed ? "h-11 justify-center" : "px-[13px] py-3",
              )}
            >
              <HelpCircle className="h-[15px] w-[15px] shrink-0" />
              {!collapsed ? (
                <>
                  <span className="flex-1 text-left text-[12px] font-medium">Centro assistenza</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                </>
              ) : null}
            </button>
          </Tooltip>
        </div>
        <span className="sr-only">{user?.email}</span>
      </aside>
    </TooltipProvider>
  );
}

function SidebarGroup({
  group,
  collapsed,
  flat,
  first,
  closed,
  hasActive,
  onToggle,
  isActive,
  withClub,
}: {
  group: NavGroup;
  collapsed: boolean;
  flat: boolean;
  first: boolean;
  closed: boolean;
  hasActive: boolean;
  onToggle: () => void;
  isActive: (item: NavItem) => boolean;
  withClub: (href: string) => string;
}) {
  const open = collapsed || flat || !closed || hasActive;
  const contentId = `egw-nav-${group.id}`;
  return (
    <div className={cn(!first && (collapsed ? "mt-2" : "mt-[17px]"))}>
      {collapsed ? (
        !first ? <div aria-hidden className="mx-auto mb-2 h-px w-3 bg-white/16" /> : null
      ) : flat ? null : (
        <button
          type="button"
          onClick={onToggle}
          disabled={hasActive}
          aria-expanded={open}
          aria-controls={contentId}
          className="mb-2 flex w-full items-center justify-between rounded-egw-chip px-2.5 text-left text-[9.5px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-white/58 hover:text-white/80 focus-visible:outline-none focus-visible:shadow-egw-focus-dark disabled:hover:text-white/58"
        >
          <span>{group.label}</span>
          {!hasActive ? (
            <ChevronDown className={cn("h-3 w-3 transition-transform duration-panel", !open && "-rotate-90")} />
          ) : null}
        </button>
      )}
      <ul id={contentId} className={cn("flex flex-col", collapsed ? "gap-1.5" : "gap-[3px]", !open && "hidden")}>
        {group.items.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          const link = (
            <Link
              href={withClub(item.href)}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                "group flex items-center transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus-dark",
                collapsed
                  ? "mx-auto h-11 w-11 justify-center rounded-egw-control"
                  : "h-[38px] gap-[11px] rounded-egw-control px-3",
                active
                  ? "bg-white text-egw-navy-800 shadow-[0_10px_22px_-12px_rgba(7,18,43,.5)]"
                  : "text-white hover:bg-white/10",
                active && !collapsed && "h-10 rounded-[13px_13px_4px_13px]",
              )}
            >
              <Icon
                className={cn("h-[17px] w-[17px] shrink-0", active ? "text-egw-blue-700" : "text-white/82 group-hover:text-white")}
                aria-hidden
              />
              {!collapsed ? (
                <span className={cn("egw-ellipsis flex-1 text-[13px] leading-none", active ? "font-bold" : "font-medium group-hover:font-semibold")}>
                  {item.label}
                </span>
              ) : null}
            </Link>
          );
          return (
            <li key={item.id}>
              {collapsed ? (
                <Tooltip content={item.label} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default Sidebar;
