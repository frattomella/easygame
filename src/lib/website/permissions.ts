import { roleHasPermission } from "@/lib/permissions/catalog";

/**
 * **Chi puo fare cosa sul sito** (ADR-0200 §10).
 *
 * Le chiavi vivono nel catalogo unico (`src/lib/permissions/catalog.ts`,
 * dominio `website`) con la loro matrice per ruolo: questo modulo le elenca
 * per tipo e le interroga **solo** con `roleHasPermission`, che applica gia il
 * restringimento dei ruoli personalizzati. Nessuna matrice privata, quindi
 * nessun bisogno di `narrowDomainPermission`.
 *
 * `website.domain.manage` ha come soli ruoli `owner`: un ruolo personalizzato
 * non puo avere `owner` come base, quindi non puo contenerla — e la chiave
 * **non delegabile** che il mandato chiede, senza un'eccezione scritta altrove.
 *
 * Modulo puro.
 */

export const WEBSITE_PERMISSIONS = [
  "website.read",
  "website.edit",
  "website.pages.manage",
  "website.navigation.manage",
  "website.blog.manage",
  "website.media.manage",
  "website.sponsors.manage",
  "website.theme.manage",
  "website.seo.manage",
  "website.people.manage",
  "website.settings.manage",
  "website.publish",
  "website.domain.manage",
] as const;

export type WebsitePermission = (typeof WEBSITE_PERMISSIONS)[number];

export const WEBSITE_PERMISSION_LABELS: Record<WebsitePermission, string> = {
  "website.read": "Vedere il sito della societa nel gestionale e la sua anteprima",
  "website.edit": "Modificare i contenuti delle pagine del sito",
  "website.pages.manage": "Creare, rinominare, duplicare ed eliminare le pagine del sito",
  "website.navigation.manage": "Modificare i menu del sito",
  "website.blog.manage": "Scrivere e pubblicare le news del sito",
  "website.media.manage": "Caricare e gestire le immagini del sito",
  "website.sponsors.manage": "Scegliere quali sponsor compaiono sul sito e come",
  "website.theme.manage": "Cambiare tema, colori, caratteri, intestazione e piede del sito",
  "website.seo.manage": "Modificare titoli, descrizioni e indicizzazione delle pagine del sito",
  "website.people.manage": "Decidere quali atleti e quali membri dello staff compaiono sul sito, e con quali dati",
  "website.settings.manage": "Modificare le impostazioni generali e i dati di identita del sito",
  "website.publish": "Pubblicare il sito e ripristinare una versione precedente",
  "website.domain.manage": "Collegare, verificare e rimuovere il dominio del sito",
};

export const hasWebsitePermission = (role: string | null | undefined, permission: WebsitePermission) =>
  roleHasPermission(role, permission);

/** Il messaggio contiene «Accesso negato»: il route handler lo mappa su 403. */
export const assertWebsitePermission = (role: string | null | undefined, permission: WebsitePermission) => {
  if (!hasWebsitePermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${WEBSITE_PERMISSION_LABELS[permission].charAt(0).toLowerCase()}${WEBSITE_PERMISSION_LABELS[permission].slice(1)}`,
    );
  }
};

export const listWebsitePermissions = (role: string | null | undefined) =>
  WEBSITE_PERMISSIONS.filter((permission) => hasWebsitePermission(role, permission));
