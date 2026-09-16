import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "@radix-ui/react-icons";

import { cn } from "../../lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-[18px] w-[18px] shrink-0 rounded-egw-check border-[1.5px] border-egw-control-border bg-white transition-colors duration-hover hover:border-[rgba(37,99,235,.5)] focus-visible:outline-none focus-visible:shadow-egw-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-egw-blue data-[state=checked]:bg-egw-blue data-[state=checked]:text-white data-[state=indeterminate]:border-egw-blue data-[state=indeterminate]:bg-egw-blue data-[state=indeterminate]:text-white",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <CheckIcon className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
