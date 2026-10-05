"use client";

import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { MediaLibrary } from "@/components/website/admin/MediaLibrary";

/** `/website/media` — la libreria immagini del sito (ADR-0200). */
export default function WebsiteMediaPage() {
  return (
    <WebsiteAreaShell title="Immagini" description="Le immagini del sito: testo alternativo, punto focale e dove sono usate.">
      <MediaLibrary />
    </WebsiteAreaShell>
  );
}
