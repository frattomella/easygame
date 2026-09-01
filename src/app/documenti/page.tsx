"use client";

import React from "react";

import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { useAuth } from "@/components/providers/AuthProvider";
import { DocumentReviewInbox } from "@/components/documents/document-review-inbox";
import { roleHasPermission } from "@/lib/permissions/catalog";

/**
 * **Documenti: la coda della segreteria** (Wave 6, lane 6E, §5.2, W6-39).
 *
 * ---
 *
 * ## Perche una pagina e non una scheda dentro l'atleta
 *
 * Verificare i documenti e un lavoro **per coda**, non per persona: si apre la
 * mattina, si guarda cosa e arrivato, si decide. La scheda atleta risponde alla
 * domanda opposta — «cosa manca a Marco» — ed e la sola strada che esisteva:
 * con duecento atleti significava non guardare mai.
 *
 * ## Il gate e la chiave, non un elenco di ruoli
 *
 * `documents.review` e la stessa chiave che il servizio pretende
 * (`listDocumentReviewQueue`). Una seconda idea di chi puo verificare — una
 * lista di ruoli scritta qui — sarebbe la copia destinata a restare indietro, e
 * il primo pulsante che si vede e risponde 403.
 *
 * ## Come ci si arriva
 *
 * Dal menu **SEGRETERIA**, dove oggi non c'e ancora una voce «Documenti»:
 * `src/components/dashboard/Sidebar.tsx` e di un'altra lane, e l'ingresso e
 * segnalato nel rapporto di questa. Finche non c'e, la pagina resta
 * raggiungibile per indirizzo — che e esattamente la forma di difetto che la
 * Wave 6 esiste per chiudere, e per questo va detto invece che lasciato
 * scoprire.
 */
export default function DocumentiPage() {
  const { activeClub, userRole } = useAuth();
  const role = activeClub?.role || userRole || null;
  const canReview = roleHasPermission(role, "documents.review");

  return (
    <div className="flex h-[100dvh] bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Documenti" />
        <MobileTopBar title="Documenti" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-6xl">
            <SharedPageHeader
              title="Documenti da verificare"
              subtitle="Cosa le famiglie hanno caricato, cosa il club sta ancora aspettando, e cosa e stato deciso. Una decisione presa non si riscrive: si chiede un altro file."
            />
            <DocumentReviewInbox canReview={canReview} />
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
