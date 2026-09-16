"use client";

import React from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function HomePage() {
  return (
    <React.Suspense fallback={<div className="min-h-[100dvh] bg-egw-page" />}>
      <AuthShell defaultMode="login" />
    </React.Suspense>
  );
}
