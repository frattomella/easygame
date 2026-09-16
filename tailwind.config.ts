import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Il fallback di sistema resta: se il font non arriva, la pagina
        // resta leggibile con le stesse metriche approssimate.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        // EGDS v3.1.0: Poppins e la voce del Web V2 (guideline 05 §5.3).
        brand: ["var(--font-poppins)", "Poppins", "system-ui", "sans-serif"],
      },
      /*
        Il livello di token web (src/styles/egw-tokens.css) esposto come
        utility: bg-egw-page, text-egw-ink-62, rounded-egw-panel,
        shadow-egw-plane-1. I valori restano nelle variabili CSS.
      */
      screens: {
        laptop: "1152px",
        wide: "1600px",
      },
      /*
        Le opacita del cielo (EGDS: testo al 72 %, controlli al 14 %, bordi al
        26 %...). Tailwind emette `text-white/NN` solo se NN sta nella scala:
        un valore fuori scala viene **scartato in silenzio** e l'elemento
        eredita l'inchiostro scuro della pagina — cosi le briciole e l'eyebrow
        della dashboard erano illeggibili sul cielo. La prova
        `tests/ui/uat-2-correzioni.test.mjs` vieta ogni `/NN` fuori da qui.
      */
      opacity: {
        12: "0.12",
        14: "0.14",
        16: "0.16",
        18: "0.18",
        22: "0.22",
        24: "0.24",
        26: "0.26",
        28: "0.28",
        42: "0.42",
        58: "0.58",
        62: "0.62",
        68: "0.68",
        72: "0.72",
        78: "0.78",
        82: "0.82",
      },
      colors: {
        egw: {
          page: "var(--egw-page)",
          "page-100": "var(--egw-page-100)",
          "page-050": "var(--egw-page-050)",
          "page-025": "var(--egw-page-025)",
          panel: "var(--egw-panel)",
          ink: "var(--egw-ink)",
          "ink-72": "var(--egw-ink-72)",
          "ink-62": "var(--egw-ink-62)",
          "ink-42": "var(--egw-ink-42)",
          blue: "var(--egw-blue)",
          "blue-700": "var(--egw-blue-700)",
          "blue-800": "var(--egw-blue-800)",
          indigo: "var(--egw-indigo)",
          "navy-800": "var(--egw-navy-800)",
          "navy-900": "var(--egw-navy-900)",
          green: "var(--egw-green)",
          amber: "var(--egw-amber)",
          "amber-ink": "var(--egw-amber-ink)",
          red: "var(--egw-red)",
          orange: "var(--egw-orange)",
          "tint-blue": "var(--egw-tint-blue)",
          "tint-blue-bd": "var(--egw-tint-blue-bd)",
          "tint-green": "var(--egw-tint-green)",
          "tint-green-bd": "var(--egw-tint-green-bd)",
          "tint-amber": "var(--egw-tint-amber)",
          "tint-amber-bd": "var(--egw-tint-amber-bd)",
          "tint-red": "var(--egw-tint-red)",
          "tint-red-bd": "var(--egw-tint-red-bd)",
          "tint-orange": "var(--egw-tint-orange)",
          "tint-orange-bd": "var(--egw-tint-orange-bd)",
          "row-hover": "var(--egw-row-hover)",
          "row-selected": "var(--egw-row-selected)",
          hairline: "var(--egw-hairline)",
          rule: "var(--egw-rule)",
          "field-border": "var(--egw-field-border)",
          "control-border": "var(--egw-control-border)",
          "panel-border": "var(--egw-panel-border)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        "egw-panel": "var(--egw-r-panel)",
        "egw-panel-sm": "var(--egw-r-panel-sm)",
        "egw-field": "var(--egw-r-field)",
        "egw-control": "var(--egw-r-control)",
        "egw-chip": "var(--egw-r-chip)",
        "egw-micro": "var(--egw-r-micro)",
        "egw-check": "var(--egw-r-check)",
        "egw-menu": "var(--egw-r-menu)",
        "egw-pill": "var(--egw-r-pill)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "egw-plane-1": "var(--egw-plane-1)",
        "egw-plane-2": "var(--egw-plane-2)",
        "egw-plane-menu": "var(--egw-plane-menu)",
        "egw-plane-drawer": "var(--egw-plane-drawer)",
        "egw-glow": "var(--egw-glow-action)",
        "egw-focus": "var(--egw-focus-ring)",
        "egw-focus-dark": "var(--egw-focus-ring-dark)",
        "egw-focus-danger": "var(--egw-focus-ring-danger)",
      },
      backgroundImage: {
        "egw-action": "var(--egw-grad-action)",
        "egw-sidebar": "var(--egw-grad-sidebar)",
        "egw-drawer": "var(--egw-grad-drawer)",
        "egw-match": "var(--egw-grad-match)",
        "egw-navy": "var(--egw-grad-navy)",
        "egw-hairline": "var(--egw-grad-hairline)",
      },
      transitionTimingFunction: {
        egw: "var(--egw-ease)",
      },
      transitionDuration: {
        hover: "90ms",
        press: "110ms",
        panel: "160ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
