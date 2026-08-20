import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import { getClubAthletes, getClubData } from "@/lib/simplified-db";

export type ClubEntityType =
  | "athlete"
  | "staff"
  | "member"
  | "sponsor"
  | "trainer"
  | "supplier"
  | "structure"
  | "club"
  | "external";

export type ClubEntityOption = {
  id: string;
  type: ClubEntityType;
  label: string;
  subtitle?: string;
  email?: string;
  phone?: string;
  fiscalCode?: string;
  vatNumber?: string;
  category?: string;
  address?: string;
  source?: string;
  raw?: unknown;
};

export const firstClubEntityText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

export const parseClubEntityData = (record: any) => {
  if (!record?.data) return {};
  if (typeof record.data === "object") return record.data;

  try {
    return JSON.parse(record.data);
  } catch {
    return {};
  }
};

export const getClubEntityLabel = (record: any, type?: ClubEntityType) => {
  if (type === "athlete") {
    return getAthleteDisplayName(record) || "Atleta";
  }

  const data = parseClubEntityData(record);
  return firstClubEntityText(
    record?.displayName,
    record?.display_name,
    record?.fullName,
    record?.full_name,
    record?.businessName,
    record?.business_name,
    record?.company_name,
    record?.name,
    record?.title,
    [record?.first_name, record?.last_name].filter(Boolean).join(" "),
    [record?.firstName, record?.lastName].filter(Boolean).join(" "),
    [record?.name, record?.surname].filter(Boolean).join(" "),
    data?.displayName,
    data?.fullName,
    [data?.firstName, data?.lastName].filter(Boolean).join(" "),
    [data?.first_name, data?.last_name].filter(Boolean).join(" "),
  );
};

export const getClubEntityEmail = (record: any) => {
  const data = parseClubEntityData(record);
  return firstClubEntityText(
    record?.email,
    record?.subjectEmail,
    record?.contactEmail,
    record?.contact_email,
    record?.parent_email,
    record?.parentEmail,
    record?.guardian_email,
    data?.email,
    data?.parentEmail,
    data?.parent_email,
    data?.contactEmail,
  );
};

export const getClubEntityPhone = (record: any) => {
  const data = parseClubEntityData(record);
  return firstClubEntityText(
    record?.phone,
    record?.subjectPhone,
    record?.contactPhone,
    record?.contact_phone,
    record?.parent_phone,
    record?.parentPhone,
    record?.guardian_phone,
    data?.phone,
    data?.parentPhone,
    data?.parent_phone,
    data?.contactPhone,
  );
};

export const getClubEntityCategory = (record: any) => {
  const data = parseClubEntityData(record);
  return firstClubEntityText(
    record?.category,
    record?.category_name,
    record?.categoryName,
    record?.role,
    record?.type,
    data?.category,
    data?.categoryName,
    data?.role,
  );
};

export const getClubEntityReference = (record: any) => {
  const data = parseClubEntityData(record);
  return firstClubEntityText(
    record?.reference,
    record?.code,
    record?.cardNumber,
    record?.card_number,
    record?.membership_number,
    record?.fiscal_code,
    record?.fiscalCode,
    record?.vat_number,
    record?.vatNumber,
    data?.reference,
    data?.code,
    data?.cardNumber,
    data?.fiscalCode,
  );
};

export const buildAthletesById = (athletes: any[]) => {
  const athletesById = new Map<string, any>();

  athletes.forEach((athlete) => {
    [
      athlete?.id,
      athlete?.athlete_id,
      athlete?.athleteId,
      parseClubEntityData(athlete)?.id,
    ].forEach((value) => {
      const key = firstClubEntityText(value);
      if (key) athletesById.set(key, athlete);
    });
  });

  return athletesById;
};

export const getPaymentAthleteId = (payment: any) => {
  const data = parseClubEntityData(payment);
  const rawData = parseClubEntityData(payment?.raw || {});

  return firstClubEntityText(
    payment?._originEntityId,
    payment?.athlete_id,
    payment?.athleteId,
    payment?.athlete?.id,
    data?.athlete_id,
    data?.athleteId,
    payment?.raw?.athlete_id,
    payment?.raw?.athleteId,
    rawData?.athlete_id,
    rawData?.athleteId,
  );
};

export const resolveAthleteForPayment = (
  payment: any,
  athletesById: Map<string, any>,
) => {
  const athleteId = getPaymentAthleteId(payment);
  if (!athleteId) return null;
  return athletesById.get(String(athleteId)) || null;
};

export const toClubEntityOption = (
  record: any,
  type: ClubEntityType,
  source: string,
): ClubEntityOption | null => {
  const label = getClubEntityLabel(record, type);
  const id = firstClubEntityText(record?.id, record?.athlete_id, label);

  if (!id || !label) return null;

  return {
    id,
    type,
    label,
    subtitle: getClubEntityCategory(record) || undefined,
    email: getClubEntityEmail(record) || undefined,
    phone: getClubEntityPhone(record) || undefined,
    fiscalCode:
      firstClubEntityText(record?.fiscalCode, record?.fiscal_code) || undefined,
    vatNumber:
      firstClubEntityText(record?.vatNumber, record?.vat_number) || undefined,
    category: getClubEntityCategory(record) || undefined,
    address:
      firstClubEntityText(record?.address, record?.legal_address) || undefined,
    source,
    raw: record,
  };
};

const normalizeList = (
  records: any[],
  type: ClubEntityType,
  source: string,
) =>
  records
    .map((record) => toClubEntityOption(record, type, source))
    .filter(Boolean) as ClubEntityOption[];

const getActiveClubOption = (clubId: string): ClubEntityOption | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("activeClub");
    const club = raw ? JSON.parse(raw) : null;
    if (!club || String(club.id || "") !== String(clubId)) return null;

    return {
      id: club.id,
      type: "club",
      label: club.name || "Club",
      email: club.email || club.contact_email || undefined,
      phone: club.phone || club.contact_phone || undefined,
      address: club.address || undefined,
      source: "activeClub",
      raw: {
        id: club.id,
        name: club.name,
        email: club.email || club.contact_email,
        phone: club.phone || club.contact_phone,
      },
    };
  } catch {
    return null;
  }
};

export const loadClubEntityDirectory = async (
  clubId: string,
): Promise<ClubEntityOption[]> => {
  if (!clubId) return [];

  const [
    athletes,
    staffMembers,
    members,
    sponsors,
    trainers,
    suppliers,
    structures,
  ] = await Promise.all([
    getClubAthletes(clubId).catch(() => []),
    getClubData(clubId, "staff_members").catch(() => []),
    getClubData(clubId, "members").catch(() => []),
    getClubData(clubId, "sponsors").catch(() => []),
    getClubData(clubId, "trainers").catch(() => []),
    getClubData(clubId, "suppliers").catch(() => []),
    getClubData(clubId, "structures").catch(() => []),
  ]);

  const clubOption = getActiveClubOption(clubId);

  return [
    ...normalizeList(athletes, "athlete", "athletes"),
    ...normalizeList(staffMembers, "staff", "staff_members"),
    ...normalizeList(members, "member", "members"),
    ...normalizeList(sponsors, "sponsor", "sponsors"),
    ...normalizeList(trainers, "trainer", "trainers"),
    ...normalizeList(suppliers, "supplier", "suppliers"),
    ...normalizeList(structures, "structure", "structures"),
    ...(clubOption ? [clubOption] : []),
  ];
};
