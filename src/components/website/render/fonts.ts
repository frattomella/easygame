import {
  Archivo,
  Barlow_Condensed,
  Inter,
  Lora,
  Montserrat,
  Oswald,
  Playfair_Display,
  Poppins,
  Roboto_Slab,
  Source_Sans_3,
} from "next/font/google";

/**
 * **L'unico punto in cui il sito carica caratteri** (ADR-0200 §8).
 *
 * Il catalogo e `src/lib/website/theme/fonts.ts`; qui c'e solo la parte che
 * `next/font` pretende statica. Ogni voce e self-hosted, senza
 * precaricamento: il browser scarica il file soltanto se il tema lo usa, e il
 * tema ne usa due. Un blocco non dichiara mai un carattere: legge
 * `--ws-font-heading` e `--ws-font-body`.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--wsf-inter" });
const poppins = Poppins({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700", "800"], variable: "--wsf-poppins" });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", preload: false, variable: "--wsf-montserrat" });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false, variable: "--wsf-oswald" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], display: "swap", preload: false, weight: ["500", "600", "700", "800"], variable: "--wsf-barlow-condensed" });
const archivo = Archivo({ subsets: ["latin"], display: "swap", preload: false, variable: "--wsf-archivo" });
const robotoSlab = Roboto_Slab({ subsets: ["latin"], display: "swap", preload: false, variable: "--wsf-roboto-slab" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--wsf-playfair" });
const lora = Lora({ subsets: ["latin"], display: "swap", preload: false, variable: "--wsf-lora" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap", preload: false, variable: "--wsf-source-sans" });

export const WEBSITE_FONT_VARIABLES = [
  inter.variable,
  poppins.variable,
  montserrat.variable,
  oswald.variable,
  barlowCondensed.variable,
  archivo.variable,
  robotoSlab.variable,
  playfair.variable,
  lora.variable,
  sourceSans.variable,
].join(" ");
