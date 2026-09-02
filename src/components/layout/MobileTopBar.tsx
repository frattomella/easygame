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
  BadgeEuro,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileCheck,
  FileSignature,
  HardHat,
  ScrollText,
  Send,
  Shirt,
  UserCog,
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
import { canOpenAccounting } from "@/lib/accounting/permissions";

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

/**
 * **Le voci del menu sotto i 1024 px.**
 *
 * `Sidebar` e `hidden lg:flex`: sotto i 1024 px non esiste, e questo elenco e
 * **l'unica** navigazione che un proprietario o una segretaria hanno. Una voce
 * che sta solo nella barra laterale e quindi una pagina che dal telefono non
 * si raggiunge — il difetto che la Wave 6 ha ripetuto con «Documenti»,
 * «Ruoli e accessi» e «Registro attivita», e che prima di lei aveva gia
 * lasciato fuori Calendario, Strutture, Comunicazioni, Lavoro sportivo e
 * Abbigliamento.
 *
 * Adesso l'elenco e **completo rispetto alla barra desktop**, e a presidiarlo
 * c'e `tests/ui/navigazione-sotto-1024-e-768.test.mjs`, che ricava le voci da
 * `Sidebar.tsx` e pretende di ritrovarle qui: la prossima voce dimenticata
 * fallisce da sola, senza chiedere a nessuno di ricordarsene.
 *
 * Le sezioni non ricalcano quelle della barra laterale — su un telefono si
 * scorre, e otto gruppi da due voci costano piu di quattro da quattro — ma
 * ogni indirizzo della barra laterale deve comparire in uno di essi.
 */
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
      { href: "/calendar", label: "Calendario", icon: CalendarDays },
      { href: "/training", label: "Allenamenti", icon: Dumbbell },
      { href: "/matches", label: "Gare", icon: Trophy },
      { href: "/structures", label: "Strutture", icon: Building },
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
    id: "lavoro-sportivo",
    label: "LAVORO SPORTIVO",
    items: [
      { href: "/sport-work", label: "Dashboard", icon: HardHat },
      {
        href: "/sport-work/relationships",
        label: "Rapporti",
        icon: FileSignature,
      },
      {
        href: "/sport-work/compensations",
        label: "Compensi",
        icon: BadgeEuro,
      },
      {
        href: "/sport-work/deadlines",
        label: "Scadenze",
        icon: CalendarClock,
      },
      {
        href: "/sport-work/obligations",
        label: "Adempimenti",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    id: "magazzino",
    label: "MAGAZZINO",
    items: [{ href: "/clothing", label: "Abbigliamento", icon: Shirt }],
  },
  {
    id: "altro",
    label: "ALTRO",
    items: [
      { href: "/secretariat", label: "Segreteria", icon: ClipboardList },
      /*
        W6-39. La coda documentale del club, con la stessa etichetta e la
        stessa icona della barra laterale. Sta accanto a «Segreteria» perche e
        il suo lavoro quotidiano: si apre la mattina e si guarda cosa e
        arrivato. Senza questa riga la pagina esisteva solo per chi aveva uno
        schermo largo almeno 1024 px.
      */
      { href: "/documenti", label: "Documenti", icon: FileCheck },
      { href: "/notifications", label: "Notifiche", icon: Bell },
      { href: "/communications", label: "Comunicazioni", icon: Send },
      { href: "/reports", label: "Report", icon: BarChart3 },
      { href: "/settings", label: "Impostazioni", icon: Settings },
      { href: "/permissions", label: "Permessi", icon: Shield },
      /*
        W6-1 e W6-2. Le due schermate della lane 6G, con le etichette della
        barra laterale. Chi governa i ruoli o legge il registro degli accessi
        lo fa spesso **mentre** succede qualcosa, e non necessariamente da una
        scrivania: lasciarle fuori di qui le rendeva raggiungibili solo per
        indirizzo.
      */
      {
        href: "/dashboard/access-management",
        label: "Ruoli e accessi",
        icon: UserCog,
      },
      { href: "/audit", label: "Registro attivita", icon: ScrollText },
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

  /*
    **Il filtro delle voci, allineato a quello della barra laterale.**

    La barra desktop non filtra per area — `canAccessPath` qui sopra governa le
    azioni rapide, non le voci di menu, e `Sidebar.tsx` non la importa affatto —
    ma una regola ce l'ha, ed e sulla cassa: `canOpenAccounting`, la stessa
    matrice che difende la pagina e le rotte contabili. Questo elenco non ce
    l'aveva, e l'effetto era una voce che rispondeva in due modi a seconda della
    larghezza dello schermo: un collaboratore non vedeva «Movimenti» dal
    desktop e la vedeva dal telefono, ci entrava, e trovava una prima nota
    tutta a zero.

    Le voci fornite dall'esterno — allenatore e famiglia via
    `navSectionsOverride` — arrivano gia filtrate dai permessi del proprio
    dominio e non passano di qui.
  */
  const visibleNavSections = useMemo(() => {
    if (navSectionsOverride) {
      return navSectionsOverride;
    }

    const accounting = canOpenAccounting(activeRole || null);

    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => item.href !== "/movements" || accounting,
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [activeRole, navSectionsOverride]);

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
