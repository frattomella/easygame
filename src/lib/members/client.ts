import { apiRequest } from "@/lib/api/client";
import type {
  MemberStatusDerivation,
  MembershipEventType,
} from "./model";

/**
 * Il libro soci visto dal browser.
 *
 * Esiste per non far scrivere a tre schermate tre volte lo stesso `fetch`: il
 * trasporto e `apiRequest` (mai un `fetch` diretto a `/api` da un componente),
 * e le forme di risposta si dichiarano una volta sola.
 *
 * **Non contiene logica di dominio.** Lo stato non si ricalcola qui: arriva
 * gia derivato dal servizio, che usa lo stesso `deriveMemberStatus` del
 * modulo puro. Due derivazioni sono due risposte alla stessa domanda.
 */

export type MembershipEventView = {
  id: string;
  memberId: string;
  memberLabel: string;
  eventType: MembershipEventType;
  effectiveDate: string | null;
  resolutionReference: string | null;
  resolutionDate: string | null;
  reason: string | null;
  membershipNumber: string | null;
  notes: string | null;
  createdAt: string | null;
};

export type MembershipRecordView = {
  memberId: string;
  memberLabel: string;
  status: MemberStatusDerivation;
  events: MembershipEventView[];
};

export type MembershipRegisterRowView = {
  memberId: string;
  memberLabel: string;
  memberType: string | null;
  status: MemberStatusDerivation;
  eventCount: number;
  onlyInRegister: boolean;
};

const withClub = (path: string, clubId?: string | null) =>
  clubId ? `${path}${path.includes("?") ? "&" : "?"}organization_id=${clubId}` : path;

/** La posizione di un socio: stato derivato e storico che lo produce. */
export const fetchMembershipRecord = (
  memberId: string,
  options: { clubId?: string | null; atDate?: string | null } = {},
) =>
  apiRequest<MembershipRecordView>(
    withClub(
      `/api/v1/membership/events?member_id=${encodeURIComponent(memberId)}${
        options.atDate ? `&at=${encodeURIComponent(options.atDate)}` : ""
      }`,
      options.clubId,
    ),
  );

/** Il libro a una data: senza `atDate` risponde su oggi. */
export const fetchMembershipRegister = (
  options: { clubId?: string | null; atDate?: string | null } = {},
) =>
  apiRequest<{
    atDate: string | null;
    disclaimer: string;
    rows: MembershipRegisterRowView[];
  }>(
    withClub(
      `/api/v1/membership/register${
        options.atDate ? `?at=${encodeURIComponent(options.atDate)}` : ""
      }`,
      options.clubId,
    ),
  );

/**
 * Registra un evento.
 *
 * Il numero di tessera non compare nella firma: lo assegna il libro, e un campo
 * qui sarebbe l'invito a digitarlo di nuovo.
 */
export const recordMembershipEvent = (input: {
  clubId?: string | null;
  memberId: string;
  eventType: MembershipEventType;
  effectiveDate: string;
  resolutionReference?: string | null;
  resolutionDate?: string | null;
  reason?: string | null;
  notes?: string | null;
}) =>
  apiRequest<{ event: MembershipEventView; status: MemberStatusDerivation }>(
    "/api/v1/membership/events",
    {
      method: "POST",
      body: {
        organization_id: input.clubId || null,
        member_id: input.memberId,
        event_type: input.eventType,
        effective_date: input.effectiveDate,
        resolution_reference: input.resolutionReference || null,
        resolution_date: input.resolutionDate || null,
        reason: input.reason || null,
        notes: input.notes || null,
      },
    },
  );

/** Crea l'anagrafica del socio e la sua ammissione, in una transazione sola. */
export const admitNewMember = (input: {
  clubId?: string | null;
  member: Record<string, any>;
  effectiveDate: string;
  resolutionReference?: string | null;
  resolutionDate?: string | null;
  notes?: string | null;
}) =>
  apiRequest<{
    member: Record<string, any>;
    event: MembershipEventView;
    status: MemberStatusDerivation;
  }>("/api/v1/membership/admissions", {
    method: "POST",
    body: {
      organization_id: input.clubId || null,
      member: input.member,
      effective_date: input.effectiveDate,
      resolution_reference: input.resolutionReference || null,
      resolution_date: input.resolutionDate || null,
      notes: input.notes || null,
    },
  });
