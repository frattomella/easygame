"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import MobileNavigation from "@/components/ui/mobile-navigation";

interface LayoutWithMobileNavProps {
  children: React.ReactNode;
}

const LayoutWithMobileNav = ({ children }: LayoutWithMobileNavProps) => {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login" || pathname === "/login/trainer";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Navigation */}
      <div className="md:hidden">
        <MobileNavigation />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
};

export default LayoutWithMobileNav;
