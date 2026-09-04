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
  /*
    **La schermata di scelta del figlio non chiede una tessera.**

    PP-02 §A ha aperto l'area famiglia a chi e **tutore collegato** anche senza
    riga in `organization_users`: e la situazione di chi ha ricevuto un invito
    e non ne ha mai riscattato uno, o di chi la tessera l'ha persa in un
    travaso. Il server risponde correttamente — `/api/v1/family/children` e
    autorizzata dal **legame**, non dal ruolo — ma nessuna di quelle risposte
    arrivava a una persona: senza tessera non c'e `activeClub`, questa guardia
    negava, e il tutore veniva depositato su `/account` senza club e senza
    figli. Nemmeno la schermata «Nessun figlio collegato» riusciva a comparire.

    Qui la porta si apre alla sola schermata di **scelta**, che di suo non
    mostra niente: chiede al server quali figli ci sono, e se non ce ne sono lo
    dice. Le tredici pagine dentro l'area continuano a passare da
    `canAccessPath`, e ognuna dal legame con quel figlio.
  */
  const scegliFiglio = pathname === "/parent-view";

  const allowed = Boolean(
    user &&
      (scegliFiglio ||
        (activeClub?.id && canAccessPath(role, pathname, { linkedAthleteIds }))),
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
