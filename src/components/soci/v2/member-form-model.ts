/**
 * La parte pura del modulo socio: i valori, la lettura dal record, la
 * validazione client della V1 e cio che ogni sezione della scheda scrive.
 * Senza React, cosi si collauda in `tests/ui/soci-v2-parita.test.mjs`.
 */
import { DEFAULT_CLOTHING_SIZES, type ClothingSizes } from "@/lib/clothing-sizes";
import { DEFAULT_MEMBER_TYPE } from "@/lib/member-types";
import { formatPersonNameLastFirst } from "@/lib/athlete-name-utils";
import { todayLocalDateOnly } from "@/lib/date-only";
import { getMemberIdentity, memberRegistrationDate } from "@/components/soci/v2/member-model";

export type MemberFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fiscalCode: string;
  birthDate: string;
  gender: string;
  birthPlace: string;
  birthPlaceCode: string;
  type: string;
  clothingSizes: ClothingSizes;
  address: string;
  city: string;
  postalCode: string;
  notes: string;
  /* ── solo in modifica (dati associativi della scheda) ────────────────── */
  status: string;
  registrationDate: string;
  membershipExpiry: string;
  /* ── solo in creazione (l'ammissione nel libro) ──────────────────────── */
  membershipDate: string;
  resolutionReference: string;
  resolutionDate: string;
};

export const emptyMemberFormValues = (): MemberFormValues => ({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  fiscalCode: "",
  birthDate: "",
  gender: "",
  birthPlace: "",
  birthPlaceCode: "",
  type: DEFAULT_MEMBER_TYPE,
  clothingSizes: DEFAULT_CLOTHING_SIZES,
  address: "",
  city: "",
  postalCode: "",
  notes: "",
  status: "active",
  registrationDate: "",
  membershipExpiry: "",
  membershipDate: todayLocalDateOnly(),
  resolutionReference: "",
  resolutionDate: "",
});

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/** I valori del modulo da un record di `clubs.members` (la scheda e la modifica). */
export const memberFormValuesFrom = (member: Record<string, any> | null | undefined): MemberFormValues => {
  const base = emptyMemberFormValues();
  if (!member) return base;
  const identity = getMemberIdentity(member);
  return {
    ...base,
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: text(member.email),
    phone: text(member.phone),
    fiscalCode: text(member.fiscalCode),
    birthDate: text(member.birthDate),
    gender: text(member.gender),
    birthPlace: text(member.birthPlace),
    birthPlaceCode: text(member.birthPlaceCode),
    type: text(member.type) || DEFAULT_MEMBER_TYPE,
    clothingSizes: { ...DEFAULT_CLOTHING_SIZES, ...(member.clothingSizes || {}) },
    address: text(member.address),
    city: text(member.city),
    postalCode: text(member.postalCode),
    notes: text(member.notes),
    status: text(member.status) || "active",
    registrationDate: memberRegistrationDate(member),
    membershipExpiry: text(member.membershipExpiry),
  };
};

export type MemberFormError = { id?: string; field: string; label: string };

/**
 * La validazione client della V1 (`handleSubmit` di `/soci/new`), con le
 * stesse frasi. In creazione la delibera e obbligatoria: e il consiglio
 * direttivo ad ammettere un socio, e un'ammissione senza i suoi estremi e la
 * riga che manca quando qualcuno chiede conto del libro.
 */
export const validateMemberForm = (values: MemberFormValues, idPrefix: string, mode: "create" | "edit"): MemberFormError[] => {
  const errors: MemberFormError[] = [];
  if (!values.firstName.trim() || !values.lastName.trim()) {
    errors.push({
      id: `${idPrefix}-${values.firstName.trim() ? "last" : "first"}-name`,
      field: "name",
      label: "Nome e cognome sono obbligatori",
    });
  }
  if (mode === "create" && !values.resolutionReference.trim()) {
    errors.push({
      id: `${idPrefix}-resolution-reference`,
      field: "resolutionReference",
      label: "Servono gli estremi della delibera che ha ammesso il socio",
    });
  }
  return errors;
};

/** Le quattro sezioni che la scheda modifica una per volta (come la modale V1). */
export type MemberEditSection = "personal" | "contacts" | "clothing" | "membership";

/** Le chiavi del record che ogni sezione puo scrivere. */
const SECTION_KEYS: Record<MemberEditSection, Array<keyof MemberFormValues>> = {
  personal: ["firstName", "lastName", "birthDate", "birthPlace", "birthPlaceCode", "gender", "fiscalCode", "notes"],
  contacts: ["email", "phone", "address", "city", "postalCode"],
  clothing: ["clothingSizes"],
  /*
    Il numero di tessera **non** c'e: la modale V1 lo offriva in modifica e il
    server lo scartava (`MEMBER_RESERVED_KEYS`). Un campo che si compila e non
    si salva e peggio di un campo assente.
  */
  membership: ["type", "registrationDate", "membershipExpiry", "status"],
};

/** Il nome per esteso (cognome prima), come l'elenco lo mostra. */
const composedName = (values: Pick<MemberFormValues, "firstName" | "lastName">) =>
  formatPersonNameLastFirst({ firstName: values.firstName.trim(), lastName: values.lastName.trim() });

/**
 * Il pezzo di record da salvare per una sezione. Il nome intero si scrive
 * insieme a nome e cognome: e un campo derivato che l'elenco mostra, e senza
 * di lui il socio in elenco continua a chiamarsi come prima.
 */
export const memberSectionPayload = (section: MemberEditSection, values: MemberFormValues): Record<string, any> => {
  const payload: Record<string, any> = {};
  for (const key of SECTION_KEYS[section]) payload[key] = values[key];
  if (section === "personal") {
    payload.firstName = values.firstName.trim();
    payload.lastName = values.lastName.trim();
    const name = composedName(values);
    payload.name = name || undefined;
    payload.fullName = name || undefined;
  }
  return payload;
};

/** L'intero record da salvare dalla pagina di modifica. */
export const memberEditPayload = (values: MemberFormValues): Record<string, any> => ({
  ...memberSectionPayload("personal", values),
  ...memberSectionPayload("contacts", values),
  ...memberSectionPayload("clothing", values),
  ...memberSectionPayload("membership", values),
});

/** Cio che `admitNewMember` riceve dal modulo di creazione (stesse chiavi della V1). */
export const memberAdmissionPayload = (values: MemberFormValues) => ({
  member: {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email || null,
    phone: values.phone || null,
    fiscalCode: values.fiscalCode || null,
    birthDate: values.birthDate || null,
    gender: values.gender || null,
    birthPlace: values.birthPlace || null,
    birthPlaceCode: values.birthPlaceCode || null,
    type: values.type || DEFAULT_MEMBER_TYPE,
    clothingSizes: values.clothingSizes,
    address: values.address || null,
    city: values.city || null,
    postalCode: values.postalCode || null,
    notes: values.notes || null,
  },
  effectiveDate: values.membershipDate,
  resolutionReference: values.resolutionReference,
  resolutionDate: values.resolutionDate || null,
});

/** La validazione di una sezione sola, con le stesse frasi. */
export const validateMemberSection = (section: MemberEditSection, values: MemberFormValues, idPrefix: string): MemberFormError[] => {
  if (section !== "personal") return [];
  return validateMemberForm(values, idPrefix, "edit").filter((e) => e.field === "name");
};
