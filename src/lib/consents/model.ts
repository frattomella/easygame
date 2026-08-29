/**
 * Il dominio dei consensi: stati, sorgenti, soggetti, e la derivazione.
 *
 * **Perche un dominio e non una casella dentro un modulo** (ADR-0090, §7 del
 * documento 35). Un consenso non e la risposta a una domanda: e uno **stato di
 * una persona** che nasce, vale e finisce. Una compilazione e immutabile per
 * costruzione e non puo rappresentare una revoca — e la revoca e meta del
 * problema che il club ha davvero.
 *
 * **Perche una revoca non cancella niente.** Il registro e **append-only**: la
 * revoca di gennaio aggiunge una riga, non ne toglie una. Il consenso dato a
 * settembre resta dimostrabile, ed e esattamente cio che serve il giorno in cui
 * qualcuno contesta una foto pubblicata a ottobre: la domanda non e «vale
 * adesso?» ma «valeva quel giorno?», e a quella un archivio che cancella non sa
 * rispondere. E la stessa ragione per cui un incasso non si cancella ma si
 * storna (ADR-0062).
 *
 * **Perche lo stato non e una colonna.** Lo stato attuale e l'**ultima
 * decisione** per (definizione, soggetto): si ricava, non si scrive. Come per
 * lo stato di una rata e per quello di una scadenza del lavoro sportivo — una
 * colonna di stato accanto a uno storico e due risposte alla stessa domanda, e
 * prima o poi divergono.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano sia il servizio sia la schermata, perche «questa persona risulta
 * revocata» deve significare la stessa cosa nei due posti.
 */

/* ------------------------------------------------------------ vocabolario */

/**
 * Le tre decisioni possibili.
 *
 * `rejected` non e `revoked`, ed e una distinzione che serve: chi non ha mai
 * acconsentito e chi ha ritirato il consenso sono due situazioni diverse
 * davanti a chi chiede conto di una foto.
 */
export const CONSENT_STATUSES = ["accepted", "rejected", "revoked"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

const normalize = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

export const isConsentStatus = (value: unknown): value is ConsentStatus =>
  (CONSENT_STATUSES as readonly string[]).includes(normalize(value));

/**
 * Da dove arriva la decisione.
 *
 * Non e decorazione: «l'ha spuntata la famiglia sul modulo pubblico» e «l'ha
 * registrata la segreteria con un foglio in mano» hanno un valore probatorio
 * diverso, e chi legge il registro un anno dopo deve poterlo distinguere senza
 * aprire l'evidenza.
 */
export const CONSENT_SOURCES = [
  "public_form",
  "internal_form",
  "manual",
  "import",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const isConsentSource = (value: unknown): value is ConsentSource =>
  (CONSENT_SOURCES as readonly string[]).includes(normalize(value));

/**
 * A chi si riferisce un consenso.
 *
 * `guardian` c'e perche il consenso di un minore lo esprime chi ne ha la
 * responsabilita: attribuirlo all'atleta perderebbe **chi** ha deciso, che e
 * la prima cosa che viene chiesta quando la decisione viene contestata.
 */
export const CONSENT_SUBJECT_KINDS = [
  "athlete",
  "person",
  "member",
  "guardian",
] as const;
export type ConsentSubjectKind = (typeof CONSENT_SUBJECT_KINDS)[number];

export const isConsentSubjectKind = (
  value: unknown,
): value is ConsentSubjectKind =>
  (CONSENT_SUBJECT_KINDS as readonly string[]).includes(normalize(value));

/**
 * Lo stato di una definizione.
 *
 * `retired` non e `deleted`, per la stessa ragione per cui un modello ritirato
 * non si cancella (ADR-0092): una definizione ritirata non si propone piu, ma
 * **continua a spiegare** i consensi gia raccolti sulle sue versioni.
 */
export const CONSENT_DEFINITION_STATUSES = [
  "draft",
  "active",
  "retired",
] as const;
export type ConsentDefinitionStatus =
  (typeof CONSENT_DEFINITION_STATUSES)[number];

export const isConsentDefinitionStatus = (
  value: unknown,
): value is ConsentDefinitionStatus =>
  (CONSENT_DEFINITION_STATUSES as readonly string[]).includes(normalize(value));

/* -------------------------------------------- transizioni della definizione */

/**
 * Da `draft` si va in `active` **pubblicando**, cioe creando una versione: non
 * esiste una definizione attiva senza un testo, o si raccoglierebbe
 * un'accettazione che non cita niente.
 *
 * Da `retired` si torna in `active`: un consenso si sospende anche per una
 * stagione sola, e riattivarlo non deve costare una definizione nuova — che
 * spezzerebbe in due lo storico della stessa persona.
 */
const DEFINITION_TRANSITIONS: Record<
  ConsentDefinitionStatus,
  ConsentDefinitionStatus[]
> = {
  draft: ["active"],
  active: ["retired", "draft"],
  retired: ["active"],
};

export const canTransitionConsentDefinition = (
  from: unknown,
  to: unknown,
): boolean => {
  const source = normalize(from);
  const target = normalize(to);
  if (!isConsentDefinitionStatus(source) || !isConsentDefinitionStatus(target)) {
    return false;
  }
  if (source === target) return true;
  return DEFINITION_TRANSITIONS[source].includes(
    target as ConsentDefinitionStatus,
  );
};

/* ---------------------------------------------- transizioni della decisione */

/**
 * Le decisioni ammesse a partire dallo stato corrente.
 *
 * `null` significa «nessuna decisione finora». Le due regole che contano:
 *
 * - **non si revoca cio che non e mai stato dato.** Una revoca senza
 *   accettazione a monte non e un fatto: e un errore di chi sta registrando, e
 *   dirglielo subito costa meno che scoprire l'anno dopo un registro che
 *   racconta una storia impossibile;
 * - **si riaccetta sempre.** Dopo una revoca la stessa persona puo tornare a
 *   dire di si — succede a ogni versione nuova dell'informativa — e quella e
 *   una riga in piu, non la modifica della riga di prima.
 *
 * Un'accettazione ripetuta e ammessa e **non** e un doppione: e cio che accade
 * quando il club ripubblica il testo e ricontatta le famiglie.
 */
const DECISION_TRANSITIONS: Record<
  ConsentStatus | "missing",
  ConsentStatus[]
> = {
  missing: ["accepted", "rejected"],
  accepted: ["accepted", "revoked"],
  rejected: ["accepted", "rejected"],
  revoked: ["accepted"],
};

export const canApplyConsentDecision = (
  current: unknown,
  next: unknown,
): boolean => {
  const from = isConsentStatus(current) ? normalize(current) : "missing";
  const to = normalize(next);
  if (!isConsentStatus(to)) return false;
  return DECISION_TRANSITIONS[from as ConsentStatus | "missing"].includes(
    to as ConsentStatus,
  );
};

/**
 * Perche quella decisione non si puo registrare, detto a chi la sta
 * registrando. `null` quando si puo.
 *
 * Non e cosmetica: una segreteria che riceve «operazione non riuscita» chiama
 * l'assistenza, una che legge «non risulta un consenso da revocare» guarda il
 * soggetto che ha selezionato.
 */
export const explainConsentDecisionDenial = (
  current: unknown,
  next: unknown,
): string | null => {
  if (canApplyConsentDecision(current, next)) return null;

  const to = normalize(next);
  if (!isConsentStatus(to)) {
    return "Decisione sconosciuta: si registra accettazione, rifiuto o revoca";
  }

  const from = isConsentStatus(current) ? normalize(current) : "missing";

  if (to === "revoked" && from === "missing") {
    return "Non risulta nessun consenso da revocare per questo soggetto";
  }
  if (to === "revoked" && from === "rejected") {
    return "Il consenso risulta rifiutato, non dato: non c'e niente da revocare";
  }
  if (to === "revoked" && from === "revoked") {
    return "Il consenso risulta gia revocato";
  }
  if (to === "rejected" && from === "accepted") {
    return "Il consenso risulta dato: per ritirarlo si registra una revoca, non un rifiuto";
  }
  if (to === "rejected" && from === "revoked") {
    return "Il consenso risulta gia revocato";
  }

  return "Questa decisione non e ammessa a partire dallo stato attuale";
};

/* ------------------------------------------------------------- la chiave */

/**
 * La lunghezza massima di una chiave.
 *
 * Quaranta caratteri non e un limite tecnico: e la chiave con cui un campo di
 * un modulo nomina il consenso (`consent:<key>`), e una chiave che non si
 * ricorda a memoria non viene usata — viene ricreata uguale con un nome
 * diverso, che e il modo piu comune in cui un catalogo si sdoppia.
 */
export const MAX_CONSENT_KEY_LENGTH = 40;

const CONSENT_KEY_PATTERN = /^[a-z0-9_-]+$/;

export const normalizeConsentKey = (value: unknown) => normalize(value);

export const isValidConsentKey = (value: unknown) => {
  const key = normalizeConsentKey(value);
  return (
    key.length > 0 &&
    key.length <= MAX_CONSENT_KEY_LENGTH &&
    CONSENT_KEY_PATTERN.test(key)
  );
};

/** Il motivo per cui una chiave non va bene, o `null`. */
export const explainConsentKeyDenial = (value: unknown): string | null => {
  const key = normalizeConsentKey(value);
  if (!key) return "Il consenso deve avere una chiave, per esempio «privacy»";
  if (key.length > MAX_CONSENT_KEY_LENGTH) {
    return `La chiave supera ${MAX_CONSENT_KEY_LENGTH} caratteri`;
  }
  if (!CONSENT_KEY_PATTERN.test(key)) {
    return "La chiave ammette solo lettere minuscole, cifre, trattino e trattino basso";
  }
  return null;
};

/* ------------------------------------------------------------- le bozze */

export type ConsentDefinitionDraft = {
  key: string;
  title: string;
  description?: string | null;
  required?: boolean;
};

export type ConsentValidationIssue = {
  /** `key` | `title` | `body`. */
  field: string;
  message: string;
};

export type ConsentValidationResult = {
  ok: boolean;
  issues: ConsentValidationIssue[];
};

export const validateConsentDefinitionDraft = (
  draft: ConsentDefinitionDraft,
): ConsentValidationResult => {
  const issues: ConsentValidationIssue[] = [];

  const keyProblem = explainConsentKeyDenial(draft?.key);
  if (keyProblem) issues.push({ field: "key", message: keyProblem });

  if (!String(draft?.title || "").trim()) {
    issues.push({
      field: "title",
      message: "Il consenso deve avere un titolo leggibile dalla famiglia",
    });
  }

  return { ok: issues.length === 0, issues };
};

/**
 * Il limite del testo di una versione.
 *
 * Un'informativa privacy lunga esiste davvero; una da mezzo megabyte no, ed e
 * quasi sempre un incollato che porta dentro markup di un altro programma.
 */
export const MAX_CONSENT_BODY_CHARS = 100_000;

export const validateConsentVersionDraft = (draft: {
  title?: string | null;
  bodyText?: string | null;
}): ConsentValidationResult => {
  const issues: ConsentValidationIssue[] = [];
  const body = String(draft?.bodyText || "");

  if (!body.trim()) {
    issues.push({
      field: "body",
      message: "Il testo del consenso e vuoto: non c'e niente da accettare",
    });
  }

  if (body.length > MAX_CONSENT_BODY_CHARS) {
    issues.push({
      field: "body",
      message: `Il testo supera ${Math.round(MAX_CONSENT_BODY_CHARS / 1000)} mila caratteri`,
    });
  }

  return { ok: issues.length === 0, issues };
};

/**
 * Il numero della prossima versione.
 *
 * Sta qui apposta, come `nextTemplateVersion` per i modelli: e l'unico posto in
 * cui si decide, cosi due lane non possono contarlo in due modi. Le versioni
 * partono da 1 e non da 0, perche «versione 0» non e una cosa che si dice a una
 * persona.
 */
export const nextConsentVersion = (publishedVersion: unknown) => {
  const current = Number(publishedVersion || 0);
  return Number.isFinite(current) && current > 0 ? Math.trunc(current) + 1 : 1;
};

/* --------------------------------------------------------- la derivazione */

export type ConsentRecordInput = {
  id?: string | null;
  definitionId?: string | null;
  subjectKind?: string | null;
  subjectId?: string | null;
  versionId?: string | null;
  /** Il numero della versione citata, quando lo si conosce. */
  version?: number | null;
  status: string;
  decidedAt?: string | Date | null;
  createdAt?: string | Date | null;
};

export type ConsentState = {
  /** `missing` quando per quel soggetto non c'e nessuna decisione. */
  status: ConsentStatus | "missing";
  recordId: string | null;
  versionId: string | null;
  version: number | null;
  /** ISO 8601, o `null` se non c'e ancora nessuna decisione. */
  decidedAt: string | null;
  /**
   * La decisione valida cita una versione **precedente** a quella pubblicata.
   *
   * Non e un errore e non invalida niente (§7.3, regola 3): e il club a
   * decidere se richiedere il consenso sul testo nuovo. Qui si dichiara, e
   * basta.
   */
  onOutdatedVersion: boolean;
  /** Quante decisioni compongono lo storico, revoche comprese. */
  historyCount: number;
};

const toTime = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  const text = String(value ?? "").trim();
  if (!text) return Number.NaN;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
};

const toIso = (value: unknown): string | null => {
  const time = toTime(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

/**
 * L'ordine con cui si legge lo storico: dalla decisione piu vecchia alla piu
 * recente.
 *
 * **A parita di istante l'ordine non puo essere quello di arrivo.** Due righe
 * con lo stesso `decided_at` capitano davvero — un'importazione che porta la
 * data del giorno, una segreteria che registra due gesti nello stesso minuto —
 * e se lo spareggio lo facesse l'ordinamento del database, «questa persona ha
 * revocato» diventerebbe una risposta che cambia da una query all'altra. Lo
 * spareggio e quindi `created_at` e, quando anche quello coincide, `id`: non
 * perche l'identificativo significhi qualcosa, ma perche e **stabile**.
 */
const compareRecords = (left: ConsentRecordInput, right: ConsentRecordInput) => {
  const decidedLeft = toTime(left.decidedAt);
  const decidedRight = toTime(right.decidedAt);
  /*
    **Una data illeggibile va in cima, non in fondo.**

    Con `-Infinity` una revoca la cui data si fosse corrotta finiva prima di
    qualunque accettazione, e quindi non contava piu: una riga di cui non si sa
    la data non deve poter **sparire**. Spingendola in avanti resta l ultima —
    cioe visibile, e sospetta, che e cio che serve a chi la guarda.
  */
  const safeLeft = Number.isNaN(decidedLeft) ? Number.POSITIVE_INFINITY : decidedLeft;
  const safeRight = Number.isNaN(decidedRight) ? Number.POSITIVE_INFINITY : decidedRight;
  if (safeLeft !== safeRight) return safeLeft - safeRight;

  const createdLeft = toTime(left.createdAt);
  const createdRight = toTime(right.createdAt);
  const bornLeft = Number.isNaN(createdLeft) ? Number.NEGATIVE_INFINITY : createdLeft;
  const bornRight = Number.isNaN(createdRight) ? Number.NEGATIVE_INFINITY : createdRight;
  if (bornLeft !== bornRight) return bornLeft - bornRight;

  const idLeft = String(left.id || "");
  const idRight = String(right.id || "");
  return idLeft < idRight ? -1 : idLeft > idRight ? 1 : 0;
};

/** Lo storico ordinato, con le righe illeggibili scartate. */
export const sortConsentRecords = (
  records: readonly ConsentRecordInput[] | null | undefined,
): ConsentRecordInput[] =>
  (records || [])
    .filter((record) => record && isConsentStatus(record.status))
    .slice()
    .sort(compareRecords);

/**
 * Lo stato attuale per un soggetto, ricavato dallo storico.
 *
 * `publishedVersion` e il numero di versione che la definizione pubblica
 * **adesso**: serve solo a dire se la decisione valida sta su un testo
 * superato. Ometterlo produce uno stato corretto con `onOutdatedVersion` a
 * `false`, che e cio che si vuole quando la definizione non e ancora
 * pubblicata.
 */
export const deriveConsentState = (
  records: readonly ConsentRecordInput[] | null | undefined,
  options: { publishedVersion?: number | null } = {},
): ConsentState => {
  const ordered = sortConsentRecords(records);
  const last = ordered[ordered.length - 1] || null;

  if (!last) {
    return {
      status: "missing",
      recordId: null,
      versionId: null,
      version: null,
      decidedAt: null,
      onOutdatedVersion: false,
      historyCount: 0,
    };
  }

  const version =
    last.version === null || last.version === undefined
      ? null
      : Number(last.version);
  const published = Number(options.publishedVersion || 0);

  return {
    status: normalize(last.status) as ConsentStatus,
    recordId: last.id ? String(last.id) : null,
    versionId: last.versionId ? String(last.versionId) : null,
    version: version !== null && Number.isFinite(version) ? version : null,
    decidedAt: toIso(last.decidedAt),
    /*
      Solo una decisione **valida** puo essere «su una versione superata»: di
      una revoca non interessa su quale testo e stata registrata, interessa che
      c'e stata.
    */
    onOutdatedVersion:
      normalize(last.status) === "accepted" &&
      version !== null &&
      Number.isFinite(version) &&
      published > 0 &&
      version < published,
    historyCount: ordered.length,
  };
};

/**
 * La chiave con cui si raggruppa uno storico per soggetto.
 *
 * Esiste per non farla scrivere due volte: il servizio raggruppa, la schermata
 * confronta, e due modi di comporre la stessa chiave sono due elenchi che non
 * corrispondono.
 */
export const consentSubjectKey = (
  subjectKind: unknown,
  subjectId: unknown,
) => `${normalize(subjectKind)}:${String(subjectId ?? "").trim()}`;

/**
 * Le invarianti del dominio, in una forma leggibile dai test.
 *
 * Non e decorazione: e la lista che la UAT verifica una per una, e averla in
 * codice impedisce che si perda dentro un documento.
 */
export const CONSENT_INVARIANTS = [
  "Una revoca non cancella l'accettazione: aggiunge una riga.",
  "Lo stato attuale non e una colonna: e l'ultima decisione per (definizione, soggetto).",
  "A parita di istante l'ordine e deterministico: created_at, poi id.",
  "Una versione pubblicata non si aggiorna mai: si pubblica una versione nuova.",
  "Una versione nuova non invalida i consensi vecchi: li segnala come dati su una versione precedente.",
  "Non si revoca un consenso che non risulta dato.",
  "L'evidenza e un puntatore, non una copia: la compilazione resta dove sta.",
  "Una definizione con consensi raccolti non si cancella: si ritira.",
] as const;
