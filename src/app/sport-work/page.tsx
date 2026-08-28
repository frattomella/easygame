"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SportWorkShell } from "@/components/sport-work/SportWorkShell";
import { SportWorkDashboardPanel } from "@/components/sport-work/SportWorkDashboardPanel";

/**
 * Il cruscotto «Lavoro sportivo».
 *
 * La pagina e sottile di proposito: la logica sta nel pannello, che si prova e
 * si riusa. Mettere il dominio dentro `page.tsx` e l'errore numero 2 di
 * CLAUDE.md, ed e quello che ha reso monolitiche tre pagine di questo
 * repository.
 */
function SportWorkDashboardPage() {
  const searchParams = useSearchParams();

  return (
    <SportWorkShell
      title="Lavoro sportivo"
      subtitle="Rapporti, compensi, contributi e adempimenti. EasyGame calcola e prepara i dati; versare e trasmettere restano di chi ne ha la responsabilita."
    >
      <SportWorkDashboardPanel clubId={searchParams?.get("clubId") || null} />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SportWorkDashboardPage />
    </Suspense>
  );
}
