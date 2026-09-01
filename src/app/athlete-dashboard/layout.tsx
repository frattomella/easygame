"use client";

import { usePathname } from "next/navigation";

import { AccessAreaGuard } from "@/components/auth/access-area-guard";
import { AthleteAreaProvider } from "@/components/athlete/athlete-area-context";
import AthleteAreaShell from "@/components/athlete/athlete-area-shell";

/**
 * Il guscio dell'area atleta, e l'unica pagina che ne resta fuori.
 *
 * **`/athlete-dashboard/attiva` non e dentro l'area: e la porta.** Ci arriva
 * chi ha appena ricevuto l'invito, quindi senza sessione, senza ruolo e senza
 * un legame: metterla dietro `AccessAreaGuard` la manderebbe su `/login`, dove
 * non puo entrare perche una password ancora non ce l'ha. E la stessa forma
 * dell'eccezione che `middleware.ts` fa per `/auth/complete`.
 *
 * L'eccezione e **esplicita e a un percorso solo**: un ramo che dicesse
 * «tutto cio che comincia per attiva» aprirebbe domani una pagina che nessuno
 * ha valutato.
 */
export default function AthleteDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  if (pathname === "/athlete-dashboard/attiva") {
    return <>{children}</>;
  }

  return (
    <AccessAreaGuard>
      <AthleteAreaProvider>
        <AthleteAreaShell>{children}</AthleteAreaShell>
      </AthleteAreaProvider>
    </AccessAreaGuard>
  );
}
