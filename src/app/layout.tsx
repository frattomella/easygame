"use client";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { GlobalLoadingProvider } from "@/components/providers/GlobalLoadingProvider";
import { ToastProvider } from "@/components/ui/toast-notification";
import React, { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <html lang="it" className="light" suppressHydrationWarning>
      <head suppressHydrationWarning />
      <body className="bg-slate-50 text-slate-900" suppressHydrationWarning>
        <ToastProvider>
          <AuthProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              forcedTheme="light"
              enableSystem={false}
              disableTransitionOnChange
            >
              {!mounted ? (
                <div className="min-h-screen bg-slate-50 px-4">
                  <div className="mx-auto flex min-h-screen max-w-md items-center justify-center">
                    <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                      Caricamento interfaccia...
                    </div>
                  </div>
                </div>
              ) : (
                <GlobalLoadingProvider>{children}</GlobalLoadingProvider>
              )}
              <Toaster />
            </ThemeProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
