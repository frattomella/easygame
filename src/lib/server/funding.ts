import { prisma } from "./prisma";
import { resolveInboundClassification } from "./fiscal-config";
import { assertContoDelClub } from "./financial-account-guard";
import { canAccessClubResource } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import {
  buildFundingReconciliation,
  type FundingReconciliation,
} from "@/lib/funding/reconciliation";
import {
  accrualHasSettledMoney,
  accrualIsManuallyDecided,
  calculateManualPeriodDecision,
  describeSettlementEligibility,
  describeSettlementLine,
  describeSettlementReversalLine,
  pendingSettlementOfAccrual,
  calculatePeriodAccrual,
  describeEnrollmentRemoval,
  generateFundingPeriods,
  normalizeFundingProgram,
  requiresExternalConfirmation,
  summarizeFunding,
  toFundingAmount,
  validateAssignedAmount,
  validateFundingProgram,
  validateSettlementAllocation,
  FUNDING_ACCRUAL_MANUAL_FLAG,
  FUNDING_ACCRUAL_MEASURED_FLAG,
  FUNDING_ACCRUAL_ORIGINS,
  FUNDING_PERIOD_DECISIONS,
  FUNDING_PROGRAM_DESCRIPTIVE_FIELDS,
  buildFundingPeriodRows,
  FUNDING_PROGRAM_STATUS_LABELS,
  SETTLED_MONEY_REFUSAL,
  canTransitionFundingProgram,
  fundingProgramAcceptsEnrollments,
  fundingProgramAccruesNow,
  type EnrollmentRemovalPlan,
  type FundingAccrualOrigin,
  type FundingPeriod,
  type FundingPeriodDecision,
  type FundingProgramStatus,
} from "@/lib/funding/funding-model";
import {
  assertFundingPermission,
  hasFundingPermission,
} from "@/lib/funding/permissions";
import {
  assertFundingSettlementPermission,
  canActOnFundingSettlement,
  canChooseSettlementAccount,
} from "@/lib/funding/settlement-permissions";
import { measureAttendanceByPeriod } from "@/lib/funding/attendance-measure";
/*
  **Il dominio dei bandi non importa quello dei pagamenti** (ADR-0037 §5), e
  continua a non farlo: `payment-coverage.ts` scrive le **coperture**, che non
  sono incassi e non toccano `payment_transactions`. Cio che arriva di qui e
  la revoca di una promessa, non un movimento di denaro.
*/
import {
  readCommittedCoverageForEnrollment,
  reverseAllCoverageForEnrollment,
} from "./payment-coverage";
import { toEventLegacyShape } from "@/lib/events/model";
import {
  matchConfirmationsToPeriods,
  parseConfirmationImport,
} from "@/lib/funding/confirmation-import";
import {
  buildSiteIndex,
  filterTrainingsForAthleteGroups,
  getAthleteGroupIds,
  normalizeClubSites,
} from "@/lib/club-sites";

/**
 * Il servizio dei contributi: **l'unico** punto in cui EasyGame calcola un
 * maturato o registra una liquidazione (Workstream A, ADR-0037).
 *
 * Tre proprieta valgono qui e non altrove.
 *
 * 1. **La segreteria non fa calcoli.** `recomputeEnrollmentAccruals` legge le
 *    presenze e gli allenamenti, misura ore o sessioni periodo per periodo,
 *    applica la configurazione del programma e scrive il maturato. Nessun
 *    numero viene digitato a mano.
 * 2. **Il ricalcolo e idempotente.** L'unico `(enrollment_id, period_index)`
 *    fa si che ricalcolare aggiorni la riga del periodo invece di
 *    aggiungerne una seconda. E la proprieta che permette di rifare il conto
 *    ogni volta che qualcuno corregge un appello.
 * 3. **Un periodo gia liquidato non si riscrive.** L'ente ha versato su un
 *    numero: cambiarlo dopo renderebbe la riconciliazione una finzione.
 *
 * Il confine di sicurezza e `organization_id`, come per ogni risorsa di club.
 */

export type FundingScope = {
  userId: string;
  activeOrganizationId: string | null;
  /** Il ruolo nel club attivo. Serve al permesso, che il confine non sostituisce. */
  activeRole?: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

/**
 * **La chiave di un gesto e una stringa, o non e niente** (revisione ostile, 6a).
 *
 * `String({})` vale `"[object Object]"`: un oggetto mandato al posto della
 * chiave diventava un gettone **stabile e indovinabile**, uguale per chiunque
 * facesse lo stesso errore. La prima richiesta lo scriveva, e da li in poi ogni
 * liquidazione di quel club con lo stesso corpo malformato riceveva `201` e la
 * riga della prima: il bonifico arrivava, il credito restava aperto, e nessuno
 * vedeva un errore.
 *
 * Si accetta percio **solo** una stringa, e con un tetto: la chiave e un
 * identificativo di gesto, non un campo di testo.
 */
const CHIAVE_MASSIMA = 120;

const normalizeIdempotencyKey = (value: unknown) => {
  if (typeof value !== "string") return "";

  const chiave = value.trim();
  if (!chiave) return "";

  if (chiave.length > CHIAVE_MASSIMA) {
    throw new Error(
      `La chiave dell'operazione supera ${CHIAVE_MASSIMA} caratteri: e un identificativo, non una nota`,
    );
  }

  return chiave;
};

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * Il confine, ed e il **club attivo** — non l'insieme dei club accessibili.
 *
 * **Il difetto che l'audit della Wave 4 ha misurato qui.** Il confronto era con
 * `allowedOrganizationIds`, cioe con tutti i club a cui l'utente appartiene.
 * Ma il permesso si verifica con `activeRole`, che e il ruolo **nel club
 * attivo**: i due insiemi non coincidono mai per chi ha piu di un club, e
 * chiunque puo crearsi una societa e diventarne proprietario.
 *
 * Bastava mandare `x-active-club-id: <la mia>` insieme all'identificativo di
 * un contributo **di un'altra**, e il permesso veniva concesso con il ruolo
 * sbagliato. L'audit lo ha provato end-to-end: un genitore in un club, e
 * proprietario nel proprio, ha letto l'IBAN altrui, rinominato un conto,
 * registrato un'uscita da 70.000 euro e stornato un movimento.
 *
 * **Era gia stato trovato e chiuso una volta**, in
 * `src/lib/server/document-templates.ts`, con il commento che lo racconta. Sei
 * moduli nuovi lo hanno reintrodotto: la lezione non era nel codice, era in un
 * commento che nessuno ha riletto.
 *
 * La regola giusta e una sola: **la riga deve appartenere al club attivo**. Per
 * lavorare su un altro club si cambia club, e il ruolo viene risolto di nuovo
 * per quello.
 */
const ensureOrganizationAccess = (
  scope: FundingScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) {
    throw denied("contributo senza club");
  }
  const attivo = asText(scope.activeOrganizationId);
  if (!attivo) throw denied("nessun club attivo selezionato");
  if (attivo !== asText(organizationId)) {
    throw denied("non trovato, o non appartiene al club attivo");
  }

  /*
    **E il permesso, che nelle letture non c'era.**

    Le scritture chiedevano `canManageClubConfiguration`; le letture non
    chiedevano niente, e ogni `GET` sotto `/api/v1/funding` era aperta a
    chiunque appartenesse al club — compresa la riconciliazione di un bando e
    il suo export CSV. Sapere **quali famiglie** sono iscritte a un voucher e
    per quanto e un'affermazione sulla loro situazione economica, ed era la
    lettura piu delicata del dominio e l'unica senza porta.

    Il confine dice **su quale club**; questo dice **se puoi**. I due controlli
    sono entrambi obbligatori — vedi `src/lib/auth/active-club-boundary.ts` — e
    stanno insieme perche nessuno ne aggiunga uno solo.
  */
  if (!canAccessClubResource(scope.activeRole, "payments", "read")) {
    throw denied(
      "i contributi pubblici li vede chi tiene i conti del club: dicono la situazione economica di una famiglia",
    );
  }
};

const resolveOrganizationId = (
  scope: FundingScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per il contributo");
    return wanted;
  }

  /*
    **Il permesso non dipende da come la richiesta e scritta.**

    Il controllo di ruolo viveva dentro `ensureOrganizationAccess`, ma questa
    funzione la chiamava **solo** sul ramo in cui il chiamante nominava un
    club. Il percorso ordinario del client non lo nomina — manda solo
    l'intestazione del club attivo — e prendeva quindi il ramo sotto, dove non
    c'era nessun controllo: la porta era chiusa a chi bussava e aperta a chi
    entrava dal lato.

    Ora il club si **risolve** prima, e si giudica sempre lo stesso: quello su
    cui si sta per lavorare.
  */
  const risolto = wanted || asText(scope.activeOrganizationId);
  if (!risolto) throw new Error("Nessun club attivo selezionato");
  ensureOrganizationAccess(scope, risolto);
  return risolto;
};

const toDateOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = asText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const programClient = () => (prisma as any).fundingProgram;
const enrollmentClient = () => (prisma as any).fundingEnrollment;
const accrualClient = () => (prisma as any).fundingAccrual;
const settlementClient = () => (prisma as any).fundingSettlement;
const settlementLineClient = () => (prisma as any).fundingSettlementLine;

/* ------------------------------------------------------------- programmi */

export const listFundingPrograms = async (
  filter: { organizationId?: string | null; status?: string | null },
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const status = asText(filter.status);

  return programClient().findMany({
    where: {
      organization_id: organizationId,
      ...(status ? { status } : {}),
    },
    orderBy: [{ valid_from: "desc" }],
  });
};

export const getFundingProgramById = async (
  programId: string,
  scope?: FundingScope,
) => {
  const row = await programClient().findUnique({
    where: { id: asText(programId) },
  });

  if (!row) throw new Error("Programma non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

const buildProgramData = (input: Record<string, any>) => {
  const normalized = normalizeFundingProgram(input);

  return {
    name: normalized.name,
    funder_name: normalized.funderName,
    status: normalized.status,
    valid_from: new Date(normalized.validFrom as string),
    valid_to: new Date(normalized.validTo as string),
    athlete_plafond: normalized.athletePlafond,
    accrual_source: normalized.accrualSource,
    period_amount: normalized.periodAmount,
    period_frequency: normalized.periodFrequency,
    period_length_days: normalized.periodLengthDays,
    requirement_unit: normalized.requirementUnit,
    requirement_min: normalized.requirementMin,
    unmet_behavior: normalized.unmetBehavior,
    max_periods: normalized.maxPeriods,
    max_total_amount: normalized.maxTotalAmount,
    notes: normalized.notes,
  };
};

export const createFundingProgram = async (
  input: Record<string, any>,
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  const error = validateFundingProgram(input);
  if (error) throw new Error(error);

  return programClient().create({
    data: {
      ...buildProgramData(input),
      organization_id: organizationId,
      created_by: scope?.userId || null,
      data: {},
    },
  });
};

/**
 * Aggiorna un programma.
 *
 * Non ricalcola i maturati: cambiare una soglia a stagione in corso e una
 * decisione che va vista prima di essere applicata, e il ricalcolo e
 * un'operazione esplicita. Il conteggio dei periodi gia liquidati che
 * cambierebbero viene restituito, cosi l'interfaccia puo dirlo.
 */
export const updateFundingProgram = async (
  programId: string,
  input: Record<string, any>,
  scope?: FundingScope,
) => {
  const existing = await getFundingProgramById(programId, scope);

  /*
    **Lo stato non si cambia da qui** (N6).

    Un cambio di stato e un atto: apre un bando, o lo chiude. Farlo passare per
    la modifica generica vorrebbe dire che una schermata che voleva correggere
    una nota puo chiudere il bando serializzando un campo in piu, e che l'audit
    registra «programma aggiornato» dove e successo qualcosa d'altro.
    `transitionFundingProgram` e la porta, e vaglia la transizione.
  */
  if (
    input.status !== undefined &&
    asText(input.status) !== asText(existing.status)
  ) {
    throw new Error(
      "Lo stato di un programma si cambia dalle sue azioni, non dalla modifica generica",
    );
  }

  /*
    **Le regole si cambiano finche nessuno le sta usando.**

    Da `active` in poi si correggono nome, ente e note — cio che descrive il
    bando — ma non importi, date e soglie, che sono cio da cui si **ricalcola**
    il maturato. Una soglia cambiata sotto a un'iscrizione riscrive importi che
    la segreteria ha gia letto, e forse rendicontato all'ente.
  */
  if (existing.status !== "draft") {
    const descrittivi = new Set<string>(FUNDING_PROGRAM_DESCRIPTIVE_FIELDS);
    const regoleToccate = Object.keys(input).filter(
      (chiave) => !descrittivi.has(chiave) && input[chiave] !== undefined,
    );

    if (regoleToccate.length > 0) {
      throw new Error(
        "Le regole di un programma gia avviato non si cambiano: riportalo in bozza non e possibile, apri un programma nuovo",
      );
    }
  }

  const merged = { ...existing, ...input };
  const error = validateFundingProgram(merged);
  if (error) throw new Error(error);

  return programClient().update({
    where: { id: existing.id },
    data: buildProgramData(merged),
  });
};

/**
 * **Aprire, chiudere, riaprire un programma** (N6).
 *
 * L'unica strada che scrive `funding_programs.status`. Quattro transizioni
 * ammesse (`FUNDING_PROGRAM_TRANSITIONS`), e cio che non e ammesso viene
 * rifiutato invece di essere scritto in silenzio: una transizione che non
 * cambia niente lascerebbe in audit una riga che racconta un atto mai
 * avvenuto.
 *
 * **Chiudere non cancella.** Le iscrizioni restano, i maturati restano, le
 * liquidazioni restano: chiudere dice «non entra piu nessuno e non matura piu
 * niente», non «non e mai successo». Per questo la chiusura non ha guardie sul
 * denaro — non ne tocca — e la riapertura e sempre possibile.
 */
export const transitionFundingProgram = async (
  programId: string,
  input: { status?: unknown; reason?: unknown },
  scope?: FundingScope,
) => {
  const existing = await getFundingProgramById(programId, scope);
  const da = asText(existing.status) || "draft";
  const a = asText(input.status);

  if (!a) {
    throw new Error("Indica lo stato in cui portare il programma");
  }

  if (!canTransitionFundingProgram(da, a)) {
    throw new Error(
      `Un programma «${FUNDING_PROGRAM_STATUS_LABELS[da as FundingProgramStatus] || da}» non puo passare a «${
        FUNDING_PROGRAM_STATUS_LABELS[a as FundingProgramStatus] || a
      }»`,
    );
  }

  const aggiornato = await programClient().update({
    where: { id: existing.id },
    data: { status: a },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.fundingProgramTransitioned,
    resource: "funding_programs",
    resourceId: existing.id,
    organizationId: existing.organization_id,
    actorUserId: scope?.userId || null,
    metadata: {
      from: da,
      to: a,
      reason: asText(input.reason) || null,
    },
  });

  return aggiornato;
};

/* ------------------------------------------------------------ beneficiari */

export const listFundingEnrollments = async (
  filter: {
    organizationId?: string | null;
    programId?: string | null;
    athleteId?: string | null;
  },
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const programId = asText(filter.programId);
  const athleteId = asText(filter.athleteId);

  return enrollmentClient().findMany({
    where: {
      organization_id: organizationId,
      ...(programId ? { program_id: programId } : {}),
      ...(athleteId ? { athlete_id: athleteId } : {}),
    },
    orderBy: [{ enrolled_at: "asc" }],
  });
};

export const getFundingEnrollmentById = async (
  enrollmentId: string,
  scope?: FundingScope,
) => {
  const row = await enrollmentClient().findUnique({
    where: { id: asText(enrollmentId) },
  });

  if (!row) throw new Error("Beneficiario non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/**
 * Ammette un atleta a un programma.
 *
 * `assignedAmount` e **l'importo utilizzabile presso questo club**, e non il
 * massimale del bando: il programma riconosce fino a 500 EUR a Mario, ma
 * Mario puo decidere di spenderne 300 qui e il resto in un'altra societa.
 * EasyGame conosce solo i 300 e non deve assumere che gli altri 200 siano
 * disponibili — sono il limite entro cui l'iscrizione puo maturare.
 *
 * Il massimale serve a **validare** l'assegnato, non a sostituirlo: senza
 * indicazione esplicita l'assegnato coincide con il massimale, che e il caso
 * piu comune (ADR-0054).
 */
export const createFundingEnrollment = async (
  input: {
    programId: unknown;
    athleteId: unknown;
    assignedAmount?: unknown;
    voucherCode?: unknown;
    enrolledAt?: unknown;
    endsAt?: unknown;
    notes?: unknown;
  },
  scope?: FundingScope,
) => {
  const program = await getFundingProgramById(asText(input.programId), scope);
  const athleteId = asText(input.athleteId);

  if (!athleteId) {
    throw new Error("Indica l'atleta beneficiario");
  }

  /*
    **Il beneficiario deve essere del club del programma.**

    L'identificativo dell'atleta arrivava dal corpo della richiesta e non
    veniva confrontato con niente: il programma si risolve nello scope, la
    riga nasce con l'organizzazione del programma, e sembrava chiuso. Non lo
    era — quello che entra nel confine non e la riga, e **l'atleta**.

    Il calcolo del maturato legge le presenze e gli allenamenti del
    beneficiario (`loadAttendanceInputs`): un atleta di un altro club
    iscritto qui avrebbe fatto entrare la sua frequenza in un rendiconto che
    non lo riguarda, e la frequenza di un minore dice dove si trova due volte
    a settimana.

    Ed e un dato che poi **esce**: la rendicontazione all'ente porta nome e
    ore del beneficiario.
  */
  const beneficiario = await (prisma as any).athlete.findUnique({
    where: { id: athleteId },
    select: { organization_id: true },
  });

  if (
    !beneficiario ||
    asText(beneficiario.organization_id) !== asText(program.organization_id)
  ) {
    /*
      «Non trovato» e non «negato»: confermare che quell'identificativo
      esiste in un altro club e gia un'informazione, ed e la stessa scelta
      presa su ogni altra lettura per identificativo.
    */
    throw new Error("Atleta non trovato");
  }

  /*
    **Solo un programma attivo ammette beneficiari** (N6).

    Qui il rifiuto era sul solo `closed`, quindi si iscriveva su una **bozza**:
    e ogni programma nasce bozza e nessuna schermata sapeva cambiarlo, quindi
    di fatto tutte le iscrizioni del pilota vivono su bandi in bozza. Uno stato
    che non impedisce niente e un'etichetta, e la scheda scriveva «BOZZA»
    accanto a un bando che stava gia maturando denaro pubblico.

    Le regole di un bando decidono quanto matura ogni periodo: cambiarle sotto
    a un'iscrizione gia attiva riscrive in silenzio importi che qualcuno ha gia
    letto. La bozza serve esattamente a questo, ed e utile solo se chiude la
    porta.
  */
  if (!fundingProgramAcceptsEnrollments(program.status)) {
    throw new Error(
      program.status === "closed"
        ? "Il programma e chiuso: non ammette nuovi beneficiari"
        : "Il programma e in bozza: attivalo prima di iscrivere atleti",
    );
  }

  const assignedAmount =
    input.assignedAmount === undefined || input.assignedAmount === null
      ? toFundingAmount(program.athlete_plafond)
      : toFundingAmount(input.assignedAmount);

  if (!(assignedAmount > 0)) {
    throw new Error("Il plafond assegnato deve essere maggiore di zero");
  }

  const assignedError = validateAssignedAmount({ program, assignedAmount });
  if (assignedError) throw new Error(assignedError);

  const existing = await enrollmentClient().findFirst({
    where: { program_id: program.id, athlete_id: athleteId },
  });

  if (existing) {
    throw new Error("L'atleta e gia beneficiario di questo programma");
  }

  return enrollmentClient().create({
    data: {
      organization_id: program.organization_id,
      program_id: program.id,
      athlete_id: athleteId,
      voucher_code: asText(input.voucherCode) || null,
      assigned_amount: assignedAmount,
      status: "active",
      enrolled_at: toDateOrNull(input.enrolledAt) || new Date(program.valid_from),
      ends_at: toDateOrNull(input.endsAt),
      notes: asText(input.notes) || null,
      created_by: scope?.userId || null,
      data: {},
    },
  });
};

/* ----------------------------------------------------- maturato: calcolo */

/**
 * Le presenze e gli allenamenti che servono a misurare la frequenza.
 *
 * Gli allenamenti vivono in `club_resource_items` con
 * `resource_type = "trainings"`: il payload porta data e orari, e da li si
 * ricavano le ore. Si leggono qui, in un punto solo, invece di essere passati
 * dal chiamante — un contributo calcolato su dati scelti da chi chiama non e
 * verificabile.
 *
 * **Gli allenamenti di un'altra squadra non contano** (ADR-0055). Mario si
 * allena con `Pulcini · Scauri`: l'esistenza di un allenamento di
 * `Pulcini · Santi Cosma` non deve produrgli ne ore ne previsione, nemmeno se
 * un appello sbagliato lo aveva segnato presente. Un allenamento che non
 * dichiara nessun gruppo resta dentro: e un dato precedente ai gruppi, ed
 * escluderlo cancellerebbe frequenza vera da stagioni gia rendicontate.
 *
 * **Esportata perche la frequenza si misura in un posto solo.** Dal W1-G la
 * consuma anche il risolutore dei segnaposto: l'attestazione di frequenza
 * risponde alla stessa domanda del rendiconto di un bando — «quante ore ha
 * fatto questo atleta in questo periodo» — e una seconda lettura delle
 * presenze significherebbe un club che attesta un numero e ne rendiconta un
 * altro.
 */
export const loadAttendanceInputs = async (
  organizationId: string,
  athleteId: string,
) => {
  /*
    **La fonte della presenza e la riga, non la copia JSON** (ADR-0098).

    Prima si leggevano `training_attendance` e `club_resource_items`: la prima
    era la tabella, la seconda la copia che il salvataggio scriveva accanto. Da
    quando l'evento e una riga, l'allenamento e la presenza vengono dalla stessa
    fonte e non possono piu dire due cose diverse.
  */
  const [attendanceRows, eventRows, club, memberships] = await Promise.all([
    (prisma as any).clubEventParticipant.findMany({
      where: { organization_id: organizationId, athlete_id: athleteId },
    }),
    (prisma as any).clubEvent.findMany({
      where: { organization_id: organizationId, kind: "training" },
    }),
    (prisma as any).club.findUnique({
      where: { id: organizationId },
      select: { club_sites: true },
    }),
    (prisma as any).athleteCategoryMembership.findMany({
      where: { organization_id: organizationId, athlete_id: athleteId },
    }),
  ]);

  const allTrainings = (Array.isArray(eventRows) ? eventRows : []).map(
    (row: any) => toEventLegacyShape(row),
  );

  /*
    La misura incrocia presenza e allenamento per identificativo: si usa quello
    **storico** finche la proiezione esiste, perche e quello che
    `toEventLegacyShape` mette in `id`.
  */
  const legacyIdPerEvento = new Map(
    (Array.isArray(eventRows) ? eventRows : []).map((row: any) => [
      asText(row.id),
      asText(row.legacy_id || row.id),
    ]),
  );
  const attendance = (Array.isArray(attendanceRows) ? attendanceRows : []).map(
    (row: any) => ({
      ...row,
      training_id:
        legacyIdPerEvento.get(asText(row.event_id)) ||
        asText(row.legacy_training_id || row.event_id),
    }),
  );

  const siteIndex = buildSiteIndex(normalizeClubSites(club?.club_sites));
  const athleteGroupIds = getAthleteGroupIds(
    Array.isArray(memberships) ? memberships : [],
    siteIndex,
  );

  const trainings = filterTrainingsForAthleteGroups({
    trainings: allTrainings,
    athleteGroupIds,
  });

  return { attendance, trainings };
};

export type RecomputeResult = {
  enrollment: Record<string, any>;
  accruals: Record<string, any>[];
  skippedSettledPeriods: number;
  /**
   * Quanti periodi il ricalcolo ha lasciato dov'erano perche una persona ne
   * aveva deciso lo stato (N12).
   *
   * Esce nella risposta perche **va detto**: un ricalcolo che tace su cio che
   * non ha toccato e un ricalcolo di cui la segreteria si fida a torto.
   */
  skippedManualPeriods: number;
};

/**
 * Ricalcola il maturato di un beneficiario, periodo per periodo.
 *
 * L'importo assegnato si consuma in ordine cronologico, quindi il calcolo e
 * una passata sola sui periodi ordinati: il residuo che entra in un periodo
 * dipende da quanto hanno consumato i precedenti.
 *
 * I periodi gia liquidati **non** vengono riscritti — l'ente ha versato su un
 * numero — ma il loro maturato consuma comunque l'assegnato, altrimenti i
 * periodi successivi ne troverebbero piu di quanto ce n'e.
 *
 * **Con una fonte esterna il ricalcolo non fa maturare niente** (ADR-0054).
 * Aggiorna la previsione — quanto il periodo varrebbe secondo l'appello di
 * EasyGame — e lascia il maturato a zero finche non arriva una conferma. Una
 * conferma gia registrata non viene mai riscritta da un ricalcolo: e un dato
 * dichiarato da una fonte, non un risultato derivato dalle presenze.
 */
export const recomputeEnrollmentAccruals = async (
  enrollmentId: string,
  scope?: FundingScope,
  options: { until?: Date | string | null } = {},
): Promise<RecomputeResult> => {
  const enrollment = await getFundingEnrollmentById(enrollmentId, scope);
  const program = await getFundingProgramById(enrollment.program_id, scope);

  /*
    **Matura solo un programma attivo** (N6).

    Su una bozza non c'e niente da maturare — nessuno puo esservi iscritto — e
    su un bando chiuso maturare vorrebbe dire far crescere un credito verso un
    ente che ha smesso di riconoscerlo.

    E una guardia sulla **scrittura**, non una cancellazione: cio che era gia
    maturato resta dov'e, e la scheda continua a mostrarlo. Chiudere un bando
    non riscrive la storia.
  */
  if (!fundingProgramAccruesNow(program.status)) {
    throw new Error(
      program.status === "closed"
        ? "Il programma e chiuso: il maturato non si ricalcola piu"
        : "Il programma e in bozza: attivalo prima di calcolare il maturato",
    );
  }

  /*
    Un'iscrizione revocata o sospesa non matura. Il commento di
    `removeFundingEnrollment` lo dichiarava gia — «smette di maturare» — e
    nessuna riga lo faceva valere: il ricalcolo la trattava come le altre.
  */
  if (asText(enrollment.status) !== "active") {
    throw new Error(
      "Questa iscrizione non e attiva: il maturato non si ricalcola",
    );
  }

  const periods: FundingPeriod[] = generateFundingPeriods(program, {
    until: options.until ?? new Date(),
  });

  const { attendance, trainings } = await loadAttendanceInputs(
    enrollment.organization_id,
    enrollment.athlete_id,
  );

  const normalizedProgram = normalizeFundingProgram(program);
  const measures = measureAttendanceByPeriod({
    periods,
    trainings,
    attendance,
    requirementUnit: normalizedProgram.requirementUnit,
  });

  const existingRows = await accrualClient().findMany({
    where: { enrollment_id: enrollment.id },
  });
  const existingByIndex = new Map<number, any>(
    (Array.isArray(existingRows) ? existingRows : []).map((row: any) => [
      Number(row.period_index),
      row,
    ]),
  );

  /*
    **Quanto l'ente ha gia versato, periodo per periodo** (revisione ostile, F2).

    Lo stato non basta: una liquidazione **parziale** lascia il periodo in
    `reported`, e la guardia che si fermava al solo `settled` lo lasciava
    riscrivere. Riportarlo a zero dopo un bonifico da 200 significa dichiarare
    incassati 200 euro su un maturato di niente.
  */
  const liquidatoPerPeriodo = new Map<string, number>();
  if (existingRows.length) {
    const righeLiquidazione = await settlementLineClient().findMany({
      where: {
        accrual_id: { in: existingRows.map((row: any) => String(row.id)) },
      },
    });
    for (const riga of Array.isArray(righeLiquidazione) ? righeLiquidazione : []) {
      const chiave = String((riga as any).accrual_id);
      liquidatoPerPeriodo.set(
        chiave,
        Number(
          (
            (liquidatoPerPeriodo.get(chiave) || 0) +
            toFundingAmount((riga as any).amount)
          ).toFixed(2),
        ),
      );
    }
  }

  const now = new Date();
  const external = requiresExternalConfirmation(program);

  /*
    **Il maturato dei periodi che questa passata non tocca consuma comunque
    l'assegnato** (revisione ostile, F1).

    `generateFundingPeriods` qui si ferma a **oggi**: i mesi futuri non entrano
    nell'elenco. La decisione manuale, invece, li genera **tutti** — e il suo
    scopo: si decide anche di un mese che deve ancora cominciare (N12). Una riga
    su un periodo futuro sedeva percio in archivio senza essere mai visitata da
    questo ciclo, e il residuo ripartiva dall'importo pieno.
    Tre mensilita decise in avanti su un voucher da 300, poi un ricalcolo, e il
    maturato arrivava a 400: un credito verso un ente che ne ha assegnati 300,
    e il riepilogo gestionale lo leggeva come tale.

    Si toglie percio, **prima** del ciclo, tutto cio che e maturato fuori dalla
    finestra. Vale anche per un periodo gia liquidato che cadesse oltre oggi:
    la stessa falla, per una strada che nessuno percorreva.
  */
  const indiciNellaFinestra = new Set(periods.map((period) => period.index));
  const maturatoFuoriFinestra = (
    Array.isArray(existingRows) ? existingRows : []
  ).reduce(
    (totale: number, row: any) =>
      indiciNellaFinestra.has(Number(row.period_index))
        ? totale
        : totale + toFundingAmount(row.accrued_amount),
    0,
  );

  let remainingPlafond = Math.max(
    0,
    Number(
      (
        toFundingAmount(enrollment.assigned_amount) - maturatoFuoriFinestra
      ).toFixed(2),
    ),
  );
  let skippedSettledPeriods = 0;
  let skippedManualPeriods = 0;
  const written: Record<string, any>[] = [];

  for (const period of periods) {
    const existing = existingByIndex.get(period.index);

    /*
      **Una decisione presa da una persona non si riscrive da sola** (N12).

      E la proprieta che rende la maturazione manuale qualcosa di piu di un
      pulsante: senza, «Segna come maturato» durerebbe fino al ricalcolo
      successivo, che nel flusso reale arriva un minuto dopo — e la segreteria
      vedrebbe la propria decisione sparire senza che nessuno le abbia detto
      perche.

      Vale in **tutte e due** le direzioni: un periodo dichiarato non maturato
      resta non maturato anche se le presenze dicono il contrario. Chi vuole
      restituirlo al calcolo ha un gesto suo, `decision: "auto"`, ed e un atto
      esplicito e tracciato come gli altri due.

      Il maturato deciso a mano **consuma comunque l'assegnato**: saltarlo
      lascerebbe ai periodi successivi un residuo che non esiste, che e lo
      stesso motivo per cui si tratta cosi un periodo gia liquidato.
    */
    if (existing && accrualIsManuallyDecided(existing)) {
      remainingPlafond = Math.max(
        0,
        Number(
          (remainingPlafond - toFundingAmount(existing.accrued_amount)).toFixed(
            2,
          ),
        ),
      );
      skippedManualPeriods += 1;
      written.push(existing);
      continue;
    }

    /*
      **Denaro arrivato, non stato dichiarato** (revisione ostile, F2). La
      condizione era `status === "settled"`, e una liquidazione parziale lascia
      il periodo in `reported`: passava, e il ricalcolo azzerava un maturato su
      cui l'ente aveva gia versato.
    */
    if (
      existing &&
      (existing.status === "settled" ||
        accrualHasSettledMoney(liquidatoPerPeriodo.get(String(existing.id))))
    ) {
      /*
        Gia liquidato: non si riscrive, ma consuma l'assegnato. Saltarlo del
        tutto farebbe trovare ai periodi successivi un residuo che non esiste.
      */
      remainingPlafond = Math.max(
        0,
        Number(
          (remainingPlafond - toFundingAmount(existing.accrued_amount)).toFixed(
            2,
          ),
        ),
      );
      skippedSettledPeriods += 1;
      written.push(existing);
      continue;
    }

    const measure = measures[period.index];

    /*
      Una conferma esterna gia registrata e un dato, non un derivato: il
      ricalcolo aggiorna la previsione attorno a essa e ne lascia l'importo
      dov'e. Riscriverla dalle presenze significherebbe che il numero
      dichiarato all'ente cambia da solo quando qualcuno corregge un appello.
    */
    const existingConfirmation =
      external && existing?.confirmed_at
        ? {
            amount: toFundingAmount(existing.accrued_amount),
            origin: (asText(existing.accrual_origin) ||
              "manual_confirmation") as FundingAccrualOrigin,
          }
        : null;

    const result = calculatePeriodAccrual({
      program,
      measuredValue: measure?.value ?? 0,
      remainingPlafond,
      confirmedAmount: existingConfirmation ? existingConfirmation.amount : null,
      confirmationOrigin: existingConfirmation?.origin,
    });

    remainingPlafond = Math.max(
      0,
      Number((remainingPlafond - result.accruedAmount).toFixed(2)),
    );

    /*
      Un periodo gia rendicontato resta rendicontato se l'importo non cambia;
      se cambia torna a «maturato», perche cio che era stato dichiarato
      all'ente non corrisponde piu.
    */
    const amountChanged =
      existing &&
      toFundingAmount(existing.accrued_amount) !== result.accruedAmount;
    const status =
      existing?.status === "reported" && !amountChanged
        ? "reported"
        : result.status;

    const data = {
      organization_id: enrollment.organization_id,
      enrollment_id: enrollment.id,
      period_index: period.index,
      period_start: new Date(period.start),
      period_end: new Date(period.end),
      period_label: period.label,
      requirement_min: result.requirementMin,
      requirement_unit: result.requirementUnit,
      measured_value: result.measuredValue,
      requirement_met: result.requirementMet,
      eligible_amount: result.eligibleAmount,
      estimated_amount: result.estimatedAmount,
      accrued_amount: result.accruedAmount,
      unaccrued_amount: result.unaccruedAmount,
      status,
      accrual_origin: result.origin,
      confirmed_at: existingConfirmation ? existing?.confirmed_at ?? null : null,
      confirmed_by: existingConfirmation ? existing?.confirmed_by ?? null : null,
      external_reference: existingConfirmation
        ? existing?.external_reference ?? null
        : null,
      confirmation_notes: existingConfirmation
        ? existing?.confirmation_notes ?? null
        : null,
      reported_at: status === "reported" ? existing?.reported_at ?? null : null,
      reported_by: status === "reported" ? existing?.reported_by ?? null : null,
      computed_at: now,
      data: {
        reason: result.reason,
        sessions: measure?.sessions ?? 0,
        hours: measure?.hours ?? 0,
        sessionsWithoutDuration: measure?.sessionsWithoutDuration ?? 0,
        /*
          **La riga dichiara di portare una misura vera** (N10).

          `measured_value` in archivio e un `Float` con default zero, e non c'e
          modo di scriverci «non lo so». Il ricalcolo e l'unico che misura
          davvero, quindi e lui a dirlo; una riga nata da una decisione manuale
          su un periodo mai calcolato dira il contrario, e la schermata potra
          finalmente distinguere «zero ore» da «nessuno ha ancora guardato».
        */
        [FUNDING_ACCRUAL_MEASURED_FLAG]: true,
        /*
          Un ricalcolo che tocca la riga la restituisce al calcolo automatico:
          la decisione manuale, se c'era, e stata ritirata da `decision: "auto"`
          — l'unico percorso che porta qui una riga marcata.
        */
        [FUNDING_ACCRUAL_MANUAL_FLAG]: false,
        /*
          **Ma la traccia di chi aveva deciso resta** (revisione ostile, F9).

          Il ricalcolo ricostruisce `data` da zero, e con essa se ne andava
          l'elenco delle decisioni: il primo ricalcolo dopo un «torna al
          calcolo» cancellava la spiegazione di come quel periodo era arrivato
          dov'era. La riga di `audit_events` sopravvive, ma chi guarda un
          periodo non apre il registro delle operazioni — e il commento della
          tabella dice proprio che la traccia va letta dove sta il fatto.
        */
        ...(Array.isArray(asRecord(existing?.data).manualDecisions) &&
        asRecord(existing?.data).manualDecisions.length > 0
          ? { manualDecisions: asRecord(existing?.data).manualDecisions }
          : {}),
      },
    };

    const row = existing
      ? await accrualClient().update({ where: { id: existing.id }, data })
      : await accrualClient().create({ data });

    written.push(row);
  }

  return {
    enrollment,
    accruals: written,
    skippedSettledPeriods,
    skippedManualPeriods,
  };
};

/* ------------------------------------------ maturato: la decisione manuale */

export type PeriodDecisionInput = {
  enrollmentId: unknown;
  periodIndex: unknown;
  decision: unknown;
  /** Solo per `accrued`: quanto far maturare. Omesso vale l'intero periodo. */
  amount?: unknown;
  notes?: unknown;
  /**
   * Lo stato che chi preme **credeva** di vedere.
   *
   * Quando c'e, la scrittura fallisce se nel frattempo qualcun altro l'ha
   * cambiato. Non e un dettaglio di implementazione: e cio che impedisce a due
   * segretarie sulla stessa scheda di sovrascriversi in silenzio, e la sola
   * risposta onesta e dire alla seconda che il periodo e cambiato sotto le
   * mani.
   */
  expectedStatus?: unknown;
  /**
   * **Chi e da dove** (revisione ostile, F3).
   *
   * L'audit lo scrive questa funzione e non la rotta, perche solo qui si sa se
   * qualcosa e davvero cambiato — un doppio clic non e due decisioni. Ma senza
   * la richiesta la riga esce con indirizzo, dispositivo e posta a `null`: la
   * sola azione che permette a una persona di riscrivere per decreto un numero
   * diretto a un ente sarebbe anche l'unica non riconducibile a un dispositivo.
   * Sono percio dati che la rotta passa in giu, come fa `accounting-export.ts`.
   */
  request?: Request | null;
  actorEmail?: string | null;
};

export type PeriodDecisionResult = {
  enrollment: Record<string, any>;
  program: Record<string, any>;
  accrual: Record<string, any>;
  decision: FundingPeriodDecision;
  /** Vero quando il periodo era gia cosi: nessuna riga di storia in piu. */
  unchanged: boolean;
};

/**
 * **Lo stato di un periodo, deciso da una persona** (N12).
 *
 * ---
 *
 * ## Perche esiste
 *
 * Perche la frequenza registrata in EasyGame **non e l'autorita** su cio che un
 * ente riconosce, e lo era diventata di fatto. Su un bando a fonte
 * `easygame_attendance` l'unico modo di far maturare un mese era registrare
 * abbastanza presenze; su un bando a fonte esterna esisteva `confirmAccrualPeriods`,
 * che pero **rifiuta** i programmi EasyGame per costruzione. Un club che sapeva
 * — da una comunicazione dell'ente, da una deroga, da un errore d'appello ormai
 * chiuso — che un mese valeva, non aveva nessuna riga da premere.
 *
 * Questa funzione e quella riga. La frequenza resta il dato che **sostiene** la
 * decisione, e continua a comparire accanto: non e piu la decisione.
 *
 * ## Le sei proprieta
 *
 * 1. **Non nasce cassa.** Nessun `payment_transaction`, nessuna riga di prima
 *    nota, nessuna copertura, nessun tocco a `payments.status`. Un maturato e
 *    un credito verso un ente, e lo diventa qui esattamente come lo diventava
 *    dal ricalcolo (ADR-0037, ADR-0158).
 * 2. **Non liquida.** `settled_amount` nasce dalle righe di liquidazione, e
 *    quelle le scrive `createFundingSettlement`. Da qui non si arriva.
 * 3. **Materializza il periodo previsto.** Un periodo che non ha ancora una
 *    riga si puo decidere lo stesso: la riga nasce ora, dichiarando di non
 *    portare una misura (N10), invece di costringere a un ricalcolo che sui
 *    mesi futuri non produrrebbe niente.
 * 4. **E idempotente.** Ripetere la stessa decisione sullo stesso periodo non
 *    scrive una seconda volta e non allunga lo storico: il doppio clic e un
 *    gesto solo.
 * 5. **Il concorrente perde, e lo sa.** `expectedStatus` e verificato **dentro**
 *    la transazione, dopo il blocco della riga: due operatori sullo stesso
 *    periodo non si sovrascrivono in silenzio.
 * 6. **Un periodo liquidato non si tocca.** L'ente ha versato su quel numero.
 *
 * ## Il tetto
 *
 * Il maturato complessivo dell'adesione non supera **l'importo assegnato al
 * club**, che e lo stesso limite che `confirmAccrualPeriods` fa valere e per la
 * stessa ragione: il massimale del bando e un'altra cosa, e piu alto.
 */
export const decideAccrualPeriod = async (
  input: PeriodDecisionInput,
  scope?: FundingScope,
): Promise<PeriodDecisionResult> => {
  const enrollment = await getFundingEnrollmentById(
    asText(input.enrollmentId),
    scope,
  );
  const program = await getFundingProgramById(enrollment.program_id, scope);

  /*
    **La porta e la stessa delle altre scritture del dominio**, e sta qui e non
    solo sulla rotta: `confirmAccrualPeriods` insegna che una scrittura di
    dominio raggiungibile da piu di una rotta deve portarsi dietro la propria
    guardia. Un ruolo personalizzato costruito su gestore la passa se ha
    `funding.manage`, che e cio che N12 chiedeva.
  */
  assertFundingPermission(scope?.activeRole, "funding.manage");

  const decision = asText(input.decision).toLowerCase() as FundingPeriodDecision;
  if (!(FUNDING_PERIOD_DECISIONS as readonly string[]).includes(decision)) {
    throw new Error(
      "Decisione non riconosciuta: un periodo si segna maturato, non maturato, oppure si restituisce al calcolo",
    );
  }

  if (asText(enrollment.status) !== "active") {
    throw new Error(
      "Questa iscrizione non e attiva: lo stato dei suoi periodi non si cambia",
    );
  }

  /*
    **Su un bando chiuso o in bozza non si decide niente** (N6). E la stessa
    guardia del ricalcolo, e vale per la stessa ragione: far maturare un periodo
    su un bando che ha smesso di riconoscerlo e un credito che nessuno paghera.
  */
  if (!fundingProgramAccruesNow(program.status)) {
    throw new Error(
      program.status === "closed"
        ? "Il programma e chiuso: lo stato dei suoi periodi non si cambia piu"
        : "Il programma e in bozza: attivalo prima di decidere un periodo",
    );
  }

  const periodIndex = Number(input.periodIndex);
  if (!Number.isInteger(periodIndex) || periodIndex < 0) {
    throw new Error("Periodo non indicato");
  }

  /*
    Il periodo si **deriva** dalla configurazione (ADR-0037 §4), e si deriva
    senza `until`: si decide anche di un mese che non e ancora cominciato, che
    e il caso per cui N12 esiste.
  */
  const period = generateFundingPeriods(program).find(
    (voce) => voce.index === periodIndex,
  );

  const normalized = normalizeFundingProgram(program);
  const now = new Date();
  const notes = asText(input.notes) || null;

  const risultato = await (prisma as any).$transaction(async (client: any) => {
    /*
      **Il blocco prima della lettura.** Il tetto sull'assegnato e una **somma**
      su tutte le righe dell'adesione, e una somma letta fuori dalla
      transazione e una somma vecchia: due decisioni simultanee su due periodi
      diversi la troverebbero tutte e due capiente. Si blocca l'adesione — la
      riga che porta il tetto — come fa `allocateCoverage`, e nello stesso
      ordine, perche due ordini diversi sugli stessi blocchi sono un abbraccio
      mortale (ADR-0138).
    */
    await client.$queryRaw`SELECT id FROM funding_enrollments WHERE id = ${enrollment.id}::uuid FOR UPDATE`;

    const righe = await client.fundingAccrual.findMany({
      where: { enrollment_id: enrollment.id },
      orderBy: [{ period_index: "asc" }],
    });
    const esistenti: any[] = Array.isArray(righe) ? righe : [];
    const existing =
      esistenti.find((riga) => Number(riga.period_index) === periodIndex) ||
      null;

    if (!existing && !period) {
      throw new Error(
        "Il periodo non appartiene a questo programma: controlla le date di validita",
      );
    }

    /*
      **Denaro arrivato, non stato dichiarato** (revisione ostile, F2): una
      liquidazione parziale lascia il periodo in `reported`, e la guardia sul
      solo `settled` lasciava riscrivere un maturato gia in parte incassato.
    */
    const liquidatoQui = esistenti
      .filter((riga) => Number(riga.period_index) === periodIndex)
      .length
      ? (
          await client.fundingSettlementLine.findMany({
            where: { accrual_id: existing?.id ?? "" },
          })
        ).reduce(
          (totale: number, riga: any) => totale + toFundingAmount(riga.amount),
          0,
        )
      : 0;

    if (
      existing &&
      (asText(existing.status) === "settled" ||
        accrualHasSettledMoney(liquidatoQui))
    ) {
      throw new Error(
        `Il periodo «${existing.period_label}»: ${SETTLED_MONEY_REFUSAL}`,
      );
    }

    /*
      **Lo stato atteso, verificato dentro il blocco** (scenario 12). Fuori di
      qui sarebbe una lettura vecchia, cioe esattamente il difetto che vuole
      impedire.
    */
    const atteso = asText(input.expectedStatus);
    if (atteso) {
      const attuale = existing
        ? asText(existing.status) || "not_accrued"
        : "planned";
      if (atteso !== attuale) {
        throw new Error(
          `Il periodo e cambiato mentre lo stavi guardando: adesso e «${attuale}», non «${atteso}». Ricarica e decidi di nuovo`,
        );
      }
    }

    if (decision === "auto") {
      if (!existing || !accrualIsManuallyDecided(existing)) {
        /*
          Restituire al calcolo un periodo che il calcolo gia governa non e un
          errore: e un gesto che non aveva niente da fare.
        */
        return { row: existing, unchanged: true };
      }

      const aggiornata = await client.fundingAccrual.update({
        where: { id: existing.id },
        data: {
          data: {
            ...asRecord(existing.data),
            [FUNDING_ACCRUAL_MANUAL_FLAG]: false,
            reason:
              "Restituito al calcolo dalle presenze: ricalcola per aggiornarlo",
            manualDecisions: [
              ...(Array.isArray(asRecord(existing.data).manualDecisions)
                ? asRecord(existing.data).manualDecisions
                : []),
              {
                decision: "auto",
                fromStatus: asText(existing.status) || "not_accrued",
                fromAmount: toFundingAmount(existing.accrued_amount),
                decidedAt: now.toISOString(),
                decidedBy: scope?.userId || null,
                notes,
              },
            ],
          },
        },
      });

      return { row: aggiornata, unchanged: false };
    }

    /*
      Il residuo dell'assegnato **esclude questo periodo**: si sta per
      riscriverlo, e contare il suo vecchio importo lo farebbe competere con se
      stesso.
    */
    const altrove = esistenti
      .filter((riga) => Number(riga.period_index) !== periodIndex)
      .reduce(
        (totale, riga) => totale + toFundingAmount(riga.accrued_amount),
        0,
      );

    const remainingPlafond = Number(
      Math.max(
        0,
        toFundingAmount(enrollment.assigned_amount) - altrove,
      ).toFixed(2),
    );

    /*
      **Zero e un valore, non un'assenza** (revisione ostile, F10). `||`
      trattava un `eligible_amount` a zero come «manca» e ricadeva sulla
      mensilita intera: un periodo che vale niente avrebbe fatto maturare un
      mese pieno. Il ripiego vale solo quando il campo non c'e davvero.
    */
    const eligibleCongelato = Number(existing?.eligible_amount);
    const eligibleAmount = Number.isFinite(eligibleCongelato)
      ? toFundingAmount(eligibleCongelato)
      : normalized.periodAmount;

    const esito = calculateManualPeriodDecision({
      decision,
      eligibleAmount,
      remainingPlafond,
      requestedAmount:
        input.amount === undefined || input.amount === null
          ? null
          : toFundingAmount(input.amount),
    });

    if (decision === "accrued" && !(esito.accruedAmount > 0)) {
      throw new Error(
        remainingPlafond > 0
          ? "Un periodo maturato vale piu di zero: per dichiararlo a zero segnalo come non maturato"
          : `L'importo assegnato a questo atleta (${toFundingAmount(enrollment.assigned_amount).toFixed(2)} EUR) e gia tutto maturato: non resta niente da far maturare`,
      );
    }

    /*
      **Idempotenza** (scenario 11). Il doppio clic e un gesto solo: se il
      periodo e gia in quello stato, con quell'importo e per decisione di una
      persona, non si scrive e non si allunga lo storico.
    */
    if (
      existing &&
      accrualIsManuallyDecided(existing) &&
      asText(existing.status) === esito.status &&
      toFundingAmount(existing.accrued_amount) === esito.accruedAmount
    ) {
      return { row: existing, unchanged: true };
    }

    const storia = [
      ...(Array.isArray(asRecord(existing?.data).manualDecisions)
        ? asRecord(existing?.data).manualDecisions
        : []),
      {
        decision,
        fromStatus: existing ? asText(existing.status) || "not_accrued" : "planned",
        fromAmount: existing ? toFundingAmount(existing.accrued_amount) : 0,
        toStatus: esito.status,
        toAmount: esito.accruedAmount,
        decidedAt: now.toISOString(),
        decidedBy: scope?.userId || null,
        notes,
      },
    ];

    const comune = {
      accrued_amount: esito.accruedAmount,
      unaccrued_amount: esito.unaccruedAmount,
      status: esito.status,
      accrual_origin: esito.origin,
      confirmed_at: now,
      confirmed_by: scope?.userId || null,
      confirmation_notes: notes,
      /*
        Una decisione smentisce cio che era stato dichiarato all'ente: il
        periodo va rendicontato di nuovo. E la stessa regola di
        `confirmAccrualPeriods`, e non ce ne sono due.
      */
      reported_at: null,
      reported_by: null,
      computed_at: now,
    };

    if (existing) {
      const aggiornata = await client.fundingAccrual.update({
        where: { id: existing.id },
        data: {
          ...comune,
          data: {
            ...asRecord(existing.data),
            reason: esito.reason,
            [FUNDING_ACCRUAL_MANUAL_FLAG]: true,
            manualDecisions: storia,
          },
        },
      });

      return { row: aggiornata, unchanged: false };
    }

    const creata = await client.fundingAccrual.create({
      data: {
        organization_id: enrollment.organization_id,
        enrollment_id: enrollment.id,
        period_index: period!.index,
        period_start: new Date(period!.start),
        period_end: new Date(period!.end),
        period_label: period!.label,
        requirement_min: normalized.requirementMin,
        requirement_unit: normalized.requirementUnit,
        measured_value: 0,
        requirement_met: false,
        eligible_amount: eligibleAmount,
        estimated_amount: 0,
        ...comune,
        data: {
          reason: esito.reason,
          [FUNDING_ACCRUAL_MANUAL_FLAG]: true,
          /*
            **La riga nasce senza misura, e lo dichiara** (N10). Nessuno ha
            contato le ore di questo periodo: `measured_value` resta lo zero
            del tipo, e questo marcatore impedisce alla schermata di leggerlo
            come «zero ore fatte».
          */
          [FUNDING_ACCRUAL_MEASURED_FLAG]: false,
          manualDecisions: storia,
        },
      },
    });

    return { row: creata, unchanged: false };
  });

  if (!risultato.unchanged) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceUpdated,
      actorUserId: scope?.userId || null,
      actorEmail: input.actorEmail || null,
      actorRole: scope?.activeRole || null,
      organizationId: enrollment.organization_id,
      resource: "funding_accruals",
      resourceId: risultato.row?.id || null,
      request: input.request ?? null,
      metadata: {
        decision,
        periodIndex,
        enrollmentId: asText(enrollment.id),
        athleteId: asText(enrollment.athlete_id),
        fromStatus:
          risultato.row?.data?.manualDecisions?.slice(-1)?.[0]?.fromStatus ??
          null,
        toStatus: asText(risultato.row?.status) || null,
        accruedAmount: toFundingAmount(risultato.row?.accrued_amount),
      },
    });
  }

  return {
    enrollment,
    program,
    accrual: risultato.row,
    decision,
    unchanged: Boolean(risultato.unchanged),
  };
};

/* -------------------------------------------- maturato: conferma esterna */

export type AccrualConfirmationInput = {
  /** Il periodo da confermare, per indice o per id della riga. */
  accrualId?: unknown;
  periodIndex?: unknown;
  /** Quanto la fonte ufficiale ha riconosciuto. */
  amount: unknown;
  confirmedAt?: unknown;
  externalReference?: unknown;
  notes?: unknown;
};

const resolveConfirmationOrigin = (value: unknown): FundingAccrualOrigin => {
  const token = asText(value).toLowerCase();
  return (FUNDING_ACCRUAL_ORIGINS as readonly string[]).includes(token)
    ? (token as FundingAccrualOrigin)
    : "manual_confirmation";
};

/**
 * Registra la **conferma di maturazione** di uno o piu periodi.
 *
 * E l'atto che, su un programma a fonte esterna, trasforma una previsione in
 * un credito. Resta separato dal ricalcolo di proposito: il ricalcolo legge
 * le presenze di EasyGame, la conferma dichiara cio che la piattaforma
 * dell'ente ha riconosciuto, e le due cose possono non coincidere.
 *
 * **Tre limiti non negoziabili** (ADR-0054):
 *
 * 1. non si conferma su un programma la cui fonte e l'appello di EasyGame:
 *    li il maturato si ricalcola, e digitarlo a mano riaprirebbe la porta
 *    all'importo inventato;
 * 2. la somma dei confermati non supera **l'importo assegnato al club**, che
 *    e il tetto vero dell'iscrizione;
 * 3. un periodo gia liquidato non si tocca: l'ente ha versato su quel numero.
 *
 * La conferma resta auditabile — data, utente, riferimento esterno, nota — e
 * una correzione successiva sovrascrive l'importo lasciando la traccia
 * precedente in `data.previousConfirmations`.
 */
export const confirmAccrualPeriods = async (
  input: {
    enrollmentId: unknown;
    confirmations: AccrualConfirmationInput[];
    origin?: unknown;
  },
  scope?: FundingScope,
) => {
  const enrollment = await getFundingEnrollmentById(
    asText(input.enrollmentId),
    scope,
  );
  const program = await getFundingProgramById(enrollment.program_id, scope);

  if (!requiresExternalConfirmation(program)) {
    throw new Error(
      "Questo programma matura dalle presenze EasyGame: il maturato si ricalcola, non si conferma a mano",
    );
  }

  const confirmations = (
    Array.isArray(input.confirmations) ? input.confirmations : []
  ).filter(Boolean);

  if (!confirmations.length) {
    throw new Error("Indica quali periodi stai confermando");
  }

  const origin = resolveConfirmationOrigin(input.origin);
  const rows = await accrualClient().findMany({
    where: { enrollment_id: enrollment.id },
    orderBy: [{ period_index: "asc" }],
  });
  const existingRows: any[] = Array.isArray(rows) ? rows : [];

  const byId = new Map(existingRows.map((row) => [String(row.id), row]));
  const byIndex = new Map(
    existingRows.map((row) => [Number(row.period_index), row]),
  );

  /*
    **Quanto l'ente ha gia versato su ognuno** (revisione ostile, F2). La
    guardia qui sotto si fermava al solo `settled`, e una liquidazione parziale
    lascia il periodo in `reported`: una conferma da 100 su un periodo gia
    incassato per 200 lo avrebbe portato sotto cio che il club ha ricevuto.
  */
  const liquidatoPerPeriodo = new Map<string, number>();
  if (existingRows.length) {
    const righeLiquidazione = await settlementLineClient().findMany({
      where: { accrual_id: { in: existingRows.map((row) => String(row.id)) } },
    });
    for (const riga of Array.isArray(righeLiquidazione) ? righeLiquidazione : []) {
      const chiave = String((riga as any).accrual_id);
      liquidatoPerPeriodo.set(
        chiave,
        Number(
          (
            (liquidatoPerPeriodo.get(chiave) || 0) +
            toFundingAmount((riga as any).amount)
          ).toFixed(2),
        ),
      );
    }
  }

  const targets = confirmations.map((confirmation) => {
    const row = asText(confirmation.accrualId)
      ? byId.get(asText(confirmation.accrualId))
      : byIndex.get(Number(confirmation.periodIndex));

    if (!row) {
      throw new Error(
        "Un periodo indicato non esiste: ricalcola prima di confermare",
      );
    }

    ensureOrganizationAccess(scope, row.organization_id);

    if (
      asText(row.status) === "settled" ||
      accrualHasSettledMoney(liquidatoPerPeriodo.get(String(row.id)))
    ) {
      throw new Error(
        `Il periodo «${row.period_label}»: ${SETTLED_MONEY_REFUSAL}`,
      );
    }

    const amount = toFundingAmount(confirmation.amount);
    if (amount < 0) {
      throw new Error("Un importo confermato non puo essere negativo");
    }

    return { row, amount, confirmation };
  });

  /*
    Il tetto si verifica sul **totale** dopo la conferma, non sulla singola
    riga: confermare due periodi da 200 su un assegnato di 300 e sbagliato
    anche se ognuno dei due, da solo, ci starebbe.
  */
  const confirmedIds = new Set(targets.map((target) => String(target.row.id)));
  const untouchedAccrued = existingRows
    .filter((row) => !confirmedIds.has(String(row.id)))
    .reduce((total, row) => total + toFundingAmount(row.accrued_amount), 0);
  const confirmedTotal = targets.reduce(
    (total, target) => total + target.amount,
    0,
  );
  const assigned = toFundingAmount(enrollment.assigned_amount);

  if (
    Math.round((untouchedAccrued + confirmedTotal) * 100) >
    Math.round(assigned * 100)
  ) {
    throw new Error(
      `La conferma porterebbe il maturato a ${(untouchedAccrued + confirmedTotal).toFixed(2)} EUR, oltre l'importo assegnato al club (${assigned.toFixed(2)} EUR)`,
    );
  }

  const now = new Date();
  const written: Record<string, any>[] = [];

  for (const { row, amount, confirmation } of targets) {
    const previous = Array.isArray(asRecord(row.data).previousConfirmations)
      ? asRecord(row.data).previousConfirmations
      : [];

    /*
      Una correzione non cancella lo storico: l'importo precedente resta
      leggibile con la sua data e il suo autore, perche una rendicontazione
      gia inviata all'ente si spiega con quel numero.
    */
    const history = row.confirmed_at
      ? [
          ...previous,
          {
            amount: toFundingAmount(row.accrued_amount),
            confirmedAt: row.confirmed_at,
            confirmedBy: row.confirmed_by,
            externalReference: row.external_reference,
            notes: row.confirmation_notes,
            origin: row.accrual_origin,
          },
        ]
      : previous;

    const updated = await accrualClient().update({
      where: { id: row.id },
      data: {
        accrued_amount: amount,
        unaccrued_amount: Number(
          Math.max(0, toFundingAmount(row.eligible_amount) - amount).toFixed(2),
        ),
        status: amount > 0 ? "accrued" : "not_accrued",
        accrual_origin: amount > 0 ? origin : null,
        confirmed_at: toDateOrNull(confirmation.confirmedAt) || now,
        confirmed_by: scope?.userId || null,
        external_reference: asText(confirmation.externalReference) || null,
        confirmation_notes: asText(confirmation.notes) || null,
        /*
          Una conferma smentisce cio che era stato dichiarato all'ente: il
          periodo torna «maturato» e va rendicontato di nuovo.
        */
        reported_at: null,
        reported_by: null,
        computed_at: now,
        data: {
          ...asRecord(row.data),
          reason:
            amount > 0
              ? "Confermato dalla fonte ufficiale"
              : "La fonte ufficiale non ha riconosciuto niente per questo periodo",
          previousConfirmations: history,
          /*
            **La parola dell'ente supera quella della societa** (revisione
            ostile, F8).

            Il marcatore della decisione manuale sopravviveva alla conferma: il
            periodo continuava a portare l'etichetta «deciso dalla societa» e a
            essere saltato da ogni ricalcolo, per sempre, su un importo che
            l'ente aveva nel frattempo dichiarato lui. La provenienza mostrata
            all'operatore era falsa, e il congelamento non lo aveva deciso
            nessuno.
          */
          [FUNDING_ACCRUAL_MANUAL_FLAG]: false,
        },
      },
    });

    written.push(updated);
  }

  return { enrollment, program, accruals: written };
};

export type ConfirmationImportOutcome = {
  enrollment: Record<string, any>;
  accruals: Record<string, any>[];
  /** Righe illeggibili o che non corrispondono a nessun periodo. */
  rejected: Array<{ line: number; content: string; reason: string }>;
};

/**
 * Importa un blocco di conferme da una fonte esterna.
 *
 * E la stessa scrittura di `confirmAccrualPeriods`, con la stessa provenienza
 * dichiarata (`external_import`) e gli stessi tre limiti: nessun import puo
 * fare quello che una conferma a mano non potrebbe.
 *
 * **Nessuna riga sparisce in silenzio.** Cio che il parser non legge e cio che
 * non trova il suo periodo torna indietro elencato: un import che scarta senza
 * dirlo e peggio di un import che fallisce, perche il totale sembra giusto.
 */
export const importAccrualConfirmations = async (
  input: { enrollmentId: unknown; text: unknown; reference?: unknown },
  scope?: FundingScope,
): Promise<ConfirmationImportOutcome> => {
  const enrollment = await getFundingEnrollmentById(
    asText(input.enrollmentId),
    scope,
  );
  const program = await getFundingProgramById(enrollment.program_id, scope);

  if (!requiresExternalConfirmation(program)) {
    throw new Error(
      "Questo programma matura dalle presenze EasyGame: non si importano conferme",
    );
  }

  const parsed = parseConfirmationImport(input.text);
  const periods = generateFundingPeriods(program);
  const { matched, unmatched } = matchConfirmationsToPeriods({
    rows: parsed.rows,
    periods,
  });

  const rejected = [
    ...parsed.rejected,
    ...unmatched.map((row) => ({
      line: row.line,
      content: row.period,
      reason: "Nessun periodo del programma corrisponde",
    })),
  ];

  if (!matched.length) {
    throw new Error(
      rejected.length
        ? `Nessuna riga importabile: ${rejected[0].reason} (riga ${rejected[0].line})`
        : "Il file non contiene nessuna conferma",
    );
  }

  const result = await confirmAccrualPeriods(
    {
      enrollmentId: enrollment.id,
      origin: "external_import",
      confirmations: matched.map((row) => ({
        periodIndex: row.periodIndex,
        amount: row.amount,
        externalReference: row.externalReference || asText(input.reference),
        notes: row.notes,
      })),
    },
    scope,
  );

  return { enrollment: result.enrollment, accruals: result.accruals, rejected };
};

export const listFundingAccruals = async (
  filter: { organizationId?: string | null; enrollmentId?: string | null },
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const enrollmentId = asText(filter.enrollmentId);

  return accrualClient().findMany({
    where: {
      organization_id: organizationId,
      ...(enrollmentId ? { enrollment_id: enrollmentId } : {}),
    },
    orderBy: [{ period_index: "asc" }],
  });
};

/**
 * La riconciliazione di un bando: tutte le righe, per tutti gli atleti.
 *
 * **Perche esiste.** Il primo bando vero non si puo dichiarare affidabile
 * perche i test sono verdi: i test provano che il calcolo faccia quello che
 * la configurazione dice, non che la configurazione dica quello che il bando
 * prevede. Le due cose divergono per un giorno di calendario, per una soglia
 * letta come «almeno» invece che «piu di», per un periodo che l'ente conta dal
 * lunedi e il club dal primo del mese. Chi rendiconta deve poter mettere
 * accanto, riga per riga, cio che EasyGame ha calcolato e cio che l'ente si
 * aspetta.
 *
 * Lettura sola: non ricalcola niente. Il ricalcolo resta un'azione esplicita
 * della segreteria, perche legge tutte le presenze del club.
 */
export const buildProgramReconciliation = async (
  programId: string,
  scope?: FundingScope,
): Promise<FundingReconciliation & { program: Record<string, any> }> => {
  const program = await getFundingProgramById(programId, scope);

  const enrollments = await listFundingEnrollments(
    { organizationId: program.organization_id, programId: program.id },
    scope,
  );

  const enrollmentIds = enrollments.map((enrollment: any) => enrollment.id);

  const accruals = enrollmentIds.length
    ? await accrualClient().findMany({
        where: {
          organization_id: program.organization_id,
          enrollment_id: { in: enrollmentIds },
        },
        orderBy: [{ period_index: "asc" }],
      })
    : [];

  /*
    I nomi si leggono in una volta sola. Una riga di riconciliazione senza il
    nome dell'atleta e inutilizzabile da chi rendiconta, e leggerli uno per
    uno costerebbe una query per periodo.
  */
  const athleteIds = Array.from(
    new Set(enrollments.map((enrollment: any) => String(enrollment.athlete_id))),
  );

  const athletes = athleteIds.length
    ? await (prisma as any).athlete.findMany({
        where: {
          organization_id: program.organization_id,
          id: { in: athleteIds },
        },
        select: { id: true, first_name: true, last_name: true },
      })
    : [];

  const athleteNames: Record<string, string> = {};
  for (const athlete of athletes) {
    athleteNames[athlete.id] =
      `${athlete.last_name || ""} ${athlete.first_name || ""}`.trim();
  }

  return {
    program,
    ...buildFundingReconciliation({ enrollments, accruals, athleteNames }),
  };
};
/**
 * Marca come rendicontati i periodi maturati indicati.
 *
 * «Rendicontato» e una dichiarazione all'ente, non un incasso: sta in mezzo
 * fra maturato e liquidato proprio perche i due momenti sono distinti e
 * possono distare mesi.
 */
export const markAccrualsReported = async (
  accrualIds: string[],
  scope?: FundingScope,
) => {
  const ids = (Array.isArray(accrualIds) ? accrualIds : [])
    .map(asText)
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error("Indica quali periodi stai rendicontando");
  }

  const rows = await accrualClient().findMany({ where: { id: { in: ids } } });

  for (const row of rows) {
    ensureOrganizationAccess(scope, row.organization_id);

    /*
      Una previsione non si rendiconta. Dichiarare all'ente un importo che la
      sua piattaforma non ha ancora riconosciuto e il difetto che la conferma
      esplicita esiste per impedire (ADR-0054).
    */
    if (asText(row.status) === "pending_confirmation") {
      throw new Error(
        `Il periodo «${row.period_label}» e ancora una previsione: conferma la maturazione prima di rendicontarlo`,
      );
    }

    if (toFundingAmount(row.accrued_amount) <= 0) {
      throw new Error(
        `Il periodo «${row.period_label}» non ha maturato niente: non si rendiconta`,
      );
    }
  }

  if (rows.length !== ids.length) {
    throw new Error("Uno dei periodi indicati non esiste");
  }

  const now = new Date();
  await accrualClient().updateMany({
    where: { id: { in: ids } },
    data: {
      status: "reported",
      reported_at: now,
      reported_by: scope?.userId || null,
    },
  });

  return accrualClient().findMany({ where: { id: { in: ids } } });
};

/* ---------------------------------------------------------- liquidazioni */

export const listFundingSettlements = async (
  filter: { organizationId?: string | null; programId?: string | null },
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const programId = asText(filter.programId);

  return settlementClient().findMany({
    where: {
      organization_id: organizationId,
      ...(programId ? { program_id: programId } : {}),
    },
    orderBy: [{ settled_at: "desc" }],
    include: { lines: true },
  });
};

/**
 * Registra una liquidazione dell'ente e la riconcilia con i periodi maturati.
 *
 * **Perche le righe sono obbligatorie.** Un ente liquida in blocco: un
 * bonifico solo per venti atleti e tre mesi. Senza la ripartizione,
 * «liquidato» sarebbe un totale che non si puo attribuire a nessuno, e la
 * domanda che una segreteria fa davvero — «per questo atleta, quanto e
 * arrivato?» — resterebbe senza risposta.
 *
 * **Perche non nasce un incasso della famiglia.** Il contributo non e un
 * pagamento dell'atleta: confonderli farebbe risultare saldate rate che
 * nessuno ha pagato. Le due contabilita restano separate (ADR-0037).
 */
export const createFundingSettlement = async (
  input: {
    programId: unknown;
    amount: unknown;
    settledAt?: unknown;
    reference?: unknown;
    method?: unknown;
    notes?: unknown;
    /**
     * **Su quale conto e arrivato il bonifico dell'ente.**
     *
     * Senza, la liquidazione era invisibile nel saldo: il credito verso l'ente
     * si chiudeva e il denaro non compariva da nessuna parte. Facoltativo,
     * perche le liquidazioni gia registrate non ce l'hanno.
     */
    financialAccountId?: unknown;
    /**
     * **La voce di rendiconto** (W4-R7).
     *
     * Facoltativa: se tace, il dominio ripiega su `liquidazione_contributo`,
     * che e cio che una liquidazione e sempre. Serve a un club che tenga voci
     * distinte per bando o per ente.
     */
    operationTypeCode?: unknown;
    /**
     * **Una chiave per gesto** (N15).
     *
     * Il doppio clic su «Registra liquidazione» non deve produrre due bonifici.
     * La lettura qui dentro la transazione serve a rispondere «fatto» invece
     * che con un errore; la difesa vera e l'indice unico parziale, perche due
     * richieste davvero simultanee leggono tutte e due «libera».
     */
    idempotencyKey?: unknown;
    lines?: Array<{ accrualId: unknown; amount: unknown }>;
  },
  scope?: FundingScope,
) => {
  const program = await getFundingProgramById(asText(input.programId), scope);

  const lines = (Array.isArray(input.lines) ? input.lines : []).map((line) => ({
    accrualId: asText(line.accrualId),
    amount: toFundingAmount(line.amount),
  }));

  const accrualIds = lines.map((line) => line.accrualId).filter(Boolean);
  /*
    Il maturato **non porta il bando**: lo porta la sua iscrizione. Cercare
    un `program_id` sulla riga darebbe sempre indefinito e rifiuterebbe ogni
    liquidazione — un rifiuto che nessuna prova di diniego noterebbe, perche
    negare e cio che si attende.

    Si risolve con una **seconda interrogazione** e non con un `include`:
    una relazione montata dall'ORM e cio che il doppio di questo archivio
    nei test unitari non sa fare, e una guardia che dipende da una capacita
    dell'ORM diventa un rifiuto totale la` dove quella capacita manca.
  */
  const accrualRows = accrualIds.length
    ? await accrualClient().findMany({ where: { id: { in: accrualIds } } })
    : [];

  const enrollmentIds = Array.from(
    new Set(accrualRows.map((row: any) => asText(row.enrollment_id))),
  ).filter(Boolean);

  const programByEnrollment = new Map<string, string>();
  const athleteByEnrollment = new Map<string, string>();
  if (enrollmentIds.length) {
    const iscrizioni = await enrollmentClient().findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, program_id: true, athlete_id: true },
    });
    for (const riga of iscrizioni) {
      programByEnrollment.set(asText(riga.id), asText(riga.program_id));
      athleteByEnrollment.set(asText(riga.id), asText(riga.athlete_id));
    }
  }

  for (const row of accrualRows) {
    ensureOrganizationAccess(scope, row.organization_id);

    /*
      **Un maturato appartiene al suo bando.**

      Il club era verificato, il bando no: le righe di una liquidazione
      potevano venire da un **altro programma dello stesso club**. Il credito
      verso un ente si chiudeva consumando il maturato di un ente diverso, e i
      due rendiconti — quello che si manda e quello che si tiene — dicevano
      numeri che non tornano.

      Non e una fuga: e un dato che esce verso un ente pubblico con dentro ore
      che quell ente non ha finanziato.
    */
    if (
      programByEnrollment.get(asText(row.enrollment_id)) !==
      asText(program.id)
    ) {
      throw new Error(
        "Una riga della liquidazione non appartiene a questo programma",
      );
    }
  }

  /**
   * **La capienza si misura dentro la transazione, con i periodi bloccati.**
   *
   * Questa verifica girava **prima** di `$transaction`, e niente bloccava i
   * periodi: sei richieste simultanee da 10.000 euro contro un maturato di
   * 10.000 leggevano tutte «capiente» e **quattro passavano**. Quarantamila
   * euro liquidati su diecimila maturati: trentamila inventati, che il
   * registro mostra e che nessuno ha mai ricevuto.
   *
   * Sequenzialmente il controllo era gia corretto — la seconda richiesta viene
   * rifiutata con «restano 0.00 EUR su quel periodo». Era solo la lettura
   * fuori dalla transazione, la stessa forma che
   * `lockInstallmentAndTransaction` chiude sugli incassi delle famiglie.
   */
  const misuraCapienza = async (client: any) => {
    if (accrualIds.length) {
      /*
        `FOR UPDATE` mette in fila chi liquida lo stesso periodo. L'ordine e
        quello degli identificativi, cosi due richieste che toccano gli stessi
        periodi in ordine diverso non si bloccano a vicenda.
      */
      const ordinati = [...accrualIds].sort();
      for (const id of ordinati) {
        await client.$queryRaw`SELECT id FROM funding_accruals WHERE id = ${id}::uuid FOR UPDATE`;
      }
    }

    const settledByAccrual = new Map<string, number>();
    if (accrualIds.length) {
      const existingLines = await client.fundingSettlementLine.findMany({
        where: { accrual_id: { in: accrualIds } },
      });
      for (const line of Array.isArray(existingLines) ? existingLines : []) {
        settledByAccrual.set(
          line.accrual_id,
          Number(
            (
              (settledByAccrual.get(line.accrual_id) || 0) +
              toFundingAmount(line.amount)
            ).toFixed(2),
          ),
        );
      }
    }

    const accrualsById = new Map<
      string,
      { accruedAmount: number; settledAmount: number }
    >(
      accrualRows.map((row: any) => [
        String(row.id),
        {
          accruedAmount: toFundingAmount(row.accrued_amount),
          settledAmount: settledByAccrual.get(row.id) || 0,
        },
      ]),
    );

    const error = validateSettlementAllocation({
      amount: input.amount,
      lines,
      accrualsById,
    });
    if (error) throw new Error(error);

    return accrualsById;
  };

  const settledAt = toDateOrNull(input.settledAt) || new Date();

  /*
    Il conto appartiene al club che scrive: un conto di un altro club produceva
    denaro che il registro mostra e che **nessun saldo contiene**. Vedi
    `financial-account-guard.ts`.
  */
  const contoVerificato = await assertContoDelClub(
    program.organization_id,
    input.financialAccountId,
  );

  /*
    **Il beneficiario e la descrizione si compongono qui, una volta sola**
    (N15).

    Un ente liquida in blocco — un bonifico per venti atleti — e in quel caso
    non c'e **un** beneficiario: il campo resta nullo, e un campo che tace e
    meglio di un campo che sceglie il primo dell'elenco. Quando invece la
    liquidazione riguarda un periodo solo, l'estratto conto deve poter dire di
    chi e quel bonifico senza percorrere tre join.

    La descrizione la scrive il dominio e la **congela** sulla riga: la vista
    SQL e il suo gemello TypeScript la leggono e basta, quindi non esistono due
    regole di composizione che possano divergere.
  */
  const atletiCoinvolti = Array.from(
    new Set(
      accrualRows
        .map((row: any) => athleteByEnrollment.get(asText(row.enrollment_id)))
        .filter(Boolean) as string[],
    ),
  );

  const beneficiario = atletiCoinvolti.length === 1 ? atletiCoinvolti[0] : null;

  const anagraficaBeneficiario = beneficiario
    ? await (prisma as any).athlete.findUnique({
        where: { id: beneficiario },
        select: { first_name: true, last_name: true },
      })
    : null;

  const periodiCoinvolti = Array.from(
    new Set(
      accrualRows
        .map((row: any) => asText(row.period_label))
        .filter(Boolean) as string[],
    ),
  );

  const descrizione = beneficiario
    ? describeSettlementLine({
        programName: program.name,
        athleteName: [
          asText(anagraficaBeneficiario?.first_name),
          asText(anagraficaBeneficiario?.last_name),
        ]
          .filter(Boolean)
          .join(" "),
        periodLabels: periodiCoinvolti,
      })
    : null;

  return (prisma as any).$transaction(async (client: any) => {
    /*
      **Lo stesso invio, due volte, lascia una liquidazione sola.**

      Si guarda **dentro** la transazione e si restituisce cio che c'e gia:
      chi ha premuto due volte deve leggere «fatto», non un errore su
      un'operazione che e riuscita. Se due richieste passano di qui insieme, la
      seconda sbatte sull'indice unico e il rifiuto e dell'archivio, che e il
      solo posto in cui non c'e una finestra.
    */
    const chiave = normalizeIdempotencyKey(input.idempotencyKey);
    if (chiave) {
      const gia = await client.fundingSettlement.findFirst({
        where: {
          organization_id: program.organization_id,
          idempotency_key: chiave,
        },
        include: { lines: true },
      });

      /*
        **Una riga gia stornata non e una replica riuscita** (revisione ostile,
        F3): restituirla direbbe «fatto» su un accredito che nel frattempo e
        stato annullato, e il denaro nuovo non verrebbe mai scritto.
      */
      if (gia?.reversed_at) {
        throw new Error(
          "Questa chiave appartiene a una liquidazione gia stornata: se e un accredito nuovo, riprova",
        );
      }

      if (gia) {
        /*
          **Una chiave che torna deve descrivere lo stesso fatto** (revisione
          ostile, 6b–6c).

          Restituire la riga trovata e giusto quando la richiesta e davvero la
          stessa — e il doppio clic. Farlo **sempre** significa che una chiave
          riusata con un corpo diverso riceve `201` e la riga di qualcun altro:
          l'accredito vero non viene mai scritto, il credito resta aperto, e la
          schermata dice «fatto». Nessun errore, da nessuna parte.
          E, di rimbalzo, una lettura di importi e riferimenti bancari di un
          periodo che non e quello richiesto.

          Se la chiave e la stessa e il fatto no, si rifiuta: e un conflitto,
          non un duplicato.
        */
        const stessoImporto =
          toFundingAmount(gia.amount) === toFundingAmount(input.amount);

        /*
          Le righe si rileggono con una **interrogazione esplicita** e non da
          `include`: una relazione montata dall'ORM e cio che il doppio di
          questo archivio nei test non sa fare, e una guardia che dipende da una
          capacita dell'ORM diventa un rifiuto totale la dove quella capacita
          manca. E la stessa lezione gia scritta poche righe piu su.
        */
        const righeEsistenti = await client.fundingSettlementLine.findMany({
          where: { settlement_id: gia.id },
        });
        const righeGia = (
          Array.isArray(righeEsistenti) ? righeEsistenti : []
        )
          .map((riga: any) => `${asText(riga.accrual_id)}:${toFundingAmount(riga.amount)}`)
          .sort();
        const righeOra = lines
          .map((riga) => `${riga.accrualId}:${riga.amount}`)
          .sort();

        if (
          asText(gia.program_id) === asText(program.id) &&
          stessoImporto &&
          righeGia.length === righeOra.length &&
          righeGia.every((voce: string, indice: number) => voce === righeOra[indice])
        ) {
          return { ...gia, __replayed: true };
        }

        throw new Error(
          "Questa chiave e gia stata usata per una liquidazione diversa: se e un accredito nuovo, riprova",
        );
      }
    }

    const accrualsById = await misuraCapienza(client);

    /*
      W4-R7. La liquidazione di un bando usciva dal registro senza causale, e
      con i compensi faceva 7.000 euro su 7.210 del non classificato. Il
      ripiego e `liquidazione_contributo`, perche di questo si tratta sempre:
      qui, a differenza del lavoro sportivo, non c e un sottotipo da cui
      dedurre altro.

      **E una classificazione in ENTRATA, e prima chiedeva quella in uscita.**
      Questa riga registra il bonifico con cui l ente liquida al club i voucher
      maturati: il denaro arriva, e lo dicono lo schema (`financial_account_id`
      e «su quale conto e arrivato il bonifico»), la proiezione del registro e
      la vista SQL, che sul verso leggono entrambe il segno dell importo. Il
      giro alla famiglia e un secondo fatto, che non si registra qui.

      Passando dalla guardia in uscita la causale corretta veniva **rifiutata**
      con un 400, e l unica ammessa era quella che sommava un incasso dentro un
      capitolo di spesa.

      Lo **storno** ha segno opposto — quindi verso `OUT` — ma non ripassa di
      qui: eredita la fotografia della riga che annulla. Il verso da dichiarare
      e percio quello del fatto, non quello della singola riga.
    */
    const classificazione = await resolveInboundClassification({
      organizationId: program.organization_id,
      code: (input as { operationTypeCode?: unknown }).operationTypeCode,
      fallbackCode: "liquidazione_contributo",
    });

    const settlement = await client.fundingSettlement.create({
      data: {
        organization_id: program.organization_id,
        program_id: program.id,
        ...classificazione,
        reference: asText(input.reference) || null,
        settled_at: settledAt,
        amount: toFundingAmount(input.amount),
        method: asText(input.method) || null,
        notes: asText(input.notes) || null,
        financial_account_id: contoVerificato,
        idempotency_key: normalizeIdempotencyKey(input.idempotencyKey) || null,
        beneficiary_athlete_id: beneficiario,
        description_snapshot: descrizione,
        created_by: scope?.userId || null,
      },
    });

    for (const line of lines) {
      await client.fundingSettlementLine.create({
        data: {
          organization_id: program.organization_id,
          settlement_id: settlement.id,
          accrual_id: line.accrualId,
          amount: line.amount,
        },
      });
    }

    /*
      Un periodo diventa «liquidato» solo quando **tutto** il suo maturato e
      stato coperto: con una liquidazione parziale resta rendicontato, e il
      residuo continua a comparire fra i crediti verso l'ente.
    */
    for (const line of lines) {
      const accrual = accrualsById.get(line.accrualId);
      if (!accrual) continue;

      const coveredTotal = Number(
        (accrual.settledAmount + line.amount).toFixed(2),
      );

      if (coveredTotal >= accrual.accruedAmount) {
        await client.fundingAccrual.update({
          where: { id: line.accrualId },
          data: { status: "settled" },
        });
      } else {
        await client.fundingAccrual.update({
          where: { id: line.accrualId },
          data: { status: "reported" },
        });
      }
    }

    return client.fundingSettlement.findUnique({
      where: { id: settlement.id },
      include: { lines: true },
    });
  });
};

/**
 * **Registra la liquidazione di un singolo periodo** (N15).
 *
 * ---
 *
 * ## Perche esiste, visto che `createFundingSettlement` c'era gia
 *
 * Perche `createFundingSettlement` chiede un **programma** e una ripartizione:
 * e la forma giusta per il bonifico che un ente manda in blocco — venti atleti
 * e tre mesi in una volta — e non e la forma di cio che una segreteria fa nel
 * caso normale, che e «l'ente mi ha accreditato i 100 euro di ottobre di
 * Mario». Comporre quella richiesta a mano richiede di sapere che esiste un
 * `accrual_id`, e infatti nessuna schermata l'ha mai fatto: le due rotte delle
 * liquidazioni erano **morte** — scritte, provate e senza un solo chiamante.
 *
 * Questa funzione non e un secondo dominio: **compone l'ingresso e delega**.
 * Lo scrittore resta uno, la transazione resta una, i due tetti restano quelli
 * di `validateSettlementAllocation`.
 *
 * ## Cosa aggiunge
 *
 * Risolve il periodo fino al suo bando — un maturato non porta il programma,
 * lo porta la sua iscrizione — e vaglia **prima** che il periodo sia davvero
 * liquidabile, con la stessa funzione che la schermata usa per accendere il
 * pulsante (`describeSettlementEligibility`). Il rifiuto arriva percio con la
 * frase giusta invece che con «la ripartizione non corrisponde».
 */
export const settleFundingPeriod = async (
  input: {
    accrualId: unknown;
    amount?: unknown;
    settledAt?: unknown;
    financialAccountId: unknown;
    reference?: unknown;
    method?: unknown;
    notes?: unknown;
    operationTypeCode?: unknown;
    idempotencyKey?: unknown;
  },
  scope?: FundingScope,
) => {
  /*
    **La porta sta anche qui, non solo sulla rotta.** Una scrittura di dominio
    raggiungibile da piu di un chiamante si porta dietro la propria guardia: e
    la lezione di `confirmAccrualPeriods`, e vale a maggior ragione per un atto
    che fa entrare denaro su un conto del club.
  */
  assertFundingSettlementPermission(scope?.activeRole, "record");

  const accrualId = asText(input.accrualId);
  if (!accrualId) throw new Error("Periodo non indicato");

  const accrual = await accrualClient().findUnique({ where: { id: accrualId } });
  if (!accrual) throw new Error("Periodo non trovato");
  ensureOrganizationAccess(scope, accrual.organization_id);

  const enrollment = await enrollmentClient().findUnique({
    where: { id: accrual.enrollment_id },
  });
  if (!enrollment) throw new Error("Adesione al bando non trovata");
  ensureOrganizationAccess(scope, enrollment.organization_id);

  /*
    **Il liquidato di un periodo si legge dalle righe, non dallo stato.**
    Con liquidazioni parziali i due numeri differiscono, e quello autorevole e
    il primo (ADR-0054).
  */
  const righe = await settlementLineClient().findMany({
    where: { accrual_id: accrualId },
  });
  const giaLiquidato = (Array.isArray(righe) ? righe : []).reduce(
    (totale: number, riga: any) => totale + toFundingAmount(riga.amount),
    0,
  );

  /*
    **L'idempotenza viene prima del vaglio** (revisione ostile, F4).

    Il vaglio girava per primo, e nel caso piu comune — accredito dell'intero
    residuo, risposta persa per un timeout, secondo clic con la **stessa**
    chiave — trovava il periodo ormai coperto e rispondeva «e gia liquidato per
    intero». Un errore per un'operazione **riuscita**, che e esattamente cio che
    una chiave di idempotenza esiste per non far succedere: chi lo legge crede
    che il bonifico non sia stato registrato e lo reinserisce dall'altra strada.

    Si guarda percio prima se quel gesto ha gia scritto qualcosa. La verifica
    che la chiave descriva **lo stesso fatto** resta dentro la transazione, dove
    e al riparo da una lettura vecchia.
  */
  const chiaveGesto = normalizeIdempotencyKey(input.idempotencyKey);
  if (chiaveGesto) {
    const gia = await settlementClient().findFirst({
      where: {
        organization_id: enrollment.organization_id,
        idempotency_key: chiaveGesto,
      },
    });

    if (gia && !gia.reversed_at) {
      /* Interrogazione esplicita, non `include`: vedi la nota qui sotto. */
      const righe = await settlementLineClient().findMany({
        where: { settlement_id: gia.id },
      });
      const elenco = Array.isArray(righe) ? righe : [];

      /*
        **Replica solo se e davvero lo stesso gesto.** Una chiave riusata con un
        importo diverso non e un doppio clic: e un accredito nuovo, e va scritto.
        Quando l'importo non viene indicato — «prendi il residuo», che e il caso
        del secondo clic dopo un timeout — non c'e niente da confrontare, e la
        replica e proprio cio che serve.
      */
      const importoChiesto =
        input.amount === undefined ||
        input.amount === null ||
        asText(input.amount) === ""
          ? null
          : toFundingAmount(input.amount);

      if (
        elenco.length === 1 &&
        asText(elenco[0].accrual_id) === accrualId &&
        (importoChiesto === null ||
          importoChiesto === toFundingAmount(gia.amount))
      ) {
        return { ...gia, lines: elenco, __replayed: true };
      }
    }
  }

  const vaglio = describeSettlementEligibility({
    ...accrual,
    settled_amount: giaLiquidato,
  });
  if (vaglio.kind === "blocked") {
    throw new Error(vaglio.reason);
  }

  /*
    **Senza conto il denaro non entra da nessuna parte.** Lo schema lo tollera
    per le righe registrate prima che il conto esistesse; questo percorso no,
    perche il movimento bancario e cio per cui esiste. Una liquidazione senza
    conto chiuderebbe il credito e lascerebbe il saldo dov'era.
  */
  if (!asText(input.financialAccountId)) {
    throw new Error(
      "Indica su quale conto e arrivato il bonifico: senza, la liquidazione chiude il credito e il denaro non compare in nessun saldo",
    );
  }

  const importo =
    input.amount === undefined || input.amount === null || asText(input.amount) === ""
      ? vaglio.pendingAmount
      : toFundingAmount(input.amount);

  return createFundingSettlement(
    {
      programId: enrollment.program_id,
      amount: importo,
      settledAt: input.settledAt,
      reference: input.reference,
      method: input.method,
      notes: input.notes,
      financialAccountId: input.financialAccountId,
      operationTypeCode: input.operationTypeCode,
      idempotencyKey: input.idempotencyKey,
      lines: [{ accrualId, amount: importo }],
    },
    scope,
  );
};

/**
 * **Storna una liquidazione registrata per errore.**
 *
 * **Il difetto che chiude.** Il dominio dei bandi non aveva alcun rimedio: non
 * un `update`, non un `delete`, non una rotta. Una liquidazione sbagliata
 * restava — e l'errore non restava fermo, **propagava**: l'accrual passava a
 * `settled`, e da li non si riscriveva piu, non si confermava piu, e
 * l'iscrizione non si cancellava piu. Un bonifico digitato con uno zero di
 * troppo bloccava un periodo per sempre.
 *
 * **La forma e quella che gli altri tre domini usano gia**, e non e stata
 * inventata qui: una riga opposta che cita l'originale, l'originale che resta e
 * porta il motivo, e un indice unico parziale che vieta il doppio storno. Il
 * denaro non si cancella, in nessuno dei cinque domini.
 *
 * **Cosa succede ai periodi.** Le righe di ripartizione dello storno rimettono
 * indietro esattamente cio che avevano coperto, e ogni accrual toccato torna
 * allo stato che gli compete: `reported` se resta scoperto, `settled` se
 * un'altra liquidazione lo copre ancora. Lo stato **si ricalcola**, non si
 * indovina — e la stessa disciplina di `recomputeChargeFromLedger`.
 */
export const reverseFundingSettlement = async (
  input: { settlementId: unknown; reason?: unknown },
  scope?: FundingScope,
) => {
  const settlementId = asText(input.settlementId);
  if (!settlementId) {
    throw new Error("Liquidazione non trovata");
  }

  const original = await settlementClient().findUnique({ where: { id: settlementId } });
  if (!original) {
    throw new Error("Liquidazione non trovata");
  }
  ensureOrganizationAccess(scope, original.organization_id);

  /*
    **La porta sta anche qui** (N15). Stava solo sulla rotta, e la sua gemella
    `settleFundingPeriod` se la porta dietro: una scrittura di dominio
    raggiungibile da piu di un chiamante non puo dipendere da chi la chiama per
    essere autorizzata. Stornare il bonifico di un ente e stornare un movimento,
    e chiede `accounting.reverse` — che sta nel perimetro amministrativo e non
    in quello della segreteria.
  */
  assertFundingSettlementPermission(scope?.activeRole, "reverse");

  if (original.reversal_of_id) {
    throw new Error("Uno storno non si storna");
  }
  if (original.reversed_at) {
    throw new Error("Questa liquidazione e gia stata stornata");
  }

  const reason = asText(input.reason);
  if (!reason) {
    throw new Error("Uno storno deve dire perche: senza motivo la riga non spiega niente");
  }

  const now = new Date();
  /*
    Le righe si leggono a parte e non con un `include`: la ripartizione e cio
    che lo storno deve rimettere indietro, e leggerla dalla relazione di un
    record gia caricato la rende dipendente da **come** l'originale e stato
    letto. Una lettura esplicita dice cosa serve.
  */
  const lines = await settlementLineClient().findMany({
    where: { settlement_id: original.id },
  });

  const risultato = await (prisma as any).$transaction(async (client: any) => {
    /*
      Marcare **prima** l'originale, e nella stessa transazione: se due richieste
      arrivano insieme, la seconda trova `reversed_at` gia scritto e si ferma
      sull'indice unico parziale invece di produrre due storni.
    */
    await client.fundingSettlement.update({
      where: { id: original.id },
      data: {
        reversed_at: now,
        reversed_by: scope?.userId || null,
        reversal_reason: reason,
      },
    });

    const reversal = await client.fundingSettlement.create({
      data: {
        organization_id: original.organization_id,
        program_id: original.program_id,
        reference: original.reference,
        settled_at: now,
        amount: -toFundingAmount(original.amount),
        method: original.method,
        notes: reason,
        /*
          Lo storno eredita **lo scatto** della causale, non lo ricalcola: se
          la causale e stata rinominata fra la liquidazione e lo storno, le
          due righe devono continuare a dire la stessa cosa, altrimenti la
          voce di rendiconto non torna a zero.
        */
        operation_type_code: original.operation_type_code,
        operation_type_label_snapshot: original.operation_type_label_snapshot,
        activity_scope_snapshot: original.activity_scope_snapshot,
        /* Il denaro torna indietro dal conto su cui era entrato. */
        financial_account_id: original.financial_account_id || null,
        /*
          N15. Lo storno porta lo **stesso** beneficiario e lo stesso nome
          dell'originale, con il prefisso che dice cosa e: due righe che nel
          registro si elidono devono essere riconoscibili come una coppia, e
          una che tace il beneficiario mentre l'altra lo nomina costringe chi
          riconcilia a cercarne il gemello per data e importo.
        */
        beneficiary_athlete_id: original.beneficiary_athlete_id || null,
        description_snapshot:
          describeSettlementReversalLine(original.description_snapshot) || null,
        reversal_of_id: original.id,
        created_by: scope?.userId || null,
      },
    });

    for (const line of lines) {
      await client.fundingSettlementLine.create({
        data: {
          organization_id: original.organization_id,
          settlement_id: reversal.id,
          accrual_id: line.accrual_id,
          amount: -toFundingAmount(line.amount),
        },
      });
    }

    /*
      Lo stato di ogni periodo toccato si **ricalcola** dalla somma di tutte le
      righe che lo riguardano, storno compreso. Rimetterlo a `reported` per
      decreto sarebbe sbagliato quando un'altra liquidazione lo copre ancora.
    */
    for (const accrualId of new Set(lines.map((line: any) => String(line.accrual_id)))) {
      const accrual = await client.fundingAccrual.findUnique({ where: { id: accrualId } });
      if (!accrual) continue;

      const tutteLeRighe = await client.fundingSettlementLine.findMany({
        where: { accrual_id: accrualId },
      });
      const coperto = (Array.isArray(tutteLeRighe) ? tutteLeRighe : []).reduce(
        (sum: number, riga: any) => sum + toFundingAmount(riga.amount),
        0,
      );

      await client.fundingAccrual.update({
        where: { id: accrualId },
        data: {
          status:
            Number(coperto.toFixed(2)) >= toFundingAmount(accrual.accrued_amount)
              ? "settled"
              : "reported",
        },
      });
    }

    return client.fundingSettlement.findUnique({
      where: { id: reversal.id },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.fundingSettlementReversed,
    actorUserId: scope?.userId,
    organizationId: original.organization_id,
    resource: "funding_settlements",
    resourceId: original.id,
    metadata: {
      reversalId: risultato?.id || null,
      amount: toFundingAmount(original.amount),
      reason,
      accrualIds: lines.map((line: any) => String(line.accrual_id)),
    },
  });

  return risultato;
};

/* ------------------------------------------------------------- riepilogo */

export type AthleteFundingOverview = {
  enrollment: Record<string, any>;
  program: Record<string, any>;
  accruals: Record<string, any>[];
  /** **Tutti** i periodi del bando, calcolati e non (N8). */
  periods: ReturnType<typeof buildFundingPeriodRows>;
  summary: ReturnType<typeof summarizeFunding>;
  /**
   * **Cosa succede se si toglie questo atleta dal programma** (N13).
   *
   * Sta nella proiezione e non nella schermata perche la schermata deve poterlo
   * **dire prima**, e perche la regola e la stessa che poi applica
   * `removeFundingEnrollment`: due stesure divergerebbero, e chi le scopre e la
   * segreteria davanti a un pulsante che promette una cosa e ne fa un'altra.
   */
  removal: EnrollmentRemovalPlan;
  /**
   * **Se chi sta guardando puo decidere** (revisione ostile, F4).
   *
   * Lo dice il server perche il browser non puo saperlo: il gettone conservato
   * in `localStorage` porta lo **slug** del ruolo e non le sue chiavi — le
   * chiavi le rilegge il server a ogni richiesta (`AuthProvider`). Un predicato
   * lato schermo su quel gettone risponde percio `false` a **ogni** ruolo
   * personalizzato, cioe proprio a quelli che questa lane ha reso capaci di
   * decidere: la casella dell'editor avrebbe governato il server e non lo
   * schermo.
   *
   * Resta un'affordance: l'autorizzazione vera la fa il server, che rifiuta
   * comunque chi non ha la chiave.
   */
  canManage: boolean;
  /**
   * **Se chi sta guardando puo registrare il bonifico di un ente** (N15).
   *
   * Distinto da `canManage` perche la porta e un'altra: registrare una
   * liquidazione e insieme un atto sui contributi e un movimento di cassa, e
   * chiede tutte e due le chiavi. Lo dice il server per la stessa ragione di
   * `canManage`: il gettone conservato nel browser porta lo slug del ruolo e
   * non le sue chiavi, quindi un predicato valutato a schermo risponde `false`
   * a ogni ruolo personalizzato.
   */
  canSettle: boolean;
  /** Se puo **stornare** un bonifico gia registrato: chiede `accounting.reverse`. */
  canReverseSettlement: boolean;
  /**
   * **Se puo scegliere il conto** su cui il bonifico e arrivato, e leggerne gli
   * estremi (`accounting.accounts_read`).
   *
   * E un perimetro suo: la segreteria registra movimenti e **non** vede i conti.
   * Senza questa risposta la finestra offrirebbe un elenco di conti a chi non ha
   * il diritto di sapere che esistono, e il permesso dichiarato dal dominio non
   * governerebbe niente.
   */
  canChooseAccount: boolean;
  /**
   * **Quanto di questo voucher e impegnato su delle rate vive** (revisione
   * ostile, F5).
   *
   * Non e il maturato e non e l'assegnato: e quanto della promessa sta
   * davvero riducendo la quota di una famiglia. Lo calcola il dominio della
   * copertura con la **stessa** regola che i due tetti applicano in scrittura,
   * comprese le rate annullate che non contano piu.
   */
  committedAmount: number;
};

/**
 * I contributi di un atleta, con i cinque importi e il dettaglio dei periodi.
 *
 * E cio che la scheda economica mostra. Il liquidato si legge dalle righe di
 * liquidazione, non dallo stato del periodo: con liquidazioni parziali i due
 * numeri differiscono, e quello autorevole e il primo.
 */
export const getAthleteFundingOverview = async (
  athleteId: string,
  scope?: FundingScope,
  organizationId?: string | null,
): Promise<AthleteFundingOverview[]> => {
  const resolvedOrganizationId = resolveOrganizationId(scope, organizationId);
  const enrollments = await enrollmentClient().findMany({
    where: {
      organization_id: resolvedOrganizationId,
      athlete_id: asText(athleteId),
    },
    orderBy: [{ enrolled_at: "asc" }],
  });

  /*
    Chi vede gli **estremi bancari** di un accredito: e un perimetro suo, e non
    coincide con quello che apre la scheda dei contributi (revisione ostile, 7).
  */
  const vedeGliEstremi = canChooseSettlementAccount(scope?.activeRole);

  const overviews: AthleteFundingOverview[] = [];

  for (const enrollment of Array.isArray(enrollments) ? enrollments : []) {
    const [program, accruals, coperture] = await Promise.all([
      programClient().findUnique({ where: { id: enrollment.program_id } }),
      accrualClient().findMany({
        where: { enrollment_id: enrollment.id },
        orderBy: [{ period_index: "asc" }],
      }),
      /*
        Le coperture servono al **piano di rimozione** (N13): una promessa fatta
        a una famiglia e storico, e la chiave esterna che la lega all'adesione e
        `RESTRICT`. Si leggono i soli campi che decidono, non le righe intere:
        chi le vuole per intero le chiede a `/api/v1/payment-coverage`, che e la
        porta del loro dominio.
      */
      (prisma as any).paymentCoverageAllocation.findMany({
        where: { enrollment_id: enrollment.id },
        select: {
          id: true,
          reversed_at: true,
          reverses_allocation_id: true,
        },
      }),
    ]);

    const accrualIds = (Array.isArray(accruals) ? accruals : []).map(
      (row: any) => row.id,
    );
    const lines = accrualIds.length
      ? await settlementLineClient().findMany({
          where: { accrual_id: { in: accrualIds } },
        })
      : [];

    /*
      Quanto e stato liquidato **su quel periodo**. Il dettaglio periodo per
      periodo deve poter affiancare rendicontato e liquidato, e con
      liquidazioni parziali il secondo non si deduce dallo stato: si legge
      dalle righe (ADR-0054).
    */
    const settledByAccrual = new Map<string, number>();
    for (const line of Array.isArray(lines) ? lines : []) {
      const key = String((line as any).accrual_id);
      settledByAccrual.set(
        key,
        Number(
          (
            (settledByAccrual.get(key) || 0) +
            toFundingAmount((line as any).amount)
          ).toFixed(2),
        ),
      );
    }

    /*
      **Le liquidazioni che toccano questo periodo, con la loro testata** (N15).

      Servono a due cose che la riga di ripartizione da sola non permette:
      mostrare la storia degli accrediti — data, importo, conto, riferimento
      bancario — e offrire lo **storno**, che agisce sulla testata e non sulla
      riga. Senza, un periodo liquidato per errore restava un vicolo cieco:
      nessun pulsante lo poteva correggere, e la scheda mandava la segreteria a
      cercare un controllo che non esisteva da nessuna parte.
    */
    const settlementIds = Array.from(
      new Set(
        (Array.isArray(lines) ? lines : []).map((riga: any) =>
          String(riga.settlement_id),
        ),
      ),
    ).filter(Boolean);

    const teste = settlementIds.length
      ? await settlementClient().findMany({
          where: { id: { in: settlementIds } },
          select: {
            id: true,
            settled_at: true,
            reference: true,
            method: true,
            financial_account_id: true,
            reversed_at: true,
            reversal_of_id: true,
            description_snapshot: true,
            /*
              **L'importo della testata, non della riga** (revisione ostile,
              F1). Lo storno agisce sulla **liquidazione intera**: un ente che
              versa in blocco manda un bonifico solo per venti atleti, e
              stornarlo li riguarda tutti. La schermata mostrava l'importo
              della riga di **questo** periodo e chiedeva conferma per quello,
              poi ne stornava venti volte tanto.
            */
            amount: true,
          },
        })
      : [];

    /*
      **Su quanti periodi e ripartito ogni accredito.** Non si conta dalle righe
      gia lette: quelle riguardano i periodi di **questo** atleta, e un bonifico
      in blocco ne tocca anche di altri — contarle qui darebbe «1 periodo» su un
      accredito che ne copre venti, che e esattamente il numero da cui F1
      dipende. Interrogazione esplicita, e non `_count`, per la stessa ragione
      per cui le righe si rileggono invece di arrivare da `include`.
    */
    const righeDiOgniAccredito = settlementIds.length
      ? await settlementLineClient().findMany({
          where: { settlement_id: { in: settlementIds } },
          select: { settlement_id: true },
        })
      : [];

    const periodiPerAccredito = new Map<string, number>();
    for (const riga of Array.isArray(righeDiOgniAccredito)
      ? righeDiOgniAccredito
      : []) {
      const chiave = String((riga as any).settlement_id);
      periodiPerAccredito.set(chiave, (periodiPerAccredito.get(chiave) || 0) + 1);
    }

    const testaPerId = new Map(
      (Array.isArray(teste) ? teste : []).map((riga: any) => [
        String(riga.id),
        riga,
      ]),
    );

    const liquidazioniPerPeriodo = new Map<string, any[]>();
    for (const riga of Array.isArray(lines) ? lines : []) {
      const periodo = String((riga as any).accrual_id);
      const testa = testaPerId.get(String((riga as any).settlement_id));
      if (!testa) continue;

      const elenco = liquidazioniPerPeriodo.get(periodo) || [];
      elenco.push({
        settlementId: testa.id,
        /** Quanto di **questo** accredito riguarda **questo** periodo. */
        amount: toFundingAmount((riga as any).amount),
        /**
         * **Quanto vale l'accredito intero, e quanti periodi tocca** (F1).
         *
         * Lo storno agisce sulla testata: chi lo preme deve leggere questi due
         * numeri, non quello della riga. Su un bonifico in blocco sono ordini
         * di grandezza diversi.
         */
        settlementAmount: toFundingAmount(testa.amount),
        lineCount: periodiPerAccredito.get(String(testa.id)) || 1,
        settledAt: testa.settled_at,
        /*
          **Il riferimento bancario e il conto li vede chi ha il permesso sui
          conti** (revisione ostile, 7).

          `accounting.accounts_read` e il perimetro degli estremi bancari, e la
          segreteria non ce l'ha di proposito — lo dice per esteso
          `src/lib/accounting/permissions.ts`. Questa proiezione passa dal gate
          dei **contributi**, che la segreteria supera: senza questa maschera
          avrebbe portato il TRN di un bonifico e l'identificativo del conto
          intorno a un perimetro che il prodotto ha deciso di tenere chiuso.

          L'importo, la data e lo stato restano: servono a capire il periodo, e
          non sono estremi bancari.
        */
        reference: vedeGliEstremi ? testa.reference : null,
        method: testa.method,
        financialAccountId: vedeGliEstremi ? testa.financial_account_id : null,
        description: testa.description_snapshot,
        /* Una riga gia stornata, e una riga che e essa stessa uno storno. */
        reversedAt: testa.reversed_at,
        isReversal: Boolean(testa.reversal_of_id),
      });
      liquidazioniPerPeriodo.set(periodo, elenco);
    }

    const accrualiConLiquidato = (Array.isArray(accruals) ? accruals : []).map(
      (row: any) => {
        const conLiquidato = {
          ...row,
          settled_amount: settledByAccrual.get(String(row.id)) || 0,
        };

        return {
          ...conLiquidato,
          /*
            **Quanto resta da ricevere su questo periodo** (N15): maturato meno
            liquidato, mai sotto zero. Non e «previsto meno liquidato»: cio che
            non e maturato non e ancora un credito verso l'ente.
          */
          pending_settlement_amount: pendingSettlementOfAccrual(conLiquidato),
          settlements: (liquidazioniPerPeriodo.get(String(row.id)) || []).sort(
            (sinistra: any, destra: any) =>
              String(sinistra.settledAt || "").localeCompare(
                String(destra.settledAt || ""),
              ),
          ),
        };
      },
    );

    overviews.push({
      enrollment,
      program,
      accruals: accrualiConLiquidato,
      /*
        **Tutti i periodi del bando, non solo quelli calcolati** (N8).

        La scheda mostrava le sole righe di maturato, e il ricalcolo si ferma a
        **oggi**: i mesi futuri non comparivano affatto, e una segreteria che
        voleva sapere quanto puo ancora arrivare non aveva dove leggerlo.

        I periodi si derivano dalla configurazione (ADR-0037 §4) e si fondono
        con le righe per `period_index`. Nessuna riga viene inventata: un
        periodo senza maturato esce con `accrual: null` e stato `planned`, e
        chi legge sa che non e stato **calcolato** — non che valga zero.
      */
      periods: buildFundingPeriodRows(program, accrualiConLiquidato),
      summary: summarizeFunding({
        assignedAmount: enrollment.assigned_amount,
        accruals,
        settlementLines: lines,
      }),
      removal: describeEnrollmentRemoval({
        accruals: Array.isArray(accruals) ? accruals : [],
        settlementLines: Array.isArray(lines) ? lines : [],
        coverageAllocations: Array.isArray(coperture) ? coperture : [],
      }),
      canManage: hasFundingPermission(scope?.activeRole, "funding.manage"),
      canSettle: canActOnFundingSettlement(scope?.activeRole, "record"),
      canReverseSettlement: canActOnFundingSettlement(
        scope?.activeRole,
        "reverse",
      ),
      canChooseAccount: vedeGliEstremi,
      /*
        **Quanto del voucher e davvero impegnato** (revisione ostile, F5).

        Lo calcolava la schermata sommando tutte le coperture dell'atleta, e
        quella somma comprende le righe appese a rate **annullate**: quando un
        piano si rigenera le vecchie rate restano marcate, e le loro coperture
        con esse. Il server le esclude dal tetto da C2 — e cio che permette di
        coprire le rate nuove — quindi le due cifre divergevano subito dopo una
        rigenerazione, e la schermata accusava l'operatore di aver sforato un
        limite che il server considerava rispettato.

        La regola e una: `listLiveCoverageForEnrollment`, che e quella che il
        vaglio applica in scrittura.
      */
      committedAmount: await readCommittedCoverageForEnrollment(
        enrollment.id,
        scope as any,
      ),
    });
  }

  return overviews;
};

/* ============================================================ il programma
   aperto: chi c'e dentro, con quanto, e a che punto e
   ========================================================================= */

/**
 * Il dettaglio di un programma: configurazione, beneficiari, e i cinque
 * importi per ognuno.
 *
 * **Perche una funzione sola e non tre chiamate dal client.** Perche la scheda
 * del programma mostra, per ogni atleta, assegnato/maturato/rendicontato/
 * liquidato/residuo — e quei numeri non si sommano nel browser: si ricavano
 * dagli stessi periodi e dalle stesse righe di liquidazione che il dominio
 * conosce. Farli calcolare al client vorrebbe dire riscrivere il dominio in
 * TypeScript di interfaccia, che e il debito D1 che EasyGame sta riducendo.
 *
 * **Perche le query sono quattro e non una per beneficiario.** Un programma
 * regionale ha centinaia di iscritti: una lettura per atleta sarebbe un N+1
 * che cresce con il successo del bando. Maturati e righe di liquidazione si
 * caricano in blocco e si raggruppano in memoria.
 */
export type FundingProgramDetail = {
  program: Record<string, any>;
  enrollments: Array<{
    enrollment: Record<string, any>;
    athlete: { id: string; firstName: string; lastName: string } | null;
    summary: ReturnType<typeof summarizeFunding>;
    /** Vero se sono gia stati rendicontati o liquidati importi. */
    hasSettledHistory: boolean;
  }>;
  totals: {
    enrolledCount: number;
    activeCount: number;
    assignedAmount: number;
    accruedAmount: number;
    reportedAmount: number;
    settledAmount: number;
    residualAmount: number;
  };
};

export const getFundingProgramDetail = async (
  programId: string,
  scope?: FundingScope,
): Promise<FundingProgramDetail> => {
  const program = await getFundingProgramById(programId, scope);

  const enrollments = await enrollmentClient().findMany({
    where: { organization_id: program.organization_id, program_id: program.id },
    orderBy: [{ enrolled_at: "asc" }],
  });

  const rows: any[] = Array.isArray(enrollments) ? enrollments : [];
  const enrollmentIds = rows.map((row) => row.id);
  const athleteIds = Array.from(
    new Set(rows.map((row) => String(row.athlete_id)).filter(Boolean)),
  );

  const [athletes, accruals] = await Promise.all([
    athleteIds.length
      ? (prisma as any).athlete.findMany({
          where: {
            id: { in: athleteIds },
            organization_id: program.organization_id,
          },
          select: { id: true, first_name: true, last_name: true },
        })
      : Promise.resolve([]),
    enrollmentIds.length
      ? accrualClient().findMany({
          where: { enrollment_id: { in: enrollmentIds } },
          orderBy: [{ period_index: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const accrualRows: any[] = Array.isArray(accruals) ? accruals : [];
  const lines = accrualRows.length
    ? await settlementLineClient().findMany({
        where: { accrual_id: { in: accrualRows.map((row) => row.id) } },
      })
    : [];

  const athleteById = new Map(
    (Array.isArray(athletes) ? athletes : []).map((row: any) => [
      String(row.id),
      {
        id: String(row.id),
        firstName: asText(row.first_name),
        lastName: asText(row.last_name),
      },
    ]),
  );

  const accrualsByEnrollment = new Map<string, any[]>();
  for (const accrual of accrualRows) {
    const key = String(accrual.enrollment_id);
    accrualsByEnrollment.set(key, [
      ...(accrualsByEnrollment.get(key) || []),
      accrual,
    ]);
  }

  const linesByAccrual = new Map<string, any[]>();
  for (const line of Array.isArray(lines) ? lines : []) {
    const key = String((line as any).accrual_id);
    linesByAccrual.set(key, [...(linesByAccrual.get(key) || []), line]);
  }

  const detail: FundingProgramDetail["enrollments"] = rows.map((row) => {
    const own = accrualsByEnrollment.get(String(row.id)) || [];
    const ownLines = own.flatMap(
      (accrual: any) => linesByAccrual.get(String(accrual.id)) || [],
    );

    return {
      enrollment: row,
      athlete: athleteById.get(String(row.athlete_id)) || null,
      summary: summarizeFunding({
        assignedAmount: row.assigned_amount,
        accruals: own,
        settlementLines: ownLines,
      }),
      /*
        «Storico gia maturato o liquidato» e cio che distingue una revoca da una
        cancellazione: un'iscrizione che ha prodotto denaro non si toglie di
        mezzo, si chiude.
      */
      hasSettledHistory:
        ownLines.length > 0 ||
        own.some((accrual: any) =>
          ["reported", "settled"].includes(asText(accrual.status)),
        ),
    };
  });

  const totals = detail.reduce(
    (acc, entry) => ({
      enrolledCount: acc.enrolledCount + 1,
      activeCount:
        acc.activeCount + (asText(entry.enrollment.status) === "active" ? 1 : 0),
      assignedAmount: acc.assignedAmount + entry.summary.assignedAmount,
      accruedAmount: acc.accruedAmount + entry.summary.accruedAmount,
      reportedAmount: acc.reportedAmount + entry.summary.reportedAmount,
      settledAmount: acc.settledAmount + entry.summary.settledAmount,
      residualAmount: acc.residualAmount + entry.summary.residualAmount,
    }),
    {
      enrolledCount: 0,
      activeCount: 0,
      assignedAmount: 0,
      accruedAmount: 0,
      reportedAmount: 0,
      settledAmount: 0,
      residualAmount: 0,
    },
  );

  return {
    program,
    enrollments: detail,
    totals: {
      ...totals,
      assignedAmount: Number(totals.assignedAmount.toFixed(2)),
      accruedAmount: Number(totals.accruedAmount.toFixed(2)),
      reportedAmount: Number(totals.reportedAmount.toFixed(2)),
      settledAmount: Number(totals.settledAmount.toFixed(2)),
      residualAmount: Number(totals.residualAmount.toFixed(2)),
    },
  };
};

/**
 * Gli atleti che si possono ancora iscrivere a un programma.
 *
 * **Perche l'elenco lo calcola il server.** Perche «non ancora iscritti» e una
 * differenza fra due insiemi, e farla nel browser vorrebbe dire mandargli
 * l'anagrafica intera per poi scartarne meta — su un club con duemila atleti e
 * cinque megabyte per aprire una tendina.
 */
export const listEnrollableAthletes = async (
  programId: string,
  scope?: FundingScope,
): Promise<Array<{ id: string; firstName: string; lastName: string }>> => {
  const program = await getFundingProgramById(programId, scope);

  const [athletes, enrollments] = await Promise.all([
    (prisma as any).athlete.findMany({
      where: { organization_id: program.organization_id },
      select: { id: true, first_name: true, last_name: true },
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
    }),
    enrollmentClient().findMany({
      where: { program_id: program.id },
      select: { athlete_id: true },
    }),
  ]);

  const alreadyEnrolled = new Set(
    (Array.isArray(enrollments) ? enrollments : []).map((row: any) =>
      String(row.athlete_id),
    ),
  );

  return (Array.isArray(athletes) ? athletes : [])
    .filter((row: any) => !alreadyEnrolled.has(String(row.id)))
    .map((row: any) => ({
      id: String(row.id),
      firstName: asText(row.first_name),
      lastName: asText(row.last_name),
    }));
};

/**
 * I programmi a cui un atleta si puo ancora iscrivere.
 *
 * E la stessa domanda di sopra girata: la scheda atleta parte dall'atleta e
 * cerca il programma. Le due direzioni usano **lo stesso servizio di
 * iscrizione**, e questa e solo la lista da cui scegliere.
 */
export const listEnrollableProgramsForAthlete = async (
  athleteId: string,
  scope?: FundingScope,
  organizationId?: string | null,
): Promise<Record<string, any>[]> => {
  const resolvedOrganizationId = resolveOrganizationId(scope, organizationId);
  const id = asText(athleteId);

  /*
    **Chi non puo iscrivere non ha programmi a cui iscrivere** (revisione
    ostile, F4).

    Questa proiezione risponde alla domanda «a quali bandi posso ancora
    ammettere questo atleta»: senza il diritto di ammetterlo la risposta non e
    un elenco piu corto, e l'elenco vuoto. Restituirlo pieno a chi ricevera 403
    al primo clic e la definizione di un pulsante che promette.

    Serve anche a un secondo scopo, ed e il motivo per cui sta qui e non nella
    rotta: la schermata non sa se il ruolo attivo ha `funding.manage`, perche il
    gettone conservato nel browser porta lo **slug** e non le chiavi (le chiavi
    le rilegge il server, `AuthProvider`). Un elenco non vuoto e percio
    l'affermazione del server che quell'azione e permessa, ed e cosi che un
    ruolo personalizzato con la casella spuntata vede finalmente il pulsante.
  */
  if (!hasFundingPermission(scope?.activeRole, "funding.manage")) {
    return [];
  }

  const [programs, enrollments] = await Promise.all([
    programClient().findMany({
      where: { organization_id: resolvedOrganizationId },
      orderBy: [{ valid_from: "desc" }],
    }),
    enrollmentClient().findMany({
      where: { organization_id: resolvedOrganizationId, athlete_id: id },
      select: { program_id: true },
    }),
  ]);

  const enrolled = new Set(
    (Array.isArray(enrollments) ? enrollments : []).map((row: any) =>
      String(row.program_id),
    ),
  );

  /*
    Un programma `closed` non ammette nuovi beneficiari — lo dice gia
    `createFundingEnrollment` — e offrirlo nella tendina significherebbe far
    scegliere qualcosa che poi viene rifiutato.
  */
  return (Array.isArray(programs) ? programs : []).filter(
    (program: any) =>
      !enrolled.has(String(program.id)) && asText(program.status) !== "closed",
  );
};

/**
 * Ammette **piu atleti** a un programma, in una sola operazione.
 *
 * **Perche non fallisce tutta insieme.** Iscrivere trenta atleti e un'azione
 * di segreteria: se il ventitreesimo risulta gia iscritto, rifiutare l'intero
 * lotto costringerebbe a rifare la selezione a mano per capire quale. Ogni
 * atleta ha il suo esito, e chi ha premuto vede cosa e passato e cosa no.
 *
 * **Perche non e transazionale, e va detto.** Le iscrizioni riuscite restano
 * anche se una fallisce. E il comportamento giusto qui — un'iscrizione e un
 * atto indipendente dalle altre — ma non e quello di una transazione, e chi
 * legge il codice deve saperlo.
 */
export type BulkEnrollmentOutcome = {
  created: Record<string, any>[];
  skipped: Array<{ athleteId: string; reason: string }>;
};

export const createFundingEnrollments = async (
  input: {
    programId: unknown;
    athleteIds: unknown;
    /** Valori per atleta, quando l'ente assegna importi differenziati. */
    perAthlete?: Record<
      string,
      { assignedAmount?: unknown; voucherCode?: unknown }
    >;
    assignedAmount?: unknown;
    enrolledAt?: unknown;
    endsAt?: unknown;
    notes?: unknown;
  },
  scope?: FundingScope,
): Promise<BulkEnrollmentOutcome> => {
  const athleteIds = Array.from(
    new Set(
      (Array.isArray(input.athleteIds) ? input.athleteIds : [])
        .map(asText)
        .filter(Boolean),
    ),
  );

  if (!athleteIds.length) {
    throw new Error("Seleziona almeno un atleta da iscrivere");
  }

  const created: Record<string, any>[] = [];
  const skipped: BulkEnrollmentOutcome["skipped"] = [];

  for (const athleteId of athleteIds) {
    const overrides = input.perAthlete?.[athleteId] || {};

    try {
      created.push(
        await createFundingEnrollment(
          {
            programId: input.programId,
            athleteId,
            assignedAmount:
              overrides.assignedAmount === undefined
                ? input.assignedAmount
                : overrides.assignedAmount,
            voucherCode: overrides.voucherCode,
            enrolledAt: input.enrolledAt,
            endsAt: input.endsAt,
            notes: input.notes,
          },
          scope,
        ),
      );
    } catch (error: any) {
      const message = String(error?.message || "Iscrizione non riuscita");

      /*
        Un «Accesso negato» non e l'esito di un atleta: e un problema
        dell'intera operazione, e continuare vorrebbe dire nasconderlo dentro
        un elenco di righe saltate.
      */
      if (message.includes("Accesso negato")) throw error;

      skipped.push({ athleteId, reason: message });
    }
  }

  return { created, skipped };
};

/**
 * Aggiorna un'iscrizione: plafond individuale, codice voucher, stato.
 *
 * **Il plafond non puo scendere sotto il gia maturato.** Abbassarlo sotto
 * quello che l'atleta ha gia maturato produrrebbe un residuo negativo, e un
 * residuo negativo non significa niente: significa che qualcuno ha assegnato
 * meno di quanto e gia stato riconosciuto.
 */
export const updateFundingEnrollment = async (
  enrollmentId: string,
  updates: {
    assignedAmount?: unknown;
    voucherCode?: unknown;
    status?: unknown;
    endsAt?: unknown;
    notes?: unknown;
  },
  scope?: FundingScope,
) => {
  const enrollment = await getFundingEnrollmentById(enrollmentId, scope);
  const data: Record<string, any> = {};

  if (updates.assignedAmount !== undefined) {
    const assignedAmount = toFundingAmount(updates.assignedAmount);
    if (!(assignedAmount > 0)) {
      throw new Error("Il plafond assegnato deve essere maggiore di zero");
    }

    const accruals = await accrualClient().findMany({
      where: { enrollment_id: enrollment.id },
    });

    const accrued = (Array.isArray(accruals) ? accruals : []).reduce(
      (total: number, row: any) =>
        total + toFundingAmount(row.accrued_amount ?? row.accruedAmount),
      0,
    );

    if (assignedAmount < accrued) {
      throw new Error(
        `Il plafond non puo scendere sotto il gia maturato (${accrued.toFixed(2)} €)`,
      );
    }

    /*
      L'assegnato resta dentro il massimale del bando: e la sola relazione fra
      i due numeri, e va verificata anche in modifica — altrimenti il limite
      varrebbe solo alla prima iscrizione (ADR-0054).
    */
    const program = await getFundingProgramById(enrollment.program_id, scope);
    const assignedError = validateAssignedAmount({
      program,
      assignedAmount,
      alreadyAccrued: accrued,
    });
    if (assignedError) throw new Error(assignedError);

    data.assigned_amount = assignedAmount;
  }

  if (updates.voucherCode !== undefined) {
    data.voucher_code = asText(updates.voucherCode) || null;
  }

  if (updates.status !== undefined) {
    const status = asText(updates.status);
    if (!["active", "suspended", "closed"].includes(status)) {
      throw new Error("Stato dell'iscrizione non riconosciuto");
    }
    data.status = status;
  }

  if (updates.endsAt !== undefined) {
    data.ends_at = toDateOrNull(updates.endsAt);
  }

  if (updates.notes !== undefined) {
    data.notes = asText(updates.notes) || null;
  }

  if (!Object.keys(data).length) return enrollment;

  return enrollmentClient().update({
    where: { id: enrollment.id },
    data,
  });
};

/**
 * Toglie un atleta da un programma.
 *
 * **Cancella solo se non e mai successo niente.** Un'iscrizione che ha gia
 * prodotto maturati rendicontati o righe di liquidazione **non si cancella**:
 * quei numeri sono stati comunicati a un ente e, in parte, gia incassati.
 * Portarla via si porterebbe dietro la traccia di denaro vero. In quel caso
 * l'iscrizione si **revoca** — passa a `closed`, smette di maturare, e resta
 * leggibile.
 *
 * Restituisce quale delle due cose e successa, perche l'interfaccia deve
 * poterlo dire a chi ha premuto invece di far sparire una riga in silenzio.
 */
export const removeFundingEnrollment = async (
  enrollmentId: string,
  input: {
    reason?: unknown;
    /**
     * **Il consenso esplicito a chiudere un'adesione gia liquidata** (N13, caso C).
     *
     * Senza, l'operazione fallisce. Non e una formalita: quando l'ente ha gia
     * versato, stornare le coperture rimette a carico della famiglia una quota
     * che il club **ha gia incassato dall'ente**, e il risultato e lo stesso
     * importo chiesto due volte. La strada giusta e stornare la liquidazione,
     * che ha il suo percorso contabile; questo interruttore esiste per il caso
     * in cui chiudere l'adesione sia comunque cio che si vuole, e per lasciarne
     * traccia.
     */
    acknowledgeSettled?: unknown;
  } = {},
  scope?: FundingScope,
): Promise<{
  outcome: "deleted" | "revoked";
  enrollment: Record<string, any>;
  /** Quante rate tornano a carico della famiglia (N9). */
  coverageReversed: number;
  /** Cosa il dominio aveva previsto, e che la schermata aveva gia mostrato (N13). */
  plan: EnrollmentRemovalPlan;
}> => {
  const enrollment = await getFundingEnrollmentById(enrollmentId, scope);

  /*
    **La stessa porta delle altre scritture del dominio** (N13).

    Stava solo sulla rotta, e la rotta chiedeva `canManageClubConfigurationAsActor`:
    nessun ruolo personalizzato poteva revocare un voucher. Adesso la guardia e
    qui, dove sta la decisione, e passa da `funding.manage`.
  */
  assertFundingPermission(scope?.activeRole, "funding.manage");

  const accruals = await accrualClient().findMany({
    where: { enrollment_id: enrollment.id },
  });

  const accrualRows: any[] = Array.isArray(accruals) ? accruals : [];
  const lines = accrualRows.length
    ? await settlementLineClient().findMany({
        where: { accrual_id: { in: accrualRows.map((row) => row.id) } },
      })
    : [];

  /*
    **Una copertura promessa e storico** (revisione ostile, C1).

    `hasHistory` guardava soltanto maturati rendicontati e righe di
    liquidazione, e decideva fra **cancellare** e revocare. Ma la chiave
    esterna delle coperture sull'adesione e `ON DELETE RESTRICT`, e le righe
    di storno restano: il ramo «cancella» finiva percio in una violazione di
    vincolo, con le coperture **gia stornate e committate** e l'adesione
    ancora viva. Un secondo tentativo non aiutava — di coperture vive non ne
    trovava piu — e l'iscrizione restava impossibile da togliere, con la
    famiglia gia tornata a pagare per intero.

    La prova che avrebbe dovuto vederlo passava perche il doppio di Prisma non
    fa valere le chiavi esterne: e il difetto che un test in memoria non puo
    trovare, e la ragione per cui la sonda su Postgres vero esiste.

    Il rimedio non e allentare il vincolo: e riconoscere che **aver promesso
    una copertura a una famiglia e un fatto**, esattamente come aver
    rendicontato un maturato. Un'adesione che ha coperto delle rate si revoca.
  */
  const coperture = await (prisma as any).paymentCoverageAllocation.findMany({
    where: { enrollment_id: enrollment.id },
    select: {
      id: true,
      reversed_at: true,
      reverses_allocation_id: true,
    },
  });

  /*
    **La regola sta in una funzione sola** (N13).

    `hasHistory` era un'espressione booleana scritta qui, e la schermata non
    aveva modo di leggerla: non c'era nessun pulsante, e quando c'e stato
    avrebbe dovuto ricostruire lo stesso `oppure` a tre termini per decidere
    quale etichetta scrivere. Due stesure della stessa regola divergono al primo
    caso limite, ed e il difetto che ADR-0153 ha gia pagato una volta.

    Adesso il piano lo calcola `describeEnrollmentRemoval`, che e la stessa
    funzione con cui `getAthleteFundingOverview` accende il pulsante e ne
    sceglie il testo.
  */
  const plan = describeEnrollmentRemoval({
    accruals: accrualRows,
    settlementLines: Array.isArray(lines) ? lines : [],
    coverageAllocations: Array.isArray(coperture) ? coperture : [],
  });

  /*
    **Un'adesione gia liquidata non si annulla per sbaglio** (N13, caso C).

    L'ente ha versato del denaro su questa adesione. Stornarne le coperture
    rimette a carico della famiglia una quota che il club ha gia incassato
    dall'ente: lo stesso importo, chiesto due volte. Il rimedio contabile
    esiste ed e lo storno della liquidazione (`reverseFundingSettlement`);
    questa guardia serve a mandarci chi ci deve andare, e a lasciare traccia di
    chi ha scelto lo stesso di procedere.
  */
  if (plan.outcome === "settled" && !input.acknowledgeSettled) {
    throw new Error(
      `L'ente ha gia liquidato ${plan.settledAmount.toFixed(2)} EUR su questa adesione: non si annulla l'assegnazione, si storna prima la liquidazione. Se vuoi comunque chiudere l'adesione, confermalo esplicitamente`,
    );
  }

  const hasHistory = plan.outcome !== "delete";

  /*
    **Le coperture promesse si stornano, sempre** (N9 / ADR-0158).

    E il passo che senza questa lane non esisteva, e la sua assenza sarebbe
    stata il difetto piu costoso di tutto il blocco: un atleta tolto dal
    programma lasciava dietro di se le allocazioni di copertura, e quelle
    continuano a **ridurre la quota a carico della famiglia**. Il club avrebbe
    smesso di chiedere denaro che nessun ente stava piu portando, e se ne
    sarebbe accorto a fine stagione dal rendiconto.

    Si storna **prima** di decidere fra cancellazione e revoca, perche vale in
    tutti e due i casi: cio che cambia fra i due e cosa succede allo **storico**
    del bando, non cosa succede alla **promessa** fatta alla famiglia. Quella
    decade comunque, ed e per questo che qui non c'e un ramo.

    Non e distruttivo: le righe restano, marcate, e lo storno e una riga di
    segno opposto.
  */
  const copertureStornate = await reverseAllCoverageForEnrollment(
    enrollment.id,
    asText(input.reason) ||
      "Atleta tolto dal programma: la copertura promessa decade",
    scope,
  );

  if (hasHistory) {
    const revoked = await enrollmentClient().update({
      where: { id: enrollment.id },
      data: {
        status: "closed",
        ends_at: new Date(),
        notes: asText(input.reason) || enrollment.notes,
      },
    });

    return {
      outcome: "revoked",
      enrollment: revoked,
      coverageReversed: copertureStornate.reversed,
      plan,
    };
  }

  /*
    Nessuno storico: si cancellano anche i maturati calcolati, che sono un
    risultato derivato dalle presenze e si ricalcolano da soli. Lasciarli
    orfani riempirebbe la riconciliazione di righe senza beneficiario.

    **Le due cancellazioni stanno in una transazione sola** (revisione ostile,
    F7). Il piano si legge fuori dal blocco, e fra la lettura e la
    cancellazione c'e una finestra: una copertura allocata li dentro —
    l'adesione e ancora `active`, quindi e permesso — fa fallire la seconda
    riga sulla chiave esterna `RESTRICT`. Senza transazione la prima era gia
    passata, e i maturati di un'adesione **ancora viva** se n'erano andati per
    sempre, con la rotta che rispondeva «non riuscito».

    La transazione non chiude la finestra: la rende **innocua**. Il tentativo
    fallisce per intero e si puo ripetere, che e cio che una segreteria si
    aspetta da un errore.
  */
  const deleted = await (prisma as any).$transaction(async (client: any) => {
    if (accrualRows.length) {
      await client.fundingAccrual.deleteMany({
        where: { enrollment_id: enrollment.id },
      });
    }

    return client.fundingEnrollment.delete({ where: { id: enrollment.id } });
  });

  return {
    outcome: "deleted",
    enrollment: deleted,
    coverageReversed: copertureStornate.reversed,
    plan,
  };
};
