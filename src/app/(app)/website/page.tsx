"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { WebsiteOverview } from "@/components/website/admin/WebsiteOverview";

/** `/website` — panoramica del sito e creazione guidata (ADR-0200). */
export default function WebsiteOverviewPage() {
  return (
    <WebsiteAreaShell
      title="Sito web"
      description="Il sito della societa sul vostro dominio, alimentato dai dati del gestionale."
      requireSite={false}
    >
      <WebsiteOverview />
    </WebsiteAreaShell>
  );
}
