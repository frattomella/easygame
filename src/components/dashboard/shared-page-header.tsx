import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SharedPageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  variant?: "default" | "home";
};

export function SharedPageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
  variant = "default",
}: SharedPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={cn(
            "bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text font-bold leading-tight tracking-tight text-transparent",
            variant === "home"
              ? "text-3xl md:text-4xl"
              : "text-3xl md:text-4xl",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
