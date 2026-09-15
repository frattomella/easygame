"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useFieldSize } from "@/components/web/forms/Field";

/**
 * Il controllo di caricamento file (guideline 08 §8.2 «File upload»): un campo
 * alto come gli altri, con il segmento «Scegli il file» a sinistra e il nome
 * del file — o «Nessun file scelto» — a destra. Le fondamenta non lo hanno
 * ancora: candidato alla promozione (vedi rapporto di migrazione).
 */
export function FileInput({
  id,
  file,
  onFileChange,
  accept,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const size = useFieldSize();
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center overflow-hidden border border-egw-field-border bg-white font-brand shadow-[inset_0_1px_2px_rgba(11,26,58,.05)]",
        size === "md" ? "h-[46px] rounded-egw-field" : "h-[42px] rounded-egw-control",
        disabled && "opacity-60",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={ariaLabel}
        className="sr-only"
        onChange={(event) => {
          onFileChange(event.target.files?.[0] || null);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="h-full shrink-0 border-r border-egw-hairline bg-egw-page-100 px-3.5 text-[12.5px] font-semibold text-egw-ink hover:bg-egw-page-050 focus-visible:outline-none focus-visible:shadow-egw-focus disabled:cursor-not-allowed"
      >
        Scegli il file
      </button>
      <span className={cn("egw-ellipsis min-w-0 flex-1 px-3 text-[13px]", file ? "text-egw-ink" : "text-egw-ink-42")} title={file?.name}>
        {file ? file.name : "Nessun file scelto"}
      </span>
      {file ? (
        <button
          type="button"
          aria-label="Togli il file"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            onFileChange(null);
          }}
          className="mr-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-egw-ink-42 hover:bg-egw-page-100 focus-visible:outline-none focus-visible:shadow-egw-focus"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
