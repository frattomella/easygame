import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import { openGatewayCheckout } from "./payment-gateway";
import { loadClubEntitlements } from "./entitlements";
import {
  normalizePaymentTransactions,
  resolveInstallmentLedger,
} from "@/lib/payments/installment-ledger";

/**
 * Il **link di pagamento** verso la famiglia (G-06, Wave 2 / W2-B).
 *
 * Sollecitare senza dare il modo di pagare produce un secondo sollecito. Questo
 * modulo emette, risolve e revoca il link che una famiglia apre **senza
 * account**, su Internet, davanti a un pagamento: e la sola superficie della
 * Wave esposta a chiunque abbia l'indirizzo.
 *
 * **Cosa questo modulo non fa, ed e il vincolo che lo tiene piccolo.** Non
 * calcola niente di economico e non muove denaro. Il residuo lo produce
 * `resolveInstallmentLedger` — la stessa funzione della scheda atleta, dei
 * Movimenti e dei report — e il pagamento lo apre `openGatewayCheckout`, cioe
 * **il** checkout, lo stesso della rotta autenticata, con la stessa chiave di
 * idempotenza, la stessa commissione e lo stesso webhook che registra
 * l'incasso. Qui non nasce nessun secondo percorso del denaro.
 *
 * ## Le decisioni di sicurezza, e perche
 *
 * 1. **Token opaco in archivio, non token firmato senza stato.** Un JWT che
 *    porta dentro club, rata e scadenza si revoca solo con una lista di
 *    revoca, cioe con una riga in archivio: e un token in archivio con un
 *    passaggio in piu. Trentadue byte casuali non portano **nessun claim**:
 *    non c'e niente da manomettere e non espongono nessun identificativo
 *    interno.
 * 2. **A riposo si conserva solo lo SHA-256.** Chi legge il database non
 *    ottiene link funzionanti. E la stessa scelta gia fatta per `code_hash`
 *    delle sfide di verifica e per i token di reset password.
 * 3. **Un solo esito negativo.** Token sconosciuto, scaduto o revocato
 *    rispondono `not_available` e nient'altro. Distinguerli direbbe a chi
 *    prova token a caso quando ha indovinato.
 * 4. **Confronto a tempo costante** sull'hash, come `secretsMatch` in
 *    `cron-auth.ts`.
 * 5. **Il residuo si ricalcola adesso.** L'importo non viene mai congelato nel
 *    link: una famiglia che paga allo sportello e poi apre il link non deve
 *    pagare due volte. Rata gia saldata non e un errore, e una buona notizia.
 * 6. **Il link e multi-uso fino a scadenza.** Il prodotto ammette il pagamento
 *    parziale (ADR-0036): monouso romperebbe il secondo acconto.
 * 7. **L'entitlement `online_payments` vale anche qui**, in emissione **e** in
 *    riscatto: un messaggio non deve promettere un pagamento che il club non
 *    puo incassare, e un club che perde il piano non deve lasciare in giro
 *    pulsanti che aprono un checkout impossibile.
 * 8. **Nessun identificativo interno esce dalla vista pubblica.** Niente
 *    `payment_id`, `organization_id`, `athlete_id`, e nemmeno l'`id` del link.
 *
 * ## Perche un sollecito nuovo emette un token nuovo
 *
 * Si potrebbe riusare un link ancora valido per la stessa rata. **Non lo
 * facciamo**, e non e una svista: revocare i precedenti per tenerne uno solo
 * renderebbe morto il link del sollecito mandato la settimana prima, che e
 * ancora nella casella di posta della famiglia e che la famiglia aprira. Ogni
 * emissione crea un token nuovo e **lascia validi i precedenti fino alla loro
 * scadenza**; la revoca esiste ed e un gesto esplicito della segreteria.
 * Il costo e qualche riga in piu in archivio, e non ha nessun effetto sul
 * denaro: tutti i token della stessa rata guardano lo stesso residuo, che si
 * ricalcola a ogni apertura.
 */

/* ------------------------------------------------------------- le costanti */

/** Trenta giorni: la durata di un sollecito, non di una stagione. */
export const PAYMENT_LINK_DEFAULT_TTL_DAYS = 30;

/**
 * Un tetto c'e, ed e volutamente basso. Un link di pagamento che vive un anno
 * e una credenziale permanente in una casella di posta.
 */
export const PAYMENT_LINK_MAX_TTL_DAYS = 90;

/** Trentadue byte da `crypto.randomBytes`: 256 bit, non enumerabili. */
export const PAYMENT_LINK_TOKEN_BYTES = 32;

/**
 * **L'unico** messaggio per i casi non disponibili. Una costante e non tre
 * frasi, perche tre frasi tornerebbero diverse alla prima modifica e
 * ricomincerebbero a distinguere i casi.
 */
export const PAYMENT_LINK_NOT_AVAILABLE_MESSAGE =
  "Link di pagamento non disponibile. Chiedi alla societa un link aggiornato.";

/* ------------------------------------------------------------- i tipi */

export type PaymentLinkScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
};

/** Cosa la pagina pubblica puo dire di se. */
export type PaymentLinkStatus = "payable" | "already_settled" | "not_available";

/**
 * La vista pubblica. **Questo elenco di campi e il contratto di sicurezza**:
 * un identificativo interno aggiunto qui uscirebbe su Internet, e il test
 * `nessun identificativo interno nella vista pubblica` esiste per impedirlo.
 */
export type PaymentLinkPublicView =
  | { status: "not_available"; message: string }
  | {
      status: "payable" | "already_settled";
      clubName: string;
      clubLogoUrl: string;
      clubContactEmail: string;
      athleteName: string;
      description: string;
      /** La scadenza **della rata**, non quella del link. */
      dueDate: string | null;
      /** Quanto resta, ricalcolato adesso. In euro e in centesimi. */
      residualAmount: number;
      residualCents: number;
      /** Il dovuto, per dare contesto a un pagamento parziale gia fatto. */
      dueAmount: number;
      paidAmount: number;
      /** Quando il link smette di funzionare. */
      linkExpiresAt: string;
    };

export type IssuePaymentLinkResult =
  | {
      outcome: "issued";
      linkId: string;
      /** Il token in chiaro: **esiste solo qui**, mai in archivio. */
      token: string;
      path: string;
      expiresAt: string;
      paymentId: string;
      athleteId: string | null;
    }
  | { outcome: "entitlement_missing"; message: string };

export type OpenPaymentLinkCheckoutResult =
  | { status: "not_available"; message: string }
  | { status: "already_settled"; message: string }
  | {
      status: "ready";
      checkoutUrl: string;
      amountCents: number;
      provider: string;
    };

export type RevokePaymentLinkResult = {
  linkId: string;
  revokedAt: string;
  /** Vero se era gia revocato: revocare due volte non e un errore. */
  alreadyRevoked: boolean;
};

/**
 * Perche un club non puo incassare online. Un **esito tipizzato** e non
 * un'eccezione: il sollecito deve poter dire «questo club non puo incassare
 * online» in anteprima, invece di fallire.
 */
export type PaymentLinkEntitlementVerdict = {
  allowed: boolean;
  message: string;
};

/** La porta sull'entitlement: iniettabile, cosi i test non montano i piani. */
export type PaymentLinkEntitlementPort = (
  organizationId: string,
) => Promise<PaymentLinkEntitlementVerdict>;

/** La porta sul checkout. **Non** un secondo checkout: la stessa funzione. */
export type PaymentLinkCheckoutPort = typeof openGatewayCheckout;

type PaymentLinkRow = {
  id: string;
  organization_id: string;
  payment_id: string;
  athlete_id: string | null;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  use_count: number;
};

export type PaymentLinkResolution =
  | { outcome: "not_available" }
  | { outcome: "found"; link: PaymentLinkRow };

/* --------------------------------------------------------- gli aiuti puri */

const asText = (value: unknown) => String(value ?? "").trim();

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const toIsoOrNull = (value: unknown) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toCents = (amount: number) => Math.round(Number(amount || 0) * 100);

/**
 * Il token in chiaro. **Url-safe** perche vive dentro un percorso HTTP: una
 * codifica che produce `+` e `/` obbligherebbe a percorsi codificati, e un
 * carattere perso in un client di posta diventerebbe un link che non funziona
 * senza che nessuno sappia perche.
 */
export const generatePaymentLinkToken = () =>
  randomBytes(PAYMENT_LINK_TOKEN_BYTES).toString("base64url");

/**
 * Lo SHA-256 del token: **e l'unica cosa che entra in archivio**.
 *
 * Nessun sale e nessuna derivazione lenta, e non e una dimenticanza: il token
 * ha 256 bit di entropia vera e non e una password scelta da una persona. Un
 * dizionario non lo attacca, e un hash lento renderebbe costoso ogni riscatto
 * senza togliere niente a chi legge il database.
 */
export const hashPaymentLinkToken = (token: unknown) => {
  const normalized = asText(token);
  if (!normalized) return "";
  return createHash("sha256").update(normalized).digest("hex");
};

/**
 * Confronto a tempo costante fra due impronte.
 *
 * Un confronto normale esce al primo carattere diverso, e il tempo di risposta
 * racconta quanti caratteri erano giusti. E la stessa regola — e la stessa
 * forma — di `secretsMatch` in `cron-auth.ts`.
 */
export const paymentLinkHashesMatch = (left: string, right: string) => {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (left.length === 0 || left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

/**
 * Un link e utilizzabile finche non e scaduto e non e stato revocato.
 * Funzione **pura**: si prova senza database.
 */
export const isPaymentLinkUsable = (
  link: { expires_at: unknown; revoked_at?: unknown },
  now: Date = new Date(),
) => {
  if (link.revoked_at) return false;

  const expiry =
    link.expires_at instanceof Date
      ? link.expires_at
      : new Date(String(link.expires_at));

  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() > now.getTime();
};

/** La durata richiesta, riportata dentro i limiti. Pura. */
export const normalizePaymentLinkTtlDays = (value: unknown) => {
  const requested = Math.floor(Number(value));
  if (!Number.isFinite(requested) || requested <= 0) {
    return PAYMENT_LINK_DEFAULT_TTL_DAYS;
  }
  return Math.min(requested, PAYMENT_LINK_MAX_TTL_DAYS);
};

/** Il percorso pubblico di un token. Un posto solo per non sbagliarlo. */
export const buildPaymentLinkPath = (token: string) =>
  `/pay/${encodeURIComponent(asText(token))}`;

/**
 * L'origine da cui costruire gli URL di ritorno.
 *
 * **Perche il server e non il client.** Se `successUrl` e `cancelUrl`
 * arrivassero dal corpo della richiesta, il link di pagamento diventerebbe un
 * redirector aperto: chiunque avesse un token potrebbe far tornare il browser
 * di chi paga su un indirizzo scelto da lui, con l'aria di venire da EasyGame.
 * Gli URL li costruisce sempre il server.
 */
export const resolvePaymentLinkOrigin = (request: {
  url: string;
  headers: { get: (name: string) => string | null };
}) => {
  const configured = asText(
    process.env.AUTH_BASE_URL || process.env.NEXT_PUBLIC_APP_URL,
  );
  if (configured) return configured.replace(/\/+$/, "");

  const host = asText(request.headers.get("x-forwarded-host"));
  const proto = asText(request.headers.get("x-forwarded-proto")) || "https";
  if (host) return `${proto}://${host}`;

  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
};

/**
 * Dove torna il browser dopo il pagamento. **Sempre sulla pagina del link**:
 * e l'unica pagina che chi paga ha diritto di vedere, e mostra il residuo
 * ricalcolato invece di dichiarare un esito che solo il webhook conosce.
 */
export const buildPaymentLinkReturnUrls = (origin: string, token: string) => {
  const base = `${asText(origin).replace(/\/+$/, "")}${buildPaymentLinkPath(token)}`;
  return {
    successUrl: `${base}?esito=inviato`,
    cancelUrl: `${base}?esito=annullato`,
  };
};

/* -------------------------------------------------------- il perimetro */

/**
 * Il club su cui si opera e **quello attivo**, non uno qualunque fra quelli a
 * cui l'utente ha accesso. Stessa regola di `payment-reminders.ts`: il ruolo
 * con cui si decide e il club su cui si opera devono parlare dello **stesso**
 * club, altrimenti chi e proprietario del proprio club e genitore in un altro
 * emetterebbe link di pagamento sulle rate del secondo.
 */
const resolveOrganizationId = (
  scope: PaymentLinkScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per il link di pagamento");
    return wanted;
  }

  if (!scope.activeOrganizationId) {
    throw new Error("Nessun club attivo selezionato");
  }

  if (wanted && wanted !== scope.activeOrganizationId) {
    throw denied(
      "si emette un link sul club attivo, non su un altro fra quelli a cui hai accesso",
    );
  }

  if (!scope.allowedOrganizationIds.includes(scope.activeOrganizationId)) {
    throw denied("il club attivo non e fra quelli a cui hai accesso");
  }

  return scope.activeOrganizationId;
};

/* ------------------------------------------------------- i client Prisma */

const linkClient = () => (prisma as any).paymentLink;
const chargeClient = () => (prisma as any).athletePayment;
const transactionClient = () => (prisma as any).paymentTransaction;
const athleteClient = () => (prisma as any).athlete;
const clubClient = () => (prisma as any).club;

/* ------------------------------------------------------ l'entitlement */

/**
 * Il verdetto sull'entitlement `online_payments`, come **dato** e non come
 * eccezione.
 *
 * `requireClubEntitlement` solleva, ed e giusto sulla rotta autenticata dove
 * il gesto o riesce o si ferma. Qui serve l'altra forma: il sollecito deve
 * poter scrivere in anteprima «questo club non puo incassare online» senza
 * fallire, e il messaggio deve restare quello del catalogo — «Disponibile con
 * il piano Plus», «L'abbonamento non e in corso» — perche sono due cause con
 * due rimedi diversi (N-02).
 */
export const defaultPaymentLinkEntitlementPort: PaymentLinkEntitlementPort =
  async (organizationId) => {
    const { entitlements } = await loadClubEntitlements({ organizationId });
    const verdict = entitlements.explain("online_payments");
    return {
      allowed: Boolean(verdict.allowed),
      message: String(verdict.message || "Incassi online non disponibili"),
    };
  };

/* -------------------------------------------------------- la risoluzione */

/**
 * Il link che corrisponde a un token, se ce n'e uno **utilizzabile**.
 *
 * **Un solo esito negativo, ed e il punto.** Token vuoto, token sconosciuto,
 * link scaduto, link revocato: `not_available` per tutti e quattro. Chi prova
 * token a caso non deve poter distinguere «non esiste» da «esiste ma e
 * scaduto», perche la seconda risposta gli direbbe che ha indovinato.
 *
 * Il confronto sull'impronta e a tempo costante anche se la lettura e gia per
 * chiave unica: e la difesa che resta valida il giorno in cui questa lettura
 * diventasse un `findFirst` su piu candidati.
 */
export const resolvePaymentLink = async (
  token: unknown,
  now: Date = new Date(),
): Promise<PaymentLinkResolution> => {
  const hash = hashPaymentLinkToken(token);
  if (!hash) return { outcome: "not_available" };

  const row = (await linkClient().findUnique({
    where: { token_hash: hash },
  })) as PaymentLinkRow | null;

  if (!row) return { outcome: "not_available" };
  if (!paymentLinkHashesMatch(asText(row.token_hash), hash)) {
    return { outcome: "not_available" };
  }
  if (!isPaymentLinkUsable(row, now)) return { outcome: "not_available" };

  return { outcome: "found", link: row };
};

/**
 * La rata di un link, con il suo registro. Restituisce `null` quando la rata
 * non esiste piu o non appartiene al club del link — che non e un caso
 * teorico: una rata cancellata lascia il link orfano, e un link orfano non
 * deve poter aprire un pagamento.
 */
const readLinkedCharge = async (link: PaymentLinkRow, now: Date) => {
  const charge = await chargeClient().findUnique({
    where: { id: link.payment_id },
  });

  if (!charge) return null;
  if (asText(charge.organization_id) !== asText(link.organization_id)) {
    return null;
  }

  /*
    Il filtro sul club c'e anche se `payment_id` e gia una chiave primaria
    verificata: e la regola del repository (CLAUDE.md §8), e su una superficie
    pubblica costa nulla tenerla.
  */
  const transactions = normalizePaymentTransactions(
    await transactionClient().findMany({
      where: {
        payment_id: link.payment_id,
        organization_id: link.organization_id,
      },
    }),
  );

  return {
    charge,
    ledger: resolveInstallmentLedger({ charge, transactions, now }),
  };
};

/**
 * Segna l'apertura: `use_count`, `last_used_at` e la riga di audit.
 *
 * **Questa riga non ha un attore, ed e proprio la sua ragione d'essere**: e
 * cio che si va a leggere quando una famiglia dice di non aver mai visto il
 * link. L'audit non solleva mai, e l'aggiornamento del contatore nemmeno:
 * perdere il conteggio di un'apertura non deve impedire un pagamento.
 */
const registerPaymentLinkOpen = async (
  link: PaymentLinkRow,
  options: {
    request?: Request;
    now: Date;
    /**
     * `view` = la pagina aperta, `checkout` = il pagamento avviato. L'azione di
     * audit e la stessa perche il fatto e lo stesso — il link e stato usato —
     * ma i due gesti si distinguono nei metadati: senza, «l'ha aperto tre
     * volte» non direbbe se ha anche provato a pagare.
     */
    gesture: "view" | "checkout";
  },
) => {
  try {
    await linkClient().update({
      where: { id: link.id },
      data: { last_used_at: options.now, use_count: { increment: 1 } },
    });
  } catch (error: any) {
    console.warn("[payment-links] contatore di apertura non aggiornato", {
      message: String(error?.message || error),
    });
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.paymentLinkOpened,
    /*
      **Nessun attore, ed e la ragione per cui questa riga esiste**: e cio che
      si va a leggere quando una famiglia dice di non aver mai visto il link.
    */
    organizationId: link.organization_id,
    resource: "payment_links",
    resourceId: link.id,
    request: options.request,
    /*
      Nei metadati non entra il token: l'audit e leggibile dalla console di
      piattaforma, e un token in chiaro li dentro sarebbe un link funzionante
      dato a chi non ne ha bisogno.
    */
    metadata: {
      paymentId: link.payment_id,
      gesture: options.gesture,
      useCount: Number(link.use_count || 0) + 1,
    },
  });
};

/* ---------------------------------------------------------- l'emissione */

/**
 * Emette un link per una rata. Il token in chiaro **esiste solo nel valore di
 * ritorno**: in archivio va la sola impronta.
 */
export const issuePaymentLink = async (input: {
  organizationId?: string | null;
  paymentId: string;
  scope?: PaymentLinkScope;
  actorUserId?: string | null;
  ttlDays?: number | null;
  now?: Date;
  request?: Request;
  entitlement?: PaymentLinkEntitlementPort;
}): Promise<IssuePaymentLinkResult> => {
  const now = input.now || new Date();
  const organizationId = resolveOrganizationId(input.scope, input.organizationId);
  const paymentId = asText(input.paymentId);

  if (!paymentId) {
    throw new Error("Nessuna rata indicata per il link di pagamento");
  }

  const charge = await chargeClient().findUnique({ where: { id: paymentId } });

  if (!charge) {
    throw new Error("Rata non trovata");
  }

  /*
    La rata comanda sul club, come nella rotta autenticata del checkout:
    emettere un link su una rata che non e del club attivo permetterebbe di
    incassare per un'altra societa purche si abbia accesso alla propria.
  */
  if (asText(charge.organization_id) !== organizationId) {
    throw denied("la rata appartiene a un altro club");
  }

  const entitlement = await (
    input.entitlement || defaultPaymentLinkEntitlementPort
  )(organizationId);

  if (!entitlement.allowed) {
    /*
      **Non si emette, e non si solleva.** Il sollecito che chiama questa
      funzione deve poter dire in anteprima «questo club non puo incassare
      online» e mandare comunque il messaggio senza il link, invece di
      fallire e non mandare niente.
    */
    return { outcome: "entitlement_missing", message: entitlement.message };
  }

  const token = generatePaymentLinkToken();
  const ttlDays = normalizePaymentLinkTtlDays(input.ttlDays);
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  const created = await linkClient().create({
    data: {
      organization_id: organizationId,
      payment_id: paymentId,
      athlete_id: charge.athlete_id ? String(charge.athlete_id) : null,
      token_hash: hashPaymentLinkToken(token),
      expires_at: expiresAt,
      created_by: input.actorUserId || input.scope?.userId || null,
    },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.paymentLinkIssued,
    actorUserId: input.actorUserId || input.scope?.userId || null,
    organizationId,
    resource: "payment_links",
    resourceId: String(created.id),
    request: input.request,
    metadata: { paymentId, ttlDays, expiresAt: expiresAt.toISOString() },
  });

  return {
    outcome: "issued",
    linkId: String(created.id),
    token,
    path: buildPaymentLinkPath(token),
    expiresAt: expiresAt.toISOString(),
    paymentId,
    athleteId: charge.athlete_id ? String(charge.athlete_id) : null,
  };
};

/* ------------------------------------------------------- la vista pubblica */

/**
 * Cosa vede chi apre il link, e **nient'altro**.
 *
 * Nome della societa, nome dell'atleta, descrizione della rata, quanto resta
 * **ricalcolato adesso**, la scadenza della rata. Nessun identificativo
 * interno: chi ha il link non ha per questo il diritto di sapere come sono
 * fatte le chiavi dell'archivio di un club.
 *
 * La rata gia saldata risponde `already_settled` e non e un errore: e il caso
 * piu frequente in assoluto, ed e una buona notizia da dare.
 */
export const readPaymentLinkPublicView = async (
  token: unknown,
  options: {
    now?: Date;
    request?: Request;
    /** Falso nei soli casi in cui si guarda senza aprire (test, anteprime). */
    track?: boolean;
    entitlement?: PaymentLinkEntitlementPort;
  } = {},
): Promise<PaymentLinkPublicView> => {
  const now = options.now || new Date();
  const unavailable = {
    status: "not_available" as const,
    message: PAYMENT_LINK_NOT_AVAILABLE_MESSAGE,
  };

  const resolution = await resolvePaymentLink(token, now);
  if (resolution.outcome !== "found") return unavailable;

  const link = resolution.link;
  const linked = await readLinkedCharge(link, now);
  if (!linked) return unavailable;

  /*
    L'entitlement si controlla **anche in lettura**, non solo al checkout: un
    club che ha perso `online_payments` dopo l'emissione mostrerebbe altrimenti
    una pagina con un pulsante che non puo funzionare. Meglio la stessa
    risposta di un link scaduto — che e vera — di una promessa che si rompe al
    clic.
  */
  const entitlement = await (
    options.entitlement || defaultPaymentLinkEntitlementPort
  )(link.organization_id);

  if (!entitlement.allowed) return unavailable;

  const [club, athlete] = await Promise.all([
    clubClient().findUnique({ where: { id: link.organization_id } }),
    link.athlete_id
      ? athleteClient().findUnique({ where: { id: link.athlete_id } })
      : Promise.resolve(null),
  ]);

  if (options.track !== false) {
    await registerPaymentLinkOpen(link, {
      request: options.request,
      now,
      gesture: "view",
    });
  }

  const residualCents = toCents(linked.ledger.residualAmount);

  return {
    status: residualCents > 0 ? "payable" : "already_settled",
    clubName: asText(club?.name) || "La tua societa",
    clubLogoUrl: asText(club?.logo_url),
    clubContactEmail: asText(club?.contact_email),
    athleteName:
      [athlete?.first_name, athlete?.last_name]
        .map((value) => asText(value))
        .filter(Boolean)
        .join(" ") || "",
    description: asText(linked.charge.description) || "Quota sportiva",
    dueDate: toIsoOrNull(linked.charge.due_date),
    residualAmount: linked.ledger.residualAmount,
    residualCents,
    dueAmount: linked.ledger.dueAmount,
    paidAmount: linked.ledger.paidAmount,
    linkExpiresAt: new Date(link.expires_at).toISOString(),
  };
};

/* ----------------------------------------------------------- il riscatto */

/**
 * Apre il checkout per il residuo della rata.
 *
 * **Lo stesso checkout della rotta autenticata**, con `actorUserId: null`
 * perche qui non c'e nessun attore: c'e una famiglia che ha ricevuto un link.
 * La chiave di idempotenza, la commissione e il webhook che registra l'incasso
 * sono quelli di sempre — un secondo percorso del denaro sarebbe un secondo
 * registro di cassa.
 *
 * `successUrl` e `cancelUrl` li costruisce il chiamante **dal server**: se
 * arrivassero dal client, il link diventerebbe un redirector aperto.
 */
export const openPaymentLinkCheckout = async (input: {
  token: unknown;
  successUrl: string;
  cancelUrl: string;
  now?: Date;
  request?: Request;
  entitlement?: PaymentLinkEntitlementPort;
  checkout?: PaymentLinkCheckoutPort;
}): Promise<OpenPaymentLinkCheckoutResult> => {
  const now = input.now || new Date();
  const unavailable = {
    status: "not_available" as const,
    message: PAYMENT_LINK_NOT_AVAILABLE_MESSAGE,
  };

  const successUrl = asText(input.successUrl);
  const cancelUrl = asText(input.cancelUrl);
  if (!successUrl || !cancelUrl) {
    throw new Error("URL di ritorno mancanti: li costruisce il server");
  }

  const resolution = await resolvePaymentLink(input.token, now);
  if (resolution.outcome !== "found") return unavailable;

  const link = resolution.link;
  const linked = await readLinkedCharge(link, now);
  if (!linked) return unavailable;

  const entitlement = await (
    input.entitlement || defaultPaymentLinkEntitlementPort
  )(link.organization_id);

  if (!entitlement.allowed) return unavailable;

  const residualCents = toCents(linked.ledger.residualAmount);

  if (residualCents <= 0) {
    /*
      **Non un errore.** Una rata gia saldata e la risposta piu frequente che
      questa funzione dara, e chi apre il link ha diritto di leggere «e gia
      tutto pagato» invece di una schermata rossa.
    */
    return {
      status: "already_settled",
      message: "Questa rata risulta gia saldata: non c'e niente da pagare.",
    };
  }

  const { checkout, context } = await (input.checkout || openGatewayCheckout)({
    organizationId: link.organization_id,
    paymentId: link.payment_id,
    athleteId: link.athlete_id,
    /*
      Il residuo **di adesso**, mai un importo congelato nel link: chi ha gia
      versato un acconto allo sportello paga solo cio che manca.
    */
    amountCents: residualCents,
    description: asText(linked.charge.description) || "Quota sportiva",
    successUrl,
    cancelUrl,
    /* Nessun attore: il gesto e di chi ha il link, non di un utente. */
    actorUserId: null,
  });

  await registerPaymentLinkOpen(link, {
    request: input.request,
    now,
    gesture: "checkout",
  });

  return {
    status: "ready",
    checkoutUrl: String(checkout.url || ""),
    amountCents: Number(checkout.money?.amountCents || residualCents),
    provider: String(context.provider),
  };
};

/* ------------------------------------------------------------- la revoca */

/**
 * Spegne un link. **Non lo cancella**: la riga resta, perche e anche la prova
 * di averlo emesso e il registro delle sue aperture.
 */
export const revokePaymentLink = async (input: {
  organizationId?: string | null;
  linkId: string;
  scope?: PaymentLinkScope;
  actorUserId?: string | null;
  now?: Date;
  request?: Request;
}): Promise<RevokePaymentLinkResult> => {
  const now = input.now || new Date();
  const organizationId = resolveOrganizationId(input.scope, input.organizationId);
  const linkId = asText(input.linkId);

  if (!linkId) throw new Error("Nessun link indicato");

  const row = (await linkClient().findUnique({
    where: { id: linkId },
  })) as PaymentLinkRow | null;

  /*
    Link inesistente e link di un altro club rispondono la stessa cosa, anche
    qui: chi e gestore di un club non deve poter scoprire, per tentativi, gli
    identificativi dei link di un altro.
  */
  if (!row || asText(row.organization_id) !== organizationId) {
    throw denied("il link non appartiene al club attivo");
  }

  if (row.revoked_at) {
    return {
      linkId,
      revokedAt: new Date(row.revoked_at).toISOString(),
      alreadyRevoked: true,
    };
  }

  await linkClient().update({
    where: { id: linkId },
    data: { revoked_at: now },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.paymentLinkRevoked,
    actorUserId: input.actorUserId || input.scope?.userId || null,
    organizationId,
    resource: "payment_links",
    resourceId: linkId,
    request: input.request,
    metadata: { paymentId: row.payment_id, useCount: row.use_count },
  });

  return { linkId, revokedAt: now.toISOString(), alreadyRevoked: false };
};
