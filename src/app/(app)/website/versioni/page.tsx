"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { RevisionsScreen } from "@/components/website/admin/RevisionsScreen";

/** `/website/versioni` — lo storico delle pubblicazioni (ADR-0200). */
export default function WebsiteRevisionsPage() {
  return (
    <WebsiteAreaShell title="Versioni" description="Ogni pubblicazione e una versione: puoi ripristinarne una o riportarla nella bozza.">
      <RevisionsScreen />
    </WebsiteAreaShell>
  );
}
