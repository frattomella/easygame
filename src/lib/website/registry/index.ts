import { CONTENT_BLOCKS } from "./blocks/content";
import { SPORTS_BLOCKS } from "./blocks/sports";
import { CLUB_BLOCKS } from "./blocks/club";
import {
  BLOCK_CATEGORIES,
  BLOCK_CATEGORY_LABELS,
  type BlockCategory,
  type BlockDefinition,
  type PageKind,
} from "./types";
import { newWebsiteId } from "../ids";
import type { WebsiteBlock } from "../document/types";

/**
 * **Il registry dei blocchi: uno solo** (ADR-0200 §3).
 *
 * In GPW la definizione di un tipo stava in cinque record paralleli e in un
 * catalogo C#; qui sta in una voce. L'editor ci legge tavolozza e inspector,
 * il server ci valida e migra le props, il renderer ci si tipizza contro
 * (`Record<BlockType, …>`), e un tipo nuovo che dimenticasse uno dei tre lati
 * non compilerebbe — o non passerebbe `tests/lib/website-registry.test.mjs`.
 *
 * Modulo puro.
 */

export const BLOCK_DEFINITIONS = [...CONTENT_BLOCKS, ...SPORTS_BLOCKS, ...CLUB_BLOCKS] as const;

export type BlockType = (typeof BLOCK_DEFINITIONS)[number]["type"];

type AnyDefinition = BlockDefinition<Record<string, unknown>>;

const BY_TYPE = new Map<string, AnyDefinition>(
  BLOCK_DEFINITIONS.map((definition) => [definition.type, definition as unknown as AnyDefinition]),
);

/* Un tipo dichiarato due volte e un errore di caricamento, non un comportamento. */
if (BY_TYPE.size !== BLOCK_DEFINITIONS.length) {
  throw new Error("Registry dei blocchi del sito con tipi duplicati");
}

export const BLOCK_TYPES = BLOCK_DEFINITIONS.map((definition) => definition.type) as readonly BlockType[];

export const isBlockType = (value: unknown): value is BlockType =>
  typeof value === "string" && BY_TYPE.has(value);

export const getBlockDefinition = (type: string): AnyDefinition | null => BY_TYPE.get(type) || null;

/**
 * Le props di un blocco portate alla versione corrente e ripulite. Un tipo
 * sconosciuto restituisce `null`: il renderer lo salta, l'editor lo segnala.
 */
export const normalizeBlockProps = (block: Pick<WebsiteBlock, "type" | "props" | "version">) => {
  const definition = getBlockDefinition(block.type);
  if (!definition) return null;
  let props = block.props && typeof block.props === "object" ? { ...block.props } : {};
  const from = Number(block.version) || 1;
  if (definition.migrate && from < definition.version) {
    props = definition.migrate(props, from);
  }
  const parsed = definition.schema.safeParse({ ...definition.defaults, ...props });
  return parsed.success ? (parsed.data as Record<string, unknown>) : { ...definition.defaults };
};

/** Un blocco nuovo, con le props predefinite e un identificativo nuovo. */
export const createBlock = (type: BlockType | string, overrides: Record<string, unknown> = {}): WebsiteBlock => {
  const definition = getBlockDefinition(type);
  if (!definition) throw new Error(`Tipo di blocco sconosciuto: ${type}`);
  const props = normalizeBlockProps({ type, version: definition.version, props: { ...structuredCloneSafe(definition.defaults), ...overrides } });
  return { id: newWebsiteId(), type, version: definition.version, props: props || {} };
};

const structuredCloneSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Vero se il blocco si puo usare in questo tipo di pagina. */
export const isBlockAllowedOnPage = (type: string, kind: PageKind) => {
  const definition = getBlockDefinition(type);
  if (!definition) return false;
  if (!definition.allowedPageKinds) return true;
  return definition.allowedPageKinds.includes(kind) || (kind === "home" && definition.allowedPageKinds.includes("standard"));
};

export type PaletteGroup = {
  category: BlockCategory;
  label: string;
  blocks: Array<Pick<AnyDefinition, "type" | "label" | "description" | "icon" | "keywords">>;
};

/** La tavolozza dell'editor, raggruppata per categoria e filtrata per pagina. */
export const listPalette = (kind: PageKind, query = ""): PaletteGroup[] => {
  const needle = query.trim().toLowerCase();
  return BLOCK_CATEGORIES.map((category) => ({
    category,
    label: BLOCK_CATEGORY_LABELS[category],
    blocks: BLOCK_DEFINITIONS.filter((definition) => definition.category === category)
      .filter((definition) => isBlockAllowedOnPage(definition.type, kind))
      .filter((definition) => {
        if (!needle) return true;
        const haystack = [definition.label, definition.description, ...((definition as AnyDefinition).keywords || [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .map((definition) => ({
        type: definition.type,
        label: definition.label,
        description: definition.description,
        icon: definition.icon,
        keywords: (definition as AnyDefinition).keywords,
      })),
  })).filter((group) => group.blocks.length > 0);
};

export { BLOCK_CATEGORIES, BLOCK_CATEGORY_LABELS };
export type { BlockCategory, BlockDefinition, PageKind };
