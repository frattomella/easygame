import { useState, useEffect, useCallback } from "react";
import {
  mobileBackendStorage,
  TrainerProfile,
} from "@/services/mobile-backend-storage";
import { Access, Club, ClubCategorySummary, User } from "@/services/api";
import { TrainerDashboardPermissions } from "@/lib/trainer-permissions";
import { AuthOutcome, SignOutReason, withSignOutReason } from "@/lib/auth-flow";

interface AuthState {
  isLoading: boolean;
  isLoggedIn: boolean;
  hasContext: boolean;
  user: User | null;
  currentClub: Club | null;
  currentAccess: Access | null;
  currentRole: string | null;
  trainerPermissions: TrainerDashboardPermissions | null;
  assignedCategories: ClubCategorySummary[];
  /** `null` per chi ha accesso pieno al club (owner/admin), non solo per errore. */
  trainerProfile: TrainerProfile | null;
  /**
   * v3.0 (`migration-v3.md` passo 7, "Sessione scaduta"): **non** cambia il
   * momento in cui la sessione viene chiusa — resta lo stesso istante,
   * stesso motivo documentato sopra (WP12, niente attesa, niente ciclo).
   * Porta solo *perche* si e arrivati a `SIGNED_OUT_STATE`, cosi
   * `LoginScreen` puo mostrare un avviso invece di un login muto quando il
   * motivo e la scadenza e non una scelta della persona. Letto una sola
   * volta al mount di `LoginScreen`, poi azzerato: non e uno stato che
   * sopravvive a un nuovo login o a un logout volontario successivo.
   */
  signOutReason: SignOutReason;
}

const SIGNED_OUT_STATE: AuthState = {
  isLoading: false,
  isLoggedIn: false,
  hasContext: false,
  user: null,
  currentClub: null,
  currentAccess: null,
  currentRole: null,
  trainerPermissions: null,
  assignedCategories: [],
  trainerProfile: null,
  signOutReason: null,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    ...SIGNED_OUT_STATE,
    isLoading: true,
  });

  const checkAuth = useCallback(async () => {
    const withTimeout = async <T>(
      promise: Promise<T>,
      fallback: T,
      ms = 3500,
    ) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race<T>([
          promise,
          new Promise<T>((resolve) => {
            timer = setTimeout(() => resolve(fallback), ms);
          }),
        ]);
      } catch {
        return fallback;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };

    const isLoggedIn = await withTimeout(
      mobileBackendStorage.isLoggedIn(),
      false,
      1000,
    );

    if (!isLoggedIn) {
      setState(SIGNED_OUT_STATE);
      return;
    }

    const user = await withTimeout(mobileBackendStorage.getUser(), null, 2500);

    if (!user) {
      await mobileBackendStorage.logout().catch(() => undefined);
      setState(SIGNED_OUT_STATE);
      return;
    }

    const context = await withTimeout(
      mobileBackendStorage.getContext(),
      null,
      2500,
    );
    const hasContext = Boolean(context?.clubId && context?.role);

    if (!hasContext) {
      setState({
        ...SIGNED_OUT_STATE,
        isLoading: false,
        isLoggedIn: true,
        hasContext: false,
        user,
      });
      return;
    }

    const [
      currentClub,
      currentAccess,
      trainerPermissions,
      assignedCategories,
      trainerProfile,
    ] = await Promise.all([
      withTimeout(mobileBackendStorage.getCurrentClub(), null, 3000),
      withTimeout(mobileBackendStorage.getCurrentAccess(), null, 3000),
      withTimeout(mobileBackendStorage.getTrainerPermissions(), null, 3000),
      withTimeout(mobileBackendStorage.getAssignedCategories(), [], 3000),
      withTimeout(mobileBackendStorage.getTrainerProfile(), null, 3000),
    ]);

    setState({
      isLoading: false,
      isLoggedIn: true,
      hasContext: true,
      user,
      currentClub,
      currentAccess,
      currentRole: context?.role || null,
      trainerPermissions,
      assignedCategories,
      trainerProfile,
      signOutReason: null,
    });
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /*
    Sessione revocata mentre l'app e aperta (WP12 — session hardening): la
    prossima chiamata autenticata che riceve un 401 pulisce token, utente e
    contesto da sola (`api.ts`/`mobile-backend-storage.ts`); qui si riporta
    lo stato React a "sloggato" nello stesso istante, senza aspettare un
    riavvio a freddo e senza un ciclo di redirect — `SIGNED_OUT_STATE` e lo
    stesso stato finale di un logout volontario.
  */
  useEffect(
    () =>
      mobileBackendStorage.onSessionExpired(() =>
        setState(withSignOutReason(SIGNED_OUT_STATE, "expired")),
      ),
    [],
  );

  const login = async (
    email: string,
    password: string,
  ): Promise<AuthOutcome> => {
    const outcome = await mobileBackendStorage.login(email, password);
    if (outcome.kind === "authenticated") {
      await checkAuth();
    }
    return outcome;
  };

  const logout = async () => {
    await mobileBackendStorage.logout();
    setState(withSignOutReason(SIGNED_OUT_STATE, "manual"));
  };

  const setContext = async (
    clubId: string,
    role: string,
    accessId?: string | null,
    source?: "owned" | "assigned" | null,
  ) => {
    await mobileBackendStorage.setContext(clubId, role, accessId, source);
    await checkAuth();
  };

  const clearContext = async () => {
    await mobileBackendStorage.clearContext();
    await checkAuth();
  };

  const updateUserProfile = async (
    updates: Partial<
      Pick<User, "name" | "email" | "phone" | "city" | "avatar">
    >,
  ) => {
    const nextUser = await mobileBackendStorage.updateUserProfile(updates);
    await checkAuth();
    return nextUser;
  };

  const clearSignOutReason = useCallback(() => {
    setState((current) =>
      current.signOutReason ? { ...current, signOutReason: null } : current,
    );
  }, []);

  return {
    ...state,
    login,
    logout,
    setContext,
    clearContext,
    updateUserProfile,
    clearSignOutReason,
    refresh: checkAuth,
  };
}
