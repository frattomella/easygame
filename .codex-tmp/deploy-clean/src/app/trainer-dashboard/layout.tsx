import TrainerDashboardLayoutShell from "@/components/trainer/trainer-dashboard-club-shell";
import { TrainerDashboardProvider } from "@/components/trainer/trainer-dashboard-context";

export default function TrainerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TrainerDashboardProvider>
      <TrainerDashboardLayoutShell>{children}</TrainerDashboardLayoutShell>
    </TrainerDashboardProvider>
  );
}
