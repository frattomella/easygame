import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-egw-page" />}>
      <AuthShell defaultMode="register" />
    </Suspense>
  );
}
