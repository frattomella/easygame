"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SportWorkShell } from "@/components/sport-work/SportWorkShell";
import { RelationshipsPanel } from "@/components/sport-work/RelationshipsPanel";

function RelationshipsPage() {
  const searchParams = useSearchParams();

  return (
    <SportWorkShell
      title="Rapporti"
      subtitle="Chi lavora per la societa, con quale tipo di rapporto e per quale periodo."
    >
      <RelationshipsPanel clubId={searchParams?.get("clubId") || null} />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RelationshipsPage />
    </Suspense>
  );
}
