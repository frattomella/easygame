import * as React from "react";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/web/format";

/**
 * L'identita in una riga o in un'intestazione (guideline 07 §7.4, 09 §9.8).
 *
 * `IdentityTile`: quadrato in gradiente navy con il numero di maglia (800
 * tabellare) — o due iniziali per chi non ha un numero. `Avatar`: l'unica
 * altra forma rotonda del prodotto, per persone e club; iniziali su gradiente
 * navy come ripiego.
 */
export function IdentityTile({
  number,
  name,
  size = 32,
  className,
  radius = "chip",
}: {
  number?: number | string | null;
  name?: string | null;
  size?: number;
  className?: string;
  radius?: "chip" | "panel-sm";
}) {
  const hasNumber = number !== null && number !== undefined && String(number) !== "";
  const label = hasNumber ? String(number) : initialsOf(name) || "—";
  const fontSize = Math.round(size * (hasNumber ? 0.39 : 0.34));
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center bg-egw-navy font-brand font-extrabold text-white",
        hasNumber && "egw-num",
        radius === "chip" ? "rounded-egw-chip" : "rounded-egw-panel-sm",
        className,
      )}
      style={{ width: size, height: size, fontSize }}
    >
      {label}
    </span>
  );
}

export function Avatar({
  src,
  name,
  size = 32,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = initialsOf(name);
  const fontSize = Math.max(9, Math.round(size * 0.34));
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-egw-navy font-brand font-bold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials || "—"
      )}
    </span>
  );
}

/**
 * La cella d'identita completa: tile + nome (600/12.5, link alla scheda) + una
 * riga meta (400/10, inchiostro 50%).
 */
export function IdentityCell({
  number,
  name,
  meta,
  href,
  onClick,
  avatarSrc,
  round = false,
  className,
}: {
  number?: number | string | null;
  name: string;
  meta?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  avatarSrc?: string | null;
  round?: boolean;
  className?: string;
}) {
  const nameNode = href ? (
    <a
      href={href}
      className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
      onClick={
        onClick
          ? (event) => {
              event.preventDefault();
              onClick();
            }
          : undefined
      }
    >
      {name}
    </a>
  ) : onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
    >
      {name}
    </button>
  ) : (
    <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">
      {name}
    </span>
  );
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {round ? (
        <Avatar src={avatarSrc} name={name} size={32} />
      ) : (
        <IdentityTile number={number} name={name} size={32} />
      )}
      <span className="min-w-0 flex-1">
        {nameNode}
        {meta ? (
          <span className="egw-ellipsis block font-brand text-[10px] leading-[1.4] text-[rgba(11,26,58,.5)]">
            {meta}
          </span>
        ) : null}
      </span>
    </span>
  );
}
