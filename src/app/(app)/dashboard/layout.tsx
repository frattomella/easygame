import Sidebar from "@/components/dashboard/Sidebar";
import { DashboardChrome } from "@/components/dashboard/v2/DashboardChrome";
import { dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { AccessAreaGuard } from "@/components/auth/access-area-guard";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AccessAreaGuard>
      <div className="flex h-[100dvh] bg-egw-page">
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
          {/*
            Ambiente 2 (guideline 05 §5.1): la banda del cielo sta **dietro**
            la topbar e dietro il `main`, in un contenitore relativo. Il main
            e trasparente perche il fondo lo da il contenitore esterno
            (`bg-egw-page`, lo stesso mist): sull'indice della Dashboard
            `DashboardChrome` vi appoggia la banda e mette la topbar sul cielo;
            su `/dashboard/access-management` non appoggia niente e la pagina
            resta mist piatto come ogni pagina di lavoro.
          */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <DashboardChrome />
            <main className={cn(dashboardMainClassName, "bg-transparent")}>
              {children}
            </main>
          </div>
        </div>
      </div>
    </AccessAreaGuard>
  );
}
