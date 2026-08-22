import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { AccessAreaGuard } from "@/components/auth/access-area-guard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AccessAreaGuard>
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        {/* Desktop layout */}
        <div className="hidden lg:flex w-full">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header title="Dashboard" />
            <main className={dashboardMainClassName}>{children}</main>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="flex flex-1 flex-col lg:hidden">
          <MobileTopBar />
          <main className={dashboardMainClassName}>{children}</main>
        </div>
      </div>
    </AccessAreaGuard>
  );
}
