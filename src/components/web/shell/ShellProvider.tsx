"use client";

import * as React from "react";
import { readPreference, writePreference } from "@/lib/web/preferences";
import type { NavGroup } from "@/components/web/shell/navigation";

/**
 * Lo stato del guscio Web V2, condiviso fra barra laterale e topbar anche
 * quando le pagine le montano separatamente (com'e oggi in 44 pagine).
 *
 * - `collapsed`: la barra laterale a 72px. Persiste in `egw.shell.sidebar`;
 *   sotto i 1280px parte compressa se l'utente non ha mai scelto.
 * - `quickActionsOpen` / `notificationsOpen`: i due cassetti globali; uno
 *   alla volta (guideline 06 §6.7).
 * - `breadcrumbLabel`: l'etichetta dell'ultimo segmento quando la pagina la
 *   conosce (il nome dell'atleta nella sua scheda).
 * - `areaNav`: i gruppi di navigazione dell'**area** in cui si sta — famiglia,
 *   allenatore, atleta — quando non sono quelli del gestionale. Li dichiara
 *   il guscio dell'area (`useShellArea`); il breadcrumb della topbar li usa
 *   per risolvere il percorso, e la ricerca globale sugli atleti — che
 *   porta a `/athletes`, una rotta del gestionale — non si disegna.
 */
type ShellState = {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggleCollapsed: () => void;
  quickActionsOpen: boolean;
  setQuickActionsOpen: (next: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (next: boolean) => void;
  breadcrumbLabel: string | null;
  setBreadcrumbLabel: (label: string | null) => void;
  areaNav: readonly NavGroup[] | null;
  setAreaNav: (groups: readonly NavGroup[] | null) => void;
  hydrated: boolean;
};

const ShellContext = React.createContext<ShellState>({
  collapsed: false,
  setCollapsed: () => {},
  toggleCollapsed: () => {},
  quickActionsOpen: false,
  setQuickActionsOpen: () => {},
  notificationsOpen: false,
  setNotificationsOpen: () => {},
  breadcrumbLabel: null,
  setBreadcrumbLabel: () => {},
  areaNav: null,
  setAreaNav: () => {},
  hydrated: false,
});

export const useShell = () => React.useContext(ShellContext);

const LAPTOP_FLOOR = 1280;

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [quickActionsOpen, setQuickActionsOpenState] = React.useState(false);
  const [notificationsOpen, setNotificationsOpenState] = React.useState(false);
  const [breadcrumbLabel, setBreadcrumbLabel] = React.useState<string | null>(null);
  const [areaNav, setAreaNav] = React.useState<readonly NavGroup[] | null>(null);
  const userChoice = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    /*
      Compatibilita con la chiave del guscio V1 (`sidebar-collapsed`): chi
      aveva compresso la barra la ritrova compressa.
    */
    const saved = readPreference<boolean | null>("shell", "sidebar", null);
    let legacy: boolean | null = null;
    try {
      const raw = window.localStorage.getItem("sidebar-collapsed");
      legacy = raw === null ? null : raw === "true";
    } catch {
      legacy = null;
    }
    const choice = saved ?? legacy;
    userChoice.current = choice;
    if (choice !== null) {
      setCollapsedState(choice);
    } else {
      setCollapsedState(window.innerWidth < LAPTOP_FLOOR);
    }
    setHydrated(true);

    const onResize = () => {
      if (userChoice.current === null) {
        setCollapsedState(window.innerWidth < LAPTOP_FLOOR);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setCollapsed = React.useCallback((next: boolean) => {
    userChoice.current = next;
    setCollapsedState(next);
    writePreference("shell", "sidebar", next);
    try {
      window.localStorage.setItem("sidebar-collapsed", String(next));
    } catch {
      /* ignora */
    }
  }, []);

  const toggleCollapsed = React.useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  const setQuickActionsOpen = React.useCallback((next: boolean) => {
    setQuickActionsOpenState(next);
    if (next) setNotificationsOpenState(false);
  }, []);
  const setNotificationsOpen = React.useCallback((next: boolean) => {
    setNotificationsOpenState(next);
    if (next) setQuickActionsOpenState(false);
  }, []);

  // Scorciatoia ⌘J / Ctrl+J per le azioni rapide.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setQuickActionsOpen(!quickActionsOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickActionsOpen, setQuickActionsOpen]);

  const value = React.useMemo<ShellState>(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      quickActionsOpen,
      setQuickActionsOpen,
      notificationsOpen,
      setNotificationsOpen,
      breadcrumbLabel,
      setBreadcrumbLabel,
      areaNav,
      setAreaNav,
      hydrated,
    }),
    [
      collapsed,
      setCollapsed,
      toggleCollapsed,
      quickActionsOpen,
      setQuickActionsOpen,
      notificationsOpen,
      setNotificationsOpen,
      breadcrumbLabel,
      areaNav,
      hydrated,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** Una pagina dichiara l'etichetta dell'ultimo segmento del breadcrumb. */
export function useBreadcrumbLabel(label: string | null | undefined) {
  const { setBreadcrumbLabel } = useShell();
  React.useEffect(() => {
    setBreadcrumbLabel(label || null);
    return () => setBreadcrumbLabel(null);
  }, [label, setBreadcrumbLabel]);
}

/**
 * Il guscio di un'area dichiara i propri gruppi di navigazione per il tempo
 * in cui e montato: topbar e barra mobile li leggono da qui.
 */
export function useShellArea(groups: readonly NavGroup[] | null) {
  const { setAreaNav } = useShell();
  React.useEffect(() => {
    setAreaNav(groups);
    return () => setAreaNav(null);
  }, [groups, setAreaNav]);
}
