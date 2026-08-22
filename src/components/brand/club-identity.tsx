"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Chi sei, dove sei, quando sei.
 *
 * La stagione non e un'etichetta decorativa: da WP-32 e il perimetro dei dati
 * che stai guardando. Categorie, piani e listini di un'altra stagione non
 * compaiono. Per questo ha un colore suo — l'unico ambra della chrome — e le
 * cifre tabellari: si legge come una targa, non come un badge fra tanti.
 */
export function ClubIdentity({
  clubName,
  seasonLabel,
  logoUrl,
  onSeasonClick,
  className,
  compact = false,
}: {
  clubName: string;
  seasonLabel?: string | null;
  logoUrl?: string | null;
  onSeasonClick?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const initials = clubName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white",
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            fill
            sizes="44px"
            className="object-contain p-1"
            unoptimized
          />
        ) : (
          <span className="font-display text-sm font-semibold text-slate-500">
            {initials || "EG"}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn(
            "truncate font-display font-semibold tracking-tight text-slate-900",
            compact ? "text-sm" : "text-base",
          )}
          title={clubName}
        >
          {clubName}
        </span>

        {seasonLabel ? (
          <SeasonPlate label={seasonLabel} onClick={onSeasonClick} />
        ) : (
          <span className="text-xs text-slate-400">Nessuna stagione attiva</span>
        )}
      </span>
    </span>
  );
}

export function SeasonPlate({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      <span className="eg-eyebrow text-[0.5625rem] leading-none opacity-70">
        Stagione
      </span>
      <span className="eg-tabular text-xs font-semibold leading-none">
        {label}
      </span>
    </>
  );

  const shared = cn(
    "mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-md border px-1.5 py-1",
    "border-amber-200 bg-[var(--eg-season-soft)] text-[var(--eg-season)]",
    className,
  );

  if (!onClick) {
    return <span className={shared}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Gestisci le stagioni del club"
      className={cn(
        shared,
        "transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1",
      )}
    >
      {content}
    </button>
  );
}
