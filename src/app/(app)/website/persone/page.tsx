"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { PeopleScreen } from "@/components/website/admin/PeopleScreen";

/** `/website/persone` — chi compare sul sito e con quali dati (ADR-0200). */
export default function WebsitePeoplePage() {
  return (
    <WebsiteAreaShell title="Persone" description="Scegli quali atleti, allenatori e membri dello staff compaiono sul sito, e con quali dati.">
      <PeopleScreen />
    </WebsiteAreaShell>
  );
}
