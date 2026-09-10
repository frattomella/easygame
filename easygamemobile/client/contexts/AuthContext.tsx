import React, { createContext, useContext, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Access, Club, ClubCategorySummary, User } from "@/services/api";
import { TrainerDashboardPermissions } from "@/lib/trainer-permissions";
import { AuthOutcome } from "@/lib/auth-flow";
import { TrainerProfile } from "@/services/mobile-backend-storage";

interface AuthContextType {
  isLoading: boolean;
  isLoggedIn: boolean;
  hasContext: boolean;
  user: User | null;
  currentClub: Club | null;
  currentAccess: Access | null;
  currentRole: string | null;
  trainerPermissions: TrainerDashboardPermissions | null;
  assignedCategories: ClubCategorySummary[];
  trainerProfile: TrainerProfile | null;
  login: (email: string, password: string) => Promise<AuthOutcome>;
  logout: () => Promise<void>;
  setContext: (
    clubId: string,
    role: string,
    accessId?: string | null,
    source?: "owned" | "assigned" | null,
  ) => Promise<void>;
  clearContext: () => Promise<void>;
  updateUserProfile: (
    updates: Partial<
      Pick<User, "name" | "email" | "phone" | "city" | "avatar">
    >,
  ) => Promise<User | null>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return context;
}
