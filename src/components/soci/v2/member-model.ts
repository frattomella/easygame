/**
 * Il modello di lettura di un socio per le pagine Web V2.
 *
 * Le tre pagine V1 (`/soci`, `/soci/new`, `/soci/[id]`) leggevano lo stesso
 * record JSON di `clubs.members` con due copie di `getSocioIdentity` /
 * `getMemberIdentity`, un elenco chiuso di campi nella scheda e una terza
 * lettura del libro soci per l'elenco. Qui vive una sola lettura, senza
 * React, cosi griglia, scheda, modulo ed export dicono la stessa cosa.
 *
 * Modulo puro: niente `window`, niente fetch. Il dominio del libro (eventi,
 * transizioni, derivazione dello stato) resta in `src/lib/members/model.ts`;
 * qui c'e solo cio che serve a **mostrare**.
 */

import { MEMBERSHIP_STATUS, type StatusSpec } from "@/lib/web/status";
import { formatDateShort } from "@/lib/web/format";
import { formatPersonNameLastFirst } from "@/lib/athlete-name-utils";
import { normalizeMemberType } from "@/lib/member-types";
import type { MembershipRecordView, MembershipRegisterRowView } from "@/lib/members/client";
import type { MemberStatus, MemberStatusDerivation } from "@/lib/members/model";

/** Il record di `clubs.members` come arriva dall'archivio. */
export type MemberRaw = Record<string, any> & { id: string };

/**
 * Il socio normalizzato: l'anagrafica piu, quando il libro parla, la sua
 * posizione. I campi del libro sono **derivati** dagli eventi, non scritti
 * in anagrafica: arrivano dal registro e servono all'elenco, alla scheda e
 * all'export. `inRegister` distingue «non e socio» da «non e ancora nel
 * libro», che per un club che parte adesso sono due cose molto diverse.
 */
export type MemberRecord = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  birthPlace: string;
  birthPlaceCode: string;
  fiscalCode: string;
  address: string;
  city: string;
  postalCode: string;
  clothingSizes: Record<string, any> | null;
  email: string;
  phone: string;
  type: string;
  /** Lo stato della **scheda**: `active` | `inactive`. Non dice se la persona e socia. */
  status: string;
  registrationDate: string;
  membershipExpiry: string;
  /** Il numero digitato a mano prima della Wave 4: storico, non piu la fonte. */
  legacyMembershipNumber: string;
  notes: string;
  avatar: string | null;
  /* ── dal libro soci ─────────────────────────────────────────────────── */
  inRegister: boolean;
  isMemberNow: boolean;
  registerStatus: MemberStatus | null;
  membershipStatus: string;
  membershipNumber: string;
  admissionDate: string;
  cessationDate: string;
  cessationReason: string;
  eventCount: number;
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

/**
 * Nome, cognome e nome intero (cognome prima), con i ripieghi della V1:
 * `firstName|first_name`, `lastName|last_name|surname`,
 * `fullName|full_name|name`, e lo scarto di `"undefined undefined"`.
 */
export const getMemberIdentity = (member: Record<string, any> | null | undefined) => {
  const sanitize = (value: unknown) => {
    const trimmed = text(value);
    return trimmed.toLowerCase() === "undefined undefined" ? "" : trimmed;
  };
  const firstName = text(member?.firstName ?? member?.first_name);
  const lastName = text(member?.lastName ?? member?.last_name ?? member?.surname);
  const explicitFullName = sanitize(member?.fullName ?? member?.full_name ?? member?.name);
  const fullName =
    formatPersonNameLastFirst({
      first_name: firstName,
      last_name: lastName,
      name: explicitFullName,
      fullName: explicitFullName,
    }) || explicitFullName;
  return { firstName, lastName, fullName };
};

export const getMemberDisplayName = (member: Record<string, any> | null | undefined) =>
  getMemberIdentity(member).fullName || "Nome non disponibile";

/**
 * La V1 scartava dall'elenco le righe senza niente: un record vuoto, che
 * qualche importazione ha lasciato, non e un socio.
 */
export const isRegisteredMember = (member: Record<string, any> | null | undefined) => {
  if (!member) return false;
  const identity = getMemberIdentity(member);
  return Boolean(
    identity.fullName || member.membershipDate || member.registrationDate || member.email || member.phone || member.fiscalCode,
  );
};

/** La data di iscrizione: la V1 la leggeva su due chiavi. */
export const memberRegistrationDate = (member: Record<string, any> | null | undefined): string =>
  text(member?.registrationDate || member?.membershipDate);

/**
 * Il record normalizzato dall'archivio. Tutte le chiavi che il modulo di
 * creazione scrive si leggono qui (`anagrafiche-coverage.test.mjs`): un
 * elenco chiuso in un punto di lettura rende invisibile meta di
 * un'anagrafica, e la scheda V1 lo ha fatto per nove campi su ventuno.
 */
export const memberRecordFrom = (memberData: MemberRaw): MemberRecord => {
  const identity = getMemberIdentity(memberData);
  return {
    id: String(memberData.id),
    name: identity.fullName || "Nome non disponibile",
    firstName: identity.firstName,
    lastName: identity.lastName,
    birthDate: memberData.birthDate || "",
    gender: memberData.gender || "",
    birthPlace: memberData.birthPlace || "",
    birthPlaceCode: memberData.birthPlaceCode || "",
    fiscalCode: memberData.fiscalCode || "",
    address: memberData.address || "",
    city: memberData.city || "",
    postalCode: memberData.postalCode || "",
    clothingSizes: memberData.clothingSizes || null,
    email: memberData.email || "",
    phone: memberData.phone || "",
    type: normalizeMemberType(memberData.type),
    status: memberData.status || "active",
    registrationDate: memberRegistrationDate(memberData),
    membershipExpiry: memberData.membershipExpiry || "",
    legacyMembershipNumber: text(memberData.membershipNumber),
    notes: memberData.notes || "",
    avatar: memberData.avatar || null,
    inRegister: false,
    isMemberNow: false,
    registerStatus: null,
    membershipStatus: "",
    membershipNumber: "",
    admissionDate: "",
    cessationDate: "",
    cessationReason: "",
    eventCount: 0,
  };
};

/** La posizione del libro fusa nel record (elenco: una riga del registro; scheda: la derivazione). */
export const withRegisterStatus = (
  member: MemberRecord,
  status: MemberStatusDerivation | null | undefined,
  eventCount: number = status?.eventCount ?? 0,
): MemberRecord => {
  if (!status || eventCount <= 0) return { ...member, inRegister: false, isMemberNow: false, registerStatus: null, membershipStatus: "", membershipNumber: "", admissionDate: "", cessationDate: "", cessationReason: "", eventCount: 0 };
  return {
    ...member,
    inRegister: true,
    isMemberNow: status.isMember,
    registerStatus: status.status,
    membershipStatus: status.label,
    membershipNumber: status.membershipNumber || "",
    admissionDate: status.admittedOn || "",
    cessationDate: status.endedOn || "",
    cessationReason: status.endedOn ? status.reason || "" : "",
    eventCount,
  };
};

/** L'elenco: anagrafica piu il libro, riga per riga. Chi non e nel libro resta com'e. */
export const mergeRegisterRows = (members: MemberRecord[], rows: MembershipRegisterRowView[] | null | undefined): MemberRecord[] => {
  const perSocio = new Map((rows || []).map((riga) => [String(riga.memberId), riga]));
  return members.map((member) => {
    const riga = perSocio.get(String(member.id));
    return riga ? withRegisterStatus(member, riga.status, riga.eventCount) : member;
  });
};

/** La scheda: la posizione dal record completo del libro. */
export const withRegisterRecord = (member: MemberRecord, record: MembershipRecordView | null | undefined): MemberRecord =>
  withRegisterStatus(member, record?.status, record?.events?.length ?? 0);

/** La scheda e in uso? (`clubs.members[].status`) */
export const isMemberCardActive = (member: Pick<MemberRecord, "status"> | null | undefined) =>
  String(member?.status || "").trim().toLowerCase() === "active";

/** La pillola della scheda (attiva / non attiva): dice se la scheda e in uso, non se la persona e socia. */
export const memberCardStatusSpec = (status?: string | null): StatusSpec =>
  String(status || "").trim().toLowerCase() === "active" ? MEMBERSHIP_STATUS.card_active : MEMBERSHIP_STATUS.card_inactive;

const REGISTER_SPEC: Record<MemberStatus, StatusSpec> = {
  ammesso: MEMBERSHIP_STATUS.admitted,
  riammesso: MEMBERSHIP_STATUS.reinstated,
  dimesso: MEMBERSHIP_STATUS.resigned,
  decaduto: MEMBERSHIP_STATUS.lapsed,
  espulso: MEMBERSHIP_STATUS.expelled,
  mai_ammesso: MEMBERSHIP_STATUS.none,
};

/** La pillola del libro, dallo stato derivato. */
export const registerStatusSpec = (status?: MemberStatus | null): StatusSpec =>
  (status && REGISTER_SPEC[status]) || MEMBERSHIP_STATUS.none;

/**
 * Lo stato di un socio in elenco: dove il libro parla si mostra il libro;
 * dove tace, la scheda dice solo se e in uso (V1: `MembershipStatusBadge`).
 */
export const memberStatusSpec = (member: Pick<MemberRecord, "inRegister" | "registerStatus" | "status">): StatusSpec =>
  member.inRegister ? registerStatusSpec(member.registerStatus) : memberCardStatusSpec(member.status);

/** Il dettaglio accanto alla pillola: da quando vale quello stato. */
export const memberStatusDetail = (member: Pick<MemberRecord, "inRegister" | "isMemberNow" | "admissionDate" | "cessationDate">): string | undefined => {
  if (!member.inRegister) return undefined;
  const date = member.isMemberNow ? member.admissionDate : member.cessationDate;
  return date ? `dal ${formatDateShort(date)}` : undefined;
};

/** La chiave di filtro dello stato in elenco. */
export type MemberStatusFilterKey = "member" | "ceased" | "not_in_register";

export const memberStatusFilterKey = (member: Pick<MemberRecord, "inRegister" | "isMemberNow">): MemberStatusFilterKey =>
  !member.inRegister ? "not_in_register" : member.isMemberNow ? "member" : "ceased";

export type MemberAlert = {
  id: "not-in-register" | "no-contact" | "card-inactive";
  severity: "danger" | "warning";
  text: string;
};

/**
 * Gli avvisi della scheda, dai dati gia caricati. Una scheda in ordine non ha
 * righe. `registerReadable` e falso per chi non puo leggere il libro: a
 * quella persona non si dice «non e nel libro», perche non lo sa.
 */
export const computeMemberAlerts = (member: MemberRecord | null | undefined, options: { registerReadable?: boolean } = {}): MemberAlert[] => {
  if (!member) return [];
  const alerts: MemberAlert[] = [];
  if (options.registerReadable !== false && !member.inRegister) {
    alerts.push({ id: "not-in-register", severity: "warning", text: "Non ancora registrato nel libro soci: la qualifica di socio si ricava dall'ammissione" });
  }
  if (!text(member.email) && !text(member.phone)) {
    alerts.push({ id: "no-contact", severity: "warning", text: "Nessun recapito: la persona non è raggiungibile dal club" });
  }
  if (member.inRegister && member.isMemberNow && !isMemberCardActive(member)) {
    alerts.push({ id: "card-inactive", severity: "warning", text: "La scheda è disattivata ma la persona risulta socia nel libro" });
  }
  return alerts;
};

/** Le aree della scheda V2 e le vecchie tab che vi confluiscono. */
export type MemberArea = "profilo" | "associativo" | "libro";

export const MEMBER_AREAS: Array<{ value: MemberArea; label: string }> = [
  { value: "profilo", label: "Profilo" },
  { value: "associativo", label: "Dati associativi" },
  { value: "libro", label: "Libro soci" },
];

/** `?tab=` → area. Le tre tab V1 (`anagrafica`, `associativi`, `libro`) restano link validi. */
export const resolveMemberArea = (tab?: string | null): MemberArea => {
  switch (String(tab || "").trim().toLowerCase()) {
    case "associativi":
    case "associativo":
      return "associativo";
    case "libro":
      return "libro";
    default:
      return "profilo";
  }
};
