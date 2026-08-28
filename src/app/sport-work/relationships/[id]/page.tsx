"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SportWorkShell } from "@/components/sport-work/SportWorkShell";
import { RelationshipDetail } from "@/components/sport-work/RelationshipDetail";

function RelationshipDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params?.id || "");

  return (
    <SportWorkShell title="Rapporto" hideSections>
      <RelationshipDetail
        relationshipId={id}
        clubId={searchParams?.get("clubId") || null}
      />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RelationshipDetailPage />
    </Suspense>
  );
}
