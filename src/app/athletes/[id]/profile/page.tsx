"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/components/providers/AuthProvider";
import { normalizeAccessRole } from "@/lib/access-roles";

/**
 * **La pagina profilo non e piu una pagina: e un rinvio** (W6-33).
 *
 * ---
 *
 * ## Cosa c'era, e perche non poteva restare
 *
 * Seicentottantanove righe che montavano `components/dashboard/Sidebar`, cioe
 * la **navigazione gestionale del club**. Un atleta che entrava — ed era il suo
 * unico ingresso: `getAccessRedirectPath` lo mandava qui — vedeva cliccabili
 * Pagamenti, Movimenti, Impostazioni, Lavoro sportivo e altre trenta voci, ci
 * cliccava, e rimbalzava sulla guardia d'area **senza una parola**. Un menu
 * che elenca cio che non si puo fare non e un menu: e un elenco di porte
 * chiuse.
 *
 * Il difetto non era la sidebar sbagliata. Era che l'area atleta non esisteva,
 * e questa pagina la stava impersonando con i mobili di un'altra.
 *
 * ## Perche un rinvio e non una cancellazione
 *
 * Perche il percorso e **gia in giro**: sta in `Sidebar.tsx` come «il mio
 * profilo», e sta nelle sessioni e nei preferiti di chiunque lo abbia aperto.
 * Un 404 su un link che ieri funzionava e un difetto nuovo al posto di uno
 * vecchio.
 *
 * Il rinvio ha **due destinazioni**, perche due erano i visitatori:
 *
 * - l'**atleta** va nella sua area, `/athlete-dashboard`, che ha una
 *   navigazione fatta delle cose che puo davvero fare;
 * - un ruolo **gestionale** va sulla scheda vera, `/athletes/<id>`, che di
 *   quello stesso atleta dice molto di piu — categorie, pagamenti, documenti,
 *   e ora anche l'accesso EasyGame. Tenere in vita una seconda pagina che
 *   racconta peggio la stessa persona e il modo in cui nascono due verita.
 */
export default function AthleteProfileRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { activeClub, userRole, user, loading, accessLoading } = useAuth();

  const athleteId = String(params?.id || "");
  const ruolo = normalizeAccessRole(
    activeClub?.role || userRole || user?.user_metadata?.role,
  );

  useEffect(() => {
    if (loading || accessLoading) return;

    if (ruolo === "athlete") {
      router.replace("/athlete-dashboard");
      return;
    }

    router.replace(
      athleteId
        ? `/athletes/${encodeURIComponent(athleteId)}${
            activeClub?.id ? `?clubId=${encodeURIComponent(activeClub.id)}` : ""
          }`
        : "/athletes",
    );
  }, [accessLoading, activeClub?.id, athleteId, loading, router, ruolo]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
    </div>
  );
}
