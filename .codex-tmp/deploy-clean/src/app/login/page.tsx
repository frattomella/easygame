import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AuthShell defaultMode="login" />
    </Suspense>
  );
}
