import { Suspense } from "react";
import { ResetPasswordScreen } from "@/components/auth/password-reset-shell";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
