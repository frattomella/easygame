/**
 * Il **rimborso di un incasso online**, come EasyGame lo ragiona.
 *
 * **Cosa aggiunge questo modulo a cio che esisteva.** Il gateway sapeva gia
 * rimborsare (`PaymentGateway.refund`) e il registro sapeva gia registrare un
 * rimborso arrivato da un evento firmato (`recordRefundTransaction`). Quel che
 * mancava era il pezzo in mezzo: **nessuna superficie di EasyGame avviava un
 * rimborso**. Il club doveva entrare nel cruscotto Stripe, trovare il
 * pagamento, rimborsarlo li — e sperare che il webhook tornasse indietro.
 * Chiudere il giro dentro EasyGame vuol dire poter dire *prima del clic* cosa
 * si puo rimborsare, quanto, e cosa succedera alla rata.
 *
 * **La regola che questo modulo esiste per rendere vera: un rimborso si
 * riferisce a un incasso, non a una rata.** Una rata da 130 € pagata con due
 * incassi — 50 e 80 — non ha «130 € rimborsabili»: ha due movimenti, ciascuno
 * con il proprio pagamento presso il PSP e il proprio residuo rimborsabile.
 * Rimborsare 30 € «della rata» costringerebbe a scegliere da quale dei due
 * prenderli, e qualunque scelta sarebbe arbitraria — e sbagliata sul cruscotto
 * di Stripe, dove i due addebiti restano distinti.
 *
 *     Rata 130 = incasso A (50) + incasso B (80)
 *     rimborso di 30 su B → A resta 50, B vale 50, la rata ha incassato 100
 *
 * **Perche il rimborsabile si calcola qui e non si chiede al provider.** Perche
 * serve a **disegnare l'interfaccia**, e un'interfaccia che per accendere un
 * pulsante deve fare una chiamata di rete per riga e un'interfaccia che non si
 * apre quando il PSP e lento. Il registro sa gia tutto: l'incasso e i rimborsi
 * che ne discendono sono righe della stessa rata. Il provider resta l'autorita
 * su cio che accetta, e la sua parola arriva dal webhook.
 *
 * Modulo **puro**: nessun database, nessuna rete, nessuna sessione.
 */

import { reverseSettlement, type FrozenSettlement } from "./commission";
import {
  buildStatusLabels,
  isSettledTransaction,
  resolveLedgerState,
  sortTransactionsChronologically,
  toPaymentAmount,
  type InstallmentLedger,
  type InstallmentLedgerState,
  type NormalizedPaymentTransaction,
} from "./installment-ledger";

const toCents = (value: unknown) => Math.round(toPaymentAmount(value) * 100);

const asText = (value: unknown) => String(value ?? "").trim();

/* -------------------------------------------- riconoscere i due movimenti */

/**
 * Vero se questo movimento e un **rimborso**, e non uno storno.
 *
 * Il segno non basta a distinguerli: sono entrambi negativi. Uno storno porta
 * `reversesTransactionId` — che lo esclude dai totali — e un rimborso no,
 * perche un rimborso conta. Il legame con l'incasso originale sta in `data`,
 * scritto da `recordRefundTransaction`.
 */
export const isRefundTransaction = (
  transaction: NormalizedPaymentTransaction,
) =>
  asText(transaction?.data?.kind) === "refund" &&
  !transaction?.reversesTransactionId;

/** I rimborsi gia registrati su un incasso, dal piu vecchio al piu recente. */
export const refundsOfTransaction = (
  original: NormalizedPaymentTransaction,
  transactions: NormalizedPaymentTransaction[] = [],
) =>
  sortTransactionsChronologically(
    transactions.filter(
      (entry) =>
        isRefundTransaction(entry) &&
        asText(entry.data?.refundOfTransactionId) === original.id,
    ),
  );

/* ------------------------------------------- il rimborso gia chiesto e non
                                                ancora confermato */

/**
 * Una richiesta di rimborso **partita** e non ancora confermata dal provider.
 *
 * **Perche esiste, invece di scrivere subito il movimento.** Perche la
 * risposta HTTP di Stripe non e il registro: un rimborso puo nascere
 * `pending`, e su alcuni metodi di pagamento ci resta per giorni. Scrivere il
 * movimento sulla risposta vorrebbe dire raccontare alla famiglia che i soldi
 * sono tornati mentre sono ancora in viaggio — e doverlo disdire se il rimborso
 * fallisce. Il ledger definitivo lo scrive il webhook, come per gli incassi.
 *
 * Quel che serve nel frattempo e sapere che **una richiesta e in volo**, per
 * dirlo e per non lasciarne partire una seconda. Si annota sull'incasso
 * originale, in `data.refundRequests`, e sparisce da sola quando il movimento
 * corrispondente compare nel registro: nessuno stato da tenere allineato a
 * mano. E la stessa meccanica del «pagamento in verifica».
 */
export type RefundRequestNote = {
  externalRefundId: string;
  amountCents: number;
  requestedAt: string | null;
  requestedBy: string | null;
  reason: string | null;
};

const readRequestNotes = (
  original: NormalizedPaymentTransaction,
): RefundRequestNote[] => {
  const raw = original?.data?.refundRequests;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry: any) => ({
      externalRefundId: asText(entry?.externalRefundId),
      amountCents: Math.max(0, Math.round(Number(entry?.amountCents) || 0)),
      requestedAt: asText(entry?.requestedAt) || null,
      requestedBy: asText(entry?.requestedBy) || null,
      reason: asText(entry?.reason) || null,
    }))
    .filter((entry) => entry.externalRefundId && entry.amountCents > 0);
};

/**
 * Le richieste ancora in volo: quelle di cui il registro non porta ancora il
 * movimento.
 */
export const pendingRefundRequests = (
  original: NormalizedPaymentTransaction,
  transactions: NormalizedPaymentTransaction[] = [],
): RefundRequestNote[] => {
  const registrati = new Set(
    refundsOfTransaction(original, transactions)
      .map((entry) => asText(entry.externalReference))
      .filter(Boolean),
  );

  /*
    Anche un rimborso registrato da un evento che non conosceva l'incasso
    originale — quindi senza `data.refundOfTransactionId` — va considerato
    arrivato: condivide il pagamento presso il provider, e il suo
    identificativo e quello della richiesta.
  */
  for (const entry of transactions) {
    if (toCents(entry.amount) >= 0) continue;
    const riferimento = asText(entry.externalReference);
    if (riferimento) registrati.add(riferimento);
  }

  return readRequestNotes(original).filter(
    (nota) => !registrati.has(nota.externalRefundId),
  );
};

/* ------------------------------------------------ si puo rimborsare, adesso? */

export type RefundBlocker =
  | "not_a_payment"
  | "reversed"
  | "manual_payment"
  | "provider_missing"
  | "nothing_left"
  | "in_progress"
  | null;

export type RefundAvailability = {
  refundable: boolean;
  /** Il primo ostacolo. `null` quando non ce ne sono. */
  blocker: RefundBlocker;
  message: string;
  /** L'incasso originale, in centesimi. */
  originalCents: number;
  /** Quanto ne e gia tornato indietro. */
  refundedCents: number;
  /** Quanto ne puo ancora tornare indietro. */
  refundableCents: number;
  refunds: NormalizedPaymentTransaction[];
  pending: RefundRequestNote[];
};

/**
 * Se un incasso si puo rimborsare adesso, e se no cosa lo impedisce.
 *
 * **Sei ostacoli, sei messaggi diversi, ed e voluto** — come per il checkout.
 * «Non rimborsabile» manda in segreteria a chiedere perche; ognuno di questi
 * dice cosa e successo e cosa si puo fare invece. In particolare i due che si
 * confondono di piu:
 *
 * - un incasso **manuale** non si rimborsa dal PSP perche quel denaro dal PSP
 *   non e mai passato: si storna, oppure si restituisce allo sportello;
 * - un incasso **stornato** non si rimborsa perche, per il registro, non e
 *   mai avvenuto.
 */
export const describeRefundAvailability = (input: {
  transaction: NormalizedPaymentTransaction;
  /** Tutti i movimenti della rata: i rimborsi si contano da qui. */
  transactions?: NormalizedPaymentTransaction[];
}): RefundAvailability => {
  const original = input.transaction;
  const transactions = input.transactions || [];

  const refunds = refundsOfTransaction(original, transactions);
  const pending = pendingRefundRequests(original, transactions);

  const originalCents = Math.max(0, toCents(original?.amount));
  const refundedCents = refunds.reduce(
    (total, entry) => total + Math.abs(toCents(entry.amount)),
    0,
  );
  const pendingCents = pending.reduce(
    (total, entry) => total + entry.amountCents,
    0,
  );

  const refundableCents = Math.max(
    0,
    originalCents - refundedCents - pendingCents,
  );

  const base = {
    originalCents,
    refundedCents,
    refundableCents,
    refunds,
    pending,
  };

  const blocked = (
    blocker: NonNullable<RefundBlocker>,
    message: string,
  ): RefundAvailability => ({ ...base, refundable: false, blocker, message });

  if (toCents(original?.amount) <= 0) {
    return blocked(
      "not_a_payment",
      "Questo movimento e un'uscita: un rimborso si chiede sull'incasso, non su cio che lo compensa.",
    );
  }

  if (!isSettledTransaction(original)) {
    return blocked(
      "reversed",
      "Questo incasso e stato stornato: per il registro non e mai avvenuto, e non c'e denaro da restituire.",
    );
  }

  if (original.source === "MANUAL") {
    return blocked(
      "manual_payment",
      "Questo incasso non e passato dal provider: si storna, oppure si restituisce con le stesse modalita con cui e stato ricevuto.",
    );
  }

  if (!asText(original.externalPaymentId)) {
    return blocked(
      "provider_missing",
      "Questo incasso non porta un riferimento presso il provider: il rimborso va fatto dal cruscotto del provider.",
    );
  }

  /*
    L'ordine conta: «gia rimborsato per intero» va detto prima di «ce n'e uno in
    corso», perche il secondo suggerisce di aspettare e il primo no.
  */
  if (originalCents - refundedCents <= 0) {
    return blocked(
      "nothing_left",
      "Questo incasso e gia stato rimborsato per intero.",
    );
  }

  if (pendingCents > 0) {
    return blocked(
      "in_progress",
      "Un rimborso su questo incasso e in elaborazione: la conferma del provider non e ancora arrivata.",
    );
  }

  return {
    ...base,
    refundable: true,
    blocker: null,
    message: "Questo incasso si puo rimborsare.",
  };
};

/* ------------------------------------------------ quanto si sta rimborsando */

/**
 * Valida l'importo che qualcuno ha scritto nella finestra di rimborso.
 *
 * Restituisce il messaggio da mostrare, oppure `null` se l'importo va bene.
 * Stessa forma di `validateOnlinePaymentAmount`: l'interfaccia non deve
 * inventarsi due modi di dire la stessa cosa.
 */
export const validateRefundAmount = (input: {
  amount: unknown;
  availability: RefundAvailability | null;
}): string | null => {
  if (!input.availability) return "Nessun incasso selezionato";

  if (!input.availability.refundable) {
    return input.availability.message;
  }

  const cents = toCents(input.amount);

  if (cents <= 0) {
    return "L'importo del rimborso deve essere maggiore di zero";
  }

  if (cents > input.availability.refundableCents) {
    return `Non si puo rimborsare piu di quanto resta rimborsabile su questo incasso (${(
      input.availability.refundableCents / 100
    ).toFixed(2)} EUR)`;
  }

  return null;
};

/**
 * I motivi che il provider riconosce.
 *
 * **Perche un catalogo e non testo libero.** Perche il motivo viaggia fino a
 * Stripe, che ne accetta tre e rifiuta il resto: un campo libero avrebbe
 * prodotto un rifiuto del provider al posto di un errore di compilazione. Le
 * parole in italiano stanno qui, il valore che parte e quello del provider.
 *
 * Le note interne, che invece sono libere, sono un'altra cosa e restano in
 * EasyGame: vedi la finestra di rimborso.
 */
export const REFUND_REASONS = [
  {
    value: "requested_by_customer",
    label: "Richiesto dalla famiglia",
  },
  { value: "duplicate", label: "Pagamento duplicato" },
  { value: "fraudulent", label: "Pagamento non riconosciuto" },
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number]["value"];

export const isRefundReason = (value: unknown): value is RefundReason =>
  REFUND_REASONS.some((entry) => entry.value === String(value || "").trim());

/* ------------------------------------------------------- cosa succedera dopo */

export type RefundPreview = {
  amountCents: number;
  /** Quanto resta incassato su questo movimento dopo il rimborso. */
  netCollectedCents: number;
  /** La quota di piattaforma che torna al club. `0` se non ce n'era. */
  platformFeeRefundedCents: number;
  /** La commissione del PSP restituita, `null` quando non e ancora nota. */
  providerFeeRefundedCents: number | null;
  /** I numeri congelati del movimento di rimborso, se l'incasso ne aveva. */
  settlement: FrozenSettlement | null;
};

/**
 * Cosa succede all'incasso dopo un rimborso di questo importo.
 *
 * **La commissione restituita e proporzionale a quella trattenuta, non
 * ricalcolata sulla condizione di oggi.** Il denaro da restituire e quello che
 * era stato trattenuto allora: una regola commerciale cambiata nel frattempo
 * non riguarda un incasso gia avvenuto (ADR-0050). Il calcolo e lo stesso che
 * il webhook applica quando registra il movimento — `reverseSettlement` — cosi
 * il numero mostrato prima del clic e quello che finira nel registro.
 */
export const previewRefund = (input: {
  transaction: NormalizedPaymentTransaction;
  amountCents: number;
}): RefundPreview => {
  const amountCents = Math.max(0, Math.round(Number(input.amountCents) || 0));
  const originalCents = Math.max(0, toCents(input.transaction?.amount));
  const congelati = input.transaction?.settlement || null;

  const netCollectedCents = Math.max(0, originalCents - amountCents);

  if (!congelati) {
    return {
      amountCents,
      netCollectedCents,
      platformFeeRefundedCents: 0,
      providerFeeRefundedCents: null,
      settlement: null,
    };
  }

  const settlement = reverseSettlement({
    original: {
      grossAmountCents: congelati.grossAmountCents ?? originalCents,
      platformFeeCents: congelati.platformFeeCents ?? 0,
      providerFeeCents: congelati.providerFeeCents,
      appliedFeePercent: congelati.appliedFeePercent,
      appliedFeeFixedCents: congelati.appliedFeeFixedCents,
      commissionRuleId: congelati.commissionRuleId,
    },
    refundedAmountCents: amountCents,
  });

  return {
    amountCents,
    netCollectedCents,
    /* I numeri congelati di un rimborso sono negativi: qui si mostra quanto torna. */
    platformFeeRefundedCents: Math.abs(settlement.platformFeeCents),
    providerFeeRefundedCents:
      settlement.providerFeeCents === null
        ? null
        : Math.abs(settlement.providerFeeCents),
    settlement,
  };
};

/* ----------------------------------------------------------- idempotenza */

/**
 * La **chiave di idempotenza** di un rimborso.
 *
 * **A cosa serve.** A impedire che un doppio clic, o un tentativo ripetuto dopo
 * un timeout di rete, produca due rimborsi economici — cioe restituisca il
 * doppio del dovuto a una famiglia, a spese del club.
 *
 * **Perche c'e dentro il gia rimborsato**, con lo stesso ragionamento di
 * `buildCheckoutIdempotencyKey` (ADR-0063): **non cambia** fra due clic dello
 * stesso tentativo — e li il rimborso va riusato, che e lo scopo — e **cambia**
 * dopo ogni rimborso andato a buon fine, che e esattamente quando ne serve uno
 * nuovo. Senza, un secondo rimborso da 30 € sullo stesso incasso riceverebbe
 * indietro il primo, e il club crederebbe di aver restituito 60 € avendone
 * restituiti 30.
 *
 * Funzione **pura**: si prova senza rete e senza database.
 */
export const buildRefundIdempotencyKey = (input: {
  organizationId: string;
  externalPaymentId: string;
  amountCents: number;
  refundedCents: number;
}): string =>
  [
    "refund",
    asText(input.organizationId),
    asText(input.externalPaymentId),
    Math.round(Number(input.amountCents) || 0),
    Math.round(Number(input.refundedCents) || 0),
  ].join(":");

/* ---------------------------------------------- la rata, dopo il rimborso */

export type InstallmentAfterRefund = {
  paidAmount: number;
  residualAmount: number;
  state: InstallmentLedgerState;
  /** Le stesse etichette che la rata mostrera: «IN ATTESA», «SCADUTA», ... */
  statusLabels: string[];
};

/**
 * Come si presentera la rata **dopo** un rimborso di questo importo.
 *
 * Serve alla finestra di rimborso: chi restituisce 30 € su 130 deve sapere
 * prima del clic che la rata tornera «parzialmente pagata» con 30 € di
 * residuo, e chi li restituisce tutti che tornera «in attesa» — o «scaduta»,
 * se la data e passata.
 *
 * **Perche non ricalcola lo stato a modo suo.** Perche lo stato di una rata si
 * ricava in un posto solo (`resolveLedgerState`, ADR-0036) e riscriverne una
 * seconda versione qui vorrebbe dire due idee di «pagata» che prima o poi
 * divergono. Qui si sposta l'incassato e si richiede la stessa regola.
 */
export const previewInstallmentAfterRefund = (input: {
  ledger: InstallmentLedger | null;
  amountCents: number;
}): InstallmentAfterRefund | null => {
  const ledger = input.ledger;
  if (!ledger) return null;

  const amountCents = Math.max(0, Math.round(Number(input.amountCents) || 0));
  const paidCents = Math.max(0, toCents(ledger.paidAmount) - amountCents);
  const dueCents = toCents(ledger.dueAmount);

  const paidAmount = Number((paidCents / 100).toFixed(2));
  const dueAmount = Number((dueCents / 100).toFixed(2));

  const state = resolveLedgerState({ dueAmount, paidAmount });

  return {
    paidAmount,
    residualAmount: Number((Math.max(0, dueCents - paidCents) / 100).toFixed(2)),
    state,
    /*
      La scadenza non si sposta con un rimborso: una rata che era scaduta e
      risultava pagata torna scoperta **e** scaduta, ed e giusto che lo dica.
    */
    statusLabels: buildStatusLabels(state, state !== "paid" && ledger.overdue),
  };
};
