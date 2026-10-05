import { buildMapEmbedSrc, parseEmbedUrl, VIDEO_PROVIDERS, EMBED_PROVIDER_LABELS } from "@/lib/website/embed";
import { itemGridClasses } from "@/lib/website/style-classes";
import type { PublicClubInfo } from "@/lib/website/public-dto";
import { SOCIAL_LABELS, type SocialNetwork } from "@/lib/website/site-config";
import { BlockTitle, EmptyState, Icon, SiteButton, SiteImage, SiteLink, hasIcon, imageFromRef, imageFromPublic, formatClubAddress } from "../primitives";
import { ConsentFrame } from "../islands/ConsentFrame";
import { Carousel } from "../islands/Carousel";
import { Lightbox } from "../islands/Lightbox";
import { dataOf, type BlockRenderer } from "./types";

/**
 * I renderer dei blocchi generici. Ogni testo arriva dalle props, ogni HTML
 * dal sanitizzatore del server, ogni URL esterno dall'allowlist: nessun
 * blocco qui compone un `src` o un `href` da una stringa libera.
 */

const HERO_HEIGHT: Record<string, string> = {
  sm: "min-h-[320px]",
  md: "min-h-[440px]",
  lg: "min-h-[560px] lg:min-h-[640px]",
  full: "min-h-[85vh]",
};

export const HeroRenderer: BlockRenderer = ({ props, context }) => {
  const image = imageFromRef(props.image, context);
  const text = (
    <div className="relative z-10 max-w-3xl">
      {props.eyebrow ? <p className="mb-3 text-sm font-semibold uppercase tracking-widest opacity-90">{props.eyebrow}</p> : null}
      <h1 className="font-heading text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">{props.title}</h1>
      {props.subtitle ? <p className="mt-4 text-lg opacity-90 md:text-xl">{props.subtitle}</p> : null}
      {(props.primaryCta?.label || props.secondaryCta?.label) && (
        <div className="mt-8 flex flex-wrap gap-3">
          <SiteButton label={props.primaryCta?.label} link={props.primaryCta?.link} context={context} variant="primary" size="lg" />
          <SiteButton label={props.secondaryCta?.label} link={props.secondaryCta?.link} context={context} variant="outline" size="lg" />
        </div>
      )}
    </div>
  );

  if (props.variant === "split") {
    return (
      <div className={`grid items-center gap-8 md:grid-cols-2 ${HERO_HEIGHT[props.height] || ""}`}>
        <div className="px-1">{text}</div>
        {image ? (
          <div className="overflow-hidden rounded-ws-lg">
            <SiteImage image={image} sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[4/3] h-full w-full" priority />
          </div>
        ) : null}
      </div>
    );
  }
  if (props.variant === "plain" || !image) {
    return <div className={`flex items-center py-10 ${props.height === "sm" ? "" : HERO_HEIGHT[props.height] || ""}`}>{text}</div>;
  }
  return (
    <div className={`relative flex items-end overflow-hidden ${HERO_HEIGHT[props.height] || ""}`}>
      <SiteImage image={image} sizes="100vw" className="absolute inset-0 h-full w-full" priority decorative={!image.alt} />
      <div className="absolute inset-0 bg-black" style={{ opacity: Math.min(0.85, Math.max(0, Number(props.overlay) / 100)) }} aria-hidden="true" />
      <div className="relative w-full px-4 py-16 text-white md:px-10 md:py-24">{text}</div>
    </div>
  );
};

const HEADING_SIZES: Record<string, string> = {
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-3xl md:text-4xl",
  xl: "text-4xl md:text-5xl lg:text-6xl",
};

export const HeadingRenderer: BlockRenderer = ({ props }) => {
  const Tag = (["h1", "h2", "h3", "h4"].includes(props.level) ? props.level : "h2") as "h1" | "h2" | "h3" | "h4";
  return (
    <div>
      {props.eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-ws-primary">{props.eyebrow}</p> : null}
      <Tag className={`font-heading font-bold leading-tight ${HEADING_SIZES[props.size] || HEADING_SIZES.lg}`}>{props.text}</Tag>
      {props.subtitle ? <p className="mt-3 text-lg text-ws-muted-fg">{props.subtitle}</p> : null}
    </div>
  );
};

/* L'HTML e gia passato da `sanitizeWebsiteRichHtml` sul server, al salvataggio. */
export const RichTextRenderer: BlockRenderer = ({ props }) => (
  <div className="ws-prose" dangerouslySetInnerHTML={{ __html: String(props.html || "") }} />
);

const ASPECT: Record<string, string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
  "3:4": "aspect-[3/4]",
  "21:9": "aspect-[21/9]",
  "9:16": "aspect-[9/16]",
};

const IMAGE_WIDTH: Record<string, string> = {
  full: "w-full",
  wide: "w-full max-w-5xl",
  medium: "w-full max-w-2xl",
  small: "w-full max-w-sm",
};

export const ImageRenderer: BlockRenderer = ({ props, context }) => {
  const image = imageFromRef(props.image, context);
  if (!image) return <EmptyState context={context} hint="scegli un'immagine dalla libreria" />;
  const aspect = props.aspect === "auto" ? "" : ASPECT[props.aspect] || "";
  const picture = (
    <SiteImage
      image={image}
      sizes={props.width === "small" ? "384px" : props.width === "medium" ? "(min-width: 768px) 672px, 100vw" : "100vw"}
      className={`h-auto w-full rounded-ws ${aspect} ${aspect ? "h-full" : ""}`}
      fit={props.fit}
      priority={props.loading === "eager"}
    />
  );
  return (
    <figure className={`mx-auto ${IMAGE_WIDTH[props.width] || "w-full"}`}>
      {props.link?.kind && props.link.kind !== "none" ? (
        <SiteLink link={props.link} context={context} className="block">
          {picture}
        </SiteLink>
      ) : (
        picture
      )}
      {props.caption ? <figcaption className="mt-2 text-sm text-ws-muted-fg">{props.caption}</figcaption> : null}
    </figure>
  );
};

export const VideoRenderer: BlockRenderer = ({ props, context }) => {
  const embed = parseEmbedUrl(props.url, VIDEO_PROVIDERS);
  if (!embed) return <EmptyState context={context} hint="incolla l'indirizzo di un video YouTube o Vimeo" />;
  const poster = imageFromRef(props.poster, context);
  return (
    <figure>
      <ConsentFrame
        src={embed.src}
        title={props.title || "Video"}
        provider={EMBED_PROVIDER_LABELS[embed.provider]}
        allow={embed.allow}
        aspect={String(props.aspect || "16:9").replace(":", " / ")}
        thumbnail={poster ? `/_next/image?url=${encodeURIComponent(poster.src)}&w=1080&q=70` : embed.thumbnail}
      />
      {props.caption ? <figcaption className="mt-2 text-sm text-ws-muted-fg">{props.caption}</figcaption> : null}
    </figure>
  );
};

export const ButtonRenderer: BlockRenderer = ({ props, context }) => (
  <div>
    <SiteButton label={props.label} link={props.link} context={context} variant={props.variant} size={props.size} fullWidth={props.fullWidth} />
  </div>
);

export const CtaRenderer: BlockRenderer = ({ props, context }) => {
  const image = imageFromRef(props.image, context);
  const buttons = (
    <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
      <SiteButton label={props.primaryCta?.label} link={props.primaryCta?.link} context={context} variant="accent" size="lg" />
      <SiteButton label={props.secondaryCta?.label} link={props.secondaryCta?.link} context={context} variant="outline" size="lg" />
    </div>
  );
  if (props.layout === "split") {
    return (
      <div className="grid items-center gap-8 overflow-hidden rounded-ws-lg bg-ws-muted md:grid-cols-2">
        {image ? <SiteImage image={image} sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[4/3] h-full w-full" /> : <div aria-hidden="true" />}
        <div className="p-8 md:p-10">
          <h2 className="font-heading text-3xl font-bold">{props.title}</h2>
          {props.text ? <p className="mt-3 text-lg opacity-90">{props.text}</p> : null}
          {buttons}
        </div>
      </div>
    );
  }
  const box = props.layout === "card" ? "rounded-ws-lg border border-ws-border bg-ws-bg p-8 shadow-sm md:p-12" : "py-4";
  return (
    <div className={box}>
      <h2 className="font-heading text-3xl font-bold md:text-4xl">{props.title}</h2>
      {props.text ? <p className="mx-auto mt-3 max-w-2xl text-lg opacity-90">{props.text}</p> : null}
      <div className="flex justify-center">{buttons}</div>
    </div>
  );
};

export const ColumnsRenderer: BlockRenderer = ({ props, context }) => (
  <div className={`grid gap-8 ${itemGridClasses({ desktop: Number(props.columns) || 3 })}`}>
    {(props.items || []).map((item: any) => (
      <div key={item.id}>
        {item.icon && hasIcon(item.icon) ? (
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-ws bg-ws-primary text-ws-primary-ink">
            <Icon name={item.icon} className="h-6 w-6" />
          </span>
        ) : null}
        {item.title ? <h3 className="font-heading text-xl font-bold">{item.title}</h3> : null}
        {item.text ? <p className="mt-2 text-ws-muted-fg">{item.text}</p> : null}
        {item.linkLabel && item.link?.kind !== "none" ? (
          <SiteLink link={item.link} context={context} className="ws-link mt-3 inline-flex items-center gap-1 font-semibold">
            {item.linkLabel}
            <Icon name="arrow-right" className="h-4 w-4" />
          </SiteLink>
        ) : null}
      </div>
    ))}
  </div>
);

export const CardGridRenderer: BlockRenderer = ({ props, context }) => (
  <div className={`grid gap-6 ${itemGridClasses({ desktop: Number(props.columns) || 3 })}`}>
    {(props.items || []).map((item: any) => {
      const image = imageFromRef(item.image, context, item.title);
      return (
        <article key={item.id} className="flex flex-col overflow-hidden rounded-ws border border-ws-border bg-ws-bg">
          {image ? <SiteImage image={image} sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className={`w-full ${ASPECT[props.imageAspect] || "aspect-[4/3]"}`} /> : null}
          <div className="flex flex-1 flex-col p-5">
            {item.title ? <h3 className="font-heading text-lg font-bold">{item.title}</h3> : null}
            {item.text ? <p className="mt-2 flex-1 text-ws-muted-fg">{item.text}</p> : null}
            {item.linkLabel && item.link?.kind !== "none" ? (
              <SiteLink link={item.link} context={context} className="ws-link mt-4 font-semibold">
                {item.linkLabel}
              </SiteLink>
            ) : null}
          </div>
        </article>
      );
    })}
  </div>
);

const SPACER: Record<string, string> = { xs: "h-4", sm: "h-8", md: "h-14", lg: "h-24", xl: "h-36" };

export const SpacerRenderer: BlockRenderer = ({ props }) => <div className={SPACER[props.size] || SPACER.md} aria-hidden="true" />;

export const DividerRenderer: BlockRenderer = ({ props }) => {
  const width = props.width === "short" ? "w-24" : props.width === "medium" ? "w-1/2" : "w-full";
  if (props.variant === "accent") return <div className={`mx-auto h-1 rounded-full bg-ws-accent ${width}`} role="separator" />;
  const style = props.variant === "dashed" ? "border-dashed" : props.variant === "dots" ? "border-dotted border-t-4" : "border-solid";
  return <hr className={`mx-auto border-0 border-t border-ws-border ${style} ${width}`} />;
};

export const GalleryRenderer: BlockRenderer = ({ props, context }) => {
  const images = (props.images || []).map((ref: any) => imageFromRef(ref, context)).filter(Boolean) as NonNullable<ReturnType<typeof imageFromRef>>[];
  if (!images.length) return <EmptyState context={context} hint="aggiungi le immagini della galleria" />;
  const thumb = (image: (typeof images)[number], index: number, className: string) => (
    <a key={`${image.src}-${index}`} href={`/_next/image?url=${encodeURIComponent(image.src)}&w=1920&q=80`} data-lightbox-index={index} className="block overflow-hidden rounded-ws focus-visible:outline-none">
      <SiteImage image={image} sizes="(min-width: 1024px) 33vw, 50vw" className={className} maxWidth={1080} />
    </a>
  );
  const items =
    props.layout === "carousel" ? (
      <Carousel label="Galleria di immagini">{images.map((image, index) => <div key={index}>{thumb(image, index, "aspect-[4/3] w-full")}</div>)}</Carousel>
    ) : props.layout === "masonry" ? (
      <div className="columns-2 gap-4 md:columns-3 [&>*]:mb-4">{images.map((image, index) => thumb(image, index, "h-auto w-full"))}</div>
    ) : (
      <div className={`grid gap-3 ${itemGridClasses({ desktop: Number(props.columns) || 3, mobile: 2 })}`}>
        {images.map((image, index) => thumb(image, index, `w-full ${props.aspect === "auto" ? "h-auto" : ASPECT[props.aspect] || "aspect-square"}`))}
      </div>
    );
  return props.lightbox ? <Lightbox images={images.map((image) => ({ src: image.src, alt: image.alt }))}>{items}</Lightbox> : items;
};

export const CarouselRenderer: BlockRenderer = ({ props, context }) => {
  const slides = props.slides || [];
  if (!slides.length) return <EmptyState context={context} hint="aggiungi almeno una slide" />;
  const per = Number(props.perView) || 1;
  const width = per === 1 ? { base: "100%", md: "100%", lg: "100%" } : per === 2 ? { base: "88%", md: "48%", lg: "48%" } : { base: "88%", md: "48%", lg: "32%" };
  return (
    <Carousel label="Carosello" autoplay={props.autoplay} interval={props.interval} itemWidth={width}>
      {slides.map((slide: any) => {
        const image = imageFromRef(slide.image, context, slide.title);
        return (
          <article key={slide.id} className="relative overflow-hidden rounded-ws-lg bg-ws-dark text-white">
            {image ? <SiteImage image={image} sizes={per === 1 ? "100vw" : "50vw"} className="aspect-[16/9] w-full opacity-80" /> : <div className="aspect-[16/9]" />}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              {slide.title ? <h3 className="font-heading text-2xl font-bold">{slide.title}</h3> : null}
              {slide.text ? <p className="mt-1 opacity-90">{slide.text}</p> : null}
              {slide.linkLabel ? <SiteButton label={slide.linkLabel} link={slide.link} context={context} variant="accent" size="sm" className="mt-3" /> : null}
            </div>
          </article>
        );
      })}
    </Carousel>
  );
};

const LOGO_HEIGHT: Record<string, string> = { sm: "h-10", md: "h-14", lg: "h-20" };

export const LogosRenderer: BlockRenderer = ({ props, context }) => {
  const items = props.items || [];
  if (!items.length) return <EmptyState context={context} hint="aggiungi i loghi" />;
  const columns = Number(props.columns) || 5;
  return (
    <ul className={`grid items-center gap-8 ${props.monochrome ? "ws-monochrome" : ""} ${columns >= 5 ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-5" : itemGridClasses({ desktop: columns, mobile: 2 })}`}>
      {items.map((item: any) => {
        const image = imageFromRef(item.image, context, item.name);
        if (!image) return null;
        const logo = <SiteImage image={image} sizes="200px" fit="contain" className={`mx-auto w-auto max-w-full ${LOGO_HEIGHT[props.size] || LOGO_HEIGHT.md}`} maxWidth={640} />;
        return (
          <li key={item.id} className="flex justify-center">
            {item.link?.kind && item.link.kind !== "none" ? (
              <SiteLink link={item.link} context={context} ariaLabel={item.name || image.alt}>
                {logo}
              </SiteLink>
            ) : (
              logo
            )}
          </li>
        );
      })}
    </ul>
  );
};

export const StatsRenderer: BlockRenderer = ({ props }) => {
  const items = props.items || [];
  const cell = props.variant === "cards" ? "rounded-ws border border-ws-border bg-ws-bg p-6" : props.variant === "divided" ? "border-ws-border px-4 md:border-l md:first:border-l-0" : "";
  return (
    <dl className={`grid gap-6 ${itemGridClasses({ desktop: Math.min(4, Math.max(1, items.length)) || 3, tablet: Math.min(items.length, 2) || 2, mobile: Math.min(items.length, 2) || 1 })}`}>
      {items.map((item: any) => (
        <div key={item.id} className={cell}>
          {item.icon && hasIcon(item.icon) ? <Icon name={item.icon} className="mx-auto mb-2 h-7 w-7 text-ws-primary" /> : null}
          <dd className="font-heading text-4xl font-bold md:text-5xl">
            {item.prefix}
            {item.value}
            {item.suffix}
          </dd>
          <dt className="mt-1 text-sm uppercase tracking-wider opacity-80">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
};

/* `<details>` nativo: apribile da tastiera, leggibile senza JavaScript. */
export const FaqRenderer: BlockRenderer = ({ props }) => (
  <div className="divide-y divide-ws-border rounded-ws border border-ws-border">
    {(props.items || []).map((item: any, index: number) => (
      <details key={item.id} open={props.openFirst && index === 0} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold">
          <span>{item.question}</span>
          <span className="transition-transform group-open:rotate-180">
            <Icon name="chevron-down" className="h-5 w-5" />
          </span>
        </summary>
        <div className="whitespace-pre-line px-5 pb-5 text-ws-muted-fg">{item.answer}</div>
      </details>
    ))}
  </div>
);

const SOCIAL_SIZE: Record<string, string> = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-14 w-14" };

export const SocialLinksRenderer: BlockRenderer = ({ props, context, data }) => {
  const club = dataOf<PublicClubInfo | null>(data, context.data.club);
  const entries = Object.entries(club?.social || {}).filter(([, url]) => Boolean(url)) as Array<[SocialNetwork, string]>;
  if (!entries.length) return <EmptyState context={context} hint="aggiungi i profili social nell'anagrafica del club o nelle impostazioni del sito" />;
  return (
    <div>
      {props.title ? <h2 className="mb-4 font-heading text-xl font-bold">{props.title}</h2> : null}
      <ul className={`flex flex-wrap gap-3 ${props.variant === "list" ? "flex-col" : ""}`}>
        {entries.map(([network, url]) => (
          <li key={network}>
            <a href={url} target="_blank" rel="noopener noreferrer" className={props.variant === "icons" ? `inline-flex items-center justify-center rounded-full bg-ws-primary text-ws-primary-ink ${SOCIAL_SIZE[props.size] || SOCIAL_SIZE.md}` : props.variant === "buttons" ? "ws-btn ws-btn-outline" : "ws-link inline-flex items-center gap-2"} aria-label={SOCIAL_LABELS[network]}>
              <Icon name={network} className="h-5 w-5" />
              {props.variant !== "icons" ? <span>{SOCIAL_LABELS[network]}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const ContactRenderer: BlockRenderer = ({ props, context, data }) => {
  const club = dataOf<PublicClubInfo | null>(data, context.data.club);
  if (!club) return null;
  const address = formatClubAddress(club);
  const rows: Array<{ icon: string; label: string; value: string; href?: string }> = [];
  if (props.showAddress && address) rows.push({ icon: "map-pin", label: "Indirizzo", value: address });
  if (props.showEmail && club.email) rows.push({ icon: "mail", label: "Email", value: club.email, href: `mailto:${club.email}` });
  if (props.showPhone && club.phone) rows.push({ icon: "phone", label: "Telefono", value: club.phone, href: `tel:${club.phone.replace(/[^\d+]/g, "")}` });
  return (
    <div>
      {props.title ? <h2 className="font-heading text-2xl font-bold">{props.title}</h2> : null}
      {props.text ? <p className="mt-2 text-ws-muted-fg">{props.text}</p> : null}
      <ul className={`mt-6 ${props.layout === "cards" ? "grid gap-4 md:grid-cols-3" : "space-y-4"}`}>
        {rows.map((row) => (
          <li key={row.label} className={`flex items-start gap-3 ${props.layout === "cards" ? "rounded-ws border border-ws-border p-5" : ""}`}>
            <span className="mt-0.5 text-ws-primary"><Icon name={row.icon} /></span>
            <div>
              <p className="text-xs uppercase tracking-wider text-ws-muted-fg">{row.label}</p>
              {row.href ? <a className="ws-link font-semibold" href={row.href}>{row.value}</a> : <p className="font-semibold">{row.value}</p>}
            </div>
          </li>
        ))}
      </ul>
      {props.showSocial ? <div className="mt-6"><SocialLinksRenderer block={{ id: "", type: "social-links", version: 1, props: {} }} props={{ variant: "icons", size: "sm", title: "" }} context={context} data={data} /></div> : null}
    </div>
  );
};

const MAP_HEIGHT: Record<string, number> = { sm: 280, md: 400, lg: 540 };

export const MapRenderer: BlockRenderer = ({ props, context, data }) => {
  const club = dataOf<PublicClubInfo | null>(data, context.data.club);
  const address = props.address || [club?.address, club?.postalCode, club?.city].filter(Boolean).join(" ");
  if (!address) return <EmptyState context={context} hint="indica l'indirizzo, o completalo nell'anagrafica del club" />;
  return (
    <ConsentFrame
      src={buildMapEmbedSrc(address, props.zoom)}
      title={props.title || "Mappa"}
      provider="Google Maps"
      allow="fullscreen"
      height={MAP_HEIGHT[props.height] || MAP_HEIGHT.md}
    />
  );
};

export const EmbedRenderer: BlockRenderer = ({ props, context }) => {
  const embed = parseEmbedUrl(props.url);
  if (!embed) return <EmptyState context={context} hint="incolla l'indirizzo di un contenuto YouTube, Vimeo, Google Maps, Spotify o SoundCloud" />;
  return (
    <ConsentFrame
      src={embed.src}
      title={props.title || "Contenuto incorporato"}
      provider={EMBED_PROVIDER_LABELS[embed.provider]}
      allow={embed.allow}
      height={props.height}
      thumbnail={embed.thumbnail}
    />
  );
};

export { BlockTitle, imageFromPublic };
