/**
 * Genitori e tutori di un atleta: il dominio, senza interfaccia.
 *
 * **Perche esiste** (WP-19, Blocco 8). Questa logica viveva in cima a
 * `src/app/athletes/[id]/page.tsx`, che supera le 8.000 righe. Non era
 * sbagliata — era invisibile: le regole su quando un token e scaduto, su come
 * si legge lo stato di un collegamento e su quale nome mostrare stavano in
 * mezzo a duecento `useState`, e nessuna era verificata.
 *
 * Qui non c'e React e non c'e `fetch`. E la condizione perche le regole si
 * possano provare: un test le esercita senza montare una pagina da 340 kB.
 *
 * **Perche i campi si leggono in tre grafie.** Un genitore arriva dal payload
 * JSON dell'atleta, dove lo stesso dato e stato scritto negli anni come
 * `parentAccessTokenExpiresAt`, `parent_access_token_expires_at` e
 * `accessTokenExpiresAt`. Normalizzarli in archivio e una migrazione a se; qui
 * si legge cio che c'e, e si legge in un posto solo.
 */

/** Quanto vive un token di accesso genitore, quando nessuno lo dichiara. */
export const PARENT_TOKEN_EXPIRY_HOURS = 72;

/**
 * Alfabeto senza caratteri ambigui.
 *
 * Niente `I`, `O`, `0`, `1`: un token si detta al telefono e si trascrive a
 * mano, e la differenza fra `O` e `0` in una segreteria e una telefonata in
 * piu.
 */
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TOKEN_LENGTH = 9;

/**
 * Un token di accesso genitore.
 *
 * Usa `crypto.getRandomValues` quando c'e. Il ripiego su `Math.random` serve
 * solo al rendering server, dove questa funzione non viene mai chiamata per
 * generare un token vero: un token con entropia debole non deve poter
 * finire in archivio per una svista di ambiente.
 */
export const createParentAccessToken = (
  randomSource?: (length: number) => Uint32Array,
): string => {
  const values =
    randomSource?.(TOKEN_LENGTH) ||
    (typeof globalThis.crypto?.getRandomValues === "function"
      ? globalThis.crypto.getRandomValues(new Uint32Array(TOKEN_LENGTH))
      : Uint32Array.from({ length: TOKEN_LENGTH }, () =>
          Math.floor(Math.random() * TOKEN_ALPHABET.length),
        ));

  return `PAR${Array.from(
    values,
    (value) => TOKEN_ALPHABET[value % TOKEN_ALPHABET.length],
  ).join("")}`;
};

/** `PARAB12CD34` → `PARA-B12C-D34`: si legge e si detta a gruppi di quattro. */
export const formatParentAccessToken = (value?: string | null): string => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  if (!normalized) return "-";

  return normalized.match(/.{1,4}/g)?.join("-") || normalized;
};

export type GuardianLike = Record<string, any>;

/** Il primo valore non vuoto fra piu grafie dello stesso campo. */
const firstValue = (guardian: GuardianLike, keys: string[]) => {
  for (const key of keys) {
    const value = guardian?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
};

const TOKEN_VALUE_KEYS = [
  "parentAccessTokenValue",
  "parent_access_token_value",
  "accessTokenValue",
];

const TOKEN_STATUS_KEYS = [
  "parentAccessTokenStatus",
  "parent_access_token_status",
  "accessTokenStatus",
];

const TOKEN_EXPIRY_KEYS = [
  "parentAccessTokenExpiresAt",
  "parent_access_token_expires_at",
  "accessTokenExpiresAt",
];

const TOKEN_GENERATED_KEYS = [
  "parentAccessTokenGeneratedAt",
  "parent_access_token_generated_at",
  "accessTokenGeneratedAt",
];

const LINKED_USER_KEYS = ["linkedUserId", "linked_user_id"];

export const getGuardianDisplayName = (guardian: GuardianLike): string =>
  [guardian?.name, guardian?.surname].filter(Boolean).join(" ").trim() ||
  guardian?.email ||
  "Genitore/Tutore";

/**
 * Da un elenco di genitori a un elenco con un `id` stabile.
 *
 * Serve a React per non ridisegnare le righe sbagliate. L'id si costruisce dal
 * dato — email, telefono, nome — e non da un contatore: due montaggi della
 * stessa scheda devono produrre le stesse chiavi, altrimenti il campo che si
 * sta modificando perde il fuoco.
 */
export const normalizeGuardianRows = (
  items: GuardianLike[],
  fallbackSeed: string | number = "senza-dati",
): GuardianLike[] =>
  (Array.isArray(items) ? items : []).map((guardian, index) => ({
    ...guardian,
    id:
      guardian?.id ||
      `guardian-${index}-${String(
        guardian?.email || guardian?.phone || guardian?.name || fallbackSeed,
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`,
  }));

export type GuardianAccessState =
  | "linked"
  | "token-active"
  | "token-expired"
  | "not-linked";

export type GuardianAccessStatus = {
  state: GuardianAccessState;
  label: string;
  className: string;
};

const ACCESS_STATUS: Record<GuardianAccessState, GuardianAccessStatus> = {
  linked: {
    state: "linked",
    label: "Account collegato",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  },
  "token-active": {
    state: "token-active",
    label: "Token attivo",
    className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
  },
  "token-expired": {
    state: "token-expired",
    label: "Token scaduto",
    className: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  },
  "not-linked": {
    state: "not-linked",
    label: "Account non collegato",
    className:
      "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
  },
};

/**
 * In che stato e l'accesso di un genitore.
 *
 * L'ordine delle condizioni e il contenuto della regola: **un account
 * collegato vince su tutto**, anche su un token scaduto, perche il token e il
 * mezzo con cui ci si collega e una volta collegati non serve piu. Invertire
 * i due controlli mostrerebbe «Token scaduto» a un genitore che sta usando
 * l'applicazione in quel momento.
 */
export const getGuardianAccessStatus = (
  guardian: GuardianLike,
  nowMs: number = Date.now(),
): GuardianAccessStatus => {
  if (firstValue(guardian, LINKED_USER_KEYS)) return ACCESS_STATUS.linked;

  const status = String(firstValue(guardian, TOKEN_STATUS_KEYS) || "")
    .trim()
    .toLowerCase();

  if (status === "revoked" || status === "disconnected") {
    return ACCESS_STATUS["not-linked"];
  }

  const expiresAtRaw = firstValue(guardian, TOKEN_EXPIRY_KEYS);
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw as string) : null;
  const isExpired = Boolean(
    expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < nowMs,
  );

  if ((status === "expired" || isExpired) && expiresAtRaw) {
    return ACCESS_STATUS["token-expired"];
  }

  if (firstValue(guardian, TOKEN_VALUE_KEYS)) {
    return ACCESS_STATUS["token-active"];
  }

  return ACCESS_STATUS["not-linked"];
};

export type GuardianTokenTiming = {
  label: string;
  /** 0-100: quanto del tempo concesso resta. */
  progress: number;
  isExpired: boolean;
};

/**
 * Quanto manca alla scadenza di un token, in una forma da mostrare.
 *
 * La barra si calcola sul tempo **effettivamente concesso** (scadenza meno
 * generazione) quando entrambe le date ci sono, e sulle 72 ore di default
 * quando la data di generazione manca — cosa che succede sui token creati
 * prima che venisse registrata. Senza questa distinzione un token da 24 ore
 * apparirebbe gia a un terzo appena creato.
 */
export const getGuardianTokenTiming = (
  guardian: GuardianLike,
  nowMs: number = Date.now(),
): GuardianTokenTiming => {
  const expiresAtRaw = firstValue(guardian, TOKEN_EXPIRY_KEYS);
  const generatedAtRaw = firstValue(guardian, TOKEN_GENERATED_KEYS);

  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw as string).getTime() : 0;
  const generatedAt = generatedAtRaw
    ? new Date(generatedAtRaw as string).getTime()
    : 0;

  if (!expiresAt || Number.isNaN(expiresAt)) {
    return { label: "Scadenza non disponibile", progress: 0, isExpired: false };
  }

  const remainingMs = Math.max(expiresAt - nowMs, 0);
  const totalMs =
    generatedAt && !Number.isNaN(generatedAt)
      ? Math.max(expiresAt - generatedAt, 1)
      : PARENT_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  return {
    label: remainingMs > 0 ? `${hours}h ${minutes}m rimanenti` : "Token scaduto",
    progress: Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)),
    isExpired: remainingMs <= 0,
  };
};
