import { resolveLinkHref } from "@/lib/website/links";
import type { NavItem } from "@/lib/website/navigation";
import { SOCIAL_LABELS, type SocialNetwork } from "@/lib/website/site-config";
import { Icon, SiteButton, SiteImage, imageFromPublic } from "./primitives";
import { MobileMenu, type MobileMenuItem } from "./islands/MobileMenu";
import { siteHref, type RenderContext } from "./context";

/**
 * L'intestazione del sito: logo, menu (con un livello di sottomenu), bottone,
 * social. Desktop e tablet usano solo HTML e CSS — il sottomenu si apre al
 * passaggio e al focus da tastiera (`:focus-within`) e con `<details>` al
 * tocco. Il telefono usa l'isola `MobileMenu`.
 */

const itemHref = (item: NavItem, context: RenderContext) => {
  const resolved = resolveLinkHref(item.link, context.links);
  if (!resolved) return null;
  return { href: resolved.external ? resolved.href : siteHref(context, resolved.href) || resolved.href, external: resolved.external, newTab: resolved.newTab };
};

const isCurrent = (item: NavItem, context: RenderContext) =>
  item.kind === "page" && item.link.pageId ? context.links.pagePaths[item.link.pageId] === context.currentPath : false;

export const SiteHeader = ({ context }: { context: RenderContext }) => {
  const { header, navigation, settings } = context.snapshot;
  const club = context.data.club;
  const dark = header.style === "dark" || header.style === "primary" || header.style === "transparent";
  const logo = imageFromPublic(dark && club.logoOnDark ? club.logoOnDark : club.logo);
  const background =
    header.style === "dark"
      ? "bg-ws-dark text-ws-dark-fg"
      : header.style === "primary"
        ? "bg-ws-primary text-ws-primary-ink"
        : header.style === "transparent"
          ? "absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-black/60 to-transparent text-white"
          : "bg-ws-bg text-ws-fg border-b border-ws-border";
  const sticky = header.sticky && header.style !== "transparent" ? "sticky top-0 z-40" : "";
  const homeHref = siteHref(context, "/") || "/";

  const mobileItems: MobileMenuItem[] = navigation.header.map((item) => {
    const link = item.kind === "group" ? null : itemHref(item, context);
    return {
      label: item.label,
      href: link?.href || null,
      external: link?.external,
      children: item.children.map((child) => {
        const childLink = itemHref(child, context);
        return { label: child.label, href: childLink?.href || null, external: childLink?.external };
      }),
    };
  });
  const ctaLink = header.cta ? resolveLinkHref(header.cta.link, context.links) : null;
  const social = Object.entries(club.social || {}).filter(([, url]) => Boolean(url)) as Array<[SocialNetwork, string]>;

  const brand = (
    <a href={homeHref} className="flex min-w-0 items-center gap-3" aria-label={`${club.name} — home`}>
      {logo ? <SiteImage image={{ ...logo, alt: "" }} sizes="64px" fit="contain" className="h-11 w-11 shrink-0 md:h-12 md:w-12" priority maxWidth={384} decorative /> : null}
      {header.showName || !logo ? (
        <span className="min-w-0">
          <span className="block truncate font-heading text-lg font-bold uppercase leading-tight md:text-xl">{club.name}</span>
          {settings.identity.tagline ? <span className="hidden text-xs opacity-80 md:block">{settings.identity.tagline}</span> : null}
        </span>
      ) : null}
    </a>
  );

  const nav = (
    <nav aria-label="Menu principale" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {navigation.header.map((item) => {
          const link = item.kind === "group" ? null : itemHref(item, context);
          const current = isCurrent(item, context);
          if (item.children.length) {
            return (
              <li key={item.id} className="group relative">
                <details className="[&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center gap-1 rounded-ws px-3 py-2 font-semibold hover:bg-black/10">
                    {item.label}
                    <Icon name="chevron-down" className="h-4 w-4" />
                  </summary>
                  <ul className="absolute right-0 top-full z-50 min-w-[14rem] rounded-ws border border-ws-border bg-ws-bg p-2 text-ws-fg shadow-xl">
                    {link ? (
                      <li><a href={link.href} className="block rounded-ws px-3 py-2 hover:bg-ws-muted">{item.label}</a></li>
                    ) : null}
                    {item.children.map((child) => {
                      const childLink = itemHref(child, context);
                      return childLink ? (
                        <li key={child.id}>
                          <a href={childLink.href} className="block rounded-ws px-3 py-2 hover:bg-ws-muted" target={childLink.newTab ? "_blank" : undefined} rel={childLink.external ? "noopener noreferrer" : undefined}>
                            {child.label}
                          </a>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </details>
              </li>
            );
          }
          return link ? (
            <li key={item.id}>
              <a href={link.href} aria-current={current ? "page" : undefined} className={`block rounded-ws px-3 py-2 font-semibold hover:bg-black/10 ${current ? "underline decoration-2 underline-offset-8" : ""}`} target={link.newTab ? "_blank" : undefined} rel={link.external ? "noopener noreferrer" : undefined}>
                {item.label}
              </a>
            </li>
          ) : null;
        })}
      </ul>
    </nav>
  );

  return (
    <header className={`${background} ${sticky}`}>
      {header.topBar && (club.email || club.phone || social.length) ? (
        <div className="hidden border-b border-white/10 bg-black/20 text-sm md:block">
          <div className="mx-auto flex max-w-ws-container items-center justify-between gap-4 px-6 py-1.5">
            <p className="flex gap-4">
              {club.phone ? <a href={`tel:${club.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:underline"><Icon name="phone" className="h-4 w-4" />{club.phone}</a> : null}
              {club.email ? <a href={`mailto:${club.email}`} className="inline-flex items-center gap-1 hover:underline"><Icon name="mail" className="h-4 w-4" />{club.email}</a> : null}
            </p>
            <p className="flex gap-3">
              {social.map(([network, url]) => (
                <a key={network} href={url} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABELS[network]} className="hover:opacity-80"><Icon name={network} className="h-4 w-4" /></a>
              ))}
            </p>
          </div>
        </div>
      ) : null}
      <div className={`mx-auto flex h-16 max-w-ws-container items-center gap-4 px-4 md:h-20 md:px-6 ${header.layout === "logo-center" ? "lg:grid lg:grid-cols-[1fr_auto_1fr]" : "justify-between"}`}>
        {header.layout === "logo-center" ? (
          <>
            <div className="hidden lg:block">{nav}</div>
            <div className="flex justify-center">{brand}</div>
            <div className="hidden items-center justify-end gap-3 lg:flex">
              {header.cta && ctaLink ? <SiteButton label={header.cta.label} link={header.cta.link} context={context} variant="accent" size="sm" /> : null}
            </div>
          </>
        ) : (
          <>
            {brand}
            <div className="flex items-center gap-3">
              {nav}
              {header.showSocial && !header.topBar ? (
                <span className="hidden gap-2 lg:flex">
                  {social.slice(0, 3).map(([network, url]) => (
                    <a key={network} href={url} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABELS[network]} className="rounded-full p-2 hover:bg-black/10"><Icon name={network} className="h-4 w-4" /></a>
                  ))}
                </span>
              ) : null}
              {header.cta && ctaLink ? <span className="hidden lg:inline-flex"><SiteButton label={header.cta.label} link={header.cta.link} context={context} variant="accent" size="sm" /></span> : null}
            </div>
          </>
        )}
        <MobileMenu
          items={mobileItems}
          tone={dark ? "dark" : "light"}
          cta={header.cta && ctaLink ? { label: header.cta.label, href: ctaLink.external ? ctaLink.href : siteHref(context, ctaLink.href) || ctaLink.href } : null}
        />
      </div>
    </header>
  );
};
