"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { EntityIcon, type EntityIconType } from "@/components/ui/entity-icon";

type DetailBadge = {
  label: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
};

type ClubPersonDetailHeaderProps = {
  title: string;
  iconType: EntityIconType;
  badges?: DetailBadge[];
  actions?: ReactNode;
};

export function ClubPersonDetailHeader({
  title,
  iconType,
  badges = [],
  actions,
}: ClubPersonDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <EntityIcon type={iconType} size="xl" label={title} />
        <div className="min-w-0">
          <h1 className="truncate bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold leading-tight tracking-tight text-transparent md:text-4xl">
            {title}
          </h1>
          {badges.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {badges.map((badge) => (
                <Badge
                  key={`${badge.label}-${badge.variant || "default"}`}
                  variant={badge.variant}
                  className={badge.className}
                >
                  {badge.label}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex gap-2 md:w-auto">{actions}</div> : null}
    </div>
  );
}
