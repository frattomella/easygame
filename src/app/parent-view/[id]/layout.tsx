import { ParentDashboardProvider } from "@/components/parent-dashboard/parent-dashboard-context";
import ParentDashboardShell from "@/components/parent-dashboard/parent-dashboard-shell";
import { AccessAreaGuard } from "@/components/auth/access-area-guard";

export default function ParentViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AccessAreaGuard>
      <ParentDashboardProvider>
        <ParentDashboardShell>{children}</ParentDashboardShell>
      </ParentDashboardProvider>
    </AccessAreaGuard>
  );
}
