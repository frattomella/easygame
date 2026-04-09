"use client";

import { useEffect, useState } from "react";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";

const ROUTE_LOADING_DELAY_MS = 30_000;

export default function GlobalLoading() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setIsVisible(true);
    }, ROUTE_LOADING_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <AppLoadingScreen subtitle="Il caricamento sta richiedendo piu tempo del previsto..." />
      </div>
    </div>
  );
}
