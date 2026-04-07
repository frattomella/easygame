"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type AuthContextType = {
  user: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
  error: string | null;
  userRole: string;
  isClubCreator: boolean;
  isClubManager: boolean;
  isTrainer: boolean;
  isAthlete: boolean;
  isParent: boolean;
  isGenericUser: boolean;
  generateAccessCode: () => string;
  accessCode: string | null;
  accessCodeExpiry: Date | null;
  activeClub: any | null;
  setActiveClub: (club: any) => void;
  athleteProfile?: {
    id: string;
    name: string;
    categories: string[];
    jerseyNumber?: number;
  } | null;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  signOut: async () => {},
  userRole: "",
  isClubCreator: false,
  isClubManager: false,
  isTrainer: false,
  isAthlete: false,
  isParent: false,
  isGenericUser: false,
  generateAccessCode: () => "",
  accessCode: null,
  accessCodeExpiry: null,
  activeClub: null,
  setActiveClub: () => {},
  athleteProfile: null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState("");
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [accessCodeExpiry, setAccessCodeExpiry] = useState<Date | null>(null);
  const [activeClub, setActiveClub] = useState<any | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<{
    id: string;
    name: string;
    categories: string[];
    jerseyNumber?: number;
  } | null>(null);
  const router = useRouter();

  // Role-based flags
  const isClubCreator =
    user?.user_metadata?.isClubCreator === true ||
    user?.user_metadata?.role === "club_creator" ||
    user?.user_metadata?.role === "club_manager" ||
    user?.user_metadata?.role === "admin";
  const isClubManager =
    userRole === "club_manager" || user?.user_metadata?.role === "club_manager";
  const isTrainer = userRole === "trainer";
  const isAthlete = userRole === "athlete";
  const isParent = userRole === "parent";
  const isGenericUser = userRole === "generic_user" || userRole === "user";

  // Generate a random access code for club managers
  const generateAccessCode = () => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < 10; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    // Set the access code and its expiry (3 minutes from now)
    setAccessCode(result);
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 3);
    setAccessCodeExpiry(expiry);

    // In a real implementation, this would be saved to the database
    return result;
  };

  // Load active club when user changes
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;

    const loadActiveClub = () => {
      const userSpecificClub = localStorage.getItem(`activeClub_${user.id}`);
      const genericClub = localStorage.getItem("activeClub");

      try {
        if (userSpecificClub) {
          const parsedClub = JSON.parse(userSpecificClub);
          console.log("Loading user-specific active club:", parsedClub);
          setActiveClub(parsedClub);
        } else if (genericClub) {
          const parsedClub = JSON.parse(genericClub);
          console.log("Loading generic active club:", parsedClub);
          setActiveClub(parsedClub);
          // Migrate to user-specific storage
          localStorage.setItem(`activeClub_${user.id}`, genericClub);
        } else {
          console.log("No active club found in localStorage");
          setActiveClub(null);
        }
      } catch (e) {
        console.error("Error parsing active club:", e);
        setActiveClub(null);
      }
    };

    loadActiveClub();
  }, [user?.id]);

  // Optimized authentication check with caching
  useEffect(() => {
    // Skip auth operations during SSR
    if (typeof window === "undefined") {
      setLoading(false);
      return () => {};
    }

    // Cache protected pages check
    const protectedPaths = new Set([
      "/account",
      "/dashboard",
      "/trainer-dashboard",
      "/parent-view",
      "/athletes",
      "/categories",
      "/training",
      "/medical",
      "/notifications",
      "/reports",
      "/settings",
      "/permissions",
      "/accounting",
      "/movements",
      "/matches",
      "/soci",
      "/staff",
      "/sponsors",
      "/secretariat",
      "/modulistica",
    ]);

    const currentPath = window.location.pathname;
    const isProtectedPage = Array.from(protectedPaths).some((path) =>
      currentPath.includes(path),
    );

    const getUser = async () => {
      try {
        setError(null);

        // Use cached session if available and recent
        const cachedSession = sessionStorage.getItem("supabase_session");
        const cacheTimestamp = sessionStorage.getItem(
          "supabase_session_timestamp",
        );
        const now = Date.now();

        if (
          cachedSession &&
          cacheTimestamp &&
          now - parseInt(cacheTimestamp) < 60000
        ) {
          try {
            const session = JSON.parse(cachedSession);
            if (session?.user) {
              setUser(session.user);
              // Use metadata first for faster loading
              if (session.user.user_metadata?.isClubCreator) {
                setUserRole("club_creator");
              } else if (session.user.user_metadata?.role) {
                setUserRole(session.user.user_metadata.role);
              } else {
                setUserRole("user");
              }
              setLoading(false);
              return;
            }
          } catch (e) {
            // Invalid cache, continue with fresh request
            sessionStorage.removeItem("supabase_session");
            sessionStorage.removeItem("supabase_session_timestamp");
          }
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          // Handle specific Supabase Auth errors gracefully
          const errorMessage = sessionError.message || "";
          if (errorMessage.includes("refresh_token_hmac_key") || 
              errorMessage.includes("missing destination name")) {
            // This is a temporary Supabase Auth server issue - clear session and continue
            console.warn("Supabase Auth temporary issue, clearing session:", sessionError);
            sessionStorage.removeItem("supabase_session");
            sessionStorage.removeItem("supabase_session_timestamp");
            // Don't show error to user, just proceed without session
          } else {
            console.error("Error getting session:", sessionError);
            setError(
              "Errore di connessione al server. Verifica la tua connessione internet.",
            );
            return;
          }
        }

        if (session?.user) {
          setUser(session.user);
          // Cache session for faster subsequent loads
          sessionStorage.setItem("supabase_session", JSON.stringify(session));
          sessionStorage.setItem("supabase_session_timestamp", now.toString());

          // Use metadata first for faster loading
          if (session.user.user_metadata?.isClubCreator) {
            setUserRole("club_creator");
          } else if (session.user.user_metadata?.role) {
            setUserRole(session.user.user_metadata.role);
          } else {
            setUserRole("user");
          }
        } else if (isProtectedPage) {
          // If no session but on protected page, redirect to login
          window.location.href = "/";
          return;
        }
      } catch (error) {
        console.error("Error getting session:", error);
        setError(
          "Errore di connessione al server. Verifica la tua connessione internet.",
        );
        if (isProtectedPage) {
          window.location.href = "/";
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    getUser();

    // Default empty subscription in case setup fails
    let subscription: { unsubscribe: () => void } = { unsubscribe: () => {} };

    try {
      const { data, error: authChangeError } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          // Handle specific Supabase Auth errors gracefully
          if (authChangeError) {
            const errorMessage = authChangeError.message || "";
            if (errorMessage.includes("refresh_token_hmac_key") || 
                errorMessage.includes("missing destination name")) {
              console.warn("Supabase Auth temporary issue in auth state change:", authChangeError);
              // Don't show error to user for temporary server issues
            } else {
              console.error("Auth state change error:", authChangeError);
              setError(
                "Errore di connessione al server. Verifica la tua connessione internet.",
              );
            }
            return;
          }

          if (session?.user) {
            setUser(session.user);
            // Use metadata first for faster loading
            if (session.user.user_metadata?.isClubCreator) {
              setUserRole("club_creator");
            } else if (session.user.user_metadata?.role) {
              setUserRole(session.user.user_metadata.role);
            } else {
              setUserRole("user");
            }
            setError(null);
          } else {
            setUser(null);
            setUserRole("");
            if (event === "SIGNED_OUT") {
              // Clear localStorage on sign out
              const keysToRemove = [
                "mockUser",
                "accessCode",
                "accessCodeExpiry",
                "activeClub",
                "userClubs",
              ];
              keysToRemove.forEach((key) => localStorage.removeItem(key));
              router.push("/");
            }
          }
          setLoading(false);
        },
      );

      if (data?.subscription) {
        subscription = data.subscription;
      }
    } catch (error) {
      console.error("Error setting up auth listener:", error);
      setError(
        "Errore di connessione al server. Verifica la tua connessione internet.",
      );
      setLoading(false);
    }

    return () => {
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.error("Error unsubscribing from auth changes:", error);
      }
    };
  }, [router]);

  const signOut = async () => {
    try {
      setError(null);

      // Clear local storage items
      localStorage.removeItem("mockUser");
      localStorage.removeItem("accessCode");
      localStorage.removeItem("accessCodeExpiry");
      localStorage.removeItem("activeClub");
      localStorage.removeItem("userClubs");
      // Also remove user-specific club if user ID is available
      if (user?.id) {
        localStorage.removeItem(`activeClub_${user.id}`);
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error("Error signing out:", signOutError);
        setError("Errore durante il logout. Riprova più tardi.");
        return;
      }
      setUser(null);
      setUserRole("");
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
      setError("Errore durante il logout. Riprova più tardi.");
    }
  };

  // Fetch real athlete profile data if user is an athlete
  useEffect(() => {
    if (isAthlete && user) {
      // In a real app, this would fetch from the database
      const fetchAthleteProfile = async () => {
        try {
          const { data, error } = await supabase
            .from("athletes")
            .select("*")
            .eq("user_id", user.id)
            .single();

          if (data && !error) {
            setAthleteProfile({
              id: data.id,
              name: data.name,
              categories: [], // Would need another query to get categories
              jerseyNumber: data.jersey_number,
            });
          } else {
            // Fallback to user data if no athlete profile found
            setAthleteProfile({
              id: user.id || "",
              name: user.user_metadata?.name || user.email?.split("@")[0] || "",
              categories: [],
              jerseyNumber: undefined,
            });
          }
        } catch (error) {
          console.error("Error fetching athlete profile:", error);
          // Fallback to user data
          setAthleteProfile({
            id: user.id || "",
            name: user.user_metadata?.name || user.email?.split("@")[0] || "",
            categories: [],
            jerseyNumber: undefined,
          });
        }
      };

      fetchAthleteProfile();
    }
  }, [isAthlete, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signOut,
        userRole,
        isClubCreator,
        isClubManager,
        isTrainer,
        isAthlete,
        isParent,
        isGenericUser,
        generateAccessCode,
        accessCode,
        accessCodeExpiry,
        activeClub,
        setActiveClub,
        athleteProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
