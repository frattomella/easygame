"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  canAccessPath,
  collectLinkedAthleteIds,
  getAccessRedirectPath,
} from "@/lib/access-roles";

const LoadingScreen = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50">
    <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
  </div>
);

export function AccessAreaGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { user, userRole, loading, accessLoading, activeClub } = useAuth();
  const role = activeClub?.role || userRole || user?.user_metadata?.role;
  /*
    **Un genitore ha i figli che ha, non il primo.** La guardia ammetteva un
    solo percorso — quello del primo figlio risolto — e il clic sul secondo
    rimbalzava sul primo (D-3).
  */
  const linkedAthleteKey = collectLinkedAthleteIds({
    linkedAthleteId: activeClub?.linkedAthleteId,
    linkedAthleteIds: activeClub?.linkedAthleteIds,
  }).join(",");
  const linkedAthleteIds = useMemo(
    () => (linkedAthleteKey ? linkedAthleteKey.split(",") : []),
    [linkedAthleteKey],
  );
  const allowed = Boolean(
    user &&
      activeClub?.id &&
      canAccessPath(role, pathname, { linkedAthleteIds }),
  );

  useEffect(() => {
    if (loading || accessLoading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (!allowed) {
      const redirectPath = activeClub?.id
        ? getAccessRedirectPath(role, {
            organizationId: activeClub.id,
            linkedAthleteIds,
          })
        : "/account";
      router.replace(redirectPath === pathname ? "/account" : redirectPath);
    }
  }, [
    accessLoading,
    activeClub?.id,
    allowed,
    linkedAthleteIds,
    loading,
    pathname,
    role,
    router,
    user,
  ]);

  if (loading || accessLoading || !allowed) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
