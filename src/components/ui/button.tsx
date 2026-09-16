import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  /*
    La primitiva legacy veste le varianti del Web V2 (`web/primitives/Button`):
    `default` e il neutro navy pieno — non il gradiente, che e uno solo per
    schermata e appartiene al primario di pagina —, `outline` il secondario
    bianco, `destructive` il contorno rosso (mai un riempimento), `ghost` e
    `link` la variante testuale. Stessi raggi, stesse ombre, stesso font
    (ADR-0187).
  */
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-egw-control font-brand text-[13px] font-semibold leading-none transition-[background-color,border-color,box-shadow,filter,transform] duration-hover ease-egw focus-visible:outline-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[rgba(11,26,58,.06)] disabled:text-egw-ink-42 disabled:shadow-none disabled:filter-none active:translate-y-px",
  {
    variants: {
      variant: {
        default: "border border-transparent bg-egw-navy-800 text-white hover:brightness-[1.1] focus-visible:shadow-egw-focus",
        destructive:
          "border-[1.5px] border-egw-red bg-white text-egw-red hover:bg-egw-tint-red focus-visible:shadow-egw-focus-danger",
        outline:
          "border border-egw-control-border bg-white text-egw-ink hover:border-[rgba(37,99,235,.32)] hover:bg-white focus-visible:border-egw-blue focus-visible:shadow-egw-focus active:bg-egw-page-050",
        secondary:
          "border border-transparent bg-egw-page-100 text-egw-ink hover:bg-[#e9eef9] focus-visible:shadow-egw-focus",
        ghost: "border border-transparent bg-transparent text-egw-ink-72 hover:bg-egw-page-100 hover:text-egw-ink focus-visible:shadow-egw-focus",
        link: "border border-transparent bg-transparent text-egw-blue-700 underline-offset-4 hover:underline focus-visible:shadow-egw-focus",
        blue: "border border-white/30 bg-egw-action text-white shadow-egw-glow hover:brightness-[1.06] focus-visible:shadow-[var(--egw-focus-ring-dark)]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[12.5px]",
        lg: "h-11 px-6 text-[13.5px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
