import type { ReactNode } from "react";
import type { MediaRef } from "@/lib/website/document/types";
import type { PublicImage } from "@/lib/website/public-dto";
import { linkRel, resolveLinkHref } from "@/lib/website/links";
import type { WebsiteLink } from "@/lib/website/document/types";
import { WEBSITE_MEDIA_ENDPOINT } from "@/lib/rich-text/sanitize";
import { siteHref, type RenderContext } from "./context";

/**
 * Mattoni del renderer: immagine ottimizzata, bottone, intestazione di
 * blocco, messaggio vuoto, data. Tutti componenti server: nessun JavaScript
 * arriva al browser per disegnarli.
 */

/* ------------------------------------------------------------- immagini */

const WIDTHS = [384, 640, 828, 1080, 1200, 1920] as const;

/**
 * Un `srcset` che passa dall'ottimizzatore di immagini del framework
 * (`/_next/image`): il browser scarica la larghezza che gli serve, nel formato
 * che sa leggere, e mai l'originale in alta risoluzione per una miniatura.
 */
const optimized = (src: string, width: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;

export type ImageLike = { src: string; alt: string; width: number | null; height: number | null; focalX: number; focalY: number };

/** Da un riferimento di un blocco (file + alt + punto focale) a un'immagine. */
export const imageFromRef = (ref: MediaRef | null | undefined, context: RenderContext, fallbackAlt = ""): ImageLike | null => {
  if (!ref?.mediaId) return null;
  const meta = context.data.media[ref.mediaId];
  return {
    src: `${WEBSITE_MEDIA_ENDPOINT}/${encodeURIComponent(ref.mediaId)}`,
    alt: String(ref.alt || meta?.alt || fallbackAlt || ""),
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    focalX: ref.focalX ?? meta?.focalX ?? 50,
    focalY: ref.focalY ?? meta?.focalY ?? 50,
  };
};

export const imageFromPublic = (image: PublicImage | null | undefined): ImageLike | null =>
  image ? { src: image.src, alt: image.alt, width: image.width, height: image.height, focalX: image.focalX, focalY: image.focalY } : null;

export const SiteImage = ({
  image,
  sizes = "100vw",
  className = "",
  fit = "cover",
  priority = false,
  decorative = false,
  maxWidth,
}: {
  image: ImageLike;
  sizes?: string;
  className?: string;
  fit?: "cover" | "contain";
  priority?: boolean;
  decorative?: boolean;
  maxWidth?: number;
}) => {
  const isLocal = image.src.startsWith("/");
  const limit = maxWidth || (image.width ? Math.max(384, image.width) : 1920);
  const widths = WIDTHS.filter((width) => width <= limit * 1.1);
  const usable = widths.length ? widths : [WIDTHS[0]];
  const srcSet = isLocal ? usable.map((width) => `${optimized(image.src, width)} ${width}w`).join(", ") : undefined;
  const src = isLocal ? optimized(image.src, usable[usable.length - 1]) : image.src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={decorative ? "" : image.alt}
      width={image.width || undefined}
      height={image.height || undefined}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      className={className}
      style={{ objectFit: fit, objectPosition: `${image.focalX}% ${image.focalY}%` }}
    />
  );
};

/* -------------------------------------------------------------- bottoni */

const VARIANT_CLASS: Record<string, string> = {
  primary: "ws-btn-primary",
  secondary: "ws-btn-secondary",
  accent: "ws-btn-accent",
  outline: "ws-btn-outline",
  ghost: "ws-btn-ghost",
};

export const SiteLink = ({
  link,
  context,
  className = "",
  children,
  ariaLabel,
}: {
  link: WebsiteLink | null | undefined;
  context: RenderContext;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) => {
  const resolved = resolveLinkHref(link, context.links);
  if (!resolved) return <span className={className}>{children}</span>;
  return (
    <a
      href={resolved.external ? resolved.href : siteHref(context, resolved.href) || resolved.href}
      className={className}
      target={resolved.newTab ? "_blank" : undefined}
      rel={linkRel(resolved)}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
};

export const SiteButton = ({
  label,
  link,
  context,
  variant = "primary",
  size = "md",
  className = "",
  fullWidth = false,
}: {
  label: string;
  link: WebsiteLink | null | undefined;
  context: RenderContext;
  variant?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  fullWidth?: boolean;
}) => {
  if (!label) return null;
  const resolved = resolveLinkHref(link, context.links);
  if (!resolved && context.mode === "public") return null;
  const classes = ["ws-btn", VARIANT_CLASS[variant] || VARIANT_CLASS.primary, size === "sm" ? "ws-btn-sm" : size === "lg" ? "ws-btn-lg" : "", fullWidth ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
  if (!resolved) {
    return (
      <span className={`${classes} opacity-60`} title="Il bottone non ha ancora una destinazione">
        {label}
      </span>
    );
  }
  return (
    <a
      href={resolved.external ? resolved.href : siteHref(context, resolved.href) || resolved.href}
      className={classes}
      target={resolved.newTab ? "_blank" : undefined}
      rel={linkRel(resolved)}
    >
      {label}
    </a>
  );
};

/** Un link a un percorso interno gia calcolato (una card di gara, una squadra). */
export const InternalLink = ({
  href,
  context,
  className = "",
  children,
  ariaLabel,
}: {
  href: string | null | undefined;
  context: RenderContext;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) => {
  const target = siteHref(context, href);
  if (!target) return <div className={className}>{children}</div>;
  return (
    <a href={target} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
};

/* --------------------------------------------------------- intestazioni */

export const BlockTitle = ({
  title,
  eyebrow,
  subtitle,
  level = "h2",
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  level?: "h2" | "h3";
  className?: string;
}) => {
  if (!title && !eyebrow && !subtitle) return null;
  const Heading = level;
  return (
    <header className={`mb-6 ${className}`}>
      {eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-ws-primary">{eyebrow}</p> : null}
      {title ? <Heading className="font-heading text-2xl font-bold md:text-3xl">{title}</Heading> : null}
      {subtitle ? <p className="mt-2 max-w-2xl text-ws-muted-fg">{subtitle}</p> : null}
    </header>
  );
};

/**
 * Un riquadro vuoto. In pubblico mostra il messaggio scelto dal club (o
 * niente, se il club l'ha lasciato vuoto); in anteprima spiega anche perche,
 * cosi chi costruisce il sito sa cosa manca nel gestionale.
 */
export const EmptyState = ({
  message,
  hint,
  context,
}: {
  message?: string;
  hint?: string;
  context: RenderContext;
}) => {
  if (!message && context.mode === "public") return null;
  return (
    <div className="rounded-ws border border-dashed border-ws-border px-5 py-8 text-center text-ws-muted-fg">
      {message ? <p>{message}</p> : null}
      {context.mode === "preview" && hint ? <p className="mt-2 text-xs opacity-80">Anteprima: {hint}</p> : null}
    </div>
  );
};

/* ---------------------------------------------------------------- date */

export const formatDate = (iso: string, timezone = "Europe/Rome", options: Intl.DateTimeFormatOptions = {}) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", { timeZone: timezone, ...options }).format(date);
};

export const formatDay = (iso: string, timezone?: string) =>
  formatDate(iso, timezone, { weekday: "short", day: "numeric", month: "short" });

export const formatLongDay = (iso: string, timezone?: string) =>
  formatDate(iso, timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const formatTime = (iso: string, timezone?: string) => formatDate(iso, timezone, { hour: "2-digit", minute: "2-digit" });

export const DateTime = ({ iso, timezone, mode = "day" }: { iso: string; timezone?: string; mode?: "day" | "long" | "time" | "full" }) => {
  const text =
    mode === "time"
      ? formatTime(iso, timezone)
      : mode === "long"
        ? formatLongDay(iso, timezone)
        : mode === "full"
          ? `${formatLongDay(iso, timezone)} · ${formatTime(iso, timezone)}`
          : formatDay(iso, timezone);
  return <time dateTime={iso}>{text}</time>;
};

/* -------------------------------------------------------------- icone */

/**
 * Un insieme chiuso di icone SVG inline: nessuna libreria di icone nel
 * bundle del sito, e un'icona e sempre decorativa (`aria-hidden`).
 */
const ICON_PATHS: Record<string, string> = {
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  "map-pin": "M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12ZM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 6l-10 7L2 6",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
  award: "M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM8.2 13.9 7 23l5-3 5 3-1.2-9.1",
  dumbbell: "M6.5 6.5 17.5 17.5M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7",
  "graduation-cap": "M22 10 12 5 2 10l10 5 10-5ZM6 12v5c3 2 9 2 12 0v-5",
  handshake: "m11 17 2 2a1 1 0 1 0 3-3M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2 2 0 0 0-2.8 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7.1-.8l.5.3 2.7-.5M21 3l1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01",
  check: "M20 6 9 17l-5-5",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  sparkles: "M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  facebook: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3Z",
  instagram: "M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5ZM16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4ZM17.5 6.5h.01",
  youtube: "M22.5 6.4a2.8 2.8 0 0 0-2-2C18.9 4 12 4 12 4s-6.9 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 5.6 2.8 2.8 0 0 0 2 2c1.6.4 8.5.4 8.5.4s6.9 0 8.5-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-5.6ZM9.8 15.5V8.5l5.7 3.5-5.7 3.5Z",
  tiktok: "M16 3a5 5 0 0 0 5 5v3a8 8 0 0 1-5-1.7V15a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3h3Z",
  x: "M4 4l16 16M20 4 4 20",
  linkedin: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6ZM2 9h4v12H2zM4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  whatsapp: "M3 21l1.7-5A9 9 0 1 1 8 19.3L3 21ZM9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2-1.5 1Z",
  telegram: "M22 3 2 11l7 3 2 7 4-5 5 4 2-17ZM9 14l9-7",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M18 6 6 18M6 6l12 12",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-left": "m15 18-6-6 6-6",
  "chevron-right": "m9 18 6-6-6-6",
  "arrow-right": "M5 12h14M13 5l7 7-7 7",
  play: "M8 5v14l11-7L8 5Z",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
};

export const Icon = ({ name, className = "h-5 w-5" }: { name: string; className?: string }) => {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
};

export const hasIcon = (name: string) => Boolean(ICON_PATHS[name]);

/** «Via dello Sport 1, 04026 Minturno (LT)»: la provincia accanto al comune, senza virgola. */
export const formatClubAddress = (club: { address?: string | null; postalCode?: string | null; city?: string | null; province?: string | null }) => {
  const place = [club.postalCode, club.city].filter(Boolean).join(" ");
  const placeWithProvince = [place, club.province ? `(${club.province})` : ""].filter(Boolean).join(" ");
  return [club.address, placeWithProvince].filter(Boolean).join(", ");
};
