import "@/styles/website/site.css";
import type { Metadata } from "next";
import { WEBSITE_FONT_VARIABLES } from "@/components/website/render/fonts";

/**
 * **Il root layout del sito pubblico** (ADR-0200 §4).
 *
 * Il gestionale e il sito sono due alberi con due root layout distinti: il
 * gruppo `(app)` monta `AppClientProviders` — sessione, guscio, toast, tema —
 * e questo no. Un visitatore del dominio di un club non scarica il codice
 * dell'autenticazione, non fa nessuna chiamata di sessione e non vede niente
 * del gestionale: riceve HTML renderizzato sul server, il CSS del sito e le
 * poche isole client che un blocco dichiara (menu mobile, carosello).
 *
 * Il presidio e `tests/web/app-site-separation.test.mjs`: se un giorno questo
 * file importasse un provider del gestionale, il test fallirebbe.
 *
 * `lang` e il titolo vero li scrive la pagina con `generateMetadata`: qui c'e
 * solo cio che vale per ogni sito, cioe niente che nomini EasyGame.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SiteRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className={WEBSITE_FONT_VARIABLES}>
      <body className="ws-body">{children}</body>
    </html>
  );
}
