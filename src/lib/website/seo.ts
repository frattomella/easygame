import type { SiteSnapshot, SnapshotPage } from "./publishing/snapshot";
import type { PublicArticle, PublicClubInfo, PublicMatch, PublicPerson, PublicTeam, DatasourceResult } from "./public-dto";
import { WEBSITE_MEDIA_ENDPOINT } from "@/lib/rich-text/sanitize";

/**
 * **Titolo, descrizione, canonical, OpenGraph e dati strutturati** (ADR-0200).
 *
 * SEO globale + SEO della pagina + contenuto di dettaglio (l'articolo, la
 * gara, la squadra dell'indirizzo). Il canonical e sempre sul **dominio
 * principale**, anche quando si visita un dominio secondario. I dati
 * strutturati descrivono solo cio che il sito sa davvero: niente
 * `SportsEvent` con un risultato inventato, niente persona con dati che la
 * policy non ha lasciato passare.
 *
 * Modulo puro.
 */

export type ResolvedSeo = {
  title: string;
  description: string;
  canonical: string;
  image: string | null;
  imageAlt: string;
  noindex: boolean;
  type: "website" | "article" | "profile";
  publishedAt?: string;
};

const absolute = (origin: string, path: string | null | undefined) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
};

const mediaUrl = (origin: string, mediaId: string | null | undefined) =>
  mediaId ? absolute(origin, `/_next/image?url=${encodeURIComponent(`${WEBSITE_MEDIA_ENDPOINT}/${mediaId}`)}&w=1200&q=80`) : null;

const fill = (template: string, title: string, site: string) =>
  title === site ? site : template.replace("%s", title).replace("{site}", site);

export type DetailSeoSource =
  | { kind: "article"; article: PublicArticle }
  | { kind: "match"; match: PublicMatch }
  | { kind: "team"; team: PublicTeam }
  | { kind: "player"; person: PublicPerson }
  | null;

export const resolvePageSeo = (input: {
  snapshot: SiteSnapshot;
  page: SnapshotPage;
  club: PublicClubInfo;
  origin: string;
  path: string;
  detail: DetailSeoSource;
}): ResolvedSeo => {
  const { snapshot, page, club, origin, path, detail } = input;
  const siteName = club.name;
  let title = page.seo.title || (page.kind === "home" ? siteName : page.title);
  let description = page.seo.description || snapshot.seo.defaultDescription || club.description || club.tagline || "";
  let image = mediaUrl(origin, page.seo.socialImage?.mediaId) || mediaUrl(origin, snapshot.seo.socialImage?.mediaId);
  let imageAlt = page.seo.socialImage?.alt || siteName;
  let type: ResolvedSeo["type"] = "website";
  let publishedAt: string | undefined;
  let noindex = Boolean(page.seo.noindex || snapshot.seo.noindex);
  let canonical = page.seo.canonical || absolute(origin, path) || origin;

  if (detail?.kind === "article") {
    title = detail.article.seo.title || detail.article.title;
    description = detail.article.seo.description || detail.article.excerpt || description;
    image = detail.article.seo.image ? absolute(origin, `/_next/image?url=${encodeURIComponent(detail.article.seo.image.src)}&w=1200&q=80`) : image;
    imageAlt = detail.article.seo.image?.alt || detail.article.title;
    type = "article";
    publishedAt = detail.article.publishedAt;
    noindex = noindex || detail.article.seo.noindex;
    canonical = detail.article.seo.canonical || canonical;
  } else if (detail?.kind === "match") {
    const match = detail.match;
    title = `${match.home.name} – ${match.away.name}`;
    description = match.result
      ? `Risultato ${match.result.home}-${match.result.away}${match.competition ? `, ${match.competition.name}` : ""}.`
      : `Gara${match.competition ? ` di ${match.competition.name}` : ""}${match.venue ? ` a ${match.venue.name}` : ""}.`;
  } else if (detail?.kind === "team") {
    title = detail.team.name;
    description = detail.team.description || `${detail.team.name}${detail.team.seasonLabel ? `, stagione ${detail.team.seasonLabel}` : ""}: rosa, calendario e risultati.`;
    image = detail.team.photo ? absolute(origin, `/_next/image?url=${encodeURIComponent(detail.team.photo.src)}&w=1200&q=80`) : image;
  } else if (detail?.kind === "player") {
    title = detail.person.displayName;
    description = [detail.person.role, detail.person.teams[0]?.name].filter(Boolean).join(" · ") || description;
    type = "profile";
  }

  return {
    title: fill(snapshot.seo.titleTemplate, title, siteName).slice(0, 120),
    description: String(description || "").slice(0, 300),
    canonical,
    image,
    imageAlt,
    noindex,
    type,
    publishedAt,
  };
};

/** I dati strutturati della pagina (JSON-LD), solo con dati veri. */
export const buildStructuredData = (input: {
  club: PublicClubInfo;
  origin: string;
  path: string;
  detail: DetailSeoSource;
  isHome: boolean;
}): Array<Record<string, unknown>> => {
  const { club, origin, path, detail, isHome } = input;
  const out: Array<Record<string, unknown>> = [];
  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: club.name,
    url: origin,
  };
  if (club.logo?.src) organization.logo = absolute(origin, club.logo.src);
  if (club.email) organization.email = club.email;
  if (club.phone) organization.telephone = club.phone;
  if (club.address || club.city) {
    organization.address = {
      "@type": "PostalAddress",
      streetAddress: club.address || undefined,
      postalCode: club.postalCode || undefined,
      addressLocality: club.city || undefined,
      addressRegion: club.province || undefined,
      addressCountry: "IT",
    };
  }
  if (club.foundedYear) organization.foundingDate = String(club.foundedYear);
  const sameAs = Object.values(club.social || {}).filter(Boolean);
  if (sameAs.length) organization.sameAs = sameAs;
  if (club.sports.length) organization.sport = club.sports;
  if (isHome) out.push(organization);

  if (detail?.kind === "article") {
    out.push({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: detail.article.title,
      datePublished: detail.article.publishedAt,
      author: detail.article.author ? { "@type": "Person", name: detail.article.author } : { "@type": "Organization", name: club.name },
      publisher: { "@type": "Organization", name: club.name },
      mainEntityOfPage: absolute(origin, path),
      ...(detail.article.cover ? { image: [absolute(origin, detail.article.cover.src)] } : {}),
    });
  }
  if (detail?.kind === "match") {
    const match = detail.match;
    const event: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${match.home.name} – ${match.away.name}`,
      startDate: match.startsAt,
      eventStatus: match.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
      homeTeam: { "@type": "SportsTeam", name: match.home.name },
      awayTeam: { "@type": "SportsTeam", name: match.away.name },
      organizer: { "@type": "SportsOrganization", name: club.name, url: origin },
    };
    if (match.venue) event.location = { "@type": "Place", name: match.venue.name, ...(match.venue.address ? { address: match.venue.address } : {}) };
    out.push(event);
  }
  if (detail?.kind === "team") {
    out.push({ "@context": "https://schema.org", "@type": "SportsTeam", name: detail.team.name, parentOrganization: { "@type": "SportsOrganization", name: club.name } });
  }
  return out;
};

/** Il contenuto di dettaglio di una pagina, dai risultati gia risolti. */
export const detailFromResults = (
  detail: "article" | "team" | "match" | "player" | "event" | null,
  results: Record<string, DatasourceResult<unknown>>,
): DetailSeoSource => {
  if (!detail) return null;
  for (const result of Object.values(results)) {
    if (result.status !== "ok") continue;
    const data = result.data as any;
    if (detail === "article" && data?.bodyHtml !== undefined) return { kind: "article", article: data };
    if (detail === "match" && data?.match?.home) return { kind: "match", match: data.match };
    if (detail === "team" && data?.slug && data?.rosterCount !== undefined) return { kind: "team", team: data };
    if (detail === "player" && data?.displayName && data?.kind === "athlete") return { kind: "player", person: data };
  }
  return null;
};
