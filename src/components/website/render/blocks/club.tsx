import type { PublicArticle, PublicArticleSummary, PublicClubInfo, PublicClubNumber, PublicRegistrationForm, PublicSponsor } from "@/lib/website/public-dto";
import { itemGridClasses } from "@/lib/website/style-classes";
import { REGISTRATION_PURPOSE_LABELS } from "@/lib/website/registry/blocks/club";
import { BlockTitle, DateTime, EmptyState, Icon, InternalLink, SiteButton, SiteImage, SiteLink, imageFromPublic, imageFromRef } from "../primitives";
import { Lightbox } from "../islands/Lightbox";
import { MarqueePause } from "../islands/MarqueePause";
import { ContactForm } from "../islands/ContactForm";
import { FormEmbed } from "../islands/FormEmbed";
import { dataOf, reasonOf, type BlockRenderer } from "./types";
import { siteHref } from "../context";

/* ---------------------------------------------------------------- societa */

export const ClubInfoRenderer: BlockRenderer = ({ props, context, data }) => {
  const club = dataOf<PublicClubInfo | null>(data, context.data.club);
  if (!club) return null;
  const logo = props.showLogo ? imageFromPublic(club.logo) : null;
  const address = [club.address, [club.postalCode, club.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const body = (
    <div>
      <h2 className="font-heading text-3xl font-bold">{club.name}</h2>
      {club.tagline ? <p className="mt-1 text-lg text-ws-primary">{club.tagline}</p> : null}
      {props.showDescription && club.description ? <p className="mt-4 whitespace-pre-line">{club.description}</p> : null}
      {props.extraText ? <p className="mt-4 whitespace-pre-line">{props.extraText}</p> : null}
      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        {props.showFounded && club.foundedYear ? <div><dt className="text-ws-muted-fg">Fondata nel</dt><dd className="font-semibold">{club.foundedYear}</dd></div> : null}
        {props.showAddress && address ? <div><dt className="text-ws-muted-fg">Sede</dt><dd className="font-semibold">{address}</dd></div> : null}
        {club.sports.length ? <div><dt className="text-ws-muted-fg">Sport</dt><dd className="font-semibold capitalize">{club.sports.join(", ")}</dd></div> : null}
      </dl>
    </div>
  );
  if (props.layout === "centered") {
    return (
      <div className="mx-auto max-w-3xl text-center">
        {logo ? <SiteImage image={logo} sizes="160px" fit="contain" className="mx-auto mb-6 h-32 w-32" maxWidth={384} /> : null}
        {body}
      </div>
    );
  }
  return (
    <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
      {logo ? <SiteImage image={logo} sizes="200px" fit="contain" className="h-40 w-40 md:h-48 md:w-48" maxWidth={384} /> : null}
      {body}
    </div>
  );
};

export const ClubNumbersRenderer: BlockRenderer = ({ props, context, data }) => {
  const automatic = dataOf<PublicClubNumber[]>(data, []);
  const manual: PublicClubNumber[] = (props.manual || [])
    .filter((item: any) => item.value && item.label)
    .map((item: any) => ({ key: item.id, label: item.label, value: item.value, suffix: item.suffix, source: "manual" }));
  const items = [...automatic, ...manual];
  if (!items.length) return <EmptyState hint="aggiungi una cifra o scegli quelle contate dal gestionale" context={context} />;
  const cell = props.variant === "cards" ? "rounded-ws bg-black/10 p-6" : props.variant === "divided" ? "px-4 [border-color:color-mix(in_srgb,currentColor_20%,transparent)] md:border-l md:first:border-l-0" : "";
  return (
    <div>
      {props.title ? <h2 className="mb-8 font-heading text-3xl font-bold">{props.title}</h2> : null}
      <dl className={`grid gap-6 ${itemGridClasses({ desktop: Math.min(4, items.length), tablet: Math.min(2, items.length), mobile: Math.min(2, items.length) })}`}>
        {items.map((item) => (
          <div key={item.key} className={cell}>
            <dd className="font-heading text-4xl font-bold tabular-nums md:text-6xl">
              {typeof item.value === "number" ? item.value.toLocaleString("it-IT") : item.value}
              {item.suffix}
            </dd>
            <dt className="mt-2 text-sm uppercase tracking-wider opacity-80">{item.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
};

/* ---------------------------------------------------------------- sponsor */

const LOGO_SIZE: Record<string, string> = { sm: "h-10 md:h-12", md: "h-14 md:h-16", lg: "h-20 md:h-24" };
const MARQUEE_SPEED: Record<string, number> = { slow: 60, normal: 38, fast: 22 };
const MARQUEE_GAP: Record<string, string> = { sm: "1.5rem", md: "3rem", lg: "5rem" };

const SponsorLogo = ({ sponsor, size, link, context }: { sponsor: PublicSponsor; size: string; link: boolean; context: Parameters<BlockRenderer>[0]["context"] }) => {
  const image = imageFromPublic(sponsor.logo);
  const content = image ? (
    <SiteImage image={{ ...image, alt: image.alt || sponsor.name }} sizes="240px" fit="contain" className={`w-auto max-w-[12rem] ${LOGO_SIZE[size] || LOGO_SIZE.md}`} maxWidth={640} />
  ) : (
    <span className="font-heading text-lg font-bold">{sponsor.name}</span>
  );
  if (link && sponsor.url) {
    return (
      <a href={sponsor.url} target="_blank" rel="noopener noreferrer sponsored" aria-label={sponsor.name} className="inline-flex items-center">
        {content}
      </a>
    );
  }
  return <span className="inline-flex items-center">{content}</span>;
};

export const SponsorMarqueeRenderer: BlockRenderer = ({ block, props, context, data }) => {
  const sponsors = dataOf<PublicSponsor[]>(data, []);
  if (!sponsors.length) return <EmptyState hint="metti in vetrina gli sponsor dalla sezione Sponsor del sito" context={context} />;
  /* Il gruppo si ripete per riempire la fascia; la seconda copia e nascosta ai lettori di schermo. */
  const repeat = Math.max(2, Math.ceil(10 / sponsors.length));
  const group = Array.from({ length: repeat }, () => sponsors).flat();
  const id = `ws-marquee-${block.id}`;
  return (
    <div>
      {props.title ? <h2 className="mb-6 text-center font-heading text-xl font-bold">{props.title}</h2> : null}
      <div
        id={id}
        className={`ws-marquee ${props.monochrome ? "ws-monochrome" : ""}`}
        data-pause-on-hover={props.pauseOnHover ? "true" : "false"}
        style={
          {
            "--ws-marquee-duration": `${(MARQUEE_SPEED[props.speed] || 38) * Math.max(1, group.length / 8)}s`,
            "--ws-marquee-direction": props.direction === "right" ? "reverse" : "normal",
            "--ws-marquee-gap": MARQUEE_GAP[props.gap] || MARQUEE_GAP.md,
          } as React.CSSProperties
        }
      >
        <div className="ws-marquee-track">
          <ul className="ws-marquee-group" aria-label="Sponsor">
            {group.map((sponsor, index) => (
              <li key={`${sponsor.id}-${index}`} aria-hidden={index >= sponsors.length ? "true" : undefined}>
                <SponsorLogo sponsor={sponsor} size={props.logoSize} link={props.linkLogos && index < sponsors.length} context={context} />
              </li>
            ))}
          </ul>
          <ul className="ws-marquee-group" aria-hidden="true">
            {group.map((sponsor, index) => (
              <li key={`copy-${sponsor.id}-${index}`}>
                <SponsorLogo sponsor={sponsor} size={props.logoSize} link={false} context={context} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <MarqueePause targetId={id} />
      </div>
    </div>
  );
};

const groupByTier = (sponsors: PublicSponsor[]) => {
  const groups = new Map<string, { label: string; order: number; sponsors: PublicSponsor[] }>();
  for (const sponsor of sponsors) {
    const group = groups.get(sponsor.tier.key) || { label: sponsor.tier.label, order: sponsor.tier.order, sponsors: [] };
    group.sponsors.push(sponsor);
    groups.set(sponsor.tier.key, group);
  }
  return Array.from(groups.values()).sort((a, b) => a.order - b.order);
};

export const SponsorGridRenderer: BlockRenderer = ({ props, context, data }) => {
  const sponsors = dataOf<PublicSponsor[]>(data, []);
  if (!sponsors.length) return props.emptyMessage ? <EmptyState message={props.emptyMessage} context={context} /> : <EmptyState hint="metti in vetrina gli sponsor dalla sezione Sponsor del sito" context={context} />;
  const columns = Number(props.columns) || 4;
  const grid = (list: PublicSponsor[]) => (
    <ul className={`grid items-center gap-6 ${props.monochrome ? "ws-monochrome" : ""} ${columns >= 5 ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-5" : itemGridClasses({ desktop: columns, mobile: 2 })}`}>
      {list.map((sponsor) => (
        <li key={sponsor.id} className="flex flex-col items-center justify-center gap-2 rounded-ws border border-ws-border bg-ws-bg p-5 text-center">
          <SponsorLogo sponsor={sponsor} size={props.logoSize} link={props.linkLogos} context={context} />
          {props.showNames ? <span className="text-sm font-semibold">{sponsor.name}</span> : null}
        </li>
      ))}
    </ul>
  );
  return (
    <div>
      <BlockTitle title={props.title} />
      {props.groupByTier ? (
        <div className="space-y-10">
          {groupByTier(sponsors).map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-ws-muted-fg">{group.label}</h3>
              {grid(group.sponsors)}
            </section>
          ))}
        </div>
      ) : (
        grid(sponsors)
      )}
    </div>
  );
};

export const FeaturedSponsorRenderer: BlockRenderer = ({ props, context, data }) => {
  const sponsor = dataOf<PublicSponsor[]>(data, [])[0];
  if (!sponsor) return <EmptyState hint="segna uno sponsor «in evidenza» nella sua vetrina" context={context} />;
  const logo = imageFromPublic(sponsor.logo);
  const body = (
    <div>
      {props.eyebrow ? <p className="text-sm font-semibold uppercase tracking-widest text-ws-primary">{props.eyebrow}</p> : null}
      <h2 className="mt-2 font-heading text-3xl font-bold">{sponsor.name}</h2>
      {props.showDescription && sponsor.description ? <p className="mt-3 text-lg text-ws-muted-fg">{sponsor.description}</p> : null}
      {sponsor.url && props.ctaLabel ? (
        <a href={sponsor.url} target="_blank" rel="noopener noreferrer sponsored" className="ws-btn ws-btn-primary mt-6">
          {props.ctaLabel}
        </a>
      ) : null}
    </div>
  );
  const picture = logo ? <SiteImage image={{ ...logo, alt: logo.alt || sponsor.name }} sizes="400px" fit="contain" className="mx-auto h-32 w-auto max-w-full md:h-40" maxWidth={828} /> : null;
  return props.layout === "split" ? (
    <div className="grid items-center gap-8 rounded-ws-lg bg-ws-muted p-8 md:grid-cols-2 md:p-12">
      <div className="flex justify-center">{picture}</div>
      {body}
    </div>
  ) : (
    <div className="mx-auto max-w-2xl text-center">
      <div className="mb-6">{picture}</div>
      {body}
    </div>
  );
};

export const SponsorSectionRenderer: BlockRenderer = ({ props, context, data }) => {
  const sponsors = dataOf<PublicSponsor[]>(data, []);
  if (!sponsors.length) return <EmptyState hint="metti in vetrina gli sponsor dalla sezione Sponsor del sito" context={context} />;
  const groups = groupByTier(sponsors);
  const sizes = ["lg", "md", "md", "sm", "sm"];
  return (
    <div>
      <BlockTitle title={props.title} />
      <div className="space-y-12">
        {groups.map((group, index) => (
          <section key={group.label} aria-label={group.label} className="text-center">
            {props.showTierTitles ? <h3 className="mb-6 text-sm font-semibold uppercase tracking-[0.25em] text-ws-muted-fg">{group.label}</h3> : null}
            <ul className={`flex flex-wrap items-center justify-center gap-x-12 gap-y-8 ${props.monochrome ? "ws-monochrome" : ""}`}>
              {group.sponsors.map((sponsor) => (
                <li key={sponsor.id}>
                  <SponsorLogo sponsor={sponsor} size={sizes[Math.min(index, sizes.length - 1)]} link={props.linkLogos} context={context} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- news */

const ArticleCard = ({
  article,
  context,
  props,
  featured = false,
}: {
  article: PublicArticleSummary;
  context: Parameters<BlockRenderer>[0]["context"];
  props: any;
  featured?: boolean;
}) => {
  const cover = imageFromPublic(article.cover);
  return (
    <article className={`group flex h-full flex-col overflow-hidden rounded-ws border border-ws-border bg-ws-bg ${featured ? "md:col-span-2 md:flex-row" : ""}`}>
      {cover ? (
        <InternalLink href={article.href} context={context} className={`block overflow-hidden ${featured ? "md:w-3/5" : ""}`}>
          <SiteImage image={{ ...cover, alt: cover.alt || article.title }} sizes={featured ? "(min-width: 768px) 60vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"} className={`w-full transition-transform group-hover:scale-105 ${featured ? "aspect-[16/10] h-full" : "aspect-[16/10]"}`} />
        </InternalLink>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <p className="flex flex-wrap gap-x-3 text-xs font-semibold uppercase tracking-wider text-ws-muted-fg">
          {props.showCategory !== false && article.category ? <span className="text-ws-primary">{article.category.label}</span> : null}
          {props.showDate !== false && article.publishedAt ? <DateTime iso={article.publishedAt} mode="long" /> : null}
        </p>
        <h3 className={`mt-2 font-heading font-bold ${featured ? "text-2xl md:text-3xl" : "text-xl"}`}>
          <InternalLink href={article.href} context={context} className="hover:underline">
            {article.title}
          </InternalLink>
        </h3>
        {props.showExcerpt !== false && article.excerpt ? <p className="mt-2 flex-1 text-ws-muted-fg">{article.excerpt}</p> : null}
      </div>
    </article>
  );
};

export const LatestNewsRenderer: BlockRenderer = ({ props, context, data }) => {
  const result = dataOf<{ items: PublicArticleSummary[]; total: number }>(data, { items: [], total: 0 });
  if (!result.items.length) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint="pubblica la prima news dalla sezione News del sito" context={context} />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <BlockTitle title={props.title} className="mb-0" />
        {props.moreLink?.label ? (
          <SiteLink link={props.moreLink.link} context={context} className="ws-link inline-flex items-center gap-1 font-semibold">
            {props.moreLink.label}
            <Icon name="arrow-right" className="h-4 w-4" />
          </SiteLink>
        ) : null}
      </div>
      {props.layout === "list" ? (
        <ul className="divide-y divide-ws-border">
          {result.items.map((article) => (
            <li key={article.id} className="py-4">
              <p className="text-xs uppercase tracking-wider text-ws-muted-fg">{props.showDate ? <DateTime iso={article.publishedAt} mode="long" /> : null}</p>
              <InternalLink href={article.href} context={context} className="font-heading text-lg font-bold hover:underline">
                {article.title}
              </InternalLink>
              {props.showExcerpt && article.excerpt ? <p className="mt-1 text-ws-muted-fg">{article.excerpt}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className={`grid gap-6 ${itemGridClasses({ desktop: Math.min(3, result.items.length) || 3 })}`}>
          {result.items.map((article) => <ArticleCard key={article.id} article={article} context={context} props={props} />)}
        </div>
      )}
    </div>
  );
};

export const NewsGridRenderer: BlockRenderer = ({ props, context, data }) => {
  const result = dataOf<{ items: PublicArticleSummary[]; total: number }>(data, { items: [], total: 0 });
  if (!result.items.length) return <EmptyState hint="pubblica la prima news dalla sezione News del sito" context={context} />;
  return (
    <div>
      <BlockTitle title={props.title} />
      <div className={`grid gap-6 ${itemGridClasses({ desktop: Number(props.columns) || 3 })}`}>
        {result.items.map((article, index) => (
          <ArticleCard key={article.id} article={article} context={context} props={props} featured={props.featuredFirst && index === 0} />
        ))}
      </div>
    </div>
  );
};

export const FeaturedArticleRenderer: BlockRenderer = ({ props, context, data }) => {
  const article = dataOf<{ items: PublicArticleSummary[] }>(data, { items: [] }).items[0];
  if (!article) return <EmptyState hint="segna un articolo come «in evidenza»" context={context} />;
  const cover = imageFromPublic(article.cover);
  if (props.layout === "overlay" && cover) {
    return (
      <InternalLink href={article.href} context={context} className="group relative block overflow-hidden rounded-ws-lg text-white">
        <SiteImage image={{ ...cover, alt: cover.alt || article.title }} sizes="100vw" className="aspect-[16/9] w-full transition-transform group-hover:scale-105 md:aspect-[21/9]" />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/30 to-transparent p-6 md:p-10">
          {props.eyebrow ? <p className="text-sm font-semibold uppercase tracking-widest text-ws-accent">{props.eyebrow}</p> : null}
          <h2 className="mt-2 max-w-3xl font-heading text-3xl font-bold md:text-5xl">{article.title}</h2>
          {article.excerpt ? <p className="mt-3 max-w-2xl text-lg opacity-90">{article.excerpt}</p> : null}
        </div>
      </InternalLink>
    );
  }
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      {cover ? <SiteImage image={{ ...cover, alt: cover.alt || article.title }} sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[4/3] w-full rounded-ws-lg" /> : null}
      <div>
        {props.eyebrow ? <p className="text-sm font-semibold uppercase tracking-widest text-ws-primary">{props.eyebrow}</p> : null}
        <h2 className="mt-2 font-heading text-3xl font-bold md:text-4xl">{article.title}</h2>
        {article.excerpt ? <p className="mt-3 text-lg text-ws-muted-fg">{article.excerpt}</p> : null}
        {props.ctaLabel && article.href ? <InternalLink href={article.href} context={context} className="ws-btn ws-btn-primary mt-6">{props.ctaLabel}</InternalLink> : null}
      </div>
    </div>
  );
};

/** L'archivio: le pagine e il filtro per categoria sono collegamenti, senza JavaScript. */
export const ArticleListRenderer: BlockRenderer = ({ props, context, data }) => {
  const result = dataOf<{ items: PublicArticleSummary[]; total: number }>(data, { items: [], total: 0 });
  const categories = context.snapshot.settings.articleCategories;
  const base = siteHref(context, context.currentPath) || "/";
  const perPage = Number(props.perPage) || 9;
  const page = Math.max(1, Number(context.pageContext.articlePage) || 1);
  const pages = Math.max(1, Math.ceil(result.total / perPage));
  const category = context.pageContext.articleCategory || "";
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (category) query.set("categoria", category);
    if (target > 1) query.set("pagina", String(target));
    const text = query.toString();
    return text ? `${base}?${text}` : base;
  };
  return (
    <div>
      {props.showCategories && categories.length ? (
        <nav aria-label="Categorie delle news" className="mb-8 flex flex-wrap gap-2">
          <a href={base} className="ws-btn ws-btn-outline ws-btn-sm">Tutte</a>
          {categories.map((category) => (
            <a key={category.slug} href={`${base}?categoria=${encodeURIComponent(category.slug)}`} className="ws-btn ws-btn-outline ws-btn-sm">
              {category.label}
            </a>
          ))}
        </nav>
      ) : null}
      {result.items.length ? (
        <div className={`grid gap-6 ${itemGridClasses({ desktop: Number(props.columns) || 3 })}`}>
          {result.items.map((article) => <ArticleCard key={article.id} article={article} context={context} props={{ showCategory: true, showDate: true, showExcerpt: true }} />)}
        </div>
      ) : (
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      )}
      {pages > 1 ? (
        <nav aria-label="Pagine dell'archivio" className="mt-10 flex items-center justify-center gap-3">
          {page > 1 ? <a className="ws-btn ws-btn-outline ws-btn-sm" href={pageHref(page - 1)} rel="prev">Piu recenti</a> : null}
          <span className="text-sm text-ws-muted-fg">Pagina {page} di {pages}</span>
          {page < pages ? <a className="ws-btn ws-btn-outline ws-btn-sm" href={pageHref(page + 1)} rel="next">Meno recenti</a> : null}
        </nav>
      ) : null}
    </div>
  );
};

export const ArticleBodyRenderer: BlockRenderer = ({ props, context, data }) => {
  const article = dataOf<PublicArticle | null>(data, null);
  if (!article) return <EmptyState message="Articolo non trovato." hint={reasonOf(data) || "in anteprima il modello mostra l'articolo dell'indirizzo"} context={context} />;
  const cover = imageFromPublic(article.cover);
  const shareUrl = `${context.origin}${context.currentPath}`;
  return (
    <article>
      <header>
        {props.showMeta ? (
          <p className="flex flex-wrap gap-x-3 text-sm font-semibold uppercase tracking-wider text-ws-muted-fg">
            {article.category ? <span className="text-ws-primary">{article.category.label}</span> : null}
            {article.publishedAt ? <DateTime iso={article.publishedAt} mode="long" /> : null}
            {article.author ? <span>di {article.author}</span> : null}
          </p>
        ) : null}
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight md:text-5xl">{article.title}</h1>
        {article.excerpt ? <p className="mt-4 text-xl text-ws-muted-fg">{article.excerpt}</p> : null}
      </header>
      {props.showCover && cover ? <SiteImage image={{ ...cover, alt: cover.alt || article.title }} sizes="(min-width: 1024px) 800px, 100vw" className="mt-8 aspect-[16/9] w-full rounded-ws-lg" priority /> : null}
      {/* Corpo sanificato sul server a ogni salvataggio (`sanitizeWebsiteRichHtml`). */}
      <div className="ws-prose mt-8 text-lg" dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />
      {props.showGallery && article.gallery.length ? (
        <section className="mt-10" aria-label="Galleria">
          <Lightbox images={article.gallery.map((image) => ({ src: image.src, alt: image.alt }))}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {article.gallery.map((image, index) => (
                <a key={image.mediaId} href={image.src} data-lightbox-index={index} className="block overflow-hidden rounded-ws">
                  <SiteImage image={imageFromPublic(image)!} sizes="33vw" className="aspect-square w-full" maxWidth={828} />
                </a>
              ))}
            </div>
          </Lightbox>
        </section>
      ) : null}
      {props.showShare ? (
        <p className="mt-10 flex flex-wrap items-center gap-3 border-t border-ws-border pt-6 text-sm">
          <span className="font-semibold">Condividi:</span>
          <a className="ws-link" target="_blank" rel="noopener noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}>Facebook</a>
          <a className="ws-link" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${article.title} ${shareUrl}`)}`}>WhatsApp</a>
          <a className="ws-link" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/post?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(article.title)}`}>X</a>
          <a className="ws-link" href={`mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent(shareUrl)}`}>Email</a>
        </p>
      ) : null}
      {props.showRelated && article.related.length ? (
        <section className="mt-12" aria-labelledby="ws-related">
          <h2 id="ws-related" className="mb-6 font-heading text-2xl font-bold">Leggi anche</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {article.related.map((item) => <ArticleCard key={item.id} article={item} context={context} props={{}} />)}
          </div>
        </section>
      ) : null}
    </article>
  );
};

/* -------------------------------------------------------------- iscrizioni */

const formEmbedSrc = (href: string) => `${href}${href.includes("?") ? "&" : "?"}embed=1`;

export const RegistrationCtaRenderer: BlockRenderer = ({ props, context, data }) => {
  const form = dataOf<PublicRegistrationForm[]>(data, [])[0];
  const image = imageFromRef(props.image, context);
  const button = form ? (
    <a href={form.href} target="_blank" rel="noopener" className="ws-btn ws-btn-accent ws-btn-lg">
      {props.buttonLabel || "Compila il modulo"}
    </a>
  ) : context.mode === "preview" ? (
    <span className="ws-btn ws-btn-accent ws-btn-lg opacity-60" title="Scegli un modulo online pubblicato">{props.buttonLabel}</span>
  ) : null;
  const text = (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest opacity-90">{REGISTRATION_PURPOSE_LABELS[props.purpose as keyof typeof REGISTRATION_PURPOSE_LABELS] || ""}</p>
      <h2 className="mt-2 font-heading text-3xl font-bold md:text-4xl">{props.title}</h2>
      {props.text ? <p className="mt-3 text-lg opacity-90">{props.text}</p> : null}
      <div className="mt-6">{button}</div>
      {!form && context.mode === "preview" ? <p className="mt-3 text-xs">Anteprima: scegli un modulo online pubblicato con link pubblico attivo.</p> : null}
    </div>
  );
  if (props.layout === "split") {
    return (
      <div className="grid items-center gap-8 overflow-hidden rounded-ws-lg bg-ws-primary text-ws-primary-ink md:grid-cols-2">
        {image ? <SiteImage image={image} sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[4/3] h-full w-full" /> : <div aria-hidden="true" />}
        <div className="p-8 md:p-10">{text}</div>
      </div>
    );
  }
  return <div className={props.layout === "card" ? "rounded-ws-lg bg-ws-primary p-8 text-ws-primary-ink md:p-12" : "py-6"}>{text}</div>;
};

export const RegistrationFormRenderer: BlockRenderer = ({ props, context, data }) => {
  const form = dataOf<PublicRegistrationForm[]>(data, [])[0];
  if (!form) return <EmptyState hint="scegli un modulo online pubblicato con link pubblico attivo" context={context} />;
  let origin = "";
  try {
    origin = new URL(form.href).origin;
  } catch {
    origin = "";
  }
  return (
    <div>
      {props.title ? <h2 className="font-heading text-3xl font-bold">{props.title}</h2> : null}
      {props.text ? <p className="mt-2 text-lg text-ws-muted-fg">{props.text}</p> : null}
      <div className="mt-6">
        {props.mode === "link" || !origin ? (
          <a href={form.href} target="_blank" rel="noopener" className="ws-btn ws-btn-primary ws-btn-lg">{props.buttonLabel}</a>
        ) : (
          <FormEmbed src={formEmbedSrc(form.href)} origin={origin} title={form.title} initialHeight={props.height} />
        )}
      </div>
    </div>
  );
};

export const RegistrationFormsRenderer: BlockRenderer = ({ props, context, data }) => {
  const forms = dataOf<PublicRegistrationForm[]>(data, []);
  if (!forms.length) return <EmptyState hint="scegli i moduli online da mostrare" context={context} />;
  return (
    <div>
      <BlockTitle title={props.title} />
      <ul className={`grid gap-4 ${itemGridClasses({ desktop: Number(props.columns) || 2, tablet: Math.min(2, Number(props.columns) || 2) })}`}>
        {forms.map((form) => (
          <li key={form.slug} className="flex flex-col rounded-ws border border-ws-border bg-ws-bg p-6">
            <h3 className="font-heading text-xl font-bold">{form.title}</h3>
            {form.description ? <p className="mt-2 flex-1 text-ws-muted-fg">{form.description}</p> : <div className="flex-1" />}
            <a href={form.href} target="_blank" rel="noopener" className="ws-btn ws-btn-primary mt-5 self-start">Compila</a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const ContactFormRenderer: BlockRenderer = ({ props, context }) => (
  <div>
    {props.title ? <h2 className="font-heading text-2xl font-bold">{props.title}</h2> : null}
    {props.text ? <p className="mt-2 text-ws-muted-fg">{props.text}</p> : null}
    <div className="mt-6">
      <ContactForm
        topics={props.topics || []}
        askPhone={props.askPhone}
        privacyText={props.privacyText}
        successMessage={props.successMessage}
        buttonLabel={props.buttonLabel || "Invia"}
        sourcePath={context.currentPath}
        disabled={context.mode === "preview"}
      />
    </div>
  </div>
);

export { SiteButton };
