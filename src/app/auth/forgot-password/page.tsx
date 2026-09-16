import { Suspense } from "react";
import { ForgotPasswordScreen } from "@/components/auth/password-reset-shell";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-egw-page" />}>
      <ForgotPasswordScreen />
    </Suspense>
  );
}
