/**
 * Il modello puro di `/settings` (Web V2): le preferenze che la pagina legge
 * e scrive in `clubs.settings.notifications` e `clubs.settings.system`, con
 * gli stessi default e le stesse opzioni della V1. Nessun React, nessuna rete.
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

export type ClubPreferences = {
  notifications: NotificationSettings;
  system: SystemSettings;
};

export const DEFAULT_PREFERENCES: ClubPreferences = {
  notifications: { certificates: true, trainings: true, athletes: true, email: true },
  system: { language: "it", dateFormat: "dd/mm/yyyy", backup: true },
};

export type SettingsSectionId = "notifiche" | "sistema" | "sicurezza";

export const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string; description: string }> = [
  { id: "notifiche", label: "Notifiche", description: "Quali avvisi ricevere e su quale canale." },
  { id: "sistema", label: "Sistema", description: "Lingua, formato delle date e copie di sicurezza." },
  { id: "sicurezza", label: "Sicurezza", description: "Dove si cambiano password e accessi." },
];

export const resolveSettingsSection = (param: string | null | undefined): SettingsSectionId => {
  const value = String(param || "").trim().toLowerCase();
  if (value === "sistema" || value === "system") return "sistema";
  if (value === "sicurezza" || value === "security") return "sicurezza";
  return "notifiche";
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
});
