import {
  DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS,
  MATCH_CONVOCATION_DEADLINE_RANGE,
  getMatchConvocationDeadlineDays,
} from "@/lib/trainer-operational-alerts";

/**
 * Il modello puro di `/settings` (Web V2): le preferenze che la pagina legge
 * e scrive in `clubs.settings.notifications`, `clubs.settings.system` e —
 * dal redesign — `clubs.settings.matchConvocationDeadlineDays`, con gli stessi
 * default e le stesse opzioni della V1. Nessun React, nessuna rete.
 */
export type NotificationSettings = {
  certificates: boolean;
  trainings: boolean;
  athletes: boolean;
  email: boolean;
};

export type SystemSettings = {
  language: string;
  dateFormat: string;
  backup: boolean;
};

/**
 * Gare e convocazioni. `convocationDeadlineDays` e la **stessa** chiave che
 * gli avvisi dell'allenatore leggono da sempre
 * (`clubs.settings.matchConvocationDeadlineDays`, via
 * `getMatchConvocationDeadlineDays`): la pagina Gare la mostrava in fondo
 * all'elenco, dove una regola del club non sta. Qui e una preferenza fra le
 * preferenze, con lo stesso scrittore (`saveClubSettings`) e lo stesso default.
 */
export type MatchSettings = {
  convocationDeadlineDays: number;
};

export type ClubPreferences = {
  notifications: NotificationSettings;
  system: SystemSettings;
  matches: MatchSettings;
};

export const DEFAULT_PREFERENCES: ClubPreferences = {
  notifications: { certificates: true, trainings: true, athletes: true, email: true },
  system: { language: "it", dateFormat: "dd/mm/yyyy", backup: true },
  matches: { convocationDeadlineDays: DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS },
};

export type SettingsSectionId = "notifiche" | "gare" | "sistema" | "sicurezza";

export const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string; description: string }> = [
  { id: "notifiche", label: "Notifiche", description: "Quali avvisi ricevere e su quale canale." },
  { id: "gare", label: "Gare e convocazioni", description: "Le regole del club su gare e convocazioni." },
  { id: "sistema", label: "Sistema", description: "Lingua, formato delle date e copie di sicurezza." },
  { id: "sicurezza", label: "Sicurezza", description: "Dove si cambiano password e accessi." },
];

export const resolveSettingsSection = (param: string | null | undefined): SettingsSectionId => {
  const value = String(param || "").trim().toLowerCase();
  if (value === "gare" || value === "matches" || value === "convocazioni") return "gare";
  if (value === "sistema" || value === "system") return "sistema";
  if (value === "sicurezza" || value === "security") return "sicurezza";
  return "notifiche";
};

/** Il valore che si scrive: intero nell'intervallo 0–30, come la lettura lo pretende. */
export const clampConvocationDeadlineDays = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS;
  return Math.max(MATCH_CONVOCATION_DEADLINE_RANGE.min, Math.min(Math.round(parsed), MATCH_CONVOCATION_DEADLINE_RANGE.max));
};

export const NOTIFICATION_OPTIONS: ReadonlyArray<{ key: keyof NotificationSettings; label: string; helper: string }> = [
  { key: "certificates", label: "Certificati in scadenza", helper: "Ricevi notifiche quando i certificati medici stanno per scadere" },
  { key: "trainings", label: "Allenamenti", helper: "Ricevi notifiche per nuovi allenamenti programmati" },
  { key: "athletes", label: "Nuovi atleti", helper: "Ricevi notifiche quando vengono registrati nuovi atleti" },
  { key: "email", label: "Notifiche email", helper: "Ricevi notifiche anche via email" },
];

export const LANGUAGE_OPTIONS = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
] as const;

export const DATE_FORMAT_OPTIONS = [
  { value: "dd/mm/yyyy", label: "GG/MM/AAAA" },
  { value: "mm/dd/yyyy", label: "MM/GG/AAAA" },
  { value: "yyyy-mm-dd", label: "AAAA-MM-GG" },
] as const;

/** Fonde cio che il club ha salvato sui default: una chiave assente resta al suo valore di partenza. */
export const preferencesFrom = (clubSettings: any): ClubPreferences => ({
  notifications: { ...DEFAULT_PREFERENCES.notifications, ...(clubSettings?.notifications || {}) },
  system: { ...DEFAULT_PREFERENCES.system, ...(clubSettings?.system || {}) },
  /* La stessa lettura degli avvisi dell'allenatore: chiave assente → 4, valore scritto → conservato. */
  matches: { convocationDeadlineDays: getMatchConvocationDeadlineDays(clubSettings) },
});

/** Cio che si scrive in `clubs.settings`: la chiave storica, non una seconda. */
export const matchSettingsPayload = (value: MatchSettings) => ({
  matchConvocationDeadlineDays: clampConvocationDeadlineDays(value.convocationDeadlineDays),
});
