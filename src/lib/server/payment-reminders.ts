import { prisma } from "./prisma";
import { lockInstallmentAndTransaction } from "./payment-transactions";
import {
  isEmailDeliveryConfigured,
  sendPaymentReminderEmail,
  type PaymentReminderEmailContent,
} from "./email/email-service";
import { readAthleteGuardianContacts } from "@/lib/athlete-guardians";
import {
  buildAudienceContacts,
  resolveGuardianAccounts,
} from "./audience";
import {
  buildDedupKey,
  claimDelivery,
  MANUAL_REMINDER_WINDOW_MS,
  readAlreadyReached,
  reachedKey,
  settleDelivery,
} from "./communication-deliveries";
import {
  buildInstallmentLedgers,
  normalizePaymentTransactions,
  summarizeLedgers,
  type InstallmentLedger,
} from "@/lib/payments/installment-ledger";

/**
 * Il **sollecito degli insoluti** verso le famiglie (W1-F, PP-4).
 *
 * E la prima cosa che una segreteria chiede a un gestionale: «chi non ha
 * pagato, e come glielo dico». EasyGame sapeva gia rispondere alla prima meta
 * — lo stato di una rata si ricava dagli incassi ed e corretto — e non aveva
 * nessun modo di dire la seconda.
 *
 * Quattro regole, e nessuna e negoziabile.
 *
 * 1. **Il residuo non si ricalcola qui.** Lo produce
 *    `buildInstallmentLedgers`, cioe la stessa funzione che alimenta la
 *    scheda atleta, l'area Movimenti e i report. Una rata da 130 con 80
 *    incassati vale 50, non 130 e non 0 (ADR-0036, ADR-0068). Se questo
 *    modulo sommasse per conto proprio sarebbe la terza interpretazione del
 *    denaro, e `tests/lib/reports-cash-invariant.test.mjs` esiste per
 *    impedirlo.
 * 2. **Chi non e raggiungibile si vede.** Il difetto noto di
 *    `createParentNotifications` e che parte dagli account collegati ed esce
 *    in silenzio quando non ce ne sono: un invio che non raggiunge nessuno si
 *    dichiarava riuscito. Qui ogni destinatario compare, o fra i raggiungibili
 *    o fra i non raggiungibili **con il motivo**.
 * 3. **«Inviato» significa inviato.** Se SMTP non e configurato, o se la
 *    consegna fallisce, l'esito lo dice per destinatario. Nessun conteggio
 *    ottimista.
 * 4. **Un gesto, un invio.** Due richieste ravvicinate — il doppio clic, il
 *    reinvio del browser — producono un solo messaggio per destinatario. La
 *    difesa non e uno stato in memoria: e una rivendicazione scritta in
 *    archivio sotto blocco di riga, con la stessa finestra di riguardo di sei
 *    ore gia adottata dal sollecito sui documenti.
 *
 * **Cosa questo modulo non e.** Non e un motore di automazioni: il sollecito
 * di Wave 1 lo lancia una persona. Non e un secondo canale di notifica: si
 * scrive in `notifications` e si manda da `src/lib/server/email/`, punto.
 * Niente SMS, e nessun link di pagamento dentro il messaggio (Wave 2).
 */

/** La finestra di riguardo: la stessa del sollecito sui documenti. */
export const PAYMENT_REMINDER_WINDOW_HOURS = 6;

/** Il tipo con cui la notifica in-app si riconosce. */
export const PAYMENT_REMINDER_NOTIFICATION_TYPE = "payment_reminder";

/**
 * Perche un tutore **non** e raggiungibile. Enum chiusa: un motivo nuovo va
 * dichiarato qui, non inventato nel punto in cui serve.
 *
 * - `no_guardian` — l'atleta non ha nessun tutore in anagrafica;
 * - `no_email` — il tutore c'e ma non porta nessun indirizzo;
 * - `no_account` — il tutore dichiara un account collegato che in questo club
 *   non esiste (o non e piu iscritto), e non c'e nessun indirizzo da cui
 *   recuperarlo;
 * - `already_reminded` — gia sollecitato entro la finestra di riguardo.
 */
export type PaymentReminderBlockReason =
  | "no_guardian"
  | "no_email"
  | "no_account"
  | "already_reminded";

/** Perche un invio **partito** non e arrivato. */
export type PaymentReminderFailureReason =
  | "email_not_configured"
  | "delivery_failed";

/**
 * Perche una rata selezionata resta fuori dal sollecito.
 *
 * Non e un motivo di destinatario e non appartiene all'enum sopra: riguarda la
 * riga, non la persona. Compare comunque nell'anteprima, perche una rata che
 * qualcuno ha selezionato e che non produce niente deve dirlo invece di
 * sparire.
 */
export type PaymentReminderChargeExclusion = "nothing_due" | "no_athlete";

export type PaymentReminderScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
};

/** La posizione economica di un atleta, sulle **sole rate selezionate**. */
export type PaymentReminderPosition = {
  athleteId: string;
  athleteName: string;
  chargeIds: string[];
  /** Quanto resta da incassare: dovuto meno incassato, dal registro. */
  residualAmount: number;
  overdueCount: number;
  /** La prima scadenza **non ancora passata**, oppure `null`. */
  nextDueDate: string | null;
};

export type PaymentReminderRecipient = {
  athleteId: string;
  athleteName: string;
  guardianId: string;
  guardianName: string;
  email: string;
  /** Vero quando riceve anche la notifica in-app. */
  hasAccount: boolean;
};

export type PaymentReminderBlockedRecipient = {
  athleteId: string;
  athleteName: string;
  /** `null` quando il motivo e che un tutore non c'e proprio. */
  guardianId: string | null;
  guardianName: string | null;
  email: string | null;
  reason: PaymentReminderBlockReason;
};

export type PaymentReminderPreview = {
  organizationId: string;
  clubName: string;
  positions: PaymentReminderPosition[];
  reachable: PaymentReminderRecipient[];
  unreachable: PaymentReminderBlockedRecipient[];
  excludedCharges: Array<{
    chargeId: string;
    reason: PaymentReminderChargeExclusion;
  }>;
  /** Falso quando SMTP non e configurato: l'invio non partirebbe davvero. */
  emailConfigured: boolean;
  /** Falso quando non c'e nessun raggiungibile: l'azione non deve partire. */
  canSend: boolean;
  /** Il perche, in italiano, quando `canSend` e falso. */
  blockedReason: string | null;
};

export type PaymentReminderDelivery = {
  athleteId: string;
  athleteName: string;
  guardianId: string | null;
  guardianName: string | null;
  email: string | null;
  status: "sent" | "skipped" | "failed";
  reason: PaymentReminderBlockReason | PaymentReminderFailureReason | null;
};

export type PaymentReminderOutcome = {
  organizationId: string;
  clubName: string;
  positions: PaymentReminderPosition[];
  deliveries: PaymentReminderDelivery[];
  totals: { sent: number; skipped: number; failed: number };
  /** Le rate su cui e stata scritta la data dell'ultimo sollecito. */
  remindedChargeIds: string[];
  emailConfigured: boolean;
};

/**
 * Il postino, iniettabile.
 *
 * **Perche esiste.** Non per avere un secondo punto di invio — l'unica
 * implementazione vive in `src/lib/server/email/` e questo modulo non ne
 * conosce altre — ma perche l'unica alternativa per collaudare «SMTP non
 * configurato» e «la consegna fallisce» sarebbe montare un server SMTP finto
 * dentro i test. Il valore predefinito e il servizio vero: chi chiama dalla
 * rotta non passa niente.
 */
export type PaymentReminderMailer = {
  isConfigured: () => Promise<boolean>;
  send: (
    content: PaymentReminderEmailContent,
  ) => Promise<{ status: "sent" | "skipped"; reason?: string }>;
};

const defaultMailer: PaymentReminderMailer = {
  isConfigured: isEmailDeliveryConfigured,
  send: sendPaymentReminderEmail,
};

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const ensureOrganizationAccess = (
  scope: PaymentReminderScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) throw denied("sollecito senza club");
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("il club indicato non e fra quelli a cui hai accesso");
  }
};

/**
 * Il club su cui si sollecita e **quello attivo**, non uno qualunque fra quelli
 * a cui l'utente ha accesso.
 *
 * **Il difetto che questa riga chiude.** Il ruolo con cui la rotta decide se
 * puoi sollecitare (`canManageClubConfiguration`) viene risolto sul club
 * **attivo**, quello dell'intestazione `x-active-club-id`. Se il club su cui si
 * opera potesse arrivare dal corpo e bastasse che fosse «fra quelli a cui hai
 * accesso», chi e proprietario del proprio club e genitore in un altro
 * passerebbe il controllo come proprietario del primo e sollecitrebbe il
 * secondo — leggendone gli indirizzi email dei tutori e mandando email a suo
 * nome. Il ruolo e il perimetro devono parlare dello **stesso** club.
 */
const resolveOrganizationId = (
  scope: PaymentReminderScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per il sollecito");
    return wanted;
  }

  if (!scope.activeOrganizationId) {
    throw new Error("Nessun club attivo selezionato");
  }

  if (wanted && wanted !== scope.activeOrganizationId) {
    throw denied(
      "si sollecita il club attivo, non un altro fra quelli a cui hai accesso",
    );
  }

  ensureOrganizationAccess(scope, scope.activeOrganizationId);
  return scope.activeOrganizationId;
};

const chargeClient = () => (prisma as any).athletePayment;
const transactionClient = () => (prisma as any).paymentTransaction;
const athleteClient = () => (prisma as any).athlete;
const notificationClient = () => (prisma as any).notification;

const athleteDisplayName = (athlete: any) =>
  [athlete?.first_name, athlete?.last_name]
    .map((value) => asText(value))
    .filter(Boolean)
    .join(" ") || "Atleta";

const toIsoOrNull = (value: unknown) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/**
 * La chiave con cui un destinatario si riconosce fra un invio e il successivo.
 *
 * **E l'indirizzo, non l'account.** Un tutore senza account non ha un id, e
 * usarne uno costruito sull'anagrafica lo perderebbe al primo riordino delle
 * righe. L'indirizzo e cio che il messaggio raggiunge davvero, ed e la cosa
 * giusta da non colpire due volte.
 */
const recipientKey = (email: string) => email.trim().toLowerCase();

/**
 * La chiave con cui il registro delle consegne riconosce un sollecito.
 *
 * **Per atleta, non per selezione di rate.** La finestra di riguardo protegge
 * la **famiglia** dal ricevere due messaggi ravvicinati, e la famiglia e legata
 * all'atleta: se la chiave portasse le rate selezionate, sollecitare prima la
 * rata di ottobre e poi quella di novembre produrrebbe due email a distanza di
 * un minuto, che e esattamente cio che la finestra esiste per evitare.
 */
const reminderDedupKey = (athleteId: string) =>
  buildDedupKey("reminder", athleteId);

/**
 * La prima scadenza **non ancora passata** fra le rate ancora scoperte.
 *
 * Non e «la prossima rata su cui agire» (`findNextInstallment`), che con delle
 * rate scadute restituisce la piu vecchia: chiamare «prossima scadenza» una
 * data del mese scorso in un messaggio a una famiglia sarebbe una bugia
 * piccola e verificabile. Quando tutte le rate sollecitate sono gia scadute
 * questa e `null`, e il messaggio semplicemente non ne parla.
 */
const nextFutureDueDate = (ledgers: InstallmentLedger[], now: Date) => {
  /*
    Il confronto e con l'**inizio della giornata**, non con l'istante.

    Una scadenza e una data — mezzanotte — e `now` e un momento qualunque del
    giorno: confrontarli direttamente scartava la rata che scade **oggi**. Se
    era l'unica aperta, il messaggio alla famiglia usciva senza nessuna
    scadenza, che e proprio il dato per cui il §5.4 punto 18 lo fa scrivere.
  */
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const dates = ledgers
    .filter((ledger) => ledger.residualAmount > 0 && ledger.dueDate)
    .map((ledger) => new Date(ledger.dueDate as string))
    .filter(
      (date) =>
        !Number.isNaN(date.getTime()) &&
        date.getTime() >= startOfToday.getTime(),
    )
    .sort((left, right) => left.getTime() - right.getTime());

  return dates[0] ? dates[0].toISOString() : null;
};

type AthleteWork = {
  athlete: any;
  athleteId: string;
  athleteName: string;
  ledgers: InstallmentLedger[];
  position: PaymentReminderPosition;
  reachable: Array<PaymentReminderRecipient & { userId: string | null }>;
  unreachable: PaymentReminderBlockedRecipient[];
};

/**
 * Le rate selezionate, verificate e raggruppate per atleta.
 *
 * Il confine di sicurezza si applica **prima** di qualunque lettura di
 * anagrafica: le rate si cercano gia filtrate per club, e un identificativo
 * che non torna indietro viene rifiutato con «Accesso negato» senza dire se
 * esista altrove. Un sollecito che partisse da una rata di un'altra societa
 * scriverebbe a una famiglia che non e di questo club.
 */
const loadCharges = async (organizationId: string, chargeIds: string[]) => {
  const requested = Array.from(
    new Set(chargeIds.map((value) => asText(value)).filter(Boolean)),
  );

  if (requested.length === 0) {
    throw new Error("Nessuna rata selezionata per il sollecito");
  }

  const charges = await chargeClient().findMany({
    where: { id: { in: requested }, organization_id: organizationId },
  });

  const found = new Set(charges.map((charge: any) => asText(charge.id)));
  const missing = requested.filter((id) => !found.has(id));

  if (missing.length > 0) {
    throw denied(
      "una delle rate selezionate non appartiene a questo club o non esiste piu",
    );
  }

  return charges;
};

/**
 * Il lavoro comune ad anteprima e invio.
 *
 * Esiste in un punto solo perche anteprima e invio **devono** vedere la stessa
 * cosa: due calcoli separati divergerebbero, e la schermata mostrerebbe un
 * elenco di destinatari diverso da quello che poi riceve il messaggio.
 */
const collect = async ({
  organizationId,
  chargeIds,
  scope,
  now,
}: {
  organizationId: string;
  chargeIds: string[];
  scope?: PaymentReminderScope;
  now: Date;
}) => {
  const charges = await loadCharges(organizationId, chargeIds);

  /*
    Il controllo si rifa riga per riga anche se la query era gia filtrata: e
    la stessa doppia difesa del registro incassi, e costa una condizione.
  */
  for (const charge of charges) {
    ensureOrganizationAccess(scope, asText(charge.organization_id));
  }

  const excludedCharges: PaymentReminderPreview["excludedCharges"] = [];
  const byAthlete = new Map<string, any[]>();

  for (const charge of charges) {
    const athleteId = asText(charge.athlete_id);
    if (!athleteId) {
      excludedCharges.push({ chargeId: asText(charge.id), reason: "no_athlete" });
      continue;
    }
    const bucket = byAthlete.get(athleteId);
    if (bucket) bucket.push(charge);
    else byAthlete.set(athleteId, [charge]);
  }

  const athleteIds = Array.from(byAthlete.keys());

  const [transactions, athletes, club] = await Promise.all([
    athleteIds.length
      ? transactionClient().findMany({
          where: {
            organization_id: organizationId,
            payment_id: { in: charges.map((charge: any) => asText(charge.id)) },
          },
        })
      : Promise.resolve([]),
    athleteIds.length
      ? athleteClient().findMany({
          where: { organization_id: organizationId, id: { in: athleteIds } },
        })
      : Promise.resolve([]),
    (prisma as any).club.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
  ]);

  const normalizedTransactions = normalizePaymentTransactions(transactions);
  const athletesById = new Map<string, any>(
    athletes.map((athlete: any) => [asText(athlete.id), athlete]),
  );

  /*
    Gli account dei tutori si risolvono **una volta sola**, prima del ciclo.

    Chiamare `resolveGuardianAccounts` dentro il ciclo costava due
    interrogazioni per atleta: su una selezione di duecento rate erano
    quattrocento letture, e il doppio contando che anteprima e invio fanno lo
    stesso lavoro. §10.9 del planning chiede «nessuna N+1», e questa lo era.
    La mappa e per identificativo utente, quindi vale per tutti gli atleti.
  */
  const guardianAccounts = await resolveGuardianAccounts(
    organizationId,
    athletes.flatMap((athlete: any) => readAthleteGuardianContacts(athlete)),
  );

  /*
    Chi e gia stato raggiunto nella finestra di riguardo, letto **una volta
    sola** dal registro delle consegne.

    Fino alla Wave 2 questa informazione stava dentro
    `athletes.data.paymentReminders`, cioe in un posto che sapeva rispondere a
    «gli ho gia scritto?» e non a «cosa gli ho scritto». Sono la stessa
    domanda, e adesso hanno la stessa riga (ADR-0084).
  */
  const alreadyReached = await readAlreadyReached({
    organizationId,
    dedupKeys: athleteIds.map(reminderDedupKey),
    channel: "email",
    retryAfterMs: MANUAL_REMINDER_WINDOW_MS,
    now,
  });

  const work: AthleteWork[] = [];

  for (const athleteId of athleteIds) {
    const athleteCharges = byAthlete.get(athleteId) || [];
    const athlete = athletesById.get(athleteId);

    /*
      L'atleta non e nel club: le rate erano gia state verificate, quindi qui
      significa anagrafica incoerente. Le rate restano fuori e lo dicono.
    */
    if (!athlete) {
      for (const charge of athleteCharges) {
        excludedCharges.push({
          chargeId: asText(charge.id),
          reason: "no_athlete",
        });
      }
      continue;
    }

    const ledgers = buildInstallmentLedgers({
      charges: athleteCharges,
      transactions: normalizedTransactions,
      now,
    });

    const open = ledgers.filter((ledger) => ledger.residualAmount > 0);
    const openIds = new Set(
      open.map((ledger) => asText(ledger.installmentId)).filter(Boolean),
    );

    /*
      Le rate gia saldate — e quelle annullate, che `buildInstallmentLedgers`
      toglie di mezzo perche non sono piu un debito — restano fuori dal
      messaggio e dalla traccia: sollecitarle direbbe alla famiglia di pagare
      due volte. Restano pero **elencate**, perche qualcuno le ha selezionate.
    */
    for (const charge of athleteCharges) {
      const chargeId = asText(charge.id);
      if (!openIds.has(chargeId)) {
        excludedCharges.push({ chargeId, reason: "nothing_due" });
      }
    }

    if (open.length === 0) continue;

    const totals = summarizeLedgers(open);
    const athleteName = athleteDisplayName(athlete);
    const position: PaymentReminderPosition = {
      athleteId,
      athleteName,
      chargeIds: open
        .map((ledger) => asText(ledger.installmentId))
        .filter(Boolean),
      residualAmount: totals.residualAmount,
      overdueCount: totals.overdueCount,
      nextDueDate: nextFutureDueDate(open, now),
    };

    /*
      **I contatti li risolve l'audience engine**, non questo modulo.

      Prima della Wave 2 la stessa lettura esisteva qui e dentro i promemoria
      sui certificati, con due politiche diverse: la prima raggiungeva anche
      chi ha solo un indirizzo, la seconda **solo** chi ha un account nel club.
      La differenza non era una scelta di prodotto, era una divergenza. Adesso
      la politica e una sola e sta in `src/lib/server/audience.ts` (ADR-0087).
    */
    const contacts = buildAudienceContacts(athlete, guardianAccounts);
    const reachable: AthleteWork["reachable"] = [];
    const unreachable: PaymentReminderBlockedRecipient[] = [];

    if (contacts.length === 0) {
      unreachable.push({
        athleteId,
        athleteName,
        guardianId: null,
        guardianName: null,
        email: null,
        reason: "no_guardian",
      });
      work.push({ athlete, athleteId, athleteName, ledgers: open, position, reachable, unreachable });
      continue;
    }

    const dedupKey = reminderDedupKey(athleteId);
    const seen = new Set<string>();

    for (const contact of contacts) {
      const email = recipientKey(contact.email);

      if (!email) {
        unreachable.push({
          athleteId,
          athleteName,
          guardianId: contact.guardianId,
          guardianName: contact.guardianName,
          email: null,
          /*
            Un account dichiarato ma introvabile in questo club e un caso
            diverso da «indirizzo mancante»: la segreteria deve sapere se le
            manca un dato o se il collegamento e da rifare.
          */
          reason: contact.declaresMissingAccount ? "no_account" : "no_email",
        });
        continue;
      }

      /*
        Lo stesso indirizzo su due righe di tutore e un solo destinatario: il
        messaggio e uno, e mandarne due non lo rende piu chiaro.
      */
      if (seen.has(email)) continue;
      seen.add(email);

      if (alreadyReached.has(reachedKey(dedupKey, email))) {
        unreachable.push({
          athleteId,
          athleteName,
          guardianId: contact.guardianId,
          guardianName: contact.guardianName,
          email,
          reason: "already_reminded",
        });
        continue;
      }

      reachable.push({
        athleteId,
        athleteName,
        guardianId: contact.guardianId,
        guardianName: contact.guardianName,
        email,
        hasAccount: Boolean(contact.userId),
        userId: contact.userId,
      });
    }

    work.push({ athlete, athleteId, athleteName, ledgers: open, position, reachable, unreachable });
  }

  return {
    clubName: asText(club?.name) || "Il tuo club",
    work,
    excludedCharges,
  };
};

const countTotals = (deliveries: PaymentReminderDelivery[]) => ({
  sent: deliveries.filter((row) => row.status === "sent").length,
  skipped: deliveries.filter((row) => row.status === "skipped").length,
  failed: deliveries.filter((row) => row.status === "failed").length,
});

const buildPreview = ({
  organizationId,
  clubName,
  work,
  excludedCharges,
  emailConfigured,
}: {
  organizationId: string;
  clubName: string;
  work: AthleteWork[];
  excludedCharges: PaymentReminderPreview["excludedCharges"];
  emailConfigured: boolean;
}): PaymentReminderPreview => {
  const reachable = work.flatMap((entry) =>
    entry.reachable.map((recipient) => ({
      athleteId: recipient.athleteId,
      athleteName: recipient.athleteName,
      guardianId: recipient.guardianId,
      guardianName: recipient.guardianName,
      email: recipient.email,
      hasAccount: recipient.hasAccount,
    })),
  );
  const unreachable = work.flatMap((entry) => entry.unreachable);
  const canSend = reachable.length > 0;
  const deferred = unreachable.filter(
    (blocked) => blocked.reason === "already_reminded",
  ).length;

  return {
    organizationId,
    clubName,
    positions: work.map((entry) => entry.position),
    reachable,
    unreachable,
    excludedCharges,
    emailConfigured,
    canSend,
    blockedReason: canSend
      ? null
      : deferred > 0
        ? "Queste famiglie sono gia state sollecitate nelle ultime sei ore."
        : unreachable.length > 0
          ? "Nessun destinatario raggiungibile fra le rate selezionate: controlla tutori e indirizzi email in anagrafica."
          : "Nessuna rata da sollecitare fra quelle selezionate.",
  };
};

/**
 * L'anteprima: chi riceverebbe il sollecito, chi no e perche.
 *
 * Non scrive niente e non manda niente. E il passaggio che rende il sollecito
 * di massa un'operazione che si puo controllare prima di compierla.
 */
export const buildPaymentReminderPreview = async ({
  organizationId,
  chargeIds,
  scope,
  now = new Date(),
  mailer = defaultMailer,
}: {
  organizationId?: string | null;
  chargeIds: string[];
  scope?: PaymentReminderScope;
  now?: Date;
  mailer?: PaymentReminderMailer;
}): Promise<PaymentReminderPreview> => {
  const clubId = resolveOrganizationId(scope, organizationId);
  const [{ clubName, work, excludedCharges }, emailConfigured] =
    await Promise.all([
      collect({ organizationId: clubId, chargeIds, scope, now }),
      mailer.isConfigured(),
    ]);

  return buildPreview({
    organizationId: clubId,
    clubName,
    work,
    excludedCharges,
    emailConfigured,
  });
};

/**
 * Rivendica i destinatari **prima** di scrivere loro.
 *
 * **Perche prima.** Due richieste ravvicinate — il doppio clic, o il reinvio
 * di una richiesta lenta — leggono entrambe «nessuno e stato ancora
 * sollecitato» e mandano entrambe il messaggio.
 *
 * **Cosa e cambiato in Wave 2.** La rivendicazione stava dentro
 * `athletes.data.paymentReminders`, difesa da un blocco di riga sull'atleta:
 * funzionava, ma metteva in fila su **una riga di anagrafica** ogni sollecito
 * di quell'atleta, e sapeva rispondere solo a «gli ho gia scritto?». Adesso e
 * una riga del registro delle consegne e la difesa e l'indice unico
 * (ADR-0084): entrambe le richieste provano a rivendicare, e la seconda scopre
 * dal conteggio delle righe toccate di aver perso la corsa. La stessa riga
 * risponde anche a «cosa gli ho scritto», che e la seconda meta della stessa
 * domanda.
 *
 * Il comportamento visibile non cambia: un gesto, un invio; passata la
 * finestra di riguardo si puo riscrivere; un fallimento la libera subito.
 */
const claimRecipients = async (
  work: AthleteWork[],
  now: Date,
  organizationId: string,
): Promise<Map<string, string>> => {
  const claimed = new Map<string, string>();

  for (const entry of work) {
    for (const recipient of entry.reachable) {
      const claim = await claimDelivery({
        organizationId,
        sourceKind: "reminder",
        sourceId: entry.athleteId,
        dedupKey: reminderDedupKey(entry.athleteId),
        channel: "email",
        recipientKey: recipient.email,
        recipientUserId: recipient.userId,
        recipientName: recipient.guardianName,
        recipientEmail: recipient.email,
        athleteIds: [entry.athleteId],
        subject: `Quote da regolarizzare per ${entry.athleteName}`,
        /*
          Il sollecito lo decide una persona, e la stessa persona puo volerlo
          rifare la settimana dopo: la difesa serve contro il doppio clic, non
          contro la ripetizione. Passata la finestra si puo riscrivere.
        */
        retryAfterMs: MANUAL_REMINDER_WINDOW_MS,
        now,
      });

      if (claim.claimed) {
        claimed.set(`${entry.athleteId}:${recipient.email}`, claim.id);
      }
    }
  }

  return claimed;
};

/**
 * Chiude la rivendicazione di un destinatario che il messaggio non lo ha
 * ricevuto.
 *
 * Senza, un fallimento SMTP lascerebbe la famiglia non sollecitabile per sei
 * ore per un messaggio che non e mai partito: la finestra di riguardo esiste
 * per non ripetersi, non per punire un guasto.
 */
const releaseClaim = async (
  deliveryId: string,
  reason: PaymentReminderFailureReason,
  now: Date,
) => {
  /*
    La riga **resta**, marcata `failed`, invece di essere cancellata: un
    tentativo andato male e un fatto da poter raccontare a chi chiama dicendo
    di non aver ricevuto niente. E una riga fallita e comunque riprendibile
    subito, che e cio che «rilasciare» significava prima.
  */
  await settleDelivery({ id: deliveryId, status: "failed", reason, now });
};

/**
 * Esegue il sollecito e riferisce **per destinatario**.
 *
 * Si rifiuta di partire quando non c'e nessun raggiungibile: un'azione di
 * massa che non raggiunge nessuno e un pulsante che mente, ed e esattamente il
 * difetto che questo modulo esiste per chiudere.
 */
export const sendPaymentReminders = async ({
  organizationId,
  chargeIds,
  scope,
  now = new Date(),
  mailer = defaultMailer,
}: {
  organizationId?: string | null;
  chargeIds: string[];
  scope?: PaymentReminderScope;
  now?: Date;
  mailer?: PaymentReminderMailer;
}): Promise<PaymentReminderOutcome> => {
  const clubId = resolveOrganizationId(scope, organizationId);
  const [{ clubName, work, excludedCharges }, emailConfigured] =
    await Promise.all([
      collect({ organizationId: clubId, chargeIds, scope, now }),
      mailer.isConfigured(),
    ]);

  const preview = buildPreview({
    organizationId: clubId,
    clubName,
    work,
    excludedCharges,
    emailConfigured,
  });

  /*
    Il rifiuto a partire riguarda chi **non si potrebbe raggiungere in nessun
    caso**: nessun tutore, nessun indirizzo, nessun account. Chi e soltanto
    dentro la finestra di riguardo non fa fallire l'operazione — quello e il
    doppio clic, e rispondergli con un errore trasformerebbe una ripetizione
    innocua in un guasto. Riceve `skipped: already_reminded`, che e la verita.
  */
  const deferred = preview.unreachable.some(
    (blocked) => blocked.reason === "already_reminded",
  );

  if (!preview.canSend && !deferred) {
    throw new Error(
      preview.blockedReason ||
        "Nessun destinatario raggiungibile: il sollecito non e stato inviato",
    );
  }

  const deliveries: PaymentReminderDelivery[] = work.flatMap((entry) =>
    entry.unreachable.map((blocked) => ({
      athleteId: blocked.athleteId,
      athleteName: blocked.athleteName,
      guardianId: blocked.guardianId,
      guardianName: blocked.guardianName,
      email: blocked.email,
      status: "skipped" as const,
      reason: blocked.reason,
    })),
  );

  /*
    SMTP non configurato: non si rivendica niente e non si scrive niente. Ogni
    destinatario risulta `failed` con il motivo, cosi il conteggio non dice
    «inviato» per un messaggio che nessun server ha mai accettato.
  */
  if (!emailConfigured) {
    for (const entry of work) {
      for (const recipient of entry.reachable) {
        deliveries.push({
          athleteId: recipient.athleteId,
          athleteName: recipient.athleteName,
          guardianId: recipient.guardianId,
          guardianName: recipient.guardianName,
          email: recipient.email,
          status: "failed",
          reason: "email_not_configured",
        });
      }
    }

    return {
      organizationId: clubId,
      clubName,
      positions: preview.positions,
      deliveries,
      totals: countTotals(deliveries),
      remindedChargeIds: [],
      emailConfigured,
    };
  }

  const claimed = await claimRecipients(work, now, clubId);
  const nowIso = now.toISOString();
  const remindedChargeIds: string[] = [];

  for (const entry of work) {
    let deliveredForAthlete = false;

    for (const recipient of entry.reachable) {
      const deliveryId = claimed.get(`${entry.athleteId}:${recipient.email}`);

      /*
        Non rivendicato significa che un'altra richiesta ha vinto la corsa
        mentre questa era in volo: e il doppio clic, e la risposta corretta e
        «gia sollecitato», non un secondo messaggio.
      */
      if (!deliveryId) {
        deliveries.push({
          athleteId: recipient.athleteId,
          athleteName: recipient.athleteName,
          guardianId: recipient.guardianId,
          guardianName: recipient.guardianName,
          email: recipient.email,
          status: "skipped",
          reason: "already_reminded",
        });
        continue;
      }

      try {
        const result = await mailer.send({
          to: recipient.email,
          clubName,
          athleteName: entry.athleteName,
          guardianName: recipient.guardianName,
          residualAmount: entry.position.residualAmount,
          overdueCount: entry.position.overdueCount,
          nextDueDate: entry.position.nextDueDate,
        });

        if (result.status !== "sent") {
          await releaseClaim(
            deliveryId,
            result.reason === "email_not_configured"
              ? "email_not_configured"
              : "delivery_failed",
            now,
          );
          deliveries.push({
            athleteId: recipient.athleteId,
            athleteName: recipient.athleteName,
            guardianId: recipient.guardianId,
            guardianName: recipient.guardianName,
            email: recipient.email,
            status: "failed",
            /*
              Il motivo e quello che il servizio email ha dato, non una
              costante. Questo ramo si raggiunge solo quando SMTP **e**
              configurato — il caso contrario esce prima — quindi scrivere
              «Invio email non configurato» mandava la segreteria a controllare
              una configurazione che era a posto.
            */
            reason:
              result.reason === "email_not_configured"
                ? "email_not_configured"
                : "delivery_failed",
          });
          continue;
        }

        deliveredForAthlete = true;
        /*
          La rivendicazione si chiude **dopo** che il messaggio e partito, non
          prima: fra la rivendicazione e questa riga la consegna puo fallire, e
          una riga gia marcata `sent` direbbe una cosa che non e successa.
        */
        await settleDelivery({ id: deliveryId, status: "sent", now });
        deliveries.push({
          athleteId: recipient.athleteId,
          athleteName: recipient.athleteName,
          guardianId: recipient.guardianId,
          guardianName: recipient.guardianName,
          email: recipient.email,
          status: "sent",
          reason: null,
        });

        /*
          La notifica in-app accompagna un'email **riuscita**, e solo per chi
          ha un account: e la stessa cosa detta due volte a chi puo leggerla in
          due posti, non un secondo canale.
        */
        if (recipient.userId) {
          await notificationClient().create({
            data: {
              organization_id: clubId,
              user_id: recipient.userId,
              title: "Quote da regolarizzare",
              message: `${entry.athleteName}: restano ${entry.position.residualAmount.toFixed(2).replace(".", ",")} euro da versare.`,
              type: PAYMENT_REMINDER_NOTIFICATION_TYPE,
              read: false,
              data: {
                source: "payment_reminders",
                paymentReminderKey: `${PAYMENT_REMINDER_NOTIFICATION_TYPE}:${entry.athleteId}:${recipient.email}`,
                athleteId: entry.athleteId,
                residualAmount: entry.position.residualAmount,
                overdueCount: entry.position.overdueCount,
                nextDueDate: entry.position.nextDueDate,
                actionHref: `/parent-view/${entry.athleteId}`,
              },
            },
          });
        }
      } catch (error: any) {
        /*
          Un destinatario che fallisce non ferma gli altri: la segreteria deve
          poter vedere che tre su quattro sono partiti, e riprovare sul quarto.
        */
        await releaseClaim(deliveryId, "delivery_failed", now);
        deliveries.push({
          athleteId: recipient.athleteId,
          athleteName: recipient.athleteName,
          guardianId: recipient.guardianId,
          guardianName: recipient.guardianName,
          email: recipient.email,
          status: "failed",
          reason: "delivery_failed",
        });
        console.error("[payment-reminders] invio non riuscito", {
          athleteId: entry.athleteId,
          code: asText(error?.code) || "SMTP_DELIVERY_FAILED",
        });
      }
    }

    /*
      La traccia sulla rata si scrive solo se qualcuno ha ricevuto davvero:
      «ultimo sollecito» deve poter essere letto come «l'ultima volta che la
      famiglia e stata avvisata».
    */
    if (!deliveredForAthlete) continue;

    for (const chargeId of entry.position.chargeIds) {
      /*
        **La traccia del sollecito si scrive sotto il blocco della riga.**

        `payments.data` non contiene solo la nostra traccia: contiene
        `data.ledger`, la fotografia degli incassi che il registro riscrive a
        ogni movimento (ADR-0036) e da cui `/movements` e `/reports` leggono la
        cassa (ADR-0068). Leggere il JSON, aggiungerci due chiavi e riscriverlo
        **intero** senza blocco significa che un incasso registrato alla cassa
        mentre il sollecito gira viene sovrascritto da uno stato letto prima:
        gli euro appena battuti sparirebbero da entrambe le pagine.

        Il proprietario del dominio lo fa cosi
        (`payment-transactions.ts`, `lockInstallmentAndTransaction`), e questa
        scrittura deve farlo uguale — anche se tocca due chiavi che al registro
        non interessano.
      */
      const written = await (prisma as any).$transaction(async (client: any) => {
        // Il blocco lo prende la funzione del proprietario del dominio: una
        // seconda copia della stessa `SELECT ... FOR UPDATE` e una seconda
        // occasione di scriverla diversa.
        await lockInstallmentAndTransaction(client, chargeId);

        const charge = await client.athletePayment.findFirst({
          where: { id: chargeId, organization_id: clubId },
        });
        if (!charge) return false;

        await client.athletePayment.update({
          where: { id: chargeId },
          data: {
            data: {
              ...asRecord(charge.data),
              lastReminderAt: nowIso,
              lastReminderBy: scope?.userId || null,
            },
          },
        });
        return true;
      });

      if (written) {
        remindedChargeIds.push(chargeId);
      }
    }
  }

  return {
    organizationId: clubId,
    clubName,
    positions: preview.positions,
    deliveries,
    totals: countTotals(deliveries),
    remindedChargeIds,
    emailConfigured,
  };
};
