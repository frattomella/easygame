import "./globals.css";
import { Archivo, Inter } from "next/font/google";
import { AppClientProviders } from "@/components/providers/AppClientProviders";

/**
 * Due ruoli soltanto.
 *
 * `Inter` per il testo e soprattutto per i dati: un gestionale e fatto di
 * tabelle di date, importi e numeri di maglia, e le cifre tabellari sono la
 * differenza fra colonne allineate e colonne che ballano.
 * `Archivo` per i titoli: stretta e squadrata, e la voce della segnaletica
 * sportiva, e resta leggibile anche compressa.
 *
 * Sono self-hosted da `next/font`: nessuna richiesta a Google a runtime e
 * nessun salto di layout al primo render.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata = {
  title: {
    default: "EasyGame",
    template: "%s · EasyGame",
  },
  description:
    "Il registro della tua societa sportiva: atleti, certificati, quote e programma settimanale.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="it"
      className={`light ${inter.variable} ${archivo.variable}`}
      suppressHydrationWarning
    >
      <head suppressHydrationWarning />
      <body
        className="bg-slate-50 font-sans text-slate-900 antialiased"
        suppressHydrationWarning
      >
        <AppClientProviders>{children}</AppClientProviders>
      </body>
    </html>
  );
}
