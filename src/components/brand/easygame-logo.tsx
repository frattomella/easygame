import { cn } from "@/lib/utils";

/**
 * Marchio EasyGame.
 *
 * Prima era un PNG su un CDN esterno (`r2.fivemanage.com`), sgranato appena
 * superava la sua dimensione nativa, piu due riferimenti a `/logo.png` e
 * `/logo-blu.png` che **non esistono** in `public/`: due immagini rotte in
 * produzione.
 *
 * Il segno viene dal mestiere del prodotto: la griglia del programma
 * settimanale. Nove celle, una accesa — l'allenamento di oggi. Resta nitido a
 * 16 px come a 96 px, non fa richieste di rete e non dipende da nessun host.
 */
export function EasyGameLogo({
  className,
  title = "EasyGame",
  tone = "dark",
}: {
  className?: string;
  title?: string;
  /** `dark` = piastra scura su fondo chiaro. `light` = piastra chiara su fondo scuro. */
  tone?: "dark" | "light";
}) {
  const plate = tone === "light" ? "#ffffff" : "var(--eg-navy, #0f172a)";
  const grid = tone === "light" ? "var(--eg-navy, #0f172a)" : "#ffffff";

  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={cn("h-10 w-10", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="12" fill={plate} />
      <g opacity="0.42">
        <rect x="11" y="11" width="8" height="8" rx="2" fill={grid} />
        <rect x="21" y="11" width="8" height="8" rx="2" fill={grid} />
        <rect x="31" y="11" width="6" height="8" rx="2" fill={grid} />
        <rect x="11" y="21" width="8" height="8" rx="2" fill={grid} />
        <rect x="31" y="21" width="6" height="8" rx="2" fill={grid} />
        <rect x="11" y="31" width="8" height="6" rx="2" fill={grid} />
        <rect x="21" y="31" width="8" height="6" rx="2" fill={grid} />
        <rect x="31" y="31" width="6" height="6" rx="2" fill={grid} />
      </g>
      {/* La cella accesa: l'allenamento di oggi. */}
      <rect
        x="21"
        y="21"
        width="8"
        height="8"
        rx="2"
        fill="var(--eg-blue, #1d4ed8)"
      />
    </svg>
  );
}

/**
 * Marchio piu nome, per le intestazioni dove EasyGame parla in prima persona:
 * accesso, console di piattaforma, pagina account.
 */
export function EasyGameWordmark({
  className,
  logoClassName,
  subtitle,
}: {
  className?: string;
  logoClassName?: string;
  subtitle?: string;
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <EasyGameLogo className={cn("h-10 w-10 shrink-0", logoClassName)} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-display text-lg font-semibold tracking-tight text-slate-900">
          EasyGame
        </span>
        {subtitle ? (
          <span className="truncate text-xs text-slate-500">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
