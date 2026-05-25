import {
  Building2,
  CircleUserRound,
  ClipboardList,
  Handshake,
  UserCircle,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type EntityIconType =
  | "athlete"
  | "user"
  | "sponsor"
  | "member"
  | "staff"
  | "trainer"
  | "organization"
  | "default";

type EntityIconSize = "sm" | "md" | "lg" | "xl";
type EntityIconShape = "circle" | "square";

type EntityIconProps = {
  type?: EntityIconType;
  size?: EntityIconSize;
  shape?: EntityIconShape;
  label?: string;
  className?: string;
  iconClassName?: string;
};

const iconConfig: Record<
  EntityIconType,
  { icon: LucideIcon; className: string; iconClassName: string }
> = {
  athlete: {
    icon: UserRound,
    className: "border-blue-100 bg-blue-50 text-blue-700",
    iconClassName: "text-blue-700",
  },
  user: {
    icon: UserCircle,
    className: "border-slate-200 bg-slate-50 text-slate-700",
    iconClassName: "text-slate-700",
  },
  sponsor: {
    icon: Handshake,
    className: "border-amber-100 bg-amber-50 text-amber-700",
    iconClassName: "text-amber-700",
  },
  member: {
    icon: Users,
    className: "border-emerald-100 bg-emerald-50 text-emerald-700",
    iconClassName: "text-emerald-700",
  },
  staff: {
    icon: UserCog,
    className: "border-indigo-100 bg-indigo-50 text-indigo-700",
    iconClassName: "text-indigo-700",
  },
  trainer: {
    icon: ClipboardList,
    className: "border-violet-100 bg-violet-50 text-violet-700",
    iconClassName: "text-violet-700",
  },
  organization: {
    icon: Building2,
    className: "border-sky-100 bg-sky-50 text-sky-700",
    iconClassName: "text-sky-700",
  },
  default: {
    icon: CircleUserRound,
    className: "border-slate-200 bg-slate-50 text-slate-600",
    iconClassName: "text-slate-600",
  },
};

const sizeClasses: Record<EntityIconSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
};

const iconSizeClasses: Record<EntityIconSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

export function EntityIcon({
  type = "default",
  size = "md",
  shape = "circle",
  label,
  className,
  iconClassName,
}: EntityIconProps) {
  const config = iconConfig[type] || iconConfig.default;
  const Icon = config.icon;

  return (
    <span
      aria-label={label}
      role={label ? "img" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border",
        shape === "circle" ? "rounded-full" : "rounded-xl",
        sizeClasses[size],
        config.className,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(iconSizeClasses[size], config.iconClassName, iconClassName)}
      />
    </span>
  );
}
