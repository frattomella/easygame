"use client";

import { AccessAreaGuard } from "@/components/auth/access-area-guard";
import { ToastProvider } from "@/components/ui/toast-notification";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AccessAreaGuard>
      <ToastProvider>{children}</ToastProvider>
    </AccessAreaGuard>
  );
}
