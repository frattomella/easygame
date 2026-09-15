import type { StatusSpec } from "@/lib/web/status";
import type { AccountClub, LinkedProfile, ProfileFormState } from "@/components/account/account-shared";

/**
 * Il modello puro della home account (Web V2, Wave E): le funzioni di lettura
 * che la V1 teneva dentro `account-home-screen.tsx` e le due parole di stato
 * che `src/lib/web/status.ts` non ha ancora (segnalate al lead: «verificato /
 * da verificare» di un recapito, «aperto» del club attivo). Le forme sono
 * quelle di `StatusSpec`, cosi il giorno in cui entrano nel sistema si
 * cambia l'import e basta.
 */

/** Oltre questa soglia cercare e piu veloce che scorrere (come in V1). */
export const SEARCH_THRESHOLD = 5;

export const SUPPORT_URL = "https://www.cedisoft.it/contatti/";

export const CONTACT_STATUS = Object.freeze({
  verified: Object.freeze({ label: "VERIFICATO", weight: "solid", hue: "green" } as StatusSpec),
  to_verify: Object.freeze({ label: "DA VERIFICARE", weight: "outline", hue: "amber" } as StatusSpec),
});

export const CLUB_ACCESS_STATUS = Object.freeze({
  open: Object.freeze({ label: "APERTO", weight: "solid", hue: "blue" } as StatusSpec),
});

export const getAccountFirstName = (displayName: string) => displayName.split(" ").filter(Boolean)[0] || "EasyGamer";

export const matchesQuery = (club: AccountClub, query: string) => {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  return [club.name, club.city, club.province, club.roleLabel].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
};

/**
 * **Come si chiama il legame**, che non e lo stesso per tutti: «Tutore di»
 * per i figli, «La tua scheda» per la propria, «Scheda allenatore» per quella
 * dell'allenatore. Un'etichetta sola per tre cose diverse direbbe meno.
 */
export const etichettaProfili = (profili: LinkedProfile[]) => {
  const tipi = new Set(profili.map((profilo) => profilo.kind));
  if (tipi.size === 1 && tipi.has("guardian")) return "Tutore di";
  if (tipi.size === 1 && tipi.has("athlete")) return "La tua scheda";
  if (tipi.size === 1 && tipi.has("trainer")) return "Scheda allenatore";
  return "Profili collegati";
};

export const clubPlace = (club: Pick<AccountClub, "city" | "province">) => [club.city, club.province].filter(Boolean).join(", ");

export type ProfileValidation = { field: keyof ProfileFormState; message: string };

/**
 * Le due regole client del profilo, le stesse della V1: le password nuove
 * coincidono, e cambiare email, cellulare o password richiede quella attuale.
 * Il resto lo decide `PATCH /api/v1/auth/user`.
 */
export const validateProfileForm = (form: ProfileFormState, user: { email?: string | null; user_metadata?: Record<string, any> | null } | null): ProfileValidation[] => {
  const errors: ProfileValidation[] = [];
  if (form.newPassword !== form.confirmPassword) {
    errors.push({ field: "confirmPassword", message: "Le password non coincidono" });
  }
  if (profileNeedsCurrentPassword(form, user) && !form.currentPassword.trim()) {
    errors.push({
      field: "currentPassword",
      message: "Per cambiare email, cellulare o password serve la password attuale. Se non ne hai una, usa «Ricevi un link per impostarla».",
    });
  }
  return errors;
};

export const profileEmailChanged = (form: ProfileFormState, user: { email?: string | null } | null) =>
  form.email.trim().toLowerCase() !== String(user?.email || "").toLowerCase();

export const profilePhoneChanged = (form: ProfileFormState, user: { user_metadata?: Record<string, any> | null } | null) =>
  form.phone.trim() !== String(user?.user_metadata?.phone || "");

/** La password attuale si manda **solo** quando cambia un fattore, non a ogni salvataggio. */
export const profileNeedsCurrentPassword = (form: ProfileFormState, user: { email?: string | null; user_metadata?: Record<string, any> | null } | null) =>
  profileEmailChanged(form, user) || profilePhoneChanged(form, user) || Boolean(form.newPassword.trim());

export const profileFormDirty = (form: ProfileFormState, initial: ProfileFormState) =>
  (Object.keys(initial) as Array<keyof ProfileFormState>).some((key) => form[key] !== initial[key]);
