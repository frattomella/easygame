"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Chi sei, dove sei, quando sei.
 *
 * La stagione non e un'etichetta decorativa: da WP-32 e il perimetro dei dati
 * che stai guardando. Categorie, piani e listini di un'altra stagione non
 * compaiono. Per questo porta un occhiello e le cifre tabellari — non un
 * colore d'allarme: dal Blocco 7 la targhetta e neutra, perche un ambra sempre
 * acceso su un valore quasi sempre corretto smette di voler dire qualcosa.
 *
 * Gerarchia della riga (regola fissata dopo il Blocco 5): il **logo del club**
 * e l'elemento piu grande e non ha cornice, perche una cornice attorno a un
 * marchio gia squadrato lo fa sembrare una miniatura di elenco; il **nome del
 * club** e il testo piu grande della barra; la **stagione** e una targhetta
 * che sta accanto al nome e va a capo quando lo spazio manca, cosi non spinge
 * mai logo, nome o comandi fuori posto.
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
      {/* Nessun bordo e nessuna piastra attorno al logo: solo il marchio. */}
      <span
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden",
          logoUrl ? "" : "rounded-lg bg-slate-100",
          compact ? "h-10 w-10" : "h-12 w-12",
        )}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            fill
            sizes="48px"
            className="object-contain"
            unoptimized
          />
        ) : (
          <span
            className={cn(
              "font-display font-semibold text-slate-500",
              compact ? "text-sm" : "text-base",
            )}
          >
            {initials || "EG"}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight">
        <span
          className={cn(
            "truncate font-display font-semibold tracking-tight text-slate-900",
            compact ? "text-base" : "text-xl",
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
      <span className="eg-eyebrow-sm leading-none opacity-70">Stagione</span>
      <span className="eg-tabular text-xs font-semibold leading-none">
        {label}
      </span>
    </>
  );

  // Piu discreta di prima: niente bordo, altezza di una riga sola, e sta
  // accanto al nome invece che sotto. I due token sono grigi dal Blocco 7.
  const shared = cn(
    "inline-flex w-fit shrink-0 items-center gap-1 rounded px-1.5 py-0.5",
    "bg-[var(--eg-season-soft)] text-[var(--eg-season)]",
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
        "transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
      )}
    >
      {content}
    </button>
  );
}
