"use client";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { GlobalLoadingProvider } from "@/components/providers/GlobalLoadingProvider";
import { ToastProvider } from "@/components/ui/toast-notification";
import React, { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";

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
                <div className="min-h-screen bg-slate-50 px-4 py-10">
                  <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
                    <AppLoadingScreen subtitle="Preparazione della dashboard..." />
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
