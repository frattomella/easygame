import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const alertVariants = cva(
  /* La forma dell'`AlertBlock` del Web V2: tinta e bordo semantici, angolo del campo (ADR-0187). */
  "relative w-full rounded-egw-field border px-4 py-3.5 font-brand text-[12.5px] leading-[1.5] text-egw-ink-72 [&:has(svg)]:pl-11 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:h-[17px] [&>svg]:w-[17px]",
  {
    variants: {
      variant: {
        default: "border-egw-tint-blue-bd bg-egw-tint-blue [&>svg]:text-egw-blue-700",
        destructive: "border-egw-tint-red-bd bg-egw-tint-red [&>svg]:text-egw-red",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 text-[13px] font-semibold leading-5 text-egw-ink", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-[12.5px] leading-[1.5] text-egw-ink-72 [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
