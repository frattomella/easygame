"use client";

import { Suspense } from "react";
import { SportWorkShell } from "@/components/sport-work/SportWorkShell";
import { ObligationsPanel } from "@/components/sport-work/ObligationsPanel";

function ObligationsPage() {
  return (
    <SportWorkShell
      title="Adempimenti"
      subtitle="Comunicazioni, contributi, Certificazione Unica. EasyGame prepara i dati e ricorda la scadenza: trasmettere resta di una persona."
    >
      <ObligationsPanel />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ObligationsPage />
    </Suspense>
  );
}
