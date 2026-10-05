import type { PageData } from "@/lib/server/website/page-data";
import type { SiteSnapshot } from "@/lib/website/publishing/snapshot";
import type { PageContext } from "@/lib/website/datasources/contracts";
import type { LinkResolverContext } from "@/lib/website/links";
import type { PageKind } from "@/lib/website/registry";

/**
 * **Cio che ogni componente del sito riceve** (ADR-0200 §22).
 *
 * Il renderer e fatto di componenti server: nessun contesto React, nessuno
 * stato. Ogni blocco riceve questo oggetto, che contiene lo snapshot
 * pubblicato (o la bozza in anteprima), i dati gia risolti della pagina e le
 * regole per costruire i collegamenti. Niente qui permette a un blocco di
 * interrogare il database.
 */
export type RenderContext = {
  snapshot: SiteSnapshot;
  data: PageData;
  pageContext: PageContext;
  pageKind: PageKind;
  mode: "public" | "preview";
  links: LinkResolverContext;
  /** L'origine canonica del sito (`https://www.club.it`), per gli URL assoluti. */
  origin: string;
  /** Il percorso della pagina corrente, senza prefisso. */
  currentPath: string;
  now: string;
};

/** Un percorso interno del sito, con il prefisso dell'anteprima quando serve. */
export const siteHref = (context: RenderContext, path: string | null | undefined) => {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const prefix = context.links.pathPrefix || "";
  if (!prefix) return path;
  return path === "/" ? prefix || "/" : `${prefix}${path}`;
};

export const isPreview = (context: RenderContext) => context.mode === "preview";
