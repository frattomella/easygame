/**
 * Quale area mobile apre un ruolo di accesso attivato.
 *
 * Specchio minimo di `src/lib/access-roles.ts` (`normalizeAccessRole`,
 * `ROLE_ALIASES`, `CUSTOM_ROLE_PREFIX`/`CUSTOM_ROLE_BASE_ROLES`) — non una
 * seconda fonte di verita sui permessi. Il server resta autorevole su ogni
 * accesso ai dati: questa funzione decide solo quale guscio di navigazione
 * mostrare dopo che il contesto (club + ruolo) e gia stato attivato da
 * `/api/v1/auth/memberships/activate`.
 *
 * V1 mobile supporta solo Trainer e Parent (ADR-0025 nel report di analisi):
 * ogni altro ruolo — canonico o di club personalizzato — ricade su
 * "unsupported", intercettato centralmente dalla navigazione.
 */

export type MobileRoleGate = "trainer" | "parent" | "unsupported";

const CUSTOM_ROLE_PREFIX = "custom:";
const CUSTOM_ROLE_TOKEN_SEPARATOR = "#";

/**
 * Le sole basi di ruolo di club ammesse (`CUSTOM_ROLE_BASE_ROLES` lato web).
 * Un ruolo personalizzato con base "trainer" apre l'area Trainer con lo
 * stesso perimetro che il server gia applica; le altre basi (club_manager,
 * collaborator, staff) non hanno un'area mobile in questa V1.
 */
const CUSTOM_ROLE_BASE_ROLES = new Set([
  "club_manager",
  "collaborator",
  "staff",
  "trainer",
]);

const ROLE_ALIASES: Record<string, "trainer" | "parent"> = {
  trainer: "trainer",
  coach: "trainer",
  allenatore: "trainer",
  parent: "parent",
  guardian: "parent",
  genitore: "parent",
  tutore: "parent",
  tutor: "parent",
};

/**
 * Legge la base di un gettone di ruolo personalizzato (`custom:<base>:<nome>`,
 * con le chiavi concesse dopo un `#`). Torna `""` per qualunque stringa non
 * sia un ruolo personalizzato ben formato o la cui base non sia ammessa.
 */
const readCustomRoleBase = (value: string): string => {
  if (!value.startsWith(CUSTOM_ROLE_PREFIX)) return "";
  const stable = value.split(CUSTOM_ROLE_TOKEN_SEPARATOR)[0] || "";
  const segments = stable.slice(CUSTOM_ROLE_PREFIX.length).split(":");
  if (segments.length !== 2) return "";
  const [base] = segments;
  return CUSTOM_ROLE_BASE_ROLES.has(base) ? base : "";
};

/**
 * Il ruolo canonico ("trainer" | "parent") di un valore grezzo, o `""` se
 * quel valore non e uno dei due ruoli supportati in questa V1 mobile.
 */
export const normalizeMobileAccessRole = (
  role: string | null | undefined,
): "trainer" | "parent" | "" => {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  if (!value) return "";

  const base = value.startsWith(CUSTOM_ROLE_PREFIX)
    ? readCustomRoleBase(value)
    : value;
  return ROLE_ALIASES[base] || "";
};

/**
 * L'area mobile da mostrare per il ruolo attivo. Chiamata una sola volta,
 * centralmente, dal navigatore radice: nessuna schermata deve rifare questo
 * controllo per conto proprio.
 */
export const resolveMobileRoleGate = (
  role: string | null | undefined,
): MobileRoleGate => {
  const normalized = normalizeMobileAccessRole(role);
  return normalized || "unsupported";
};
