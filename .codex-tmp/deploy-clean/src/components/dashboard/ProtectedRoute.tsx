"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  // Check if the current path is an athlete profile page and the user is an athlete
  const isAthleteProfilePage =
    typeof window !== "undefined" &&
    window.location.pathname.includes("/athletes/") &&
    window.location.pathname.includes("/profile");
  const canAccessAthleteProfile =
    user?.user_metadata?.role === "athlete" && isAthleteProfilePage;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
