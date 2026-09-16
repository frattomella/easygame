import {
  Bell,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  Dumbbell,
  FileSignature,
  FileText,
  FolderOpen,
  History,
  Home,
  Mail,
  Megaphone,
  ShieldCheck,
  Stethoscope,
  Trophy,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";
import type { NavGroup } from "@/components/web/shell/navigation";
import {
  TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY,
  type TrainerDashboardPermissions,
  type TrainerNavigationPermissionKey,
} from "@/lib/trainer-dashboard-permissions";

/**
 * **La navigazione delle tre aree fuori dal gestionale — famiglia,
 * allenatore, atleta — scritta una volta sola.**
 *
 * Ogni area aveva due elenchi copiati a mano: la barra laterale larga e il
 * menu sotto la soglia. Tre volte una voce e nata da un lato e non e arrivata
 * dall'altro (`tests/ui/navigazione-sotto-1024-e-768.test.mjs` racconta la
 * storia). Da qui in avanti l'elenco e **uno**: la barra laterale del Web V2
 * (`Sidebar`, prop `groups`) e la barra mobile (`Header`, prop
 * `mobileNavSections`) lo leggono entrambe da queste funzioni, e una voce
 * dimenticata non puo piu esistere.
 *
 * Le regole restano quelle di prima: la famiglia vede tutto (il perimetro lo
 * fa il server, per figlio); l'allenatore vede le voci che
 * `permissions.navigation` accende, con la rotta presa dalla **mappa** e mai
 * scritta a mano; l'atleta vede le tredici voci che puo davvero usare.
 */

export const parentAreaNavGroups = (athleteRouteId: string): NavGroup[] => {
  const base = `/parent-view/${athleteRouteId}`;
  return [
    {
      id: "family",
      label: "Area famiglia",
      items: [
        { id: "parent-home", label: "Home", href: base, icon: Home },
        { id: "parent-calendar", label: "Calendario", href: `${base}/calendar`, icon: CalendarDays },
        { id: "parent-athlete", label: "Atleta", href: `${base}/athlete`, icon: UserCircle },
        { id: "parent-trainings", label: "Allenamenti", href: `${base}/trainings`, icon: Dumbbell },
        { id: "parent-structures", label: "Strutture", href: `${base}/structures`, icon: Building2 },
        { id: "parent-matches", label: "Gare", href: `${base}/matches`, icon: Trophy },
      ],
    },
    {
      id: "family-office",
      label: "Segreteria",
      items: [
        { id: "parent-payments", label: "Pagamenti", href: `${base}/payments`, icon: CreditCard },
        { id: "parent-enrollment", label: "Iscrizione", href: `${base}/enrollment`, icon: FileSignature },
        { id: "parent-documents", label: "Documenti", href: `${base}/documents`, icon: FileText },
        { id: "parent-consents", label: "Consensi", href: `${base}/consents`, icon: ShieldCheck },
        { id: "parent-board", label: "Bacheca", href: `${base}/board`, icon: Megaphone },
        { id: "parent-notifications", label: "Notifiche", href: `${base}/notifications`, icon: Bell },
        { id: "parent-secretariat", label: "Segreteria", href: `${base}/secretariat`, icon: Stethoscope },
        { id: "parent-contacts", label: "Contatti club", href: `${base}/contacts`, icon: Mail },
      ],
    },
  ];
};

type TrainerNavSpec = {
  key: TrainerNavigationPermissionKey;
  label: string;
  icon: NavGroup["items"][number]["icon"];
};

const TRAINER_NAV: ReadonlyArray<{ id: string; label: string; items: TrainerNavSpec[] }> = [
  { id: "trainer-club", label: "Club", items: [{ key: "home", label: "Home", icon: Home }] },
  {
    id: "trainer-people",
    label: "Tesserati",
    items: [
      { key: "athletes", label: "Atleti", icon: UserCircle },
      { key: "categories", label: "Squadre", icon: Users },
    ],
  },
  {
    id: "trainer-activity",
    label: "Attività",
    items: [
      { key: "trainings", label: "Allenamenti", icon: CalendarDays },
      { key: "matches", label: "Gare", icon: Trophy },
    ],
  },
  {
    id: "trainer-personal",
    label: "Personale",
    items: [
      { key: "board", label: "Bacheca", icon: Megaphone },
      { key: "appointments", label: "Appuntamenti", icon: CalendarClock },
      { key: "documents", label: "Documenti", icon: FolderOpen },
      { key: "notifications", label: "Notifiche", icon: Bell },
      { key: "compensation", label: "I miei compensi", icon: Wallet },
    ],
  },
];

/** Le voci dell'allenatore: solo quelle che il suo permesso di navigazione accende. */
export const trainerAreaNavGroups = (permissions: TrainerDashboardPermissions): NavGroup[] =>
  TRAINER_NAV.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items
      .filter((item) => Boolean(permissions.navigation[item.key]))
      .map((item) => ({
        id: `trainer-${item.key}`,
        label: item.label,
        href: TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY[item.key],
        icon: item.icon,
      })),
  })).filter((group) => group.items.length > 0);

export const ATHLETE_AREA_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "athlete-area",
    label: "La mia area",
    items: [
      { id: "athlete-home", label: "Home", href: "/athlete-dashboard", icon: Home },
      { id: "athlete-teams", label: "Le mie squadre", href: "/athlete-dashboard/squadre", icon: Users },
      { id: "athlete-calendar", label: "Calendario", href: "/athlete-dashboard/calendario", icon: CalendarDays },
      { id: "athlete-trainings", label: "Allenamenti", href: "/athlete-dashboard/allenamenti", icon: Dumbbell },
      { id: "athlete-convocations", label: "Convocazioni", href: "/athlete-dashboard/convocazioni", icon: ClipboardCheck },
      { id: "athlete-matches", label: "Gare", href: "/athlete-dashboard/gare", icon: Trophy },
      { id: "athlete-attendance", label: "Presenze", href: "/athlete-dashboard/presenze", icon: ClipboardCheck },
      { id: "athlete-history", label: "Storico", href: "/athlete-dashboard/storico", icon: History },
    ],
  },
  {
    id: "athlete-office",
    label: "Comunicazioni e documenti",
    items: [
      { id: "athlete-board", label: "Bacheca", href: "/athlete-dashboard/bacheca", icon: Megaphone },
      { id: "athlete-notifications", label: "Notifiche", href: "/athlete-dashboard/notifiche", icon: Bell },
      { id: "athlete-documents", label: "Documenti", href: "/athlete-dashboard/documenti", icon: FileText },
      { id: "athlete-appointments", label: "Appuntamenti", href: "/athlete-dashboard/appuntamenti", icon: Stethoscope },
      { id: "athlete-profile", label: "Il mio profilo", href: "/athlete-dashboard/profilo", icon: UserCircle },
    ],
  },
];

/** La forma che la barra mobile si aspetta: gli stessi gruppi, senza `id` per voce. */
export const toMobileNavSections = (groups: readonly NavGroup[]) =>
  groups.map((group) => ({
    id: group.id,
    label: group.label.toUpperCase(),
    items: group.items.map((item) => ({ href: item.href, label: item.label, icon: item.icon })),
  }));
