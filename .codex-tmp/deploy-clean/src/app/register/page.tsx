import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AuthShell defaultMode="register" />
    </Suspense>
  );
}
