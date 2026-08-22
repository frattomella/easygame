import { Suspense } from "react";
import { ForgotPasswordScreen } from "@/components/auth/password-reset-shell";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ForgotPasswordScreen />
    </Suspense>
  );
}
