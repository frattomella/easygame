import { createHash, randomBytes } from "crypto";

import { buildPrefilledAnswers, type SubjectRecords } from "./prefill";
import { type FormSchema, type FormSubmissionStatus } from "./model";

/**
 * **Il riscontro alla famiglia** su una domanda di iscrizione o di rinnovo
 * (Wave 5, lane 5G, §16). Modulo puro: nessuna riga di questo file conosce
 * Prisma, e si prova senza database.
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * Il motore dei moduli era corretto e lo resta: pagina pubblica senza
 * sessione, limite di frequenza per indirizzo, errori collassati a 404,
 * versione immutabile citata dalla compilazione, e — la regola d'oro —
 * l'anagrafica che nasce **solo** all'approvazione umana (ADR-0040).
 *
 * Quello che non c'era e il verso opposto: **l'iscrizione online esisteva per
 * il club e non per la famiglia**. Si inviava, e poi non si sapeva piu niente.
 * Nessuna ricevuta, nessuno stato, nessun modo di sapere che era stata
 * approvata. Qui vivono le tre regole che chiudono quel vuoto senza aprirne
 * uno nuovo:
 *
 * 1. **la ricevuta e una credenziale, non un identificativo.** Si consegna una
 *    volta sola a chi invia; in archivio resta solo l'impronta, come per i link
 *    di pagamento (ADR-0085). Chi legge il database non puo aprire la pratica
 *    di nessuno;
 * 2. **lo stato si deriva, non si scrive.** La colonna dice `pending`,
 *    `approved`, `rejected`: cio che la famiglia legge tiene conto anche di
 *    cosa il club sta ancora aspettando, e nessuno lo scrive da nessuna parte;
 * 3. **la vista pubblica e un elenco chiuso di campi.** Non e la compilazione
 *    con qualche campo tolto: e un oggetto costruito da zero, perche togliere
 *    si dimentica e aggiungere no.
 */

const asText = (value: unknown) => String(value ?? "").trim();

/* ---------------------------------------------------------- la ricevuta */

/** Trentadue byte da `crypto.randomBytes`: 256 bit, non enumerabili. */
export const ENROLLMENT_RECEIPT_BYTES = 32;

/**
 * Il riferimento in chiaro. **Url-safe** perche vive dentro un percorso HTTP e
 * dentro il corpo di una email: una codifica che produce `+` e `/` diventa un
 * link che si rompe in un client di posta senza che nessuno sappia perche.
 */
export const generateEnrollmentReceiptReference = () =>
  randomBytes(ENROLLMENT_RECEIPT_BYTES).toString("base64url");

/**
 * Lo SHA-256 del riferimento: **e l'unica cosa che entra in archivio**.
 *
 * Nessun sale e nessuna derivazione lenta, per la stessa ragione dei link di
 * pagamento: il riferimento ha 256 bit di entropia vera e non e una parola
 * scelta da una persona. Un dizionario non lo attacca, e un hash lento
 * renderebbe costosa ogni lettura di stato senza togliere niente a chi legge
 * il database.
 */
export const hashEnrollmentReceiptReference = (reference: unknown) => {
  const normalized = asText(reference);
  if (!normalized) return "";
  return createHash("sha256").update(normalized).digest("hex");
};

/**
 * Confronto a tempo costante fra due impronte.
 *
 * Un confronto normale esce al primo carattere diverso, e il tempo di risposta
 * racconta quanti caratteri erano giusti. E la stessa forma di
 * `paymentLinkHashesMatch`.
 */
export const enrollmentReceiptHashesMatch = (left: string, right: string) => {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (left.length === 0 || left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

/* --------------------------------------------------- il doppio invio */

/** La finestra dentro cui due invii identici sono **lo stesso** invio. */
export const SUBMISSION_DEDUP_WINDOW_MS = 10 * 60 * 1000;

export type SubmissionDedupInput = {
  templateId: unknown;
  versionId: unknown;
  /** Chi compila: l'account se c'e, altrimenti l'indirizzo dichiarato. */
  respondent: unknown;
  answers: unknown;
  /** Nome e dimensione degli allegati in arrivo, nell'ordine in cui arrivano. */
  files?: ReadonlyArray<{ fieldId?: unknown; fileName?: unknown; sizeBytes?: unknown }>;
  /** L'istante dell'invio, in millisecondi. */
  nowMs: number;
  windowMs?: number;
};

/**
 * La chiave che rende **uno** un invio ripetuto.
 *
 * Il difetto misurato: due invii paralleli della stessa domanda producevano due
 * pratiche `pending` e due copie di ogni allegato, perche niente le legava. La
 * segreteria se le trovava entrambe in coda, e ADR-0040 dice che un duplicato si
 * mostra e non si risolve da solo — quindi restavano.
 *
 * **Cosa entra nella chiave, e perche ognuna delle quattro cose.** Il modulo e
 * la sua versione, perche lo stesso testo compilato su una versione nuova e una
 * domanda nuova; chi compila, perche due famiglie possono inviare risposte
 * identiche — due moduli quasi vuoti si somigliano — e non vanno fuse; **il
 * contenuto**, perche una correzione inviata subito dopo e un invio diverso e
 * deve passare; e gli allegati per nome e dimensione, perche cambiare solo il
 * file caricato cambia la domanda.
 *
 * **Perche c'e una finestra.** Senza, la stessa famiglia non potrebbe piu
 * reinviare quel modulo con quelle risposte — mai piu, nemmeno l'anno dopo. La
 * finestra dice cosa stiamo davvero difendendo: non l'unicita della domanda, ma
 * il **gesto ripetuto** — un doppio clic, due schede aperte, una richiesta che
 * la rete ha ritentato.
 *
 * **Perche il tempo sta dentro la chiave e non in un controllo.** Con due
 * richieste concorrenti un controllo in memoria non regge: leggono entrambe
 * «non c'e» e scrivono entrambe. Solo un indice unico decide. Il prezzo e il
 * bordo: due invii a cavallo di un intervallo cadono in due chiavi diverse e
 * passano entrambi. Si sceglie un intervallo largo rispetto al gesto che si
 * difende — un doppio clic dista millisecondi, non minuti — e il bordo diventa
 * un caso raro che sbaglia **verso il permettere**, che e il verso giusto: una
 * domanda in piu si scarta, una domanda persa no.
 */
export const buildSubmissionDedupKey = (input: SubmissionDedupInput) => {
  const finestra = Number(input.windowMs) > 0
    ? Number(input.windowMs)
    : SUBMISSION_DEDUP_WINDOW_MS;

  const intervallo = Math.floor(Number(input.nowMs || 0) / finestra);

  const allegati = (input.files || []).map((file) =>
    [
      asText(file?.fieldId),
      asText(file?.fileName),
      String(Number(file?.sizeBytes) || 0),
    ].join(":"),
  );

  /*
    `JSON.stringify` sulle risposte: due oggetti con le stesse chiavi scritte
    in ordine diverso darebbero chiavi diverse — ma le risposte arrivano dal
    modulo, non da mani diverse, e l'ordine dei campi e quello dello schema.
    Normalizzarlo costerebbe una ricorsione su una struttura che il chiamante
    puo annidare a piacere, per un caso che nel gesto difeso non si presenta.
  */
  const materiale = [
    asText(input.templateId),
    asText(input.versionId),
    asText(input.respondent).toLowerCase(),
    String(intervallo),
    JSON.stringify(input.answers ?? {}),
    allegati.join("|"),
  ].join("\n");

  return createHash("sha256").update(materiale).digest("hex");
};

/** Il percorso pubblico di una ricevuta. Un posto solo per non sbagliarlo. */
export const buildEnrollmentReceiptPath = (reference: string) =>
  `/iscrizione/${encodeURIComponent(asText(reference))}`;

/**
 * Il messaggio che accompagna ogni esito negativo della lettura pubblica.
 *
 * **Uno solo per tutti i casi.** Riferimento vuoto, sconosciuto, o che punta a
 * una pratica sparita: sempre lo stesso. Distinguerli direbbe a chi prova
 * riferimenti a caso quando ne ha indovinato uno — ed e la stessa regola che
 * lo slug dei moduli pubblici applica gia.
 */
export const ENROLLMENT_NOT_AVAILABLE_MESSAGE =
  "Domanda non disponibile";

/* ------------------------------------------------------- che cosa e questa */

/** Iscrizione nuova, oppure rinnovo di una gia esistente. */
export const ENROLLMENT_KINDS = ["enrollment", "renewal"] as const;

export type EnrollmentKind = (typeof ENROLLMENT_KINDS)[number];

export const ENROLLMENT_KIND_LABELS: Record<EnrollmentKind, string> = {
  enrollment: "Iscrizione",
  renewal: "Rinnovo",
};

export const normalizeEnrollmentKind = (value: unknown): EnrollmentKind =>
  asText(value) === "renewal" ? "renewal" : "enrollment";

/* ---------------------------------------------------------- lo stato */

/**
 * Lo stato **come lo legge la famiglia**, che non e la colonna.
 *
 * - `sent` — e arrivata, e nessuno l'ha ancora aperta;
 * - `in_review` — la segreteria l'ha presa in mano e aspetta qualcosa: c'e
 *   almeno una richiesta documentale aperta sulla pratica;
 * - `approved` — approvata;
 * - `rejected` — respinta, e il motivo si legge.
 */
export const FAMILY_ENROLLMENT_STATES = [
  "sent",
  "in_review",
  "approved",
  "rejected",
] as const;

export type FamilyEnrollmentState = (typeof FAMILY_ENROLLMENT_STATES)[number];

export const FAMILY_ENROLLMENT_STATE_LABELS: Record<
  FamilyEnrollmentState,
  string
> = {
  sent: "Inviata",
  in_review: "In lavorazione",
  approved: "Approvata",
  rejected: "Respinta",
};

export type FamilyEnrollmentStateInput = {
  status: FormSubmissionStatus | string;
  /** Quante richieste documentali aperte pendono su questa pratica. */
  openDocumentRequests?: number;
};

/**
 * Lo stato visibile alla famiglia, **ricavato** e mai scritto.
 *
 * Perche non basta la colonna: `pending` copre sia «e arrivata» sia «la stiamo
 * lavorando e ti abbiamo chiesto un documento», e sono due risposte diverse
 * alla stessa domanda della famiglia — «devo fare qualcosa?». La differenza
 * non e un campo nuovo: e la presenza di una richiesta documentale aperta, che
 * il fascicolo gia sa e che nessuno deve ricopiare qui.
 *
 * L'ordine di precedenza e deliberato: una decisione presa **vince** su cio
 * che resta da consegnare. Una domanda approvata resta approvata anche se
 * manca ancora il certificato medico — il documento atteso si mostra accanto,
 * non al posto dell'esito, o la famiglia crederebbe di essere ancora in coda.
 */
export const deriveFamilyEnrollmentState = (
  input: FamilyEnrollmentStateInput,
): FamilyEnrollmentState => {
  const status = asText(input.status);
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";

  return Number(input.openDocumentRequests || 0) > 0 ? "in_review" : "sent";
};

/* --------------------------------------------------- la vista pubblica */

/** Un documento che il club aspetta, come lo vede chi ha solo la ricevuta. */
export type FamilyPendingDocument = {
  title: string;
  dueDate: string | null;
  required: boolean;
};

export type PublicEnrollmentViewInput = {
  kind: unknown;
  status: FormSubmissionStatus | string;
  clubName: unknown;
  templateTitle: unknown;
  seasonLabel?: unknown;
  submittedAt: unknown;
  reviewedAt?: unknown;
  reviewNote?: unknown;
  pendingDocuments?: FamilyPendingDocument[];
};

export type PublicEnrollmentView = {
  kind: EnrollmentKind;
  kindLabel: string;
  state: FamilyEnrollmentState;
  stateLabel: string;
  clubName: string;
  templateTitle: string;
  seasonLabel: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string;
  pendingDocuments: FamilyPendingDocument[];
};

/**
 * Cosa esce dalla lettura pubblica di una ricevuta, campo per campo.
 *
 * **Si costruisce da zero, non si toglie da un record.** Una vista scritta come
 * `{ ...submission, answers: undefined }` sopravvive fino alla prima colonna
 * nuova, e quel giorno la colonna nuova esce da un endpoint senza sessione.
 * Qui l'elenco e chiuso: cio che non e scritto sotto non puo uscire.
 *
 * **Cosa resta dentro, e perche.** Le risposte del modulo — che sono la
 * dichiarazione della famiglia su un minore, codice fiscale compreso — non
 * escono: chi ha la ricevuta ha diritto di sapere **a che punto e** la
 * pratica, non di rileggersi l'anagrafica dalla rete. Non escono nemmeno gli
 * allegati, i soggetti collegati, l'indirizzo di chi ha compilato, e nessun
 * identificativo interno: chi ha un link non ha per questo il diritto di
 * sapere come sono fatte le chiavi dell'archivio di un club, e un
 * identificativo di atleta in mano a un estraneo e la chiave con cui si
 * bussa a tutte le altre porte.
 */
export const buildPublicEnrollmentView = (
  input: PublicEnrollmentViewInput,
): PublicEnrollmentView => {
  const kind = normalizeEnrollmentKind(input.kind);
  const pendingDocuments = (input.pendingDocuments || []).map((document) => ({
    title: asText(document.title),
    dueDate: document.dueDate ? asText(document.dueDate) : null,
    required: Boolean(document.required),
  }));

  const state = deriveFamilyEnrollmentState({
    status: input.status,
    openDocumentRequests: pendingDocuments.length,
  });

  return {
    kind,
    kindLabel: ENROLLMENT_KIND_LABELS[kind],
    state,
    stateLabel: FAMILY_ENROLLMENT_STATE_LABELS[state],
    clubName: asText(input.clubName),
    templateTitle: asText(input.templateTitle),
    seasonLabel: asText(input.seasonLabel),
    submittedAt: asText(input.submittedAt),
    reviewedAt: input.reviewedAt ? asText(input.reviewedAt) : null,
    /*
      Il motivo si mostra su entrambe le decisioni e non solo sul rifiuto: una
      nota scritta dalla segreteria e scritta **per** la famiglia, e tenerla
      nascosta su un'approvazione con riserva obbligherebbe a telefonare.
    */
    reviewNote: asText(input.reviewNote),
    pendingDocuments,
  };
};

/* ------------------------------------------------------------ il rinnovo */

export type RenewalDraft = {
  seasonId: string;
  seasonLabel: string;
  answers: Record<string, unknown>;
  /** Gli identificativi dei campi che arrivano dall'archivio, non dall'utente. */
  prefilledFieldIds: string[];
};

export type RenewalDraftInput = {
  schema: FormSchema;
  records: SubjectRecords;
  seasonId: unknown;
  seasonLabel: unknown;
};

/**
 * La bozza di un rinnovo: **lo stesso modulo, con un contesto**.
 *
 * Non e un secondo motore, e non deve diventarlo. Il rinnovo e una compilazione
 * del modulo di iscrizione gia pubblicato, precompilata con cio che il club sa
 * gia e con la stagione di destinazione citata; la famiglia conferma o
 * corregge, la segreteria approva. Il riporto stagionale resta gestionale e
 * non passa di qui.
 *
 * La precompilazione la fa `buildPrefilledAnswers`, che e gia il proprietario
 * di quella regola — compresi i due casi che si sbagliano da soli: un allegato
 * non si precompila mai, e un campo a scelta si riempie solo se il valore noto
 * e davvero fra le opzioni, altrimenti la tendina mostrerebbe qualcosa che non
 * si puo selezionare.
 */
export const buildRenewalDraftAnswers = (
  input: RenewalDraftInput,
): RenewalDraft => {
  const answers = buildPrefilledAnswers(input.schema, input.records);

  return {
    seasonId: asText(input.seasonId),
    seasonLabel: asText(input.seasonLabel),
    answers,
    prefilledFieldIds: Object.keys(answers),
  };
};

/**
 * La famiglia a cui una pratica appartiene, come predicato **puro**.
 *
 * **Perche non e una clausola `where`.** I soggetti di una compilazione vivono
 * in una colonna JSON senza indice: filtrarli in SQL vorrebbe dire un
 * `array_contains` sulla forma esatta dell'oggetto, che si rompe il giorno in
 * cui a `FormSubjectSelection` si aggiunge un campo. Ma soprattutto: questo
 * predicato **e** l'autorizzazione, e un'autorizzazione sparsa fra una
 * clausola e un filtro in memoria e un'autorizzazione che un giorno viene
 * applicata a meta.
 *
 * Due legami, e nessun altro:
 *
 * - la pratica e stata **inviata da questo account** (`submitted_by`);
 * - la pratica e **intestata a un atleta collegato** a questo account, cioe a
 *   uno di quelli che `canParentAccessAthlete` ha gia riconosciuto.
 *
 * **Cosa non e un legame: l'indirizzo email.** `respondent_email` e testo
 * libero digitato in un modulo pubblico da chi non ha nessuna sessione.
 * Trattarlo come identita significherebbe che chiunque, scrivendo l'indirizzo
 * di un'altra famiglia, decide cosa compare fra le pratiche di quella
 * famiglia. Un indirizzo non verificato non e nessuno.
 */
export const submissionBelongsToFamily = (
  submission: {
    submittedBy?: unknown;
    subjects?: Array<{ subject?: unknown; recordId?: unknown }> | null;
  },
  family: { userId: unknown; athleteIds: readonly string[] },
) => {
  const userId = asText(family.userId);
  if (userId && asText(submission.submittedBy) === userId) return true;

  const athleteIds = new Set(
    (family.athleteIds || []).map((id) => asText(id)).filter(Boolean),
  );
  if (athleteIds.size === 0) return false;

  return (submission.subjects || []).some(
    (selection) =>
      asText(selection?.subject) === "athlete" &&
      athleteIds.has(asText(selection?.recordId)),
  );
};
