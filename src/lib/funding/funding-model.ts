/**
 * Voucher e contributi legati alla frequenza (Workstream A, ADR-0037).
 *
 * **Il problema che questo modulo risolve.** Un contributo pubblico non e un
 * pagamento della famiglia, e un voucher assegnato non e denaro incassato. Fra
 * «assegnato» e «arrivato in banca» ci sono almeno tre passaggi che possono
 * fallire separatamente: l'atleta deve frequentare abbastanza da far maturare
 * il periodo, il club deve rendicontarlo, l'ente deve liquidarlo. Trattarli
 * come un numero solo vuol dire, prima o poi, contare come cassa dei soldi che
 * nessuno ha versato.
 *
 * Qui i cinque importi restano cinque:
 *
 * | Importo | Cosa significa |
 * |---|---|
 * | **assegnato** | il plafond che l'ente ha riservato all'atleta |
 * | **maturato** | quanto ne ha guadagnato frequentando |
 * | **rendicontato** | quanto e stato dichiarato all'ente |
 * | **liquidato** | quanto l'ente ha effettivamente versato |
 * | **residuo** | quanto del plafond puo ancora maturare |
 *
 * **Nessuna regola di un singolo bando vive nel codice.** Importo per periodo,
 * frequenza, requisito minimo, unita del requisito, comportamento sotto soglia
 * e tetti sono configurazione. Il Voucher per lo Sport della Regione Lazio
 * 2025 — plafond di 500 EUR, mensilita che matura al raggiungimento di una
 * soglia oraria — e un insieme di valori, non un ramo dentro il calcolo. Un
 * test lo configura come caso di regressione, e nessuna sua costante compare
 * in questo file.
 *
 * Modulo puro: nessuna dipendenza da Prisma, React o rete.
 */

/* ------------------------------------------------------------ vocabolario */

/** Ogni quanto matura un periodo. */
export const FUNDING_PERIOD_FREQUENCIES = ["monthly", "days"] as const;
export type FundingPeriodFrequency =
  (typeof FUNDING_PERIOD_FREQUENCIES)[number];

/**
 * In che cosa si misura il requisito.
 *
 * `hours` somma la durata degli allenamenti a cui l'atleta risulta presente;
 * `sessions` ne conta il numero. Sono due metriche diverse e non
 * intercambiabili: un bando che chiede «almeno 8 ore al mese» non e
 * soddisfatto da otto presenze da venti minuti.
 */
export const FUNDING_REQUIREMENT_UNITS = ["hours", "sessions"] as const;
export type FundingRequirementUnit =
  (typeof FUNDING_REQUIREMENT_UNITS)[number];

/**
 * Cosa succede quando il requisito non e raggiunto.
 *
 * - `none` — il periodo non matura niente. E il comportamento dei bandi a
 *   soglia, fra cui il caso di riferimento;
 * - `prorata` — matura in proporzione a quanto e stato fatto;
 * - `full` — matura comunque per intero: il requisito e solo un dato da
 *   rendicontare.
 */
export const FUNDING_UNMET_BEHAVIORS = ["none", "prorata", "full"] as const;
export type FundingUnmetBehavior = (typeof FUNDING_UNMET_BEHAVIORS)[number];

export const FUNDING_PROGRAM_STATUSES = ["draft", "active", "closed"] as const;
export type FundingProgramStatus = (typeof FUNDING_PROGRAM_STATUSES)[number];

/**
 * **Che cosa significa lo stato di un programma** (N6).
 *
 * I tre valori esistevano dal Blocco D e non significavano niente: ogni
 * programma nasceva `draft`, nessuna schermata sapeva cambiarlo, e `draft`
 * iscriveva e maturava **esattamente** come `active` — l'unico controllo era
 * su `closed`. `active` era un valore che nessuna riga di `src/` leggeva.
 *
 * Uno stato che non cambia niente e peggio di uno stato assente: la scheda
 * scriveva «BOZZA» accanto a un bando che stava gia maturando denaro pubblico.
 *
 * Adesso i tre stati dicono tre cose diverse:
 *
 * - **`draft`** — si configura. Le regole del bando si cambiano ancora, e
 *   **non si iscrive nessuno**: le regole decidono quanto matura ogni periodo,
 *   e cambiarle sotto a un'iscrizione gia attiva riscriverebbe importi che
 *   qualcuno ha gia letto;
 * - **`active`** — si iscrive e si matura. Il bando e in corso;
 * - **`closed`** — non entra piu nessuno e non matura piu niente. Lo storico
 *   resta intero: chiudere non cancella, e cio che era maturato resta maturato.
 */
export const FUNDING_PROGRAM_STATUS_LABELS: Record<FundingProgramStatus, string> =
  {
    draft: "Bozza",
    active: "Attivo",
    closed: "Chiuso",
  };

export const FUNDING_PROGRAM_STATUS_DESCRIPTIONS: Record<
  FundingProgramStatus,
  string
> = {
  draft:
    "In configurazione: le regole si possono ancora cambiare, e non si iscrive nessuno.",
  active: "In corso: si iscrivono atleti e i periodi maturano.",
  closed:
    "Chiuso: non entra piu nessuno e non matura piu niente. Lo storico resta.",
};

/**
 * **Le transizioni ammesse, e sono quattro.**
 *
 * Non e un grafo completo: e l'elenco di cio che una segreteria fa davvero.
 *
 * - `draft → active` — si apre il bando;
 * - `active → closed` — si chiude a fine stagione, o perche l'ente lo ha
 *   revocato;
 * - `draft → closed` — un bando configurato e mai partito si archivia senza
 *   passare per l'apertura;
 * - `closed → active` — **si riapre**. Chiudere non e un atto distruttivo, e
 *   un bando riaperto per una proroga dell'ente non deve costringere a
 *   riconfigurare tutto da capo perdendo lo storico.
 *
 * `draft → draft` e simili non sono transizioni: sono nulla, e chi le chiede
 * riceve un rifiuto invece di una scrittura silenziosa che finisce in audit.
 */
export const FUNDING_PROGRAM_TRANSITIONS: Record<
  FundingProgramStatus,
  readonly FundingProgramStatus[]
> = {
  draft: ["active", "closed"],
  active: ["closed"],
  closed: ["active"],
};

export const canTransitionFundingProgram = (
  from: unknown,
  to: unknown,
): boolean => {
  const partenza = FUNDING_PROGRAM_STATUSES.includes(from as FundingProgramStatus)
    ? (from as FundingProgramStatus)
    : null;
  const arrivo = FUNDING_PROGRAM_STATUSES.includes(to as FundingProgramStatus)
    ? (to as FundingProgramStatus)
    : null;

  if (!partenza || !arrivo) return false;

  return FUNDING_PROGRAM_TRANSITIONS[partenza].includes(arrivo);
};

/** Gli stati raggiungibili da qui: e cio che la schermata deve offrire. */
export const listFundingProgramTransitions = (
  from: unknown,
): readonly FundingProgramStatus[] =>
  FUNDING_PROGRAM_STATUSES.includes(from as FundingProgramStatus)
    ? FUNDING_PROGRAM_TRANSITIONS[from as FundingProgramStatus]
    : [];

/**
 * **Un programma accetta iscrizioni solo quando e attivo.**
 *
 * Prima l'unico rifiuto era su `closed`, quindi si iscriveva su una bozza. E
 * la differenza fra «lo stato e un'etichetta» e «lo stato governa».
 */
export const fundingProgramAcceptsEnrollments = (status: unknown) =>
  String(status || "") === "active";

/**
 * **Un programma matura solo quando e attivo.**
 *
 * Su una bozza non c'e niente da maturare — nessuno e iscritto — e su un bando
 * chiuso maturare vorrebbe dire far crescere un credito verso un ente che ha
 * gia smesso di riconoscerlo. Cio che era gia maturato **resta**: questa e una
 * guardia sulla scrittura, non una cancellazione.
 */
export const fundingProgramAccruesNow = (status: unknown) =>
  String(status || "") === "active";

/**
 * **Le regole del bando si cambiano finche nessuno le sta usando.**
 *
 * Su `draft` si cambia tutto. Da `active` in poi si possono correggere il
 * nome, l'ente e le note — cioe cio che descrive il bando — ma non gli importi,
 * le date e le soglie, che sono cio da cui **si ricalcola** il maturato: una
 * soglia cambiata sotto a un'iscrizione riscrive in silenzio importi che la
 * segreteria ha gia letto, e forse rendicontato.
 */
export const FUNDING_PROGRAM_DESCRIPTIVE_FIELDS = [
  "name",
  "funder_name",
  "notes",
  "status",
] as const;

/**
 * **Da dove arriva la maturazione** (ADR-0054).
 *
 * Le presenze EasyGame non sono sempre la fonte ufficiale. Su molti bandi la
 * frequenza si registra su una piattaforma istituzionale, e cio che EasyGame
 * sa e al massimo una *previsione*: utile per accorgersi in tempo che un
 * atleta non arrivera alla soglia, ma non sufficiente a dichiarare un credito
 * verso un ente. Trattare le due cose come una sola vuol dire, prima o poi,
 * rendicontare un importo che la piattaforma ufficiale non riconosce.
 *
 * - `easygame_attendance` — l'appello di EasyGame **e** la fonte: il periodo
 *   matura da solo appena il requisito e raggiunto;
 * - `external_confirmation` — la fonte e altrove: EasyGame calcola la
 *   previsione e aspetta una conferma esplicita;
 * - `external_import` — come sopra, ma le conferme arrivano da un file;
 * - `external_api` — dichiarato nel modello, **non disponibile**: nessun
 *   provider reale esiste, e un'integrazione finta sarebbe peggio di
 *   nessuna integrazione.
 */
export const FUNDING_ACCRUAL_SOURCES = [
  "easygame_attendance",
  "external_confirmation",
  "external_import",
  "external_api",
] as const;
export type FundingAccrualSource = (typeof FUNDING_ACCRUAL_SOURCES)[number];

/** Le fonti che un club puo davvero scegliere oggi. */
export const SELECTABLE_FUNDING_ACCRUAL_SOURCES: readonly FundingAccrualSource[] =
  ["easygame_attendance", "external_confirmation", "external_import"];

/**
 * **Come e nato un maturato**, riga per riga.
 *
 * Il programma dice quale fonte vale; il singolo periodo dice da dove e
 * arrivato davvero il suo importo. I due non coincidono sempre: su un
 * programma a import esterno una correzione a mano resta possibile, e deve
 * restare distinguibile da cio che ha portato il file.
 */
export const FUNDING_ACCRUAL_ORIGINS = [
  "easygame_attendance",
  "manual_confirmation",
  "external_import",
  "external_api",
] as const;
export type FundingAccrualOrigin = (typeof FUNDING_ACCRUAL_ORIGINS)[number];

export const fundingAccrualSourceLabel = (source: FundingAccrualSource) =>
  ({
    easygame_attendance: "Presenze EasyGame",
    external_confirmation: "Conferma da piattaforma esterna",
    external_import: "Importazione dati esterni",
    external_api: "API esterna (non disponibile)",
  })[source];

export const fundingAccrualOriginLabel = (origin: FundingAccrualOrigin) =>
  ({
    easygame_attendance: "Presenze EasyGame",
    manual_confirmation: "Conferma manuale",
    external_import: "Importazione esterna",
    external_api: "API esterna",
  })[origin];

export const FUNDING_ENROLLMENT_STATUSES = [
  "active",
  "suspended",
  "closed",
] as const;
export type FundingEnrollmentStatus =
  (typeof FUNDING_ENROLLMENT_STATUSES)[number];

/**
 * Il ciclo di vita di un periodo maturato.
 *
 * `not_accrued` non e un errore: e il periodo in cui l'atleta non ha
 * frequentato abbastanza, e va mostrato lo stesso — sapere quanto si e perso
 * e la ragione per cui una segreteria guarda questa tabella.
 *
 * `pending_confirmation` e il periodo di un programma la cui fonte ufficiale
 * sta fuori da EasyGame: la previsione c'e gia, il credito no. Distinguerlo
 * da `accrued` e l'unica cosa che impedisce di rendicontare all'ente un
 * numero che l'ente non ha ancora riconosciuto.
 */
export const FUNDING_ACCRUAL_STATUSES = [
  "not_accrued",
  "pending_confirmation",
  "accrued",
  "reported",
  "settled",
] as const;
export type FundingAccrualStatus = (typeof FUNDING_ACCRUAL_STATUSES)[number];

/**
 * **Il periodo che esiste e non ha ancora una riga** (N8).
 *
 * Non e un sesto stato in archivio: e cio che si vede di un periodo **prima**
 * che qualcuno abbia ricalcolato. La schermata mostrava soltanto i periodi con
 * una riga di maturato, e il ricalcolo si ferma a **oggi**: i mesi futuri del
 * bando non comparivano affatto, e una segreteria che voleva sapere «quanto
 * puo ancora arrivare» non aveva dove leggerlo.
 *
 * Sta qui e non fra gli stati archiviati di proposito: salvarlo vorrebbe dire
 * scrivere righe a zero per periodi che non sono ancora cominciati, cioe
 * inventare un dato per far quadrare una schermata. Il periodo si **deriva**
 * dalla configurazione (ADR-0037 §4), e questa e la sua faccia mancante.
 */
export const FUNDING_PERIOD_PLANNED = "planned" as const;

export type FundingPeriodDisplayStatus =
  | FundingAccrualStatus
  | typeof FUNDING_PERIOD_PLANNED;

export const FUNDING_PERIOD_STATUS_LABELS: Record<
  FundingPeriodDisplayStatus,
  string
> = {
  planned: "Previsto",
  not_accrued: "Non maturato",
  pending_confirmation: "Da confermare",
  accrued: "Maturato",
  reported: "Rendicontato",
  settled: "Liquidato",
};

/**
 * **Quante ore ha fatto l'atleta in questo periodo, oppure il fatto che
 * nessuno l'ha ancora misurato** (N10).
 *
 * Sono due cose diverse e l'interfaccia le confondeva: un periodo previsto non
 * ha una riga di maturato, quindi `measured_value` non esisteva, e il testo
 * usciva come «Frequenza EasyGame undefined ore». Sostituire quel valore con
 * uno zero sarebbe stato peggio del difetto: direbbe che l'atleta non si e
 * presentato, quando la verita e che il ricalcolo non e ancora passato di li.
 *
 * Il tipo obbliga chi legge a scegliere fra i due casi. Non c'e un numero da
 * leggere quando il numero non c'e.
 */
export type FundingPeriodMeasure =
  | {
      readonly kind: "measured";
      readonly value: number;
      readonly unit: FundingRequirementUnit;
    }
  | { readonly kind: "unknown"; readonly unit: FundingRequirementUnit };

/**
 * **Quanto serviva per maturare, oppure il fatto che il programma non chieda
 * niente** (N11).
 *
 * `requirementMin` a zero e una **configurazione legittima**: un bando puo
 * riconoscere il periodo a chiunque risulti iscritto, e `calculatePeriodAccrual`
 * lo tratta gia cosi (`requirement <= 0` matura con una presenza qualsiasi).
 * Disegnarlo come «Requisito 0 ore» e un numero falso, e disegnarlo come
 * «Requisito undefined ore non raggiunto» — che e cio che succedeva — e un
 * numero falso **e** un verdetto falso.
 *
 * `met` e un terzo valore e non un booleano: il confronto fra misura e soglia
 * si puo fare **solo** se esistono tutti e due. Su un periodo mai calcolato non
 * si dice ne «raggiunto» ne «non raggiunto»: non lo si dice.
 */
export type FundingPeriodRequirement =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "required";
      readonly min: number;
      readonly unit: FundingRequirementUnit;
      /** `null` quando la frequenza non e ancora nota: non si giudica al buio. */
      readonly met: boolean | null;
      /** La misura, quando c'e: serve a scrivere «8 / 10 ore». */
      readonly measured: number | null;
    };

export type FundingPeriodRow = {
  readonly periodIndex: number;
  readonly label: string;
  readonly start: string;
  readonly end: string;
  readonly status: FundingPeriodDisplayStatus;
  /** La riga di maturato, quando esiste. `null` per un periodo previsto. */
  readonly accrual: Record<string, any> | null;
  /**
   * **La frequenza registrata da EasyGame** (N10).
   *
   * Su un periodo previsto e `unknown`: la configurazione sa quando il periodo
   * comincia e finisce, non quante ore ci saranno dentro.
   */
  readonly measure: FundingPeriodMeasure;
  /**
   * **Il requisito del programma** (N11).
   *
   * Si conosce anche su un periodo previsto — sta nella configurazione del
   * bando, non nella riga di maturato — ed e la ragione per cui un periodo
   * futuro puo dire «Requisito: 10 ore» pur non sapendo ancora quante ne sono
   * state fatte.
   */
  readonly requirement: FundingPeriodRequirement;
  /**
   * **Quanto vale il periodo se matura per intero.** Sulla riga esistente e
   * l'importo congelato al calcolo; su un periodo previsto e la mensilita del
   * bando. Serve alla colonna «importo previsto» dell'elenco (N12).
   */
  readonly plannedAmount: number;
  /**
   * Vero quando lo stato di questo periodo e stato **deciso da una persona** e
   * non derivato dalle presenze (N12). Un ricalcolo non lo riscrive.
   */
  readonly manualDecision: boolean;
};

/**
 * **La chiave con cui una riga dichiara di non portare una misura** (N10).
 *
 * `measured_value` in archivio e un `Float` con default zero: non c'e modo di
 * scriverci «non lo so». Il marcatore vive percio in `data`, e vale la regola
 * conservativa — una riga senza marcatore e stata scritta dal ricalcolo, che e
 * l'unico creatore esistito fino a N12, quindi la sua misura e vera.
 */
export const FUNDING_ACCRUAL_MEASURED_FLAG = "attendanceMeasured" as const;

/** La chiave con cui una riga dichiara di essere stata decisa a mano (N12). */
export const FUNDING_ACCRUAL_MANUAL_FLAG = "manualDecision" as const;

/**
 * Vero quando la riga porta una misura della frequenza di cui ci si puo fidare.
 *
 * Una funzione sola, perche la domanda e una sola: chi la ricostruisce in casa
 * ricomincia a leggere lo zero di default come «zero ore fatte».
 */
export const accrualHasMeasuredAttendance = (accrual: unknown) => {
  const record = asRecord(accrual);
  if (!record || Object.keys(record).length === 0) return false;

  const flag = asRecord(record.data)[FUNDING_ACCRUAL_MEASURED_FLAG];
  return flag === undefined || flag === null ? true : Boolean(flag);
};

/** Vero quando lo stato della riga e stato deciso da una persona (N12). */
export const accrualIsManuallyDecided = (accrual: unknown) =>
  Boolean(asRecord(asRecord(accrual).data)[FUNDING_ACCRUAL_MANUAL_FLAG]);

/**
 * La frequenza di un periodo: il numero, o il fatto che non ci sia (N10).
 *
 * `accrual` puo essere `null` — il periodo previsto — e allora l'unita la
 * porta la configurazione del bando, che e cio che permette di scrivere
 * «Frequenza non ancora disponibile» invece di tacere.
 */
export const resolveFundingPeriodMeasure = (
  accrual: Record<string, any> | null | undefined,
  program?: unknown,
): FundingPeriodMeasure => {
  const unit = accrual?.requirement_unit
    ? pickEnum(accrual.requirement_unit, FUNDING_REQUIREMENT_UNITS, "hours")
    : normalizeFundingProgram(program).requirementUnit;

  if (!accrual || !accrualHasMeasuredAttendance(accrual)) {
    return { kind: "unknown", unit };
  }

  return {
    kind: "measured",
    value: toFundingMeasure(accrual.measured_value ?? accrual.measuredValue),
    unit,
  };
};

/**
 * Il requisito di un periodo: la soglia, o il fatto che non ce ne sia (N11).
 *
 * La soglia si legge dalla riga quando c'e — li e **congelata** al momento del
 * calcolo, ed e giusto: spiega un importo gia maturato — e dalla configurazione
 * quando la riga non c'e ancora.
 */
export const resolveFundingPeriodRequirement = (
  accrual: Record<string, any> | null | undefined,
  program: unknown,
  measure: FundingPeriodMeasure,
): FundingPeriodRequirement => {
  const normalized = normalizeFundingProgram(program);

  const min = accrual
    ? toFundingMeasure(accrual.requirement_min ?? accrual.requirementMin)
    : normalized.requirementMin;

  if (!(min > 0)) return { kind: "none" };

  const unit = measure.unit;

  if (measure.kind !== "measured") {
    return { kind: "required", min, unit, met: null, measured: null };
  }

  /*
    Il verdetto lo porta la riga quando esiste: `requirement_met` e cio che il
    dominio ha deciso al momento del calcolo, e ricalcolarlo qui dal confronto
    fra due numeri sarebbe una seconda regola — quella che diverge il giorno in
    cui la soglia diventa «almeno», «piu di» o «arrotondata all'ora».
  */
  const met = accrual
    ? Boolean(accrual.requirement_met ?? accrual.requirementMet)
    : measure.value >= min;

  return { kind: "required", min, unit, met, measured: measure.value };
};

/**
 * «8 ore», oppure «Frequenza non ancora disponibile» (N10).
 *
 * Il testo sta qui e non nella schermata perche e la stessa frase in tre punti
 * — la riga chiusa, il dettaglio, l'esportazione — e tre stesure della stessa
 * frase sono tre occasioni di far ricomparire `undefined`.
 */
export const describeFundingPeriodMeasure = (measure: FundingPeriodMeasure) =>
  measure.kind === "measured"
    ? `${measure.value} ${requirementUnitLabel(measure.unit)}`
    : "Frequenza non ancora disponibile";

/** «Requisito: 10 ore», oppure «Nessun requisito di frequenza» (N11). */
export const describeFundingPeriodRequirement = (
  requirement: FundingPeriodRequirement,
) =>
  requirement.kind === "none"
    ? "Nessun requisito di frequenza"
    : `Requisito: ${requirement.min} ${requirementUnitLabel(requirement.unit)}`;

/**
 * «8 / 10 ore — Non raggiunto», oppure `null` quando non c'e niente da
 * confrontare (N11).
 *
 * `null` e un valore di ritorno legittimo e non un caso limite: su un periodo
 * previsto, o su un bando senza soglia, il confronto **non si fa**.
 */
export const describeFundingPeriodProgress = (
  requirement: FundingPeriodRequirement,
) => {
  if (requirement.kind === "none") return null;
  if (requirement.met === null || requirement.measured === null) return null;

  return `${requirement.measured} / ${requirement.min} ${requirementUnitLabel(
    requirement.unit,
  )} — ${requirement.met ? "Raggiunto" : "Non raggiunto"}`;
};

/**
 * **Tutti i periodi del bando, con accanto la riga che li riguarda.**
 *
 * I periodi li genera la configurazione; le righe arrivano dall'archivio. Il
 * merge e per `period_index`, che e la chiave con cui `recomputeEnrollmentAccruals`
 * gia rende idempotente il ricalcolo.
 *
 * Nessuna riga viene inventata: un periodo senza maturato esce con
 * `accrual: null` e stato `planned`, e chi legge sa che non e stato calcolato,
 * non che vale zero. Le due cose sono diverse, e confonderle e il modo in cui
 * si rendiconta all'ente un mese che nessuno ha guardato.
 */
export const buildFundingPeriodRows = (
  program: any,
  accruals: readonly any[] = [],
  options: { until?: Date | string | null } = {},
): FundingPeriodRow[] => {
  const periods = generateFundingPeriods(program, options);

  const perIndice = new Map<number, any>();
  for (const riga of Array.isArray(accruals) ? accruals : []) {
    const indice = Number(riga?.period_index ?? riga?.periodIndex);
    if (Number.isFinite(indice)) perIndice.set(indice, riga);
  }

  /*
    **La misura e il requisito si risolvono qui, una volta** (N10, N11).

    Prima li leggeva la schermata direttamente dalla riga, e su un periodo
    previsto la riga non c'e: `accrual.measured_value` era `undefined`, e il
    testo usciva «Frequenza EasyGame undefined ore». Il difetto non stava nel
    disegno ma nel fatto che nessuno avesse dato un nome ai due casi in cui il
    numero non esiste — «non ancora misurato» e «il bando non chiede niente».
    Adesso ce l'hanno, e la schermata non ha piu un numero da inventare.
  */
  const descrivi = (
    accrual: Record<string, any> | null,
  ): Pick<
    FundingPeriodRow,
    "measure" | "requirement" | "plannedAmount" | "manualDecision"
  > => {
    const measure = resolveFundingPeriodMeasure(accrual, program);

    return {
      measure,
      requirement: resolveFundingPeriodRequirement(accrual, program, measure),
      plannedAmount: accrual
        ? toFundingAmount(accrual.eligible_amount ?? accrual.eligibleAmount)
        : normalizeFundingProgram(program).periodAmount,
      manualDecision: accrualIsManuallyDecided(accrual),
    };
  };

  const righe: FundingPeriodRow[] = periods.map((period) => {
    const accrual = perIndice.get(period.index) || null;
    perIndice.delete(period.index);

    return {
      periodIndex: period.index,
      label: period.label,
      start: period.start,
      end: period.end,
      status: accrual
        ? ((String(accrual.status || "not_accrued") as FundingAccrualStatus) ??
          "not_accrued")
        : FUNDING_PERIOD_PLANNED,
      accrual,
      ...descrivi(accrual),
    };
  });

  /*
    Una riga il cui periodo la configurazione non genera piu — le date del bando
    sono state accorciate dopo un ricalcolo — non si butta: porta un importo che
    forse e stato rendicontato. Esce in coda, con la propria etichetta congelata.
  */
  for (const orfana of perIndice.values()) {
    righe.push({
      periodIndex: Number(orfana.period_index ?? 0),
      label: String(orfana.period_label || "Periodo"),
      start: String(orfana.period_start || ""),
      end: String(orfana.period_end || ""),
      status: String(orfana.status || "not_accrued") as FundingAccrualStatus,
      accrual: orfana,
      ...descrivi(orfana),
    });
  }

  return righe.sort((a, b) => a.periodIndex - b.periodIndex);
};

export type NormalizedFundingProgram = {
  id: string | null;
  organizationId: string | null;
  name: string;
  funderName: string;
  status: FundingProgramStatus;
  validFrom: string | null;
  validTo: string | null;
  /**
   * **Il massimale del programma**: il tetto che il bando pone al singolo
   * beneficiario. Non e cio che l'atleta usa presso questo club — quello e
   * `assigned_amount` sull'iscrizione, e puo essere molto piu basso.
   */
  athletePlafond: number;
  /** Da dove arriva la maturazione: presenze EasyGame o una fonte esterna. */
  accrualSource: FundingAccrualSource;
  periodAmount: number;
  periodFrequency: FundingPeriodFrequency;
  periodLengthDays: number | null;
  requirementUnit: FundingRequirementUnit;
  requirementMin: number;
  unmetBehavior: FundingUnmetBehavior;
  maxPeriods: number | null;
  maxTotalAmount: number | null;
  notes: string | null;
  data: Record<string, any>;
};

export type FundingPeriod = {
  index: number;
  label: string;
  /** Inizio incluso, in ISO. */
  start: string;
  /** Fine **inclusa**, in ISO: l'ultimo giorno del periodo e dentro. */
  end: string;
};

/* ---------------------------------------------------------------- utility */

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asText = (value: unknown) => String(value ?? "").trim();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

/** Un importo in euro, al centesimo. I confronti si fanno in centesimi. */
export const toFundingAmount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(asText(value).replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const toCents = (value: unknown) => Math.round(toFundingAmount(value) * 100);
const fromCents = (cents: number) => Number((cents / 100).toFixed(2));

/**
 * Una misura del requisito: ore o presenze.
 *
 * Non passa da `toFundingAmount` perche non e denaro — le ore si arrotondano
 * al centesimo di ora (36 secondi) e non al centesimo di euro, ed e comodo che
 * i due arrotondamenti restino due funzioni diverse.
 */
export const toFundingMeasure = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(asText(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
};

const toIsoOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const raw = asText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toPositiveInteger = (value: unknown) => {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const pickEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => {
  const token = asText(value).toLowerCase();
  return (allowed as readonly string[]).includes(token) ? (token as T) : fallback;
};

/* ---------------------------------------------------- normalizzazione */

export const normalizeFundingProgram = (
  value: unknown,
): NormalizedFundingProgram => {
  const record = asRecord(value);

  return {
    id: firstText(record.id) || null,
    organizationId:
      firstText(record.organization_id, record.organizationId) || null,
    name: firstText(record.name) || "Programma senza nome",
    funderName: firstText(record.funder_name, record.funderName) || "",
    status: pickEnum(record.status, FUNDING_PROGRAM_STATUSES, "draft"),
    validFrom: toIsoOrNull(record.valid_from ?? record.validFrom),
    validTo: toIsoOrNull(record.valid_to ?? record.validTo),
    athletePlafond: toFundingAmount(
      record.athlete_plafond ?? record.athletePlafond,
    ),
    accrualSource: pickEnum(
      record.accrual_source ?? record.accrualSource,
      FUNDING_ACCRUAL_SOURCES,
      "easygame_attendance",
    ),
    periodAmount: toFundingAmount(record.period_amount ?? record.periodAmount),
    periodFrequency: pickEnum(
      record.period_frequency ?? record.periodFrequency,
      FUNDING_PERIOD_FREQUENCIES,
      "monthly",
    ),
    periodLengthDays: toPositiveInteger(
      record.period_length_days ?? record.periodLengthDays,
    ),
    requirementUnit: pickEnum(
      record.requirement_unit ?? record.requirementUnit,
      FUNDING_REQUIREMENT_UNITS,
      "hours",
    ),
    requirementMin: toFundingMeasure(
      record.requirement_min ?? record.requirementMin,
    ),
    unmetBehavior: pickEnum(
      record.unmet_behavior ?? record.unmetBehavior,
      FUNDING_UNMET_BEHAVIORS,
      "none",
    ),
    maxPeriods: toPositiveInteger(record.max_periods ?? record.maxPeriods),
    maxTotalAmount:
      record.max_total_amount ?? record.maxTotalAmount
        ? toFundingAmount(record.max_total_amount ?? record.maxTotalAmount)
        : null,
    notes: firstText(record.notes) || null,
    data: asRecord(record.data),
  };
};

/**
 * Valida la configurazione di un programma prima di salvarla.
 *
 * Restituisce il messaggio dell'errore, o `null`. Vive qui perche la stessa
 * regola deve valere per il pannello di configurazione e per il route
 * handler: una soglia salvata a zero su un bando a soglia farebbe maturare
 * tutto, e nessuno se ne accorgerebbe fino alla rendicontazione.
 */
export const validateFundingProgram = (value: unknown): string | null => {
  const program = normalizeFundingProgram(value);

  if (!program.name || program.name === "Programma senza nome") {
    return "Il programma deve avere un nome";
  }

  if (!program.funderName) {
    return "Indica l'ente finanziatore";
  }

  if (!program.validFrom || !program.validTo) {
    return "Indica il periodo di validita del programma";
  }

  if (new Date(program.validTo) < new Date(program.validFrom)) {
    return "Il periodo di validita finisce prima di cominciare";
  }

  if (!(program.athletePlafond > 0)) {
    return "Il plafond per atleta deve essere maggiore di zero";
  }

  if (!(program.periodAmount > 0)) {
    return "L'importo riconosciuto per periodo deve essere maggiore di zero";
  }

  if (program.periodFrequency === "days" && !program.periodLengthDays) {
    return "Con la frequenza a giorni serve la lunghezza del periodo";
  }

  if (program.unmetBehavior !== "full" && !(program.requirementMin > 0)) {
    return "Con un comportamento a soglia serve un requisito minimo maggiore di zero";
  }

  if (program.accrualSource === "external_api") {
    return "L'API esterna non e ancora disponibile: scegli le presenze EasyGame, la conferma esterna o l'importazione";
  }

  return null;
};

/**
 * Vero quando il maturato **non** puo nascere dalle sole presenze EasyGame.
 *
 * E la domanda che separa una previsione da un credito: con una fonte esterna
 * l'appello di EasyGame resta utile — dice in tempo se un atleta sta per
 * mancare la soglia — ma non fa maturare niente finche qualcuno non conferma.
 */
export const requiresExternalConfirmation = (program: unknown) =>
  normalizeFundingProgram(program).accrualSource !== "easygame_attendance";

/**
 * Valida **l'importo assegnato presso questo club**.
 *
 * Massimale del programma e importo assegnato sono due numeri diversi
 * (ADR-0054): il bando riconosce fino a 500 EUR a Mario, ma Mario puo
 * decidere di usarne 300 qui e il resto altrove. EasyGame conosce solo i 300:
 * sono il limite dell'iscrizione, e il massimale serve a validarli, non a
 * sostituirli.
 *
 * `alreadyAccrued` impedisce di abbassare l'assegnato sotto cio che e gia
 * maturato: quel credito e stato calcolato, in parte dichiarato, forse gia
 * incassato, e non si cancella scrivendo un numero piu piccolo.
 */
export const validateAssignedAmount = ({
  program,
  assignedAmount,
  alreadyAccrued = 0,
}: {
  program: unknown;
  assignedAmount: unknown;
  alreadyAccrued?: unknown;
}): string | null => {
  const normalized = normalizeFundingProgram(program);
  const assigned = toFundingAmount(assignedAmount);

  if (!(assigned > 0)) {
    return "L'importo assegnato deve essere maggiore di zero";
  }

  if (toCents(assigned) > toCents(normalized.athletePlafond)) {
    return `L'importo assegnato (${assigned.toFixed(2)} EUR) supera il massimale del programma (${normalized.athletePlafond.toFixed(2)} EUR)`;
  }

  const accrued = toFundingAmount(alreadyAccrued);
  if (toCents(assigned) < toCents(accrued)) {
    return `L'importo assegnato non puo scendere sotto il gia maturato (${accrued.toFixed(2)} EUR)`;
  }

  return null;
};

/* -------------------------------------------------------------- periodi */

const MONTH_LABELS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const startOfUtcDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

/**
 * I periodi di un programma, dal primo all'ultimo.
 *
 * **Perche i periodi non sono una tabella.** Sono interamente derivabili dalla
 * configurazione: salvarli sarebbe una seconda fonte di verita per qualcosa
 * che si ricalcola in un microsecondo, con il rischio classico che le due
 * divergano il giorno in cui qualcuno corregge le date del bando. Il periodo
 * viene denormalizzato **dentro il maturato**, dove serve a spiegare un
 * importo gia calcolato e dove congelarlo e giusto.
 *
 * Il mensile segue il **mese di calendario**, non trenta giorni dall'inizio:
 * un bando che dice «mensilita» intende gennaio, febbraio, marzo, e una
 * rendicontazione sfasata di qualche giorno non e accettabile per l'ente. Il
 * primo e l'ultimo periodo possono quindi essere parziali, e restano tali
 * invece di essere allungati oltre la validita del programma.
 */
export const generateFundingPeriods = (
  program: unknown,
  options: { until?: Date | string | null } = {},
): FundingPeriod[] => {
  const normalized = normalizeFundingProgram(program);
  if (!normalized.validFrom || !normalized.validTo) {
    return [];
  }

  const from = startOfUtcDay(new Date(normalized.validFrom));
  const declaredTo = startOfUtcDay(new Date(normalized.validTo));
  const requestedUntil = options.until
    ? startOfUtcDay(new Date(options.until))
    : null;

  /*
    `until` accorcia, non allunga: serve a chiedere «i periodi fino a oggi»
    senza far comparire mensilita future, ma non puo estendere un programma
    oltre la sua validita.
  */
  const to =
    requestedUntil && requestedUntil < declaredTo ? requestedUntil : declaredTo;

  if (to < from) {
    return [];
  }

  const periods: FundingPeriod[] = [];
  const limit = normalized.maxPeriods ?? Number.MAX_SAFE_INTEGER;
  /*
    Tetto di sicurezza indipendente dalla configurazione: un programma con date
    sbagliate non deve poter generare un milione di periodi e bloccare il
    processo. 600 periodi coprono cinquant'anni di mensilita.
  */
  const HARD_LIMIT = 600;

  let cursor = from;
  let index = 0;

  while (cursor <= to && index < limit && index < HARD_LIMIT) {
    let periodEnd: Date;
    let label: string;

    if (normalized.periodFrequency === "monthly") {
      const lastDayOfMonth = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
      );
      periodEnd = lastDayOfMonth > to ? to : lastDayOfMonth;
      label = `${MONTH_LABELS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;
    } else {
      const length = normalized.periodLengthDays || 30;
      const naturalEnd = addUtcDays(cursor, length - 1);
      periodEnd = naturalEnd > to ? to : naturalEnd;
      label = `Periodo ${index + 1}`;
    }

    periods.push({
      index,
      label,
      start: cursor.toISOString(),
      end: periodEnd.toISOString(),
    });

    cursor = addUtcDays(periodEnd, 1);
    index += 1;
  }

  return periods;
};

/* ------------------------------------------------------------- maturato */

export type PeriodAccrualResult = {
  requirementMin: number;
  requirementUnit: FundingRequirementUnit;
  measuredValue: number;
  requirementMet: boolean;
  /** Quanto varrebbe il periodo se maturasse per intero. */
  eligibleAmount: number;
  /**
   * **La previsione EasyGame**: quanto il periodo varrebbe secondo l'appello
   * registrato qui, gia limitato dal residuo assegnato.
   *
   * Con la fonte `easygame_attendance` coincide con `accruedAmount`. Con una
   * fonte esterna resta un numero da leggere — «a questo ritmo maturera 60
   * EUR» — mentre il maturato resta zero finche l'ente non conferma.
   */
  estimatedAmount: number;
  /** Quanto matura davvero, dopo soglia, plafond residuo e conferma. */
  accruedAmount: number;
  /** Quanto e andato perso: `eligibleAmount - accruedAmount`. */
  unaccruedAmount: number;
  status: FundingAccrualStatus;
  /** Da dove arriva l'importo maturato, quando ce n'e uno. */
  origin: FundingAccrualOrigin | null;
  /** Perche l'importo e quello: si mostra all'operatore, non si deduce. */
  reason: string;
};

/**
 * Quanto matura un periodo.
 *
 * `remainingPlafond` e cio che resta dell'importo assegnato all'atleta
 * **prima** di questo periodo: e la ragione per cui il calcolo va fatto in
 * ordine cronologico e non periodo per periodo in isolamento. Con un
 * assegnato di 300 e mensilita da 60, la sesta mensilita matura 0 e non 60.
 *
 * `confirmedAmount` e l'importo che una fonte esterna ha riconosciuto per
 * questo periodo. Vale **solo** per i programmi a conferma esterna, e resta
 * comunque limitato dal residuo assegnato: nessuna conferma puo far maturare
 * piu di quanto il club ha in carico per quell'atleta (ADR-0054).
 */
export const calculatePeriodAccrual = ({
  program,
  measuredValue,
  remainingPlafond,
  confirmedAmount = null,
  confirmationOrigin = "manual_confirmation",
}: {
  program: unknown;
  measuredValue: unknown;
  remainingPlafond: unknown;
  confirmedAmount?: unknown;
  confirmationOrigin?: FundingAccrualOrigin;
}): PeriodAccrualResult => {
  const normalized = normalizeFundingProgram(program);
  const measured = toFundingMeasure(measuredValue);
  const requirement = normalized.requirementMin;
  const eligible = normalized.periodAmount;
  const remainingCents = Math.max(0, toCents(remainingPlafond));

  const met = requirement <= 0 ? measured > 0 : measured >= requirement;

  let grossCents: number;
  let reason: string;

  if (met) {
    grossCents = toCents(eligible);
    reason = "Requisito raggiunto";
  } else if (normalized.unmetBehavior === "full") {
    grossCents = toCents(eligible);
    reason = "Il programma riconosce il periodo anche sotto la soglia";
  } else if (normalized.unmetBehavior === "prorata") {
    const ratio = requirement > 0 ? Math.min(1, measured / requirement) : 0;
    grossCents = Math.round(toCents(eligible) * ratio);
    reason =
      grossCents > 0
        ? "Sotto la soglia: riconosciuto in proporzione"
        : "Nessuna frequenza registrata nel periodo";
  } else {
    grossCents = 0;
    reason =
      measured > 0
        ? `Sotto la soglia di ${requirement} ${requirementUnitLabel(normalized.requirementUnit)}`
        : "Nessuna frequenza registrata nel periodo";
  }

  const cappedCents = Math.min(grossCents, remainingCents);
  if (cappedCents < grossCents) {
    reason =
      cappedCents > 0
        ? "Importo assegnato quasi esaurito: riconosciuto fino al residuo"
        : "Importo assegnato esaurito";
  }

  const estimatedCents = cappedCents;
  const external = normalized.accrualSource !== "easygame_attendance";

  /*
    Fonte EasyGame: la previsione **e** il maturato, e non c'e niente da
    aspettare. E il caso dei bandi in cui l'appello del club fa fede.
  */
  if (!external) {
    return {
      requirementMin: requirement,
      requirementUnit: normalized.requirementUnit,
      measuredValue: measured,
      requirementMet: met,
      eligibleAmount: eligible,
      estimatedAmount: fromCents(estimatedCents),
      accruedAmount: fromCents(cappedCents),
      unaccruedAmount: fromCents(Math.max(0, toCents(eligible) - cappedCents)),
      status: cappedCents > 0 ? "accrued" : "not_accrued",
      origin: cappedCents > 0 ? "easygame_attendance" : null,
      reason,
    };
  }

  /*
    Fonte esterna e nessuna conferma: si mostra la previsione e si dichiara
    che il periodo e da confermare. Anche un periodo senza presenze EasyGame
    resta confermabile: la piattaforma ufficiale puo conoscere ore che qui
    nessuno ha registrato, ed e proprio per questo che la fonte e la sua.
  */
  if (confirmedAmount === null || confirmedAmount === undefined) {
    return {
      requirementMin: requirement,
      requirementUnit: normalized.requirementUnit,
      measuredValue: measured,
      requirementMet: met,
      eligibleAmount: eligible,
      estimatedAmount: fromCents(estimatedCents),
      accruedAmount: 0,
      unaccruedAmount: 0,
      status: "pending_confirmation",
      origin: null,
      reason: met
        ? "Previsione EasyGame: requisito raggiunto. In attesa di conferma dalla fonte ufficiale"
        : "In attesa di conferma dalla fonte ufficiale",
    };
  }

  const confirmedCents = Math.min(
    Math.max(0, toCents(confirmedAmount)),
    remainingCents,
  );
  const truncated = toCents(confirmedAmount) > remainingCents;

  return {
    requirementMin: requirement,
    requirementUnit: normalized.requirementUnit,
    measuredValue: measured,
    requirementMet: met,
    eligibleAmount: eligible,
    estimatedAmount: fromCents(estimatedCents),
    accruedAmount: fromCents(confirmedCents),
    unaccruedAmount: fromCents(
      Math.max(0, toCents(eligible) - confirmedCents),
    ),
    status: confirmedCents > 0 ? "accrued" : "not_accrued",
    origin: confirmedCents > 0 ? confirmationOrigin : null,
    reason: truncated
      ? "Conferma esterna ridotta al residuo dell'importo assegnato"
      : confirmedCents > 0
        ? "Confermato dalla fonte ufficiale"
        : "La fonte ufficiale non ha riconosciuto niente per questo periodo",
  };
};

export const requirementUnitLabel = (unit: FundingRequirementUnit) =>
  unit === "sessions" ? "presenze" : "ore";

/* --------------------------------------------- la decisione di una persona */

/**
 * **Cosa una persona puo decidere di un periodo** (N12).
 *
 * Non sono stati nuovi: sono i **gesti** che portano un periodo negli stati che
 * gia esistono. `accrued` e `not_accrued` sono i due stati canonici del
 * dominio, e `auto` non e uno stato affatto — e la rinuncia alla decisione, che
 * restituisce il periodo al ricalcolo.
 *
 * ## Perche la decisione manuale esiste
 *
 * Perche la frequenza registrata in EasyGame **non e l'autorita** su cio che un
 * ente riconosce. Lo era di fatto: su un bando a fonte `easygame_attendance` il
 * solo modo di far maturare un mese era registrare abbastanza presenze, e un
 * club che sapeva — dall'ente, da una comunicazione, da una deroga — che quel
 * mese valeva, non aveva nessuna riga da premere. La frequenza resta il dato
 * che **sostiene** la decisione; non e piu la decisione.
 *
 * ## Perche `auto` c'e
 *
 * Perche una decisione che non si puo ritirare e una trappola. Segnato a mano
 * un mese per sbaglio, senza `auto` quel mese resterebbe fuori dal ricalcolo
 * per sempre, e l'unico rimedio sarebbe una riga scritta in archivio a mano.
 */
export const FUNDING_PERIOD_DECISIONS = [
  "accrued",
  "not_accrued",
  "auto",
] as const;
export type FundingPeriodDecision = (typeof FUNDING_PERIOD_DECISIONS)[number];

export const FUNDING_PERIOD_DECISION_LABELS: Record<
  FundingPeriodDecision,
  string
> = {
  accrued: "Segna come maturato",
  not_accrued: "Segna come non maturato",
  auto: "Torna al calcolo automatico",
};

export type ManualPeriodDecisionResult = {
  readonly accruedAmount: number;
  readonly unaccruedAmount: number;
  readonly status: Extract<FundingAccrualStatus, "accrued" | "not_accrued">;
  readonly origin: FundingAccrualOrigin | null;
  readonly reason: string;
  /** Vero quando il residuo assegnato ha ridotto l'importo chiesto. */
  readonly truncated: boolean;
};

/**
 * **Quanto vale un periodo che una persona dichiara maturato** (N12).
 *
 * Due limiti, e sono gli stessi che valgono per la conferma esterna: non si
 * matura piu di quanto il periodo valga (`eligibleAmount`), e non si matura
 * oltre il residuo dell'importo assegnato al club. Il secondo e quello che
 * conta: senza, una segreteria potrebbe portare un voucher da 300 a 720
 * premendo dodici volte lo stesso pulsante.
 *
 * Non produce **niente** che assomigli a un incasso: restituisce un maturato,
 * che e un credito verso un ente e resta tale finche l'ente non liquida.
 */
export const calculateManualPeriodDecision = ({
  decision,
  eligibleAmount,
  remainingPlafond,
  requestedAmount = null,
}: {
  decision: Exclude<FundingPeriodDecision, "auto">;
  eligibleAmount: unknown;
  remainingPlafond: unknown;
  requestedAmount?: unknown;
}): ManualPeriodDecisionResult => {
  const eligibleCents = Math.max(0, toCents(eligibleAmount));
  const remainingCents = Math.max(0, toCents(remainingPlafond));

  if (decision === "not_accrued") {
    return {
      accruedAmount: 0,
      unaccruedAmount: fromCents(eligibleCents),
      status: "not_accrued",
      origin: null,
      reason: "Periodo dichiarato non maturato dalla societa",
      truncated: false,
    };
  }

  const chiestoCents =
    requestedAmount === null || requestedAmount === undefined
      ? eligibleCents
      : Math.max(0, toCents(requestedAmount));

  const volutoCents = Math.min(chiestoCents, eligibleCents);
  const concessoCents = Math.min(volutoCents, remainingCents);

  return {
    accruedAmount: fromCents(concessoCents),
    unaccruedAmount: fromCents(Math.max(0, eligibleCents - concessoCents)),
    /*
      Zero maturato **non** e «maturato per zero»: un periodo che vale zero e
      un periodo non maturato, e chiamarlo altrimenti farebbe comparire nel
      rendiconto all'ente una riga da zero euro.
    */
    status: concessoCents > 0 ? "accrued" : "not_accrued",
    origin: concessoCents > 0 ? "manual_confirmation" : null,
    reason:
      concessoCents < volutoCents
        ? concessoCents > 0
          ? "Dichiarato maturato dalla societa, ridotto al residuo dell'importo assegnato"
          : "Importo assegnato esaurito: non resta niente da far maturare"
        : "Periodo dichiarato maturato dalla societa",
    truncated: concessoCents < volutoCents,
  };
};

/* ------------------------------------------ togliere un atleta dal bando */

/**
 * **Cosa succede se si toglie questo atleta dal programma** (N13).
 *
 * Una funzione sola perche la domanda ha **due** consumatori che devono dare
 * la stessa risposta: il servizio, che sceglie fra cancellare e revocare, e la
 * schermata, che deve dirlo **prima** che qualcuno prema. Prima la schermata
 * non lo diceva affatto — non c'era nessun pulsante — e il servizio decideva
 * da solo dentro una `DELETE`.
 *
 * ## I tre casi, e perche sono tre
 *
 * * **`delete`** — non e mai successo niente: nessun maturato dichiarato
 *   all'ente, nessuna liquidazione, nessuna copertura promessa a una famiglia.
 *   La riga si porta via, e non lascia buchi.
 * * **`revoke`** — qualcosa e successo, ma nessun denaro dell'ente e arrivato.
 *   L'adesione passa a `closed` e resta leggibile; le coperture promesse si
 *   stornano, e la quota a carico della famiglia **risale**.
 * * **`settled`** — l'ente ha gia versato. Qui l'annullamento semplice non
 *   esiste: cancellare le coperture mentre il club tiene il denaro dell'ente
 *   farebbe pagare due volte lo stesso importo — una alla famiglia e una
 *   all'ente. Si passa dallo storno della liquidazione, che e un atto
 *   contabile con un suo percorso.
 *
 * **Una copertura, anche gia stornata, e storico.** La chiave esterna
 * dell'adesione sulle coperture e `ON DELETE RESTRICT`: cancellarla con delle
 * righe agganciate fallirebbe in archivio, ed e il difetto C1 della revisione
 * ostile. La regola sta qui una volta sola perche il servizio e la schermata
 * non possano leggerla in due modi.
 */
export type EnrollmentRemovalOutcome = "delete" | "revoke" | "settled";

export type EnrollmentRemovalPlan = {
  readonly outcome: EnrollmentRemovalOutcome;
  /** Le ragioni, in italiano, da mostrare a chi sta per premere. */
  readonly reasons: readonly string[];
  readonly settledAmount: number;
  /**
   * Quante righe di liquidazione sono agganciate ai periodi, **storni
   * compresi**. Zero euro non vuol dire zero righe, e la chiave esterna guarda
   * le righe.
   */
  readonly settlementLineCount: number;
  readonly reportedPeriodCount: number;
  readonly coverageRowCount: number;
  /** Quante coperture vive tornerebbero a carico della famiglia. */
  readonly liveCoverageCount: number;
};

export const describeEnrollmentRemoval = ({
  accruals = [],
  settlementLines = [],
  coverageAllocations = [],
}: {
  accruals?: readonly unknown[];
  settlementLines?: readonly unknown[];
  /** Le righe di copertura dell'adesione, storni compresi. */
  coverageAllocations?: readonly unknown[];
}): EnrollmentRemovalPlan => {
  const righeMaturato = Array.isArray(accruals) ? accruals : [];
  const righeLiquidazione = Array.isArray(settlementLines)
    ? settlementLines
    : [];
  const righeCopertura = Array.isArray(coverageAllocations)
    ? coverageAllocations
    : [];

  const settledCents = righeLiquidazione.reduce(
    (totale, riga) => totale + toCents(asRecord(riga).amount),
    0,
  );

  const reportedPeriodCount = righeMaturato.filter((riga) =>
    ["reported", "settled"].includes(asText(asRecord(riga).status)),
  ).length;

  const liveCoverageCount = righeCopertura.filter((riga) => {
    const record = asRecord(riga);
    return (
      !record.reversed_at &&
      !record.reversedAt &&
      !record.reverses_allocation_id &&
      !record.reversesAllocationId
    );
  }).length;

  const reasons: string[] = [];
  if (settledCents > 0) {
    reasons.push(
      `L'ente ha gia liquidato ${fromCents(settledCents).toFixed(2)} EUR su questa adesione`,
    );
  } else if (righeLiquidazione.length > 0) {
    /*
      **Una liquidazione stornata e comunque storia** (revisione ostile, F1).

      Lo storno di una liquidazione scrive una riga di segno opposto: la somma
      torna a zero, ma le righe restano — e la chiave esterna che le lega al
      maturato e `ON DELETE RESTRICT` (`funding_settlement_lines_accrual_id_fkey`).

      La prima stesura di questa funzione decideva sull'**importo** invece che
      sull'**esistenza**, quindi dopo uno storno rispondeva «cancella»: il
      servizio provava a cancellare i maturati, l'archivio rifiutava, e a quel
      punto le coperture erano gia state stornate e committate. Adesione viva,
      famiglia tornata a pagare tutto, e nessun modo di ritentare.

      E la forma esatta del difetto C1, un vincolo piu in la — e la prova che
      lo copriva non poteva vederlo, perche il doppio di Prisma non fa valere
      le chiavi esterne. La decisione torna a essere di **esistenza**.
    */
    reasons.push(
      `Una liquidazione e stata registrata e poi stornata: le sue righe restano agganciate ai periodi`,
    );
  }
  if (reportedPeriodCount > 0) {
    reasons.push(
      `${reportedPeriodCount} ${reportedPeriodCount === 1 ? "periodo e stato dichiarato" : "periodi sono stati dichiarati"} all'ente`,
    );
  }
  if (righeCopertura.length > 0) {
    reasons.push(
      `${righeCopertura.length} ${righeCopertura.length === 1 ? "copertura e stata promessa" : "coperture sono state promesse"} su delle rate`,
    );
  }

  /*
    **`settled` guarda l'importo, `revoke` guarda l'esistenza.**

    Sono due domande diverse e vanno tenute distinte: «l'ente tiene ancora del
    nostro denaro?» decide se serve un consenso esplicito, «esiste una riga
    agganciata?» decide se si puo cancellare. Una liquidazione interamente
    stornata risponde **no** alla prima e **si** alla seconda.
  */
  const outcome: EnrollmentRemovalOutcome =
    settledCents > 0
      ? "settled"
      : reasons.length > 0
        ? "revoke"
        : "delete";

  return {
    outcome,
    reasons,
    settledAmount: fromCents(settledCents),
    settlementLineCount: righeLiquidazione.length,
    reportedPeriodCount,
    coverageRowCount: righeCopertura.length,
    liveCoverageCount,
  };
};

/**
 * Il maturato di **tutti** i periodi di un beneficiario, in ordine.
 *
 * Va fatto in una passata sola e in ordine cronologico perche il plafond e
 * condiviso fra i periodi: il residuo che entra in un periodo dipende da
 * quanto hanno consumato i precedenti.
 */
export const calculateEnrollmentAccruals = ({
  program,
  assignedAmount,
  periods,
  measureForPeriod,
  confirmationForPeriod,
}: {
  program: unknown;
  assignedAmount: unknown;
  periods: FundingPeriod[];
  /** Quante ore o presenze valide ha l'atleta in quel periodo. */
  measureForPeriod: (period: FundingPeriod) => number;
  /**
   * L'importo che la fonte esterna ha riconosciuto per quel periodo, se una
   * conferma esiste. `null` — o la funzione assente — vuol dire «non ancora
   * confermato», che non e la stessa cosa di «confermato a zero».
   */
  confirmationForPeriod?: (period: FundingPeriod) => {
    amount: number;
    origin?: FundingAccrualOrigin;
  } | null;
}) => {
  let remainingCents = Math.max(0, toCents(assignedAmount));

  return periods.map((period) => {
    const confirmation = confirmationForPeriod?.(period) ?? null;
    const result = calculatePeriodAccrual({
      program,
      measuredValue: measureForPeriod(period),
      remainingPlafond: fromCents(remainingCents),
      confirmedAmount: confirmation ? confirmation.amount : null,
      confirmationOrigin: confirmation?.origin ?? "manual_confirmation",
    });

    remainingCents = Math.max(0, remainingCents - toCents(result.accruedAmount));

    return { period, ...result };
  });
};

/* ------------------------------------------------------------ riepilogo */

export type FundingSummary = {
  /**
   * **L'importo assegnato presso questo club.** Non e il massimale del
   * programma — quello sta sul programma — e non e denaro incassato.
   */
  assignedAmount: number;
  /** Quanto ha guadagnato frequentando. E un credito, non cassa. */
  accruedAmount: number;
  /**
   * **La previsione**: quanto i periodi in attesa di conferma varrebbero
   * secondo le presenze EasyGame. Non e un credito e non si somma al
   * maturato: si mostra accanto, per far vedere cosa c'e da confermare.
   */
  estimatedAmount: number;
  /** Quanto e stato dichiarato all'ente. */
  reportedAmount: number;
  /** Quanto l'ente ha versato davvero. Questo, e solo questo, e cassa. */
  settledAmount: number;
  /** Maturato ma non ancora liquidato. */
  pendingSettlementAmount: number;
  /** Quanto del plafond puo ancora maturare. */
  residualAmount: number;
  /** Quanto e andato perso perche il requisito non e stato raggiunto. */
  unaccruedAmount: number;
  periodCount: number;
  accruedPeriodCount: number;
  missedPeriodCount: number;
  /** Periodi che aspettano la conferma di una fonte esterna. */
  pendingConfirmationPeriodCount: number;
};

const accrualStatusOf = (accrual: Record<string, any>): FundingAccrualStatus =>
  pickEnum(accrual.status, FUNDING_ACCRUAL_STATUSES, "not_accrued");

/**
 * I cinque importi di un beneficiario, piu cio che serve a spiegarli.
 *
 * `settledAmount` si legge dalle **righe di liquidazione**, non dallo stato
 * del maturato: lo stato dice che una liquidazione e arrivata, le righe dicono
 * quanto. Con liquidazioni parziali — che sono la norma — i due numeri
 * differiscono, e quello autorevole e il secondo.
 */
export const summarizeFunding = ({
  assignedAmount,
  accruals = [],
  settlementLines = [],
}: {
  assignedAmount: unknown;
  accruals?: unknown[];
  settlementLines?: unknown[];
}): FundingSummary => {
  const assignedCents = Math.max(0, toCents(assignedAmount));

  let accruedCents = 0;
  let estimatedCents = 0;
  let reportedCents = 0;
  let unaccruedCents = 0;
  let accruedPeriodCount = 0;
  let missedPeriodCount = 0;
  let pendingConfirmationPeriodCount = 0;

  for (const raw of Array.isArray(accruals) ? accruals : []) {
    const accrual = asRecord(raw);
    const status = accrualStatusOf(accrual);
    const accrued = toCents(accrual.accrued_amount ?? accrual.accruedAmount);

    accruedCents += accrued;
    unaccruedCents += toCents(
      accrual.unaccrued_amount ?? accrual.unaccruedAmount,
    );

    if (status === "reported" || status === "settled") {
      reportedCents += accrued;
    }

    if (status === "pending_confirmation") {
      pendingConfirmationPeriodCount += 1;
      estimatedCents += toCents(
        accrual.estimated_amount ?? accrual.estimatedAmount,
      );
      continue;
    }

    if (accrued > 0) accruedPeriodCount += 1;
    else missedPeriodCount += 1;
  }

  const settledCents = (Array.isArray(settlementLines) ? settlementLines : [])
    .map((line) => toCents(asRecord(line).amount))
    .reduce((total, value) => total + value, 0);

  return {
    assignedAmount: fromCents(assignedCents),
    accruedAmount: fromCents(accruedCents),
    estimatedAmount: fromCents(estimatedCents),
    reportedAmount: fromCents(reportedCents),
    settledAmount: fromCents(settledCents),
    pendingSettlementAmount: fromCents(Math.max(0, accruedCents - settledCents)),
    residualAmount: fromCents(Math.max(0, assignedCents - accruedCents)),
    unaccruedAmount: fromCents(unaccruedCents),
    periodCount: (Array.isArray(accruals) ? accruals : []).length,
    accruedPeriodCount,
    missedPeriodCount,
    pendingConfirmationPeriodCount,
  };
};

/**
 * Somma i riepiloghi di piu programmi dello stesso atleta.
 *
 * Un atleta puo beneficiare di due contributi insieme — un voucher regionale e
 * uno comunale — e la scheda economica deve poterli mostrare come un totale
 * oltre che uno per uno.
 */
export const mergeFundingSummaries = (
  summaries: FundingSummary[] = [],
): FundingSummary =>
  summaries.reduce<FundingSummary>(
    (total, summary) => ({
      assignedAmount: fromCents(
        toCents(total.assignedAmount) + toCents(summary.assignedAmount),
      ),
      accruedAmount: fromCents(
        toCents(total.accruedAmount) + toCents(summary.accruedAmount),
      ),
      estimatedAmount: fromCents(
        toCents(total.estimatedAmount) + toCents(summary.estimatedAmount),
      ),
      reportedAmount: fromCents(
        toCents(total.reportedAmount) + toCents(summary.reportedAmount),
      ),
      settledAmount: fromCents(
        toCents(total.settledAmount) + toCents(summary.settledAmount),
      ),
      pendingSettlementAmount: fromCents(
        toCents(total.pendingSettlementAmount) +
          toCents(summary.pendingSettlementAmount),
      ),
      residualAmount: fromCents(
        toCents(total.residualAmount) + toCents(summary.residualAmount),
      ),
      unaccruedAmount: fromCents(
        toCents(total.unaccruedAmount) + toCents(summary.unaccruedAmount),
      ),
      periodCount: total.periodCount + summary.periodCount,
      accruedPeriodCount:
        total.accruedPeriodCount + summary.accruedPeriodCount,
      missedPeriodCount: total.missedPeriodCount + summary.missedPeriodCount,
      pendingConfirmationPeriodCount:
        total.pendingConfirmationPeriodCount +
        summary.pendingConfirmationPeriodCount,
    }),
    {
      assignedAmount: 0,
      accruedAmount: 0,
      estimatedAmount: 0,
      reportedAmount: 0,
      settledAmount: 0,
      pendingSettlementAmount: 0,
      residualAmount: 0,
      unaccruedAmount: 0,
      periodCount: 0,
      accruedPeriodCount: 0,
      missedPeriodCount: 0,
      pendingConfirmationPeriodCount: 0,
    },
  );

/**
 * Valida la ripartizione di una liquidazione sui periodi maturati.
 *
 * L'ente versa in blocco; le righe dicono a chi e a cosa quel bonifico si
 * riferisce. Senza questa validazione «liquidato» diventerebbe un totale che
 * non si puo attribuire, oppure si potrebbe liquidare piu di quanto e maturato.
 */
export const validateSettlementAllocation = ({
  amount,
  lines = [],
  accrualsById = new Map<string, { accruedAmount: number; settledAmount: number }>(),
}: {
  amount: unknown;
  lines?: Array<{ accrualId: string; amount: unknown }>;
  accrualsById?: Map<string, { accruedAmount: number; settledAmount: number }>;
}): string | null => {
  const totalCents = toCents(amount);

  if (!(totalCents > 0)) {
    return "L'importo della liquidazione deve essere maggiore di zero";
  }

  if (lines.length === 0) {
    return "Indica a quali periodi si riferisce la liquidazione";
  }

  let allocatedCents = 0;
  const seen = new Set<string>();

  for (const line of lines) {
    const lineCents = toCents(line.amount);
    if (!(lineCents > 0)) {
      return "Ogni riga della liquidazione deve avere un importo maggiore di zero";
    }

    if (seen.has(line.accrualId)) {
      return "Lo stesso periodo compare due volte nella liquidazione";
    }
    seen.add(line.accrualId);

    const accrual = accrualsById.get(line.accrualId);
    if (!accrual) {
      return "Una riga della liquidazione punta a un periodo che non esiste";
    }

    const availableCents =
      toCents(accrual.accruedAmount) - toCents(accrual.settledAmount);
    if (lineCents > availableCents) {
      return `Non si puo liquidare piu di quanto e maturato: restano ${fromCents(Math.max(0, availableCents)).toFixed(2)} EUR su quel periodo`;
    }

    allocatedCents += lineCents;
  }

  if (allocatedCents !== totalCents) {
    return `La ripartizione (${fromCents(allocatedCents).toFixed(2)} EUR) non corrisponde all'importo liquidato (${fromCents(totalCents).toFixed(2)} EUR)`;
  }

  return null;
};
