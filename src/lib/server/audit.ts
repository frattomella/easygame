import { prisma } from "./prisma";
import { getRequestIp } from "./auth-rate-limit";

/**
 * Audit log delle operazioni sensibili (ADR-0019).
 *
 * Tre principi, in ordine di importanza:
 *
 * 1. **Non deve mai far fallire l'operazione tracciata.** Se la scrittura del
 *    log non riesce, si registra l'errore sul console e si prosegue: un audit
 *    rotto non deve impedire un login o un pagamento.
 * 2. **Non deve mai contenere segreti.** I metadati passano da un filtro che
 *    rimuove password, hash, token, codici e credenziali, per nome di chiave.
 * 3. **Deve dire chi, cosa, dove, quando e con quale esito**, senza raccogliere
 *    dati personali che non servano a quello scopo.
 */

export type AuditOutcome = "success" | "failure" | "denied";

/**
 * Azioni tracciate. Formato `dominio.oggetto.verbo`, cosi il filtro per
 * prefisso e utile (`auth.`, `payment.`, `admin.`).
 */
export const AUDIT_ACTIONS = {
  authLoginSuccess: "auth.login.success",
  authLoginFailure: "auth.login.failure",
  authLogout: "auth.logout",
  authPasswordResetRequested: "auth.password_reset.requested",
  authPasswordResetCompleted: "auth.password_reset.completed",
  authPasswordResetFailed: "auth.password_reset.failed",
  membershipActivated: "membership.activated",
  membershipDeleted: "membership.deleted",
  accessTokenRedeemed: "membership.access_token.redeemed",
  resourceCreated: "resource.created",
  resourceUpdated: "resource.updated",
  resourceDeleted: "resource.deleted",
  resourceAccessDenied: "resource.access.denied",
  seasonCreated: "season.created",
  seasonActivated: "season.activated",
  seasonArchived: "season.archived",
  seasonRollover: "season.rollover",
  formSubmissionApproved: "form.submission.approved",
  formSubmissionRejected: "form.submission.rejected",
  adminEmailConfigUpdated: "admin.email_config.updated",
  adminEmailTestSent: "admin.email_config.test_sent",
  /*
    Denaro e documenti fiscali. Sono azioni che una segreteria puo dover
    ricostruire mesi dopo — «chi ha stornato questo incasso?» — e la riga
    incassata da sola non lo dice, perche dice solo com'e adesso.
  */
  paymentTransactionRecorded: "payment.transaction.recorded",
  paymentTransactionReversed: "payment.transaction.reversed",
  /*
    Rimborsi. Sono **tre** azioni e non una perche il rimborso e l'unica
    operazione di EasyGame che parte, resta in volo, e puo finire in due modi:
    la richiesta al provider e un fatto, la conferma e un fatto diverso, e il
    rifiuto e il fatto che si va a cercare quando una famiglia chiama dicendo
    che i soldi non sono tornati. Registrarne una sola vorrebbe dire non poter
    distinguere «non e mai partito» da «e partito e non e arrivato».

    La richiesta la registra la rotta, con l'attore che ha premuto; la conferma
    e il fallimento li registra il webhook, che un attore non ce l'ha.
  */
  paymentRefundRequested: "payment.refund.requested",
  paymentRefundCompleted: "payment.refund.completed",
  paymentRefundFailed: "payment.refund.failed",
  /*
    Il sollecito degli insoluti (W1-F). Raggiunge persone reali fuori dal
    prodotto: «a chi e stato scritto, quando, e da chi» e una domanda che
    arriva dalla famiglia che dice di non aver ricevuto niente, e la rata da
    sola non la risponde perche porta solo l'ultima data.
  */
  paymentRemindersSent: "payment.reminder.sent",
  documentIssued: "document.issued",
  /*
    L annullamento aveva l azione dell emissione, con `operation: "cancelled"`
    nel metadata: chi cerca «chi ha ritirato quel documento» filtrando per
    azione non lo trovava, e chi contava le emissioni contava anche gli
    annullamenti.
  */
  documentCancelled: "document.cancelled",
  /*
    Contributi da enti: la maturazione e un calcolo e non si traccia, ma
    rendicontare e liquidare sono atti verso un finanziatore.
  */
  fundingReported: "funding.period.reported",
  fundingSettled: "funding.period.settled",
  /*
    Lo storno di una liquidazione. La traccia la scrive il **servizio** e non la
    rotta: il resto del dominio bandi la scrive nella rotta, e chiamare il
    servizio da altrove non lascerebbe segno. Il codice nuovo segue il modello
    del lavoro sportivo, che e quello giusto.
  */
  fundingSettlementReversed: "funding.settlement.reversed",
  /*
    La prima nota. La traccia porta l'id **del movimento**, e non e un
    dettaglio: prima un movimento manuale finiva in `resource.updated` su
    `clubs` con l'id **del club**, e chi leggeva l'audit sapeva che qualcuno
    aveva modificato qualcosa senza sapere cosa.
  */
  accountingEntryRecorded: "accounting.entry.recorded",
  accountingEntryReversed: "accounting.entry.reversed",
  accountingEntryReconciled: "accounting.entry.reconciled",
  /*
    La correzione di un movimento. La traccia porta i campi toccati e, quando
    la causale cambia, il valore di prima e quello di dopo: e la sola modifica
    che cambia la natura fiscale di una riga, e chi legge deve poter
    ricostruire cosa diceva il rendiconto prima.
  */
  accountingEntryUpdated: "accounting.entry.updated",
  accountingTransferRecorded: "accounting.transfer.recorded",
  /*
    L'export contabile. Non e una scrittura, ed e tracciato lo stesso: e
    l'unica operazione della contabilita che porta **tutti** i movimenti fuori
    dall'applicazione dentro un file. «Chi ha scaricato i conti della societa,
    quando, e con quale filtro» e una domanda che arriva dopo, e nessuna riga
    di nessuna tabella la risponde.
  */
  accountingExported: "accounting.export.generated",
  /*
    Commerciale della piattaforma. Il club non le puo compiere: se compaiono
    con un attore che non e `platform_admin`, e successo qualcosa.
  */
  clubPlanChanged: "platform.club_plan.changed",
  clubServiceChanged: "platform.club_service.changed",
  clubEntitlementOverridden: "platform.entitlement.overridden",
  /** Configurazione di un provider di incasso: chiavi escluse dal metadata. */
  paymentProviderConfigured: "admin.payment_provider.updated",
  /** Anagrafiche di persona: chi ha cambiato i dati di chi (ADR-0019). */
  anagraficaUpdated: "anagrafica.updated",
  /*
    Il giro automatico dei promemoria sui certificati medici. Non ha un attore:
    la registra il cron. Serve a rispondere a «il promemoria e partito?» quando
    una famiglia dice di non averlo ricevuto — la notifica da sola dice cosa e
    stato creato, non che il giro di quella notte sia girato su quel club.
  */
  medicalReminderRun: "medical_certificate_reminder.run",
  /*
    Wave 2 — comunicazioni. Raggiungono persone reali fuori dal prodotto, e la
    domanda che arriva e sempre la stessa: «chi ha mandato questa email, e a
    chi». Il registro delle consegne dice **cosa** e uscito; queste righe
    dicono **chi lo ha deciso**, che e un fatto diverso e che il registro non
    porta perche una consegna non ha un attore.
  */
  communicationSent: "communication.sent",
  announcementPublished: "communication.announcement.published",
  /*
    Automazioni. Il giro non ha un attore — lo aziona il cron — ma accendere o
    spegnere una regola si, ed e la decisione che spiega perche trecento
    famiglie hanno ricevuto o non hanno ricevuto un messaggio.
  */
  automationRuleChanged: "automation.rule.changed",
  automationRun: "automation.run",
  /*
    Link di pagamento. `issued` e `revoked` hanno un attore; `opened` no, ed e
    proprio la riga che serve quando una famiglia dice di non aver mai visto
    il link.
  */
  paymentLinkIssued: "payment.link.issued",
  paymentLinkOpened: "payment.link.opened",
  paymentLinkRevoked: "payment.link.revoked",
  /*
    RSVP. La risposta della famiglia e un atto verso la societa: e il dato su
    cui l'allenatore decide se convocare qualcun altro.
  */
  rsvpAnswered: "rsvp.answered",
  /*
    Documenti (Wave 3). Un documento generato porta il nome della societa e,
    spesso, quanto ha versato una famiglia: chi lo ha prodotto e con quale
    versione del modello e una domanda che va poter avere risposta un anno
    dopo.

    **Un lotto e un evento solo.** Cento attestazioni generate insieme
    scriverebbero cento righe che dicono la stessa cosa, e il registro
    diventerebbe illeggibile proprio nel giorno in cui serve di piu.
  */
  documentTemplateCreated: "document.template.created",
  documentTemplatePublished: "document.template.published",
  documentTemplateStatusChanged: "document.template.status_changed",
  documentTemplateDeleted: "document.template.deleted",
  documentGenerated: "document.generated",
  documentBatchGenerated: "document.batch.generated",
  documentStatusChanged: "document.status_changed",
  /*
    Consensi (Wave 3). Sono quattro azioni e non una perche rispondono a quattro
    domande diverse, e sono proprio quelle che arrivano quando qualcuno contesta
    una foto pubblicata:

      * `definition.changed` — chi ha deciso che questo consenso si chiede, e
        chi lo ha ritirato;
      * `version.published` — **quale testo** e stato messo in circolazione, e
        da quando. Senza, «a cosa ha detto di si» resta senza risposta il giorno
        in cui l'informativa viene corretta;
      * `decision.recorded` — la decisione registrata per conto di qualcuno. La
        riga del registro dice **cosa** e stato deciso; questa dice **chi lo ha
        scritto**, che e un fatto diverso e che il registro non porta;
      * `revoked` — la revoca ha una riga sua perche e quella che si va a
        cercare, e cercarla fra tutte le decisioni non la trova.
  */
  consentDefinitionChanged: "consent.definition.changed",
  consentVersionPublished: "consent.version.published",
  consentDecisionRecorded: "consent.decision.recorded",
  consentRevoked: "consent.revoked",
  /*
    Il libro soci (Wave 4, W4-F). Tre azioni e non una, per la stessa ragione
    per cui la revoca di un consenso ha la sua: la **cessazione** e la riga che
    si va a cercare quando qualcuno chiede perche una persona non era piu socia
    — o perche non e stata convocata in assemblea — e cercarla fra tutti gli
    eventi associativi non la trova.

    Non si chiamano `membership.*` perche quel prefisso e gia occupato
    dall'accesso di un utente a un'organizzazione, che e un fatto diverso.
  */
  memberAdmitted: "member.admitted",
  memberCeased: "member.ceased",
  memberReinstated: "member.reinstated",
  /*
    Eventi sportivi (Wave 5, ADR-0098). Finche allenamenti e gare erano un array
    JSON, la modifica di un evento era indistinguibile dalla riscrittura
    dell'intera collezione: non c'era niente da tracciare che qualcuno potesse
    poi leggere. Adesso ogni evento e una riga con un identificativo.

    L'**annullamento** ha un'azione propria per la stessa ragione della
    cessazione di un socio: e la riga che si va a cercare quando una famiglia
    chiede perche l'allenamento del figlio non c'era, e cercarla fra tutte le
    modifiche non la trova.

    La **convocazione** e un fatto verso una persona: dice a un ragazzo che
    domenica gioca, o che non gioca. Prima era un campo dentro il payload della
    gara, e a un campo di dizionario non si puo dare un audit.
  */
  eventCreated: "event.created",
  eventUpdated: "event.updated",
  eventCancelled: "event.cancelled",
  eventConvocationsSaved: "event.convocations.saved",
  eventAttendanceRecorded: "event.attendance.recorded",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Risorse le cui scritture vengono sempre tracciate: dati economici, fiscali e
 * di accesso. Le altre risorse di club non generano audit, altrimenti il
 * volume renderebbe il log inutilizzabile.
 */
export const AUDITED_RESOURCES = new Set([
  "access_tokens",
  "bank_accounts",
  "clubs",
  "invoices",
  "organization_users",
  "organizations",
  "payment_methods",
  "payments",
  "receipts",
  "simplified_payments",
  "trainer_payments",
  "transactions",
  "transfers",
  "users",
]);

/**
 * Le anagrafiche di persona (R-07, ADR-0019).
 *
 * **Perche sono un insieme a parte e non righe in piu di quello sopra.**
 * L'azione che generano e diversa — `anagrafica.updated` invece di
 * `resource.updated` — perche la domanda che si pone su un'anagrafica e
 * diversa: non «chi ha scritto su questa tabella» ma «chi ha cambiato i dati
 * di questa persona, e quando». Cercarla fra tutte le scritture di risorsa
 * non la trova.
 *
 * **Perche adesso.** L'approvazione di una compilazione di modulo scrive in
 * anagrafica per conto di qualcun altro: senza traccia non si sa chi ha
 * approvato cosa, ed e il motivo per cui ADR-0019 dichiara questa copertura
 * bloccante per la produzione.
 *
 * **Perche non tutte le risorse di club.** Un allenamento spostato o un
 * articolo di magazzino aggiornato non hanno un soggetto: tracciarli
 * porterebbe il volume al punto in cui il log smette di essere leggibile, che
 * e il modo piu comune in cui un audit diventa inutile.
 */
export const AUDITED_ANAGRAFICA_RESOURCES = new Set([
  "athletes",
  "simplified_athletes",
  "athlete_category_memberships",
  "trainers",
  "staff_members",
  "members",
  "medical_certificates",
  "simplified_certificates",
]);

/** Vero se la scrittura su questa risorsa va tracciata, a qualunque titolo. */
export const isAuditedResource = (resource: string) =>
  AUDITED_RESOURCES.has(resource) || AUDITED_ANAGRAFICA_RESOURCES.has(resource);

/**
 * Chiavi il cui valore non deve mai finire nel log, a qualunque profondita.
 *
 * Due liste, non una: cercare per sottostringa termini brevi come `iv` o `pin`
 * censurerebbe chiavi innocue (`delivered` contiene `iv`). I termini brevi
 * vengono quindi confrontati con i **segmenti** del nome della chiave, spezzato
 * su separatori e su camelCase.
 */
const FORBIDDEN_SUBSTRINGS =
  /(password|passwd|secret|credential|authorization|cookie|apikey|privatekey|token|hash|iban)/i;

const FORBIDDEN_SEGMENTS = new Set([
  "iv",
  "tag",
  "pin",
  "otp",
  "code",
  "codes",
  "salt",
  "key",
  "keys",
  "auth",
  "session",
  "jwt",
  "bearer",
  "cvv",
]);

const isForbiddenKey = (key: string) => {
  if (FORBIDDEN_SUBSTRINGS.test(key)) return true;

  const segments = key
    .split(/[^a-zA-Z0-9]+/)
    .flatMap((part) => part.split(/(?=[A-Z])/))
    .map((part) => part.toLowerCase())
    .filter(Boolean);

  return segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment));
};

const MAX_STRING_LENGTH = 500;
const MAX_METADATA_KEYS = 40;
const MAX_DEPTH = 4;

const sanitizeValue = (value: unknown, depth: number): unknown => {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_DEPTH) return "[troncato]";

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    return sanitizeMetadata(value as Record<string, unknown>, depth + 1);
  }

  return null;
};

/**
 * Rimuove le chiavi sensibili e limita dimensione e profondita.
 * Esportata perche e coperta da test propri.
 */
export const sanitizeMetadata = (
  metadata: Record<string, unknown> | null | undefined,
  depth = 0,
): Record<string, unknown> => {
  if (!metadata || typeof metadata !== "object") return {};

  const result: Record<string, unknown> = {};
  let count = 0;

  for (const [key, value] of Object.entries(metadata)) {
    if (count >= MAX_METADATA_KEYS) {
      result["…"] = "metadati troncati";
      break;
    }
    if (isForbiddenKey(key)) {
      result[key] = "[rimosso]";
      count += 1;
      continue;
    }
    result[key] = sanitizeValue(value, depth);
    count += 1;
  }

  return result;
};

export type AuditEventInput = {
  action: AuditAction | string;
  outcome?: AuditOutcome;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  organizationId?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  request?: Request | null;
  metadata?: Record<string, unknown> | null;
};

/*
  **L'indirizzo lo dice una funzione sola.**

  Qui viveva una seconda copia di «qual e l'indirizzo del chiamante», e prendeva
  la voce piu a sinistra di `X-Forwarded-For` — quella che scrive il client.
  Corretta la copia dei limiti di tentativi e non questa, restavano due idee
  diverse dello stesso fatto: il difetto che questa Wave ha gia incontrato con
  l'amministratore di piattaforma, dove due serrature dicevano cose diverse.

  Non e un aggiramento di controlli — il valore si scrive soltanto — ma corrompe
  esattamente il registro su cui ci si basa dopo: chi bussa sceglieva l'indirizzo
  che compariva nelle proprie righe di audit, compresi i tentativi di accesso
  falliti e gli accessi negati.
*/
const readClientIp = (request?: Request | null) => {
  if (!request) return null;
  const indirizzo = getRequestIp(request);
  return indirizzo && indirizzo !== "unknown" ? indirizzo : null;
};

const readUserAgent = (request?: Request | null) => {
  const agent = request?.headers.get("user-agent");
  if (!agent) return null;
  return agent.length > 300 ? `${agent.slice(0, 300)}…` : agent;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const asUuidOrNull = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
};

/**
 * Registra un evento di audit. **Non solleva mai**: in caso di errore lo scrive
 * su console e restituisce `false`.
 */
export const recordAuditEvent = async (
  event: AuditEventInput,
): Promise<boolean> => {
  try {
    await prisma.auditLog.create({
      data: {
        action: String(event.action),
        outcome: event.outcome || "success",
        actor_user_id: asUuidOrNull(event.actorUserId),
        actor_email: event.actorEmail
          ? String(event.actorEmail).trim().toLowerCase()
          : null,
        actor_role: event.actorRole || null,
        organization_id: asUuidOrNull(event.organizationId),
        resource: event.resource || null,
        resource_id: event.resourceId ? String(event.resourceId) : null,
        ip: readClientIp(event.request),
        user_agent: readUserAgent(event.request),
        metadata: sanitizeMetadata(event.metadata) as never,
      },
    });
    return true;
  } catch (error) {
    // Un audit che fallisce non deve rompere l'operazione tracciata.
    console.error("[audit] scrittura non riuscita", {
      action: event.action,
      message: (error as Error)?.message,
    });
    return false;
  }
};

/**
 * Retention. `AUDIT_LOG_RETENTION_DAYS` non impostata significa **conserva
 * tutto**: la scelta del periodo e una decisione di prodotto e di compliance,
 * non un default tecnico (ADR-0019).
 */
export const getAuditRetentionDays = (): number | null => {
  const raw = String(process.env.AUDIT_LOG_RETENTION_DAYS || "").trim();
  if (!raw) return null;
  const days = Number.parseInt(raw, 10);
  return Number.isFinite(days) && days > 0 ? days : null;
};

/**
 * Cancella gli eventi piu vecchi della retention configurata.
 * Restituisce il numero di righe rimosse; `0` se la retention non e attiva.
 */
export const purgeExpiredAuditEvents = async (now = new Date()) => {
  const days = getAuditRetentionDays();
  if (!days) return 0;

  const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.auditLog.deleteMany({
    where: { created_at: { lt: threshold } },
  });
  return count;
};
