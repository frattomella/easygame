import { Suspense } from "react";
import { ResetPasswordScreen } from "@/components/auth/password-reset-shell";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-egw-page" />}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
