"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TextInput, type TextInputProps } from "@/components/web/forms/Field";

/**
 * Un campo di testo che **suggerisce** mentre si scrive (guideline 08 §8.2
 * «Autocomplete»): testo libero, righe di 44px con la corrispondenza in
 * grassetto e una seconda riga per disambiguare («collegato a Marco
 * Ferretti»). Sostituisce il `<datalist>` nativo della V1, che non si puo
 * disegnare.
 *
 * Non e nelle fondamenta (`src/components/web/forms/Field.tsx` non ha un
 * `Autocomplete`): vive qui accanto alla pagina ed e un candidato alla
 * promozione (rapporto §3). Tastiera: frecce, Invio, Esc; il clic sulle
 * righe non toglie il fuoco al campo.
 */
export type SuggestOption = { id: string; label: string; description?: string };

export function SuggestInput({
  value,
  onValueChange,
  options,
  onPick,
  maxSuggestions = 8,
  id,
  className,
  ...inputProps
}: Omit<TextInputProps, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SuggestOption[];
  /** Chiamata quando si sceglie una riga (oltre a `onValueChange`). */
  onPick?: (option: SuggestOption) => void;
  maxSuggestions?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  const query = value.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!query) return options.slice(0, maxSuggestions);
    return options.filter((option) => option.label.toLowerCase().includes(query)).slice(0, maxSuggestions);
  }, [options, query, maxSuggestions]);

  React.useEffect(() => {
    setActive(0);
  }, [query]);

  const pick = (option: SuggestOption) => {
    onValueChange(option.label);
    onPick?.(option);
    setOpen(false);
  };

  const highlight = (label: string) => {
    if (!query) return label;
    const index = label.toLowerCase().indexOf(query);
    if (index < 0) return label;
    return (
      <>
        {label.slice(0, index)}
        <strong className="font-bold text-egw-ink">{label.slice(index, index + query.length)}</strong>
        {label.slice(index + query.length)}
      </>
    );
  };

  const showList = open && matches.length > 0;

  return (
    <div className={cn("relative", className)}>
      <TextInput
        {...inputProps}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (!showList) {
            if (event.key === "ArrowDown") setOpen(true);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => (current + 1) % matches.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => (current - 1 + matches.length) % matches.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            pick(matches[active]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="egw-scroll absolute left-0 right-0 top-[calc(100%+6px)] z-[70] max-h-[264px] overflow-y-auto rounded-egw-menu bg-white p-1.5 font-brand shadow-egw-plane-menu"
        >
          {matches.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(option)}
              className={cn(
                "flex min-h-[44px] cursor-pointer flex-col justify-center rounded-egw-chip px-3 py-1.5 text-[13px] font-medium text-egw-ink-72",
                index === active && "bg-egw-page-100 text-egw-ink",
              )}
            >
              <span className="egw-ellipsis block">{highlight(option.label)}</span>
              {option.description ? <span className="egw-ellipsis block text-[11px] text-egw-ink-62">{option.description}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
