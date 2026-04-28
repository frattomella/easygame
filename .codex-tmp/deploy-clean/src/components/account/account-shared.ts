import type { ReactNode } from "react";
import { normalizeClubSeasons } from "@/lib/club-seasons";

export const EASYGAME_LOGO =
  "https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png";

export const CREATE_CLUB_TABS = [
  { value: "general", label: "Generali" },
  { value: "fiscal", label: "Dati fiscali" },
  { value: "bank", label: "Dati bancari" },
  { value: "contacts", label: "Contatti" },
  { value: "federation", label: "Federazione" },
  { value: "social", label: "Social" },
] as const;

export const CLUB_TYPE_PRESETS = [
  "Dilettante",
  "Professionistico",
  "Academy",
  "Scuola Calcio",
  "Associazione Sportiva",
];

export const FEDERATION_PRESETS = [
  "FIGC - Federazione Italiana Giuoco Calcio",
  "FIP - Federazione Italiana Pallacanestro",
  "FIPAV - Federazione Italiana Pallavolo",
  "FITP - Federazione Italiana Tennis e Padel",
  "FIN - Federazione Italiana Nuoto",
  "FIDAL - Federazione Italiana Atletica Leggera",
];

export type MembershipOrganization = {
  id?: string;
  name?: string | null;
  logo_url?: string | null;
  creator_id?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  city?: string | null;
  province?: string | null;
  created_at?: string | null;
  settings?: Record<string, any> | null;
};

export type MembershipRecord = {
  organization_id: string;
  role: string;
  is_primary?: boolean;
  organization?: MembershipOrganization | null;
  organizations?: MembershipOrganization | null;
};

export type AccountClub = {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  isPrimary: boolean;
  logoUrl?: string | null;
  city?: string | null;
  province?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdAt?: string | null;
  ownerId?: string | null;
  activeSeasonId?: string | null;
  activeSeasonLabel?: string | null;
};

export type FederationItem = {
  id: string;
  name: string;
  registrationNumber: string;
  affiliationDate: string;
};

export type ProfileFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  newPassword: string;
  confirmPassword: string;
};

export type ClubCreateFormState = {
  name: string;
  logoUrl: string;
  type: string;
  foundingYear: string;
  address: string;
  city: string;
  postalCode: string;
  region: string;
  province: string;
  country: string;
  businessName: string;
  pec: string;
  vatNumber: string;
  fiscalCode: string;
  taxRegime: string;
  atecoCode: string;
  sdiCode: string;
  legalAddress: string;
  legalCity: string;
  legalPostalCode: string;
  legalRegion: string;
  legalProvince: string;
  legalCountry: string;
  representativeName: string;
  representativeSurname: string;
  representativeFiscalCode: string;
  bankName: string;
  iban: string;
  contactEmail: string;
  contactPhone: string;
  contact1Name: string;
  contact1Phone: string;
  contact1Email: string;
  contact2Name: string;
  contact2Phone: string;
  contact2Email: string;
  website: string;
  facebook: string;
  instagram: string;
  twitter: string;
  youtube: string;
  federations: FederationItem[];
};

export type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: ReactNode;
};

export const getRoleLabel = (role: string) => {
  switch (role) {
    case "owner":
      return "Proprietario";
    case "admin":
      return "Amministratore";
    case "trainer":
      return "Allenatore";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Genitore";
    default:
      return "Collaboratore";
  }
};

export const formatDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleDateString("it-IT");
  } catch {
    return "-";
  }
};

export const getInitials = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "EG";

export const sortClubs = (clubs: AccountClub[]) =>
  [...clubs].sort((left, right) => {
    if (left.isPrimary && !right.isPrimary) return -1;
    if (!left.isPrimary && right.isPrimary) return 1;
    return left.name.localeCompare(right.name);
  });

export const createFederationItem = (): FederationItem => ({
  id: `fed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  registrationNumber: "",
  affiliationDate: "",
});

export const createProfileDefaults = (user: any): ProfileFormState => ({
  firstName: user?.user_metadata?.firstName || "",
  lastName: user?.user_metadata?.lastName || "",
  email: user?.email || "",
  phone: user?.user_metadata?.phone || "",
  avatarUrl: user?.user_metadata?.avatarUrl || "",
  newPassword: "",
  confirmPassword: "",
});

export const createClubDefaults = (user: any): ClubCreateFormState => ({
  name: "",
  logoUrl: "",
  type: "Dilettante",
  foundingYear: "",
  address: "",
  city: "",
  postalCode: "",
  region: "",
  province: "",
  country: "Italia",
  businessName: "",
  pec: "",
  vatNumber: "",
  fiscalCode: "",
  taxRegime: "",
  atecoCode: "",
  sdiCode: "",
  legalAddress: "",
  legalCity: "",
  legalPostalCode: "",
  legalRegion: "",
  legalProvince: "",
  legalCountry: "Italia",
  representativeName: "",
  representativeSurname: "",
  representativeFiscalCode: "",
  bankName: "",
  iban: "",
  contactEmail: user?.email || "",
  contactPhone: user?.user_metadata?.phone || "",
  contact1Name: "",
  contact1Phone: user?.user_metadata?.phone || "",
  contact1Email: user?.email || "",
  contact2Name: "",
  contact2Phone: "",
  contact2Email: "",
  website: "",
  facebook: "",
  instagram: "",
  twitter: "",
  youtube: "",
  federations: [],
});

export const mapMembershipToClub = (
  membership: MembershipRecord,
  currentUserId?: string | null,
): AccountClub => {
  const organization = membership.organization || membership.organizations || {};
  const seasonState = normalizeClubSeasons(organization.settings || {});

  return {
    id: membership.organization_id,
    name: organization.name || "Club",
    role: membership.role,
    roleLabel: getRoleLabel(membership.role),
    isPrimary: Boolean(membership.is_primary),
    logoUrl: organization.logo_url || null,
    city: organization.city || null,
    province: organization.province || null,
    contactEmail: organization.contact_email || null,
    contactPhone: organization.contact_phone || null,
    createdAt: organization.created_at || null,
    ownerId: organization.creator_id || currentUserId || null,
    activeSeasonId: seasonState.activeSeasonId,
    activeSeasonLabel: seasonState.activeSeason?.label || null,
  };
};

export const buildClubSettings = (form: ClubCreateFormState) => ({
  type: form.type.trim() || null,
  types: form.type.trim() ? [form.type.trim()] : [],
  foundingYear: form.foundingYear.trim() || null,
  email: form.contactEmail.trim() || null,
  phone: form.contactPhone.trim() || null,
  companyEmail: form.contactEmail.trim() || null,
  companyPec: form.pec.trim() || null,
  tax_regime: form.taxRegime.trim() || null,
  atecoCode: form.atecoCode.trim() || null,
  contact1Name: form.contact1Name.trim() || null,
  contact1Phone: form.contact1Phone.trim() || null,
  contact1Email: form.contact1Email.trim() || null,
  contact2Name: form.contact2Name.trim() || null,
  contact2Phone: form.contact2Phone.trim() || null,
  contact2Email: form.contact2Email.trim() || null,
  facebook: form.facebook.trim() || null,
  instagram: form.instagram.trim() || null,
  twitter: form.twitter.trim() || null,
  youtube: form.youtube.trim() || null,
  website: form.website.trim() || null,
  federations: form.federations
    .map((item) => ({
      id: item.id,
      name: item.name.trim(),
      registrationNumber: item.registrationNumber.trim(),
      affiliationDate: item.affiliationDate || null,
    }))
    .filter((item) => item.name),
});

export const buildClubPayload = (
  form: ClubCreateFormState,
  user: any,
  shouldBePrimary: boolean,
) => ({
  name: form.name.trim(),
  creator_id: user.id,
  logo_url: form.logoUrl || null,
  address: form.address.trim() || null,
  city: form.city.trim() || null,
  postal_code: form.postalCode.trim() || null,
  region: form.region.trim() || null,
  province: form.province.trim() || null,
  country: form.country.trim() || "Italia",
  contact_email: form.contactEmail.trim().toLowerCase() || user.email || null,
  contact_phone: form.contactPhone.trim() || user.user_metadata?.phone || null,
  business_name: form.businessName.trim() || null,
  vat_number: form.vatNumber.trim() || null,
  fiscal_code: form.fiscalCode.trim() || null,
  pec: form.pec.trim() || null,
  tax_regime: form.taxRegime.trim() || null,
  sdi_code: form.sdiCode.trim() || null,
  bank_name: form.bankName.trim() || null,
  iban: form.iban.trim() || null,
  legal_address: form.legalAddress.trim() || null,
  legal_city: form.legalCity.trim() || null,
  legal_postal_code: form.legalPostalCode.trim() || null,
  legal_region: form.legalRegion.trim() || null,
  legal_province: form.legalProvince.trim() || null,
  legal_country: form.legalCountry.trim() || "Italia",
  representative_name: form.representativeName.trim() || null,
  representative_surname: form.representativeSurname.trim() || null,
  representative_fiscal_code: form.representativeFiscalCode.trim() || null,
  settings: buildClubSettings(form),
  members: [
    {
      user_id: user.id,
      role: "owner",
      is_primary: shouldBePrimary,
    },
  ],
  dashboard_data: {
    settings: {
      theme: "default",
      layout: "standard",
      widgets: ["metrics", "activities", "trainings", "certifications"],
    },
  },
});
