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
    className: "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-700",
    iconClassName: "text-egw-blue-700",
  },
  user: {
    icon: UserCircle,
    className: "border-egw-hairline bg-egw-page-100 text-egw-ink-72",
    iconClassName: "text-egw-ink-72",
  },
  sponsor: {
    icon: Handshake,
    className: "border-amber-100 bg-egw-tint-amber text-egw-amber-ink",
    iconClassName: "text-egw-amber-ink",
  },
  member: {
    icon: Users,
    className: "border-emerald-100 bg-egw-tint-green text-egw-green",
    iconClassName: "text-egw-green",
  },
  staff: {
    icon: UserCog,
    className: "border-indigo-100 bg-egw-tint-blue text-egw-indigo",
    iconClassName: "text-egw-indigo",
  },
  trainer: {
    icon: ClipboardList,
    className: "border-violet-100 bg-egw-tint-blue text-egw-indigo",
    iconClassName: "text-egw-indigo",
  },
  organization: {
    icon: Building2,
    className: "border-sky-100 bg-egw-tint-blue text-egw-blue-800",
    iconClassName: "text-egw-blue-800",
  },
  default: {
    icon: CircleUserRound,
    className: "border-egw-hairline bg-egw-page-100 text-egw-ink-72",
    iconClassName: "text-egw-ink-72",
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
        shape === "circle" ? "rounded-full" : "rounded-egw-field",
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
