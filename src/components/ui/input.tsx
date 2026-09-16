import * as React from "react";

import { cn } from "../../lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full min-w-0 rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 py-1 font-brand text-[13.5px] text-egw-ink shadow-[inset_0_1px_2px_rgba(11,26,58,.05)] transition-[border-color,background-color,box-shadow] duration-hover file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-egw-ink-42 hover:border-egw-control-border focus-visible:border-egw-blue focus-visible:bg-white focus-visible:outline-none focus-visible:shadow-egw-focus disabled:cursor-not-allowed disabled:bg-[rgba(11,26,58,.06)] disabled:text-egw-ink-42 read-only:border-transparent read-only:bg-egw-page-100 [&:not(:placeholder-shown)]:bg-white",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
