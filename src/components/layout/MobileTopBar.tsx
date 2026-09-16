"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HelpCircle, Menu as MenuIcon, Sparkles, UserCircle, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/web/primitives/Identity";
import {
  HELP_URL,
  QUICK_ACTIONS,
  visibleNavGroups,
  visibleQuickActions,
  type NavGroup,
} from "@/components/web/shell/navigation";
import { openExternalUrl } from "@/lib/navigation/external-link";
import logoWhite from "@/../public/images/brand/logotipo-w.png";

/**
 * **La barra sotto i 1024 px** (EGDS v3.1.0, guideline 05 §5.10).
 *
 * `Sidebar` e `hidden lg:flex`: sotto quella soglia questa barra e **l'unica**
 * navigazione che un proprietario, una segretaria, un allenatore o una
 * famiglia hanno. Fino a qui aveva un elenco di voci **copiato a mano** dalla
 * barra laterale, e per tre volte una voce e nata da un lato senza arrivare
 * dall'altro (`tests/ui/navigazione-sotto-1024-e-768.test.mjs` racconta la
 * storia). Adesso l'elenco del club **e** quello della barra laterale —
 * `visibleNavGroups`, la stessa funzione con lo stesso filtro per ruolo — e le
 * aree (famiglia, allenatore, atleta) passano il proprio, gia filtrato dai
 * permessi del loro dominio, con `navSectionsOverride`.
 *
 * L'aspetto e quello del guscio: barra bianca di 56px con il filo di
 * gradiente, e il menu che scorre da sinistra sullo stesso gradiente della
 * barra laterale, con la voce attiva in bianco pieno.
 */

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
  /**
   * **Il club e la stagione detti dal server**, quando chi guarda non ha una
   * tessera (PP-02 §C): un tutore collegato senza tessera non ha `activeClub`
   * in `localStorage`, e leggeva «EasyGame · Nessuna stagione attiva».
   */
  clubIdentity?: {
    name: string;
    seasonLabel: string | null;
    logoUrl?: string | null;
  } | null;
}

const toSections = (groups: readonly NavGroup[]): MobileNavSection[] =>
  groups.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item) => ({ href: item.href, label: item.label, icon: item.icon })),
  }));

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  showHubLink = true,
  title,
  navSectionsOverride,
  clubIdentity = null,
}) => {
  const auth = useAuth();
  const { user, activeClub } = auth;
  const router = useRouter();
  const pathname = usePathname() || "";
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [clubId, setClubId] = React.useState<string | null>(null);

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

    const stored = localStorage.getItem("activeClub");
    if (!stored) {
      return;
    }

    try {
      const parsedClub = JSON.parse(stored);
      if (parsedClub?.id) {
        setClubId(parsedClub.id);
      }
    } catch (error) {
      console.error("Error parsing active club:", error);
    }
  }, []);

  /* Le aree passano indirizzi gia completi: il `clubId` si aggiunge solo alle voci del gestionale. */
  const inArea = Boolean(navSectionsOverride);
  const buildUrl = React.useMemo(
    () => (href: string) => {
      if (!clubId || inArea) {
        return href;
      }
      const separator = href.includes("?") ? "&" : "?";
      return `${href}${separator}clubId=${clubId}`;
    },
    [clubId, inArea],
  );

  const activeRole = activeClub?.role || auth.userRole || user?.user_metadata?.role;
  const navContext = React.useMemo(
    () => ({
      role: activeRole,
      linkedAthleteId: activeClub?.linkedAthleteId ?? null,
      linkedAthleteIds: activeClub?.linkedAthleteIds ?? null,
    }),
    [activeClub?.linkedAthleteId, activeClub?.linkedAthleteIds, activeRole],
  );

  const quickActions = React.useMemo(() => (inArea ? [] : visibleQuickActions(navContext)), [inArea, navContext]);

  /*
    Il filtro delle voci e quello della barra laterale, perche l'elenco e lo
    stesso: una voce che rispondeva in due modi a seconda della larghezza dello
    schermo — «Movimenti» visibile solo dal telefono — non puo piu esistere.
  */
  const sections = React.useMemo<MobileNavSection[]>(
    () => navSectionsOverride || toSections(visibleNavGroups(navContext)),
    [navContext, navSectionsOverride],
  );

  const isActive = (href: string) => {
    const bare = href.split("?")[0];
    const all = sections.flatMap((section) => section.items.map((item) => item.href.split("?")[0]));
    const candidates = all.filter((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
    const best = candidates.sort((a, b) => b.length - a.length)[0];
    return best === bare;
  };

  const clubName = clubIdentity?.name || activeClub?.name || "EasyGame";
  const seasonLabel = clubIdentity ? clubIdentity.seasonLabel : activeClub?.activeSeasonLabel || null;
  const logoUrl = clubIdentity ? clubIdentity.logoUrl || null : activeClub?.logo_url || null;

  const close = () => setMenuOpen(false);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white font-brand shadow-[0_1px_0_rgba(11,26,58,.09)] lg:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          {/*
            Su telefono lo spazio e poco e va speso su cosa serve davvero
            sapere: in che club sei e in che stagione.
          */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar src={logoUrl} name={clubName} size={34} />
            <div className="min-w-0">
              <p className="egw-ellipsis text-[13px] font-bold leading-4 text-egw-ink">{clubName}</p>
              <p className="egw-num egw-ellipsis text-[10.5px] font-medium leading-[14px] text-egw-ink-62">
                {seasonLabel ? `Stagione ${seasonLabel}` : "Nessuna stagione attiva"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (user?.id) router.push("/account?profile=1");
            }}
            aria-label="Profilo"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-egw-control border border-transparent bg-egw-page-100 text-egw-ink transition-colors duration-hover hover:bg-[#e9eef9] focus-visible:outline-none focus-visible:shadow-egw-focus"
          >
            <UserCircle className="h-[19px] w-[19px]" />
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Apri il menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-egw-control border border-transparent bg-egw-page-100 text-egw-ink transition-colors duration-hover hover:bg-[#e9eef9] focus-visible:outline-none focus-visible:shadow-egw-focus"
          >
            <MenuIcon className="h-[19px] w-[19px]" />
          </button>
        </div>
        <div className="egw-hairline-strip" aria-hidden />
        {title ? (
          <p className="border-b border-egw-hairline bg-egw-page-025 px-3 py-1.5 text-[11.5px] font-semibold text-egw-ink-62">
            {title}
          </p>
        ) : null}
      </header>

      <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="egw-scrim fixed inset-0 z-[55] bg-[var(--egw-scrim)] lg:hidden" />
          <DialogPrimitive.Content
            aria-label="Menu di navigazione"
            className="egw-mobile-nav fixed inset-y-0 left-0 z-[56] flex w-[300px] max-w-[88vw] flex-col bg-egw-sidebar font-brand text-white shadow-egw-plane-drawer outline-none lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Menu di navigazione</DialogPrimitive.Title>
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-white/10 to-transparent" />
            <div className="relative flex shrink-0 items-center justify-between px-5 pb-4 pt-5">
              <Image src={logoWhite} alt="EasyGame" width={140} height={34} className="h-auto w-[140px] object-contain" />
              <DialogPrimitive.Close
                aria-label="Chiudi il menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-egw-chip border border-white/22 bg-white/12 text-white/90 transition-colors duration-hover hover:bg-white/20 focus-visible:outline-none focus-visible:shadow-egw-focus-dark"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <nav className="egw-scroll-onblue relative min-h-0 flex-1 overflow-y-auto px-3.5 pb-4">
              {quickActions.length ? (
                <div className="mb-4">
                  <p className="mb-2 px-2.5 text-[9.5px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-white/58">Azioni rapide</p>
                  <ul className="flex flex-col gap-[3px]">
                    {quickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <li key={action.id}>
                          <button
                            type="button"
                            onClick={() => {
                              close();
                              router.push(buildUrl(action.href));
                            }}
                            className="flex h-[38px] w-full items-center gap-[11px] rounded-egw-control px-3 text-left text-[13px] font-medium text-white transition-colors duration-hover hover:bg-white/10 focus-visible:outline-none focus-visible:shadow-egw-focus-dark"
                          >
                            <Icon className="h-[17px] w-[17px] shrink-0 text-white/82" aria-hidden />
                            <span className="egw-ellipsis flex-1">{action.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {showHubLink && !inArea ? (
                <Link
                  href={buildUrl("/hub")}
                  onClick={close}
                  className="mb-4 flex items-center gap-3 rounded-egw-field border border-white/26 bg-white/14 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors duration-hover hover:bg-white/20 focus-visible:outline-none focus-visible:shadow-egw-focus-dark"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-egw-micro bg-white text-egw-blue-700">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold leading-4">EasyGame HUB</span>
                    <span className="block text-[11px] leading-4 text-white/70">Marketplace e servizi per il club</span>
                  </span>
                </Link>
              ) : null}

              {sections.map((section, index) => (
                <div key={section.id} className={cn(index > 0 && "mt-[17px]")}>
                  <p className="mb-2 px-2.5 text-[9.5px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-white/58">{section.label}</p>
                  <ul className="flex flex-col gap-[3px]">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={buildUrl(item.href)}
                            onClick={close}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "group flex h-[38px] items-center gap-[11px] rounded-egw-control px-3 transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus-dark",
                              active ? "h-10 rounded-[13px_13px_4px_13px] bg-white text-egw-navy-800 shadow-[0_10px_22px_-12px_rgba(7,18,43,.5)]" : "text-white hover:bg-white/10",
                            )}
                          >
                            <Icon className={cn("h-[17px] w-[17px] shrink-0", active ? "text-egw-blue-700" : "text-white/82 group-hover:text-white")} aria-hidden />
                            <span className={cn("egw-ellipsis flex-1 text-[13px] leading-none", active ? "font-bold" : "font-medium")}>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="relative shrink-0 p-3.5">
              <button
                type="button"
                onClick={() => {
                  close();
                  openExternalUrl(HELP_URL);
                }}
                className="flex w-full items-center gap-2.5 rounded-egw-field border border-white/22 bg-white/12 px-[13px] py-3 text-white/90 transition-colors duration-hover hover:bg-white/18 focus-visible:outline-none focus-visible:shadow-egw-focus-dark"
              >
                <HelpCircle className="h-[15px] w-[15px] shrink-0" />
                <span className="flex-1 text-left text-[12px] font-medium">Centro assistenza</span>
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
};

/* Le azioni rapide restano quelle della topbar: un elenco solo. */
export { QUICK_ACTIONS as MOBILE_QUICK_ACTIONS };
