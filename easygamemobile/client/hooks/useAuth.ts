import { useState, useEffect, useCallback } from "react";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Access, Club, ClubCategorySummary, User } from "@/services/api";
import { TrainerDashboardPermissions } from "@/lib/trainer-permissions";

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
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isLoggedIn: false,
    hasContext: false,
    user: null,
    currentClub: null,
    currentAccess: null,
    currentRole: null,
    trainerPermissions: null,
    assignedCategories: [],
  });

  const checkAuth = useCallback(async () => {
    const withTimeout = async <T,>(promise: Promise<T>, fallback: T, ms = 3500) => {
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
      setState({
        isLoading: false,
        isLoggedIn: false,
        hasContext: false,
        user: null,
        currentClub: null,
        currentAccess: null,
        currentRole: null,
        trainerPermissions: null,
        assignedCategories: [],
      });
      return;
    }

    const user = await withTimeout(mobileBackendStorage.getUser(), null, 2500);

    if (!user) {
      await mobileBackendStorage.logout().catch(() => undefined);
      setState({
        isLoading: false,
        isLoggedIn: false,
        hasContext: false,
        user: null,
        currentClub: null,
        currentAccess: null,
        currentRole: null,
        trainerPermissions: null,
        assignedCategories: [],
      });
      return;
    }

    const context = await withTimeout(mobileBackendStorage.getContext(), null, 2500);
    const hasContext = Boolean(context?.clubId && context?.role);

    if (!hasContext) {
      setState({
        isLoading: false,
        isLoggedIn: true,
        hasContext: false,
        user,
        currentClub: null,
        currentAccess: null,
        currentRole: null,
        trainerPermissions: null,
        assignedCategories: [],
      });
      return;
    }

    const [currentClub, currentAccess, trainerPermissions, assignedCategories] =
      await Promise.all([
        withTimeout(mobileBackendStorage.getCurrentClub(), null, 3000),
        withTimeout(mobileBackendStorage.getCurrentAccess(), null, 3000),
        withTimeout(mobileBackendStorage.getTrainerPermissions(), null, 3000),
        withTimeout(mobileBackendStorage.getAssignedCategories(), [], 3000),
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
    });
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string): Promise<boolean> => {
    const user = await mobileBackendStorage.login(email, password);
    if (user) {
      await checkAuth();
      return true;
    }
    return false;
  };

  const logout = async () => {
    await mobileBackendStorage.logout();
    setState({
      isLoading: false,
      isLoggedIn: false,
      hasContext: false,
      user: null,
      currentClub: null,
      currentAccess: null,
      currentRole: null,
      trainerPermissions: null,
      assignedCategories: [],
    });
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
