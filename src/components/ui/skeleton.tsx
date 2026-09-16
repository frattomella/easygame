import { cn } from "../../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("egw-skeleton rounded-egw-micro", className)}
      {...props}
    />
  );
}

export { Skeleton };
