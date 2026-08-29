import { prisma } from "./prisma";
import {
  assertAccountingPermission,
  hasAccountingPermission,
} from "@/lib/accounting/permissions";
import {
  deriveAccountBalanceCents,
  isFinancialAccountKind,
  toCents,
  FINANCIAL_ACCOUNT_KIND_LABELS,
  type BalanceContribution,
  type FinancialAccountKind,
} from "@/lib/accounting/model";
import { buildSiteIndex, normalizeClubSites } from "@/lib/club-sites";

/**
 * I **conti finanziari** di una societa: dove il denaro sta, e quanto ce n'e.
 * **Unico proprietario** della tabella `financial_accounts`.
 *
 * ---
 *
 * ## Il difetto che questo modulo chiude
 *
 * Prima della Wave 4 i conti erano un blob JSON dentro `clubs.bank_accounts`,
 * e il saldo era una colonna di quel blob — `current_balance` — **mutata a
 * mano dal browser** con una seconda chiamata HTTP non transazionale. Le
 * conseguenze erano tre, e tutte osservabili:
 *
 * 1. un incasso registrato dalla scheda atleta o dal webhook del PSP **non
 *    toccava nessun saldo**: nessuno aveva scritto la seconda chiamata;
 * 2. se la scrittura del movimento riusciva e quella del saldo falliva, i due
 *    restavano disallineati **per sempre**, e nessuna funzione sapeva
 *    ricostruire il numero giusto;
 * 3. due persone in contemporanea: l'ultima vinceva, e il saldo dell'altra
 *    spariva senza errore.
 *
 * ## La regola, e la sua conseguenza
 *
 * > **Il saldo non e una colonna. E la somma dei movimenti.**
 *
 * E la disciplina di ADR-0036 — lo stato di una rata non si imposta, si ricava
 * — applicata al conto. Qui non esiste nessuna funzione che scriva un saldo,
 * perche non esiste un saldo da scrivere: `getFinancialAccountBalance` lo
 * **calcola**, ogni volta, da quattro sorgenti che restano dei loro
 * proprietari.
 *
 * Il saldo di apertura e l'unica eccezione, ed e onesta: e il numero che il
 * vecchio blob dichiarava il giorno del travaso, e i movimenti che l'hanno
 * prodotto nessuno puo ricostruirli. Si conserva come **punto di partenza**,
 * non come saldo mutabile.
 *
 * ## Le quattro sorgenti, e perche non si copiano qui
 *
 * | Sorgente | Chi la possiede | Verso |
 * |---|---|---|
 * | `accounting_entries` | `src/lib/server/accounting.ts` | IN e OUT |
 * | `payment_transactions` | `src/lib/server/payment-transactions.ts` | IN (i rimborsi sono righe negative) |
 * | `sport_work_outbound_transactions` | `src/lib/server/sport-work-ledger.ts` | OUT |
 * | `funding_settlements` | `src/lib/server/funding.ts` | IN |
 *
 * Materializzare qui una copia di quelle righe sarebbe la seconda contabilita
 * che il committente ha vietato: due fonti per lo stesso numero, e nessun modo
 * di tenerle allineate. Si sommano dove sono.
 *
 * ## Perche l'aggregazione la fa il database
 *
 * La soglia del piano per il saldo di un conto e **200 ms** (§38), e un
 * `findMany` di tutte le righe la sfonda al primo club con duemila incassi —
 * peggiorando **con l'uso**, che e la forma di lentezza peggiore perche
 * arriva quando il cliente e gia dentro. Ogni sorgente si legge con un
 * `groupBy` e una somma: quattro interrogazioni in parallelo, indipendenti dal
 * numero di movimenti, che tornano al piu una riga per conto e per verso.
 *
 * ## Un conto non si cancella
 *
 * Non c'e nessuna `delete` in questo modulo, e non e una dimenticanza. Un
 * conto e citato dai movimenti che ci sono passati: cancellarlo o li porta via
 * con se, o li lascia a puntare al nulla. Si **archivia** — sparisce dagli
 * elenchi in cui si sceglie un conto, resta leggibile su tutto cio che lo
 * cita. E la stessa scelta gia presa per i modelli di documento (ADR-0088) e
 * per le causali di sistema.
 */

/* ========================================================================== */
/* Il perimetro                                                                */
/* ========================================================================== */

export type FinancialAccountScope = {
  userId: string;
  activeOrganizationId: string | null;
  activeRole?: string | null;
  allowedOrganizationIds: string[];
};

/**
 * **Vedere quanto c'e su un conto.**
 *
 * Sta nello stesso recinto degli estremi bancari, che il prodotto riserva da
 * sempre a proprietario e gestore.
 */
const PERMESSO_SALDI = "accounting.accounts_read" as const;

/**
 * **Aprire, rinominare, archiviare un conto.**
 *
 * Oggi ha esattamente gli stessi ruoli di `PERMESSO_SALDI`, e la distinzione
 * non e simmetria per gusto: usare il permesso di **lettura** come gate di una
 * **scrittura** funziona finche i due perimetri coincidono, e dice la cosa
 * sbagliata a chi legge il codice. E il modo in cui un permesso finisce
 * allargato per distrazione il giorno in cui la lettura viene concessa a
 * qualcuno in piu.
 *
 * Il permesso e stato aggiunto alla barriera su richiesta di questa lane, non
 * inventato qui: il catalogo appartiene alla barriera, e una lane che se lo
 * scrive da sola e il modo in cui una matrice si sfilaccia.
 */
const PERMESSO_GESTIONE_CONTI = "accounting.accounts_manage" as const;

/**
 * Il permesso minimo per **vedere l'elenco dei conti senza i saldi**.
 *
 * Non e una scorciatoia: un movimento deve dire su quale conto il denaro si e
 * mosso, e registrarlo e lavoro di segreteria (§30 del piano). Chi registra
 * deve poter scegliere il conto dall'elenco; **quanto c'e dentro** e un'altra
 * domanda, e ha un altro permesso. Un elenco negato alla segreteria avrebbe
 * prodotto una prima nota inutilizzabile da chi la usa tutti i giorni.
 */
const PERMESSO_ELENCO = "accounting.read" as const;

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const accountClient = () => (prisma as any).financialAccount;

const ensureOrganizationAccess = (
  scope: FinancialAccountScope,
  organizationId: string | null | undefined,
) => {
  if (!organizationId) throw denied("conto senza club");
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("il conto appartiene a un altro club");
  }
};

const resolveOrganizationId = (
  scope: FinancialAccountScope,
  requested?: string | null,
) => {
  const wanted = asText(requested);
  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }
  if (scope.activeOrganizationId) return scope.activeOrganizationId;
  throw denied("nessun club attivo selezionato");
};

const toDateOrNull = (value: unknown) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = asText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoOrNull = (value: unknown) => toDateOrNull(value)?.toISOString() || null;

/* ========================================================================== */
/* La forma del conto                                                          */
/* ========================================================================== */

export type FinancialAccountBalance = {
  accountId: string;
  /** Il punto di partenza: cio che il vecchio blob dichiarava al travaso. */
  openingBalanceCents: number;
  openingBalanceAt: string | null;
  /** Prima nota: movimenti manuali e gambe di giroconto, storni esclusi. */
  entriesCents: number;
  /** Incassi delle famiglie, dei soci e degli sponsor. I rimborsi sono negativi. */
  paymentsCents: number;
  /** Denaro uscito verso i lavoratori sportivi. Positivo: e gia un'uscita. */
  sportWorkCents: number;
  /** Bonifici degli enti a chiusura dei contributi. */
  fundingCents: number;
  /** La somma di tutto, ed e l'unico numero che il prodotto chiama «saldo». */
  balanceCents: number;
};

export type FinancialAccountRecord = {
  id: string;
  organizationId: string;
  name: string;
  kind: FinancialAccountKind;
  kindLabel: string;
  iban: string | null;
  bankName: string | null;
  siteId: string | null;
  openingBalanceCents: number;
  openingBalanceAt: string | null;
  legacyAccountId: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Presente solo per chi ha `accounting.accounts_read`. Mai `0` per difetto. */
  balance: FinancialAccountBalance | null;
};

const normalizeKind = (value: unknown): FinancialAccountKind =>
  isFinancialAccountKind(value)
    ? (String(value).trim().toUpperCase() as FinancialAccountKind)
    : "BANK";

const toRecord = (
  row: any,
  balance: FinancialAccountBalance | null = null,
): FinancialAccountRecord => {
  const kind = normalizeKind(row.kind);

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: asText(row.name),
    kind,
    kindLabel: FINANCIAL_ACCOUNT_KIND_LABELS[kind],
    iban: asText(row.iban) || null,
    bankName: asText(row.bank_name) || null,
    siteId: asText(row.site_id) || null,
    openingBalanceCents: Number(row.opening_balance_cents) || 0,
    openingBalanceAt: toIsoOrNull(row.opening_balance_at),
    legacyAccountId: asText(row.legacy_account_id) || null,
    isArchived: Boolean(row.is_archived),
    archivedAt: toIsoOrNull(row.archived_at),
    notes: asText(row.notes) || null,
    createdAt: toIsoOrNull(row.created_at),
    updatedAt: toIsoOrNull(row.updated_at),
    balance,
  };
};

/* ========================================================================== */
/* Il saldo, derivato                                                          */
/* ========================================================================== */

const sommaCentesimi = (value: unknown) => Number(value) || 0;

/** Da euro in virgola mobile a centesimi interi, tollerando la somma vuota. */
const euroInCentesimi = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? toCents(parsed) : 0;
};

const indicizza = (
  righe: any[],
  leggi: (row: any) => number,
): Map<string, number> => {
  const totali = new Map<string, number>();
  for (const riga of righe) {
    const key = asText(riga.financial_account_id);
    if (!key) continue;
    totali.set(key, (totali.get(key) || 0) + leggi(riga));
  }
  return totali;
};

/**
 * I saldi di piu conti, in quattro interrogazioni **in tutto**.
 *
 * **Perche una sola chiamata per tutti i conti e non una per conto.** Un club
 * ha cassa, banca e transito: tre conti diventerebbero dodici interrogazioni
 * per disegnare una pagina che ne mostra tre numeri. Il `groupBy` le riduce a
 * quattro qualunque sia il numero di conti.
 *
 * **Cosa esce dalla somma, e perche esce due volte.** Da ogni sorgente si
 * escludono sia le righe **stornate** sia gli **storni**: una coppia
 * originale/storno somma zero, e lasciarli dentro darebbe lo stesso numero con
 * due righe in piu da spiegare. Nel lavoro sportivo lo storno porta un importo
 * **negativo** — la somma algebrica sarebbe gia corretta anche tenendoli — ma
 * la regola resta la stessa per tutte e quattro: quattro criteri diversi per
 * la stessa idea sono quattro occasioni di sbagliarne uno.
 *
 * **Il rimborso non e uno storno**, e resta dentro: e denaro davvero tornato
 * alla famiglia, registrato come riga negativa **senza**
 * `reverses_transaction_id`. Escluderlo direbbe che in cassa c'e denaro che
 * non c'e piu.
 */
export const listFinancialAccountBalances = async (
  scope: FinancialAccountScope,
  options: {
    organizationId?: string | null;
    accountIds?: readonly string[] | null;
  } = {},
): Promise<FinancialAccountBalance[]> => {
  const organizationId = resolveOrganizationId(scope, options.organizationId);
  assertAccountingPermission(scope.activeRole, PERMESSO_SALDI);

  const conti = await accountClient().findMany({
    where: {
      organization_id: organizationId,
      ...(options.accountIds?.length
        ? { id: { in: [...options.accountIds] } }
        : {}),
    },
    select: {
      id: true,
      opening_balance_cents: true,
      opening_balance_at: true,
    },
  });

  const ids: string[] = conti.map((conto: any) => String(conto.id));
  if (!ids.length) return [];

  const perimetro = { organization_id: organizationId, financial_account_id: { in: ids } };

  const [movimenti, incassi, uscite, liquidazioni] = await Promise.all([
    (prisma as any).accountingEntry.groupBy({
      by: ["financial_account_id", "direction"],
      where: { ...perimetro, reversed_at: null, reversal_of_id: null },
      _sum: { amount_cents: true },
    }),
    (prisma as any).paymentTransaction.groupBy({
      by: ["financial_account_id"],
      where: { ...perimetro, reversed_at: null, reverses_transaction_id: null },
      _sum: { amount: true },
    }),
    (prisma as any).sportWorkOutboundTransaction.groupBy({
      by: ["financial_account_id"],
      where: { ...perimetro, reversed_at: null, reversal_of_id: null },
      /*
        `net_amount` e non `gross_amount`: dal conto del club verso la persona
        esce il netto. Contributo del lavoratore e contributo del club escono
        anche loro, ma verso l'erario e in un altro giorno — sono un versamento
        F24, che e un movimento proprio. Sommare il lordo qui farebbe uscire
        due volte la stessa parte di denaro.
      */
      _sum: { net_amount: true },
    }),
    (prisma as any).fundingSettlement.groupBy({
      by: ["financial_account_id"],
      where: { ...perimetro, reversed_at: null, reversal_of_id: null },
      _sum: { amount: true },
    }),
  ]);

  const entrateDiPrimaNota = indicizza(
    (movimenti as any[]).filter((riga) => riga.direction === "IN"),
    (riga) => sommaCentesimi(riga._sum?.amount_cents),
  );
  const usciteDiPrimaNota = indicizza(
    (movimenti as any[]).filter((riga) => riga.direction === "OUT"),
    (riga) => sommaCentesimi(riga._sum?.amount_cents),
  );
  const incassiPerConto = indicizza(incassi as any[], (riga) =>
    euroInCentesimi(riga._sum?.amount),
  );
  const uscitePerConto = indicizza(uscite as any[], (riga) =>
    euroInCentesimi(riga._sum?.net_amount),
  );
  const liquidazioniPerConto = indicizza(liquidazioni as any[], (riga) =>
    euroInCentesimi(riga._sum?.amount),
  );

  return conti.map((conto: any) => {
    const id = String(conto.id);
    const openingBalanceCents = Number(conto.opening_balance_cents) || 0;
    const entriesInCents = entrateDiPrimaNota.get(id) || 0;
    const entriesOutCents = usciteDiPrimaNota.get(id) || 0;
    const paymentsCents = incassiPerConto.get(id) || 0;
    const sportWorkCents = uscitePerConto.get(id) || 0;
    const fundingCents = liquidazioniPerConto.get(id) || 0;

    /*
      Il conto finale lo fa `deriveAccountBalanceCents`, che sta nella
      barriera, e non una somma scritta qui. Le aggregazioni sono gia sommate:
      quel che resta e **applicare il verso**, ed e esattamente la regola che
      quella funzione custodisce. Riscriverla qui vorrebbe dire due posti in
      cui il segno di un'uscita puo sbagliarsi.
    */
    const contributi: BalanceContribution[] = [
      { direction: "IN", amountCents: entriesInCents },
      { direction: "OUT", amountCents: entriesOutCents },
      { direction: "IN", amountCents: paymentsCents },
      { direction: "OUT", amountCents: sportWorkCents },
      { direction: "IN", amountCents: fundingCents },
    ];

    return {
      accountId: id,
      openingBalanceCents,
      openingBalanceAt: toIsoOrNull(conto.opening_balance_at),
      entriesCents: entriesInCents - entriesOutCents,
      paymentsCents,
      sportWorkCents,
      fundingCents,
      balanceCents: deriveAccountBalanceCents(openingBalanceCents, contributi),
    };
  });
};

/** Il saldo di un conto solo. */
export const getFinancialAccountBalance = async (
  accountId: string,
  scope: FinancialAccountScope,
): Promise<FinancialAccountBalance> => {
  const row = await leggiConto(accountId, scope);
  const [balance] = await listFinancialAccountBalances(scope, {
    organizationId: row.organization_id,
    accountIds: [String(row.id)],
  });

  if (!balance) throw new Error("Conto non trovato");
  return balance;
};

/* ========================================================================== */
/* Lettura                                                                     */
/* ========================================================================== */

const leggiConto = async (accountId: string, scope: FinancialAccountScope) => {
  const id = asText(accountId);
  if (!id) throw new Error("Conto non trovato");

  const row = await accountClient().findUnique({ where: { id } });
  /*
    Stessa risposta per «non esiste» e per «non e tuo»: distinguerle direbbe a
    chi prova un identificativo a caso che quel conto esiste da qualche parte.
  */
  if (!row) throw new Error("Conto non trovato");
  ensureOrganizationAccess(scope, String(row.organization_id));

  return row;
};

/**
 * I conti di una societa.
 *
 * **I saldi sono facoltativi, e non per prestazione.** L'elenco serve a due
 * lettori diversi: chi registra un movimento, che deve solo scegliere dove il
 * denaro si e mosso, e chi tiene i conti, che vuole sapere quanto c'e. Il
 * primo ha `accounting.read`, il secondo `accounting.accounts_read`. Chiedere
 * i saldi senza averne il diritto e un errore esplicito, e non un elenco con i
 * saldi a zero: un saldo a zero e un numero, e un numero sbagliato mostrato al
 * posto di un diniego e il difetto che la Wave 3 ha misurato su `/movements`.
 */
export const listFinancialAccounts = async (
  scope: FinancialAccountScope,
  options: {
    organizationId?: string | null;
    includeArchived?: boolean;
    withBalances?: boolean;
  } = {},
): Promise<FinancialAccountRecord[]> => {
  const organizationId = resolveOrganizationId(scope, options.organizationId);
  assertAccountingPermission(scope.activeRole, PERMESSO_ELENCO);

  if (options.withBalances) {
    assertAccountingPermission(scope.activeRole, PERMESSO_SALDI);
  }

  const rows = await accountClient().findMany({
    where: {
      organization_id: organizationId,
      ...(options.includeArchived ? {} : { is_archived: false }),
    },
    orderBy: [{ is_archived: "asc" }, { name: "asc" }],
  });

  if (!options.withBalances || !rows.length) {
    return rows.map((row: any) => toRecord(row));
  }

  const saldi = await listFinancialAccountBalances(scope, {
    organizationId,
    accountIds: rows.map((row: any) => String(row.id)),
  });
  const perConto = new Map(saldi.map((saldo) => [saldo.accountId, saldo]));

  return rows.map((row: any) => toRecord(row, perConto.get(String(row.id)) || null));
};

/** Un conto solo, senza saldo. Chi vuole il saldo lo chiede a parte. */
export const getFinancialAccountById = async (
  accountId: string,
  scope: FinancialAccountScope,
): Promise<FinancialAccountRecord> => {
  assertAccountingPermission(scope.activeRole, PERMESSO_ELENCO);
  return toRecord(await leggiConto(accountId, scope));
};

/* ========================================================================== */
/* Scrittura                                                                   */
/* ========================================================================== */

export type FinancialAccountInput = {
  name?: unknown;
  kind?: unknown;
  iban?: unknown;
  bankName?: unknown;
  siteId?: unknown;
  notes?: unknown;
  /** In euro. Alternativo a `openingBalanceCents`, mai insieme. */
  openingBalance?: unknown;
  openingBalanceCents?: unknown;
  openingBalanceAt?: unknown;
  organizationId?: string | null;
};

/**
 * La sede di un conto, quando il club ne ha piu di una.
 *
 * **Facoltativa, e mai dedotta.** Un conto senza sede appartiene a **tutte**
 * le sedi, non a nessuna: e la regola di ADR-0038, e vale qui come per gli
 * atleti e le strutture. Cio che si verifica e solo che una sede indicata
 * esista davvero — un riferimento a una sede cancellata sarebbe un filtro che
 * un giorno fa sparire il conto da ogni elenco.
 */
const risolviSede = async (organizationId: string, riferimento: unknown) => {
  const wanted = asText(riferimento);
  if (!wanted) return null;

  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { club_sites: true },
  });

  const sedi = normalizeClubSites(club?.club_sites);
  if (!sedi.length) {
    throw new Error(
      "Il club non ha sedi configurate: un conto non puo essere attribuito a una sede che non esiste",
    );
  }

  const indice = buildSiteIndex(sedi);
  const risolta = indice.resolveSiteId(wanted);
  if (!sedi.some((sede) => sede.id === risolta)) {
    throw new Error("La sede indicata per il conto non esiste");
  }

  return risolta;
};

const leggiAperturaInCentesimi = (input: FinancialAccountInput) => {
  if (
    input.openingBalanceCents !== undefined &&
    input.openingBalanceCents !== null &&
    input.openingBalanceCents !== ""
  ) {
    const cents = Number(input.openingBalanceCents);
    if (!Number.isInteger(cents)) {
      throw new Error("Il saldo di apertura in centesimi deve essere un intero");
    }
    return cents;
  }

  if (
    input.openingBalance !== undefined &&
    input.openingBalance !== null &&
    input.openingBalance !== ""
  ) {
    return toCents(input.openingBalance as any);
  }

  return 0;
};

/**
 * Apre un conto.
 *
 * **Il nome e unico per club**, e lo difende un indice: due conti «Banca» sono
 * il modo piu rapido di far scegliere il conto sbagliato a chi registra.
 * L'errore del database si traduce in una frase, perche chi lo legge sta
 * compilando un modulo, non una query.
 */
export const createFinancialAccount = async (
  input: FinancialAccountInput,
  scope: FinancialAccountScope,
): Promise<FinancialAccountRecord> => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);
  assertAccountingPermission(scope.activeRole, PERMESSO_GESTIONE_CONTI);

  const name = asText(input.name);
  if (!name) {
    throw new Error("Un conto senza nome non e riconoscibile in nessun elenco");
  }

  if (input.kind !== undefined && input.kind !== null && input.kind !== "") {
    if (!isFinancialAccountKind(input.kind)) {
      throw new Error(
        "Il tipo di conto puo essere solo cassa, banca o transito (CASH, BANK, CLEARING)",
      );
    }
  }

  const siteId = await risolviSede(organizationId, input.siteId);
  const openingBalanceCents = leggiAperturaInCentesimi(input);

  const gemello = await accountClient().findFirst({
    where: { organization_id: organizationId, name },
    select: { id: true },
  });
  if (gemello) {
    throw new Error(`Esiste gia un conto che si chiama «${name}»`);
  }

  const row = await accountClient().create({
    data: {
      organization_id: organizationId,
      name,
      kind: normalizeKind(input.kind),
      iban: asText(input.iban) || null,
      bank_name: asText(input.bankName) || null,
      site_id: siteId,
      opening_balance_cents: openingBalanceCents,
      /*
        La data dell'apertura serve a spiegare da quando il saldo e quello: un
        saldo di apertura senza data non si sa a cosa si riferisca. Se non
        arriva, la data e oggi solo quando l'apertura non e zero — un conto che
        nasce vuoto non ha niente da datare.
      */
      opening_balance_at:
        toDateOrNull(input.openingBalanceAt) ||
        (openingBalanceCents !== 0 ? new Date() : null),
      notes: asText(input.notes) || null,
      created_by: asText(scope.userId) || null,
    },
  });

  return toRecord(row);
};

/**
 * Rinomina un conto, e ne corregge gli estremi.
 *
 * **Il tipo e il saldo di apertura non si toccano da qui**, e non e una
 * dimenticanza. Il tipo dice la natura di tutti i movimenti gia registrati: un
 * conto di cassa che diventa banca riscrive retroattivamente cio che quei
 * movimenti significavano. Il saldo di apertura e il punto di partenza della
 * somma: cambiarlo sposta l'intera storia del conto di una cifra, senza che
 * nessun movimento lo spieghi. In entrambi i casi la strada e archiviare
 * questo conto e aprirne un altro, che lascia una traccia leggibile.
 */
export const renameFinancialAccount = async (
  accountId: string,
  updates: Omit<
    FinancialAccountInput,
    "kind" | "openingBalance" | "openingBalanceCents" | "openingBalanceAt"
  >,
  scope: FinancialAccountScope,
): Promise<FinancialAccountRecord> => {
  assertAccountingPermission(scope.activeRole, PERMESSO_GESTIONE_CONTI);
  const existing = await leggiConto(accountId, scope);
  const organizationId = String(existing.organization_id);

  const data: Record<string, unknown> = {};

  if (updates.name !== undefined) {
    const name = asText(updates.name);
    if (!name) {
      throw new Error("Un conto senza nome non e riconoscibile in nessun elenco");
    }
    if (name !== asText(existing.name)) {
      const gemello = await accountClient().findFirst({
        where: { organization_id: organizationId, name },
        select: { id: true },
      });
      if (gemello) {
        throw new Error(`Esiste gia un conto che si chiama «${name}»`);
      }
    }
    data.name = name;
  }

  if (updates.iban !== undefined) data.iban = asText(updates.iban) || null;
  if (updates.bankName !== undefined) {
    data.bank_name = asText(updates.bankName) || null;
  }
  if (updates.notes !== undefined) data.notes = asText(updates.notes) || null;
  if (updates.siteId !== undefined) {
    data.site_id = await risolviSede(organizationId, updates.siteId);
  }

  if (!Object.keys(data).length) return toRecord(existing);

  const row = await accountClient().update({
    where: { id: String(existing.id) },
    data,
  });

  return toRecord(row);
};

/**
 * Archivia un conto, o lo riapre.
 *
 * **E la sola alternativa alla cancellazione, e la sostituisce interamente.**
 * Un conto chiuso in banca ha comunque ospitato tre anni di movimenti: quelli
 * devono continuare a dire dove sono passati. Un conto archiviato sparisce
 * dagli elenchi in cui si sceglie dove registrare, e resta ovunque sia gia
 * citato.
 *
 * Non si controlla se il conto ha movimenti, perche la risposta non
 * cambierebbe niente: **anche un conto vuoto si archivia**, per non avere due
 * gesti diversi a seconda di un conteggio che l'utente non vede.
 */
export const archiveFinancialAccount = async (
  accountId: string,
  scope: FinancialAccountScope,
  options: { archived?: boolean } = {},
): Promise<FinancialAccountRecord> => {
  assertAccountingPermission(scope.activeRole, PERMESSO_GESTIONE_CONTI);
  const existing = await leggiConto(accountId, scope);

  const archived = options.archived === undefined ? true : Boolean(options.archived);

  const row = await accountClient().update({
    where: { id: String(existing.id) },
    data: {
      is_archived: archived,
      archived_at: archived ? new Date() : null,
    },
  });

  return toRecord(row);
};

/**
 * Vero se il ruolo puo vedere i saldi.
 *
 * Serve alle superfici per **non mostrare una colonna che poi risponde 403**:
 * la matrice della pagina e quella della rotta devono essere la stessa, ed e
 * la lezione W3-14 che il piano cita al §30.
 */
export const canReadAccountBalances = (role: string | null | undefined) =>
  hasAccountingPermission(role, PERMESSO_SALDI);
