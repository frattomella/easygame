import type { z } from "zod";
import type { DatasourceKey } from "../datasources/contracts";
import type { ResponsiveStyleKey, StaticStyle } from "../document/types";
import type { ResponsiveDefaults } from "../style-classes";

/**
 * **La forma di una definizione di blocco** (ADR-0200 §3).
 *
 * Una definizione e tutto cio che serve a editor, validazione, migrazione e
 * tavolozza per un tipo di blocco — tranne il componente React che lo
 * disegna, che sta nella mappa del renderer tipizzata contro questo registry
 * (`src/components/website/render/blocks/index.tsx`). Tenerli separati non e
 * una seconda fonte: e il modo per non mandare i controlli dell'editor al
 * visitatore del sito.
 *
 * Modulo puro.
 */

export const BLOCK_CATEGORIES = [
  "layout",
  "content",
  "media",
  "cta",
  "club",
  "match",
  "team",
  "player",
  "sponsor",
  "news",
  "registration",
] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = {
  layout: "Struttura",
  content: "Testi",
  media: "Immagini e video",
  cta: "Inviti all'azione",
  club: "Societa",
  match: "Gare e risultati",
  team: "Squadre",
  player: "Giocatori e staff",
  sponsor: "Sponsor",
  news: "News",
  registration: "Iscrizioni e contatti",
};

export type ControlOption = { value: string; label: string };

type ControlBase = {
  key: string;
  label: string;
  help?: string;
  /** Mostra il controllo solo se un'altra prop vale cosi. */
  when?: { key: string; equals: unknown } | { key: string; notEquals: unknown };
  /** Il gruppo dell'inspector in cui appare. */
  group?: "content" | "data" | "display";
};

export type ControlDescriptor =
  | (ControlBase & { type: "text"; max?: number; placeholder?: string })
  | (ControlBase & { type: "textarea"; max?: number; rows?: number })
  | (ControlBase & { type: "richtext" })
  | (ControlBase & { type: "number"; min: number; max: number; step?: number; unit?: string })
  | (ControlBase & { type: "toggle" })
  | (ControlBase & { type: "select"; options: readonly ControlOption[] })
  | (ControlBase & { type: "segmented"; options: readonly ControlOption[] })
  | (ControlBase & { type: "multi-select"; options: readonly ControlOption[] })
  | (ControlBase & { type: "media" })
  | (ControlBase & { type: "media-list"; max: number })
  | (ControlBase & { type: "link" })
  /** Un bottone: testo e collegamento insieme (`{ label, link }`). */
  | (ControlBase & { type: "cta" })
  | (ControlBase & { type: "icon" })
  | (ControlBase & { type: "embed-url"; providers: readonly string[] })
  | (ControlBase & {
      type: "list";
      fields: readonly ControlDescriptor[];
      max: number;
      itemLabelKey: string;
      addLabel: string;
    })
  /* Selettori di dati del gestionale: le opzioni le fornisce il server. */
  | (ControlBase & { type: "team"; allowContext?: boolean; allowAll?: boolean })
  | (ControlBase & { type: "season" })
  | (ControlBase & { type: "competition"; allowContext?: boolean })
  | (ControlBase & { type: "person"; personKind?: "athlete" | "trainer" | "staff"; allowContext?: boolean })
  | (ControlBase & { type: "sponsor-tier" })
  | (ControlBase & { type: "article-category" })
  | (ControlBase & { type: "form" })
  | (ControlBase & { type: "stat-keys" })
  | (ControlBase & { type: "form-list" });

export type PageKind =
  | "standard"
  | "home"
  | "legal"
  | "news_index"
  | "article_detail"
  | "team_detail"
  | "match_detail"
  | "player_detail"
  | "event_detail";

export type DatasourceBinding<P> = {
  key: DatasourceKey;
  /** Dalle props del blocco alla configurazione della sorgente. */
  config: (props: P) => Record<string, unknown>;
};

export type BlockDefinition<P extends Record<string, unknown> = Record<string, unknown>> = {
  type: string;
  category: BlockCategory;
  label: string;
  description: string;
  /** Nome di un'icona `lucide-react`, risolto dall'editor. */
  icon: string;
  version: number;
  schema: z.ZodType<P, z.ZodTypeDef, unknown>;
  defaults: P;
  controls: readonly ControlDescriptor[];
  style: {
    responsive: readonly ResponsiveStyleKey[];
    static: ReadonlyArray<keyof StaticStyle>;
    defaults?: ResponsiveDefaults;
  };
  datasource?: DatasourceBinding<P>;
  /** Se presente, il blocco si puo usare solo in queste pagine. */
  allowedPageKinds?: readonly PageKind[];
  /** Porta props scritte con una versione precedente alla corrente. */
  migrate?: (props: Record<string, unknown>, fromVersion: number) => Record<string, unknown>;
  keywords?: readonly string[];
};

/** Aiuta l'inferenza: la definizione resta tipizzata sulle sue props. */
export const defineBlock = <P extends Record<string, unknown>>(definition: BlockDefinition<P>) => definition;
