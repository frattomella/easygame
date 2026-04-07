export type MobileMedicalCertificateStatus = "valid" | "expiring" | "expired";
export type MobileMedicalCertificateAvailability =
  | MobileMedicalCertificateStatus
  | "missing";

type ExpirySource =
  | string
  | Date
  | null
  | undefined
  | {
      expiryDate?: string | Date | null;
      expiry_date?: string | Date | null;
    };

const toDate = (value: string | Date | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getMobileMedicalCertificateStatus = (
  source: ExpirySource,
  referenceDate: Date = new Date(),
): MobileMedicalCertificateStatus => {
  const expiryDate = toDate(
    typeof source === "object" && source !== null && !(source instanceof Date)
      ? source.expiryDate ?? source.expiry_date
      : source,
  );

  if (!expiryDate) {
    return "expired";
  }

  const comparisonDate = new Date(referenceDate);
  const warningDate = new Date(expiryDate);
  warningDate.setMonth(warningDate.getMonth() - 1);

  if (expiryDate < comparisonDate) {
    return "expired";
  }

  if (comparisonDate >= warningDate) {
    return "expiring";
  }

  return "valid";
};

export const getMobileMedicalCertificateAvailability = (
  source: ExpirySource,
  referenceDate: Date = new Date(),
): MobileMedicalCertificateAvailability => {
  const expiryDate = toDate(
    typeof source === "object" && source !== null && !(source instanceof Date)
      ? source.expiryDate ?? source.expiry_date
      : source,
  );

  if (!expiryDate) {
    return "missing";
  }

  return getMobileMedicalCertificateStatus(expiryDate, referenceDate);
};

export const getMobileMedicalCertificateAvailabilityLabel = (
  availability: MobileMedicalCertificateAvailability,
) => {
  switch (availability) {
    case "missing":
      return "Certificato mancante";
    case "expired":
      return "Certificato scaduto";
    case "expiring":
      return "Certificato in scadenza";
    default:
      return "Certificato valido";
  }
};
