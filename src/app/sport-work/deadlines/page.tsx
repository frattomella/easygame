"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SportWorkShell } from "@/components/sport-work/SportWorkShell";
import { DeadlinesPanel } from "@/components/sport-work/DeadlinesPanel";

function DeadlinesPage() {
  const searchParams = useSearchParams();

  return (
    <SportWorkShell
      title="Scadenze"
      subtitle="Cosa e in ritardo, cosa scade adesso, cosa arriva. Compensi e adempimenti insieme, ordinati per data."
    >
      <DeadlinesPanel clubId={searchParams?.get("clubId") || null} />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DeadlinesPage />
    </Suspense>
  );
}
