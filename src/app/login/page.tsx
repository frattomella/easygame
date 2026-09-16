import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-egw-page" />}>
      <AuthShell defaultMode="login" />
    </Suspense>
  );
}
