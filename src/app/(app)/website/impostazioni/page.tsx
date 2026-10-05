"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { SettingsScreen } from "@/components/website/admin/SettingsScreen";

/** `/website/impostazioni` — identita, SEO e categorie del sito (ADR-0200). */
export default function WebsiteSettingsPage() {
  return (
    <WebsiteAreaShell title="Impostazioni" description="Identita, contatti, SEO, categorie delle news e stile del sito.">
      <SettingsScreen />
    </WebsiteAreaShell>
  );
}
