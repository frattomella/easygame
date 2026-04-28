"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase";

export default function TokenVerificationRedirect() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Add a timeout to prevent infinite loading
    const redirectTimeout = setTimeout(() => {
      if (!user?.id) {
        // If no user after 3 seconds, redirect to login
        console.log("No user found after timeout, redirecting to login");
        router.push("/login");
        return;
      }
    }, 3000);

    // Check if we have a userId in localStorage (from registration or login)
    const checkUserIdAndRedirect = async () => {
      try {
        // First check localStorage for userId
        const storedUserId = localStorage.getItem("userId");
        if (storedUserId) {
          console.log(
            "Found stored userId in localStorage, redirecting:",
            storedUserId,
          );
          router.push(`/token-verification/${storedUserId}`);
          return;
        }

        // If user is available from context
        if (user?.id) {
          // Ensure we're using the correct user ID from the current session
          try {
            // Get the current session to ensure we have the latest user ID
            const { data } = await supabase.auth.getSession();
            const session = data?.session;

            if (session?.user?.id) {
              // Redirect to the user-specific token verification page
              console.log(
                "Redirecting to user-specific token verification page",
              );
              router.push(`/token-verification/${session.user.id}`);
            } else {
              // Fallback to the user ID from context if session is not available
              console.log("Using fallback user ID for redirection");
              router.push(`/token-verification/${user.id}`);
            }
          } catch (error) {
            console.error("Error getting session:", error);
            // Fallback to the user ID from context if there's an error
            console.log(
              "Error occurred, using fallback user ID for redirection",
            );
            router.push(`/token-verification/${user.id}`);
          }
        } else {
          // If we reach here and the timeout hasn't fired yet, we'll wait for it
          console.log(
            "No user ID found, waiting for timeout or auth state change",
          );
          setError("Verifica dell'utente in corso...");
        }
      } catch (err) {
        console.error("Error during redirection:", err);
        setError("Si è verificato un errore durante il reindirizzamento");
        setIsLoading(false);
      }
    };

    checkUserIdAndRedirect();

    return () => clearTimeout(redirectTimeout);
  }, [user, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-cyan-400 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl shadow-xl p-8 text-center">
        <div className="flex flex-col items-center mb-6">
          <img
            src="https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png"
            alt="EasyGame Logo"
            className="h-16 w-auto mb-2"
          />
          <h1 className="text-2xl font-bold">
            {error || "Reindirizzamento in corso..."}
          </h1>
        </div>
        {isLoading && (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}
        {error && error !== "Verifica dell'utente in corso..." && (
          <button
            onClick={() => router.push("/login")}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Torna al login
          </button>
        )}
      </div>
    </div>
  );
}
