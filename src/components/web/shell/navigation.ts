import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  Building,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  FileCheck,
  FileText,
  FolderKanban,
  Handshake,
  HardHat,
  LayoutDashboard,
  Lock,
  MapPin,
  MessageSquare,
  Receipt,
  Scale,
  ScrollText,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Shirt,
  Sparkles,
  Stethoscope,
  Trophy,
  UserCircle,
  UserCog,
  UsersRound,
  Wallet,
} from "lucide-react";
import { canAccessPath } from "@/lib/access-roles";
import { canOpenAccounting } from "@/lib/accounting/permissions";

/**
 * La navigazione del guscio Web V2 (guideline 06 §6.1).
 *
 * Sei gruppi, ordine fisso, mai piu di otto voci per gruppo. **Ogni modulo che
 * esiste nel prodotto e qui**, nel gruppo a cui appartiene il suo sostantivo:
 * il redesign non toglie destinazioni (regola 10 §10.1). Le voci che il ruolo
 * non puo raggiungere non vengono disegnate — mai in grigio.
 *
 * Le etichette sono quelle del sistema (`Certificati medici`, `Prima nota`,
 * `Iscrizioni`): dove il prodotto ne usava un'altra (`Movimenti`, `Gestione
 * Iscrizioni`) la rotta e la stessa e cambia solo la parola.
 */
/** Il centro assistenza: l'unico indirizzo esterno del guscio. */
export const HELP_URL = "https://www.cedisoft.it/contatti/";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Etichetta breve per il tooltip/breadcrumb quando serve. */
  short?: string;
  /** Un controllo in piu oltre a `canAccessPath`. */
  visible?: (context: NavContext) => boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export type NavContext = {
  role: string | null | undefined;
  linkedAthleteId?: string | null;
  linkedAthleteIds?: readonly (string | null | undefined)[] | null;
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "overview",
    label: "Panoramica",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { id: "reports", label: "Report", href: "/reports", icon: BarChart3 },
      { id: "hub", label: "EasyGame HUB", href: "/hub", icon: Sparkles, short: "HUB" },
    ],
  },
  {
    id: "people",
    label: "Persone",
    items: [
      { id: "athletes", label: "Atleti", href: "/athletes", icon: UserCircle },
      { id: "trainers", label: "Allenatori", href: "/trainers", icon: UserCog },
      { id: "staff", label: "Staff", href: "/staff", icon: Briefcase },
      { id: "members", label: "Soci", href: "/soci", icon: UsersRound },
      { id: "categories", label: "Categorie", href: "/categories", icon: FolderKanban },
      { id: "medical", label: "Certificati medici", href: "/medical", icon: Stethoscope },
      { id: "procura", label: "Procure", href: "/procura", icon: Scale },
    ],
  },
  {
    id: "sport",
    label: "Attività sportiva",
    items: [
      { id: "calendar", label: "Calendario", href: "/calendar", icon: CalendarDays },
      { id: "training", label: "Allenamenti", href: "/training", icon: Dumbbell },
      { id: "matches", label: "Gare", href: "/matches", icon: Trophy },
      { id: "structures", label: "Strutture", href: "/structures", icon: MapPin },
      { id: "clothing", label: "Abbigliamento", href: "/clothing", icon: Shirt },
    ],
  },
  {
    id: "office",
    label: "Segreteria",
    items: [
      { id: "registrations", label: "Iscrizioni", href: "/registration-management", icon: Receipt },
      { id: "documents", label: "Documenti", href: "/documenti", icon: FileCheck },
      { id: "forms", label: "Modulistica", href: "/modulistica", icon: FileText },
      { id: "consents", label: "Consensi", href: "/consensi", icon: ShieldCheck },
      { id: "secretariat", label: "Segreteria", href: "/secretariat", icon: ClipboardList },
      { id: "appointments", label: "Appuntamenti", href: "/appuntamenti", icon: CalendarDays },
      { id: "communications", label: "Comunicazioni", href: "/communications", icon: Send },
      { id: "notifications", label: "Notifiche", href: "/notifications", icon: MessageSquare },
    ],
  },
  {
    id: "finance",
    label: "Cassa e amministrazione",
    items: [
      {
        id: "movements",
        label: "Prima nota",
        href: "/movements",
        icon: Wallet,
        /*
          La voce segue la matrice della pagina (`accounting.read`), come
          oggi: chi non ha a che fare con la cassa non deve vederla.
        */
        visible: ({ role }) => canOpenAccounting(role || null),
      },
      { id: "sponsors", label: "Sponsor", href: "/sponsors", icon: Handshake },
      { id: "sport-work", label: "Lavoro sportivo", href: "/sport-work", icon: HardHat },
    ],
  },
  {
    id: "settings",
    label: "Impostazioni",
    items: [
      { id: "organization", label: "Club", href: "/organization", icon: Building },
      { id: "settings", label: "Impostazioni", href: "/settings", icon: Settings },
      { id: "access", label: "Ruoli e accessi", href: "/dashboard/access-management", icon: Shield },
      { id: "permissions", label: "Permessi allenatore", href: "/permissions", icon: Lock },
      { id: "audit", label: "Registro attività", href: "/audit", icon: ScrollText },
    ],
  },
];

/** I gruppi con le sole voci che il ruolo puo raggiungere; i gruppi vuoti spariscono. */
export const visibleNavGroups = (context: NavContext): NavGroup[] =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.visible && !item.visible(context)) return false;
      return canAccessPath(context.role, item.href, {
        linkedAthleteId: context.linkedAthleteId,
        linkedAthleteIds: context.linkedAthleteIds,
      });
    }),
  })).filter((group) => group.items.length > 0);

/** `/athletes/abc` → la voce `athletes`; la corrispondenza piu lunga vince. */
export const findNavItemForPath = (pathname: string | null | undefined): { group: NavGroup; item: NavItem } | null => {
  if (!pathname) return null;
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (!best || item.href.length > best.item.href.length)) {
        best = { group, item };
      }
    }
  }
  return best;
};

/** Etichette dei segmenti di percorso che non sono voci di menu. */
const SEGMENT_LABELS: Record<string, string> = {
  new: "Nuovo",
  edit: "Modifica",
  profile: "Profilo",
  contracts: "Contratti",
  upload: "Caricamento",
  bacheca: "Bacheca",
  automazioni: "Automazioni",
  compensations: "Compensi",
  deadlines: "Scadenze",
  obligations: "Adempimenti",
  relationships: "Rapporti",
  "access-management": "Ruoli e accessi",
};

export type Crumb = { label: string; href?: string };

/**
 * Il breadcrumb dal percorso: `Club / Gruppo / Voce / Sotto-pagina`. L'ultimo
 * segmento e quello corrente e non ha collegamento. I segmenti che sono
 * identificativi (uuid, numeri) prendono l'etichetta passata da chi monta la
 * pagina (`currentLabel`), altrimenti `Scheda`.
 */
export const buildBreadcrumb = (
  pathname: string | null | undefined,
  options: { clubName?: string | null; currentLabel?: string | null } = {},
): Crumb[] => {
  const crumbs: Crumb[] = [];
  if (options.clubName) crumbs.push({ label: options.clubName });
  const hit = findNavItemForPath(pathname);
  if (!hit || !pathname) {
    if (options.currentLabel) crumbs.push({ label: options.currentLabel });
    return crumbs;
  }
  crumbs.push({ label: hit.group.label });
  const rest = pathname.slice(hit.item.href.length).split("/").filter(Boolean);
  if (rest.length === 0) {
    crumbs.push({ label: options.currentLabel || hit.item.label });
    return crumbs;
  }
  crumbs.push({ label: hit.item.label, href: hit.item.href });
  rest.forEach((segment, index) => {
    const last = index === rest.length - 1;
    const known = SEGMENT_LABELS[segment];
    const isId = !known && /^[0-9a-f-]{8,}$|^\d+$/i.test(segment);
    const label = known || (isId ? options.currentLabel || "Scheda" : decodeURIComponent(segment));
    if (last) {
      const finalLabel = options.currentLabel && !known ? options.currentLabel : label;
      // «Dashboard / Dashboard»: se la scheda porta lo stesso nome della voce,
      // il segmento con l'identificativo non aggiunge niente.
      if (isId && finalLabel === hit.item.label) {
        crumbs.pop();
        crumbs.push({ label: finalLabel });
      } else {
        crumbs.push({ label: finalLabel });
      }
    }
    else crumbs.push({ label, href: `${hit.item.href}/${rest.slice(0, index + 1).join("/")}` });
  });
  // Max quattro livelli: oltre, si elide il centro.
  if (crumbs.length > 4) {
    return [crumbs[0], { label: "…" }, crumbs[crumbs.length - 2], crumbs[crumbs.length - 1]];
  }
  return crumbs;
};

/**
 * Le azioni rapide (guideline 06 §6.5): «bisogno prima, routine dopo». Ogni
 * riga apre il modulo di creazione della sua pagina (`?action=new`), come
 * oggi. Le righe che il ruolo non puo compiere sono assenti.
 */
export type QuickAction = {
  id: string;
  label: string;
  fields: string;
  href: string;
  icon: LucideIcon;
  tone: "blue" | "red" | "green" | "orange" | "amber";
};

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: "new-athlete", label: "Nuovo atleta", fields: "Anagrafica, categoria, genitore di riferimento", href: "/athletes/new", icon: UserCircle, tone: "blue" },
  { id: "register-certificate", label: "Registra certificato medico", fields: "Atleta, tipo, scadenza, allegato", href: "/medical?action=new", icon: Stethoscope, tone: "red" },
  { id: "new-training", label: "Nuovo allenamento", fields: "Categoria, sede, orario, allenatore", href: "/training?action=new", icon: Dumbbell, tone: "green" },
  { id: "new-match", label: "Nuova gara", fields: "Avversario, campo, convocazioni", href: "/matches?action=new", icon: Trophy, tone: "orange" },
  { id: "new-payment", label: "Registra pagamento", fields: "Rata, importo, metodo", href: "/movements?action=new", icon: Wallet, tone: "green" },
];

export const visibleQuickActions = (context: NavContext): QuickAction[] =>
  QUICK_ACTIONS.filter((action) => {
    const path = action.href.split("?")[0];
    if (path === "/movements" && !canOpenAccounting(context.role || null)) return false;
    return canAccessPath(context.role, path, {
      linkedAthleteId: context.linkedAthleteId,
      linkedAthleteIds: context.linkedAthleteIds,
    });
  });
