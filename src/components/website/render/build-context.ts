import type { PageData } from "@/lib/server/website/page-data";
import type { SiteSnapshot, SnapshotPage } from "@/lib/website/publishing/snapshot";
import type { PageContext } from "@/lib/website/datasources/contracts";
import type { RenderContext } from "./context";

/**
 * Costruisce il contesto di render dalla pagina risolta. L'origine dei moduli
 * online e quella del gestionale: un modulo di iscrizione resta sul dominio di
 * EasyGame, dove vive il suo flusso (ADR-0189), anche quando lo si apre dal
 * sito del club.
 */
export const buildRenderContext = (input: {
  snapshot: SiteSnapshot;
  page: SnapshotPage;
  data: PageData;
  pageContext: PageContext;
  mode: "public" | "preview";
  origin: string;
  currentPath: string;
  pathPrefix?: string;
}): RenderContext => ({
  snapshot: input.snapshot,
  data: input.data,
  pageContext: input.pageContext,
  pageKind: input.page.kind,
  mode: input.mode,
  origin: input.origin,
  currentPath: input.currentPath,
  now: new Date().toISOString(),
  links: {
    pagePaths: Object.fromEntries(
      input.snapshot.pages.filter((page) => !page.path.endsWith("/*")).map((page) => [page.id, page.path]),
    ),
    formsOrigin: (process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_BASE_URL || "").replace(/\/+$/, ""),
    pathPrefix: input.pathPrefix || "",
  },
});
