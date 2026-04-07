"use client";

import { usePathname } from "next/navigation";
import MobileHeader from "@/components/ui/mobile-header";

export default function MobileLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Pages where we don't want to show the mobile header
  const excludedPaths = [
    "/", // Landing page
    "/token-verification", // Token verification page
    "/parent-view", // Parent dashboard
    "/trainer-dashboard", // Trainer dashboard
    "/login", // Login pages
  ];

  // Check if current path is in the excluded list or starts with any of them
  const shouldHideHeader = excludedPaths.some(
    (path) => pathname === path || pathname?.startsWith(`${path}/`),
  );

  return (
    <>
      {!shouldHideHeader && <MobileHeader />}
      <div className="w-full overflow-x-hidden">{children}</div>
    </>
  );
}
