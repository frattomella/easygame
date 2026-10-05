"use client";

import { ClubDashboard } from "@/components/dashboard/v2/ClubDashboard";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";

/**
 * `/dashboard/<dashboardId>` — la rotta legacy della Dashboard.
 *
 * Il completamento del login/invito (`src/app/token-verification/[userId]`)
 * e `src/lib/auth.ts` interrogano ancora la tabella `dashboards` e, se una
 * riga esiste, reindirizzano qui con `?clubId=…`. La rotta resta, ma non e
 * piu una seconda dashboard: disegna la stessa Dashboard V2 dell'indice, che
 * legge il club dagli stessi parametri (`clubId`/`organizationId`) e ignora
 * l'identificativo nel percorso. Le tre card colorate «Appuntamenti di Oggi /
 * Gare di Oggi / Promemoria Attivi» e i sei `await` consecutivi sono spariti
 * con essa (guideline `deprecated.md`, v3.1).
 */
export default function LegacyDashboardPage() {
  /* L'identificativo nel percorso non e una scheda: il breadcrumb dice Dashboard. */
  useBreadcrumbLabel("Dashboard");
  return <ClubDashboard />;
}
