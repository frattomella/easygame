import { themeToCssVariables } from "@/lib/website/theme/theme";
import type { SnapshotPage } from "@/lib/website/publishing/snapshot";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { PageSections } from "./SiteSections";
import { RevealObserver } from "./islands/RevealObserver";
import type { RenderContext } from "./context";

/**
 * **Una pagina del sito**, completa: variabili del tema, collegamento a
 * salto, intestazione, contenuto, piede. Lo stesso componente serve il
 * pubblico e l'anteprima dell'editor: cambia solo `context.mode`.
 */
export const SiteDocument = ({
  page,
  context,
  structuredData,
  previewProbe,
}: {
  page: SnapshotPage;
  context: RenderContext;
  structuredData?: Array<Record<string, unknown>>;
  previewProbe?: React.ReactNode;
}) => {
  const variables = themeToCssVariables(context.snapshot.theme) as React.CSSProperties;
  return (
    <div style={variables} className="ws-body flex min-h-screen flex-col" lang={context.snapshot.settings.identity.language}>
      <a href="#ws-content" className="ws-skip-link">Vai al contenuto</a>
      <SiteHeader context={context} />
      <main id="ws-content" className="flex-1">
        <PageSections document={page.document} context={context} />
      </main>
      <SiteFooter context={context} />
      <RevealObserver />
      {structuredData?.map((item, index) => (
        <script
          key={index}
          type="application/ld+json"
          /* JSON serializzato dal server, con `<` sostituito: non puo chiudere lo script. */
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, "\\u003c") }}
        />
      ))}
      {previewProbe}
    </div>
  );
};
