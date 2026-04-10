"use client";

import React from "react";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { GlobalLoadingProvider } from "@/components/providers/GlobalLoadingProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast-notification";
import { Toaster } from "@/components/ui/toaster";

export function AppClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <AuthProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <GlobalLoadingProvider>{children}</GlobalLoadingProvider>
          <Toaster />
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
