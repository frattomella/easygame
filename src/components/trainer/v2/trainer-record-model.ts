import {
  ACCOUNT_STATUS,
  CERTIFICATE_STATUS,
  PERSON_STATUS,
  certificateStatusFromExpiry,
  type StatusSpec,
} from "@/lib/web/status";
import { daysUntil } from "@/lib/web/format";

/**
 * Il modello puro della scheda allenatore V2: nessun React, nessun `window`.
 *
 * Qui vivono le derivazioni che la V1 teneva dentro `page.tsx` (stato
 * dell'accesso EasyGame, formattazione del token, aree ↔ vecchie tab) cosi
 * che l'elenco e la scheda leggano lo stesso dato allo stesso modo, e un test
 * possa verificarle senza montare una pagina.
 */

/* ── Stato dell'allenatore ──────────────────────────────────────────────── */
export type TrainerStatus = "active" | "suspended";

export const normalizeTrainerStatusValue = (value: unknown): TrainerStatus => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["suspended", "inactive", "disabled", "sospeso"].includes(normalized)
    ? "suspended"
    : "active";
};

export const trainerStatusSpec = (value: unknown): StatusSpec =>
  normalizeTrainerStatusValue(value) === "suspended"
    ? PERSON_STATUS.suspended
    : PERSON_STATUS.active;

/* ── Accesso EasyGame ───────────────────────────────────────────────────── */
export type TrainerAccessKey =
  | "linked"
  | "revoked"
  | "redeemed"
  | "expired"
  | "token"
  | "none";

export type TrainerAccessRecord = {
  linkedUserId?: string | null;
  linked_user_id?: string | null;
  accessTokenStatus?: string | null;
  access_token_status?: string | null;
  accessTokenValue?: string | null;
  access_token_value?: string | null;
  token?: string | null;
  accessTokenRecordId?: string | null;
  access_token_record_id?: string | null;
  accessTokenExpiresAt?: string | null;
  access_token_expires_at?: string | null;
};

export type TrainerAccessMeta = {
  key: TrainerAccessKey;
  /** L'etichetta di sezione che la V1 mostrava come badge. */
  label: string;
  /** La pillola di sistema (`ACCOUNT_STATUS`). */
  status: StatusSpec;
  description: string;
};

const ACCESS_META: Record<TrainerAccessKey, Omit<TrainerAccessMeta, "key">> = {
  linked: {
    label: "Account collegato",
    status: ACCOUNT_STATUS.linked,
    description:
      "Questo allenatore ha già collegato il proprio account EasyGame al club.",
  },
  revoked: {
    label: "Scollegato",
    status: ACCOUNT_STATUS.revoked,
    description:
      "Il collegamento precedente è stato revocato dal club. Per consentire un nuovo accesso genera un altro token.",
  },
  redeemed: {
    label: "Token usato",
    status: ACCOUNT_STATUS.linked,
    description: "Il token è stato già riscattato e l'accesso è attivo.",
  },
  expired: {
    label: "Token scaduto",
    status: ACCOUNT_STATUS.none,
    description:
      "Rigenera un nuovo token se l'allenatore deve ancora collegare il suo account.",
  },
  token: {
    label: "Token attivo",
    status: ACCOUNT_STATUS.invited,
    description:
      "Condividi questo token temporaneo all'allenatore: dovrà inserirlo nella home account, sezione accessi.",
  },
  none: {
    label: "Non collegato",
    status: ACCOUNT_STATUS.none,
    description:
      "Genera un token temporaneo da condividere all'allenatore dopo la creazione del suo account EasyGame.",
  },
};

const pick = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
};

/**
 * Lo stato dell'accesso, con le stesse sei letture della V1
 * (`getTrainerAccessStatusMeta`): collegato · scollegato · token usato · token
 * scaduto · token attivo · non collegato, in quest'ordine di precedenza.
 */
export const resolveTrainerAccess = (
  trainer: TrainerAccessRecord | null | undefined,
  now: number = Date.now(),
): TrainerAccessMeta => {
  const linkedUserId = pick(trainer?.linkedUserId, trainer?.linked_user_id);
  const status = pick(trainer?.accessTokenStatus, trainer?.access_token_status).toLowerCase();
  const tokenValue = pick(trainer?.accessTokenValue, trainer?.access_token_value, trainer?.token);
  const recordId = pick(trainer?.accessTokenRecordId, trainer?.access_token_record_id);
  const expiresRaw = pick(trainer?.accessTokenExpiresAt, trainer?.access_token_expires_at);
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  const isExpired = Boolean(
    expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now,
  );

  let key: TrainerAccessKey = "none";
  if (linkedUserId) key = "linked";
  else if (["revoked", "unlinked", "disconnected"].includes(status)) key = "revoked";
  else if (status === "redeemed") key = "redeemed";
  else if ((status === "expired" || isExpired) && recordId) key = "expired";
  else if (tokenValue && recordId) key = "token";

  return { key, ...ACCESS_META[key] };
};

/** L'etichetta dell'opzione di filtro «Accesso» dell'elenco. */
export type TrainerAccessFilter = "linked" | "invited" | "none";

export const trainerAccessFilterOf = (meta: TrainerAccessMeta): TrainerAccessFilter => {
  if (meta.key === "linked" || meta.key === "redeemed") return "linked";
  if (meta.key === "token") return "invited";
  return "none";
};

export const TRAINER_ACCESS_FILTER_OPTIONS: ReadonlyArray<{
  value: TrainerAccessFilter;
  label: string;
}> = [
  { value: "linked", label: "Collegato" },
  { value: "invited", label: "Invitato" },
  { value: "none", label: "Senza accesso" },
];

/* ── Token ──────────────────────────────────────────────────────────────── */
export const TOKEN_EXPIRY_HOURS = 72;

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** `TRN` + nove simboli senza caratteri ambigui (la stessa forma della V1). */
export const createTrainerAccessToken = (
  random: (length: number) => number[] = (length) => {
    const bytes = new Uint32Array(length);
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes);
    }
    return Array.from({ length }, () => Math.floor(Math.random() * TOKEN_ALPHABET.length));
  },
) =>
  `TRN${random(9)
    .map((value) => TOKEN_ALPHABET[value % TOKEN_ALPHABET.length])
    .join("")}`;

/** `TRNA-BCD2-…` a gruppi di quattro; `—` se manca. */
export const formatTrainerAccessToken = (value?: string | null) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
  if (!normalized) return "—";
  return normalized.match(/.{1,4}/g)?.join("-") || normalized;
};

/* ── Aree della scheda (le sette tab della V1 → quattro aree) ──────────── */
export type TrainerArea = "profilo" | "club" | "documenti" | "compensi";

export const TRAINER_AREAS: ReadonlyArray<{ value: TrainerArea; label: string }> = [
  { value: "profilo", label: "Profilo" },
  { value: "club", label: "Club e accesso" },
  { value: "documenti", label: "Documenti e sanità" },
  { value: "compensi", label: "Lavoro e compensi" },
];

/**
 * Le vecchie `?tab=` continuano a funzionare: ognuna atterra nell'area che
 * ne ha ereditato le sezioni. «Presenze» non aveva dati (mai popolata) e non
 * ha un'area propria: porta a «Club e accesso», dove stanno le categorie.
 */
export const LEGACY_TAB_TO_AREA: Record<string, TrainerArea> = {
  anagrafica: "profilo",
  pagamenti: "compensi",
  accesso: "club",
  societari: "club",
  medici: "documenti",
  presenze: "club",
  lavoro: "compensi",
};

export const resolveTrainerArea = (
  value: string | null | undefined,
  fallback: TrainerArea = "profilo",
): TrainerArea => {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return fallback;
  if (TRAINER_AREAS.some((area) => area.value === key)) return key as TrainerArea;
  return LEGACY_TAB_TO_AREA[key] ?? fallback;
};

/* ── Avvisi della scheda ────────────────────────────────────────────────── */
export type TrainerRecordAlert = {
  id: string;
  severity: "danger" | "warning";
  text: string;
  /** Dove si risolve. */
  area: TrainerArea;
  /** Il verbo che lo risolve. */
  action: string;
};

export const medicalVisitStatus = (
  expiry: string | null | undefined,
  today: Date = new Date(),
): StatusSpec => certificateStatusFromExpiry(daysUntil(expiry, today), { expiringWithinDays: 30 });

/**
 * Cio che va sistemato, dai dati gia caricati: accesso mancante, visita
 * medica scaduta o in scadenza, documento d'identita scaduto, documenti
 * scaduti. Una scheda in ordine non mostra niente.
 */
export const deriveTrainerRecordAlerts = (input: {
  access: TrainerAccessMeta;
  medicalVisitExpiry?: string | null;
  documentExpiry?: string | null;
  expiredDocuments: number;
  today?: Date;
}): TrainerRecordAlert[] => {
  const today = input.today ?? new Date();
  const alerts: TrainerRecordAlert[] = [];

  if (input.access.key !== "linked" && input.access.key !== "redeemed") {
    alerts.push({
      id: "access",
      severity: "warning",
      text:
        input.access.key === "token"
          ? "Token di accesso generato, ma non ancora riscattato"
          : "Nessun account EasyGame collegato: l'allenatore non vede la sua area",
      area: "club",
      action: input.access.key === "token" ? "Copia token" : "Genera token",
    });
  }

  const visit = medicalVisitStatus(input.medicalVisitExpiry, today);
  if (visit === CERTIFICATE_STATUS.expired) {
    alerts.push({
      id: "medical-expired",
      severity: "danger",
      text: "Visita medica scaduta",
      area: "documenti",
      action: "Aggiorna visita",
    });
  } else if (visit === CERTIFICATE_STATUS.expiring) {
    const days = daysUntil(input.medicalVisitExpiry, today) ?? 0;
    alerts.push({
      id: "medical-expiring",
      severity: "warning",
      text: `Visita medica in scadenza fra ${days} ${days === 1 ? "giorno" : "giorni"}`,
      area: "documenti",
      action: "Aggiorna visita",
    });
  }

  const documentDays = daysUntil(input.documentExpiry, today);
  if (documentDays !== null && documentDays < 0) {
    alerts.push({
      id: "identity-document",
      severity: "warning",
      text: "Documento d'identità scaduto",
      area: "profilo",
      action: "Aggiorna documento",
    });
  }

  if (input.expiredDocuments > 0) {
    alerts.push({
      id: "documents",
      severity: "danger",
      text:
        input.expiredDocuments === 1
          ? "1 documento scaduto"
          : `${input.expiredDocuments} documenti scaduti`,
      area: "documenti",
      action: "Vedi documenti",
    });
  }

  return alerts;
};
