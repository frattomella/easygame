/**
 * Il modello di lettura di uno sponsor per le pagine Web V2.
 *
 * Le due pagine V1 (`/sponsors`, `/sponsors/[id]`) leggevano lo stesso
 * elemento JSON di `clubs.sponsors` con due mappature diverse — l'elenco
 * conosceva `logo` e `region`, la scheda `phoneSecondary`, `streetNumber` e
 * `isPublicAdministration` — e due modi di dire se un record e uno sponsor
 * o un fornitore (`type`, oppure i flag `isSponsor`/`isSupplier` che la
 * scheda scriveva senza toccare `type`). Qui vive una lettura sola.
 *
 * Il contratto, il credito e gli incassi restano in `src/lib/sponsors/model.ts`
 * (dominio puro, condiviso con il server): qui c'e solo cio che serve a
 * **mostrare** — lo stato del contratto rispetto a oggi, la pillola del
 * credito, gli avvisi della scheda, la bozza del modulo.
 *
 * Modulo puro: niente React, niente `window`, niente rete.
 */

import {
  CERTIFICATE_STATUS,
  MONEY_STATUS,
  PERSON_STATUS,
  STATUS_UNKNOWN,
  type StatusSpec,
} from "@/lib/web/status";
import { daysUntil, joinMeta, parseDateInput } from "@/lib/web/format";
import {
  fromSponsorCents,
  hasSponsorContract,
  normalizeSponsorContract,
  normalizeSponsorKind,
  type SponsorCollection,
  type SponsorContract,
  type SponsorCredit,
  type SponsorKind,
} from "@/lib/sponsors/model";

/* ── Il record ──────────────────────────────────────────────────────────── */

/** L'elemento JSON di `clubs.sponsors`, con le chiavi che le due pagine V1 leggevano. */
export type SponsorRecord = Record<string, any> & {
  id: string;
  name?: string;
  type?: string;
  email?: string;
  phone?: string;
  phoneSecondary?: string;
  vatNumber?: string;
  fiscalCode?: string;
  pec?: string;
  sdi?: string;
  iban?: string;
  address?: string;
  streetNumber?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  region?: string;
  country?: string;
  logo?: string;
  isPublicAdministration?: boolean;
  isSponsor?: boolean;
  isSupplier?: boolean;
  contract?: unknown;
  documents?: unknown;
  created_at?: string;
  updated_at?: string;
};

export const SPONSOR_KIND_OPTIONS = [
  { value: "sponsor", label: "Sponsor" },
  { value: "fornitore", label: "Fornitore" },
] as const;

export const sponsorKindLabel = (value: unknown) =>
  normalizeSponsorKind(value) === "fornitore" ? "Fornitore" : "Sponsor";

const text = (value: unknown) => String(value ?? "").trim();

export const sponsorName = (record: SponsorRecord | null | undefined) =>
  text(record?.name) || "Nome non disponibile";

/** `Milano · amministrazione@azienda.it` — la riga meta della cella d'identita. */
export const sponsorMeta = (record: SponsorRecord) =>
  joinMeta(text(record.city), text(record.email) || text(record.phone));

/** Ricerca dell'elenco V1 (nome, email, P.IVA) piu codice fiscale e citta. */
export const matchesSponsorSearch = (record: SponsorRecord, query: string) => {
  const needle = text(query).toLowerCase();
  if (!needle) return true;
  return [record.name, record.email, record.vatNumber, record.fiscalCode, record.city]
    .map((value) => text(value).toLowerCase())
    .some((value) => value.includes(needle));
};

/* ── La bozza del modulo ────────────────────────────────────────────────── */

export type SponsorDraft = {
  name: string;
  type: SponsorKind;
  isPublicAdministration: boolean;
  email: string;
  phone: string;
  phoneSecondary: string;
  pec: string;
  vatNumber: string;
  fiscalCode: string;
  sdi: string;
  iban: string;
  address: string;
  streetNumber: string;
  city: string;
  province: string;
  postalCode: string;
  region: string;
  country: string;
  logo: string;
};

export const emptySponsorDraft = (kind: SponsorKind = "sponsor"): SponsorDraft => ({
  name: "",
  type: kind,
  isPublicAdministration: false,
  email: "",
  phone: "",
  phoneSecondary: "",
  pec: "",
  vatNumber: "",
  fiscalCode: "",
  sdi: "",
  iban: "",
  address: "",
  streetNumber: "",
  city: "",
  province: "",
  postalCode: "",
  region: "",
  country: "Italia",
  logo: "",
});

export const sponsorDraftFrom = (record: SponsorRecord | null | undefined): SponsorDraft => {
  if (!record) return emptySponsorDraft();
  /*
    La scheda V1 scriveva `isSponsor`/`isSupplier` senza toccare `type`, e
    l'elenco classificava per `type`: qui vince `type`, che e la chiave che il
    dominio (`normalizeSponsorKind`) e il server conoscono. Un record vecchio
    con il solo flag `isSupplier` viene letto come fornitore.
  */
  const kind: SponsorKind =
    text(record.type) ? normalizeSponsorKind(record.type) : record.isSupplier && !record.isSponsor ? "fornitore" : "sponsor";
  return {
    name: text(record.name),
    type: kind,
    isPublicAdministration: Boolean(record.isPublicAdministration),
    email: text(record.email),
    phone: text(record.phone),
    phoneSecondary: text(record.phoneSecondary),
    pec: text(record.pec),
    vatNumber: text(record.vatNumber),
    fiscalCode: text(record.fiscalCode),
    sdi: text(record.sdi),
    iban: text(record.iban),
    address: text(record.address),
    streetNumber: text(record.streetNumber),
    city: text(record.city),
    province: text(record.province),
    postalCode: text(record.postalCode),
    region: text(record.region),
    country: text(record.country) || "Italia",
    logo: text(record.logo),
  };
};

/**
 * I campi da scrivere sull'elemento. `isSponsor`/`isSupplier` si derivano da
 * `type`, cosi le due chiavi che la V1 teneva separate non divergono piu.
 * `updateClubDataItem` fonde: contratto, documenti e date restano.
 */
export const sponsorPayload = (draft: SponsorDraft): Record<string, any> => ({
  ...draft,
  isSponsor: draft.type === "sponsor",
  isSupplier: draft.type === "fornitore",
});

export type SponsorFormSection = "identity" | "contacts" | "fiscal" | "address";

export const SPONSOR_FORM_SECTIONS: ReadonlyArray<SponsorFormSection> = ["identity", "contacts", "fiscal", "address"];

export type SponsorFormError = { id: string; label: string; field: keyof SponsorDraft };

/**
 * Le regole della V1 (elenco): nome, email e partita IVA obbligatori — lo
 * stesso toast «Compila tutti i campi obbligatori». Si valida solo la parte
 * di modulo che si sta compilando: il cassetto di una sezione non puo
 * chiedere un campo che non mostra.
 */
export const validateSponsorDraft = (
  draft: SponsorDraft,
  sections: ReadonlyArray<SponsorFormSection> = SPONSOR_FORM_SECTIONS,
  idPrefix = "sponsor",
): SponsorFormError[] => {
  const errors: SponsorFormError[] = [];
  if (sections.includes("identity") && !text(draft.name)) {
    errors.push({ id: `${idPrefix}-name`, label: "Nome / Ragione sociale", field: "name" });
  }
  if (sections.includes("contacts") && !text(draft.email)) {
    errors.push({ id: `${idPrefix}-email`, label: "Email", field: "email" });
  }
  if (sections.includes("fiscal") && !text(draft.vatNumber)) {
    errors.push({ id: `${idPrefix}-vat`, label: "Partita IVA", field: "vatNumber" });
  }
  return errors;
};

/* ── Il contratto rispetto a oggi ───────────────────────────────────────── */

export type ContractLifecycleState = "none" | "active" | "expiring" | "expired";

export type ContractLifecycle = {
  state: ContractLifecycleState;
  /** Giorni alla scadenza (negativo = scaduto), `null` senza data di fine. */
  days: number | null;
};

/** La soglia «in scadenza», la stessa dei certificati. */
export const CONTRACT_EXPIRING_WITHIN_DAYS = 30;

export const contractLifecycle = (
  contract: SponsorContract | null | undefined,
  today: Date = new Date(),
): ContractLifecycle => {
  const normalized = contract ? normalizeSponsorContract(contract) : null;
  if (!normalized || !hasSponsorContract(normalized)) return { state: "none", days: null };
  const days = daysUntil(normalized.endDate, today);
  if (days == null) return { state: "active", days: null };
  if (days < 0) return { state: "expired", days };
  if (days <= CONTRACT_EXPIRING_WITHIN_DAYS) return { state: "expiring", days };
  return { state: "active", days };
};

/** Una parola per il contratto: NON REGISTRATO · ATTIVO · IN SCADENZA · SCADUTO. */
export const contractStatusSpec = (lifecycle: ContractLifecycle): StatusSpec => {
  switch (lifecycle.state) {
    case "active":
      return PERSON_STATUS.active;
    case "expiring":
      return CERTIFICATE_STATUS.expiring;
    case "expired":
      return CERTIFICATE_STATUS.expired;
    default:
      return STATUS_UNKNOWN;
  }
};

/**
 * Una parola per il credito: IN ATTESA (niente incassato) · PARZIALE ·
 * INCASSATO (saldato) · SCADUTO (contratto finito con residuo). `null` senza
 * contratto: non c'e niente da incassare, e una pillola direbbe il falso.
 */
export const creditStatusSpec = (
  credit: SponsorCredit | null | undefined,
  lifecycle: ContractLifecycle,
): StatusSpec | null => {
  if (!credit || !credit.hasContract) return null;
  if (credit.isSettled) return MONEY_STATUS.paid;
  if (lifecycle.state === "expired" && credit.outstandingCents > 0) return MONEY_STATUS.overdue;
  if (credit.collectedCents > 0) return MONEY_STATUS.partial;
  return MONEY_STATUS.pending;
};

export const centsToMoney = (cents: number | null | undefined) =>
  cents == null ? null : fromSponsorCents(cents);

/** `1 set 2026 → 31 ago 2027`, con «—» per l'estremo mancante; vuoto senza date. */
export const contractPeriodLabel = (
  contract: SponsorContract,
  format: (value: string | null) => string,
) =>
  contract.startDate || contract.endDate ? `${format(contract.startDate)} → ${format(contract.endDate)}` : "";

/* ── Gli avvisi della scheda ────────────────────────────────────────────── */

export type SponsorAlert = {
  id: "contract-expiring" | "contract-expired" | "outstanding";
  severity: "danger" | "warning";
  text: string;
};

export const computeSponsorAlerts = (
  credit: SponsorCredit | null | undefined,
  lifecycle: ContractLifecycle,
  formatMoneyCents: (cents: number) => string,
): SponsorAlert[] => {
  const alerts: SponsorAlert[] = [];
  if (lifecycle.state === "expiring") {
    const days = lifecycle.days ?? 0;
    alerts.push({
      id: "contract-expiring",
      severity: "warning",
      text: days === 0 ? "Il contratto scade oggi" : `Il contratto scade fra ${days} ${days === 1 ? "giorno" : "giorni"}`,
    });
  }
  if (lifecycle.state === "expired") {
    alerts.push({ id: "contract-expired", severity: "danger", text: "Il contratto e scaduto: rinnovalo o registra il nuovo periodo" });
  }
  if (credit?.hasContract && credit.outstandingCents > 0) {
    alerts.push({
      id: "outstanding",
      severity: lifecycle.state === "expired" ? "danger" : "warning",
      text: `Residuo da incassare: ${formatMoneyCents(credit.outstandingCents)}`,
    });
  }
  return alerts;
};

/* ── Le aree della scheda ───────────────────────────────────────────────── */

export type SponsorArea = "anagrafica" | "contratto" | "incassi" | "documenti";

export const SPONSOR_AREAS: ReadonlyArray<{ value: SponsorArea; label: string }> = [
  { value: "anagrafica", label: "Anagrafica" },
  { value: "contratto", label: "Contratto" },
  { value: "incassi", label: "Incassi" },
  { value: "documenti", label: "Documenti" },
];

/** `?tab=` con gli alias delle tre schede V1 (`finanza` → contratto, `archivio` → documenti). */
export const resolveSponsorArea = (value: string | null | undefined): SponsorArea => {
  const key = text(value).toLowerCase();
  if (key === "contratto" || key === "contratti" || key === "finanza") return "contratto";
  if (key === "incassi" || key === "pagamenti") return "incassi";
  if (key === "documenti" || key === "archivio") return "documenti";
  return "anagrafica";
};

/* ── Gli incassi ────────────────────────────────────────────────────────── */

/** Una riga del registro degli incassi, con lo sponsor a cui appartiene. */
export type SponsorCollectionRow = SponsorCollection & {
  sponsorId: string;
  sponsorName: string;
  sponsorKind: SponsorKind;
};

/** INCASSATO per una riga viva, STORNATO per le due facce di uno storno. */
export const collectionStatusSpec = (row: SponsorCollection): StatusSpec =>
  row.reversed ? MONEY_STATUS.reversed : MONEY_STATUS.paid;

/** La descrizione della riga, come la scheda V1 la componeva. */
export const collectionDescription = (row: SponsorCollection) =>
  text(row.notes) || text(row.counterpartyLabel) || "Incasso";

/** Si storna solo un incasso vivo e positivo: uno storno non si storna. */
export const canReverseCollection = (row: SponsorCollection) => !row.reversed && row.amountCents > 0;

/** Ricerca del registro: sponsor, descrizione, metodo. */
export const matchesCollectionSearch = (row: SponsorCollectionRow, query: string) => {
  const needle = text(query).toLowerCase();
  if (!needle) return true;
  return [row.sponsorName, row.notes, row.paymentMethod, row.counterpartyLabel]
    .map((value) => text(value).toLowerCase())
    .some((value) => value.includes(needle));
};

/**
 * Gli incassi vivi il cui giorno cade nel periodo (`yyyy-mm-dd`, estremi
 * compresi): la cifra «incassato stagione» dell'intestazione.
 */
export const sumCollectionsInPeriodCents = (
  rows: ReadonlyArray<SponsorCollection>,
  start: string | null | undefined,
  end: string | null | undefined,
) => {
  const from = parseDateInput(start || null);
  const to = parseDateInput(end || null);
  return rows.reduce((total, row) => {
    if (row.reversed) return total;
    const day = parseDateInput(row.paidAt);
    if (!day) return total;
    if (from && day < from) return total;
    if (to) {
      const endOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
      if (day > endOfDay) return total;
    }
    return total + row.amountCents;
  }, 0);
};

/* ── I documenti ────────────────────────────────────────────────────────── */

/** Un documento della scheda: titolo, descrizione, nome del file (mai caricato). */
export type SponsorDocument = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  created_at: string;
};

export const normalizeSponsorDocuments = (raw: unknown): SponsorDocument[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      id: text(item.id),
      title: text(item.title),
      description: text(item.description),
      fileName: text(item.fileName),
      created_at: text(item.created_at),
    }))
    .filter((item) => item.id);

/** Lo stesso identificativo della V1: `doc-<orologio>-<casuale>`. */
export const newSponsorDocument = (input: { title: string; description: string; fileName: string }): SponsorDocument => ({
  id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  title: text(input.title),
  description: text(input.description),
  fileName: text(input.fileName),
  created_at: new Date().toISOString(),
});

/** Lo stesso identificativo della V1 per un nuovo sponsor. */
export const newSponsorId = () => `sponsor-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
