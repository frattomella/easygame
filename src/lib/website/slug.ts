/**
 * **Slug delle pagine** (ADR-0200 §3).
 *
 * Uno slug e un segmento solo, minuscolo, senza accenti: `chi-siamo`, non
 * `Chi Siamo/` ne `club/storia`. La home e lo slug vuoto e ce n'e una sola per
 * sito. Alcuni segmenti sono **riservati** perche il runtime li usa per se:
 * una pagina chiamata `api` o `sitemap.xml` oscurerebbe una rotta vera.
 *
 * L'unicita per sito la garantisce l'indice del database
 * (`website_pages_site_id_path_key`); qui c'e la forma.
 *
 * Modulo puro.
 */

export const MAX_SLUG_LENGTH = 80;

export const RESERVED_SLUGS = new Set([
  "api",
  "_next",
  "media",
  "assets",
  "static",
  "public",
  "site-render",
  "website-preview",
  "sitemap.xml",
  "robots.txt",
  "favicon.ico",
  "manifest.json",
  "feed",
  "rss",
  "login",
  "admin",
  "wp-admin",
  "well-known",
  ".well-known",
]);

export const slugify = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

export type SlugCheck = { ok: true; slug: string } | { ok: false; message: string };

/** Valida lo slug di una pagina. `""` e la home e la chiede chi la vuole. */
export const validatePageSlug = (value: unknown, options: { allowHome?: boolean } = {}): SlugCheck => {
  const raw = String(value ?? "").trim();
  if (raw === "" || raw === "/") {
    return options.allowHome ? { ok: true, slug: "" } : { ok: false, message: "Indica uno slug per la pagina" };
  }
  const slug = slugify(raw);
  if (!slug) return { ok: false, message: "Lo slug deve contenere almeno una lettera o una cifra" };
  if (slug !== raw.toLowerCase()) {
    /* Si accetta comunque la forma normalizzata: la mostra l'editor prima di salvare. */
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, message: `«${slug}» e un indirizzo riservato al sistema: scegline un altro` };
  }
  return { ok: true, slug };
};

/** Il percorso pubblico di una pagina. */
export const pagePathFromSlug = (slug: string) => (slug ? `/${slug}` : "/");

/** Uno slug unico rispetto a quelli dati, aggiungendo `-2`, `-3`… */
export const uniqueSlug = (base: string, taken: Iterable<string>) => {
  const set = new Set(taken);
  const root = slugify(base) || "pagina";
  if (!set.has(root) && !RESERVED_SLUGS.has(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - 4)}-${n}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
};

/**
 * Il percorso richiesto, ripulito: minuscolo, senza doppie barre, senza barra
 * finale. Restituisce i segmenti, gia decodificati.
 */
export const splitRequestPath = (segments: readonly string[] | undefined | null) =>
  (segments || [])
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);

/**
 * Lo slug di un elemento di dettaglio con identificativo:
 * `fortitudo-vs-stella-<32 cifre esadecimali>`. Il testo serve a chi legge e
 * ai motori di ricerca; l'identita e la coda, che non cambia se cambia il nome.
 */
export const detailSlug = (id: string, label: string) => {
  const hex = String(id).replace(/-/g, "").toLowerCase();
  const head = slugify(label).slice(0, 60);
  return head ? `${head}-${hex}` : hex;
};

const UUID_HEX = /([0-9a-f]{32})$/;

/** L'identificativo (UUID) in coda a uno slug di dettaglio, o `null`. */
export const detailSlugId = (slug: string) => {
  const match = String(slug || "").toLowerCase().match(UUID_HEX);
  if (!match) return null;
  const h = match[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
