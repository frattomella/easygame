export type PlatformFeeInput = {
  amountCents: number;
  percent: number;
  fixedCents?: number;
};

export type PlatformFeeResult = {
  grossAmountCents: number;
  platformFeeCents: number;
  clubNetAmountCents: number;
};

/**
 * Il valore di riserva quando nessuna condizione commerciale e stata scritta.
 *
 * **Non e piu il listino.** Dal Blocco D il listino sta in
 * `platform_commission_rules` e si risolve in `commission.ts`: qui resta solo
 * il numero con cui `normalizePaymentSettings` riempie un campo di lettura.
 * Vale `1` e non piu `2.5` perche due valori di riserva diversi si sarebbero
 * contraddetti nella stessa schermata. Vedi ADR-0050.
 */
export const DEFAULT_PLATFORM_FEE_PERCENT = 1;

export const readPlatformFeePercent = (rawValue?: string | number | null) => {
  const parsed =
    typeof rawValue === "number"
      ? rawValue
      : Number.parseFloat(String(rawValue || "").replace(",", "."));

  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_PLATFORM_FEE_PERCENT;
};

export function calculatePlatformFee(
  input: PlatformFeeInput,
): PlatformFeeResult {
  const grossAmountCents = Math.max(0, Math.round(Number(input.amountCents || 0)));
  const percent = Math.max(0, Number(input.percent || 0));
  const fixedCents = Math.max(0, Math.round(Number(input.fixedCents || 0)));

  /*
    Solo l'importo nullo esce subito. Uscire anche su `percent <= 0` era un
    difetto: una condizione commerciale «nessuna percentuale, 50 centesimi a
    transazione» e legittima, e la quota fissa spariva in silenzio. Se non c'e
    nulla da trattenere, il calcolo qui sotto restituisce zero da solo.
  */
  if (grossAmountCents <= 0) {
    return {
      grossAmountCents,
      platformFeeCents: 0,
      clubNetAmountCents: grossAmountCents,
    };
  }

  const percentFee = Math.round(grossAmountCents * (percent / 100));
  const platformFeeCents = Math.min(grossAmountCents, percentFee + fixedCents);

  return {
    grossAmountCents,
    platformFeeCents,
    clubNetAmountCents: grossAmountCents - platformFeeCents,
  };
}
