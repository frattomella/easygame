import React from "react";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";

interface NotificationBadgeProps {
  count: number;
  onClick?: () => void;
  className?: string;
}

export function NotificationBadge({
  count,
  onClick,
  className = "",
}: NotificationBadgeProps) {
  if (count === 0) return null;

  return (
    <div
      className={`relative inline-flex ${className} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <Bell className="h-5 w-5" />
      <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
        {count > 99 ? "99+" : count}
      </span>
    </div>
  );
}
