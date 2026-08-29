/**
 * Il modello documentale: stati, transizioni, invarianti.
 *
 * **Perche un modulo puro nella barriera.** Le invarianti del §5 del planning
 * — «un documento gia rilasciato non cambia mai» — non sono un dettaglio di
 * una lane: sono cio che tutte le lane devono rispettare. Scriverle qui, senza
 * Prisma e senza rete, vuol dire che si provano senza database e che nessuna
 * schermata puo reinterpretarle a modo suo.
 *
 * Modulo **puro** e client-safe.
 */

import {
  collectPlaceholderSensitivities,
  extractPlaceholderKeys,
  isKnownPlaceholderKey,
  isTemplateSubjectKind,
  getPlaceholderSubject,
  type PlaceholderSensitivity,
  type TemplateSubjectKind,
} from "./placeholders";

/* ------------------------------------------------------------- il modello */

/**
 * Lo stato di un modello.
 *
 * `retired` non e `deleted`, ed e la distinzione che rende possibile la
 * responsabilita redazionale (ADR-0092): un modello ritirato non si propone
 * piu per documenti nuovi, ma **continua a spiegare** quelli gia generati con
 * le sue versioni. Cancellarlo cancellerebbe la spiegazione.
 */
export const TEMPLATE_STATUSES = ["draft", "active", "retired"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const isTemplateStatus = (value: unknown): value is TemplateStatus =>
  (TEMPLATE_STATUSES as readonly string[]).includes(
    String(value || "").trim().toLowerCase(),
  );

/**
 * Le transizioni ammesse.
 *
 * Da `draft` si va in `active` **pubblicando**, cioe creando una versione: non
 * esiste un modello attivo senza una versione, o «genera» produrrebbe un
 * documento che non cita niente.
 *
 * Da `retired` si torna in `active`: un modello si ritira anche per un anno
 * solo — la richiesta di visita medica non serve a febbraio — e riattivarlo
 * non deve costare una copia.
 */
const TEMPLATE_TRANSITIONS: Record<TemplateStatus, TemplateStatus[]> = {
  draft: ["active"],
  active: ["retired", "draft"],
  retired: ["active"],
};

export const canTransitionTemplate = (
  from: unknown,
  to: unknown,
): boolean => {
  const source = String(from || "").trim().toLowerCase();
  const target = String(to || "").trim().toLowerCase();
  if (!isTemplateStatus(source) || !isTemplateStatus(target)) return false;
  if (source === target) return true;
  return TEMPLATE_TRANSITIONS[source].includes(target as TemplateStatus);
};

/* --------------------------------------------------- documento generato */

/**
 * Lo stato di un documento generato.
 *
 * **«Firmato» significa una cosa sola** (ADR-0091): e rientrata una copia
 * firmata, caricata come allegato. Non e una firma digitale e la schermata non
 * la chiama cosi. Distinguere i quattro significati della parola «firma» e
 * l'unico modo di non promettere valore legale che non abbiamo.
 */
export const GENERATED_DOCUMENT_STATUSES = [
  "generated",
  "issued",
  "awaiting_signature",
  "signed",
  "rejected",
  "archived",
] as const;
export type GeneratedDocumentStatus =
  (typeof GENERATED_DOCUMENT_STATUSES)[number];

export const isGeneratedDocumentStatus = (
  value: unknown,
): value is GeneratedDocumentStatus =>
  (GENERATED_DOCUMENT_STATUSES as readonly string[]).includes(
    String(value || "").trim().toLowerCase(),
  );

const GENERATED_TRANSITIONS: Record<
  GeneratedDocumentStatus,
  GeneratedDocumentStatus[]
> = {
  generated: ["issued", "awaiting_signature", "archived"],
  issued: ["awaiting_signature", "archived"],
  awaiting_signature: ["signed", "rejected", "archived"],
  /*
    Da `signed` si torna indietro solo in `awaiting_signature`, e serve: capita
    che rientri la copia sbagliata. Non si torna a `generated`, perche il
    documento e gia uscito dalla porta.
  */
  signed: ["archived", "awaiting_signature"],
  rejected: ["awaiting_signature", "archived"],
  archived: [],
};

export const canTransitionGeneratedDocument = (
  from: unknown,
  to: unknown,
): boolean => {
  const source = String(from || "").trim().toLowerCase();
  const target = String(to || "").trim().toLowerCase();
  if (!isGeneratedDocumentStatus(source) || !isGeneratedDocumentStatus(target)) {
    return false;
  }
  if (source === target) return true;
  return GENERATED_TRANSITIONS[source].includes(
    target as GeneratedDocumentStatus,
  );
};

/**
 * Uno stato che dichiara una firma rientrata **pretende** l'allegato.
 *
 * Senza questa regola «firmato» diventerebbe una spunta, cioe esattamente cio
 * che ADR-0091 dice di non fare.
 */
export const requiresSignedAttachment = (status: unknown) =>
  String(status || "").trim().toLowerCase() === "signed";

/* --------------------------------------------------- la bozza pubblicabile */

export type TemplateDraft = {
  title: string;
  content: string;
  subjectKind: string;
};

export type TemplateValidationIssue = {
  /** `title` | `content` | `subject` | `placeholder`. */
  field: string;
  message: string;
  /** La chiave incriminata, quando l'errore riguarda un segnaposto. */
  key?: string;
};

export type TemplateValidationResult = {
  ok: boolean;
  issues: TemplateValidationIssue[];
  /** I segnaposto che il testo nomina, nell'ordine in cui compaiono. */
  placeholderKeys: string[];
  /** Le classi sensibili che il testo porta con se. */
  sensitivity: PlaceholderSensitivity[];
};

/**
 * Il limite di un contenuto, in caratteri.
 *
 * Non e un limite tecnico: un modello di documento e una pagina, al massimo
 * quattro. Oltre i 200 kB c'e quasi sempre un'immagine incollata dentro
 * l'HTML, e quell'immagine finirebbe **dentro ogni documento generato** — su
 * un lotto da cento, cento copie.
 */
export const MAX_TEMPLATE_CONTENT_CHARS = 200_000;

/**
 * Una bozza si puo pubblicare?
 *
 * **Il punto e il segnaposto fuori catalogo.** Fino alla Wave 2 un modello
 * poteva nominare `{{fiscalCode}}` — e il reperto e in casa: il «generatore
 * IA» di `/modulistica` lo scriveva — e il documento usciva con un campo
 * bianco per sempre, senza che nessuno lo sapesse prima. Qui la pubblicazione
 * si rifiuta e **dice quale chiave**: mai silenzio.
 *
 * Un segnaposto **fuori soggetto** e un errore diverso e piu gentile: la
 * chiave esiste, ma un modello che parla di un atleta non ha un allenatore a
 * cui riferirsi. Anche quello si dichiara, con il suo messaggio.
 */
export const validateTemplateDraft = (
  draft: TemplateDraft,
): TemplateValidationResult => {
  const issues: TemplateValidationIssue[] = [];
  const title = String(draft.title || "").trim();
  const content = String(draft.content || "");
  const subject = String(draft.subjectKind || "").trim().toLowerCase();

  if (!title) {
    issues.push({ field: "title", message: "Il modello deve avere un titolo" });
  }

  if (!content.trim()) {
    issues.push({
      field: "content",
      message: "Il modello e vuoto: non c'e niente da pubblicare",
    });
  }

  if (content.length > MAX_TEMPLATE_CONTENT_CHARS) {
    issues.push({
      field: "content",
      message: `Il modello supera ${Math.round(MAX_TEMPLATE_CONTENT_CHARS / 1000)} mila caratteri. Quasi sempre e un'immagine incollata dentro il testo: caricala come allegato del club`,
    });
  }

  if (!isTemplateSubjectKind(subject)) {
    issues.push({
      field: "subject",
      message: "Il modello deve dire di chi parla: club, atleta, persona o socio",
    });
  }

  const placeholderKeys = extractPlaceholderKeys(content);

  for (const key of placeholderKeys) {
    if (!isKnownPlaceholderKey(key)) {
      issues.push({
        field: "placeholder",
        key,
        message: `«${key}» non e un segnaposto di EasyGame: resterebbe vuoto per sempre`,
      });
      continue;
    }

    if (!isTemplateSubjectKind(subject)) continue;

    const keySubject = getPlaceholderSubject(key);
    const alwaysAvailable =
      keySubject === "club" ||
      keySubject === "document" ||
      keySubject === "system";

    if (!alwaysAvailable && keySubject !== subject) {
      issues.push({
        field: "placeholder",
        key,
        message: `«${key}» parla di ${keySubject}, ma questo modello parla di ${subject}: resterebbe vuoto`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    placeholderKeys,
    sensitivity: collectPlaceholderSensitivities(placeholderKeys),
  };
};

/**
 * Il numero della prossima versione.
 *
 * Banale, e sta qui apposta: e l'unico posto in cui si decide, cosi due lane
 * non possono contarlo in due modi. Le versioni partono da 1 e non da 0,
 * perche «versione 0» non e una cosa che si dice a una persona.
 */
export const nextTemplateVersion = (publishedVersion: unknown) => {
  const current = Number(publishedVersion || 0);
  return Number.isFinite(current) && current > 0 ? Math.trunc(current) + 1 : 1;
};

/**
 * Le invarianti che l'implementazione deve rispettare, in una forma leggibile
 * dai test.
 *
 * Non e decorazione: e la lista che la UAT del §19 del planning verifica una
 * per una, e averla in codice impedisce che si perda in un documento.
 */
export const DOCUMENT_ENGINE_INVARIANTS = [
  "Una versione pubblicata non si aggiorna mai: si pubblica una versione nuova.",
  "Un modello con documenti generati non si cancella: si ritira.",
  "Un documento generato cita la versione con cui e stato prodotto, e conserva la propria resa.",
  "Modificare un modello non cambia nessun documento gia generato.",
  "Un segnaposto fuori catalogo impedisce la pubblicazione, e viene detto quale.",
  "Un dato che manca resta bianco ed e dichiarato; non diventa mai «undefined».",
  "Un documento con dati sensibili non si genera a permesso mancante: si rifiuta, e dice perche.",
  "Un documento generato non e un allegato e non si legge dall'endpoint degli allegati.",
  "Dentro un lotto, uno stesso soggetto produce un documento solo.",
  "Una revoca di consenso non cancella l'accettazione: aggiunge una riga.",
] as const;

export type SubjectKind = TemplateSubjectKind;
