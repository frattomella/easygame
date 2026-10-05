"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { InquiriesScreen } from "@/components/website/admin/InquiriesScreen";

/** `/website/messaggi` — i messaggi arrivati dal modulo contatti (ADR-0200). */
export default function WebsiteInquiriesPage() {
  return (
    <WebsiteAreaShell title="Messaggi" description="I messaggi arrivati dal modulo contatti del sito.">
      <InquiriesScreen />
    </WebsiteAreaShell>
  );
}
