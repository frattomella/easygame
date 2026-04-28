"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast-notification";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building, Users } from "lucide-react";

export function LoginForm() {
  return <AuthShell defaultMode="login" />;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userType, setUserType] = useState("club");
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<any[]>([]);
  const [showSavedAccounts, setShowSavedAccounts] = useState(false);

  // Load saved accounts on component mount and handle URL parameters
  useEffect(() => {
    // Check for email in URL search params first (highest priority)
    const emailFromSearch = searchParams?.get("email");
    console.log("Email from search params:", emailFromSearch);

    if (emailFromSearch) {
      setEmail(emailFromSearch);
      // If we have an email from URL, don't show saved accounts
      setShowSavedAccounts(false);
      return;
    }

    // Then load saved accounts
    const accounts = localStorage.getItem("savedAccounts");
    if (accounts) {
      try {
        const parsedAccounts = JSON.parse(accounts);
        setSavedAccounts(parsedAccounts);
        setShowSavedAccounts(parsedAccounts.length > 0);
      } catch (e) {
        console.error("Error parsing saved accounts:", e);
      }
    }

    // Check for remembered email (lowest priority)
    const rememberedEmail = localStorage.getItem("userEmail");
    if (rememberedEmail && !email) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Check if browser is online before attempting login
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const offlineMessage =
        "Sei offline. Verifica la tua connessione internet e riprova.";
      setError(offlineMessage);
      showToast("error", offlineMessage);
      setLoading(false);
      return;
    }

    try {
      // Frontend-only login backed by the local mock data layer
      console.log("Attempting login with:", { email, password });
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      console.log("Login response:", { data, error: signInError });

      // Clear loading state if there's an error
      if (signInError) {
        console.error("Supabase login error:", signInError);
        let errorMessage = "";

        // Use more specific error messages
        if (signInError.message.includes("Invalid login credentials")) {
          errorMessage = "Email o password non corretti. Riprova.";
        } else if (signInError.message.includes("Email not confirmed")) {
          errorMessage =
            "Email non confermata. Controlla la tua casella email.";
        } else if (
          signInError.message.includes("Failed to fetch") ||
          signInError.name === "AuthRetryableFetchError" ||
          signInError.message.includes("fetch")
        ) {
          errorMessage =
            "Problema di connessione al server. Verifica la tua connessione internet e riprova tra qualche secondo.";
        } else if (
          signInError.message.includes("NetworkError") ||
          signInError.message.includes("ERR_INSUFFICIENT_RESOURCES")
        ) {
          errorMessage =
            "Errore di rete. Controlla la tua connessione internet e riprova.";
        } else {
          errorMessage = `Errore durante l'accesso: ${signInError.message}`;
        }

        setError(errorMessage);
        showToast("error", errorMessage);
        setLoading(false);
        return;
      }

      if (!data.session) {
        setError("Accesso fallito. Riprova.");
        setLoading(false);
        return;
      }

      // Store remember me preference
      if (rememberMe) {
        localStorage.setItem("rememberMe", "true");
        localStorage.setItem("userEmail", email);
      } else {
        localStorage.removeItem("rememberMe");
        localStorage.removeItem("userEmail");
      }

      // Save account to saved accounts list
      const userRole = data.user?.user_metadata?.role || "user";
      const userName = data.user?.user_metadata?.name || email.split("@")[0];

      const newAccount = {
        email,
        userType: userRole,
        name: userName,
        timestamp: new Date().toISOString(),
      };

      const existingAccounts = localStorage.getItem("savedAccounts");
      let accounts = [];

      if (existingAccounts) {
        try {
          accounts = JSON.parse(existingAccounts);
          // Check if account already exists
          const existingIndex = accounts.findIndex(
            (acc: any) => acc.email === email && acc.userType === userRole,
          );

          if (existingIndex >= 0) {
            // Update existing account
            accounts[existingIndex] = newAccount;
          } else {
            // Add new account
            accounts.push(newAccount);
          }
        } catch (e) {
          console.error("Error parsing saved accounts:", e);
          accounts = [newAccount];
        }
      } else {
        accounts = [newAccount];
      }

      localStorage.setItem("savedAccounts", JSON.stringify(accounts));

      // Show success notification
      showToast("success", "Login effettuato con successo!");

      // Check if user has any organizations
      const { data: orgs } = await supabase
        .from("organization_users")
        .select("organization_id, role, organizations(name)")
        .eq("user_id", data.user.id);

      let redirectPath = "/dashboard";

      // Determine redirect path based on user type and selected login type
      if (userType === "club") {
        // For club login type
        if (
          data.user?.user_metadata?.isClubCreator ||
          data.user?.user_metadata?.role === "club_creator" ||
          (orgs && orgs.length > 0)
        ) {
          // If user has organizations, redirect to the specific club dashboard
          if (orgs && orgs.length > 0) {
            // Get the primary organization or the first one
            const primaryOrg =
              orgs.find((org) => org.role === "owner") || orgs[0];

            // Store the active club in localStorage
            localStorage.setItem(
              "activeClub",
              JSON.stringify({
                id: primaryOrg.organization_id,
                role: primaryOrg.role,
                name: primaryOrg.organizations?.name || "Club",
                roleLabel: getRoleLabel(primaryOrg.role),
              }),
            );

            // Redirect to the specific club dashboard with the club ID
            redirectPath = `/dashboard?clubId=${primaryOrg.organization_id}`;
          } else {
            // If no organizations yet, just go to the dashboard
            redirectPath = "/dashboard";
          }
        } else {
          // If not a club creator and no orgs, go to token verification
          // Use dynamic route for user-specific page
          redirectPath = `/token-verification/${data.user.id}`;
        }
      } else {
        // For user login type (athlete, parent, trainer)
        if (data.user?.user_metadata?.role === "trainer") {
          redirectPath = "/trainer-dashboard";
        } else if (data.user?.user_metadata?.role === "athlete") {
          redirectPath = "/parent-view/profile";
        } else if (data.user?.user_metadata?.role === "parent") {
          redirectPath = "/parent-view/dashboard";
        } else {
          // Use dynamic route for user-specific page
          redirectPath = `/token-verification/${data.user.id}`;
        }
      }

      // Helper function to get role label
      function getRoleLabel(role: string): string {
        switch (role) {
          case "owner":
            return "Gestore";
          case "admin":
            return "Amministratore";
          case "trainer":
            return "Allenatore";
          case "athlete":
            return "Atleta";
          case "parent":
            return "Genitore";
          default:
            return "Utente";
        }
      }

      console.log("Redirecting to:", redirectPath);
      router.push(redirectPath);
    } catch (err: any) {
      console.error("Login error:", err);
      setLoading(false);
      let errorMessage = "Credenziali non valide. Riprova.";

      // Handle specific error messages
      if (err.message?.includes("Invalid login credentials")) {
        errorMessage = "Email o password non validi. Riprova.";
      } else if (err.message?.includes("Email not confirmed")) {
        errorMessage = "Email non confermata. Controlla la tua casella email.";
      } else if (
        err.message?.includes("Failed to fetch") ||
        err.name === "AuthRetryableFetchError" ||
        err.message?.includes("fetch") ||
        err.message?.includes("NetworkError") ||
        err.message?.includes("ERR_INSUFFICIENT_RESOURCES") ||
        err.message?.includes("connessione")
      ) {
        errorMessage =
          "Problema di connessione. Verifica la tua connessione internet e riprova tra qualche secondo.";

        // Add additional guidance for network issues
        if (err.message?.includes("ERR_INSUFFICIENT_RESOURCES")) {
          errorMessage +=
            " Se il problema persiste, prova a ricaricare la pagina.";
        }
      } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
        errorMessage =
          "Impossibile raggiungere il server. Controlla la tua connessione internet.";
      }

      setError(errorMessage);
      showToast("error", errorMessage);
    }
  };

  const selectSavedAccount = (account: any) => {
    setEmail(account.email);
    setUserType(
      account.userType === "club_creator" ||
        account.userType === "club" ||
        account.userType === "club_manager" ||
        account.userType === "manager"
        ? "club"
        : "user",
    );
    setShowSavedAccounts(false);
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold">SportManager</h2>
        <p className="text-sm text-muted-foreground">
          {userType === "club"
            ? "Accedi alla dashboard del tuo club"
            : "Accedi al tuo profilo utente"}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Modalita frontend-only: i dati vengono salvati localmente nel browser.
        </p>
      </div>

      {showSavedAccounts && savedAccounts.length > 0 && (
        <div className="mb-4 p-4 border rounded-md bg-gray-50">
          <h3 className="text-sm font-medium mb-2">Account recenti</h3>
          <div className="space-y-2">
            {savedAccounts.map((account, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 hover:bg-gray-100 rounded cursor-pointer"
                onClick={() => selectSavedAccount(account)}
              >
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-xs text-gray-500">{account.email}</p>
                </div>
                <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {account.userType === "club_creator" ||
                  account.userType === "club"
                    ? "Club"
                    : account.userType === "club_manager" ||
                        account.userType === "manager"
                      ? "Gestore"
                      : account.userType === "trainer"
                        ? "Allenatore"
                        : account.userType === "athlete"
                          ? "Atleta"
                          : account.userType === "parent"
                            ? "Genitore"
                            : "Utente"}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-center">
            <button
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setShowSavedAccounts(false)}
            >
              Usa un altro account
            </button>
          </div>
        </div>
      )}

      {!showSavedAccounts && (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="#" className="text-sm text-blue-600 hover:underline">
                  Password dimenticata?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="remember-me"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <Label htmlFor="remember-me" className="text-sm text-gray-600">
                Ricorda accesso
              </Label>
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600 mb-2">{error}</p>
                {(error.includes("connessione") ||
                  error.includes("rete") ||
                  error.includes("fetch")) && (
                  <div className="mt-2 text-xs text-red-500">
                    <p>Suggerimenti:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Controlla la tua connessione internet</li>
                      <li>Ricarica la pagina e riprova</li>
                      <li>Se il problema persiste, contatta il supporto</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Accesso in corso...
                </>
              ) : (
                "Accedi"
              )}
            </Button>
          </form>

          {savedAccounts.length > 0 && (
            <div className="text-center mt-2">
              <button
                className="text-sm text-blue-600 hover:underline"
                onClick={() => setShowSavedAccounts(true)}
              >
                Visualizza account salvati
              </button>
            </div>
          )}
        </>
      )}

      <div className="text-center text-sm">
        <span className="text-muted-foreground">Non hai un account? </span>
        <a href="/register" className="text-blue-600 hover:underline">
          Registrati
        </a>
      </div>
    </div>
  );
}
