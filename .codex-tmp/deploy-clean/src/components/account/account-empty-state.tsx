"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { EmptyStateProps } from "./account-shared";

export function AccountEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <Card className="rounded-[28px] border-white/70 bg-white/85 shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] backdrop-blur">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-5 px-8 py-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div className="space-y-2">
          <p className="text-xl font-semibold text-slate-900">{title}</p>
          <p className="max-w-xl text-sm text-slate-500">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <Button
            type="button"
            className="rounded-full bg-blue-600 px-6 hover:bg-blue-700"
            onClick={onAction}
          >
            <Plus className="mr-2 h-4 w-4" />
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
