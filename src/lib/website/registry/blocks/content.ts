import { z } from "zod";
import { defineBlock } from "../types";
import {
  BUTTON_SIZE_OPTIONS,
  BUTTON_SIZES,
  BUTTON_VARIANT_OPTIONS,
  BUTTON_VARIANTS,
  COLUMN_OPTIONS,
  ICON_KEYS,
  bool,
  choice,
  html,
  int,
  link,
  list,
  media,
  mediaList,
  text,
} from "../fields";
import { EMBED_PROVIDERS, VIDEO_PROVIDERS } from "../../embed";

/**
 * Blocchi generici: struttura, testi, immagini, inviti all'azione. Nessuno di
 * questi legge dati del gestionale; il loro contenuto e scritto dal club.
 */

const TEXT_STYLE = {
  responsive: ["paddingTop", "paddingBottom", "align", "textSize"] as const,
  static: ["animation"] as const,
  defaults: { paddingTop: "none", paddingBottom: "sm", align: "left" } as const,
};

const MEDIA_STYLE = {
  responsive: ["paddingTop", "paddingBottom", "align"] as const,
  static: ["radius", "animation"] as const,
  defaults: { paddingTop: "none", paddingBottom: "sm", align: "center" } as const,
};

const GRID_STYLE = {
  responsive: ["paddingTop", "paddingBottom", "gap", "align"] as const,
  static: ["animation", "radius"] as const,
  defaults: { paddingTop: "none", paddingBottom: "sm", gap: "md", align: "left" } as const,
};

const ctaShape = () =>
  z.unknown().transform((value) => {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const label = typeof record.label === "string" ? record.label.trim().slice(0, 40) : "";
    return { label, link: link().parse(record.link) };
  });

const ICON_OPTIONS = ICON_KEYS.map((key) => ({ value: key, label: key }));

const SPACING_HEIGHT = [
  { value: "sm", label: "Bassa" },
  { value: "md", label: "Media" },
  { value: "lg", label: "Alta" },
] as const;

export const heroBlock = defineBlock({
  type: "hero",
  category: "layout",
  label: "Hero",
  description: "Apertura a tutta larghezza con titolo, immagine e bottoni.",
  icon: "panel-top",
  version: 1,
  schema: z.object({
    variant: choice(["image-background", "split", "plain"] as const, "image-background"),
    eyebrow: text(60),
    title: text(140, "Il titolo della tua pagina"),
    subtitle: text(400),
    image: media(),
    height: choice(["sm", "md", "lg", "full"] as const, "lg"),
    overlay: int(0, 80, 45),
    primaryCta: ctaShape(),
    secondaryCta: ctaShape(),
  }),
  defaults: {
    variant: "image-background",
    eyebrow: "",
    title: "Il titolo della tua pagina",
    subtitle: "",
    image: null,
    height: "lg",
    overlay: 45,
    primaryCta: { label: "", link: { kind: "none" } },
    secondaryCta: { label: "", link: { kind: "none" } },
  },
  controls: [
    { type: "segmented", key: "variant", label: "Forma", options: [
      { value: "image-background", label: "Immagine di fondo" },
      { value: "split", label: "Divisa" },
      { value: "plain", label: "Solo testo" },
    ] },
    { type: "text", key: "eyebrow", label: "Occhiello", max: 60 },
    { type: "text", key: "title", label: "Titolo", max: 140 },
    { type: "textarea", key: "subtitle", label: "Sottotitolo", max: 400, rows: 3 },
    { type: "media", key: "image", label: "Immagine", when: { key: "variant", notEquals: "plain" } },
    { type: "segmented", key: "height", label: "Altezza", group: "display", options: [
      { value: "sm", label: "Bassa" },
      { value: "md", label: "Media" },
      { value: "lg", label: "Alta" },
      { value: "full", label: "Schermo" },
    ] },
    { type: "number", key: "overlay", label: "Oscuramento immagine", min: 0, max: 80, step: 5, unit: "%", group: "display", when: { key: "variant", equals: "image-background" } },
    { type: "cta", key: "primaryCta", label: "Bottone principale" },
    { type: "cta", key: "secondaryCta", label: "Bottone secondario" },
  ],
  style: { responsive: ["align", "paddingTop", "paddingBottom"], static: ["animation"], defaults: { align: "left", paddingTop: "none", paddingBottom: "none" } },
  keywords: ["copertina", "apertura", "banner"],
});

export const headingBlock = defineBlock({
  type: "heading",
  category: "content",
  label: "Titolo",
  description: "Un titolo con occhiello e sottotitolo facoltativi.",
  icon: "heading",
  version: 1,
  schema: z.object({
    eyebrow: text(60),
    text: text(160, "Titolo della sezione"),
    subtitle: text(400),
    level: choice(["h1", "h2", "h3", "h4"] as const, "h2"),
    size: choice(["sm", "md", "lg", "xl"] as const, "lg"),
  }),
  defaults: { eyebrow: "", text: "Titolo della sezione", subtitle: "", level: "h2", size: "lg" },
  controls: [
    { type: "text", key: "eyebrow", label: "Occhiello", max: 60 },
    { type: "text", key: "text", label: "Titolo", max: 160 },
    { type: "textarea", key: "subtitle", label: "Sottotitolo", max: 400, rows: 2 },
    { type: "segmented", key: "level", label: "Livello", group: "display", help: "Uno solo H1 per pagina: e il titolo che leggono i motori di ricerca.", options: [
      { value: "h1", label: "H1" },
      { value: "h2", label: "H2" },
      { value: "h3", label: "H3" },
      { value: "h4", label: "H4" },
    ] },
    { type: "segmented", key: "size", label: "Dimensione", group: "display", options: [
      { value: "sm", label: "S" },
      { value: "md", label: "M" },
      { value: "lg", label: "L" },
      { value: "xl", label: "XL" },
    ] },
  ],
  style: TEXT_STYLE,
  keywords: ["titolo", "intestazione"],
});

export const richTextBlock = defineBlock({
  type: "rich-text",
  category: "content",
  label: "Testo",
  description: "Testo formattato: paragrafi, elenchi, collegamenti, tabelle.",
  icon: "text",
  version: 1,
  schema: z.object({ html: html() }),
  defaults: { html: "<p>Scrivi qui il testo della sezione.</p>" },
  controls: [{ type: "richtext", key: "html", label: "Testo" }],
  style: { ...TEXT_STYLE, responsive: ["paddingTop", "paddingBottom", "align", "textSize"] },
  keywords: ["paragrafo", "testo", "articolo"],
});

export const imageBlock = defineBlock({
  type: "image",
  category: "media",
  label: "Immagine",
  description: "Un'immagine con testo alternativo, didascalia e collegamento.",
  icon: "image",
  version: 1,
  schema: z.object({
    image: media(),
    caption: text(240),
    width: choice(["full", "wide", "medium", "small"] as const, "full"),
    aspect: choice(["auto", "16:9", "4:3", "1:1", "3:4", "21:9"] as const, "auto"),
    fit: choice(["cover", "contain"] as const, "cover"),
    loading: choice(["lazy", "eager"] as const, "lazy"),
    link: link(),
  }),
  defaults: { image: null, caption: "", width: "full", aspect: "auto", fit: "cover", loading: "lazy", link: { kind: "none" } },
  controls: [
    { type: "media", key: "image", label: "Immagine", help: "Il testo alternativo descrive l'immagine a chi non la vede: e obbligatorio per pubblicare." },
    { type: "text", key: "caption", label: "Didascalia", max: 240 },
    { type: "segmented", key: "width", label: "Larghezza", group: "display", options: [
      { value: "full", label: "Piena" },
      { value: "wide", label: "Ampia" },
      { value: "medium", label: "Media" },
      { value: "small", label: "Piccola" },
    ] },
    { type: "select", key: "aspect", label: "Proporzioni", group: "display", options: [
      { value: "auto", label: "Originali" },
      { value: "16:9", label: "16:9" },
      { value: "4:3", label: "4:3" },
      { value: "1:1", label: "Quadrata" },
      { value: "3:4", label: "Verticale 3:4" },
      { value: "21:9", label: "Panoramica 21:9" },
    ] },
    { type: "segmented", key: "fit", label: "Adattamento", group: "display", options: [
      { value: "cover", label: "Riempi" },
      { value: "contain", label: "Contieni" },
    ], when: { key: "aspect", notEquals: "auto" } },
    { type: "segmented", key: "loading", label: "Caricamento", group: "display", help: "«Subito» solo per l'immagine principale in alto: tutte le altre si caricano quando servono.", options: [
      { value: "lazy", label: "Quando serve" },
      { value: "eager", label: "Subito" },
    ] },
    { type: "link", key: "link", label: "Collegamento" },
  ],
  style: MEDIA_STYLE,
  keywords: ["foto", "immagine"],
});

export const videoBlock = defineBlock({
  type: "video",
  category: "media",
  label: "Video",
  description: "Un video YouTube o Vimeo, caricato solo quando il visitatore lo chiede.",
  icon: "video",
  version: 1,
  schema: z.object({
    url: text(400),
    title: text(140, "Video"),
    caption: text(240),
    aspect: choice(["16:9", "4:3", "1:1", "9:16"] as const, "16:9"),
    poster: media(),
  }),
  defaults: { url: "", title: "Video", caption: "", aspect: "16:9", poster: null },
  controls: [
    { type: "embed-url", key: "url", label: "Indirizzo del video", providers: VIDEO_PROVIDERS },
    { type: "text", key: "title", label: "Titolo (per l'accessibilita)", max: 140 },
    { type: "text", key: "caption", label: "Didascalia", max: 240 },
    { type: "media", key: "poster", label: "Copertina", help: "Facoltativa: senza, si usa quella del servizio video." },
    { type: "segmented", key: "aspect", label: "Proporzioni", group: "display", options: [
      { value: "16:9", label: "16:9" },
      { value: "4:3", label: "4:3" },
      { value: "1:1", label: "1:1" },
      { value: "9:16", label: "9:16" },
    ] },
  ],
  style: MEDIA_STYLE,
  keywords: ["youtube", "vimeo", "filmato"],
});

export const buttonBlock = defineBlock({
  type: "button",
  category: "cta",
  label: "Bottone",
  description: "Un bottone verso una pagina, un modulo o un indirizzo esterno.",
  icon: "mouse-pointer-click",
  version: 1,
  schema: z.object({
    label: text(40, "Scopri di piu"),
    link: link(),
    variant: choice(BUTTON_VARIANTS, "primary"),
    size: choice(BUTTON_SIZES, "md"),
    fullWidth: bool(false),
  }),
  defaults: { label: "Scopri di piu", link: { kind: "none" }, variant: "primary", size: "md", fullWidth: false },
  controls: [
    { type: "text", key: "label", label: "Testo", max: 40 },
    { type: "link", key: "link", label: "Destinazione" },
    { type: "select", key: "variant", label: "Stile", group: "display", options: BUTTON_VARIANT_OPTIONS },
    { type: "segmented", key: "size", label: "Dimensione", group: "display", options: BUTTON_SIZE_OPTIONS },
    { type: "toggle", key: "fullWidth", label: "Larghezza piena", group: "display" },
  ],
  style: { responsive: ["paddingTop", "paddingBottom", "align"], static: ["animation"], defaults: { paddingTop: "none", paddingBottom: "sm", align: "left" } },
});

export const ctaBlock = defineBlock({
  type: "cta",
  category: "cta",
  label: "Invito all'azione",
  description: "Titolo, testo e due bottoni in un riquadro evidente.",
  icon: "megaphone",
  version: 1,
  schema: z.object({
    layout: choice(["banner", "card", "split"] as const, "banner"),
    title: text(140, "Unisciti alla nostra squadra"),
    text: text(500),
    image: media(),
    primaryCta: ctaShape(),
    secondaryCta: ctaShape(),
  }),
  defaults: {
    layout: "banner",
    title: "Unisciti alla nostra squadra",
    text: "",
    image: null,
    primaryCta: { label: "Iscriviti", link: { kind: "none" } },
    secondaryCta: { label: "", link: { kind: "none" } },
  },
  controls: [
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "banner", label: "Fascia" },
      { value: "card", label: "Riquadro" },
      { value: "split", label: "Con immagine" },
    ] },
    { type: "text", key: "title", label: "Titolo", max: 140 },
    { type: "textarea", key: "text", label: "Testo", max: 500, rows: 3 },
    { type: "media", key: "image", label: "Immagine", when: { key: "layout", equals: "split" } },
    { type: "cta", key: "primaryCta", label: "Bottone principale" },
    { type: "cta", key: "secondaryCta", label: "Bottone secondario" },
  ],
  style: { responsive: ["paddingTop", "paddingBottom", "align"], static: ["animation", "radius"], defaults: { align: "center", paddingTop: "none", paddingBottom: "none" } },
  keywords: ["iscriviti", "contattaci"],
});

export const columnsBlock = defineBlock({
  type: "columns",
  category: "content",
  label: "Colonne di testo",
  description: "Da due a quattro colonne con icona, titolo e testo.",
  icon: "columns-3",
  version: 1,
  schema: z.object({
    columns: choice(["2", "3", "4"] as const, "3"),
    items: list({
      icon: choice(["", ...ICON_KEYS] as const, ""),
      title: text(100),
      text: text(600),
      link: link(),
      linkLabel: text(40),
    }, 8),
  }),
  defaults: {
    columns: "3",
    items: [
      { id: "c1", icon: "trophy", title: "Agonismo", text: "Squadre in tutte le categorie, dai piu piccoli alla prima squadra.", link: { kind: "none" }, linkLabel: "" },
      { id: "c2", icon: "users", title: "Settore giovanile", text: "Allenatori qualificati e un percorso di crescita per ogni eta.", link: { kind: "none" }, linkLabel: "" },
      { id: "c3", icon: "heart", title: "Comunita", text: "Una societa che e prima di tutto un luogo di incontro.", link: { kind: "none" }, linkLabel: "" },
    ],
  },
  controls: [
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1) },
    { type: "list", key: "items", label: "Colonne", max: 8, itemLabelKey: "title", addLabel: "Aggiungi colonna", fields: [
      { type: "select", key: "icon", label: "Icona", options: [{ value: "", label: "Nessuna" }, ...ICON_OPTIONS] },
      { type: "text", key: "title", label: "Titolo", max: 100 },
      { type: "textarea", key: "text", label: "Testo", max: 600, rows: 3 },
      { type: "link", key: "link", label: "Collegamento" },
      { type: "text", key: "linkLabel", label: "Testo del collegamento", max: 40 },
    ] },
  ],
  style: GRID_STYLE,
});

export const cardGridBlock = defineBlock({
  type: "card-grid",
  category: "content",
  label: "Griglia di schede",
  description: "Schede con immagine, titolo, testo e collegamento.",
  icon: "layout-grid",
  version: 1,
  schema: z.object({
    columns: choice(["2", "3", "4"] as const, "3"),
    imageAspect: choice(["16:9", "4:3", "1:1"] as const, "4:3"),
    items: list({ image: media(), title: text(100), text: text(400), link: link(), linkLabel: text(40) }, 12),
  }),
  defaults: {
    columns: "3",
    imageAspect: "4:3",
    items: [
      { id: "g1", image: null, title: "Scheda", text: "Una breve descrizione.", link: { kind: "none" }, linkLabel: "" },
      { id: "g2", image: null, title: "Scheda", text: "Una breve descrizione.", link: { kind: "none" }, linkLabel: "" },
      { id: "g3", image: null, title: "Scheda", text: "Una breve descrizione.", link: { kind: "none" }, linkLabel: "" },
    ],
  },
  controls: [
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1) },
    { type: "segmented", key: "imageAspect", label: "Proporzioni immagini", group: "display", options: [
      { value: "16:9", label: "16:9" },
      { value: "4:3", label: "4:3" },
      { value: "1:1", label: "1:1" },
    ] },
    { type: "list", key: "items", label: "Schede", max: 12, itemLabelKey: "title", addLabel: "Aggiungi scheda", fields: [
      { type: "media", key: "image", label: "Immagine" },
      { type: "text", key: "title", label: "Titolo", max: 100 },
      { type: "textarea", key: "text", label: "Testo", max: 400, rows: 3 },
      { type: "link", key: "link", label: "Collegamento" },
      { type: "text", key: "linkLabel", label: "Testo del collegamento", max: 40 },
    ] },
  ],
  style: GRID_STYLE,
  keywords: ["griglia", "card"],
});

export const spacerBlock = defineBlock({
  type: "spacer",
  category: "layout",
  label: "Spaziatura",
  description: "Uno spazio vuoto verticale.",
  icon: "move-vertical",
  version: 1,
  schema: z.object({ size: choice(["xs", "sm", "md", "lg", "xl"] as const, "md") }),
  defaults: { size: "md" },
  controls: [
    { type: "segmented", key: "size", label: "Altezza", options: [
      { value: "xs", label: "XS" },
      { value: "sm", label: "S" },
      { value: "md", label: "M" },
      { value: "lg", label: "L" },
      { value: "xl", label: "XL" },
    ] },
  ],
  style: { responsive: [], static: [] },
});

export const dividerBlock = defineBlock({
  type: "divider",
  category: "layout",
  label: "Separatore",
  description: "Una linea fra due contenuti.",
  icon: "minus",
  version: 1,
  schema: z.object({
    variant: choice(["line", "dashed", "dots", "accent"] as const, "line"),
    width: choice(["full", "medium", "short"] as const, "full"),
  }),
  defaults: { variant: "line", width: "full" },
  controls: [
    { type: "segmented", key: "variant", label: "Stile", options: [
      { value: "line", label: "Linea" },
      { value: "dashed", label: "Tratteggio" },
      { value: "dots", label: "Puntini" },
      { value: "accent", label: "Accento" },
    ] },
    { type: "segmented", key: "width", label: "Lunghezza", options: [
      { value: "full", label: "Piena" },
      { value: "medium", label: "Media" },
      { value: "short", label: "Corta" },
    ] },
  ],
  style: { responsive: ["paddingTop", "paddingBottom", "align"], static: [], defaults: { paddingTop: "xs", paddingBottom: "xs", align: "center" } },
});

export const galleryBlock = defineBlock({
  type: "gallery",
  category: "media",
  label: "Galleria",
  description: "Una raccolta di immagini a griglia, mosaico o carosello, con ingrandimento.",
  icon: "images",
  version: 1,
  schema: z.object({
    images: mediaList(60),
    layout: choice(["grid", "masonry", "carousel"] as const, "grid"),
    columns: choice(["2", "3", "4"] as const, "3"),
    aspect: choice(["1:1", "4:3", "16:9", "auto"] as const, "1:1"),
    lightbox: bool(true),
  }),
  defaults: { images: [], layout: "grid", columns: "3", aspect: "1:1", lightbox: true },
  controls: [
    { type: "media-list", key: "images", label: "Immagini", max: 60 },
    { type: "segmented", key: "layout", label: "Disposizione", group: "display", options: [
      { value: "grid", label: "Griglia" },
      { value: "masonry", label: "Mosaico" },
      { value: "carousel", label: "Carosello" },
    ] },
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1), when: { key: "layout", notEquals: "carousel" } },
    { type: "select", key: "aspect", label: "Proporzioni", group: "display", options: [
      { value: "1:1", label: "Quadrate" },
      { value: "4:3", label: "4:3" },
      { value: "16:9", label: "16:9" },
      { value: "auto", label: "Originali" },
    ], when: { key: "layout", equals: "grid" } },
    { type: "toggle", key: "lightbox", label: "Ingrandimento al clic", group: "display" },
  ],
  style: GRID_STYLE,
  keywords: ["foto", "album"],
});

export const carouselBlock = defineBlock({
  type: "carousel",
  category: "media",
  label: "Carosello",
  description: "Slide con immagine, titolo e collegamento, navigabili da tastiera.",
  icon: "gallery-horizontal",
  version: 1,
  schema: z.object({
    slides: list({ image: media(), title: text(120), text: text(300), link: link(), linkLabel: text(40) }, 12),
    perView: choice(["1", "2", "3"] as const, "1"),
    autoplay: bool(false),
    interval: int(3, 15, 6),
  }),
  defaults: { slides: [], perView: "1", autoplay: false, interval: 6 },
  controls: [
    { type: "list", key: "slides", label: "Slide", max: 12, itemLabelKey: "title", addLabel: "Aggiungi slide", fields: [
      { type: "media", key: "image", label: "Immagine" },
      { type: "text", key: "title", label: "Titolo", max: 120 },
      { type: "textarea", key: "text", label: "Testo", max: 300, rows: 2 },
      { type: "link", key: "link", label: "Collegamento" },
      { type: "text", key: "linkLabel", label: "Testo del collegamento", max: 40 },
    ] },
    { type: "segmented", key: "perView", label: "Slide visibili", group: "display", options: [
      { value: "1", label: "1" },
      { value: "2", label: "2" },
      { value: "3", label: "3" },
    ] },
    { type: "toggle", key: "autoplay", label: "Scorrimento automatico", group: "display", help: "Si ferma al passaggio del mouse, al focus e con «riduci movimento»." },
    { type: "number", key: "interval", label: "Secondi per slide", min: 3, max: 15, group: "display", when: { key: "autoplay", equals: true } },
  ],
  style: GRID_STYLE,
  keywords: ["slider", "slideshow"],
});

export const logosBlock = defineBlock({
  type: "logos",
  category: "media",
  label: "Loghi",
  description: "Una fila di loghi scelti a mano (federazioni, partner tecnici).",
  icon: "badge",
  version: 1,
  schema: z.object({
    items: list({ image: media(), name: text(80), link: link() }, 24),
    columns: choice(["3", "4", "5", "6"] as const, "5"),
    monochrome: bool(false),
    size: choice(["sm", "md", "lg"] as const, "md"),
  }),
  defaults: { items: [], columns: "5", monochrome: false, size: "md" },
  controls: [
    { type: "list", key: "items", label: "Loghi", max: 24, itemLabelKey: "name", addLabel: "Aggiungi logo", fields: [
      { type: "media", key: "image", label: "Logo" },
      { type: "text", key: "name", label: "Nome", max: 80 },
      { type: "link", key: "link", label: "Collegamento" },
    ] },
    { type: "select", key: "columns", label: "Per riga", group: "display", options: [
      { value: "3", label: "3" },
      { value: "4", label: "4" },
      { value: "5", label: "5" },
      { value: "6", label: "6" },
    ] },
    { type: "segmented", key: "size", label: "Dimensione", group: "display", options: BUTTON_SIZE_OPTIONS },
    { type: "toggle", key: "monochrome", label: "Bianco e nero", group: "display" },
  ],
  style: GRID_STYLE,
});

export const statsBlock = defineBlock({
  type: "stats",
  category: "content",
  label: "Numeri",
  description: "Cifre in evidenza scritte dal club.",
  icon: "bar-chart-3",
  version: 1,
  schema: z.object({
    variant: choice(["plain", "cards", "divided"] as const, "plain"),
    items: list({ value: text(20), label: text(80), prefix: text(6), suffix: text(10), icon: choice(["", ...ICON_KEYS] as const, "") }, 8),
  }),
  defaults: {
    variant: "plain",
    items: [
      { id: "s1", value: "210", label: "Atleti", prefix: "", suffix: "", icon: "users" },
      { id: "s2", value: "12", label: "Squadre", prefix: "", suffix: "", icon: "shield" },
      { id: "s3", value: "1000", label: "Gare giocate", prefix: "", suffix: "+", icon: "trophy" },
    ],
  },
  controls: [
    { type: "segmented", key: "variant", label: "Stile", group: "display", options: [
      { value: "plain", label: "Semplice" },
      { value: "cards", label: "Riquadri" },
      { value: "divided", label: "Divisi" },
    ] },
    { type: "list", key: "items", label: "Numeri", max: 8, itemLabelKey: "label", addLabel: "Aggiungi numero", fields: [
      { type: "text", key: "value", label: "Valore", max: 20 },
      { type: "text", key: "label", label: "Etichetta", max: 80 },
      { type: "text", key: "prefix", label: "Prima del valore", max: 6 },
      { type: "text", key: "suffix", label: "Dopo il valore", max: 10 },
      { type: "select", key: "icon", label: "Icona", options: [{ value: "", label: "Nessuna" }, ...ICON_OPTIONS] },
    ] },
  ],
  style: { ...GRID_STYLE, defaults: { ...GRID_STYLE.defaults, align: "center" } },
  keywords: ["kpi", "cifre", "statistiche"],
});

export const faqBlock = defineBlock({
  type: "faq",
  category: "content",
  label: "Domande frequenti",
  description: "Domande e risposte apribili, accessibili da tastiera.",
  icon: "circle-help",
  version: 1,
  schema: z.object({
    items: list({ question: text(200), answer: text(2000) }, 30),
    openFirst: bool(false),
  }),
  defaults: {
    items: [
      { id: "f1", question: "Come mi iscrivo?", answer: "Compila il modulo di iscrizione online: la segreteria ti contatta entro pochi giorni." },
      { id: "f2", question: "Posso fare una prova?", answer: "Si: le prime due settimane sono di prova gratuita." },
    ],
    openFirst: false,
  },
  controls: [
    { type: "list", key: "items", label: "Domande", max: 30, itemLabelKey: "question", addLabel: "Aggiungi domanda", fields: [
      { type: "text", key: "question", label: "Domanda", max: 200 },
      { type: "textarea", key: "answer", label: "Risposta", max: 2000, rows: 4 },
    ] },
    { type: "toggle", key: "openFirst", label: "Prima domanda aperta", group: "display" },
  ],
  style: TEXT_STYLE,
  keywords: ["faq", "domande"],
});

export const socialLinksBlock = defineBlock({
  type: "social-links",
  category: "club",
  label: "Social",
  description: "I profili social del club, letti dall'anagrafica o dalle impostazioni del sito.",
  icon: "share-2",
  version: 1,
  schema: z.object({
    variant: choice(["icons", "buttons", "list"] as const, "icons"),
    size: choice(["sm", "md", "lg"] as const, "md"),
    title: text(80),
  }),
  defaults: { variant: "icons", size: "md", title: "" },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 80 },
    { type: "segmented", key: "variant", label: "Stile", group: "display", options: [
      { value: "icons", label: "Icone" },
      { value: "buttons", label: "Bottoni" },
      { value: "list", label: "Elenco" },
    ] },
    { type: "segmented", key: "size", label: "Dimensione", group: "display", options: BUTTON_SIZE_OPTIONS },
  ],
  style: { responsive: ["paddingTop", "paddingBottom", "align"], static: [], defaults: { paddingTop: "none", paddingBottom: "sm", align: "left" } },
  datasource: { key: "CLUB_INFO", config: () => ({}) },
});

export const contactBlock = defineBlock({
  type: "contact",
  category: "club",
  label: "Contatti",
  description: "Indirizzo, email e telefono del club, sempre aggiornati dall'anagrafica.",
  icon: "contact",
  version: 1,
  schema: z.object({
    title: text(100, "Contatti"),
    text: text(500),
    layout: choice(["list", "cards"] as const, "list"),
    showAddress: bool(true),
    showEmail: bool(true),
    showPhone: bool(true),
    showSocial: bool(true),
  }),
  defaults: { title: "Contatti", text: "", layout: "list", showAddress: true, showEmail: true, showPhone: true, showSocial: true },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "textarea", key: "text", label: "Testo", max: 500, rows: 3 },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "list", label: "Elenco" },
      { value: "cards", label: "Riquadri" },
    ] },
    { type: "toggle", key: "showAddress", label: "Indirizzo", group: "display" },
    { type: "toggle", key: "showEmail", label: "Email", group: "display" },
    { type: "toggle", key: "showPhone", label: "Telefono", group: "display" },
    { type: "toggle", key: "showSocial", label: "Social", group: "display" },
  ],
  style: TEXT_STYLE,
  datasource: { key: "CLUB_INFO", config: () => ({}) },
});

export const mapBlock = defineBlock({
  type: "map",
  category: "media",
  label: "Mappa",
  description: "Una mappa che si carica solo dopo il consenso del visitatore.",
  icon: "map",
  version: 1,
  schema: z.object({
    address: text(240),
    zoom: int(3, 19, 15),
    height: choice(["sm", "md", "lg"] as const, "md"),
    title: text(100, "Dove siamo"),
  }),
  defaults: { address: "", zoom: 15, height: "md", title: "Dove siamo" },
  controls: [
    { type: "text", key: "address", label: "Indirizzo", max: 240, help: "Vuoto: l'indirizzo del club." },
    { type: "number", key: "zoom", label: "Zoom", min: 3, max: 19, group: "display" },
    { type: "segmented", key: "height", label: "Altezza", group: "display", options: SPACING_HEIGHT },
    { type: "text", key: "title", label: "Titolo (per l'accessibilita)", max: 100 },
  ],
  style: MEDIA_STYLE,
  datasource: { key: "CLUB_INFO", config: () => ({}) },
  keywords: ["google maps", "indirizzo", "palestra"],
});

export const embedBlock = defineBlock({
  type: "embed",
  category: "media",
  label: "Contenuto incorporato",
  description: "Un contenuto da un servizio ammesso (YouTube, Vimeo, Google Maps, Spotify, SoundCloud). Niente codice libero.",
  icon: "code",
  version: 1,
  schema: z.object({
    url: text(600),
    title: text(140, "Contenuto incorporato"),
    height: int(120, 1200, 420),
  }),
  defaults: { url: "", title: "Contenuto incorporato", height: 420 },
  controls: [
    { type: "embed-url", key: "url", label: "Indirizzo", providers: EMBED_PROVIDERS },
    { type: "text", key: "title", label: "Titolo (per l'accessibilita)", max: 140 },
    { type: "number", key: "height", label: "Altezza", min: 120, max: 1200, step: 20, unit: "px", group: "display" },
  ],
  style: MEDIA_STYLE,
  keywords: ["iframe", "spotify", "soundcloud"],
});

export const CONTENT_BLOCKS = [
  heroBlock,
  headingBlock,
  richTextBlock,
  imageBlock,
  videoBlock,
  buttonBlock,
  ctaBlock,
  columnsBlock,
  cardGridBlock,
  spacerBlock,
  dividerBlock,
  galleryBlock,
  carouselBlock,
  logosBlock,
  statsBlock,
  faqBlock,
  socialLinksBlock,
  contactBlock,
  mapBlock,
  embedBlock,
] as const;
