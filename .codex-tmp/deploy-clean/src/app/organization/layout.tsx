"use client";

import { ToastProvider } from "@/components/ui/toast-notification";

export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
