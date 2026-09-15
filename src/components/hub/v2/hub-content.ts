/**
 * Il contenuto dell'EasyGame HUB (Web V2).
 *
 * E **statico per decisione** (ADR-0014): nessuna chiamata dati, nessuna
 * persistenza, e nessuna promessa di funzioni che la pagina non svolge. I
 * testi sono quelli della V1, portati qui perche la pagina non ne contenga
 * la copia; i tre pulsanti che nella V1 non facevano niente — «Acquista»,
 * «Invia Feedback», «Invia Proposta» — non tornano finche non c'e qualcosa
 * che li compia (rapporto di Wave E, GAP dichiarati).
 *
 * Modulo puro: niente React.
 */
export type HubSection = "marketplace" | "news" | "tutorials" | "feedback" | "proposals";

export const HUB_SECTIONS: ReadonlyArray<{ value: HubSection; label: string }> = [
  { value: "marketplace", label: "Marketplace" },
  { value: "news", label: "Novità" },
  { value: "tutorials", label: "Tutorial e FAQ" },
  { value: "feedback", label: "Feedback" },
  { value: "proposals", label: "Proposte" },
];

export const isHubSection = (value: unknown): value is HubSection => HUB_SECTIONS.some((section) => section.value === value);

export type MarketplaceItem = {
  id: string;
  name: string;
  description: string;
  /** Prezzo mensile in euro, come numero: la formattazione la fa `formatMoney`. */
  monthlyPrice: number;
  popular: boolean;
  features: string[];
};

export const MARKETPLACE_ITEMS: readonly MarketplaceItem[] = [
  {
    id: "premium-analytics",
    name: "Analytics Premium",
    description: "Report avanzati e statistiche dettagliate per il tuo club",
    monthlyPrice: 9.99,
    popular: true,
    features: ["Report personalizzati", "Export PDF", "Grafici interattivi"],
  },
  {
    id: "multi-club",
    name: "Multi-Club Manager",
    description: "Gestisci più club da un'unica dashboard",
    monthlyPrice: 19.99,
    popular: false,
    features: ["Fino a 5 club", "Dashboard unificata", "Report consolidati"],
  },
  {
    id: "advanced-calendar",
    name: "Calendario Avanzato",
    description: "Sincronizzazione con Google Calendar e notifiche push",
    monthlyPrice: 4.99,
    popular: false,
    features: ["Sync Google Calendar", "Notifiche push", "Promemoria automatici"],
  },
  {
    id: "document-manager",
    name: "Document Manager Pro",
    description: "Gestione documenti avanzata con firma digitale",
    monthlyPrice: 14.99,
    popular: true,
    features: ["Firma digitale", "Template personalizzati", "Archiviazione cloud"],
  },
];

export type NewsItem = {
  id: number;
  title: string;
  /** Giorno civile `YYYY-MM-DD`: la data la formatta `formatDateShort`. */
  date: string;
  description: string;
  type: "feature" | "update" | "improvement";
};

export const NEWS_TYPE_LABELS: Readonly<Record<NewsItem["type"], string>> = Object.freeze({
  feature: "Novità",
  update: "Aggiornamento",
  improvement: "Miglioramento",
});

export const NEWS_ITEMS: readonly NewsItem[] = [
  {
    id: 1,
    title: "Nuova funzionalità: Gestione Gare",
    date: "2025-01-15",
    description: "Abbiamo rilasciato la nuova sezione per la gestione completa delle gare e convocazioni.",
    type: "feature",
  },
  {
    id: 2,
    title: "Aggiornamento Dashboard",
    date: "2025-01-10",
    description: "La dashboard è stata completamente ridisegnata con nuovi widget e colori più vivaci.",
    type: "update",
  },
  {
    id: 3,
    title: "Miglioramenti Performance",
    date: "2025-01-05",
    description: "Abbiamo ottimizzato le performance dell'applicazione per un'esperienza più fluida.",
    type: "improvement",
  },
];

export type TutorialItem = { id: number; title: string; duration: string; category: string };

export const TUTORIAL_ITEMS: readonly TutorialItem[] = [
  { id: 1, title: "Come creare il tuo primo club", duration: "5 min", category: "Iniziare" },
  { id: 2, title: "Gestire gli atleti", duration: "8 min", category: "Atleti" },
  { id: 3, title: "Pianificare gli allenamenti", duration: "6 min", category: "Allenamenti" },
  { id: 4, title: "Gestire i certificati medici", duration: "4 min", category: "Certificati" },
];

export type FaqItem = { id: string; question: string; answer: string };

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: "nuovo-atleta",
    question: "Come posso aggiungere un nuovo atleta?",
    answer: "Vai nella sezione Atleti dal menu laterale e clicca sul pulsante «Nuovo atleta». Compila tutti i campi richiesti e salva.",
  },
  {
    id: "token-genitori",
    question: "Come funziona il sistema di token per i genitori?",
    answer: "Ogni atleta ha un token univoco che può essere condiviso con i genitori. I genitori possono usare questo token per accedere alla loro area dedicata.",
  },
  {
    id: "piu-club",
    question: "Posso gestire più club con lo stesso account?",
    answer: "Sì. Puoi essere membro di più club con ruoli diversi. Usa il selettore club nella barra laterale per passare da un club all'altro.",
  },
  {
    id: "notifiche-certificati",
    question: "Come ricevo le notifiche per i certificati in scadenza?",
    answer: "Le notifiche sono automatiche. Riceverai un avviso 30 giorni prima della scadenza di ogni certificato medico.",
  },
  {
    id: "export-atleti",
    question: "Posso esportare i dati degli atleti?",
    answer: "Sì, dalla sezione Atleti puoi esportare i dati in formato CSV o PDF usando il menu di esportazione della griglia.",
  },
];

export const CONTACT_URL = "https://www.cedisoft.it/contatti/";
export const CONTACT_LABEL = "www.cedisoft.it/contatti";
