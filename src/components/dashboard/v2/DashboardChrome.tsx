"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/dashboard/Header";
import { isClubDashboardRoute } from "@/components/dashboard/v2/dashboard-routes";

/**
 * Il cielo e della Dashboard, e di nessun'altra pagina (guideline 05 §5.1,
 * ambiente 2).
 *
 * Il layout di `/dashboard` monta una sola intestazione per tre rotte:
 * l'indice, la dashboard legacy `/dashboard/<id>` (che oggi disegna la stessa
 * Dashboard V2) e `/dashboard/access-management`, che e una pagina di lavoro
 * e resta sul mist. Un layout e un componente server e non conosce il
 * percorso: lo legge questo componente, e decide **qui** — in un punto solo —
 * quando la banda del cielo c'e e quando la topbar diventa trasparente.
 *
 * La banda e `position: absolute` in cima al contenitore relativo del layout,
 * dietro la topbar e dietro il `main` (reso trasparente dal layout): cosi la
 * topbar sul cielo ha sempre il cielo sotto, e il contenuto scorre sul mist.
 */
export function DashboardChrome() {
  const pathname = usePathname();
  const onSky = isClubDashboardRoute(pathname);

  return (
    <>
      {onSky ? <div className="egw-sky-band" aria-hidden /> : null}
      <Header title="Dashboard" variant={onSky ? "sky" : "light"} />
    </>
  );
}
