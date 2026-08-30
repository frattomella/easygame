import { apiRequest } from "@/lib/api/client";
import type {
  NormalizedSponsor,
  SponsorCollection,
  SponsorContract,
  SponsorCredit,
} from "./model";

/**
 * Gli sponsor visti dal browser: **contratto e incasso**, non l'anagrafica.
 *
 * L'anagrafica dello sponsor resta al CRUD generico (`/api/v1/sponsors`), dove
 * sta da sempre. Qui vivono le due cose che il CRUD generico non sa fare:
 * salvare un contratto senza riscrivere l'intera collezione, e registrare un
 * incasso **nel registro degli incassi** invece che in una collezione JSON.
 *
 * Il trasporto e `apiRequest`: mai un `fetch` diretto a `/api` da un componente.
 */

const withClub = (path: string, clubId?: string | null) =>
  clubId ? `${path}${path.includes("?") ? "&" : "?"}organization_id=${clubId}` : path;

export type SponsorCreditView = {
  sponsor: NormalizedSponsor;
  credit: SponsorCredit;
  /* Gli incassi che il credito spiega: viaggiano con lui, non a parte. */
  collections: SponsorCollection[];
};

/**
 * Le tre cifre di uno sponsor, **calcolate dal server**.
 *
 * Il residuo si ricava da due fonti — gli incassi con la controparte dichiarata
 * e la vecchia collezione JSON — e una pagina che ne vedesse una sola direbbe
 * un numero sbagliato con la faccia di uno giusto.
 */
export const fetchSponsorCredit = (
  sponsorId: string,
  options: { clubId?: string | null } = {},
) =>
  apiRequest<SponsorCreditView>(
    withClub(`/api/v1/sponsorships/${encodeURIComponent(sponsorId)}`, options.clubId),
  );

/** Registra o aggiorna il contratto. Tocca una riga sola, sotto il lock del club. */
export const saveSponsorContract = (input: {
  clubId?: string | null;
  sponsorId: string;
  contract: SponsorContract;
}) =>
  apiRequest<{ sponsor: NormalizedSponsor }>(
    `/api/v1/sponsorships/${encodeURIComponent(input.sponsorId)}`,
    {
      method: "PUT",
      body: { organization_id: input.clubId || null, contract: input.contract },
    },
  );

/**
 * Registra un incasso dello sponsor **nel registro degli incassi**.
 *
 * Prima questa riga finiva nella collezione JSON `sponsor_payments`, e il
 * denaro di uno sponsor non arrivava mai in prima nota: il residuo dello
 * sponsor era giusto, il rendiconto del club no.
 */
export const recordSponsorCollection = (input: {
  clubId?: string | null;
  sponsorId: string;
  amount: number | string;
  paidAt?: string | null;
  paymentMethod: string;
  financialAccountId?: string | null;
  operationTypeCode?: string | null;
  notes?: string | null;
}) =>
  apiRequest<{ transaction: Record<string, any> }>(
    `/api/v1/sponsorships/${encodeURIComponent(input.sponsorId)}/collections`,
    {
      method: "POST",
      body: {
        organization_id: input.clubId || null,
        amount: input.amount,
        paid_at: input.paidAt || null,
        payment_method: input.paymentMethod,
        financial_account_id: input.financialAccountId || null,
        operation_type_code: input.operationTypeCode || null,
        notes: input.notes || null,
      },
    },
  );
