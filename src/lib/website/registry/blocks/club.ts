import { z } from "zod";
import { defineBlock } from "../types";
import { COLUMN_OPTIONS, bool, choice, int, link, list, media, stringList, text } from "../fields";

/**
 * Blocchi della societa, degli sponsor, delle news e delle iscrizioni.
 *
 * Gli sponsor arrivano dal dominio sponsor del gestionale (la vetrina e un
 * sotto-oggetto della scheda sponsor, ADR-0200 §9): nessun elenco di loghi
 * ricopiato a mano. Le iscrizioni puntano ai moduli online pubblicati: la
 * pratica entra nel flusso che esiste (ADR-0189), non in un archivio del sito.
 */

const LIST_STYLE = {
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

/* ---------------------------------------------------------------- societa */

export const clubInfoBlock = defineBlock({
  type: "club-info",
  category: "club",
  label: "La societa",
  description: "Logo, nome, descrizione, anno di fondazione e sede: dall'anagrafica del club.",
  icon: "building-2",
  version: 1,
  schema: z.object({
    layout: choice(["side", "centered"] as const, "side"),
    showLogo: bool(true),
    showDescription: bool(true),
    showFounded: bool(true),
    showAddress: bool(true),
    extraText: text(3000),
  }),
  defaults: { layout: "side", showLogo: true, showDescription: true, showFounded: true, showAddress: true, extraText: "" },
  controls: [
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "side", label: "Logo a lato" },
      { value: "centered", label: "Centrata" },
    ] },
    { type: "toggle", key: "showLogo", label: "Logo", group: "display" },
    { type: "toggle", key: "showDescription", label: "Descrizione", group: "display" },
    { type: "toggle", key: "showFounded", label: "Anno di fondazione", group: "display" },
    { type: "toggle", key: "showAddress", label: "Sede", group: "display" },
    { type: "textarea", key: "extraText", label: "Testo aggiuntivo", max: 3000, rows: 5 },
  ],
  style: LIST_STYLE,
  datasource: { key: "CLUB_INFO", config: () => ({}) },
});

export const clubNumbersBlock = defineBlock({
  type: "club-numbers",
  category: "club",
  label: "Il club in numeri",
  description: "Cifre contate dal gestionale (atleti, squadre, gare) piu quelle scritte dal club.",
  icon: "hash",
  version: 1,
  schema: z.object({
    title: text(100),
    metrics: stringList(5, 20),
    manual: list({ value: text(20), label: text(80), suffix: text(10) }, 6),
    variant: choice(["plain", "cards", "divided"] as const, "divided"),
  }),
  defaults: {
    title: "",
    metrics: ["athletes", "teams", "matches"],
    manual: [{ id: "m1", value: "12000", label: "Km di trasferte", suffix: "" }],
    variant: "divided",
  },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "multi-select", key: "metrics", label: "Cifre dal gestionale", group: "data", help: "Contate al momento: atleti attivi nella stagione, squadre, gare giocate, stagioni, allenatori. Una cifra a zero non compare.", options: [
      { value: "athletes", label: "Atleti" },
      { value: "teams", label: "Squadre" },
      { value: "matches", label: "Gare giocate" },
      { value: "seasons", label: "Stagioni" },
      { value: "trainers", label: "Allenatori" },
    ] },
    { type: "list", key: "manual", label: "Cifre scritte dal club", max: 6, itemLabelKey: "label", addLabel: "Aggiungi cifra", fields: [
      { type: "text", key: "value", label: "Valore", max: 20 },
      { type: "text", key: "label", label: "Etichetta", max: 80 },
      { type: "text", key: "suffix", label: "Dopo il valore", max: 10 },
    ] },
    { type: "segmented", key: "variant", label: "Stile", group: "display", options: [
      { value: "plain", label: "Semplice" },
      { value: "cards", label: "Riquadri" },
      { value: "divided", label: "Divisi" },
    ] },
  ],
  style: { ...LIST_STYLE, defaults: { ...LIST_STYLE.defaults, align: "center" } },
  datasource: { key: "CLUB_NUMBERS", config: (p) => ({ metrics: p.metrics }) },
  keywords: ["numeri", "kpi", "statistiche"],
});

/* ---------------------------------------------------------------- sponsor */

const sponsorSource = {
  tier: text(40),
  limit: int(1, 80, 40),
  monochrome: bool(false),
  linkLogos: bool(true),
  logoSize: choice(["sm", "md", "lg"] as const, "md"),
};

const sponsorControls = [
  { type: "sponsor-tier", key: "tier", label: "Livello", group: "data", help: "Vuoto: tutti gli sponsor in vetrina." },
  { type: "number", key: "limit", label: "Massimo", min: 1, max: 80, group: "data" },
  { type: "segmented", key: "logoSize", label: "Dimensione loghi", group: "display", options: [
    { value: "sm", label: "Piccoli" },
    { value: "md", label: "Medi" },
    { value: "lg", label: "Grandi" },
  ] },
  { type: "toggle", key: "monochrome", label: "Bianco e nero (colore al passaggio)", group: "display" },
  { type: "toggle", key: "linkLogos", label: "Loghi cliccabili", group: "display" },
] as const;

export const sponsorMarqueeBlock = defineBlock({
  type: "sponsor-marquee",
  category: "sponsor",
  label: "Sponsor scorrevoli",
  description: "Una fascia di loghi che scorre senza fine, fluida e accessibile.",
  icon: "move-horizontal",
  version: 1,
  schema: z.object({
    title: text(100),
    ...sponsorSource,
    direction: choice(["left", "right"] as const, "left"),
    speed: choice(["slow", "normal", "fast"] as const, "normal"),
    gap: choice(["sm", "md", "lg"] as const, "md"),
    pauseOnHover: bool(true),
  }),
  defaults: { title: "", tier: "", limit: 40, monochrome: false, linkLogos: true, logoSize: "md", direction: "left", speed: "normal", gap: "md", pauseOnHover: true },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    ...sponsorControls,
    { type: "segmented", key: "direction", label: "Direzione", group: "display", options: [
      { value: "left", label: "Verso sinistra" },
      { value: "right", label: "Verso destra" },
    ] },
    { type: "segmented", key: "speed", label: "Velocita", group: "display", options: [
      { value: "slow", label: "Lenta" },
      { value: "normal", label: "Media" },
      { value: "fast", label: "Veloce" },
    ] },
    { type: "segmented", key: "gap", label: "Spazio fra i loghi", group: "display", options: [
      { value: "sm", label: "Stretto" },
      { value: "md", label: "Medio" },
      { value: "lg", label: "Largo" },
    ] },
    { type: "toggle", key: "pauseOnHover", label: "Pausa al passaggio del mouse", group: "display" },
  ],
  style: { responsive: ["paddingTop", "paddingBottom"], static: ["animation"], defaults: { paddingTop: "sm", paddingBottom: "sm" } },
  datasource: { key: "SPONSORS", config: (p) => ({ tier: p.tier, limit: p.limit }) },
  keywords: ["marquee", "loghi", "partner"],
});

export const sponsorGridBlock = defineBlock({
  type: "sponsor-grid",
  category: "sponsor",
  label: "Griglia sponsor",
  description: "I loghi degli sponsor in griglia, ordinati e facoltativamente divisi per livello.",
  icon: "grid-3x3",
  version: 1,
  schema: z.object({
    title: text(100, "I nostri sponsor"),
    ...sponsorSource,
    groupByTier: bool(true),
    columns: choice(["3", "4", "5", "6"] as const, "4"),
    showNames: bool(false),
    emptyMessage: text(200, ""),
  }),
  defaults: { title: "I nostri sponsor", tier: "", limit: 40, monochrome: false, linkLogos: true, logoSize: "md", groupByTier: true, columns: "4", showNames: false, emptyMessage: "" },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    ...sponsorControls,
    { type: "toggle", key: "groupByTier", label: "Dividi per livello", group: "display" },
    { type: "select", key: "columns", label: "Per riga", group: "display", options: [
      { value: "3", label: "3" },
      { value: "4", label: "4" },
      { value: "5", label: "5" },
      { value: "6", label: "6" },
    ] },
    { type: "toggle", key: "showNames", label: "Nome sotto il logo", group: "display" },
  ],
  style: LIST_STYLE,
  datasource: { key: "SPONSORS", config: (p) => ({ tier: p.tier, limit: p.limit }) },
});

export const featuredSponsorBlock = defineBlock({
  type: "featured-sponsor",
  category: "sponsor",
  label: "Sponsor principale",
  description: "Lo sponsor in evidenza, con logo grande, descrizione e collegamento.",
  icon: "award",
  version: 1,
  schema: z.object({
    eyebrow: text(60, "Main sponsor"),
    tier: text(40),
    layout: choice(["centered", "split"] as const, "centered"),
    showDescription: bool(true),
    ctaLabel: text(40, "Visita il sito"),
  }),
  defaults: { eyebrow: "Main sponsor", tier: "", layout: "centered", showDescription: true, ctaLabel: "Visita il sito" },
  controls: [
    { type: "text", key: "eyebrow", label: "Occhiello", max: 60 },
    { type: "sponsor-tier", key: "tier", label: "Livello", group: "data", help: "Vuoto: lo sponsor marcato «in evidenza»." },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "centered", label: "Centrata" },
      { value: "split", label: "Divisa" },
    ] },
    { type: "toggle", key: "showDescription", label: "Descrizione", group: "display" },
    { type: "text", key: "ctaLabel", label: "Testo del bottone", max: 40 },
  ],
  style: LIST_STYLE,
  datasource: { key: "SPONSORS", config: (p) => ({ tier: p.tier, featuredOnly: !p.tier, limit: 1 }) },
});

export const sponsorSectionBlock = defineBlock({
  type: "sponsor-section",
  category: "sponsor",
  label: "Sponsor per livello",
  description: "Main sponsor, Gold, Silver, Partner, Sponsor tecnico: ogni livello con la sua fascia.",
  icon: "layers",
  version: 1,
  schema: z.object({
    title: text(100, "Partner e sponsor"),
    monochrome: bool(false),
    linkLogos: bool(true),
    showTierTitles: bool(true),
  }),
  defaults: { title: "Partner e sponsor", monochrome: false, linkLogos: true, showTierTitles: true },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "toggle", key: "showTierTitles", label: "Nome dei livelli", group: "display" },
    { type: "toggle", key: "monochrome", label: "Bianco e nero (colore al passaggio)", group: "display" },
    { type: "toggle", key: "linkLogos", label: "Loghi cliccabili", group: "display" },
  ],
  style: LIST_STYLE,
  datasource: { key: "SPONSORS", config: () => ({ tier: "", limit: 80 }) },
});

/* -------------------------------------------------------------------- news */

const newsSource = {
  category: text(60),
  limit: int(1, 24, 3),
  showExcerpt: bool(true),
  showDate: bool(true),
  showCategory: bool(true),
};

const newsControls = [
  { type: "article-category", key: "category", label: "Categoria", group: "data" },
  { type: "number", key: "limit", label: "Quante", min: 1, max: 24, group: "data" },
  { type: "toggle", key: "showExcerpt", label: "Sommario", group: "display" },
  { type: "toggle", key: "showDate", label: "Data", group: "display" },
  { type: "toggle", key: "showCategory", label: "Categoria", group: "display" },
] as const;

export const latestNewsBlock = defineBlock({
  type: "latest-news",
  category: "news",
  label: "Ultime news",
  description: "Gli ultimi articoli pubblicati.",
  icon: "newspaper",
  version: 1,
  schema: z.object({
    title: text(100, "Ultime news"),
    ...newsSource,
    layout: choice(["cards", "list"] as const, "cards"),
    moreLink: ctaShape(),
    emptyMessage: text(200, ""),
  }),
  defaults: { title: "Ultime news", category: "", limit: 3, showExcerpt: true, showDate: true, showCategory: true, layout: "cards", moreLink: { label: "Tutte le news", link: { kind: "none" } }, emptyMessage: "" },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    ...newsControls,
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "cards", label: "Riquadri" },
      { value: "list", label: "Elenco" },
    ] },
    { type: "cta", key: "moreLink", label: "Collegamento «tutte»" },
  ],
  style: LIST_STYLE,
  datasource: { key: "LATEST_NEWS", config: (p) => ({ category: p.category, limit: p.limit }) },
  keywords: ["blog", "articoli", "notizie"],
});

export const newsGridBlock = defineBlock({
  type: "news-grid",
  category: "news",
  label: "Griglia news",
  description: "Gli articoli in griglia, con il primo in evidenza.",
  icon: "layout-dashboard",
  version: 1,
  schema: z.object({
    title: text(100),
    ...newsSource,
    limit: int(1, 24, 6),
    columns: choice(["2", "3", "4"] as const, "3"),
    featuredFirst: bool(true),
  }),
  defaults: { title: "", category: "", limit: 6, showExcerpt: true, showDate: true, showCategory: true, columns: "3", featuredFirst: true },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    ...newsControls,
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1) },
    { type: "toggle", key: "featuredFirst", label: "Primo articolo in grande", group: "display" },
  ],
  style: LIST_STYLE,
  datasource: { key: "LATEST_NEWS", config: (p) => ({ category: p.category, limit: p.limit }) },
});

export const featuredArticleBlock = defineBlock({
  type: "featured-article",
  category: "news",
  label: "Articolo in evidenza",
  description: "L'articolo marcato «in evidenza», in grande.",
  icon: "star",
  version: 1,
  schema: z.object({
    eyebrow: text(60, "In evidenza"),
    category: text(60),
    layout: choice(["split", "overlay"] as const, "split"),
    ctaLabel: text(40, "Leggi l'articolo"),
  }),
  defaults: { eyebrow: "In evidenza", category: "", layout: "split", ctaLabel: "Leggi l'articolo" },
  controls: [
    { type: "text", key: "eyebrow", label: "Occhiello", max: 60 },
    { type: "article-category", key: "category", label: "Categoria", group: "data" },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "split", label: "Divisa" },
      { value: "overlay", label: "Sopra l'immagine" },
    ] },
    { type: "text", key: "ctaLabel", label: "Testo del bottone", max: 40 },
  ],
  style: LIST_STYLE,
  datasource: { key: "LATEST_NEWS", config: (p) => ({ category: p.category, featuredOnly: true, limit: 1, excludeContext: false }) },
});

export const articleListBlock = defineBlock({
  type: "article-list",
  category: "news",
  label: "Archivio news",
  description: "Tutti gli articoli, con filtro per categoria e pagine.",
  icon: "library",
  version: 1,
  schema: z.object({
    perPage: int(3, 30, 9),
    columns: choice(["2", "3"] as const, "3"),
    showCategories: bool(true),
    emptyMessage: text(200, "Nessun articolo ancora pubblicato."),
  }),
  defaults: { perPage: 9, columns: "3", showCategories: true, emptyMessage: "Nessun articolo ancora pubblicato." },
  controls: [
    { type: "number", key: "perPage", label: "Articoli per pagina", min: 3, max: 30, group: "data" },
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1, 3) },
    { type: "toggle", key: "showCategories", label: "Filtro per categoria", group: "display" },
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: { key: "LATEST_NEWS", config: (p) => ({ limit: p.perPage }) },
  allowedPageKinds: ["news_index", "standard"],
});

export const articleBodyBlock = defineBlock({
  type: "article-body",
  category: "news",
  label: "Contenuto dell'articolo",
  description: "Titolo, copertina, testo e galleria dell'articolo dell'indirizzo.",
  icon: "file-text",
  version: 1,
  schema: z.object({
    showCover: bool(true),
    showMeta: bool(true),
    showGallery: bool(true),
    showRelated: bool(true),
    showShare: bool(true),
  }),
  defaults: { showCover: true, showMeta: true, showGallery: true, showRelated: true, showShare: true },
  controls: [
    { type: "toggle", key: "showCover", label: "Copertina", group: "display" },
    { type: "toggle", key: "showMeta", label: "Data, autore e categoria", group: "display" },
    { type: "toggle", key: "showGallery", label: "Galleria", group: "display" },
    { type: "toggle", key: "showRelated", label: "Articoli correlati", group: "display" },
    { type: "toggle", key: "showShare", label: "Condivisione", group: "display" },
  ],
  style: { responsive: ["paddingTop", "paddingBottom"], static: [], defaults: { paddingTop: "md", paddingBottom: "md" } },
  datasource: { key: "ARTICLE", config: () => ({ articleId: "context" }) },
  allowedPageKinds: ["article_detail"],
});

/* -------------------------------------------------------------- iscrizioni */

export const REGISTRATION_PURPOSES = ["enrollment", "trial", "info", "openday", "camp", "renewal"] as const;
export const REGISTRATION_PURPOSE_LABELS: Record<(typeof REGISTRATION_PURPOSES)[number], string> = {
  enrollment: "Iscrizione",
  trial: "Prova gratuita",
  info: "Richiesta informazioni",
  openday: "Open day",
  camp: "Camp",
  renewal: "Rinnovo",
};

export const registrationCtaBlock = defineBlock({
  type: "registration-cta",
  category: "registration",
  label: "Invito all'iscrizione",
  description: "Un invito che apre un modulo online di EasyGame: iscrizione, prova, open day, camp, rinnovo.",
  icon: "clipboard-pen",
  version: 1,
  schema: z.object({
    purpose: choice(REGISTRATION_PURPOSES, "trial"),
    title: text(140, "Vieni a provare!"),
    text: text(600, "Le prime due settimane sono gratuite: compila il modulo e ti richiamiamo."),
    buttonLabel: text(40, "Prenota la prova"),
    formSlug: text(120),
    image: media(),
    layout: choice(["banner", "card", "split"] as const, "banner"),
  }),
  defaults: { purpose: "trial", title: "Vieni a provare!", text: "Le prime due settimane sono gratuite: compila il modulo e ti richiamiamo.", buttonLabel: "Prenota la prova", formSlug: "", image: null, layout: "banner" },
  controls: [
    { type: "select", key: "purpose", label: "Scopo", options: REGISTRATION_PURPOSES.map((value) => ({ value, label: REGISTRATION_PURPOSE_LABELS[value] })) },
    { type: "form", key: "formSlug", label: "Modulo online", group: "data", help: "Solo i moduli pubblicati con link pubblico attivo. La pratica arriva nella coda iscrizioni del gestionale." },
    { type: "text", key: "title", label: "Titolo", max: 140 },
    { type: "textarea", key: "text", label: "Testo", max: 600, rows: 3 },
    { type: "text", key: "buttonLabel", label: "Testo del bottone", max: 40 },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "banner", label: "Fascia" },
      { value: "card", label: "Riquadro" },
      { value: "split", label: "Con immagine" },
    ] },
    { type: "media", key: "image", label: "Immagine", when: { key: "layout", equals: "split" } },
  ],
  style: { responsive: ["paddingTop", "paddingBottom", "align"], static: ["animation", "radius"], defaults: { paddingTop: "none", paddingBottom: "none", align: "center" } },
  datasource: { key: "REGISTRATION_FORMS", config: (p) => ({ slugs: p.formSlug ? [p.formSlug] : [] }) },
  keywords: ["iscrizione", "prova", "open day", "camp"],
});

export const registrationFormBlock = defineBlock({
  type: "registration-form",
  category: "registration",
  label: "Modulo di iscrizione",
  description: "Un modulo online di EasyGame incorporato nella pagina: la pratica entra nel gestionale.",
  icon: "file-input",
  version: 1,
  schema: z.object({
    title: text(140),
    text: text(600),
    formSlug: text(120),
    mode: choice(["embed", "link"] as const, "embed"),
    height: int(400, 3000, 1100),
    buttonLabel: text(40, "Compila il modulo"),
  }),
  defaults: { title: "", text: "", formSlug: "", mode: "embed", height: 1100, buttonLabel: "Compila il modulo" },
  controls: [
    { type: "form", key: "formSlug", label: "Modulo online", group: "data" },
    { type: "text", key: "title", label: "Titolo", max: 140 },
    { type: "textarea", key: "text", label: "Testo", max: 600, rows: 3 },
    { type: "segmented", key: "mode", label: "Come", group: "display", options: [
      { value: "embed", label: "Nella pagina" },
      { value: "link", label: "Bottone" },
    ] },
    { type: "number", key: "height", label: "Altezza iniziale", min: 400, max: 3000, step: 50, unit: "px", group: "display", when: { key: "mode", equals: "embed" } },
    { type: "text", key: "buttonLabel", label: "Testo del bottone", max: 40, when: { key: "mode", equals: "link" } },
  ],
  style: { responsive: ["paddingTop", "paddingBottom"], static: [], defaults: { paddingTop: "none", paddingBottom: "sm" } },
  datasource: { key: "REGISTRATION_FORMS", config: (p) => ({ slugs: p.formSlug ? [p.formSlug] : [] }) },
});

export const registrationFormsListBlock = defineBlock({
  type: "registration-forms",
  category: "registration",
  label: "Moduli disponibili",
  description: "L'elenco dei moduli online scelti, ognuno con il suo bottone.",
  icon: "list",
  version: 1,
  schema: z.object({ title: text(140, "Iscrizioni aperte"), slugs: stringList(12, 120), columns: choice(["1", "2", "3"] as const, "2") }),
  defaults: { title: "Iscrizioni aperte", slugs: [], columns: "2" },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 140 },
    { type: "form-list", key: "slugs", label: "Moduli", group: "data" },
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(0, 3) },
  ],
  style: LIST_STYLE,
  datasource: { key: "REGISTRATION_FORMS", config: (p) => ({ slugs: p.slugs }) },
});

export const contactFormBlock = defineBlock({
  type: "contact-form",
  category: "registration",
  label: "Modulo contatti",
  description: "Nome, email, messaggio: arriva nella casella del sito nel gestionale. Con limite di frequenza e protezione anti-spam.",
  icon: "send",
  version: 1,
  schema: z.object({
    title: text(140, "Scrivici"),
    text: text(600),
    topics: stringList(8, 60),
    askPhone: bool(true),
    privacyText: text(600, "Acconsento al trattamento dei dati per ricevere una risposta alla mia richiesta."),
    successMessage: text(300, "Grazie! Ti risponderemo il prima possibile."),
    buttonLabel: text(40, "Invia"),
  }),
  defaults: {
    title: "Scrivici",
    text: "",
    topics: ["Informazioni", "Iscrizioni", "Sponsorizzazioni"],
    askPhone: true,
    privacyText: "Acconsento al trattamento dei dati per ricevere una risposta alla mia richiesta.",
    successMessage: "Grazie! Ti risponderemo il prima possibile.",
    buttonLabel: "Invia",
  },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 140 },
    { type: "textarea", key: "text", label: "Testo", max: 600, rows: 3 },
    { type: "toggle", key: "askPhone", label: "Chiedi il telefono" },
    { type: "textarea", key: "privacyText", label: "Testo del consenso", max: 600, rows: 3 },
    { type: "textarea", key: "successMessage", label: "Messaggio dopo l'invio", max: 300, rows: 2 },
    { type: "text", key: "buttonLabel", label: "Testo del bottone", max: 40 },
  ],
  style: { responsive: ["paddingTop", "paddingBottom"], static: ["radius"], defaults: { paddingTop: "none", paddingBottom: "sm" } },
  keywords: ["contatti", "email", "scrivici"],
});

export const CLUB_BLOCKS = [
  clubInfoBlock,
  clubNumbersBlock,
  sponsorMarqueeBlock,
  sponsorGridBlock,
  featuredSponsorBlock,
  sponsorSectionBlock,
  latestNewsBlock,
  newsGridBlock,
  featuredArticleBlock,
  articleListBlock,
  articleBodyBlock,
  registrationCtaBlock,
  registrationFormBlock,
  registrationFormsListBlock,
  contactFormBlock,
] as const;
