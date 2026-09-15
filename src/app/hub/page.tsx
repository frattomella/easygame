"use client";

import React from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { PageHeader } from "@/components/web/page/PageHeader";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { usePreference } from "@/components/web/hooks/use-preference";
import { HUB_SECTIONS, isHubSection, type HubSection } from "@/components/hub/v2/hub-content";
import { HubFeedback, HubMarketplace, HubNews, HubProposals, HubTutorials } from "@/components/hub/v2/hub-sections";

/**
 * `/hub` — l'EasyGame HUB (Web V2).
 *
 * Resta una pagina **statica** per decisione (ADR-0014): catalogo dei
 * servizi extra, novita, tutorial e FAQ, e i due canali per scrivere a chi
 * fa il prodotto. Nessuna chiamata dati, nessuna persistenza oltre alla
 * sezione aperta (`egw.hub.section`).
 *
 * L'ambiente e quello di ogni pagina di lavoro (mist piatto, guideline 05
 * §5.1): il cielo in gradiente viola della V1 era in `deprecated.md`.
 */
export default function HubPage() {
  const [stored, setStored] = usePreference<HubSection>("hub", "section", "marketplace");
  const section: HubSection = isHubSection(stored) ? stored : "marketplace";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="EasyGame HUB" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader eyebrow="Panoramica" title="EasyGame HUB" description="Il centro di tutto ciò che ti serve per gestire al meglio il tuo club.">
              <SegmentedControl<HubSection>
                aria-label="Sezioni dell'HUB"
                value={section}
                onChange={setStored}
                options={HUB_SECTIONS.map((item) => ({ value: item.value, label: item.label }))}
                className="max-w-full overflow-x-auto"
              />
            </PageHeader>

            {section === "marketplace" ? <HubMarketplace /> : null}
            {section === "news" ? <HubNews /> : null}
            {section === "tutorials" ? <HubTutorials /> : null}
            {section === "feedback" ? <HubFeedback /> : null}
            {section === "proposals" ? <HubProposals /> : null}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
