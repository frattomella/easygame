import Image from "next/image";
import { cn } from "@/lib/utils";
import iconBlue from "@/../public/images/brand/icon-b.png";
import iconWhite from "@/../public/images/brand/icon-w.png";
import wordmarkBlue from "@/../public/images/brand/logotipo-b.png";
import wordmarkWhite from "@/../public/images/brand/logotipo-w.png";

/**
 * Marchio EasyGame — asset ufficiali (icona e logotipo, forniti come PNG).
 *
 * `tone="dark"` = versione blu, per sfondi chiari. `tone="light"` = versione
 * bianca, per sfondi scuri (sidebar, riquadri navy). Non ridisegnare: sono i
 * file ufficiali, usati cosi come sono.
 */
export function EasyGameLogo({
  className,
  title = "EasyGame",
  tone = "dark",
}: {
  className?: string;
  title?: string;
  tone?: "dark" | "light";
}) {
  return (
    <Image
      src={tone === "light" ? iconWhite : iconBlue}
      alt={title}
      className={cn("h-10 w-10 shrink-0 object-contain", className)}
    />
  );
}

/**
 * Il logotipo (testo "EasyGame" incluso nell'immagine): per le schermate
 * dove EasyGame parla in prima persona, e per la sidebar, dove e l'unico
 * elemento di marchio richiesto — niente testo duplicato accanto.
 */
export function EasyGameWordmark({
  className,
  logoClassName,
  subtitle,
  tone = "dark",
}: {
  className?: string;
  logoClassName?: string;
  subtitle?: string;
  tone?: "dark" | "light";
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <Image
        src={tone === "light" ? wordmarkWhite : wordmarkBlue}
        alt="EasyGame"
        className={cn("h-8 w-auto shrink-0 object-contain", logoClassName)}
      />
      {subtitle ? (
        <span className="eg-eyebrow-sm truncate text-blue-300">
          {subtitle}
        </span>
      ) : null}
    </span>
  );
}
