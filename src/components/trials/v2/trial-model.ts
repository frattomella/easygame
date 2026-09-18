import type { TrialAthlete, TrialAthleteInput, TrialStatus } from "@/lib/trials/client";
import { TRIAL_STATUS } from "@/lib/web/status";
import { nameMatchKey } from "@/lib/athlete-name-utils";

/**
 * Il modello puro delle persone in prova (ADR-0188): nessun React, nessuna
 * rete. Le viste dell'elenco, la validazione del modulo, le parole.
 */

export const TRIAL_STATUS_LABEL: Record<TrialStatus, string> = {
  in_trial: "In prova",
  enrolled: "Iscritto",
  declined: "Non prosegue",
};

export const trialStatusSpec = (status: TrialStatus) => TRIAL_STATUS[status] || TRIAL_STATUS.in_trial;

/** L'eta in anni compiuti alla data data (default oggi). */
export const ageFromBirthDate = (birthDate: string | null | undefined, now = new Date()): number | null => {
  if (!birthDate) return null;
  const match = String(birthDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
};

export const birthYearOf = (birthDate: string | null | undefined) => {
  const match = String(birthDate || "").match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
};

export type TrialFormState = {
  firstName: string;
  lastName: string;
  birthDate: string;
  categoryId: string;
  groupId: string;
  siteId: string;
  phone: string;
  email: string;
  guardianName: string;
  guardianPhone: string;
  notes: string;
};

export const EMPTY_TRIAL_FORM: TrialFormState = {
  firstName: "",
  lastName: "",
  birthDate: "",
  categoryId: "",
  groupId: "",
  siteId: "",
  phone: "",
  email: "",
  guardianName: "",
  guardianPhone: "",
  notes: "",
};

export const trialFormFrom = (trial: TrialAthlete | null | undefined, defaults: Partial<TrialFormState> = {}): TrialFormState => ({
  ...EMPTY_TRIAL_FORM,
  ...defaults,
  ...(trial
    ? {
        firstName: trial.firstName,
        lastName: trial.lastName,
        birthDate: trial.birthDate || "",
        categoryId: trial.categoryId || "",
        groupId: trial.groupId || "",
        siteId: trial.siteId || "",
        phone: trial.phone || "",
        email: trial.email || "",
        guardianName: trial.guardianName || "",
        guardianPhone: trial.guardianPhone || "",
        notes: trial.notes || "",
      }
    : {}),
});

export type TrialFormError = { field: keyof TrialFormState; message: string };

/**
 * Nome e cognome sono il minimo; la data di nascita distingue due omonimi e
 * dice la categoria, ma **non e obbligatoria** per una prova (ADR-0198 §4).
 */
export const validateTrialForm = (form: TrialFormState, now = new Date()): TrialFormError[] => {
  const errors: TrialFormError[] = [];
  if (!form.firstName.trim()) errors.push({ field: "firstName", message: "Il nome e obbligatorio" });
  if (!form.lastName.trim()) errors.push({ field: "lastName", message: "Il cognome e obbligatorio" });
  /* Facoltativa (ADR-0198 §4): si vaglia solo se c'e. La chiede l'iscrizione, non la prova. */
  if (form.birthDate.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate)) {
      errors.push({ field: "birthDate", message: "La data di nascita non e valida" });
    } else {
      const age = ageFromBirthDate(form.birthDate, now);
      if (age === null || new Date(form.birthDate).getTime() > now.getTime()) {
        errors.push({ field: "birthDate", message: "La data di nascita non e valida" });
      }
    }
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.push({ field: "email", message: "L'email non e valida" });
  }
  return errors;
};

/** Cio che si manda: i campi del modulo, vuoti come `null` (tolti), i nomi puliti. */
export const trialFormToInput = (form: TrialFormState): TrialAthleteInput => ({
  firstName: form.firstName.trim(),
  lastName: form.lastName.trim(),
  birthDate: form.birthDate.trim() || null,
  categoryId: form.categoryId || null,
  groupId: form.groupId || null,
  siteId: form.siteId || null,
  phone: form.phone.trim() || null,
  email: form.email.trim() || null,
  guardianName: form.guardianName.trim() || null,
  guardianPhone: form.guardianPhone.trim() || null,
  notes: form.notes.trim() || null,
});

/** Solo i campi cambiati rispetto alla riga, per un PATCH che dice cio che tocca. */
export const trialFormDiff = (form: TrialFormState, trial: TrialAthlete): TrialAthleteInput => {
  const next = trialFormToInput(form);
  const prev = trialFormToInput(trialFormFrom(trial));
  const diff: TrialAthleteInput = {};
  for (const key of Object.keys(next) as Array<keyof TrialAthleteInput>) {
    if (next[key] !== prev[key]) (diff as Record<string, unknown>)[key] = next[key];
  }
  return diff;
};

/**
 * **Gli omonimi si mostrano, non si fondono.** Una persona in prova con lo
 * stesso nome (in qualunque ordine) e una corrispondenza da proporre; la
 * stessa data di nascita la rende «probabilmente la stessa persona».
 */
const normalize = (value: string) => nameMatchKey(value);

export const findTrialMatches = (form: Pick<TrialFormState, "firstName" | "lastName" | "birthDate">, existing: readonly TrialAthlete[]) => {
  const nome = normalize(form.firstName);
  const cognome = normalize(form.lastName);
  if (!nome && !cognome) return [] as Array<{ trial: TrialAthlete; exact: boolean }>;
  return existing
    .filter((trial) => {
      const a = normalize(trial.firstName);
      const b = normalize(trial.lastName);
      if (nome && cognome) return (a === nome && b === cognome) || (a === cognome && b === nome);
      const solo = nome || cognome;
      return a === solo || b === solo;
    })
    .map((trial) => ({ trial, exact: Boolean(form.birthDate) && Boolean(trial.birthDate) && trial.birthDate === form.birthDate }))
    .sort((x, y) => Number(y.exact) - Number(x.exact));
};

export const TRIAL_VIEWS = [
  { id: "in_trial", label: "In prova", filters: { stato: "in_trial" }, builtIn: true, isDefault: true },
  { id: "all", label: "Tutte", filters: {}, builtIn: true },
  { id: "enrolled", label: "Iscritti", filters: { stato: "enrolled" }, builtIn: true },
  { id: "declined", label: "Non proseguono", filters: { stato: "declined" }, builtIn: true },
] as const;
