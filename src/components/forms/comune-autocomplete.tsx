"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { searchComuni } from "@/lib/api/comuni";
import type { ComuneMatch } from "@/lib/comuni-model";
import { MapPin } from "lucide-react";

/**
 * Campo «comune» con ricerca assistita sull'archivio ISTAT.
 *
 * Resta un campo di testo libero: si puo scrivere un comune soppresso, una
 * localita estera o un nome storico, e il form lo accetta. La tendina
 * **propone**; quando si sceglie una voce, chi ospita il campo riceve anche
 * sigla della provincia e codice catastale e decide cosa farne — e cosi che il
 * codice catastale smette di essere una domanda all'operatore senza diventare
 * un valore indovinato (ADR-0027).
 *
 * Non usa `Select` di Radix perche le opzioni non sono un insieme chiuso:
 * sono il risultato di una ricerca su 7.896 righe che vive sul server.
 */

export type ComuneAutocompleteProps = {
  id?: string;
  label?: string | null;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (comune: ComuneMatch) => void;
  /** Restringe la ricerca, quando il form sa gia la provincia. */
  province?: string | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-invalid"?: boolean;
  /** Riga di aiuto sotto al campo. */
  hint?: React.ReactNode;
};

const DEBOUNCE_MS = 180;

export function ComuneAutocomplete({
  id,
  label = "Comune",
  value,
  onChange,
  onSelect,
  province,
  placeholder = "Inizia a scrivere il comune",
  disabled = false,
  required = false,
  className,
  inputClassName,
  hint,
  ...rest
}: ComuneAutocompleteProps) {
  const generatedId = useId();
  const fieldId = id || `comune-${generatedId}`;
  const listId = `${fieldId}-list`;

  const [matches, setMatches] = useState<ComuneMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Ultimo valore *scelto*: evita di riaprire la tendina su cio che si e appena confermato. */
  const justSelectedRef = useRef<string>("");

  useEffect(() => {
    const query = String(value || "").trim();

    if (query.length < 2 || query === justSelectedRef.current) {
      setMatches([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(() => {
      searchComuni(query, { province, signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setMatches(result);
          setHighlight(result.length ? 0 : -1);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, province]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const choose = useCallback(
    (comune: ComuneMatch) => {
      justSelectedRef.current = comune.name;
      onChange(comune.name);
      onSelect?.(comune);
      setOpen(false);
      setMatches([]);
    },
    [onChange, onSelect],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !matches.length) {
      if (event.key === "ArrowDown" && matches.length) setOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => (current + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => (current - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter" && highlight >= 0) {
      // Solo con una voce evidenziata: altrimenti Invio deve poter inviare il
      // form con il testo scritto a mano.
      event.preventDefault();
      choose(matches[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && matches.length > 0;

  return (
    <div className={cn("space-y-2", className)} ref={containerRef}>
      {label ? (
        <Label htmlFor={fieldId}>
          {label}
          {required ? " *" : ""}
        </Label>
      ) : null}

      <div className="relative">
        <Input
          id={fieldId}
          value={value || ""}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={rest["aria-invalid"]}
          className={inputClassName}
          onChange={(event) => {
            justSelectedRef.current = "";
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />

        {showList ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          >
            {matches.map((comune, index) => (
              <li key={comune.belfiore} role="option" aria-selected={index === highlight}>
                <button
                  type="button"
                  // `mousedown` e non `click`: il blur dell'input chiuderebbe
                  // la tendina prima che il click arrivi.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(comune);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                    index === highlight ? "bg-slate-100" : "bg-white",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="truncate text-slate-900">{comune.name}</span>
                    {comune.otherName ? (
                      <span className="truncate text-xs text-slate-400">
                        {comune.otherName}
                      </span>
                    ) : null}
                  </span>
                  <span className="eg-tabular shrink-0 text-xs text-slate-500">
                    {comune.province} · {comune.belfiore}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
      {loading && !matches.length ? (
        <p className="text-xs text-slate-400">Cerco nell&apos;archivio ISTAT…</p>
      ) : null}
    </div>
  );
}
