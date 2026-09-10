import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import { resolveSelectedChildId } from "@/lib/parent-children";
import type { ParentChild } from "@/services/api";
import { useAuthContext } from "@/contexts/AuthContext";

const SELECTED_CHILD_KEY = "@easygame/mobile/parent/selected-child";

export type ParentChildrenStatus =
  | "loading"
  | "ready"
  | "empty"
  | "forbidden"
  | "network"
  | "error";

interface ParentContextType {
  status: ParentChildrenStatus;
  children: ParentChild[];
  selectedChildId: string | null;
  selectedChild: ParentChild | null;
  errorMessage: string;
  /** `true` durante il cambio figlio (dopo la prima selezione riuscita) — distinto da `loading` iniziale. */
  switching: boolean;
  selectChild: (childId: string) => void;
  reload: () => void;
}

const ParentContext = createContext<ParentContextType | null>(null);

/**
 * Il contesto figlio dell'area Parent — separato da `AuthContext`/`currentClub`
 * apposta: l'organization del figlio selezionato **non** deriva dal club
 * attivo Trainer/AccountHub, esattamente come sul Web
 * (`getParentDashboardData` deriva sempre il club dall'`athleteId` nel
 * path, mai da un header/cookie di club attivo — vedi
 * `docs/knowledge-base/05-mobile-architecture.md`, sezione Parent). Ogni
 * schermata dell'area Parent legge `selectedChildId` da qui e lo passa come
 * `athleteId` alle chiamate `/api/parent-dashboard/[athleteId]/**`; il
 * server resta l'unico a decidere se quel legame e vero
 * (`canParentAccessAthlete`).
 */
export function ParentProvider({ children: tree }: { children: ReactNode }) {
  const { isLoggedIn } = useAuthContext();
  const [status, setStatus] = useState<ParentChildrenStatus>("loading");
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [switching, setSwitching] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn) {
      return () => {
        cancelled = true;
      };
    }

    setStatus("loading");
    setErrorMessage("");

    (async () => {
      try {
        const [linkedChildren, storedId] = await Promise.all([
          mobileBackendStorage.getLinkedChildren(),
          AsyncStorage.getItem(SELECTED_CHILD_KEY),
        ]);
        if (cancelled) return;

        const nextSelectedId = resolveSelectedChildId(linkedChildren, storedId);
        setChildren(linkedChildren);
        setSelectedChildId(nextSelectedId);
        setStatus(linkedChildren.length === 0 ? "empty" : "ready");

        if (nextSelectedId && nextSelectedId !== storedId) {
          await AsyncStorage.setItem(SELECTED_CHILD_KEY, nextSelectedId);
        }
      } catch (error) {
        if (cancelled) return;
        const kind = classifyFetchError(error);
        setErrorMessage(
          fetchErrorMessage(
            error,
            kind === "forbidden"
              ? "Accesso non consentito."
              : "Errore di connessione.",
          ),
        );
        setStatus(kind);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, reloadToken]);

  const selectChild = useCallback(
    (childId: string) => {
      if (childId === selectedChildId) return;
      setSwitching(true);
      setSelectedChildId(childId);
      AsyncStorage.setItem(SELECTED_CHILD_KEY, childId)
        .catch(() => undefined)
        .finally(() => setSwitching(false));
    },
    [selectedChildId],
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const selectedChild =
    children.find((child) => child.id === selectedChildId) || null;

  return (
    <ParentContext.Provider
      value={{
        status,
        children,
        selectedChildId,
        selectedChild,
        errorMessage,
        switching,
        selectChild,
        reload,
      }}
    >
      {tree}
    </ParentContext.Provider>
  );
}

export function useParentContext() {
  const context = useContext(ParentContext);
  if (!context) {
    throw new Error("useParentContext must be used within ParentProvider");
  }
  return context;
}
