import type { WebsiteBlock, WebsitePageDocument, WebsiteSection } from "@/lib/website/document/types";
import { SECTION_LAYOUT_COLUMNS } from "@/lib/website/document/types";
import { normalizeBlockProps, getBlockDefinition, isBlockType } from "@/lib/website/registry";
import { blockRequestKey } from "@/lib/website/datasources/requests";
import {
  BACKGROUND_CLASSES,
  RADIUS_CLASSES,
  TONE_CLASSES,
  WIDTH_CLASSES,
  gapClasses,
  responsiveClasses,
  sectionGridClasses,
  visibilityClasses,
} from "@/lib/website/style-classes";
import { isHiddenEverywhere } from "@/lib/website/document/operations";
import { BLOCK_RENDERERS } from "./blocks";
import { SiteImage, imageFromRef } from "./primitives";
import type { RenderContext } from "./context";

/**
 * Sezioni e blocchi: lo stile viene dai token (classi statiche per
 * dispositivo), i dati dal risolutore, il contenuto dal renderer del tipo.
 * In anteprima ogni elemento porta i suoi attributi `data-ws-*`, che il probe
 * dell'editor usa per selezionare e annotare; in pubblico no.
 */

const LAYOUT_TEMPLATE: Record<string, string> = {
  "two-wide-left": "md:grid-cols-[2fr_1fr]",
  "two-wide-right": "md:grid-cols-[1fr_2fr]",
};

/**
 * I blocchi di sola vetrina: senza dati e senza un messaggio scritto dal club,
 * sul sito pubblico non hanno niente da dire — un titolo «Ultime news» sopra
 * il vuoto, una fascia sponsor bianca. Spariscono, e con loro la sezione se
 * resta vuota. L'anteprima li mostra sempre, con il suggerimento.
 * Un invito all'iscrizione o una classifica «non disponibile» non sono qui:
 * hanno un senso anche senza dati.
 */
const SILENT_WHEN_EMPTY = new Set([
  "sponsor-marquee",
  "sponsor-grid",
  "featured-sponsor",
  "sponsor-section",
  "latest-news",
  "news-grid",
  "featured-article",
  "player-grid",
  "roster-carousel",
  "team-staff",
  "team-stats",
  "player-stats",
  "staff",
]);

const isSilentInPublic = (block: WebsiteBlock, context: RenderContext) => {
  if (context.mode !== "public") return false;
  if (isHiddenEverywhere(block.hidden)) return true;
  if (!SILENT_WHEN_EMPTY.has(block.type)) return false;
  const props = normalizeBlockProps(block) || {};
  if (typeof props.emptyMessage === "string" && props.emptyMessage.trim()) return false;
  const key = blockRequestKey(block, context.pageContext);
  const result = key ? context.data.results[key] ?? null : null;
  return !result || result.status !== "ok";
};

const BlockView = ({ block, context }: { block: WebsiteBlock; context: RenderContext }) => {
  if (!isBlockType(block.type)) return null;
  const definition = getBlockDefinition(block.type);
  if (!definition) return null;
  if (isSilentInPublic(block, context)) return null;
  const Renderer = BLOCK_RENDERERS[block.type];
  const props = normalizeBlockProps(block) || definition.defaults;
  const key = blockRequestKey(block, context.pageContext);
  const data = key ? context.data.results[key] ?? null : null;
  const style = block.style;
  const animation = style?.static?.animation && style.static.animation !== "none" ? style.static.animation : undefined;
  const classes = [
    responsiveClasses(style, definition.style.defaults, context.snapshot.theme.spacing),
    visibilityClasses(block.hidden),
    style?.static?.radius ? RADIUS_CLASSES[style.static.radius] : "",
    "min-w-0",
  ]
    .filter(Boolean)
    .join(" ");
  const preview = context.mode === "preview";
  return (
    <div
      className={classes}
      data-ws-anim={animation}
      data-ws-block={preview ? block.id : undefined}
      data-ws-label={preview ? definition.label : undefined}
      data-ws-hidden={preview && isHiddenEverywhere(block.hidden) ? "true" : undefined}
    >
      <Renderer block={block} props={props} context={context} data={data} />
    </div>
  );
};

export const SectionView = ({ section, context, index }: { section: WebsiteSection; context: RenderContext; index: number }) => {
  if (context.mode === "public" && isHiddenEverywhere(section.hidden)) return null;
  const style = section.style;
  if (
    context.mode === "public" &&
    style?.static?.background !== "image" &&
    section.columns.every((column) => column.blocks.every((block) => isSilentInPublic(block, context)))
  ) {
    return null;
  }
  const background = style?.static?.background || "none";
  const backgroundImage = background === "image" ? imageFromRef(style?.static?.backgroundImage, context) : null;
  const width = style?.static?.width || "container";
  const columns = SECTION_LAYOUT_COLUMNS[section.layout] || 1;
  const preview = context.mode === "preview";
  const outer = [
    "relative",
    BACKGROUND_CLASSES[background] || "",
    TONE_CLASSES[style?.static?.tone || "auto"],
    responsiveClasses(style, { paddingTop: "lg", paddingBottom: "lg", paddingX: width === "full" ? "none" : "sm" }, context.snapshot.theme.spacing),
    visibilityClasses(section.hidden),
  ]
    .filter(Boolean)
    .join(" ");
  const grid = columns > 1
    ? `grid ${LAYOUT_TEMPLATE[section.layout] || sectionGridClasses(columns, style)} ${gapClasses(style, "lg")}`
    : "";
  const animation = style?.static?.animation && style.static.animation !== "none" ? style.static.animation : undefined;
  return (
    <section
      id={section.anchor || undefined}
      className={outer}
      aria-label={section.label || undefined}
      data-ws-anim={animation}
      data-ws-section={preview ? section.id : undefined}
      data-ws-label={preview ? section.label || `Sezione ${index + 1}` : undefined}
      data-ws-hidden={preview && isHiddenEverywhere(section.hidden) ? "true" : undefined}
    >
      {backgroundImage ? (
        <>
          <SiteImage image={backgroundImage} sizes="100vw" className="absolute inset-0 h-full w-full" decorative priority={index === 0} />
          <div className="absolute inset-0 bg-black" style={{ opacity: Math.min(0.8, (style?.static?.overlay ?? 40) / 100) }} aria-hidden="true" />
        </>
      ) : null}
      <div className={`relative ${WIDTH_CLASSES[width] || WIDTH_CLASSES.container} ${grid}`}>
        {section.columns.map((column) => (
          <div key={column.id} className="flex min-w-0 flex-col">
            {column.blocks.map((block) => (
              <BlockView key={block.id} block={block} context={context} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};

export const PageSections = ({ document, context }: { document: WebsitePageDocument; context: RenderContext }) => (
  <>
    {document.sections.map((section, index) => (
      <SectionView key={section.id} section={section} context={context} index={index} />
    ))}
  </>
);
