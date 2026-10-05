/**
 * **Le azioni di audit del modulo Website** (ADR-0200 §10).
 *
 * Un file a parte, come `src/lib/sport-work/audit-actions.ts`: le azioni
 * hanno la forma `website.qualcosa` come le chiavi di permesso, e il presidio
 * del catalogo (`tests/lib/catalogo-permessi.test.mjs`) le riconosce come
 * catalogo di audit invece di scambiarle per permessi sconosciuti.
 */
export const WEBSITE_AUDIT_ACTIONS = {
  siteCreated: "website.site.created",
  themeChanged: "website.theme.changed",
  settingsChanged: "website.settings.changed",
  pageCreated: "website.page.created",
  pageDeleted: "website.page.deleted",
  pageSlugChanged: "website.page.slug_changed",
  published: "website.site.published",
  rolledBack: "website.site.rolled_back",
  unpublished: "website.site.unpublished",
  domainAdded: "website.domain.added",
  domainVerified: "website.domain.verified",
  domainRemoved: "website.domain.removed",
  domainPrimary: "website.domain.primary_set",
  personPublication: "website.person.publication_changed",
  articlePublished: "website.article.published",
  articleDeleted: "website.article.deleted",
  mediaDeleted: "website.media.deleted",
  sponsorShowcase: "website.sponsor.showcase_changed",
} as const;
