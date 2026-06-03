import { getAthleteDisplayName } from "@/lib/athlete-name-utils";

export type InvalidCertificateReason = "missing" | "expired" | "invalid";

export type InvalidConvocatedAthleteCertificate = {
  athleteId: string;
  athleteName: string;
  reason: InvalidCertificateReason;
  expiryDate?: string | null;
  status?: string | null;
};

export type MatchCertificateWarningResult = {
  hasInvalidCertificates: boolean;
  count: number;
  athleteNames: string[];
  athletes: InvalidConvocatedAthleteCertificate[];
  convocatedAthleteIds: string[];
};

type CertificateEvaluation = {
  isValid: boolean;
  reason?: InvalidCertificateReason;
  expiryDate?: string | null;
  status?: string | null;
};

const VALID_CERTIFICATE_STATUSES = new Set([
  "",
  "valid",
  "valido",
  "valida",
  "active",
  "attivo",
  "attiva",
  "approved",
  "approvato",
  "approvata",
  "ok",
  "compliant",
  "expiring",
  "in scadenza",
  "in_scadenza",
]);

const EXPIRED_CERTIFICATE_STATUSES = new Set([
  "expired",
  "scaduto",
  "scaduta",
]);

const INVALID_CERTIFICATE_STATUSES = new Set([
  "invalid",
  "non valido",
  "non valida",
  "non_valido",
  "non_valida",
  "rejected",
  "respinto",
  "respinta",
  "revoked",
  "revocato",
  "revocata",
  "suspended",
  "sospeso",
  "sospesa",
]);

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeId = (value: unknown) => String(value || "").trim();

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const parseDate = (value: unknown) => {
  const raw = firstNonEmptyString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isBeforeToday = (value: unknown, referenceDate: Date) => {
  const parsed = parseDate(value);
  if (!parsed) {
    return false;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const expiryDay = new Date(parsed);
  expiryDay.setHours(0, 0, 0, 0);

  return expiryDay < today;
};

const extractAthleteIdFromRecord = (entry: Record<string, any>) =>
  firstNonEmptyString(
    entry.athleteId,
    entry.athlete_id,
    entry.athlete?.id,
    entry.playerId,
    entry.player_id,
    entry.id,
    entry.value,
  );

const extractAthleteIdsFromSource = (source: unknown): string[] => {
  if (!source) {
    return [];
  }

  if (typeof source === "string") {
    return source
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (Array.isArray(source)) {
    return source.flatMap((entry) => extractAthleteIdsFromSource(entry));
  }

  if (!isRecord(source)) {
    return [normalizeId(source)].filter(Boolean);
  }

  const directId = extractAthleteIdFromRecord(source);
  if (directId) {
    return [directId];
  }

  return [
    source.athleteIds,
    source.athlete_ids,
    source.selectedAthleteIds,
    source.selected_athlete_ids,
    source.convocatedAthleteIds,
    source.convocated_athlete_ids,
    source.convocatedAthletes,
    source.convocated_athletes,
    source.calledAthletes,
    source.called_athletes,
    source.selectedAthletes,
    source.selected_athletes,
    source.participants,
    source.athletes,
    source.convocations,
    source.convocationEntries,
    source.convocation_entries,
  ].flatMap((entry) => extractAthleteIdsFromSource(entry));
};

export const getConvocatedAthleteIdsFromMatch = (match: any): string[] => {
  const payload = isRecord(match?.payload) ? match.payload : {};
  const data = isRecord(match?.data) ? match.data : {};

  const sources = [
    match?.convocations,
    match?.convocationEntries,
    match?.convocation_entries,
    match?.convocatedAthleteIds,
    match?.convocated_athlete_ids,
    match?.convocatedAthletes,
    match?.convocated_athletes,
    match?.calledAthletes,
    match?.called_athletes,
    match?.selectedAthletes,
    match?.selected_athletes,
    match?.selectedAthleteIds,
    match?.selected_athlete_ids,
    match?.participants,
    payload.convocations,
    payload.convocationEntries,
    payload.convocation_entries,
    payload.convocatedAthleteIds,
    payload.convocatedAthletes,
    payload.calledAthletes,
    payload.selectedAthletes,
    payload.selectedAthleteIds,
    payload.participants,
    data.convocations,
    data.convocationEntries,
    data.convocation_entries,
    data.convocatedAthleteIds,
    data.convocatedAthletes,
    data.calledAthletes,
    data.selectedAthletes,
    data.selectedAthleteIds,
    data.participants,
  ];

  return Array.from(
    new Set(
      sources
        .flatMap((source) => extractAthleteIdsFromSource(source))
        .map((id) => normalizeId(id))
        .filter(Boolean),
    ),
  );
};

const getAthleteId = (athlete: any) =>
  firstNonEmptyString(
    athlete?.id,
    athlete?.athleteId,
    athlete?.athlete_id,
    athlete?.data?.id,
  );

const getCertificateAthleteId = (certificate: any) =>
  firstNonEmptyString(
    certificate?.athleteId,
    certificate?.athlete_id,
    certificate?.athlete?.id,
    certificate?.data?.athleteId,
    certificate?.data?.athlete_id,
  );

const getCertificateExpiry = (certificate: any) =>
  firstNonEmptyString(
    certificate?.expiryDate,
    certificate?.expiry_date,
    certificate?.expiresAt,
    certificate?.expires_at,
    certificate?.data?.expiryDate,
    certificate?.data?.expiry_date,
  ) || null;

const getCertificateStatus = (certificate: any) =>
  firstNonEmptyString(
    certificate?.status,
    certificate?.certificateStatus,
    certificate?.certificate_status,
    certificate?.data?.status,
    certificate?.data?.certificateStatus,
    certificate?.data?.certificate_status,
  ) || null;

const getEmbeddedCertificateSources = (athlete: any) => {
  const data = isRecord(athlete?.data) ? athlete.data : {};
  const certificates = [
    athlete?.medicalCertificates,
    athlete?.medical_certificates,
    athlete?.certificates,
    data.medicalCertificates,
    data.medical_certificates,
    data.certificates,
  ].flatMap((source) => (Array.isArray(source) ? source : []));

  const syntheticExpiry = firstNonEmptyString(
    athlete?.medicalCertExpiry,
    athlete?.medical_cert_expiry,
    athlete?.medical_certificate_expiry,
    data.medicalCertExpiry,
    data.medical_cert_expiry,
    data.medical_certificate_expiry,
  );

  if (syntheticExpiry) {
    certificates.push({
      athleteId: getAthleteId(athlete),
      expiryDate: syntheticExpiry,
      status: firstNonEmptyString(
        athlete?.medicalCertStatus,
        athlete?.medical_cert_status,
        data.medicalCertStatus,
        data.medical_cert_status,
      ),
    });
  }

  return certificates;
};

const evaluateCertificate = (
  certificate: any,
  referenceDate: Date,
): CertificateEvaluation => {
  const status = getCertificateStatus(certificate);
  const normalizedStatus = normalizeValue(status);
  const expiryDate = getCertificateExpiry(certificate);

  if (EXPIRED_CERTIFICATE_STATUSES.has(normalizedStatus)) {
    return { isValid: false, reason: "expired", expiryDate, status };
  }

  if (INVALID_CERTIFICATE_STATUSES.has(normalizedStatus)) {
    return { isValid: false, reason: "invalid", expiryDate, status };
  }

  if (expiryDate && isBeforeToday(expiryDate, referenceDate)) {
    return { isValid: false, reason: "expired", expiryDate, status };
  }

  if (!expiryDate && !VALID_CERTIFICATE_STATUSES.has(normalizedStatus)) {
    return { isValid: false, reason: "invalid", expiryDate, status };
  }

  return { isValid: true, expiryDate, status };
};

const evaluateAthleteCertificates = (
  athlete: any,
  certificates: any[],
  referenceDate: Date,
): CertificateEvaluation | null => {
  if (!athlete && certificates.length === 0) {
    return null;
  }

  const embeddedCertificates = athlete ? getEmbeddedCertificateSources(athlete) : [];
  const allCertificates = [...certificates, ...embeddedCertificates];

  if (allCertificates.length === 0) {
    return { isValid: false, reason: "missing", expiryDate: null, status: null };
  }

  const evaluations = allCertificates.map((certificate) =>
    evaluateCertificate(certificate, referenceDate),
  );

  if (evaluations.some((evaluation) => evaluation.isValid)) {
    return null;
  }

  return (
    evaluations
      .slice()
      .sort((left, right) => {
        const leftTime = parseDate(left.expiryDate)?.getTime() || 0;
        const rightTime = parseDate(right.expiryDate)?.getTime() || 0;
        return rightTime - leftTime;
      })[0] || { isValid: false, reason: "invalid" }
  );
};

export const getInvalidCertificatesForConvocatedAthletes = (
  match: any,
  athletes: any[] = [],
  certificates: any[] = [],
  referenceDate: Date = new Date(),
): MatchCertificateWarningResult => {
  const convocatedAthleteIds = getConvocatedAthleteIdsFromMatch(match);
  const athletesById = new Map(
    (Array.isArray(athletes) ? athletes : [])
      .map((athlete) => [getAthleteId(athlete), athlete] as const)
      .filter(([athleteId]) => Boolean(athleteId)),
  );
  const certificatesByAthleteId = new Map<string, any[]>();

  (Array.isArray(certificates) ? certificates : []).forEach((certificate) => {
    const athleteId = getCertificateAthleteId(certificate);
    if (!athleteId) {
      return;
    }

    if (!certificatesByAthleteId.has(athleteId)) {
      certificatesByAthleteId.set(athleteId, []);
    }

    certificatesByAthleteId.get(athleteId)?.push(certificate);
  });

  const invalidAthletes = convocatedAthleteIds
    .map((athleteId) => {
      const athlete = athletesById.get(athleteId) || null;
      const athleteCertificates = certificatesByAthleteId.get(athleteId) || [];
      const evaluation = evaluateAthleteCertificates(
        athlete,
        athleteCertificates,
        referenceDate,
      );

      if (!evaluation || evaluation.isValid || !evaluation.reason) {
        return null;
      }

      return {
        athleteId,
        athleteName: athlete
          ? getAthleteDisplayName(athlete)
          : `Atleta ${athleteId}`,
        reason: evaluation.reason,
        expiryDate: evaluation.expiryDate || null,
        status: evaluation.status || null,
      };
    })
    .filter(Boolean) as InvalidConvocatedAthleteCertificate[];

  return {
    hasInvalidCertificates: invalidAthletes.length > 0,
    count: invalidAthletes.length,
    athleteNames: invalidAthletes.map((athlete) => athlete.athleteName),
    athletes: invalidAthletes,
    convocatedAthleteIds,
  };
};

export const matchHasConvocatedAthletesWithInvalidCertificate = (
  match: any,
  athletes: any[] = [],
  certificates: any[] = [],
  referenceDate: Date = new Date(),
) =>
  getInvalidCertificatesForConvocatedAthletes(
    match,
    athletes,
    certificates,
    referenceDate,
  ).hasInvalidCertificates;
