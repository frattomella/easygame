import type {
  FilterDef,
  FilterValue,
  ViewDef,
} from "@/components/web/datagrid/types";
import { getMedicalCertificateStatus } from "@/lib/medical-certificates";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import {
  athleteMatchesAnyCategory,
  selectableCategoryOptions,
} from "@/lib/category-utils";
import { normalizeAthleteCategoryMemberships } from "@/lib/athlete-category-memberships";
import {
  buildCategoryDisplayIndex,
  type CategoryGroupLike,
} from "@/lib/categories/display";
import {
  getAthleteSiteIds,
  recordMatchesSite,
  type SiteIndex,
} from "@/lib/club-sites";
import { daysUntil } from "@/lib/web/format";
import { CERTIFICATE_STATUS, type StatusSpec } from "@/lib/web/status";

/**
 * Il modello puro dell'elenco Certificati medici (Web V2, guideline 07).
 *
 * Qui vive cio che non disegna niente: la riga, la derivazione «un
 * certificato per atleta» che la V1 faceva dentro l'effetto di fetch, le
 * viste di sistema, i filtri e l'esito di un promemoria. Le colonne stanno
 * in `certificate-grid-columns.tsx`. Modulo importabile dai test senza React.
 *
 * **La soglia «in scadenza» resta quella di `/medical`**: un mese di
 * calendario da oggi (`getMedicalCertificateStatus`, `setMonth(-1)`), non i
 * trenta giorni fissi della Dashboard (`CERTIFICATE_WARNING_DAYS`). Su un mese
 * di 31 giorni le due superfici possono differire per un giorno: l'audit lo
 * segnala (§2.4) e questa pagina non cambia la propria regola di nascosto.
 */
export type CertificateRowStatus = "valid" | "expiring" | "expired" | "missing";

export interface CertificateRow {
  /** L'identificativo del certificato, oppure `missing-<atleta>` per la riga sintetica. */
  id: string;
  athleteId: string;
  athleteName: string;
  certificateType: string;
  issueDate: string;
  expiryDate: string;
  status: CertificateRowStatus;
  fileUrl?: string;
  avatar?: string;
  categoryId: string | null;
  categoryLabel: string;
  siteIds: string[];
  siteName: string;
  /**
   * La scheda grezza: il filtro per categoria confronta per **identita**
   * (`athleteMatchesAnyCategory` con il catalogo, ADR-0155), e per farlo gli
   * serve l'atleta com'e, non una etichetta.
   */
  athlete: unknown;
}

export const MISSING_CERTIFICATE_TYPE = "Certificato Medico Mancante";
export const MISSING_ROW_PREFIX = "missing-";

export const isMissingRowId = (id: string) => id.startsWith(MISSING_ROW_PREFIX);

/** Da quattro stati della V1 alle quattro pillole del sistema (guideline 09 §9.4). */
export const CERTIFICATE_ROW_PILL: Record<CertificateRowStatus, StatusSpec> = {
  valid: CERTIFICATE_STATUS.valid,
  expiring: CERTIFICATE_STATUS.expiring,
  expired: CERTIFICATE_STATUS.expired,
  missing: CERTIFICATE_STATUS.missing,
};

/** Le etichette in frase (filtri, esportazioni, toast) — le stesse parole dei badge V1. */
export const CERTIFICATE_ROW_LABELS: Record<CertificateRowStatus, string> = {
  valid: "Valido",
  expiring: "In scadenza",
  expired: "Scaduto",
  missing: "Mancante",
};

export const CERTIFICATE_ROW_PLURAL_LABELS: Record<CertificateRowStatus, string> = {
  valid: "Validi",
  expiring: "In scadenza",
  expired: "Scaduti",
  missing: "Mancanti",
};

export const CERTIFICATE_ROW_STATUSES: readonly CertificateRowStatus[] = [
  "valid",
  "expiring",
  "expired",
  "missing",
];

const STATUS_TONE: Record<CertificateRowStatus, "green" | "amber" | "red"> = {
  valid: "green",
  expiring: "amber",
  expired: "red",
  missing: "red",
};

/** I tipi che il modulo di registrazione propone (`AddCertificateForm`). */
export const CERTIFICATE_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "Agonistico", label: "Certificato Agonistico" },
  { value: "Non Agonistico", label: "Certificato Non Agonistico" },
  {
    value: "Sana e Robusta Costituzione",
    label: "Certificato di Sana e Robusta Costituzione",
  },
];

/** I giorni fra oggi e la scadenza; `null` senza scadenza. */
export const certificateDaysLeft = (row: Pick<CertificateRow, "expiryDate">, today?: Date) =>
  daysUntil(row.expiryDate || null, today);

/** Il promemoria ha senso solo dove il certificato non copre: la stessa regola del pulsante V1. */
export const isReminderEligible = (row: Pick<CertificateRow, "status">) =>
  row.status !== "valid";

export const hasCertificateFile = (row: Pick<CertificateRow, "status" | "fileUrl">) =>
  row.status !== "missing" &&
  typeof row.fileUrl === "string" &&
  row.fileUrl.trim().length > 0;

/* ── Derivazione delle righe (la logica dell'effetto V1) ─────────────────── */
export type MedicalAthleteRecord = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  profile_image?: string | null;
  data?:
    | ({
        avatar?: string | null;
        medicalCertExpiry?: string | null;
      } & Record<string, unknown>)
    | null;
  [key: string]: unknown;
};

export type MedicalCertificateRecord = {
  id: string;
  athlete_id: string;
  notes?: string | null;
  type?: string | null;
  issue_date: string;
  expiry_date: string;
  file_url?: string | null;
  document_url?: string | null;
};

type CategoryCatalogOption = { id: string; name: string; configured?: boolean | null };

/** Il piu recente fra emissione e scadenza: e cio che decide quale certificato tenere. */
export const getCertificateSortTime = (
  certificate: Pick<CertificateRow, "expiryDate" | "issueDate">,
) => {
  const expiryTime = certificate.expiryDate ? new Date(certificate.expiryDate).getTime() : 0;
  const issueTime = certificate.issueDate ? new Date(certificate.issueDate).getTime() : 0;
  return Math.max(expiryTime, issueTime, 0);
};

const describeAthlete = (
  athlete: MedicalAthleteRecord,
  categories: readonly CategoryCatalogOption[],
  siteIndex: SiteIndex | null,
  display: ReturnType<typeof buildCategoryDisplayIndex>,
) => {
  const catalog = [...categories];
  const memberships = normalizeAthleteCategoryMemberships(athlete, catalog);
  const membership = memberships.find((item) => item.isPrimary) || memberships[0] || null;
  const categoryId = membership?.categoryId || null;
  /* L'etichetta canonica (ADR-0185): mai un identificativo, la sede dove serve. */
  const categoryLabel = membership
    ? display.label({ categoryId: membership.categoryId, categoryName: membership.categoryName })
    : "Senza categoria";
  const siteIds = siteIndex ? getAthleteSiteIds(athlete, siteIndex) : [];
  const siteName = siteIndex
    ? siteIds.map((id) => siteIndex.getSiteName(id)).filter(Boolean).join(" · ")
    : "";
  return {
    athleteName: getAthleteDisplayName(athlete) || "Atleta Sconosciuto",
    avatar: athlete.profile_image || athlete.data?.avatar || "",
    categoryId,
    categoryLabel,
    siteIds,
    siteName,
    athlete,
  };
};

/**
 * Una riga per atleta: il certificato piu recente, oppure la riga sintetica
 * «mancante». E la stessa derivazione della V1, spostata fuori dall'effetto
 * perche si possa provare.
 */
export const buildCertificateRows = ({
  athletes,
  certificates,
  categories = [],
  groups = [],
  siteIndex = null,
  today,
}: {
  athletes: readonly MedicalAthleteRecord[];
  certificates: readonly MedicalCertificateRecord[];
  categories?: readonly CategoryCatalogOption[];
  /** I gruppi operativi costruiti (`buildCategoryGroups`): servono a scrivere la sede. */
  groups?: readonly CategoryGroupLike[];
  siteIndex?: SiteIndex | null;
  today?: Date;
}): CertificateRow[] => {
  const display = buildCategoryDisplayIndex({ categories, groups, sites: siteIndex?.sites });
  const byAthlete = new Map<string, CertificateRow>();
  const athletesById = new Map(athletes.map((athlete) => [athlete.id, athlete]));

  for (const cert of certificates) {
    const athlete = athletesById.get(cert.athlete_id);
    if (!athlete) continue;
    const candidate: CertificateRow = {
      id: cert.id,
      athleteId: cert.athlete_id,
      certificateType: cert.notes || cert.type || "Certificato Medico",
      issueDate: cert.issue_date,
      expiryDate: cert.expiry_date,
      status: getMedicalCertificateStatus(cert.expiry_date, today),
      fileUrl: cert.file_url || cert.document_url || "",
      ...describeAthlete(athlete, categories, siteIndex, display),
    };
    const current = byAthlete.get(athlete.id);
    if (!current || getCertificateSortTime(candidate) >= getCertificateSortTime(current)) {
      byAthlete.set(athlete.id, candidate);
    }
  }

  for (const athlete of athletes) {
    if (byAthlete.has(athlete.id)) continue;
    byAthlete.set(athlete.id, {
      id: `${MISSING_ROW_PREFIX}${athlete.id}`,
      athleteId: athlete.id,
      certificateType: MISSING_CERTIFICATE_TYPE,
      issueDate: "",
      expiryDate: "",
      status: "missing",
      fileUrl: "",
      ...describeAthlete(athlete, categories, siteIndex, display),
    });
  }

  return Array.from(byAthlete.values());
};

/** Sostituisce la riga di un atleta con il certificato appena registrato. */
export const upsertCertificateByAthlete = (
  rows: readonly CertificateRow[],
  next: CertificateRow,
): CertificateRow[] => [...rows.filter((row) => row.athleteId !== next.athleteId), next];

export const countCertificatesByStatus = (rows: readonly CertificateRow[]) => {
  const counts: Record<CertificateRowStatus, number> = {
    valid: 0,
    expiring: 0,
    expired: 0,
    missing: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
};

/* ── Viste di sistema ───────────────────────────────────────────────────── */
export const CERTIFICATE_STATUS_FILTER_ID = "stato";
export const CERTIFICATE_CATEGORY_FILTER_ID = "categoria";
export const CERTIFICATE_SITE_FILTER_ID = "sede";
export const CERTIFICATE_TYPE_FILTER_ID = "tipo";
export const CERTIFICATE_EXPIRY_FILTER_ID = "scadenza";

export const CERTIFICATE_VIEW_IDS: Record<CertificateRowStatus, string> = {
  valid: "validi",
  expiring: "in-scadenza",
  expired: "scaduti",
  missing: "mancanti",
};

/**
 * Le schede della V1 (Tutti · Validi · In Scadenza · Scaduti · Mancanti)
 * diventano viste: «Tutti» la mette la griglia, le altre quattro sono qui.
 * Una vista che significa un problema porta la sua tinta (guideline 07 §7.2).
 * «Da approvare» non c'e perche il dato non esiste: nessun certificato porta
 * uno stato di approvazione.
 */
export const CERTIFICATE_VIEWS: ViewDef[] = CERTIFICATE_ROW_STATUSES.map((status) => ({
  id: CERTIFICATE_VIEW_IDS[status],
  label: CERTIFICATE_ROW_PLURAL_LABELS[status],
  filters: { [CERTIFICATE_STATUS_FILTER_ID]: status },
  builtIn: true,
  tone: status === "valid" ? "neutral" : status === "expiring" ? "amber" : "red",
}));

/* ── Filtri ─────────────────────────────────────────────────────────────── */
const asList = (value: FilterValue): string[] =>
  Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];

const dayOf = (value: string) => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || "").trim());
  return match ? match[1] : "";
};

export const buildCertificateFilters = ({
  categoryOptions,
  categoryLabel = (category) => category.name,
  sites = [],
  typeOptions = CERTIFICATE_TYPE_OPTIONS,
}: {
  categoryOptions: readonly CategoryCatalogOption[];
  /** Come si scrive una categoria nel filtro (ADR-0185). */
  categoryLabel?: (category: CategoryCatalogOption) => string;
  sites?: ReadonlyArray<{ id: string; name: string }>;
  typeOptions?: ReadonlyArray<{ value: string; label: string }>;
}): FilterDef<CertificateRow>[] => {
  const filters: FilterDef<CertificateRow>[] = [
    {
      id: CERTIFICATE_STATUS_FILTER_ID,
      label: "Stato",
      type: "select",
      pinned: true,
      options: CERTIFICATE_ROW_STATUSES.map((status) => ({
        value: status,
        label: CERTIFICATE_ROW_LABELS[status],
        tone: STATUS_TONE[status],
      })),
      apply: (row, value) => !value || row.status === value,
    },
    {
      id: CERTIFICATE_CATEGORY_FILTER_ID,
      label: "Categoria",
      type: "multi",
      /* Solo le configurate: un'etichetta storica non e un filtro (ADR-0185). */
      options: selectableCategoryOptions(categoryOptions).map((category) => ({
        value: category.id,
        label: categoryLabel(category),
      })),
      apply: (row, value) => {
        const wanted = asList(value);
        if (!wanted.length) return true;
        /*
          **Il catalogo, e qui pesa piu che altrove** (ADR-0155, `D-AUD-27`).
          Senza catalogo il confronto cade sull'etichetta, e «Under 15» di
          Formia fa comparire anche i ragazzi di Scauri: su questa schermata
          cio che compare e lo stato sanitario di un minore, e un filtro che
          allarga non e un filtro impreciso.
        */
        const chosen = categoryOptions.filter((category) => wanted.includes(category.id));
        return athleteMatchesAnyCategory(row.athlete, chosen, categoryOptions);
      },
    },
  ];

  if (sites.length) {
    filters.push({
      id: CERTIFICATE_SITE_FILTER_ID,
      label: "Sede",
      type: "select",
      options: sites.map((site) => ({ value: site.id, label: site.name })),
      apply: (row, value) =>
        !value || typeof value !== "string" || recordMatchesSite(row.siteIds, value),
    });
  }

  filters.push({
    id: CERTIFICATE_TYPE_FILTER_ID,
    label: "Tipo certificato",
    type: "select",
    options: typeOptions.map((type) => ({ value: type.value, label: type.label })),
    apply: (row, value) => !value || row.certificateType === value,
  });

  filters.push({
    id: CERTIFICATE_EXPIRY_FILTER_ID,
    label: "Scadenza",
    type: "date-range",
    apply: (row, value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return true;
      const day = dayOf(row.expiryDate);
      if (value.from && (!day || day < value.from)) return false;
      if (value.to && (!day || day > value.to)) return false;
      return true;
    },
    formatValue: (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return "";
      if (value.from && value.to) return `${value.from} → ${value.to}`;
      if (value.from) return `dal ${value.from}`;
      if (value.to) return `fino al ${value.to}`;
      return "";
    },
  });

  return filters;
};

/**
 * Le opzioni del filtro «Tipo»: i tre del modulo piu i tipi che l'archivio
 * porta davvero (un certificato importato puo dire «Certificato Medico»).
 */
export const collectCertificateTypeOptions = (rows: readonly CertificateRow[]) => {
  const options = new Map(CERTIFICATE_TYPE_OPTIONS.map((type) => [type.value, type.label]));
  for (const row of rows) {
    const type = String(row.certificateType || "").trim();
    if (!type || type === MISSING_CERTIFICATE_TYPE || options.has(type)) continue;
    options.set(type, type);
  }
  return Array.from(options, ([value, label]) => ({ value, label }));
};

/* ── Promemoria ─────────────────────────────────────────────────────────── */
export type ReminderApiResponse = { created?: number; skipped?: number; recipients?: number };

export type ReminderOutcomeKind = "sent" | "already" | "no_recipients" | "failed";

export interface ReminderOutcome {
  kind: ReminderOutcomeKind;
  /** La causa, per l'esito riga per riga. */
  reason?: string;
}

/** Le parole della V1 per l'esito di un promemoria singolo. */
export const REMINDER_MESSAGES = {
  sent: (name: string) => `Promemoria inviato a ${name}`,
  already: "Promemoria gia presente per questo certificato",
  no_recipients: "Nessun parent collegato a questo atleta",
} as const;

export const classifyReminderResponse = (response: ReminderApiResponse | null | undefined): ReminderOutcome => {
  const created = Number(response?.created || 0);
  const skipped = Number(response?.skipped || 0);
  if (created > 0) return { kind: "sent" };
  if (skipped > 0) return { kind: "already", reason: REMINDER_MESSAGES.already };
  return { kind: "no_recipients", reason: REMINDER_MESSAGES.no_recipients };
};

/** Il corpo della `POST /api/medical-certificate-reminders`, come lo mandava la V1. */
export const buildReminderPayload = (
  row: Pick<CertificateRow, "id" | "athleteId">,
  organizationId: string,
) => ({
  athleteId: row.athleteId,
  certificateId: isMissingRowId(row.id) ? undefined : row.id,
  organizationId,
});
