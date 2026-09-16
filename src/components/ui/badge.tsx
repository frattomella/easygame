import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  /* La forma del `DataChip` del Web V2: tinta 10% con bordo 28%, etichetta 600/11.5, angolo tagliato (ADR-0187). */
  "inline-flex items-center gap-1 rounded-egw-chip border px-2 py-[3px] font-brand text-[11.5px] font-semibold leading-none transition-colors focus:outline-none focus-visible:shadow-egw-focus",
  {
    variants: {
      variant: {
        default: "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800",
        secondary: "border-egw-hairline bg-egw-page-100 text-egw-ink-72",
        destructive: "border-egw-tint-red-bd bg-egw-tint-red text-egw-red",
        outline: "border-egw-control-border bg-white text-egw-ink-72",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
