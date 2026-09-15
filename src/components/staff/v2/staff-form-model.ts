/**
 * La parte pura del modulo staff: i valori, la lettura dal record, la
 * validazione client della V1 e cio che ogni sezione della scheda scrive.
 * Senza React, cosi si collauda in `tests/ui/staff-v2-parity.test.mjs`.
 */
import { DEFAULT_CLOTHING_SIZES, type ClothingSizes } from "@/lib/clothing-sizes";
import { normalizeDepartmentName } from "@/lib/staff-directory";

export type StaffFormValues = {
  name: string;
  surname: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  status: string;
  hireDate: string;
  birthDate: string;
  nationality: string;
  birthPlace: string;
  birthPlaceCode: string;
  gender: string;
  age: string;
  education: string;
  address: string;
  city: string;
  postalCode: string;
  fiscalCode: string;
  documentType: string;
  documentNumber: string;
  documentIssueDate: string;
  documentExpiry: string;
  residencePermitExpiry: string;
  notes: string;
  clothingSizes: ClothingSizes;
};

export const emptyStaffFormValues = (): StaffFormValues => ({
  name: "",
  surname: "",
  email: "",
  phone: "",
  role: "",
  department: "",
  status: "active",
  hireDate: "",
  birthDate: "",
  nationality: "Italiana",
  birthPlace: "",
  birthPlaceCode: "",
  gender: "",
  age: "",
  education: "",
  address: "",
  city: "",
  postalCode: "",
  fiscalCode: "",
  documentType: "",
  documentNumber: "",
  documentIssueDate: "",
  documentExpiry: "",
  residencePermitExpiry: "",
  notes: "",
  clothingSizes: DEFAULT_CLOTHING_SIZES,
});

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/** I valori del modulo da un record di `clubs.staff_members`. */
export const staffFormValuesFrom = (member: Record<string, any> | null | undefined): StaffFormValues => {
  const base = emptyStaffFormValues();
  if (!member) return base;
  return {
    ...base,
    name: text(member.firstName ?? member.name),
    surname: text(member.surname ?? member.lastName),
    email: text(member.email),
    phone: text(member.phone),
    role: text(member.role),
    department: normalizeDepartmentName(member.department),
    status: text(member.status) || "active",
    hireDate: text(member.hireDate || member.hire_date),
    birthDate: text(member.birthDate),
    nationality: text(member.nationality) || "Italiana",
    birthPlace: text(member.birthPlace),
    birthPlaceCode: text(member.birthPlaceCode),
    gender: text(member.gender),
    age: text(member.age),
    education: text(member.education),
    address: text(member.address),
    city: text(member.city),
    postalCode: text(member.postalCode),
    fiscalCode: text(member.fiscalCode || member.fiscal_code),
    documentType: text(member.documentType),
    documentNumber: text(member.documentNumber),
    documentIssueDate: text(member.documentIssueDate),
    documentExpiry: text(member.documentExpiry),
    residencePermitExpiry: text(member.residencePermitExpiry),
    notes: text(member.notes),
    clothingSizes: { ...DEFAULT_CLOTHING_SIZES, ...(member.clothingSizes || {}) },
  };
};

export type StaffFormError = { id?: string; field: string; label: string };

/** La validazione client della V1 (`handleSubmit` di `/staff/new`), stesse frasi. */
export const validateStaffForm = (values: StaffFormValues, idPrefix: string): StaffFormError[] => {
  const errors: StaffFormError[] = [];
  if (!values.name.trim()) errors.push({ id: `${idPrefix}-first-name`, field: "name", label: "Il nome è obbligatorio" });
  if (!values.surname.trim()) errors.push({ id: `${idPrefix}-last-name`, field: "surname", label: "Il cognome è obbligatorio" });
  if (!values.phone.trim() && !values.email.trim()) {
    errors.push({ id: `${idPrefix}-email`, field: "contact", label: "È necessario inserire almeno un contatto (email o telefono)" });
  }
  if (!values.role.trim()) errors.push({ id: `${idPrefix}-role`, field: "role", label: "Il ruolo è obbligatorio" });
  return errors;
};

/** Le cinque sezioni che la scheda modifica una per volta (come la modale V1). */
export type StaffEditSection = "personal" | "contacts" | "company" | "clothing" | "document";

/** Le chiavi del record che ogni sezione puo scrivere. */
const SECTION_KEYS: Record<StaffEditSection, Array<keyof StaffFormValues>> = {
  personal: ["name", "surname", "birthDate", "birthPlace", "birthPlaceCode", "gender", "fiscalCode", "nationality", "age", "education", "notes"],
  contacts: ["email", "phone", "address", "city", "postalCode"],
  company: ["role", "department", "status", "hireDate"],
  clothing: ["clothingSizes"],
  document: ["documentType", "documentNumber", "documentIssueDate", "documentExpiry", "residencePermitExpiry"],
};

/**
 * Il pezzo di record da salvare per una sezione. Il nome si scrive su tutte
 * le chiavi che l'archivio usa (`name`/`firstName`, `surname`/`lastName`,
 * `fullName`): la V1 ne aggiornava due e lasciava le altre vecchie.
 */
export const staffSectionPayload = (section: StaffEditSection, values: StaffFormValues): Record<string, any> => {
  const payload: Record<string, any> = {};
  for (const key of SECTION_KEYS[section]) payload[key] = values[key];
  if (section === "personal") {
    const firstName = values.name.trim();
    const lastName = values.surname.trim();
    payload.name = firstName;
    payload.firstName = firstName;
    payload.surname = lastName;
    payload.lastName = lastName;
    payload.fullName = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  }
  return payload;
};

/** La validazione di una sezione sola, con le stesse frasi. */
export const validateStaffSection = (section: StaffEditSection, values: StaffFormValues, idPrefix: string): StaffFormError[] => {
  const all = validateStaffForm(values, idPrefix);
  if (section === "personal") return all.filter((e) => e.field === "name" || e.field === "surname");
  if (section === "contacts") return all.filter((e) => e.field === "contact");
  if (section === "company") return all.filter((e) => e.field === "role");
  return [];
};
