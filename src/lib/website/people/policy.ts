/**
 * **La policy di pubblicazione delle persone** (ADR-0200 §7).
 *
 * L'unica funzione che decide se una persona del gestionale compare sul sito,
 * e con quali dati. Nessun loader la ricostruisce, nessun componente la
 * scavalca: la catena e sempre
 *
 *     entita interna → policy (qui) → DTO pubblico → sorgente dati → componente
 *
 * e un campo che questa funzione non restituisce **non esiste** per il sito.
 *
 * Le regole, in ordine:
 *
 * 1. **opt-in esplicito**: senza una riga di pubblicazione con `published`
 *    vero, la persona non c'e. Il gestionale che conosce un atleta non lo
 *    rende pubblico;
 * 2. **mai**: codice fiscale, indirizzo, telefono, email, documenti,
 *    certificati, dati sanitari, pagamenti, tutori, consensi, data di nascita
 *    completa. Non sono parametri: non entrano nemmeno nel tipo d'ingresso;
 * 3. **minori** (nessuna data di nascita = minore, la stessa scelta di
 *    `data-subject.ts`): nome abbreviato se il club non ne ha scelto uno
 *    esplicito, mai l'anno di nascita, foto solo con il consenso `images`
 *    **accettato**. L'assenza di un rifiuto non e un consenso;
 * 4. **adulti**: foto solo se il club l'ha abilitata **e** il consenso non e
 *    stato rifiutato o revocato; se il club ha una definizione del consenso
 *    attiva, serve l'accettazione — come per i minori;
 * 5. una persona anonimizzata o non attiva non c'e.
 *
 * Modulo puro: le date e lo stato del consenso arrivano da chi chiama.
 */

export const NAME_DISPLAY_MODES = ["full", "first_initial", "initials", "custom"] as const;
export type NameDisplayMode = (typeof NAME_DISPLAY_MODES)[number];

export type PublicationSettings = {
  published: boolean;
  nameDisplay: NameDisplayMode;
  customName: string;
  showPhoto: boolean;
  photoMediaId: string | null;
  showNumber: boolean;
  showRole: boolean;
  roleLabel: string;
  showBirthYear: boolean;
  showHeight: boolean;
  heightCm: number | null;
  showBio: boolean;
  bio: string;
  showStats: boolean;
  /** Il club dichiara di aver raccolto il consenso alle immagini fuori dal registro (solo adulti). */
  photoConsentOutsideRegistry: boolean;
};

export const DEFAULT_PUBLICATION: PublicationSettings = {
  published: false,
  nameDisplay: "full",
  customName: "",
  showPhoto: false,
  photoMediaId: null,
  showNumber: true,
  showRole: true,
  roleLabel: "",
  showBirthYear: false,
  showHeight: false,
  heightCm: null,
  showBio: false,
  bio: "",
  showStats: true,
  photoConsentOutsideRegistry: false,
};

/**
 * Cio che la policy riceve di una persona. **Volutamente stretto**: niente
 * `data` JSON, niente contatti, niente tutori. Un loader che volesse passare
 * di piu dovrebbe cambiare questo tipo, e il cambio si vede in revisione.
 */
export type PersonSource = {
  id: string;
  kind: "athlete" | "trainer" | "staff";
  firstName: string;
  lastName: string;
  /** Solo per decidere se e minore e l'anno: mai restituita. */
  birthDate: string | null;
  active: boolean;
  anonymized: boolean;
  jerseyNumber: string;
  /** Il ruolo che il gestionale conosce (per lo staff: «Presidente»). */
  internalRole: string;
};

export type ImageConsent = "accepted" | "rejected" | "missing";

export type PolicyContext = {
  now: Date;
  /** Lo stato del consenso `images` per questa persona, dal registro. */
  imageConsent: ImageConsent;
  /** Vero se il club ha una definizione `images` attiva nel registro. */
  imageConsentDefined: boolean;
};

export type PublicPersonFields = {
  displayName: string;
  photoMediaId: string | null;
  jerseyNumber: string;
  role: string;
  birthYear: number | null;
  heightCm: number | null;
  bio: string;
  showStats: boolean;
  isMinor: boolean;
};

export type PolicyVerdict =
  | { visible: true; fields: PublicPersonFields }
  | { visible: false; reason: "not_published" | "inactive" | "anonymized" | "no_name" };

const MAJORITY_AGE = 18;

/** Minore alla data: nessuna data di nascita leggibile = minore. */
export const isMinorAt = (birthDate: string | null | undefined, now: Date) => {
  if (!birthDate) return true;
  const match = String(birthDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return true;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const adult = new Date(Date.UTC(y + MAJORITY_AGE, m - 1, d));
  return now.getTime() < adult.getTime();
};

const clean = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const formatDisplayName = (
  firstName: string,
  lastName: string,
  mode: NameDisplayMode,
  customName = "",
): string => {
  const first = clean(firstName, 60);
  const last = clean(lastName, 60);
  switch (mode) {
    case "custom":
      return clean(customName, 80) || formatDisplayName(first, last, "first_initial");
    case "initials":
      return [first, last].filter(Boolean).map((part) => `${capitalize(part.charAt(0))}.`).join(" ");
    case "first_initial":
      return [first, last ? `${capitalize(last.charAt(0))}.` : ""].filter(Boolean).join(" ");
    default:
      return [first, last].filter(Boolean).join(" ");
  }
};

/** La sola funzione che decide. */
export const applyPublicationPolicy = (
  person: PersonSource,
  settings: PublicationSettings | null,
  context: PolicyContext,
): PolicyVerdict => {
  if (person.anonymized) return { visible: false, reason: "anonymized" };
  if (!person.active) return { visible: false, reason: "inactive" };
  if (!settings || !settings.published) return { visible: false, reason: "not_published" };

  const minor = person.kind === "athlete" ? isMinorAt(person.birthDate, context.now) : false;

  /*
    Il nome. Per un minore il modo «pieno» non vale: se il club non ha scelto
    esplicitamente un nome di visualizzazione, si mostra nome e iniziale.
  */
  const mode: NameDisplayMode = minor && settings.nameDisplay === "full" ? "first_initial" : settings.nameDisplay;
  const displayName = formatDisplayName(person.firstName, person.lastName, mode, settings.customName);
  if (!displayName) return { visible: false, reason: "no_name" };

  /*
    La foto. Per un minore serve il consenso accettato, punto. Per un adulto
    serve che non sia stato negato e — se il registro ha la definizione — che
    sia stato accettato; senza definizione, il club deve averlo dichiarato.
  */
  let photo: string | null = null;
  if (settings.showPhoto && settings.photoMediaId) {
    const allowed = minor
      ? context.imageConsent === "accepted"
      : context.imageConsent === "rejected"
        ? false
        : context.imageConsentDefined
          ? context.imageConsent === "accepted"
          : settings.photoConsentOutsideRegistry || context.imageConsent === "accepted";
    photo = allowed ? settings.photoMediaId : null;
  }

  const birthYear =
    !minor && settings.showBirthYear && person.birthDate && /^\d{4}/.test(person.birthDate)
      ? Number(person.birthDate.slice(0, 4))
      : null;

  const height =
    settings.showHeight && settings.heightCm && settings.heightCm >= 80 && settings.heightCm <= 250
      ? Math.round(settings.heightCm)
      : null;

  return {
    visible: true,
    fields: {
      displayName,
      photoMediaId: photo,
      jerseyNumber: settings.showNumber ? clean(person.jerseyNumber, 4) : "",
      role: settings.showRole ? clean(settings.roleLabel || person.internalRole, 60) : "",
      birthYear,
      heightCm: height,
      bio: settings.showBio ? clean(settings.bio, 1200) : "",
      showStats: settings.showStats,
      isMinor: minor,
    },
  };
};

/** Ripulisce le impostazioni che arrivano dall'editor. */
export const normalizePublicationSettings = (raw: unknown): PublicationSettings => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof PublicationSettings) =>
    typeof record[key] === "boolean" ? (record[key] as boolean) : (DEFAULT_PUBLICATION[key] as boolean);
  const height = Number(record.heightCm);
  return {
    published: bool("published"),
    nameDisplay: (NAME_DISPLAY_MODES as readonly string[]).includes(String(record.nameDisplay))
      ? (record.nameDisplay as NameDisplayMode)
      : DEFAULT_PUBLICATION.nameDisplay,
    customName: clean(record.customName, 80),
    showPhoto: bool("showPhoto"),
    photoMediaId: clean(record.photoMediaId, 64) || null,
    showNumber: bool("showNumber"),
    showRole: bool("showRole"),
    roleLabel: clean(record.roleLabel, 60),
    showBirthYear: bool("showBirthYear"),
    showHeight: bool("showHeight"),
    heightCm: Number.isFinite(height) && height >= 80 && height <= 250 ? Math.round(height) : null,
    showBio: bool("showBio"),
    bio: clean(record.bio, 1200),
    showStats: bool("showStats"),
    photoConsentOutsideRegistry: bool("photoConsentOutsideRegistry"),
  };
};
