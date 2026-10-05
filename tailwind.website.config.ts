import type { Config } from "tailwindcss";

/**
 * **La configurazione Tailwind del sito pubblico** (ADR-0200 §4).
 *
 * Separata da quella del gestionale per una ragione di peso: la scansione
 * guarda **solo** il renderer del sito e i token responsive del dominio, quindi
 * il CSS che arriva al visitatore contiene le classi che il sito usa davvero e
 * nessuna della dashboard. La carica `src/styles/website/site.css` con la
 * direttiva `@config`.
 *
 * I colori non sono classi fisse: sono variabili CSS del tema
 * (`--ws-primary`, …) che il layout del sito scrive dal documento pubblicato.
 */
const tokenColor = (name: string) => `rgb(var(--ws-${name}-rgb) / <alpha-value>)`;

const config = {
  content: [
    "./src/components/website/render/**/*.{ts,tsx}",
    "./src/lib/website/responsive.ts",
    "./src/lib/website/style-classes.ts",
  ],
  theme: {
    extend: {
      colors: {
        ws: {
          primary: tokenColor("primary"),
          "primary-ink": tokenColor("primary-ink"),
          secondary: tokenColor("secondary"),
          "secondary-ink": tokenColor("secondary-ink"),
          accent: tokenColor("accent"),
          "accent-ink": tokenColor("accent-ink"),
          bg: tokenColor("background"),
          fg: tokenColor("foreground"),
          muted: tokenColor("muted"),
          "muted-fg": tokenColor("muted-foreground"),
          border: tokenColor("border"),
          success: tokenColor("success"),
          warning: tokenColor("warning"),
          danger: tokenColor("danger"),
          dark: tokenColor("dark"),
          "dark-fg": tokenColor("dark-foreground"),
        },
      },
      fontFamily: {
        heading: ["var(--ws-font-heading)"],
        body: ["var(--ws-font-body)"],
      },
      borderRadius: {
        ws: "var(--ws-radius)",
        "ws-sm": "calc(var(--ws-radius) * 0.5)",
        "ws-lg": "calc(var(--ws-radius) * 1.5)",
      },
      maxWidth: {
        "ws-container": "var(--ws-container)",
        "ws-narrow": "calc(var(--ws-container) * 0.66)",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
