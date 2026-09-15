"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/web/primitives/Overlays";
import { Checkbox } from "@/components/web/primitives/Controls";

/**
 * I campi del Web V2 (guideline 08 §8.1–8.2). Due altezze: 46px in pagina,
 * 42px in un cassetto (`size="sm"`). Etichetta 600/12, controllo, una riga di
 * aiuto o di errore. L'obbligatorio porta un asterisco rosso; il sola-lettura
 * non ha bordo; il disabilitato e solo per «temporaneamente non disponibile».
 */
type FieldSize = "md" | "sm";

const FieldSizeContext = React.createContext<FieldSize>("md");

/** Un modulo in un cassetto dichiara la taglia una volta sola. */
export function FieldSizeProvider({ size, children }: { size: FieldSize; children: React.ReactNode }) {
  return <FieldSizeContext.Provider value={size}>{children}</FieldSizeContext.Provider>;
}

export const useFieldSize = () => React.useContext(FieldSizeContext);

export interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  warning?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Larghezza guidata dal contenuto (`16ch`, `12ch`) invece del contenitore. */
  width?: string;
}

export function Field({ label, htmlFor, required, optional, helper, error, warning, children, className, width }: FieldProps) {
  const helperId = React.useId();
  return (
    <div className={cn("flex min-w-0 flex-col", className)} style={width ? { maxWidth: width } : undefined}>
      <label htmlFor={htmlFor} className="mb-2 block font-brand text-[12px] font-semibold leading-none text-egw-ink-62">
        {label}
        {required ? (
          <span className="ml-0.5 font-bold text-egw-red" aria-hidden>
            *
          </span>
        ) : null}
        {optional ? <span className="ml-1 text-[11.5px] font-normal text-[rgba(11,26,58,.55)]">(facoltativo)</span> : null}
      </label>
      <FieldMessageContext.Provider value={{ error: Boolean(error), warning: Boolean(warning), describedBy: helper || error || warning ? helperId : undefined }}>
        {children}
      </FieldMessageContext.Provider>
      {error ? (
        <p id={helperId} role="alert" className="mt-[7px] font-brand text-[11.5px] font-medium leading-[1.4] text-egw-red">
          {error}
        </p>
      ) : warning ? (
        <p id={helperId} className="mt-[7px] font-brand text-[11.5px] font-medium leading-[1.4] text-egw-amber-ink">
          {warning}
        </p>
      ) : helper ? (
        <p id={helperId} className="mt-[7px] font-brand text-[11.5px] font-medium leading-[1.4] text-[rgba(11,26,58,.55)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

const FieldMessageContext = React.createContext<{ error: boolean; warning: boolean; describedBy?: string }>({ error: false, warning: false });

const controlBase =
  "w-full min-w-0 font-brand text-[13.5px] text-egw-ink outline-none transition-[border-color,background-color,box-shadow] duration-hover placeholder:text-egw-ink-42 disabled:cursor-not-allowed disabled:bg-[rgba(11,26,58,.06)] disabled:text-egw-ink-42 read-only:border-transparent read-only:bg-egw-page-100 read-only:text-egw-ink-72 read-only:shadow-none read-only:focus:shadow-none";

export const controlClasses = (size: FieldSize, state: { error?: boolean; warning?: boolean } = {}) =>
  cn(
    controlBase,
    "border bg-egw-page-100 shadow-[inset_0_1px_2px_rgba(11,26,58,.05)]",
    size === "md" ? "h-[46px] rounded-egw-field px-3.5" : "h-[42px] rounded-egw-control px-3",
    state.error
      ? "border-[1.5px] border-egw-red focus:shadow-egw-focus-danger"
      : state.warning
        ? "border-[1.5px] border-egw-amber focus:shadow-egw-focus"
        : "border-egw-field-border hover:border-egw-control-border focus:border-[1.5px] focus:border-egw-blue focus:bg-white focus:shadow-egw-focus",
    "[&:not(:placeholder-shown)]:bg-white",
  );

/* ── Text / Email / Number / Currency ────────────────────────────────────── */
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Numeri: tabellari, allineati a destra, niente spinner. */
  numeric?: boolean;
  wrapperClassName?: string;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ className, leading, trailing, numeric, wrapperClassName, ...props }, ref) => {
    const size = useFieldSize();
    const msg = React.useContext(FieldMessageContext);
    const input = (
      <input
        ref={ref}
        aria-invalid={msg.error || undefined}
        aria-describedby={msg.describedBy}
        className={cn(
          controlClasses(size, msg),
          numeric && "egw-num text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          leading && "pl-10",
          trailing && "pr-10",
          className,
        )}
        {...props}
      />
    );
    if (!leading && !trailing) return input;
    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        {leading ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-egw-ink-42 [&>svg]:h-4 [&>svg]:w-4">
            {leading}
          </span>
        ) : null}
        {input}
        {trailing ? (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-brand text-[13px] text-[rgba(11,26,58,.55)] [&>svg]:h-4 [&>svg]:w-4">
            {trailing}
          </span>
        ) : null}
      </div>
    );
  },
);
TextInput.displayName = "TextInput";

export const CurrencyInput = React.forwardRef<HTMLInputElement, Omit<TextInputProps, "numeric" | "trailing">>(
  (props, ref) => <TextInput ref={ref} numeric inputMode="decimal" trailing="€" placeholder="0,00" {...props} />,
);
CurrencyInput.displayName = "CurrencyInput";

/* ── Textarea ────────────────────────────────────────────────────────────── */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    const size = useFieldSize();
    const msg = React.useContext(FieldMessageContext);
    return (
      <textarea
        ref={ref}
        aria-invalid={msg.error || undefined}
        aria-describedby={msg.describedBy}
        className={cn(controlClasses(size, msg), "h-auto min-h-[84px] max-h-[240px] resize-y py-3 leading-[1.5]", className)}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

/* ── Select (Radix) ──────────────────────────────────────────────────────── */
export type SelectOption = { value: string; label: React.ReactNode; disabled?: boolean; description?: React.ReactNode };

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Seleziona",
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  name,
}: {
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  name?: string;
}) {
  const size = useFieldSize();
  const msg = React.useContext(FieldMessageContext);
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled} name={name}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={msg.error || undefined}
        className={cn(
          controlClasses(size, msg),
          "flex items-center justify-between gap-2 text-left data-[placeholder]:text-egw-ink-42 [&>span]:min-w-0 [&>span]:truncate",
          value && "bg-white",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-3 w-3 shrink-0 text-egw-ink-42" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-[70] max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-egw-menu bg-white p-1.5 font-brand shadow-egw-plane-menu"
        >
          <SelectPrimitive.Viewport className="egw-scroll">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex min-h-[38px] cursor-pointer select-none items-center rounded-egw-chip py-2 pl-3 pr-9 text-[13px] font-medium text-egw-ink outline-none data-[highlighted]:bg-egw-page-100 data-[state=checked]:bg-egw-page-100 data-[state=checked]:text-egw-blue-700 data-[disabled]:opacity-40"
              >
                <div className="min-w-0">
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.description ? <div className="text-[11px] text-egw-ink-62">{option.description}</div> : null}
                </div>
                <SelectPrimitive.ItemIndicator className="absolute right-3">
                  <Check className="h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ── Searchable / multi select (popover + elenco con ricerca) ─────────────── */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Seleziona",
  searchPlaceholder = "Cerca",
  disabled,
  id,
  className,
  emptyLabel = "Nessun risultato",
  allowClear,
}: {
  value: string | null | undefined;
  onValueChange: (value: string | null) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  emptyLabel?: string;
  allowClear?: boolean;
}) {
  const size = useFieldSize();
  const msg = React.useContext(FieldMessageContext);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(typeof o.label === "string" ? o.label : o.value).toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={msg.error || undefined}
          className={cn(controlClasses(size, msg), "flex items-center justify-between gap-2 text-left", selected && "bg-white", className)}
        >
          <span className={cn("min-w-0 truncate", !selected && "text-egw-ink-42")}>{selected ? selected.label : placeholder}</span>
          <span className="flex shrink-0 items-center gap-1">
            {allowClear && selected ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Svuota"
                onClick={(event) => { event.stopPropagation(); onValueChange(null); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onValueChange(null); } }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-egw-ink-42 hover:bg-egw-page-100"
              >
                <X className="h-3 w-3" />
              </span>
            ) : null}
            <ChevronDown className="h-3 w-3 text-egw-ink-42" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent width={320} className="p-1.5" style={{ width: "var(--radix-popover-trigger-width)", minWidth: 240 }}>
        <div className="mb-1.5 flex h-[38px] items-center gap-2 rounded-egw-chip bg-egw-page-100 px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-egw-ink-42"
          />
        </div>
        <ul role="listbox" className="egw-scroll max-h-[280px] overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-[12.5px] text-egw-ink-62">{emptyLabel}</li>
          ) : (
            filtered.map((option) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  disabled={option.disabled}
                  onClick={() => { onValueChange(option.value); setOpen(false); setQuery(""); }}
                  className={cn(
                    "flex min-h-[38px] w-full items-center justify-between gap-2 rounded-egw-chip px-3 py-2 text-left text-[13px] font-medium text-egw-ink hover:bg-egw-page-100 focus-visible:outline-none focus-visible:bg-egw-page-100 disabled:opacity-40",
                    option.value === value && "bg-egw-page-100 text-egw-blue-700",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.description ? <span className="block text-[11px] text-egw-ink-62">{option.description}</span> : null}
                  </span>
                  {option.value === value ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function MultiSelect({
  values,
  onValuesChange,
  options,
  placeholder = "Seleziona",
  searchPlaceholder = "Cerca",
  disabled,
  id,
  className,
}: {
  values: readonly string[];
  onValuesChange: (values: string[]) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const size = useFieldSize();
  const msg = React.useContext(FieldMessageContext);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(typeof o.label === "string" ? o.label : o.value).toLowerCase().includes(q));
  }, [options, query]);
  const toggle = (v: string) =>
    onValuesChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const selected = options.filter((o) => values.includes(o.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={msg.error || undefined}
          className={cn(controlClasses(size, msg), "flex h-auto min-h-[46px] flex-wrap items-center gap-1.5 py-1.5 text-left", selected.length && "bg-white", className)}
        >
          {selected.length === 0 ? (
            <span className="text-egw-ink-42">{placeholder}</span>
          ) : (
            selected.map((o) => (
              <span key={o.value} className="inline-flex h-6 items-center gap-1 rounded-egw-chip border border-[rgba(11,26,58,.12)] bg-egw-page-100 px-2 text-[11.5px] font-medium text-egw-ink-72">
                {o.label}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Rimuovi`}
                  onClick={(event) => { event.stopPropagation(); toggle(o.value); }}
                  className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-white"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </span>
            ))
          )}
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-egw-ink-42" />
        </button>
      </PopoverTrigger>
      <PopoverContent width={320} className="p-1.5" style={{ width: "var(--radix-popover-trigger-width)", minWidth: 240 }}>
        <div className="mb-1.5 flex h-[38px] items-center gap-2 rounded-egw-chip bg-egw-page-100 px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-egw-ink-42" />
          <span className="egw-num text-[11px] text-egw-ink-62">{values.length} selezionate</span>
        </div>
        <ul role="listbox" aria-multiselectable className="egw-scroll max-h-[280px] overflow-y-auto">
          {filtered.map((option) => (
            <li key={option.value} role="option" aria-selected={values.includes(option.value)}>
              <label className="flex min-h-[38px] cursor-pointer items-center gap-2.5 rounded-egw-chip px-3 py-2 text-[13px] font-medium text-egw-ink hover:bg-egw-page-100">
                <Checkbox checked={values.includes(option.value)} onChange={() => toggle(option.value)} />
                <span className="min-w-0 truncate">{option.label}</span>
              </label>
            </li>
          ))}
          {filtered.length === 0 ? <li className="px-3 py-3 text-[12.5px] text-egw-ink-62">Nessun risultato</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* ── Date (nativo, si puo sempre digitare) ───────────────────────────────── */
export const DateInput = React.forwardRef<HTMLInputElement, Omit<TextInputProps, "type">>((props, ref) => (
  <TextInput ref={ref} type="date" className={cn("egw-num", props.className)} {...props} />
));
DateInput.displayName = "DateInput";

export const TimeInput = React.forwardRef<HTMLInputElement, Omit<TextInputProps, "type">>((props, ref) => (
  <TextInput ref={ref} type="time" step={900} className={cn("egw-num", props.className)} {...props} />
));
TimeInput.displayName = "TimeInput";

/* ── Gruppo di campi (indirizzo, IBAN + intestatario) ────────────────────── */
export function FieldGroup({ eyebrow, children, className, columns = 2 }: { eyebrow?: React.ReactNode; children: React.ReactNode; className?: string; columns?: 1 | 2 | 3 }) {
  return (
    <fieldset className={cn("rounded-egw-field border border-egw-hairline bg-egw-page-100 p-4", className)}>
      {eyebrow ? (
        <legend className="mb-3 font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">{eyebrow}</legend>
      ) : null}
      <div className={cn("grid gap-4", columns === 1 && "grid-cols-1", columns === 2 && "grid-cols-1 md:grid-cols-2", columns === 3 && "grid-cols-1 md:grid-cols-3")}>{children}</div>
    </fieldset>
  );
}

/** Due colonne 1fr/1fr con gap 24, che scendono a una sotto i 1152px. */
export function FormGrid({ children, className, columns = 2 }: { children: React.ReactNode; className?: string; columns?: 1 | 2 }) {
  return <div className={cn("grid gap-x-6 gap-y-5", columns === 2 ? "grid-cols-1 laptop:grid-cols-2" : "grid-cols-1", className)}>{children}</div>;
}

/** Il riepilogo degli errori in cima al modulo: `Controlla 3 campi`. */
export function ValidationSummary({ errors, className }: { errors: Array<{ id?: string; label: React.ReactNode }>; className?: string }) {
  if (!errors.length) return null;
  return (
    <div role="alert" aria-live="assertive" className={cn("rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-4 py-3", className)}>
      <p className="font-brand text-[13px] font-semibold text-egw-ink">
        Controlla {errors.length === 1 ? "1 campo" : `${errors.length} campi`}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {errors.map((e, i) => (
          <li key={i}>
            {e.id ? (
              <a href={`#${e.id}`} className="font-brand text-[12.5px] font-medium text-egw-red underline" onClick={(ev) => { ev.preventDefault(); document.getElementById(e.id!)?.focus(); }}>
                {e.label}
              </a>
            ) : (
              <span className="font-brand text-[12.5px] font-medium text-egw-red">{e.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
