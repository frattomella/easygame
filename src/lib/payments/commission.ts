/**
 * La **commissione della piattaforma**: quale regola vale, e quanto vale.
 *
 * **Il difetto che questo modulo chiude.** Fino al Blocco D la percentuale di
 * EasyGame viveva in `clubs.settings.paymentSettings.platformFeePercent` — un
 * campo che la pagina Organizzazione del club rimanda a ogni salvataggio.
 * Erano due problemi in uno: una societa poteva azzerarsi la commissione, e
 * *non esisteva alcuna traccia* di quale percentuale fosse in vigore il giorno
 * di un incasso. Cambiare il listino riscriveva la lettura del passato.
 *
 * **La forma della soluzione: una regola ha una data di decorrenza.** Non si
 * sovrascrive un numero, si aggiunge una riga. La regola che vale per un
 * incasso e quella con la decorrenza piu recente **non successiva** alla data
 * dell'incasso; l'override di un club vince sulla regola predefinita a parita
 * di condizione. Il passato resta leggibile perche le righe vecchie non
 * spariscono.
 *
 * **Perche serve anche il congelamento sull'incasso.** Questa risoluzione
 * spiega *perche* un incasso porta quel numero; non basta a garantirlo. Una
 * regola scritta con decorrenza retroattiva — che e una cosa legittima da fare
 * per correggere un errore — cambierebbe il risultato di questa funzione su
 * incassi gia avvenuti. Per questo la commissione effettiva viene comunque
 * **scritta sulla riga dell'incasso** e non ricalcolata mai piu. Le due difese
 * rispondono a domande diverse e servono entrambe. Vedi ADR-0050.
 *
 * Modulo **puro**: nessun database, nessuna sessione, nessuna variabile
 * d'ambiente. Si prova con date e numeri.
 */

import { calculatePlatformFee } from "./platform-fees";

/** La regola predefinita quando nessuna e stata ancora scritta. */
export const FALLBACK_COMMISSION_PERCENT = 1;

export type CommissionRule = {
  id: string;
  /** `null` = la regola predefinita di EasyGame. */
  organizationId: string | null;
  percent: number;
  fixedCents: number;
  /** Da quando vale. */
  effectiveFrom: string | Date;
  /**
   * Quando e stata scritta.
   *
   * **Non e un dato di servizio: e il criterio che scioglie i pareggi.** Due
   * regole con la stessa decorrenza succedono davvero — riportare un club allo
   * standard scrive una regola con decorrenza «adesso», e «adesso» puo
   * coincidere al millisecondo con quella che si sta sostituendo. Senza questo
   * campo, quale delle due vincesse dipendeva dall'ordine in cui il database
   * restituiva le righe, e la piu vecchia poteva sopravvivere alla piu nuova.
   */
  createdAt?: string | Date | null;
  note?: string | null;
};

export type ResolvedCommission = {
  percent: number;
  fixedCents: number;
  /** La regola che ha vinto, oppure `null` se si e usato il valore di riserva. */
  ruleId: string | null;
  /** `club` se ha vinto un override, `platform` la regola generale, `fallback` nessuna delle due. */
  origin: "club" | "platform" | "fallback";
  effectiveFrom: string | null;
  note: string | null;
};

const toTime = (value: string | Date | null | undefined) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const toIso = (value: string | Date | null | undefined) => {
  const time = toTime(value);
  return time === null ? null : new Date(time).toISOString();
};

const sanitizePercent = (value: unknown) => {
  const parsed = Number(value);
  /*
    Una percentuale sopra 100 non e una condizione commerciale, e un errore di
    battitura che si porterebbe via l'intero incasso. Si taglia qui invece di
    lasciarla arrivare al PSP, che la rifiuterebbe davanti a chi sta pagando.
  */
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
};

const sanitizeFixedCents = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

/**
 * Le regole applicabili a un club a una certa data, dalla piu recente.
 *
 * Ordinamento **stabile**: a parita di decorrenza — che succede quando si
 * scrivono override e regola generale nello stesso istante — l'override del
 * club precede la regola generale, altrimenti quale delle due vincesse
 * dipenderebbe dall'ordine in cui il database ha restituito le righe.
 */
const applicableRules = (
  rules: CommissionRule[],
  organizationId: string | null,
  at: number,
) =>
  rules.filter((rule) => {
    const from = toTime(rule.effectiveFrom);
    if (from === null || from > at) return false;
    if (rule.organizationId === null) return true;
    return Boolean(organizationId) && rule.organizationId === organizationId;
  });

/**
 * Quale di due regole applicabili vince.
 *
 * **I pareggi non sono un caso di laboratorio.** Riportare un club alla
 * condizione standard scrive una regola «da adesso» mentre quella da
 * sostituire porta lo stesso istante: su un orologio a bassa risoluzione i due
 * valori coincidono al millisecondo. Senza un criterio, quale delle due
 * vincesse dipendeva dall'ordine in cui il database restituiva le righe — e la
 * regola vecchia poteva sopravvivere a quella che la sostituiva.
 *
 * I criteri, in ordine: decorrenza piu recente, poi scrittura piu recente, poi
 * l'override del club sulla condizione generale. A parita di tutti e tre vince
 * **l'ultima incontrata**, e per questo `loadCommissionRules` restituisce le
 * righe in ordine crescente.
 */
const beats = (candidate: CommissionRule, current: CommissionRule) => {
  const delta =
    (toTime(candidate.effectiveFrom) || 0) - (toTime(current.effectiveFrom) || 0);
  if (delta !== 0) return delta > 0;

  const written =
    (toTime(candidate.createdAt) || 0) - (toTime(current.createdAt) || 0);
  if (written !== 0) return written > 0;

  const candidateIsOverride = candidate.organizationId !== null;
  const currentIsOverride = current.organizationId !== null;
  if (candidateIsOverride !== currentIsOverride) return candidateIsOverride;

  return true;
};

/**
 * Quale commissione vale per un club a una certa data.
 *
 * `at` non e «adesso» per comodita di test: e la data **dell'incasso**. Una
 * riconciliazione che rilegge sei mesi di movimenti deve poter chiedere «quale
 * regola valeva quel giorno», e la risposta non puo essere quella di oggi.
 */
export const resolveCommission = (input: {
  rules: CommissionRule[];
  organizationId?: string | null;
  at?: string | Date;
}): ResolvedCommission => {
  const at = toTime(input.at) ?? Date.now();
  const organizationId = String(input.organizationId || "").trim() || null;

  const winner = applicableRules(
    input.rules || [],
    organizationId,
    at,
  ).reduce<CommissionRule | null>(
    (best, rule) => (best === null || beats(rule, best) ? rule : best),
    null,
  );

  if (!winner) {
    return {
      percent: FALLBACK_COMMISSION_PERCENT,
      fixedCents: 0,
      ruleId: null,
      origin: "fallback",
      effectiveFrom: null,
      note: null,
    };
  }

  return {
    percent: sanitizePercent(winner.percent),
    fixedCents: sanitizeFixedCents(winner.fixedCents),
    ruleId: winner.id,
    origin: winner.organizationId ? "club" : "platform",
    effectiveFrom: toIso(winner.effectiveFrom),
    note: winner.note ?? null,
  };
};

/* ------------------------------------------------------- il congelamento */

/**
 * I numeri di un incasso, come vanno scritti sulla riga.
 *
 * **Perche il netto e un campo e non una sottrazione al momento della
 * lettura.** La commissione del PSP (`providerFeeCents`) spesso arriva dopo, o
 * non arriva affatto: Stripe la espone sul `balance_transaction`, che non e
 * nell'evento del pagamento. Un netto calcolato a video darebbe un numero
 * diverso prima e dopo, senza che nulla sia successo. Qui si scrive quel che
 * si sa quando lo si sa, e si aggiorna solo la fee del PSP quando arriva.
 */
export type FrozenSettlement = {
  currency: "EUR";
  grossAmountCents: number;
  platformFeeCents: number;
  providerFeeCents: number | null;
  netAmountCents: number;
  appliedFeePercent: number;
  appliedFeeFixedCents: number;
  commissionRuleId: string | null;
};

/**
 * Congela la commissione su un importo.
 *
 * `providerFeeCents` e opzionale perche di solito non si conosce nell'istante
 * in cui l'incasso viene registrato. Quando manca, il netto e il lordo meno la
 * sola commissione di EasyGame: e cio che il club effettivamente riceve
 * **dalla piattaforma**, mentre quanto trattiene Stripe e una partita fra il
 * club e Stripe.
 */
export const freezeSettlement = (input: {
  grossAmountCents: number;
  commission: ResolvedCommission;
  providerFeeCents?: number | null;
}): FrozenSettlement => {
  const grossAmountCents = Math.max(0, Math.round(Number(input.grossAmountCents) || 0));
  const percent = sanitizePercent(input.commission?.percent);
  const fixedCents = sanitizeFixedCents(input.commission?.fixedCents);

  const { platformFeeCents } = calculatePlatformFee({
    amountCents: grossAmountCents,
    percent,
    fixedCents,
  });

  const providerFeeCents =
    input.providerFeeCents === undefined || input.providerFeeCents === null
      ? null
      : Math.max(0, Math.round(Number(input.providerFeeCents) || 0));

  return {
    currency: "EUR",
    grossAmountCents,
    platformFeeCents,
    providerFeeCents,
    netAmountCents: Math.max(
      0,
      grossAmountCents - platformFeeCents - (providerFeeCents || 0),
    ),
    appliedFeePercent: percent,
    appliedFeeFixedCents: fixedCents,
    commissionRuleId: input.commission?.ruleId ?? null,
  };
};

/**
 * I numeri di uno **storno**, ricavati da quelli dell'incasso originale.
 *
 * **Perche proporzionali e non ricalcolati.** Un rimborso parziale di 30 € su
 * un incasso di 130 € restituisce la quota di commissione che competeva a quei
 * 30 €, non la commissione che si applicherebbe oggi a 30 €: la regola
 * potrebbe essere cambiata, e il denaro da restituire e quello che era stato
 * trattenuto. Sono negativi perche uno storno e un movimento di segno opposto,
 * come tutto il resto del registro.
 */
export const reverseSettlement = (input: {
  original: Pick<
    FrozenSettlement,
    | "grossAmountCents"
    | "platformFeeCents"
    | "providerFeeCents"
    | "appliedFeePercent"
    | "appliedFeeFixedCents"
    | "commissionRuleId"
  >;
  refundedAmountCents: number;
}): FrozenSettlement => {
  const originalGross = Math.max(0, Math.round(Number(input.original?.grossAmountCents) || 0));
  const refunded = Math.min(
    originalGross,
    Math.max(0, Math.round(Number(input.refundedAmountCents) || 0)),
  );

  /*
    Rimborso totale: si restituisce esattamente quel che era stato trattenuto,
    senza passare da una proporzione che potrebbe perdere un centesimo di
    arrotondamento. Un centesimo fra quel che il club ha incassato e quel che
    gli e stato restituito e una telefonata.
  */
  const ratio = originalGross > 0 ? refunded / originalGross : 0;
  const isFull = refunded === originalGross && originalGross > 0;

  const originalPlatformFee = Math.max(
    0,
    Math.round(Number(input.original?.platformFeeCents) || 0),
  );
  const originalProviderFee =
    input.original?.providerFeeCents === undefined ||
    input.original?.providerFeeCents === null
      ? null
      : Math.max(0, Math.round(Number(input.original.providerFeeCents) || 0));

  const platformFeeCents = isFull
    ? originalPlatformFee
    : Math.round(originalPlatformFee * ratio);
  const providerFeeCents =
    originalProviderFee === null
      ? null
      : isFull
        ? originalProviderFee
        : Math.round(originalProviderFee * ratio);

  return {
    currency: "EUR",
    grossAmountCents: -refunded,
    platformFeeCents: -platformFeeCents,
    providerFeeCents: providerFeeCents === null ? null : -providerFeeCents,
    netAmountCents: -Math.max(
      0,
      refunded - platformFeeCents - (providerFeeCents || 0),
    ),
    appliedFeePercent: sanitizePercent(input.original?.appliedFeePercent),
    appliedFeeFixedCents: sanitizeFixedCents(input.original?.appliedFeeFixedCents),
    commissionRuleId: input.original?.commissionRuleId ?? null,
  };
};

/* ------------------------------------------------------------ per l'UI */

/** `1` -> `«1,00%»`. Una funzione sola, cosi non se ne scrivono cinque. */
export const formatCommissionPercent = (percent: unknown) =>
  `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(sanitizePercent(percent))}%`;

export const describeCommissionOrigin = (origin: ResolvedCommission["origin"]) => {
  const labels: Record<ResolvedCommission["origin"], string> = {
    club: "Condizione dedicata a questa societa",
    platform: "Condizione standard EasyGame",
    fallback: "Nessuna condizione configurata: si applica il valore di riserva",
  };

  return labels[origin];
};
