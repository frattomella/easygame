import type {
  FilterDef,
  FilterValue,
  ViewDef,
} from "@/components/web/datagrid/types";
import {
  ATHLETE_STATUSES,
  ATHLETE_STATUS_PLURAL_LABELS,
  type AthleteStatus,
} from "@/lib/athletes/status";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-utils";
import { daysUntil } from "@/lib/web/format";
import {
  CERTIFICATE_STATUS,
  PERSON_STATUS,
  certificateStatusFromExpiry,
  type StatusSpec,
} from "@/lib/web/status";

/**
 * Il modello puro della griglia Atleti (Web V2, guideline 07).
 *
 * Qui vive cio che non disegna niente: la riga, la traduzione dei quattro
 * stati nel sistema di stato del Web V2, lo stato del certificato ricavato
 * dalla scadenza, le viste di sistema e i filtri. Le colonne — che
 * disegnano — stanno in `athletes-grid-columns.tsx`. Modulo importabile dai
 * test senza React.
 */

/**
 * Una riga dell'elenco: **un'appartenenza a categoria**, non una persona
 * (ADR-0055). Chi si allena con due gruppi compare due volte, e ogni conteggio
 * di persone deve deduplicare per `id`.
 */
export interface Athlete {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  categoryId: string | null;
  categoryLabel: string;
  membershipType: "primary" | "secondary";
  /** Sede in cui l'atleta svolge la categoria di questa riga (ADR-0038). */
  siteId: string;
  siteName: string;
  /**
   * Il **gruppo operativo** di questa riga: la coppia (categoria, sede), cioe
   * la squadra concreta. E l'unita con cui la pagina raggruppa l'elenco
   * (ADR-0055).
   */
  groupId: string;
  primaryCategoryLabel?: string;
  /** L'identificativo della primaria: la colonna scrive l'etichetta con l'indice della pagina (ADR-0185). */
  primaryCategoryId?: string | null;
  allCategoryLabels: string[];
  age: number;
  status: AthleteStatus;
  medicalCertExpiry: string;
  birthDate?: string;
  /** Il codice fiscale, se in scheda: l'import lo usa per riconoscere un duplicato (ADR-0195). */
  fiscalCode?: string;
  avatar?: string;
  accessCode?: string;
  jerseyNumber?: string;
  registrationComplete: boolean;
}

/**
 * La chiave di riga della griglia. Una persona con due tessere e due righe:
 * la chiave porta anche il gruppo, altrimenti la seconda riga sparirebbe
 * (stessa `key`) e una casella spuntata varrebbe per tutte e due.
 */
export const athleteRowKey = (row: Pick<Athlete, "id" | "groupId">) =>
  `${row.id}|${row.groupId}`;

/**
 * Da quattro stati dell'atleta (`src/lib/athletes/status.ts`) alle quattro
 * pillole del sistema (`src/lib/web/status.ts`). E l'unico punto in cui i due
 * vocabolari si toccano: la riga non scrive mai un'etichetta a mano.
 */
export const ATHLETE_STATUS_PILL: Record<AthleteStatus, StatusSpec> = {
  active: PERSON_STATUS.active,
  suspended: PERSON_STATUS.suspended,
  loan: PERSON_STATUS.on_loan,
  inactive: PERSON_STATUS.inactive,
};

/* ── Certificato medico ─────────────────────────────────────────────────── */
export type CertificateFilterKey = "valid" | "expiring" | "expired" | "missing";

export const CERTIFICATE_FILTER_LABELS: Record<CertificateFilterKey, string> = {
  valid: "Valido",
  expiring: "In scadenza",
  expired: "Scaduto",
  missing: "Mancante",
};

/** I giorni fra oggi e la scadenza; `null` senza scadenza. */
export const certificateDaysLeft = (
  expiry: string | null | undefined,
  today?: Date,
) => daysUntil(expiry || null, today);

/** La pillola del certificato a partire dalla scadenza (guideline 09 §9.4). */
export const athleteCertificateStatus = (
  expiry: string | null | undefined,
  today?: Date,
): StatusSpec =>
  certificateStatusFromExpiry(certificateDaysLeft(expiry, today));

/** La chiave di filtro che corrisponde alla pillola. */
export const certificateFilterKey = (
  expiry: string | null | undefined,
  today?: Date,
): CertificateFilterKey => {
  const spec = athleteCertificateStatus(expiry, today);
  if (spec === CERTIFICATE_STATUS.expired) return "expired";
  if (spec === CERTIFICATE_STATUS.expiring) return "expiring";
  if (spec === CERTIFICATE_STATUS.missing) return "missing";
  return "valid";
};

/* ── Viste di sistema ───────────────────────────────────────────────────── */
export const ATHLETE_STATUS_FILTER_ID = "stato";
export const ATHLETE_CATEGORY_FILTER_ID = "categoria";
export const ATHLETE_CERTIFICATE_FILTER_ID = "certificato";
export const ATHLETE_ENROLMENT_FILTER_ID = "iscrizione";

/** Una vista per stato: «Attivi» e quella di partenza, come il filtro della V1. */
export const ATHLETE_STATUS_VIEWS: ViewDef[] = ATHLETE_STATUSES.map(
  (stato) => ({
    id: `stato-${stato}`,
    label: ATHLETE_STATUS_PLURAL_LABELS[stato],
    filters: { [ATHLETE_STATUS_FILTER_ID]: stato },
    builtIn: true,
    isDefault: stato === "active",
  }),
);

/** Le due viste «problema»: portano la tinta del loro stato. */
export const ATHLETE_CERTIFICATE_VIEWS: ViewDef[] = [
  {
    id: "certificato-scaduto",
    label: "Certificato scaduto",
    filters: { [ATHLETE_CERTIFICATE_FILTER_ID]: "expired" },
    tone: "red",
    builtIn: true,
  },
  {
    id: "certificato-in-scadenza",
    label: "Certificato in scadenza",
    filters: { [ATHLETE_CERTIFICATE_FILTER_ID]: "expiring" },
    tone: "amber",
    builtIn: true,
  },
];

export const ATHLETE_VIEWS: ViewDef[] = [
  ...ATHLETE_STATUS_VIEWS,
  ...ATHLETE_CERTIFICATE_VIEWS,
];

/* ── Filtri ─────────────────────────────────────────────────────────────── */
const asList = (value: FilterValue): string[] =>
  Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? [value]
      : [];

/**
 * I filtri della barra strumenti. `includeStatus` e falso quando comanda il
 * server (archivio paginato): li lo stato si sceglie nella banda d'archivio e
 * un secondo filtro client farebbe sparire righe che il server ha appena
 * scelto di mandare.
 */
export const buildAthleteFilters = ({
  categoryOptions,
  includeStatus = true,
}: {
  categoryOptions: Array<{ value: string; label: string }>;
  includeStatus?: boolean;
}): FilterDef<Athlete>[] => {
  const filters: FilterDef<Athlete>[] = [];

  if (includeStatus) {
    filters.push({
      id: ATHLETE_STATUS_FILTER_ID,
      label: "Stato",
      type: "select",
      pinned: true,
      options: ATHLETE_STATUSES.map((stato) => ({
        value: stato,
        label: ATHLETE_STATUS_PLURAL_LABELS[stato],
      })),
      apply: (row, value) => !value || row.status === value,
    });
  }

  filters.push({
    id: ATHLETE_CATEGORY_FILTER_ID,
    label: "Categoria",
    type: "multi",
    options: [
      ...categoryOptions,
      { value: UNCATEGORIZED_CATEGORY_ID, label: "Senza categoria" },
    ],
    apply: (row, value) => {
      const wanted = asList(value);
      if (!wanted.length) return true;
      return wanted.includes(row.categoryId || UNCATEGORIZED_CATEGORY_ID);
    },
  });

  filters.push({
    id: ATHLETE_CERTIFICATE_FILTER_ID,
    label: "Certificato medico",
    type: "select",
    options: (
      Object.keys(CERTIFICATE_FILTER_LABELS) as CertificateFilterKey[]
    ).map((key) => ({
      value: key,
      label: CERTIFICATE_FILTER_LABELS[key],
      tone:
        key === "expired" || key === "missing"
          ? "red"
          : key === "expiring"
            ? "amber"
            : "green",
    })),
    apply: (row, value) =>
      !value || certificateFilterKey(row.medicalCertExpiry) === value,
  });

  filters.push({
    id: ATHLETE_ENROLMENT_FILTER_ID,
    label: "Iscrizione completata",
    type: "boolean",
    apply: (row, value) =>
      value === null ||
      value === undefined ||
      row.registrationComplete === value,
  });

  return filters;
};

/**
 * Il colore del puntino di gruppo. Il catalogo salva a volte una classe
 * Tailwind (`bg-blue-500 text-white`), a volte un colore CSS: solo il secondo
 * si puo mettere in uno `style`, per il resto vale il blu del sistema.
 */
export const categoryDotColor = (color: string | null | undefined): string => {
  const value = String(color || "").trim();
  if (
    /^#[0-9a-f]{3,8}$/i.test(value) ||
    /^(rgb|hsl)a?\(/i.test(value) ||
    /^var\(--/.test(value)
  ) {
    return value;
  }
  return "var(--egw-blue)";
};
