import { getAnswerableFields, type FormSchema } from "./model";
import { FORM_SUBJECTS, type FormSubjectKey } from "./dynamic-fields";
import type { ConsentSubjectKind } from "@/lib/consents/model";

/**
 * Cio che un'approvazione produce **oltre** all'anagrafica: un consenso e un
 * documento (W3-F).
 *
 * Modulo **puro**: nessun Prisma, nessuna rete. Sta qui e non dentro
 * `form-submissions.ts` perche le tre domande che risolve — «quale soggetto
 * dei consensi e questo soggetto di un modulo», «quale soggetto documentale»,
 * «quali spunte dichiarano un consenso» — sono traduzioni fra vocabolari, e
 * una traduzione sbagliata scrive nel posto giusto il dato di un'altra
 * persona. Si prova senza avviare un database.
 */

/**
 * Il tipo di evidenza con cui un consenso cita la compilazione che lo prova.
 *
 * Costante e non stringa sparsa: e la chiave con cui l'indice
 * `(organization_id, evidence_kind, evidence_id)` di `consent_records` viene
 * interrogato, e due grafie diverse sono due registri che non si parlano.
 */
export const FORM_SUBMISSION_EVIDENCE_KIND = "form_submission";

/**
 * Il lotto sotto cui vive il documento nato da una compilazione.
 *
 * **E qui che sta l'idempotenza del documento.** Non e un lotto vero — un
 * documento solo — ma e la forma in cui `generated_documents` sa gia dire «di
 * questo (club, lotto, soggetto) ne esiste uno»: l'indice unico
 * `(organization_id, batch_id, subject_kind, subject_id)` fa il lavoro **nel
 * database**, e un valore derivato dalla compilazione lo rende deterministico.
 * Riapprovare, ricaricare, ritentare dopo un errore a meta non producono un
 * secondo foglio.
 *
 * E anche **il riferimento** che la compilazione conserva: `form_submissions`
 * non ha una colonna per il documento, e il documento generato da una
 * compilazione si ritrova chiedendo questo `batch_id`.
 */
export const buildSubmissionDocumentBatchId = (submissionId: string) =>
  `form:${String(submissionId ?? "").trim()}`;

/* ------------------------------------------------------- i due vocabolari */

/**
 * Da soggetto di un modulo a soggetto di un consenso.
 *
 * `club` non c'e: un consenso lo esprime una persona, non una societa.
 * `guardian` non c'e **anche se il dominio dei consensi lo prevede**: dentro
 * un modulo il tutore non e un record, e la posizione `n` nell'elenco dei
 * tutori di un atleta, e una posizione non e un identificativo — riordinare
 * l'elenco sposterebbe il consenso su un'altra persona. Finche il tutore non
 * ha una riga sua, un consenso raccolto da un modulo si attribuisce
 * all'atleta, che e il soggetto di cui il modulo parla.
 */
const CONSENT_SUBJECT_BY_FORM_SUBJECT: Partial<
  Record<FormSubjectKey, ConsentSubjectKind>
> = {
  athlete: "athlete",
  trainer: "person",
  staff: "person",
  member: "member",
};

/**
 * Da soggetto di un modulo a soggetto di un documento.
 *
 * `person` copre allenatori e staff, come per il risolutore dei segnaposto:
 * le due collezioni sono separate nell'interfaccia, il soggetto e uno solo.
 */
const DOCUMENT_SUBJECT_BY_FORM_SUBJECT: Partial<
  Record<FormSubjectKey, "athlete" | "person" | "member">
> = {
  athlete: "athlete",
  trainer: "person",
  staff: "person",
  member: "member",
};

export const consentSubjectKindForFormSubject = (
  subject: FormSubjectKey,
): ConsentSubjectKind | null =>
  CONSENT_SUBJECT_BY_FORM_SUBJECT[subject] || null;

export const documentSubjectKindForFormSubject = (
  subject: FormSubjectKey,
): "athlete" | "person" | "member" | null =>
  DOCUMENT_SUBJECT_BY_FORM_SUBJECT[subject] || null;

/* ------------------------------------------------- il soggetto principale */

export type ApprovedSubject = {
  subject: FormSubjectKey;
  recordId: string;
  label: string;
};

/**
 * L'ordine in cui si sceglie **di chi** parla un'approvazione.
 *
 * Un modulo puo toccare piu soggetti — l'atleta e il suo tutore, il socio e il
 * club — ma il consenso e il documento hanno un destinatario solo. L'atleta
 * viene per primo perche e il soggetto di quasi ogni modulo pubblico; il club
 * non compare, perche non e una persona a cui intestare un consenso.
 */
const SUBJECT_PRIORITY: FormSubjectKey[] = [
  "athlete",
  "member",
  "trainer",
  "staff",
];

/**
 * La persona che l'approvazione ha creato o aggiornato.
 *
 * `null` quando non ce n'e una: un modulo di sole domande libere non ha
 * nessuno a cui intestare un consenso, e inventarne uno sarebbe peggio che
 * non registrarlo.
 */
export const pickApprovedSubject = (
  candidates: Array<{ subject: FormSubjectKey; recordId: string; label?: string }>,
): ApprovedSubject | null => {
  for (const wanted of SUBJECT_PRIORITY) {
    const found = candidates.find(
      (candidate) =>
        candidate.subject === wanted && String(candidate.recordId || "").trim(),
    );
    if (found) {
      return {
        subject: found.subject,
        recordId: String(found.recordId).trim(),
        label: String(found.label || "").trim(),
      };
    }
  }

  return null;
};

/** Come si chiama il soggetto nell'interfaccia: serve ai messaggi di esito. */
export const describeFormSubject = (subject: FormSubjectKey) =>
  FORM_SUBJECTS[subject]?.label || subject;

/* ---------------------------------------------------------- le dichiarazioni */

export type FormConsentDeclaration = {
  fieldId: string;
  fieldLabel: string;
  consentKey: string;
  /** Vero se la casella e stata spuntata. */
  accepted: boolean;
};

/**
 * Le spunte che dichiarano un consenso, con la decisione che esprimono.
 *
 * **Una casella non spuntata non e un'assenza.** `validateAnswers` non salva
 * il `false` — una casella vuota semplicemente non compare fra le risposte —
 * ma un consenso non raccolto e un fatto: «ha rifiutato» e «non gli e mai
 * stato chiesto» sono due situazioni diverse davanti a chi chiede conto di una
 * foto. Per questo si guarda il campo del modulo, non le chiavi delle
 * risposte, e cio che manca diventa `rejected`.
 */
export const collectConsentDeclarations = (
  schema: FormSchema,
  answers: Record<string, unknown>,
): FormConsentDeclaration[] =>
  getAnswerableFields(schema)
    .filter((field) => Boolean(field.consentKey))
    .map((field) => ({
      fieldId: field.id,
      fieldLabel: field.label,
      consentKey: field.consentKey,
      accepted: answers?.[field.id] === true,
    }));
