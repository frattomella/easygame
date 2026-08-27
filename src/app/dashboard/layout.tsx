import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { AccessAreaGuard } from "@/components/auth/access-area-guard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AccessAreaGuard>
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        {/*
          Una sola chrome, e i figli montati **una volta**.

          Qui c'erano due rami — uno `hidden lg:flex`, uno `lg:hidden` — che
          montavano entrambi il contenuto: nascosto con il CSS, ma vivo nel DOM.
          React eseguiva due volte ogni effetto, quindi **ogni lettura partiva
          due volte**. Sulla Dashboard erano 44 richieste invece di 22, con
          `clubs` chiesto quattordici volte. `Header` monta gia da se la barra
          mobile e quella desktop: i due rami non servivano (RC Fix 1, punto 11).
        */}
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header title="Dashboard" />
          <main className={dashboardMainClassName}>{children}</main>
        </div>
      </div>
    </AccessAreaGuard>
  );
}
