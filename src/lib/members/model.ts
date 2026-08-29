/**
 * Il dominio del libro soci: gli eventi, il numero, e la derivazione dello
 * stato.
 *
 * **Perche un registro e non una colonna** (Wave 4, §19). Un socio in
 * `clubs.members` ha oggi uno stato binario — attivo / non attivo — che
 * qualcuno sovrascrive. Sovrascrivere e la cosa che un libro non puo fare: un
 * elenco dice **chi e socio adesso**, un libro dice **chi era socio il 12 marzo
 * 2026**. La seconda domanda non e accademica — la decommercializzazione di
 * un'entrata dipende dalla qualifica della controparte **al momento
 * dell'operazione** (§32.5), e a quella un archivio che sovrascrive non sa
 * rispondere.
 *
 * **Perche append-only.** Una dimissione non cancella l'ammissione: aggiunge
 * una riga. E la stessa forma dei consensi della Wave 3 e dello storno di un
 * incasso (ADR-0062), e per la stessa ragione: cio che e stato vero deve
 * restare dimostrabile dopo che ha smesso di esserlo.
 *
 * **Perche lo stato non e un flag.** Si ricava dall'ultimo evento **efficace**
 * a una data. Una colonna di stato accanto a uno storico sono due risposte alla
 * stessa domanda, e prima o poi divergono.
 *
 * **Cosa questo modulo non e.** Non e una seconda anagrafica: il socio resta
 * dove sta, in `clubs.members`. Qui c'e solo la sua storia associativa. E non e
 * il tesseramento: essere tesserato e essere socio sono due qualita diverse
 * della stessa persona, e confonderle produce un libro che nessuno puo usare.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano sia il servizio sia la schermata, perche «questa persona era socio
 * quel giorno» deve significare la stessa cosa nei due posti.
 */

/* ------------------------------------------------------------ vocabolario */

/**
 * I cinque eventi, e non uno di piu. Sono gli stessi che il vincolo
 * `membership_events_tipo_check` ammette in migrazione: se qui ne comparisse un
 * sesto, il database lo rifiuterebbe a scrittura gia accettata.
 *
 * `LAPSE` non e `RESIGNATION`: chi se ne va e chi smette di pagare escono dal
 * libro per ragioni diverse, e il giorno in cui qualcuno contesta l'esclusione
 * dall'assemblea la differenza e tutto cio che conta.
 */
export const MEMBERSHIP_EVENT_TYPES = [
  "ADMISSION",
  "RESIGNATION",
  "EXPULSION",
  "LAPSE",
  "REINSTATEMENT",
] as const;
export type MembershipEventType = (typeof MEMBERSHIP_EVENT_TYPES)[number];

const normalize = (value: unknown) => String(value ?? "").trim();

const normalizeType = (value: unknown) => normalize(value).toUpperCase();

export const isMembershipEventType = (
  value: unknown,
): value is MembershipEventType =>
  (MEMBERSHIP_EVENT_TYPES as readonly string[]).includes(normalizeType(value));

export const MEMBERSHIP_EVENT_LABELS: Record<MembershipEventType, string> = {
  ADMISSION: "Ammissione",
  RESIGNATION: "Dimissione",
  EXPULSION: "Esclusione",
  LAPSE: "Decadenza",
  REINSTATEMENT: "Riammissione",
};

/**
 * Gli eventi che **chiudono** la qualifica di socio.
 *
 * Stanno insieme perche chiedono tutti la stessa cosa — una data e un motivo —
 * e perche il libro li tratta allo stesso modo: dopo uno di questi la persona
 * non e socia, e per tornare a esserlo serve una riammissione.
 */
export const MEMBERSHIP_CESSATION_TYPES: readonly MembershipEventType[] = [
  "RESIGNATION",
  "EXPULSION",
  "LAPSE",
];

export const isMembershipCessation = (value: unknown) =>
  isMembershipEventType(value) &&
  MEMBERSHIP_CESSATION_TYPES.includes(normalizeType(value) as MembershipEventType);

/* ---------------------------------------------------------- lo stato */

/**
 * Lo stato di una persona nel libro, a una data.
 *
 * **Perche `ammesso` e `riammesso` sono due stati e non uno.** Sono entrambi
 * «socio attivo», e infatti la qualifica che ne deriva e la stessa; ma un libro
 * deve poter dire **come** quella persona e tornata dentro, e appiattirli
 * perderebbe l'unica informazione che distingue una carriera lineare da una
 * interrotta e ripresa.
 */
export const MEMBER_STATUSES = [
  "mai_ammesso",
  "ammesso",
  "riammesso",
  "dimesso",
  "decaduto",
  "espulso",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  mai_ammesso: "Non socio",
  ammesso: "Attivo",
  riammesso: "Attivo (riammesso)",
  dimesso: "Dimesso",
  decaduto: "Decaduto",
  espulso: "Escluso",
};

/**
 * La qualifica: la risposta secca a «era socio quel giorno».
 *
 * E il valore che serve alla classificazione di un'entrata (§32.5), e per
 * quello non conta come si e arrivati li — conta solo se dentro o fuori.
 */
export const MEMBER_QUALIFICATIONS = ["attivo", "cessato", "non_socio"] as const;
export type MemberQualification = (typeof MEMBER_QUALIFICATIONS)[number];

const STATUS_OF_EVENT: Record<MembershipEventType, MemberStatus> = {
  ADMISSION: "ammesso",
  REINSTATEMENT: "riammesso",
  RESIGNATION: "dimesso",
  EXPULSION: "espulso",
  LAPSE: "decaduto",
};

export const memberQualificationOf = (
  status: MemberStatus,
): MemberQualification => {
  if (status === "ammesso" || status === "riammesso") return "attivo";
  if (status === "mai_ammesso") return "non_socio";
  return "cessato";
};

export const isActiveMemberStatus = (status: unknown) =>
  status === "ammesso" || status === "riammesso";

/* ------------------------------------------------------------- gli eventi */

export type MembershipEventInput = {
  id?: string | null;
  memberId?: string | null;
  memberLabel?: string | null;
  eventType: string;
  effectiveDate?: string | Date | null;
  resolutionReference?: string | null;
  resolutionDate?: string | Date | null;
  reason?: string | null;
  membershipNumber?: string | null;
  notes?: string | null;
  createdAt?: string | Date | null;
};

const toTime = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  const text = normalize(value);
  if (!text) return Number.NaN;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
};

const toIso = (value: unknown): string | null => {
  const time = toTime(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

/**
 * L'ordine con cui si legge il libro: dall'evento piu vecchio al piu recente.
 *
 * **A parita di data l'ordine non puo essere quello di arrivo.** Due eventi con
 * la stessa `effective_date` capitano davvero — una delibera che ammette e una
 * che esclude nella stessa seduta, un'importazione che porta la data del giorno
 * — e se lo spareggio lo facesse l'ordinamento del database, «questa persona
 * era socia» cambierebbe da una query all'altra. Lo spareggio e `created_at`, e
 * quando anche quello coincide `id`: non perche l'identificativo significhi
 * qualcosa, ma perche e **stabile**.
 */
const compareEvents = (left: MembershipEventInput, right: MembershipEventInput) => {
  const effectiveLeft = toTime(left.effectiveDate);
  const effectiveRight = toTime(right.effectiveDate);
  /*
    Una data illeggibile va in cima, non in fondo: un evento di cui non si sa
    la data non deve poter **sparire** dal libro. Spinto in avanti resta
    l'ultimo, cioe visibile — e sospetto, che e cio che serve a chi lo guarda.
  */
  const safeLeft = Number.isNaN(effectiveLeft) ? Number.POSITIVE_INFINITY : effectiveLeft;
  const safeRight = Number.isNaN(effectiveRight)
    ? Number.POSITIVE_INFINITY
    : effectiveRight;
  if (safeLeft !== safeRight) return safeLeft - safeRight;

  const bornLeft = toTime(left.createdAt);
  const bornRight = toTime(right.createdAt);
  const createdLeft = Number.isNaN(bornLeft) ? Number.NEGATIVE_INFINITY : bornLeft;
  const createdRight = Number.isNaN(bornRight) ? Number.NEGATIVE_INFINITY : bornRight;
  if (createdLeft !== createdRight) return createdLeft - createdRight;

  const idLeft = String(left.id || "");
  const idRight = String(right.id || "");
  return idLeft < idRight ? -1 : idLeft > idRight ? 1 : 0;
};

/** Lo storico ordinato, con le righe di tipo sconosciuto scartate. */
export const sortMembershipEvents = (
  events: readonly MembershipEventInput[] | null | undefined,
): MembershipEventInput[] =>
  (events || [])
    .filter((event) => event && isMembershipEventType(event.eventType))
    .slice()
    .sort(compareEvents);

export type MemberStatusDerivation = {
  status: MemberStatus;
  /** «Attivo», «Dimesso»…: l'etichetta si decide qui, non nelle schermate. */
  label: string;
  qualification: MemberQualification;
  /** La risposta secca a «era socio a quella data». */
  isMember: boolean;
  /** La data della **prima** ammissione efficace, ISO 8601. */
  admittedOn: string | null;
  /** La data dell'ultimo evento efficace: da quando vale questo stato. */
  since: string | null;
  /** La data della cessazione, quando lo stato e una cessazione. */
  endedOn: string | null;
  /** Il motivo della cessazione, quando c'e. */
  reason: string | null;
  /** Gli estremi della delibera dell'ultimo evento efficace. */
  resolutionReference: string | null;
  resolutionDate: string | null;
  /** Il numero assegnato dall'ammissione: non cambia con le cessazioni. */
  membershipNumber: string | null;
  lastEventId: string | null;
  lastEventType: MembershipEventType | null;
  /** Quanti eventi sono stati considerati, cioe efficaci a quella data. */
  eventCount: number;
  /** La data a cui e stata posta la domanda, ISO 8601, o `null` per «adesso». */
  atDate: string | null;
};

const NON_SOCIO: MemberStatusDerivation = {
  status: "mai_ammesso",
  label: MEMBER_STATUS_LABELS.mai_ammesso,
  qualification: "non_socio",
  isMember: false,
  admittedOn: null,
  since: null,
  endedOn: null,
  reason: null,
  resolutionReference: null,
  resolutionDate: null,
  membershipNumber: null,
  lastEventId: null,
  lastEventType: null,
  eventCount: 0,
  atDate: null,
};

/**
 * Lo stato di un socio a una data, ricavato dai suoi eventi.
 *
 * `atDate` e la ragione per cui questo registro esiste: senza, si risponde solo
 * ad «adesso», e «adesso» non serve a classificare un'entrata di marzo. Gli
 * eventi con data di efficacia **successiva** vengono ignorati — non nascosti:
 * semplicemente quel giorno non erano ancora accaduti.
 *
 * Una data di riferimento illeggibile viene ignorata e si risponde su tutto lo
 * storico: e preferibile a rispondere «non socio» a una domanda malformata,
 * che sarebbe una risposta sbagliata con l'aria di essere giusta.
 */
export const deriveMemberStatus = (
  events: readonly MembershipEventInput[] | null | undefined,
  atDate?: string | Date | null,
): MemberStatusDerivation => {
  const limit = atDate === undefined || atDate === null ? Number.NaN : toTime(atDate);
  const hasLimit = !Number.isNaN(limit);

  const ordered = sortMembershipEvents(events).filter((event) => {
    if (!hasLimit) return true;
    const effective = toTime(event.effectiveDate);
    // Una data illeggibile resta nel libro: vedi `compareEvents`.
    return Number.isNaN(effective) || effective <= limit;
  });

  const base = { ...NON_SOCIO, atDate: hasLimit ? new Date(limit).toISOString() : null };

  const last = ordered[ordered.length - 1] || null;
  if (!last) return base;

  const admission = ordered.find(
    (event) => normalizeType(event.eventType) === "ADMISSION",
  );
  const lastType = normalizeType(last.eventType) as MembershipEventType;
  const status = STATUS_OF_EVENT[lastType];

  /*
    Il numero di tessera lo porta l'ammissione, e nessun evento successivo lo
    tocca: una dimissione non cancella il numero con cui quella persona compare
    nei verbali di dieci assemblee.
  */
  const numberCarrier = admission || ordered.find((event) => event.membershipNumber);

  return {
    ...base,
    status,
    label: MEMBER_STATUS_LABELS[status],
    qualification: memberQualificationOf(status),
    isMember: isActiveMemberStatus(status),
    admittedOn: admission ? toIso(admission.effectiveDate) : null,
    since: toIso(last.effectiveDate),
    endedOn: isMembershipCessation(lastType) ? toIso(last.effectiveDate) : null,
    reason: normalize(last.reason) || null,
    resolutionReference: normalize(last.resolutionReference) || null,
    resolutionDate: toIso(last.resolutionDate),
    membershipNumber: numberCarrier
      ? normalize(numberCarrier.membershipNumber) || null
      : null,
    lastEventId: last.id ? String(last.id) : null,
    lastEventType: lastType,
    eventCount: ordered.length,
  };
};

/* ------------------------------------------------------- le transizioni */

/**
 * Gli eventi ammessi a partire dallo stato corrente.
 *
 * Le due regole che contano:
 *
 * - **un socio si ammette una volta sola.** Una seconda ammissione vorrebbe
 *   dire due date di ingresso, e il libro non saprebbe quale usare. Chi rientra
 *   dopo una cessazione viene **riammesso**, che e un evento diverso e che
 *   conserva la storia di mezzo. L'indice unico parziale in migrazione lo vieta
 *   comunque: qui lo si dice **prima**, con una frase leggibile, invece di
 *   lasciare che il database risponda con un vincolo violato;
 * - **non si dimette chi non e socio.** Una cessazione senza un'ammissione a
 *   monte non e un fatto: e un errore di chi sta registrando.
 */
const EVENT_TRANSITIONS: Record<MemberStatus, MembershipEventType[]> = {
  mai_ammesso: ["ADMISSION"],
  ammesso: ["RESIGNATION", "EXPULSION", "LAPSE"],
  riammesso: ["RESIGNATION", "EXPULSION", "LAPSE"],
  dimesso: ["REINSTATEMENT"],
  decaduto: ["REINSTATEMENT"],
  espulso: ["REINSTATEMENT"],
};

export const canApplyMembershipEvent = (
  currentStatus: unknown,
  eventType: unknown,
): boolean => {
  const status = (MEMBER_STATUSES as readonly string[]).includes(
    String(currentStatus || ""),
  )
    ? (currentStatus as MemberStatus)
    : "mai_ammesso";

  if (!isMembershipEventType(eventType)) return false;

  return EVENT_TRANSITIONS[status].includes(
    normalizeType(eventType) as MembershipEventType,
  );
};

/**
 * Perche quell'evento non si puo registrare, detto a chi lo sta registrando.
 * `null` quando si puo.
 *
 * Non e cosmetica: una segreteria che legge «operazione non riuscita» chiama
 * l'assistenza, una che legge «questa persona risulta gia ammessa» guarda il
 * socio che ha selezionato.
 */
export const explainMembershipEventDenial = (
  currentStatus: unknown,
  eventType: unknown,
): string | null => {
  if (canApplyMembershipEvent(currentStatus, eventType)) return null;

  if (!isMembershipEventType(eventType)) {
    return "Evento sconosciuto: si registra un'ammissione, una dimissione, una decadenza, un'esclusione o una riammissione";
  }

  const type = normalizeType(eventType) as MembershipEventType;
  const status = currentStatus as MemberStatus;

  if (type === "ADMISSION") {
    return isActiveMemberStatus(status)
      ? "Questa persona risulta gia socia: un socio si ammette una volta sola"
      : "Questa persona e gia stata ammessa in passato: per farla rientrare si registra una riammissione";
  }

  if (type === "REINSTATEMENT") {
    return status === "mai_ammesso"
      ? "Non risulta nessuna ammissione: si riammette chi e gia stato socio"
      : "Questa persona risulta gia socia: non c'e niente da riammettere";
  }

  return status === "mai_ammesso"
    ? "Non risulta nessuna ammissione per questa persona"
    : `Questa persona risulta gia ${MEMBER_STATUS_LABELS[status].toLowerCase()}: la sua posizione e gia chiusa`;
};

/* ------------------------------------------------------------ la bozza */

export type MembershipValidationIssue = { field: string; message: string };

export type MembershipValidationResult = {
  ok: boolean;
  issues: MembershipValidationIssue[];
};

/**
 * Cosa deve portare un evento perche il libro serva a qualcosa.
 *
 * **La delibera e obbligatoria sull'ammissione** e non sulle altre: e il
 * consiglio direttivo che ammette, e un'ammissione senza estremi della delibera
 * e la riga che un verificatore chiede per prima. Le cessazioni chiedono invece
 * un **motivo**: «non e piu socio» senza dire perche e cio che il libro attuale
 * gia sa fare, e non basta (G-70).
 */
export const validateMembershipEventDraft = (draft: {
  eventType?: string | null;
  effectiveDate?: string | Date | null;
  resolutionReference?: string | null;
  reason?: string | null;
}): MembershipValidationResult => {
  const issues: MembershipValidationIssue[] = [];

  if (!isMembershipEventType(draft?.eventType)) {
    issues.push({
      field: "eventType",
      message:
        "Evento sconosciuto: si registra un'ammissione, una dimissione, una decadenza, un'esclusione o una riammissione",
    });
  }

  const effective = toTime(draft?.effectiveDate);
  if (Number.isNaN(effective)) {
    issues.push({
      field: "effectiveDate",
      message: "Serve la data da cui l'evento ha effetto",
    });
  }

  const type = normalizeType(draft?.eventType);

  if (type === "ADMISSION" && !normalize(draft?.resolutionReference)) {
    issues.push({
      field: "resolutionReference",
      message:
        "Serve la delibera che ha ammesso il socio: e il consiglio direttivo ad ammettere, non la segreteria",
    });
  }

  if (isMembershipCessation(type) && !normalize(draft?.reason)) {
    issues.push({
      field: "reason",
      message:
        "Serve il motivo della cessazione: «non e piu socio» senza il perche non e una riga di libro",
    });
  }

  return { ok: issues.length === 0, issues };
};

/* ------------------------------------------------------------ il numero */

/** Quante cifre ha il numero di tessera. Quattro bastano a una ASD. */
export const MEMBERSHIP_NUMBER_PADDING = 4;

/**
 * La forma del numero di socio: `0001`.
 *
 * **Non porta l'anno**, e la differenza con il numero di un documento e voluta:
 * una ricevuta si numera per esercizio e riparte a gennaio, un socio no. Il
 * numero identifica la persona nel libro per tutta la sua vita associativa, e
 * un progressivo che ricomincia ogni anno darebbe lo stesso numero a due
 * persone diverse — che e precisamente cio che l'indice unico per club vieta.
 */
export const formatMembershipNumber = (sequence: number) =>
  String(Math.max(1, Math.trunc(Number(sequence) || 0))).padStart(
    MEMBERSHIP_NUMBER_PADDING,
    "0",
  );

/**
 * Il tipo di sequenza con cui si numerano i soci dentro
 * `document_number_sequences`.
 *
 * Sta qui perche il servizio e la schermata non devono scriverla a mano in due
 * posti; e non entra in `DOCUMENT_NUMBER_KINDS` perche quel catalogo descrive i
 * **documenti fiscali**, che hanno un prefisso, una serie e un anno. Un socio
 * non e un documento: condivide solo il contatore.
 */
export const MEMBERSHIP_SEQUENCE_KIND = "member";

/**
 * L'anno con cui la sequenza dei soci vive nella tabella dei contatori.
 *
 * Zero non e un anno: e il modo di dire «questa sequenza non si azzera». La
 * chiave della tabella pretende un anno, e qualunque anno vero farebbe
 * ripartire il progressivo da uno il primo gennaio.
 */
export const MEMBERSHIP_SEQUENCE_YEAR = 0;

/* --------------------------------------------------------- il prodotto */

/**
 * Cosa il prodotto **non** dice di questo registro (§19, §31).
 *
 * Il libro soci per una ASD non-ETS e un obbligo **statutario** e un elemento
 * probatorio davanti a una verifica, non un obbligo di legge autonomo con un
 * modello da depositare. Un'etichetta come «libro soci a norma» prometterebbe
 * una conformita che nessuna norma definisce, e chi la legge smetterebbe di
 * chiedere al proprio commercialista.
 *
 * La frase sta qui, e non dentro una pagina, perche non deve poter divergere
 * fra l'elenco, la scheda e l'export.
 */
export const MEMBERSHIP_REGISTER_DISCLAIMER =
  "Registro interno degli eventi associativi, tenuto secondo lo statuto: non e un modello ufficiale ne un documento da depositare. Verifica con il tuo consulente cosa richiede il tuo statuto.";

/**
 * Le invarianti del dominio, in una forma leggibile dai test.
 *
 * Non e decorazione: e la lista che la UAT verifica una per una, e averla in
 * codice impedisce che si perda dentro un documento.
 */
export const MEMBERSHIP_INVARIANTS = [
  "Il registro e append-only: un evento non si modifica e non si cancella.",
  "Lo stato del socio non e una colonna: si deriva dagli eventi efficaci a una data.",
  "Il libro risponde a «chi era socio il 12 marzo 2026», non solo ad «adesso».",
  "Un socio si ammette una volta sola: chi rientra viene riammesso.",
  "Il numero di tessera si assegna, non si digita, ed e unico per club.",
  "Il numero di tessera non riparte a gennaio: identifica la persona, non l'esercizio.",
  "Un'ammissione porta gli estremi della delibera; una cessazione porta data e motivo.",
  "Essere tesserato e essere socio sono due qualita diverse della stessa persona.",
] as const;
