import TrainerDashboardLayoutShell from "@/components/trainer/trainer-dashboard-club-shell";
import { TrainerDashboardProvider } from "@/components/trainer/trainer-dashboard-context";
import { AccessAreaGuard } from "@/components/auth/access-area-guard";

export default function TrainerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AccessAreaGuard>
      <TrainerDashboardProvider>
        <TrainerDashboardLayoutShell>{children}</TrainerDashboardLayoutShell>
      </TrainerDashboardProvider>
    </AccessAreaGuard>
  );
}
