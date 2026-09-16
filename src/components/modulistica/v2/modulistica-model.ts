import type { StatusSpec } from "@/lib/web/status";
import { PERSON_STATUS } from "@/lib/web/status";
import type { ViewDef } from "@/components/web/datagrid/types";
import type { DocumentTemplateSummary, TemplateStatus, TemplateSubject } from "@/lib/api/documents";
import { FORM_STATUS_LABELS, FORM_SUBMISSION_STATUS_LABELS, type FormStatus, type FormSubmissionStatus } from "@/lib/forms/model";
import { FORM_CATALOG } from "@/lib/forms/catalog";
import { applyPlaceholderValues, normalizePlaceholderKey, DOCUMENT_SIGNATURE_TOKENS } from "@/lib/documents/placeholders";

/**
 * Il modello di `/modulistica` per il Web V2 (audit
 * `docs/redesign/audit/wave-e-modulistica.md`): le parole, le viste, le
 * regole di stato che la pagina V1 teneva in `page.tsx`. Modulo puro:
 * niente React, niente rete.
 */

/* ── Le schede della pagina ────────────────────────────────────────────── */
/**
 * Le quattro aree della pagina. «Ritirati» della V1 non e piu una scheda:
 * e una vista della griglia dei modelli (guideline 07: ogni elenco ha le sue
 * viste), con le stesse due azioni — riattiva, elimina.
 */
export const MODULISTICA_TABS = ["documents", "catalog", "online-forms", "generated"] as const;
export type ModulisticaTab = (typeof MODULISTICA_TABS)[number];

export const isModulisticaTab = (value: unknown): value is ModulisticaTab =>
  (MODULISTICA_TABS as readonly string[]).includes(String(value ?? ""));

export const MODULISTICA_TAB_LABELS: Record<ModulisticaTab, string> = {
  documents: "Modelli di documento",
  catalog: "Catalogo",
  "online-forms": "Moduli online",
  generated: "Documenti generati",
};

/* ── Le parole ─────────────────────────────────────────────────────────── */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/**
 * Lo stato di un modello: bozza → attivo → ritirato. `draft` e `active`
 * sono le parole di `PERSON_STATUS`; «Ritirato» manca in `status.ts` e la
 * spec locale ha la stessa forma, segnalata nel rapporto.
 */
export const TEMPLATE_STATUS: Record<TemplateStatus, StatusSpec> = Object.freeze({
  draft: PERSON_STATUS.draft,
  active: PERSON_STATUS.active,
  retired: spec("RITIRATO", "outline", "amber"),
});

export const templateStatusSpec = (status: unknown): StatusSpec =>
  TEMPLATE_STATUS[String(status ?? "") as TemplateStatus] || PERSON_STATUS.draft;

/** Le etichette della V1, per le esportazioni e i filtri. */
export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: "Bozza",
  active: "Attivo",
  retired: "Ritirato",
};

/**
 * I quattro soggetti che un modello puo dichiarare. Non e una preferenza di
 * catalogazione: il soggetto decide quali segnaposto l'editor propone, e
 * quindi quali dati il modello sapra scrivere.
 */
export const SUBJECT_LABELS: Record<TemplateSubject, string> = {
  club: "La società",
  athlete: "Un atleta",
  person: "Una persona dello staff",
  member: "Un socio",
};

export const SUBJECT_HINT =
  "Il soggetto decide quali dati il modello saprà scrivere: un modello che parla di un atleta non ha un allenatore a cui riferirsi, e quei campi resterebbero bianchi.";

export const SUBJECT_OPTIONS = (Object.entries(SUBJECT_LABELS) as Array<[TemplateSubject, string]>).map(([value, label]) => ({ value, label }));

/**
 * La classe redazionale di una voce di catalogo, detta a chi la adotta: dice
 * **chi puo mantenere quel testo** (ADR-0092). Oggi escono solo le `A`.
 */
export const CATALOG_CLASS_LABELS: Record<string, string> = {
  A: "Classe A — dice fatti del gestionale",
  B: "Classe B — modulo di un ente terzo",
  C: "Classe C — contenuto legale o fiscale",
};

export const catalogClassLabel = (catalogClass: string | null | undefined): string => {
  const key = String(catalogClass || "").trim();
  if (!key) return "";
  return CATALOG_CLASS_LABELS[key] || `Classe ${key}`;
};

/** Una voce di catalogo: adottata (una copia del club esiste gia) o disponibile. */
export const CATALOG_ENTRY_STATUS = Object.freeze({
  adopted: spec("ADOTTATO", "solid", "green"),
  available: spec("DISPONIBILE", "quiet", "neutral"),
});

/** Lo stato di un documento generato, con le parole della V1. */
export const GENERATED_STATUS_LABELS: Record<string, string> = {
  generated: "Generato",
  issued: "Consegnato",
  awaiting_signature: "In attesa di firma",
  signed: "Copia firmata rientrata",
  rejected: "Respinto",
  archived: "Archiviato",
};

export const GENERATED_STATUS: Record<string, StatusSpec> = Object.freeze({
  generated: spec("GENERATO", "solid", "blue"),
  issued: spec("CONSEGNATO", "solid", "green"),
  awaiting_signature: spec("IN ATTESA DI FIRMA", "outline", "amber"),
  signed: spec("COPIA FIRMATA RIENTRATA", "solid", "green"),
  rejected: spec("RESPINTO", "urgent", "red"),
  archived: PERSON_STATUS.archived,
});

export const generatedStatusSpec = (status: unknown): StatusSpec => {
  const key = String(status ?? "").trim();
  return GENERATED_STATUS[key] || spec(key ? key.toUpperCase() : "NON REGISTRATO", "quiet", "neutral");
};

export const generatedStatusLabel = (status: unknown): string => {
  const key = String(status ?? "").trim();
  return GENERATED_STATUS_LABELS[key] || key;
};

/** Lo stato di un modulo online (`FORM_STATUS_LABELS`: Bozza / Pubblicato / Archiviato). */
export const FORM_STATUS: Record<FormStatus, StatusSpec> = Object.freeze({
  draft: PERSON_STATUS.draft,
  published: spec("PUBBLICATO", "solid", "green"),
  archived: PERSON_STATUS.archived,
});

export const formStatusSpec = (status: unknown): StatusSpec =>
  FORM_STATUS[String(status ?? "") as FormStatus] || PERSON_STATUS.draft;

export const formStatusLabel = (status: unknown): string =>
  FORM_STATUS_LABELS[String(status ?? "") as FormStatus] || String(status ?? "");

/** Lo stato di una compilazione (`FORM_SUBMISSION_STATUS_LABELS`). */
export const SUBMISSION_STATUS: Record<FormSubmissionStatus, StatusSpec> = Object.freeze({
  pending: spec("DA REVISIONARE", "solid", "amber"),
  changes_requested: spec("INTEGRAZIONE RICHIESTA", "outline", "orange"),
  approved: spec("APPROVATA", "solid", "green"),
  converted: spec("ATLETA CREATO", "solid", "green"),
  rejected: spec("RIFIUTATA", "urgent", "red"),
  archived: spec("ARCHIVIATA", "quiet", "neutral"),
});

export const submissionStatusSpec = (status: unknown): StatusSpec =>
  SUBMISSION_STATUS[String(status ?? "") as FormSubmissionStatus] || SUBMISSION_STATUS.pending;

export const submissionStatusLabel = (status: unknown): string =>
  FORM_SUBMISSION_STATUS_LABELS[String(status ?? "") as FormSubmissionStatus] || String(status ?? "");

/**
 * La classe redazionale di una voce del catalogo dei **moduli**, detta a chi
 * la adotta. Stessa forma del catalogo dei documenti (ADR-0092).
 */
export const FORM_CATALOG_CLASS_LABELS: Record<string, string> = {
  A: "Classe A — campi che EasyGame sa già leggere e scrivere",
  B: "Classe B — modulo di un ente terzo",
  C: "Classe C — contenuto legale o fiscale",
};

export const formCatalogClassLabel = (catalogClass: string | null | undefined): string => {
  const key = String(catalogClass || "").trim();
  if (!key) return "";
  return FORM_CATALOG_CLASS_LABELS[key] || `Classe ${key}`;
};

/** I titoli delle voci, per dire da quale modello viene un modulo del club. */
export const catalogTitleByKey = new Map(FORM_CATALOG.map((entry) => [entry.key, entry.title]));

export const formCatalogTitle = (catalogKey: string | null | undefined): string =>
  catalogTitleByKey.get(String(catalogKey || "")) || "";

/* ── Le regole ─────────────────────────────────────────────────────────── */
/**
 * Da questo modello si puo produrre un documento **compilato**? Sono le due
 * condizioni di `loadPublishableVersion` lato server, dette qui con le
 * stesse parole: un modello ritirato non produce documenti nuovi, e uno
 * senza versione pubblicata non ha niente da citare.
 */
export const canProduceFilled = (template: DocumentTemplateSummary) =>
  template.status !== "retired" && template.publishedVersion > 0;

/**
 * Il lotto parte solo da un modello **pubblicato** che parla di un atleta:
 * su una bozza il server rifiuterebbe cinquanta volte, e su un altro
 * soggetto produrrebbe cinquanta fogli con i campi bianchi.
 */
export const canGenerateInBulk = (template: DocumentTemplateSummary) =>
  template.status === "active" && template.subjectKind === "athlete";

/** «Versione 3 del 24 set 2026» o «Mai pubblicato». */
export const describeTemplateVersion = (template: Pick<DocumentTemplateSummary, "publishedVersion" | "publishedAt">, formatDate: (value: string | null) => string) =>
  template.publishedVersion > 0 ? `Versione ${template.publishedVersion} del ${formatDate(template.publishedAt)}` : "Mai pubblicato";

/** Le viste della griglia dei modelli: attivi, bozze, ritirati (la scheda «Ritirati» della V1). */
export const TEMPLATE_VIEWS: ViewDef[] = [
  { id: "in-use", label: "In uso", filters: { status: ["active", "draft"] }, builtIn: true, isDefault: true },
  { id: "active", label: "Attivi", filters: { status: ["active"] }, builtIn: true },
  { id: "draft", label: "Bozze", filters: { status: ["draft"] }, builtIn: true },
  { id: "retired", label: "Ritirati", filters: { status: ["retired"] }, builtIn: true, tone: "amber" },
  { id: "unpublished", label: "Modifiche non pubblicate", filters: { unpublished: true }, builtIn: true, tone: "amber" },
];

/** Le viste dei moduli online: la V1 nascondeva gli archiviati finche non si chiedeva di vederli. */
export const FORM_VIEWS: ViewDef[] = [
  { id: "in-use", label: "In uso", filters: { status: ["published", "draft"] }, builtIn: true, isDefault: true },
  { id: "published", label: "Pubblicati", filters: { status: ["published"] }, builtIn: true },
  { id: "draft", label: "Bozze", filters: { status: ["draft"] }, builtIn: true },
  { id: "archived", label: "Archiviati", filters: { status: ["archived"] }, builtIn: true },
  { id: "pending", label: "Con compilazioni da esaminare", filters: { pending: true }, builtIn: true, tone: "amber" },
];

/** Le viste della coda: il server filtra per stato, la vista dice quale. */
export const SUBMISSION_VIEWS: ViewDef[] = [
  { id: "pending", label: "Da esaminare", filters: { status: "pending" }, builtIn: true, isDefault: true, tone: "amber" },
  { id: "approved", label: "Approvate", filters: { status: "approved" }, builtIn: true },
  { id: "rejected", label: "Rifiutate", filters: { status: "rejected" }, builtIn: true },
];

export const submissionStatusFromFilters = (filters: Record<string, unknown>): string => {
  const value = filters?.status;
  return typeof value === "string" && value ? value : "all";
};

/* ── Il modulo vuoto ───────────────────────────────────────────────────── */
export const escapeHtmlText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const signatureBlockHtml = (label: string) =>
  `<div style="margin: 28px 0 18px; padding: 18px; border: 1px dashed #94a3b8; border-radius: 8px; color: #475569; background-color: #f8fafc;"><strong>${label}</strong></div>`;

/*
  I blocchi firma, e solo quelli: nel modulo vuoto diventano il riquadro
  tratteggiato che si firma a penna, con scritto **quale** firma ci va. Tutto
  il resto non e in questa mappa, e per un segnaposto assente
  `applyPlaceholderValues` mette da se il campo tratteggiato. (Gli stili sono
  quelli del foglio stampato, fuori dal DOM dell'applicazione.)
*/
export const BLANK_SIGNATURE_HTML: Record<string, string> = Object.fromEntries(
  DOCUMENT_SIGNATURE_TOKENS.map((token) => [normalizePlaceholderKey(token.value), signatureBlockHtml(token.label)]),
);

/**
 * Il modulo da compilare a mano: i segnaposto diventano righe da riempire a
 * penna. Nessuna regex propria: il motore e quello del catalogo dei
 * segnaposto, lo stesso che usa il risolutore del server.
 */
export const renderBlankTemplateForPdf = (content: string) =>
  applyPlaceholderValues({ content, rendered: BLANK_SIGNATURE_HTML }).html;

/** Il contenuto di partenza di un modello nuovo. */
export const newTemplateContent = (title: string) => `<h1>${escapeHtmlText(title)}</h1><p>Inserisci il contenuto qui.</p>`;

/* ── Gli atleti per il compilato e il lotto ────────────────────────────── */
export type AthleteOption = { id: string; label: string; category: string };

export const normalizeAthletes = (athletesData: unknown): AthleteOption[] =>
  (Array.isArray(athletesData) ? athletesData : [])
    .map((athlete: any) => {
      const data = typeof athlete?.data === "object" && athlete.data ? athlete.data : {};
      const firstName = String(athlete?.first_name || athlete?.name || data.first_name || data.firstName || "").trim();
      const lastName = String(athlete?.last_name || athlete?.surname || data.last_name || data.lastName || "").trim();
      const category = String(data.category || "").trim();
      return {
        id: athlete?.id ? String(athlete.id) : "",
        label: `${firstName} ${lastName}`.trim() || "Atleta senza nome",
        category,
        keep: Boolean(athlete && athlete.id && (firstName || lastName || category)),
      };
    })
    .filter((athlete) => athlete.keep)
    .map(({ id, label, category }) => ({ id, label, category }));

/** L'URL della resa conservata di un documento generato: si riapre com'era. */
export const generatedDocumentHref = (id: string) => `/api/v1/documents/generated/${id}?format=html`;
