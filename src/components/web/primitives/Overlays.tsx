"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tooltip, popover e menu del Web V2 (guideline 06 §6.7).
 *
 * Tooltip: navy, etichetta bianca 500/12, ritardo 500ms, max 260px. Serve a
 * nominare un comando di sola icona o a mostrare un valore troncato — mai
 * qualcosa che l'utente deve leggere per procedere.
 * Popover: 240–320px, raggio menu, piano 2. Menu: 200–262px, righe 38px.
 */
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delay = 500,
  disabled,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delay?: number;
  disabled?: boolean;
}) {
  if (disabled || !content) return children;
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          className="z-[70] max-w-[260px] rounded-egw-chip bg-egw-navy-900 px-2.5 py-1.5 font-brand text-[12px] font-medium leading-[1.4] text-white shadow-egw-plane-2"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { width?: number }
>(({ className, align = "start", sideOffset = 8, width = 320, style, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={12}
      style={{ width, ...style }}
      className={cn(
        "z-[60] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-egw-menu bg-white p-2 font-brand text-egw-ink shadow-egw-plane-menu outline-none egw-scroll",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";

/* ── Menu ────────────────────────────────────────────────────────────────── */

export const Menu = DropdownMenuPrimitive.Root;
export const MenuTrigger = DropdownMenuPrimitive.Trigger;
export const MenuGroup = DropdownMenuPrimitive.Group;
export const MenuSub = DropdownMenuPrimitive.Sub;
export const MenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const MenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & { width?: number }
>(({ className, sideOffset = 8, align = "end", width = 262, style, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      collisionPadding={12}
      style={{ width, ...style }}
      className={cn(
        "z-[60] overflow-hidden rounded-egw-menu bg-white p-1.5 font-brand text-egw-ink shadow-egw-plane-menu",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
MenuContent.displayName = "MenuContent";

export const MenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      sideOffset={6}
      className={cn(
        "z-[61] min-w-[200px] overflow-hidden rounded-egw-menu bg-white p-1.5 font-brand text-egw-ink shadow-egw-plane-menu",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
MenuSubContent.displayName = "MenuSubContent";

export const MenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(menuItemClass, "data-[state=open]:bg-egw-page-100", className)}
    {...props}
  >
    {children}
    <svg viewBox="0 0 16 16" className="ml-auto h-3 w-3 opacity-50" aria-hidden>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  </DropdownMenuPrimitive.SubTrigger>
));
MenuSubTrigger.displayName = "MenuSubTrigger";

const menuItemClass =
  "relative flex h-[38px] w-full cursor-pointer select-none items-center gap-2.5 rounded-egw-chip px-2.5 text-[12.5px] font-semibold leading-none text-egw-ink outline-none transition-colors duration-hover data-[highlighted]:bg-egw-page-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-egw-ink-62";

export const MenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    tone?: "default" | "danger" | "muted";
  }
>(({ className, tone = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      menuItemClass,
      tone === "danger" && "text-egw-red [&>svg]:text-egw-red data-[highlighted]:bg-egw-tint-red",
      tone === "muted" && "font-medium text-egw-ink-72",
      className,
    )}
    {...props}
  />
));
MenuItem.displayName = "MenuItem";

export const MenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(menuItemClass, "pl-9", className)}
    {...props}
  >
    <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-egw-blue-700" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
MenuCheckboxItem.displayName = "MenuCheckboxItem";

export const MenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(menuItemClass, "pl-9", className)}
    {...props}
  >
    <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-egw-blue-700" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
MenuRadioItem.displayName = "MenuRadioItem";

export const MenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2.5 pb-1.5 pt-2 text-[10px] font-bold uppercase leading-none tracking-[var(--egw-track-eyebrow)] text-egw-ink-42",
      className,
    )}
    {...props}
  />
));
MenuLabel.displayName = "MenuLabel";

export const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("mx-2.5 my-1.5 h-px bg-egw-hairline", className)}
    {...props}
  />
));
MenuSeparator.displayName = "MenuSeparator";
