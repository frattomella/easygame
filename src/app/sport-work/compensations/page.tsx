"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SportWorkShell } from "@/components/sport-work/SportWorkShell";
import { CompensationsPanel } from "@/components/sport-work/CompensationsPanel";

function CompensationsPage() {
  const searchParams = useSearchParams();

  return (
    <SportWorkShell
      title="Compensi"
      subtitle="Scadenze, registro delle uscite, premi, rimborsi e fatture dei professionisti. Cinque cose distinte, perche hanno regimi distinti."
    >
      <CompensationsPanel clubId={searchParams?.get("clubId") || null} />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CompensationsPage />
    </Suspense>
  );
}
