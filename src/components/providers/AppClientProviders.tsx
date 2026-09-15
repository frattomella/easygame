"use client";

import React from "react";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { GlobalLoadingProvider } from "@/components/providers/GlobalLoadingProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast-notification";
import { Toaster } from "@/components/ui/toaster";
import { ShellProvider } from "@/components/web/shell/ShellProvider";

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
          {/* Lo stato del guscio Web V2 (barra compressa, cassetti globali). */}
          <ShellProvider>
            <GlobalLoadingProvider>{children}</GlobalLoadingProvider>
          </ShellProvider>
          <Toaster />
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
