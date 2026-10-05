"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { NewsList } from "@/components/website/admin/NewsList";

/** `/website/news` — le news del sito (ADR-0200 §9). */
export default function WebsiteNewsPage() {
  return (
    <WebsiteAreaShell title="News" description="Gli articoli del sito: bozze, programmati, pubblicati e archiviati.">
      <NewsList />
    </WebsiteAreaShell>
  );
}
