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

export const DEFAULT_PLATFORM_FEE_PERCENT = 2.5;

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

  if (grossAmountCents <= 0 || percent <= 0) {
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
