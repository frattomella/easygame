import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const dashboardMainClassName =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 pb-8 md:px-6 md:py-6";

export type DashboardPageContainerProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardPageContainer({
  children,
  className,
}: DashboardPageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-9xl flex-col gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
