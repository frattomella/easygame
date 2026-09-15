import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Il fondo e la colonna di contenuto delle pagine del club (guideline 05
 * §5.1, §5.5): ambiente 1, `--egw-page` piatto, gutter 32 (24 a ≤1280, 20 a
 * ≤1152), colonna centrata con tetto a 1560px.
 */
export const dashboardMainClassName =
  "egw-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-egw-page px-4 py-5 pb-10 md:px-5 lg:px-6 lg:py-6 xl:px-8";

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
        "mx-auto flex w-full max-w-[1560px] flex-col gap-[18px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
