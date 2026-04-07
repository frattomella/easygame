"use client";

import React from "react";
import { cn } from "@/lib/utils";

type AppLoadingScreenProps = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
};

export function AppLoadingScreen({
  title = "EasyGame",
  subtitle = "Caricamento in corso...",
  compact = false,
  className,
}: AppLoadingScreenProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-blue-100 bg-white/95 shadow-[0_20px_80px_-30px_rgba(37,99,235,0.35)] backdrop-blur",
        compact ? "p-5" : "p-8 md:p-10",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(29,78,216,0.16),_transparent_42%)]" />

      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-blue-200/60" />
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg" />
          <div className="absolute inset-[18px] rounded-full bg-white/90" />
          <div className="relative z-10 h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h2>
          <p className="text-sm font-medium text-slate-500">{subtitle}</p>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.15s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-700" />
        </div>
      </div>
    </div>
  );
}

type AppBlockingOverlayProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
};

export function AppBlockingOverlay({
  visible,
  title = "EasyGame",
  subtitle = "Operazione in corso, attendi un momento...",
}: AppBlockingOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <AppLoadingScreen
        title={title}
        subtitle={subtitle}
        className="w-full max-w-md"
      />
    </div>
  );
}
