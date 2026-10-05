"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { SponsorScreen } from "@/components/website/admin/SponsorScreen";

/** `/website/sponsor` — la vetrina sponsor del sito (ADR-0200). */
export default function WebsiteSponsorPage() {
  return (
    <WebsiteAreaShell title="Sponsor" description="Quali sponsor compaiono sul sito, in quale livello e con quale logo.">
      <SponsorScreen />
    </WebsiteAreaShell>
  );
}
