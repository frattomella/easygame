import { resolveLinkHref } from "@/lib/website/links";
import { SOCIAL_LABELS, type SocialNetwork } from "@/lib/website/site-config";
import type { PublicSponsor } from "@/lib/website/public-dto";
import { Icon, SiteImage, imageFromPublic, formatClubAddress } from "./primitives";
import { siteHref, type RenderContext } from "./context";

/**
 * Il piede del sito: logo, descrizione, contatti e indirizzo (sempre
 * dall'anagrafica, salvo gli override del sito), menu, social, fascia sponsor,
 * collegamenti legali e ragione sociale con partita IVA — un dato pubblico per
 * legge, non personale.
 */
export const SiteFooter = ({ context }: { context: RenderContext }) => {
  const { footer, navigation, settings } = context.snapshot;
  const club = context.data.club;
  const style =
    footer.style === "light" ? "bg-ws-muted text-ws-fg" : footer.style === "primary" ? "bg-ws-primary text-ws-primary-ink" : "bg-ws-dark text-ws-dark-fg";
  const logo = imageFromPublic(footer.style === "light" ? club.logo : club.logoOnDark || club.logo);
  const social = Object.entries(club.social || {}).filter(([, url]) => Boolean(url)) as Array<[SocialNetwork, string]>;
  const sponsors: PublicSponsor[] =
    footer.showSponsors && context.data.footerSponsors && (context.data.footerSponsors.status === "ok" || context.data.footerSponsors.status === "empty")
      ? ((context.data.footerSponsors as any).data as PublicSponsor[])
      : [];
  const address = formatClubAddress(club);
  const legal = (pageId: string | null, label: string) => {
    const path = pageId ? context.links.pagePaths[pageId] : null;
    return path ? <a href={siteHref(context, path) || path} className="hover:underline">{label}</a> : null;
  };
  const year = new Date(context.now).getFullYear();
  const copyright = settings.identity.copyright || `© ${year} ${club.legalName || club.name}`;

  return (
    <footer className={style}>
      {sponsors.length ? (
        <div className="border-b border-black/10 bg-white py-8 text-ws-fg">
          <ul className="mx-auto flex max-w-ws-container flex-wrap items-center justify-center gap-x-10 gap-y-6 px-6">
            {sponsors.map((sponsor) => {
              const image = imageFromPublic(sponsor.logo);
              const content = image ? <SiteImage image={{ ...image, alt: image.alt || sponsor.name }} sizes="160px" fit="contain" className="h-10 w-auto max-w-[9rem] md:h-12" maxWidth={384} /> : <span className="font-semibold">{sponsor.name}</span>;
              return (
                <li key={sponsor.id}>
                  {sponsor.url ? <a href={sponsor.url} target="_blank" rel="noopener noreferrer sponsored" aria-label={sponsor.name}>{content}</a> : content}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="mx-auto grid max-w-ws-container gap-10 px-6 py-12 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          {footer.showLogo && logo ? <SiteImage image={{ ...logo, alt: club.name }} sizes="96px" fit="contain" className="mb-4 h-16 w-16" maxWidth={384} /> : null}
          <p className="font-heading text-xl font-bold uppercase">{club.name}</p>
          {footer.showDescription && (settings.identity.description || club.tagline) ? <p className="mt-3 max-w-md text-sm opacity-90">{settings.identity.description || club.tagline}</p> : null}
          {footer.showSocial && social.length ? (
            <ul className="mt-5 flex gap-3">
              {social.map(([network, url]) => (
                <li key={network}>
                  <a href={url} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABELS[network]} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/20 hover:bg-black/30">
                    <Icon name={network} className="h-5 w-5" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {navigation.footer.length ? (
          <nav aria-label="Menu del piede">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider opacity-80">Collegamenti</p>
            <ul className="space-y-2">
              {navigation.footer.map((item) => {
                const resolved = resolveLinkHref(item.link, context.links);
                return resolved ? (
                  <li key={item.id}>
                    <a href={resolved.external ? resolved.href : siteHref(context, resolved.href) || resolved.href} className="hover:underline" target={resolved.newTab ? "_blank" : undefined} rel={resolved.external ? "noopener noreferrer" : undefined}>
                      {item.label}
                    </a>
                  </li>
                ) : null;
              })}
            </ul>
          </nav>
        ) : <div />}
        {footer.showContacts || footer.showAddress ? (
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider opacity-80">Contatti</p>
            <ul className="space-y-2 text-sm">
              {footer.showAddress && address ? <li className="flex gap-2"><Icon name="map-pin" className="mt-0.5 h-4 w-4 shrink-0" />{address}</li> : null}
              {footer.showContacts && club.email ? <li className="flex gap-2"><Icon name="mail" className="mt-0.5 h-4 w-4 shrink-0" /><a href={`mailto:${club.email}`} className="hover:underline">{club.email}</a></li> : null}
              {footer.showContacts && club.phone ? <li className="flex gap-2"><Icon name="phone" className="mt-0.5 h-4 w-4 shrink-0" /><a href={`tel:${club.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">{club.phone}</a></li> : null}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="border-t [border-color:color-mix(in_srgb,currentColor_15%,transparent)]">
        <div className="mx-auto flex max-w-ws-container flex-col gap-2 px-6 py-5 text-xs opacity-80 md:flex-row md:items-center md:justify-between">
          <p>
            {copyright}
            {footer.showLegalIdentity && club.vatNumber ? ` · P.IVA ${club.vatNumber}` : footer.showLegalIdentity && club.fiscalCode ? ` · C.F. ${club.fiscalCode}` : ""}
          </p>
          <p className="flex gap-4">
            {legal(footer.privacyPageId, "Privacy")}
            {legal(footer.cookiePageId, "Cookie")}
          </p>
        </div>
      </div>
    </footer>
  );
};
