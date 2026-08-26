/**
 * La **configurazione fiscale di un'organizzazione**: profilo, serie di
 * numerazione, tipi di operazione. **Unico proprietario.**
 *
 * **Perche i tre stanno insieme.** Sono le tre cose che una societa dichiara
 * su di se prima di poter emettere un documento, e si leggono sempre insieme:
 * il motore fiscale ha bisogno di tutte e tre per proporre qualcosa. Tenerle
 * in tre moduli avrebbe voluto dire tre letture e tre punti in cui dimenticare
 * di seminare i valori iniziali.
 *
 * **Questo dominio e di proprieta del club**, e la differenza con il Blocco D
 * lato piattaforma e netta: le condizioni commerciali di EasyGame le decide
 * Cedi Soft, il proprio regime fiscale lo dichiara la societa. Nessuno dei due
 * puo scrivere nell'altro. Vedi ADR-0052.
 */

import { prisma } from "./prisma";
import {
  createEmptyFiscalProfile,
  normalizeFiscalProfile,
  validateFiscalProfile,
  type FiscalProfile,
  type FiscalProfileIssue,
} from "@/lib/fiscal/fiscal-profile";
import {
  OPERATION_TYPE_SEEDS,
  normalizeOperationType,
  type NormalizedOperationType,
} from "@/lib/fiscal/operation-types";
import {
  DOCUMENT_NUMBER_KIND_DEFINITIONS,
  normalizeSeriesCode,
  type DocumentNumberKind,
} from "@/lib/documents/numbering";

const asText = (value: unknown) => String(value ?? "").trim();

const profileClient = () => (prisma as any).organizationFiscalProfile;
const operationClient = () => (prisma as any).fiscalOperationType;
const seriesClient = () => (prisma as any).documentSeries;

/* ------------------------------------------------------------- profilo */

/**
 * Il profilo fiscale di un club.
 *
 * **Ripiega sull'anagrafica quando la riga non esiste ancora.** Un club creato
 * prima del Blocco D ha gia ragione sociale, partita IVA e indirizzo dentro
 * `clubs`: partire da li invece che da un modulo vuoto evita di far ridigitare
 * dati che l'applicazione ha gia. Il ripiego e **solo in lettura**: al primo
 * salvataggio nasce la riga, e da quel momento comanda lei.
 */
export const getFiscalProfile = async (
  organizationId: string,
): Promise<FiscalProfile> => {
  const id = asText(organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const row = await profileClient().findUnique({
    where: { organization_id: id },
  });

  if (row) return normalizeFiscalProfile(row);

  const club = await (prisma as any).club.findUnique({
    where: { id },
    select: {
      name: true,
      business_name: true,
      vat_number: true,
      fiscal_code: true,
      pec: true,
      sdi_code: true,
      tax_regime: true,
      legal_address: true,
      legal_city: true,
      legal_postal_code: true,
      legal_province: true,
      legal_country: true,
    },
  });

  if (!club) return createEmptyFiscalProfile();

  return normalizeFiscalProfile({
    legalName: club.business_name || club.name || "",
    vatNumber: club.vat_number || "",
    fiscalCode: club.fiscal_code || "",
    pec: club.pec || "",
    recipientCode: club.sdi_code || "",
    address: club.legal_address || "",
    city: club.legal_city || "",
    postalCode: club.legal_postal_code || "",
    province: club.legal_province || "",
    country: club.legal_country === "Italia" ? "IT" : club.legal_country || "IT",
  });
};

export type SaveFiscalProfileResult = {
  profile: FiscalProfile;
  issues: FiscalProfileIssue[];
};

/**
 * Scrive il profilo fiscale.
 *
 * **Rifiuta cio che e scritto male, accetta cio che e incompleto.** Un profilo
 * a meta e la condizione normale di una societa che sta configurando
 * EasyGame; una partita IVA di dieci cifre e un errore che, salvato, si
 * ripresenta come scarto dello SdI mesi dopo.
 */
export const saveFiscalProfile = async (input: {
  organizationId: string;
  profile: unknown;
  markCompleted?: boolean;
}): Promise<SaveFiscalProfileResult> => {
  const id = asText(input.organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const profile = normalizeFiscalProfile(input.profile);
  const issues = validateFiscalProfile(profile);

  if (issues.length) {
    const error: any = new Error(`${issues[0].path}: ${issues[0].message}`);
    error.issues = issues;
    throw error;
  }

  const data = {
    legal_name: profile.legalName || null,
    legal_form: profile.legalForm,
    fiscal_code: profile.fiscalCode || null,
    vat_number: profile.vatNumber || null,
    tax_regime_code: profile.taxRegimeCode || null,
    special_regimes: profile.specialRegimes,
    address: profile.address || null,
    city: profile.city || null,
    province: profile.province || null,
    postal_code: profile.postalCode || null,
    country: profile.country || "IT",
    city_code: profile.cityCode || null,
    pec: profile.pec || null,
    recipient_code: profile.recipientCode || null,
    rea_office: profile.reaOffice || null,
    rea_number: profile.reaNumber || null,
    rea_capital: profile.reaCapital,
    rea_sole_shareholder: profile.reaSoleShareholder,
    rea_in_liquidation: profile.reaInLiquidation,
    stamp_duty: profile.stampDuty,
    settings: profile.settings,
    ...(input.markCompleted ? { completed_at: new Date() } : {}),
  };

  const row = await profileClient().upsert({
    where: { organization_id: id },
    create: { organization_id: id, ...data },
    update: data,
  });

  return { profile: normalizeFiscalProfile(row), issues: [] };
};

/* ------------------------------------------------------ tipi operazione */

/**
 * I tipi di operazione di un club, seminando il catalogo iniziale al primo
 * accesso.
 *
 * **Perche la semina e qui e non in una migrazione.** Una migrazione che
 * inserisse nove righe per ogni club esistente sarebbe una scrittura di massa
 * su dati di produzione per una funzione che nessuno ha ancora aperto. Qui le
 * righe nascono quando servono, e per i club che non useranno mai la
 * classificazione non nascono affatto.
 */
export const listOperationTypes = async (
  organizationId: string,
  options: { seed?: boolean } = {},
): Promise<NormalizedOperationType[]> => {
  const id = asText(organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const rows = await operationClient().findMany({
    where: { organization_id: id },
    orderBy: { code: "asc" },
  });

  if (rows.length || options.seed === false) {
    return rows.map(normalizeOperationType);
  }

  await operationClient().createMany({
    data: OPERATION_TYPE_SEEDS.map((seed) => ({
      organization_id: id,
      code: seed.code,
      label: seed.label,
      document_route: seed.documentRoute,
      activity_scope: seed.activityScope,
      is_system: true,
      notes: seed.notes || null,
    })),
    /*
      Due richieste simultanee sulla stessa societa proverebbero a seminare
      entrambe. La seconda non deve fallire: il catalogo c'e comunque.
    */
    skipDuplicates: true,
  });

  const seeded = await operationClient().findMany({
    where: { organization_id: id },
    orderBy: { code: "asc" },
  });

  return seeded.map(normalizeOperationType);
};

export const getOperationType = async (input: {
  organizationId: string;
  code: unknown;
}): Promise<NormalizedOperationType | null> => {
  const code = asText(input.code);
  if (!code) return null;

  const row = await operationClient().findFirst({
    where: { organization_id: asText(input.organizationId), code },
  });

  return row ? normalizeOperationType(row) : null;
};

/**
 * Aggiorna la configurazione di un tipo di operazione.
 *
 * **Il codice non si cambia mai.** E la chiave con cui gli incassi gia
 * registrati citano la classificazione: cambiarlo li lascerebbe a citare
 * qualcosa che non esiste piu. Si disattiva e se ne crea un altro.
 */
export const saveOperationType = async (input: {
  organizationId: string;
  code: string;
  updates: unknown;
}): Promise<NormalizedOperationType> => {
  const id = asText(input.organizationId);
  const code = asText(input.code);
  if (!id || !code) throw new Error("Accesso negato: operazione senza club");

  const normalized = normalizeOperationType({ ...(input.updates as any), code });

  const data = {
    label: normalized.label || code,
    document_route: normalized.documentRoute,
    vat_rate: normalized.vatRate,
    vat_nature: normalized.vatNature,
    activity_scope: normalized.activityScope,
    is_active: normalized.isActive,
    notes: normalized.notes,
  };

  const row = await operationClient().upsert({
    where: { organization_id_code: { organization_id: id, code } },
    create: { organization_id: id, code, ...data },
    update: data,
  });

  return normalizeOperationType(row);
};

/* ------------------------------------------------------------- le serie */

export type DocumentSeriesRecord = {
  id: string;
  kind: DocumentNumberKind;
  code: string;
  label: string;
  prefix: string;
  isDefault: boolean;
  isActive: boolean;
};

const toSeries = (row: any): DocumentSeriesRecord => ({
  id: String(row.id),
  kind: row.kind as DocumentNumberKind,
  code: normalizeSeriesCode(row.code),
  label: asText(row.label),
  prefix: asText(row.prefix),
  isDefault: Boolean(row.is_default),
  isActive: Boolean(row.is_active),
});

/**
 * Le serie di un club per un tipo di documento.
 *
 * Chi non ne ha configurata nessuna ne ha comunque una: quella predefinita,
 * con codice vuoto, che e la serie in cui e stato emesso tutto fino a oggi. La
 * si restituisce senza scriverla, perche una societa che non sa cosa sia una
 * serie non deve trovarsene una in elenco.
 */
export const listDocumentSeries = async (input: {
  organizationId: string;
  kind: DocumentNumberKind;
}): Promise<DocumentSeriesRecord[]> => {
  const id = asText(input.organizationId);
  const rows: any[] = await seriesClient().findMany({
    where: { organization_id: id, kind: input.kind },
    orderBy: [{ is_default: "desc" }, { code: "asc" }],
  });

  const configured: DocumentSeriesRecord[] = rows.map(toSeries);
  if (configured.some((entry) => entry.code === "")) return configured;

  return [
    {
      id: "",
      kind: input.kind,
      code: "",
      label: `${DOCUMENT_NUMBER_KIND_DEFINITIONS[input.kind].label} — serie predefinita`,
      prefix: DOCUMENT_NUMBER_KIND_DEFINITIONS[input.kind].prefix,
      isDefault: !configured.some((entry) => entry.isDefault),
      isActive: true,
    },
    ...configured,
  ];
};

/** La serie da usare quando chi emette non ne indica una. */
export const resolveDefaultSeries = async (input: {
  organizationId: string;
  kind: DocumentNumberKind;
}): Promise<string> => {
  const row = await seriesClient().findFirst({
    where: {
      organization_id: asText(input.organizationId),
      kind: input.kind,
      is_default: true,
      is_active: true,
    },
  });

  return normalizeSeriesCode(row?.code);
};

/**
 * Crea o aggiorna una serie.
 *
 * **Una sola predefinita per tipo.** La transazione toglie il segno alle altre
 * prima di metterlo a questa: due serie predefinite renderebbero indeterminato
 * quale numero prende il prossimo documento, e l'indeterminatezza in una
 * numerazione e esattamente cio che non si puo avere.
 */
export const saveDocumentSeries = async (input: {
  organizationId: string;
  kind: DocumentNumberKind;
  code: string;
  label: string;
  prefix?: string;
  isDefault?: boolean;
  isActive?: boolean;
}): Promise<DocumentSeriesRecord> => {
  const id = asText(input.organizationId);
  if (!id) throw new Error("Accesso negato: serie senza club");

  const code = normalizeSeriesCode(input.code);
  const prefix =
    asText(input.prefix).toUpperCase() ||
    DOCUMENT_NUMBER_KIND_DEFINITIONS[input.kind].prefix;

  return (prisma as any).$transaction(async (tx: any) => {
    if (input.isDefault) {
      await tx.documentSeries.updateMany({
        where: { organization_id: id, kind: input.kind },
        data: { is_default: false },
      });
    }

    const data = {
      label: asText(input.label) || code || "Serie predefinita",
      prefix,
      is_default: Boolean(input.isDefault),
      is_active: input.isActive === undefined ? true : Boolean(input.isActive),
    };

    const row = await tx.documentSeries.upsert({
      where: {
        organization_id_kind_code: {
          organization_id: id,
          kind: input.kind,
          code,
        },
      },
      create: { organization_id: id, kind: input.kind, code, ...data },
      update: data,
    });

    return toSeries(row);
  });
};
