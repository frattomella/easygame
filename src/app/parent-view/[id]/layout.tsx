import { ParentDashboardProvider } from "@/components/parent-dashboard/parent-dashboard-context";
import ParentDashboardShell from "@/components/parent-dashboard/parent-dashboard-shell";

export default function ParentViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ParentDashboardProvider>
      <ParentDashboardShell>{children}</ParentDashboardShell>
    </ParentDashboardProvider>
  );
}
