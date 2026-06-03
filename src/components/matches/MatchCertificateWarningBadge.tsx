"use client";

import { AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MatchCertificateWarningResult } from "@/lib/match-certificate-warnings";

const reasonLabel: Record<string, string> = {
  missing: "certificato mancante",
  expired: "certificato scaduto",
  invalid: "certificato non valido",
};

export function MatchCertificateWarningBadge({
  warning,
  compact = false,
  className,
}: {
  warning: MatchCertificateWarningResult;
  compact?: boolean;
  className?: string;
}) {
  if (!warning.hasInvalidCertificates) {
    return null;
  }

  const label =
    warning.count === 1
      ? "1 convocato con certificato non valido"
      : `${warning.count} convocati con certificato non valido`;
  const detail = warning.athletes
    .map(
      (athlete) =>
        `${athlete.athleteName}: ${reasonLabel[athlete.reason] || "certificato non valido"}`,
    )
    .join(", ");

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700",
              className,
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{label}</p>
            {detail ? <p>{detail}</p> : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
