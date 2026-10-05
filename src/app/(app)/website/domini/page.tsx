"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { DomainsScreen } from "@/components/website/admin/DomainsScreen";

/** `/website/domini` — il dominio del sito (ADR-0200). */
export default function WebsiteDomainsPage() {
  return (
    <WebsiteAreaShell title="Dominio" description="Il sito si pubblica sul dominio della societa.">
      <DomainsScreen />
    </WebsiteAreaShell>
  );
}
