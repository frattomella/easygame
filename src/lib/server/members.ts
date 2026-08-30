import { prisma } from "./prisma";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import { allocateSequenceNumber } from "./document-numbering";
import { appendClubResourceItem, readClubResourceCollection } from "./resources";
import {
  MEMBERSHIP_SEQUENCE_KIND,
  MEMBERSHIP_SEQUENCE_YEAR,
  deriveMemberStatus,
  explainMembershipEventDenial,
  formatMembershipNumber,
  isMembershipCessation,
  isMembershipEventType,
  validateMembershipEventDraft,
  type MembershipEventInput,
  type MembershipEventType,
  type MemberStatusDerivation,
} from "@/lib/members/model";
import {
  canManageMembershipRegister,
  canReadMembershipRegister,
} from "@/lib/members/permissions";

/**
 * Il libro soci: **l'unico** punto in cui EasyGame scrive un evento
 * associativo (Wave 4, W4-F, §19).
 *
 * **Cosa non fa.** Non crea una seconda anagrafica: il socio resta in
 * `clubs.members`, dove sta da sempre. Qui nasce il **registro** che gli sta
 * accanto, e che l'anagrafica non puo sostituire perche un oggetto mutabile non
 * ha una storia.
 *
 * **Tre proprieta, e nessuna e un aggiornamento di stato.**
 *
 * - il registro e **append-only**: in questo file non c'e nessun `update` e
 *   nessun `delete` su `membership_events`, e non deve nascerne uno. Una
 *   dimissione aggiunge una riga; l'ammissione di tre anni fa resta
 *   dimostrabile, ed e esattamente cio che serve il giorno in cui un
 *   verificatore chiede chi era socio quando quella quota e stata incassata;
 * - lo **stato si deriva** da `deriveMemberStatus`, a una data. Nessuna colonna
 *   lo conserva: una colonna di stato accanto a uno storico sono due risposte
 *   alla stessa domanda, e prima o poi divergono;
 * - il **numero di tessera si assegna**, e il client non puo proporlo. Prima era
 *   un campo di testo libero digitato a mano: due segreterie potevano scrivere
 *   lo stesso numero e nessuno se ne accorgeva.
 *
 * **Il confine di sicurezza e `organization_id`.** Ogni funzione riceve uno
 * scope e lo applica: nessuna riga di un altro club si legge, si scrive o si
 * cita, e il messaggio contiene «Accesso negato» perche il route handler lo
 * mappi su 403.
 */

export type MemberAccessScope = {
  userId: string;
  activeOrganizationId: string | null;
  /** Il ruolo con cui si sta operando: da `resolveOrganizationScopeForUser`. */
  activeRole?: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : asText(value) || null;

const toDateOrNull = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = asText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/* ------------------------------------------------------------- permessi */

/**
 * I due permessi arrivano da `src/lib/members/permissions.ts` e non da qui.
 *
 * La stessa lezione della Wave 2 e della Wave 3: quattro copie della stessa
 * matrice restano indietro in silenzio. Qui si compone, non si decide.
 */
const assertCanManage = (scope: MemberAccessScope | undefined) => {
  if (!canManageMembershipRegister(scope?.activeRole)) {
    throw denied(
      "il libro soci lo tiene la direzione del club: chi ammette ed esclude e lo stesso organo che decide lo statuto",
    );
  }
};

const assertCanRead = (scope: MemberAccessScope | undefined) => {
  if (!canReadMembershipRegister(scope?.activeRole)) {
    throw denied("il libro soci del club lo legge chi ci lavora dentro");
  }
};

/* ---------------------------------------------------------------- scope */

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
 * un socio **di un'altra**, e il permesso veniva concesso con il ruolo
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
  scope: MemberAccessScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) throw denied("libro soci senza club");
  const attivo = asText(scope.activeOrganizationId);
  if (!attivo) throw denied("nessun club attivo selezionato");
  if (attivo !== asText(organizationId)) {
    throw denied("non trovato, o non appartiene al club attivo");
  }
};

const resolveOrganizationId = (
  scope: MemberAccessScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per il libro soci");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

/* ------------------------------------------------------------- le righe */

type EventRow = {
  id: string;
  organization_id: string;
  member_id: string;
  member_label: string;
  event_type: string;
  effective_date: Date | string;
  resolution_reference: string | null;
  resolution_date: Date | string | null;
  reason: string | null;
  membership_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: Date | string;
};

export type MembershipEventSummary = {
  id: string;
  memberId: string;
  memberLabel: string;
  eventType: MembershipEventType;
  effectiveDate: string | null;
  resolutionReference: string | null;
  resolutionDate: string | null;
  reason: string | null;
  membershipNumber: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string | null;
};

const summarizeEvent = (row: EventRow): MembershipEventSummary => ({
  id: String(row.id),
  memberId: String(row.member_id),
  memberLabel: asText(row.member_label),
  eventType: asText(row.event_type).toUpperCase() as MembershipEventType,
  effectiveDate: toIso(row.effective_date),
  resolutionReference: row.resolution_reference || null,
  resolutionDate: toIso(row.resolution_date),
  reason: row.reason || null,
  membershipNumber: row.membership_number || null,
  notes: row.notes || null,
  recordedBy: row.recorded_by || null,
  createdAt: toIso(row.created_at),
});

/** La forma che il dominio puro sa leggere. */
const toDerivationInput = (row: EventRow): MembershipEventInput => ({
  id: String(row.id),
  memberId: String(row.member_id),
  memberLabel: asText(row.member_label),
  eventType: asText(row.event_type),
  effectiveDate: row.effective_date,
  resolutionReference: row.resolution_reference,
  resolutionDate: row.resolution_date,
  reason: row.reason,
  membershipNumber: row.membership_number,
  notes: row.notes,
  createdAt: row.created_at,
});

const eventClient = (client: any) => client.membershipEvent;

const loadEventRows = async (
  organizationId: string,
  memberId?: string | null,
): Promise<EventRow[]> =>
  (await eventClient(prisma).findMany({
    where: {
      organization_id: organizationId,
      ...(memberId ? { member_id: memberId } : {}),
    },
    orderBy: [{ effective_date: "asc" }, { created_at: "asc" }],
  })) as EventRow[];

/* ------------------------------------------------------------ l'anagrafica */

/**
 * Il socio dall'anagrafica, con il nome con cui compare.
 *
 * Passa da `readClubResourceCollection` e non da una query propria: `clubs.members`
 * ha un proprietario, ed e `resources.ts`. **E anche il filtro multi-tenant**:
 * un socio di un altro club semplicemente non e in questa collezione.
 */
const findMemberInAnagrafica = async (
  organizationId: string,
  memberId: string,
): Promise<Record<string, any> | null> => {
  const members = await readClubResourceCollection(organizationId, "members");
  const wanted = asText(memberId);

  return (
    members.find(
      (member: any) => asText(member?.id) === wanted && wanted.length > 0,
    ) || null
  );
};

const labelOf = (member: Record<string, any> | null | undefined) =>
  asText(member?.fullName) ||
  asText(member?.name) ||
  [asText(member?.lastName), asText(member?.firstName)]
    .filter(Boolean)
    .join(" ") ||
  "Socio";

/* ------------------------------------------------------------ il numero */

/**
 * Il prossimo numero di tessera, dentro la transazione di chi lo ha chiesto.
 *
 * Non e digitabile e non e ricavato contando i soci: contarli darebbe lo stesso
 * numero a due segreterie che ammettono nello stesso secondo, e riuserebbe il
 * numero di chi si e dimesso — cioe due persone diverse con lo stesso numero
 * nei verbali di due assemblee.
 */
const allocateMembershipNumber = async (
  organizationId: string,
  client: any,
): Promise<string> =>
  formatMembershipNumber(
    await allocateSequenceNumber({
      organizationId,
      kind: MEMBERSHIP_SEQUENCE_KIND,
      year: MEMBERSHIP_SEQUENCE_YEAR,
      client,
    }),
  );

const isDuplicateKey = (error: any) =>
  error?.code === "P2002" ||
  String(error?.message || "").includes("membership_events");

const duplicateTarget = (error: any) =>
  [
    ...(Array.isArray(error?.meta?.target) ? error.meta.target : []),
    String(error?.meta?.target || ""),
    String(error?.message || ""),
  ].join(" ");

/* --------------------------------------------------------- la scrittura */

export type RecordMembershipEventInput = {
  organizationId?: string | null;
  memberId: string;
  eventType: string;
  effectiveDate?: string | Date | null;
  resolutionReference?: string | null;
  resolutionDate?: string | Date | null;
  reason?: string | null;
  notes?: string | null;
  /**
   * Accettato solo per poterlo **rifiutare** con una frase leggibile: se
   * sparisse dalla firma, un client che lo manda si vedrebbe ignorare il campo
   * e crederebbe di averlo assegnato.
   */
  membershipNumber?: string | null;
};

export type MembershipEventResult = {
  event: MembershipEventSummary;
  status: MemberStatusDerivation;
};

/**
 * Registra un evento del libro soci.
 *
 * L'unica scrittura di `membership_events`, e non ha ne una gemella che
 * aggiorna ne una che cancella.
 */
export const recordMembershipEvent = async (
  scope: MemberAccessScope,
  input: RecordMembershipEventInput,
): Promise<MembershipEventResult> => {
  assertCanManage(scope);
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  if (asText(input.membershipNumber)) {
    throw new Error(
      "Il numero di tessera non si digita: lo assegna il libro soci all'ammissione",
    );
  }

  const memberId = asText(input.memberId);
  if (!memberId) throw new Error("Manca il socio a cui riferire l'evento");

  const member = await findMemberInAnagrafica(organizationId, memberId);
  if (!member) {
    /*
      «Non trovato» e non «Accesso negato» quando il club e il proprio: dire
      «negato» a chi ha sbagliato a copiare un id manderebbe una segreteria a
      cercare un problema di permessi che non c'e. Il socio di un altro club
      finisce comunque qui, e non vede nessun dato.
    */
    throw new Error("Socio non trovato in anagrafica");
  }

  const validation = validateMembershipEventDraft(input);
  if (!validation.ok) {
    throw new Error(validation.issues[0].message);
  }

  const eventType = asText(input.eventType).toUpperCase() as MembershipEventType;
  const effectiveDate = toDateOrNull(input.effectiveDate) as Date;

  const existing = await loadEventRows(organizationId, memberId);
  const current = deriveMemberStatus(existing.map(toDerivationInput));

  const denial = explainMembershipEventDenial(current.status, eventType);
  if (denial) throw new Error(denial);

  const memberLabel = labelOf(member);
  const recordedBy = asText(scope?.userId) || null;

  /*
    Numero e riga nascono nella stessa transazione: se la riga fallisce, il
    numero non deve risultare assegnato a niente. Una chiave duplicata annulla
    in Postgres l'intera transazione, quindi si riprova l'operazione intera —
    e al secondo giro il contatore e piu avanti.
  */
  let created: EventRow | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
    try {
      created = await (prisma as any).$transaction(async (tx: any) => {
        const membershipNumber =
          eventType === "ADMISSION"
            ? await allocateMembershipNumber(organizationId, tx)
            : null;

        return (await eventClient(tx).create({
          data: {
            organization_id: organizationId,
            member_id: memberId,
            member_label: memberLabel,
            event_type: eventType,
            effective_date: effectiveDate,
            resolution_reference: asText(input.resolutionReference) || null,
            resolution_date: toDateOrNull(input.resolutionDate),
            reason: asText(input.reason) || null,
            membership_number: membershipNumber,
            notes: asText(input.notes) || null,
            recorded_by: recordedBy,
          },
        })) as EventRow;
      });
    } catch (error: any) {
      if (!isDuplicateKey(error)) throw error;

      /*
        Due indici unici parziali, due significati diversi. L'ammissione
        doppia e un fatto che non si puo riprovare: l'ha gia registrata
        qualcun altro un istante fa, e riprovare la rifiuterebbe di nuovo. Il
        numero duplicato invece e una corsa fra due ammissioni contemporanee,
        e al secondo giro il contatore e avanti.
      */
      if (duplicateTarget(error).includes("member_id")) {
        throw new Error(
          "Questa persona risulta gia ammessa: un socio si ammette una volta sola",
        );
      }
      lastError = error;
    }
  }

  if (!created) {
    throw new Error(
      "Numerazione del libro soci non disponibile: riprova fra qualche istante",
      { cause: lastError },
    );
  }

  const status = deriveMemberStatus(
    [...existing, created].map(toDerivationInput),
  );

  await recordAuditEvent({
    /*
      La cessazione ha un'azione propria e non un metadato: e la riga che si va
      a cercare quando qualcuno chiede perche una persona non era piu socia, e
      cercarla fra tutti gli eventi non la trova.
    */
    action:
      eventType === "ADMISSION"
        ? AUDIT_ACTIONS.memberAdmitted
        : eventType === "REINSTATEMENT"
          ? AUDIT_ACTIONS.memberReinstated
          : AUDIT_ACTIONS.memberCeased,
    actorUserId: scope.userId,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "membership_events",
    resourceId: created.id,
    metadata: {
      socio: memberId,
      nome: memberLabel,
      evento: eventType,
      efficaceDal: effectiveDate.toISOString(),
      delibera: asText(input.resolutionReference) || null,
      numero: created.membership_number || null,
    },
  });

  return { event: summarizeEvent(created), status };
};

/* --------------------------------------------- l'ammissione di un nuovo socio */

export type AdmitNewMemberInput = {
  organizationId?: string | null;
  /** L'anagrafica del socio, come la scrive la scheda di creazione. */
  member: Record<string, any>;
  effectiveDate?: string | Date | null;
  resolutionReference?: string | null;
  resolutionDate?: string | Date | null;
  notes?: string | null;
};

/**
 * Le chiavi che l'anagrafica non riceve dal client.
 *
 * `id` e `createdAt` li decide il server; `user_id` collega un socio a un
 * account e non e un dato dell'ammissione; `membershipNumber` lo assegna il
 * libro. Passassero, un client potrebbe scrivere un numero di tessera a mano
 * proprio nel punto in cui la Wave 4 glielo toglie.
 */
const MEMBER_RESERVED_KEYS = [
  "id",
  "user_id",
  "userId",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "membershipNumber",
  "membership_number",
];

/**
 * Crea il socio in anagrafica **e** la sua ammissione, in una transazione sola.
 *
 * **Il difetto che chiude** (§19). La creazione di un socio era una lettura,
 * un append e una riscrittura dell'intera colonna `clubs.members` fatta dal
 * browser: due segreterie nello stesso minuto, la seconda scrittura cancellava
 * la prima. Qui la scrittura e del server, e passa da `appendClubResourceItem`,
 * che inserisce **una riga** e ricalcola l'aggregato sotto un lock.
 *
 * L'anagrafica e l'evento nascono insieme perche un socio in elenco senza
 * ammissione nel libro e precisamente la situazione che questa lane esiste per
 * eliminare.
 */
export const admitNewMember = async (
  scope: MemberAccessScope,
  input: AdmitNewMemberInput,
): Promise<MembershipEventResult & { member: Record<string, any> }> => {
  assertCanManage(scope);
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  const draft = { ...(input.member || {}) };
  for (const key of MEMBER_RESERVED_KEYS) delete draft[key];

  const firstName = asText(draft.firstName ?? draft.first_name);
  const lastName = asText(draft.lastName ?? draft.last_name ?? draft.surname);
  if (!firstName || !lastName) {
    throw new Error("Nome e cognome del socio sono obbligatori");
  }

  const validation = validateMembershipEventDraft({
    ...input,
    eventType: "ADMISSION",
  });
  if (!validation.ok) throw new Error(validation.issues[0].message);

  const effectiveDate = toDateOrNull(input.effectiveDate) as Date;
  const fullName = `${firstName} ${lastName}`.trim();
  const now = new Date();

  const payload = {
    ...draft,
    firstName,
    lastName,
    name: fullName,
    fullName,
    role: "socio",
    status: "active",
    /*
      `membershipDate` resta scritto in anagrafica perche mezza applicazione lo
      legge, ma **non e piu la fonte**: la data di ammissione e quella
      dell'evento, e qui c'e la sua copia. Se le due divergessero, ha ragione
      il libro.
    */
    membershipDate: effectiveDate.toISOString().slice(0, 10),
    createdAt: now.toISOString(),
  };

  let outcome: { member: Record<string, any>; event: EventRow } | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3 && !outcome; attempt += 1) {
    try {
      outcome = await (prisma as any).$transaction(async (tx: any) => {
        const member = await appendClubResourceItem(
          tx,
          organizationId,
          "members",
          payload,
        );

        const membershipNumber = await allocateMembershipNumber(
          organizationId,
          tx,
        );

        const event = (await eventClient(tx).create({
          data: {
            organization_id: organizationId,
            member_id: String(member.id),
            member_label: fullName,
            event_type: "ADMISSION",
            effective_date: effectiveDate,
            resolution_reference: asText(input.resolutionReference) || null,
            resolution_date: toDateOrNull(input.resolutionDate),
            reason: null,
            membership_number: membershipNumber,
            notes: asText(input.notes) || null,
            recorded_by: asText(scope?.userId) || null,
          },
        })) as EventRow;

        return { member, event };
      });
    } catch (error: any) {
      if (!isDuplicateKey(error)) throw error;
      lastError = error;
    }
  }

  if (!outcome) {
    throw new Error(
      "Numerazione del libro soci non disponibile: riprova fra qualche istante",
      { cause: lastError },
    );
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.memberAdmitted,
    actorUserId: scope.userId,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "membership_events",
    resourceId: outcome.event.id,
    metadata: {
      socio: String(outcome.member.id),
      nome: fullName,
      evento: "ADMISSION",
      efficaceDal: effectiveDate.toISOString(),
      delibera: asText(input.resolutionReference) || null,
      numero: outcome.event.membership_number || null,
    },
  });

  return {
    member: outcome.member,
    event: summarizeEvent(outcome.event),
    status: deriveMemberStatus([toDerivationInput(outcome.event)]),
  };
};

/* ---------------------------------------------------------- le letture */

/** Lo storico di un socio, dal piu recente. Nessun `update`, nessun `delete`. */
export const listMembershipEvents = async (
  scope: MemberAccessScope,
  memberId: string,
  options: { organizationId?: string | null } = {},
): Promise<MembershipEventSummary[]> => {
  assertCanRead(scope);
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const wanted = asText(memberId);
  if (!wanted) throw new Error("Manca il socio di cui leggere il registro");

  const rows = await loadEventRows(organizationId, wanted);
  return rows.map(summarizeEvent).reverse();
};

export type MembershipRecord = {
  memberId: string;
  memberLabel: string;
  status: MemberStatusDerivation;
  events: MembershipEventSummary[];
};

/**
 * La posizione di un socio: lo stato derivato e lo storico che lo produce.
 *
 * `atDate` risponde a «era socio quel giorno», che e la domanda per cui il
 * registro esiste: la classificazione di un'entrata dipende dalla qualifica
 * della controparte **al momento dell'operazione**, non da quella di oggi.
 */
export const getMembershipRecord = async (
  scope: MemberAccessScope,
  memberId: string,
  options: { organizationId?: string | null; atDate?: string | Date | null } = {},
): Promise<MembershipRecord> => {
  assertCanRead(scope);
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const wanted = asText(memberId);
  if (!wanted) throw new Error("Manca il socio di cui leggere la posizione");

  const rows = await loadEventRows(organizationId, wanted);
  const member = await findMemberInAnagrafica(organizationId, wanted);

  if (!member && !rows.length) {
    throw new Error("Socio non trovato in anagrafica");
  }

  return {
    memberId: wanted,
    memberLabel: member ? labelOf(member) : asText(rows[0]?.member_label),
    status: deriveMemberStatus(rows.map(toDerivationInput), options.atDate),
    events: rows.map(summarizeEvent).reverse(),
  };
};

export type MembershipRegisterRow = {
  memberId: string;
  memberLabel: string;
  /** Il tipo dall'anagrafica: ordinario, sostenitore, onorario. */
  memberType: string | null;
  status: MemberStatusDerivation;
  eventCount: number;
  /** Vero quando la persona non e piu in anagrafica ma resta nel libro. */
  onlyInRegister: boolean;
};

/**
 * Il libro completo a una data.
 *
 * **Chi compare.** Tutti i soci in anagrafica, anche quelli senza nemmeno un
 * evento — che risultano `mai_ammesso`, ed e quello l'elenco di cio che manca
 * al libro. E tutte le persone che hanno eventi ma non sono piu in anagrafica:
 * un libro non perde nessuno perche qualcuno ha cancellato una scheda, e il
 * nome congelato sull'evento e li apposta.
 */
export const listMembershipRegister = async (
  scope: MemberAccessScope,
  options: { organizationId?: string | null; atDate?: string | Date | null } = {},
): Promise<MembershipRegisterRow[]> => {
  assertCanRead(scope);
  const organizationId = resolveOrganizationId(scope, options.organizationId);

  const [rows, members] = await Promise.all([
    loadEventRows(organizationId),
    readClubResourceCollection(organizationId, "members"),
  ]);

  const byMember = new Map<string, EventRow[]>();
  for (const row of rows) {
    const key = String(row.member_id);
    const bucket = byMember.get(key);
    if (bucket) bucket.push(row);
    else byMember.set(key, [row]);
  }

  const register: MembershipRegisterRow[] = [];
  const seen = new Set<string>();

  for (const member of members as Record<string, any>[]) {
    const memberId = asText(member?.id);
    if (!memberId) continue;
    seen.add(memberId);

    const events = byMember.get(memberId) || [];
    register.push({
      memberId,
      memberLabel: labelOf(member),
      memberType: asText(member?.type) || null,
      status: deriveMemberStatus(events.map(toDerivationInput), options.atDate),
      eventCount: events.length,
      onlyInRegister: false,
    });
  }

  for (const [memberId, events] of byMember) {
    if (seen.has(memberId)) continue;
    register.push({
      memberId,
      memberLabel: asText(events[0]?.member_label) || "Socio",
      memberType: null,
      status: deriveMemberStatus(events.map(toDerivationInput), options.atDate),
      eventCount: events.length,
      onlyInRegister: true,
    });
  }

  return register.sort((left, right) =>
    left.memberLabel.localeCompare(right.memberLabel, "it"),
  );
};

/**
 * Era socio a quella data?
 *
 * La domanda del §32.5, in una funzione: la decommercializzazione di
 * un'entrata dipende dalla qualifica della controparte al momento
 * dell'operazione. Sta qui perche chi classifichera un incasso non debba
 * rifare la derivazione a modo suo.
 */
export const wasMemberOn = async (
  scope: MemberAccessScope,
  memberId: string,
  atDate: string | Date,
  options: { organizationId?: string | null } = {},
): Promise<boolean> => {
  const record = await getMembershipRecord(scope, memberId, {
    ...options,
    atDate,
  });
  return record.status.isMember;
};

/** Riesportato perche le rotte non debbano importare due moduli per una domanda. */
export { isMembershipCessation, isMembershipEventType };
