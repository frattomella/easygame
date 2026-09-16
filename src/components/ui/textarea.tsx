import * as React from "react";

import { cn } from "../../lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[84px] w-full min-w-0 rounded-egw-field border border-egw-field-border bg-egw-page-100 px-3.5 py-2.5 font-brand text-[13.5px] leading-[1.5] text-egw-ink shadow-[inset_0_1px_2px_rgba(11,26,58,.05)] transition-[border-color,background-color,box-shadow] duration-hover placeholder:text-egw-ink-42 hover:border-egw-control-border focus-visible:border-egw-blue focus-visible:bg-white focus-visible:outline-none focus-visible:shadow-egw-focus disabled:cursor-not-allowed disabled:bg-[rgba(11,26,58,.06)] disabled:text-egw-ink-42 [&:not(:placeholder-shown)]:bg-white",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
