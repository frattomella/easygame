"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { websiteApi, type WebsiteOverviewDto } from "@/lib/website/client";
import { WebsiteEditor } from "@/components/website/editor/WebsiteEditor";
import { Button } from "@/components/web/primitives/Button";

/**
 * `/website/editor` — l'editor visuale a tutto schermo (ADR-0200 §10).
 * Legge la panoramica una volta; senza servizio o senza sito rimanda alla
 * panoramica, che spiega come attivarlo o crearlo.
 */
function EditorLoader() {
  const searchParams = useSearchParams();
  const [overview, setOverview] = React.useState<WebsiteOverviewDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void websiteApi.overview().then((result) => {
      if (result.error) setError(result.error.message);
      else setOverview(result.data);
    });
  }, []);

  if (error || (overview && (overview.access.state === "unavailable" || !overview.site))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-egw-page-050 p-6 font-brand">
        <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-egw-panel">
          <h1 className="text-[16px] font-semibold text-egw-ink">L&apos;editor non e disponibile</h1>
          <p className="mt-2 text-[13px] text-egw-ink-62">
            {error || (overview?.access.state === "unavailable" ? "EasyGame Website non e attivo per questa societa." : "Il sito non e ancora stato creato.")}
          </p>
          <Button asChild variant="primary" className="mt-4">
            <Link href="/website">Vai alla panoramica del sito</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!overview) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-egw-page-050 font-brand text-[13px] text-egw-ink-62" role="status">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apro l&apos;editor…
      </main>
    );
  }

  return <WebsiteEditor initial={overview} initialPageId={searchParams?.get("page")} />;
}

export default function WebsiteEditorPage() {
  return (
    <React.Suspense fallback={null}>
      <EditorLoader />
    </React.Suspense>
  );
}
