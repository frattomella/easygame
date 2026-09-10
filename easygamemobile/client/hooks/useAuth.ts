import { useState, useEffect, useCallback } from "react";
import {
  mobileBackendStorage,
  TrainerProfile,
} from "@/services/mobile-backend-storage";
import { Access, Club, ClubCategorySummary, User } from "@/services/api";
import { TrainerDashboardPermissions } from "@/lib/trainer-permissions";
import { AuthOutcome } from "@/lib/auth-flow";

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
    });
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

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
    setState(SIGNED_OUT_STATE);
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

  return {
    ...state,
    login,
    logout,
    setContext,
    clearContext,
    updateUserProfile,
    refresh: checkAuth,
  };
}
