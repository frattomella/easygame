import { z } from "zod";
import { normalizeLink } from "../links";
import { normalizeMediaRef } from "../site-config";
import type { MediaRef, WebsiteLink } from "../document/types";

/**
 * Mattoni zod per le props dei blocchi. Ogni campo ha un predefinito e si
 * ripulisce invece di rifiutare: un documento scritto da una versione
 * precedente dell'editor deve restare apribile, e un valore fuori catalogo
 * torna al suo predefinito. I campi pericolosi — URL, collegamenti, file —
 * passano dai normalizzatori di dominio, mai da una stringa libera.
 */

export const text = (max: number, fallback = "") =>
  z
    .unknown()
    .transform((value) => (typeof value === "string" || typeof value === "number" ? String(value) : fallback))
    .transform((value) => value.slice(0, max));

/** HTML ricco: la sanificazione vera la fa il server prima di salvare. */
export const html = (max = 60_000) => text(max, "");

export const bool = (fallback: boolean) =>
  z.unknown().transform((value) => (typeof value === "boolean" ? value : fallback));

export const int = (min: number, max: number, fallback: number) =>
  z.unknown().transform((value) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  });

export const choice = <T extends string>(options: readonly T[], fallback: T) =>
  z.unknown().transform((value) =>
    typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback,
  );

export const link = () => z.unknown().transform((value): WebsiteLink => normalizeLink(value));

export const media = () => z.unknown().transform((value): MediaRef | null => normalizeMediaRef(value));

export const mediaList = (max: number) =>
  z.unknown().transform((value): MediaRef[] =>
    (Array.isArray(value) ? value : [])
      .map((item) => normalizeMediaRef(item))
      .filter((item): item is MediaRef => Boolean(item))
      .slice(0, max),
  );

/** Un identificativo di dato del gestionale, `"context"` o nullo. */
export const ref = (allowContext: boolean, fallback: string | null = null) =>
  z.unknown().transform((value) => {
    const raw = typeof value === "string" ? value.trim().slice(0, 64) : "";
    if (!raw) return fallback;
    if (raw === "context") return allowContext ? "context" : fallback;
    return raw;
  });

export const stringList = (max: number, itemMax: number) =>
  z.unknown().transform((value) =>
    (Array.isArray(value) ? value : [])
      .map((item) => (typeof item === "string" ? item.trim().slice(0, itemMax) : ""))
      .filter(Boolean)
      .slice(0, max),
  );

/** Una lista di elementi strutturati, ognuno ripulito dal suo schema. */
export const list = <T extends z.ZodRawShape>(shape: T, max: number) => {
  const item = z.object(shape).passthrough();
  return z.unknown().transform((value) =>
    (Array.isArray(value) ? value : [])
      .map((entry) => {
        const parsed = item.safeParse(entry && typeof entry === "object" ? entry : {});
        if (!parsed.success) return null;
        const out = parsed.data as Record<string, unknown>;
        const id =
          typeof (entry as any)?.id === "string" && (entry as any).id
            ? String((entry as any).id).slice(0, 64)
            : `i${Math.random().toString(36).slice(2, 10)}`;
        /* Le chiavi non dichiarate cadono: `passthrough` serve solo a non far fallire la validazione. */
        const clean: Record<string, unknown> = { id };
        for (const key of Object.keys(shape)) clean[key] = out[key];
        return clean as z.output<z.ZodObject<T>> & { id: string };
      })
      .filter((entry): entry is z.output<z.ZodObject<T>> & { id: string } => Boolean(entry))
      .slice(0, max),
  );
};

export const SPACING_OPTIONS = [
  { value: "sm", label: "Piccolo" },
  { value: "md", label: "Medio" },
  { value: "lg", label: "Grande" },
] as const;

export const COLUMN_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
] as const;

export const BUTTON_VARIANTS = ["primary", "secondary", "accent", "outline", "ghost"] as const;
export const BUTTON_VARIANT_OPTIONS = [
  { value: "primary", label: "Principale" },
  { value: "secondary", label: "Secondario" },
  { value: "accent", label: "Accento" },
  { value: "outline", label: "Contorno" },
  { value: "ghost", label: "Testo" },
] as const;

export const BUTTON_SIZES = ["sm", "md", "lg"] as const;
export const BUTTON_SIZE_OPTIONS = [
  { value: "sm", label: "Piccolo" },
  { value: "md", label: "Medio" },
  { value: "lg", label: "Grande" },
] as const;

export const ICON_KEYS = [
  "trophy",
  "users",
  "calendar",
  "map-pin",
  "phone",
  "mail",
  "star",
  "heart",
  "shield",
  "target",
  "clock",
  "award",
  "dumbbell",
  "graduation-cap",
  "handshake",
  "info",
  "check",
  "flag",
  "sparkles",
  "zap",
] as const;
