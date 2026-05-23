import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeadingProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: PageHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold leading-tight text-transparent md:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-3xl text-sm leading-6 text-gray-600 md:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
