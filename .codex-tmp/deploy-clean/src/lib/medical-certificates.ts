export type MedicalCertificateStatus = "valid" | "expiring" | "expired";
export type MedicalCertificateAvailability =
  | MedicalCertificateStatus
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

export const getMedicalCertificateStatus = (
  source: ExpirySource,
  referenceDate: Date = new Date(),
): MedicalCertificateStatus => {
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

export const getMedicalCertificateAvailability = (
  source: ExpirySource,
  referenceDate: Date = new Date(),
): MedicalCertificateAvailability => {
  const expiryDate = toDate(
    typeof source === "object" && source !== null && !(source instanceof Date)
      ? source.expiryDate ?? source.expiry_date
      : source,
  );

  if (!expiryDate) {
    return "missing";
  }

  return getMedicalCertificateStatus(expiryDate, referenceDate);
};

export const getMedicalCertificateAvailabilityLabel = (
  availability: MedicalCertificateAvailability,
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

export const getLatestMedicalCertificateExpiry = (
  certificates: Array<{
    expiryDate?: string | Date | null;
    expiry_date?: string | Date | null;
  }>,
) => {
  const timestamps = certificates
    .map((certificate) =>
      toDate(certificate.expiryDate ?? certificate.expiry_date)?.getTime() ?? 0,
    )
    .filter((value) => value > 0);

  if (!timestamps.length) {
    return "";
  }

  return new Date(Math.max(...timestamps)).toISOString();
};
