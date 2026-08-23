import { apiRequest } from "@/lib/api/client";

/**
 * Salvataggio per sezione della scheda club.
 *
 * La pagina Club aveva **un solo** pulsante "Salva Modifiche" in fondo a nove
 * schede: cambiare un numero di telefono e cambiare l'IBAN costavano lo stesso
 * gesto, e dimenticare quel gesto perdeva tutto. Qui le sezioni vengono
 * separate in due famiglie:
 *
 * - **autosave**: dati descrittivi, dove riscrivere lo stesso valore non
 *   produce nessun effetto economico ne distrugge nulla;
 * - **conferma esplicita**: dati fiscali, bancari, listini, stagioni e
 *   federazioni, dove il salvataggio deve essere un atto deliberato e
 *   atomico. Un IBAN sbagliato salvato mentre lo si sta ancora digitando
 *   manda i bonifici altrove.
 *
 * La distinzione non e stilistica: e la ragione per cui l'autosave si puo
 * introdurre senza rischio solo dove e elencato qui sotto.
 */

export type ClubProfileSectionId =
  | "generale"
  | "contatti"
  | "social"
  | "fiscali"
  | "bancari"
  | "federazione"
  | "stagioni"
  | "pagamenti"
  | "fatturazione";

export type ClubProfileSection = {
  id: ClubProfileSectionId;
  label: string;
  autosave: boolean;
  /** Perche questa sezione e (o non e) in autosave. */
  reason: string;
};

export const CLUB_PROFILE_SECTIONS: ClubProfileSection[] = [
  {
    id: "generale",
    label: "Generale",
    autosave: true,
    reason: "Dati descrittivi del club: nessun effetto economico.",
  },
  {
    id: "contatti",
    label: "Contatti",
    autosave: true,
    reason: "Recapiti: riscriverli non distrugge nulla.",
  },
  {
    id: "social",
    label: "Social",
    autosave: true,
    reason: "Link pubblici: nessun effetto economico.",
  },
  {
    id: "fiscali",
    label: "Dati Fiscali",
    autosave: false,
    reason: "Finiscono in fattura: servono conferma e coerenza atomica.",
  },
  {
    id: "bancari",
    label: "Dati Bancari",
    autosave: false,
    reason: "Un IBAN salvato a meta digitazione dirotta gli incassi.",
  },
  {
    id: "federazione",
    label: "Federazione",
    autosave: false,
    reason: "Include la rimozione di affiliazioni: operazione distruttiva.",
  },
  {
    id: "stagioni",
    label: "Stagioni",
    autosave: false,
    reason:
      "La stagione attiva e il perimetro dei dati visibili (WP-32): cambiarla e una decisione, non una modifica.",
  },
  {
    id: "pagamenti",
    label: "Pagamenti",
    autosave: false,
    reason: "Quote, rate e sconti: economicamente sensibili.",
  },
  {
    id: "fatturazione",
    label: "Account e Fatturazione",
    autosave: false,
    reason: "Abbonamento e servizi a pagamento.",
  },
];

const AUTOSAVE_SECTION_IDS = new Set(
  CLUB_PROFILE_SECTIONS.filter((section) => section.autosave).map(
    (section) => section.id,
  ),
);

export const isAutosaveClubSection = (section: string) =>
  AUTOSAVE_SECTION_IDS.has(section as ClubProfileSectionId);

/** Sottoinsieme della scheda club che l'autosave puo toccare. */
export type ClubProfileDraft = {
  name: string;
  logoUrl: string;
  types: string[];
  sports: string[];
  foundingYear: string;
  address: string;
  city: string;
  postalCode: string;
  region: string;
  province: string;
  country: string;
  contact1Name: string;
  contact1Phone: string;
  contact1Email: string;
  contact2Name: string;
  contact2Phone: string;
  contact2Email: string;
  companyEmail: string;
  companyPec: string;
  website: string;
  facebook: string;
  instagram: string;
  twitter: string;
  youtube: string;
};

export type ClubProfileSectionUpdate = {
  /** Colonne della tabella `clubs`. */
  columns: Record<string, any>;
  /** Chiavi da fondere dentro `clubs.settings`. */
  settings: Record<string, any>;
};

const trimmed = (value: string) => String(value || "").trim();

/**
 * Cosa scrive ogni sezione. Puro: e la parte che i test verificano, perche e
 * quella che decide se un autosave della scheda "Generale" possa toccare per
 * sbaglio l'IBAN o le stagioni.
 */
export const buildClubProfileSectionUpdate = (
  section: ClubProfileSectionId,
  draft: ClubProfileDraft,
): ClubProfileSectionUpdate => {
  if (section === "generale") {
    return {
      columns: {
        name: trimmed(draft.name),
        logo_url: draft.logoUrl || null,
        address: trimmed(draft.address) || null,
        city: trimmed(draft.city) || null,
        postal_code: trimmed(draft.postalCode) || null,
        region: trimmed(draft.region) || null,
        province: trimmed(draft.province) || null,
        country: trimmed(draft.country) || "Italia",
      },
      settings: {
        type: draft.types[0] || null,
        types: draft.types,
        sports: draft.sports,
        sport: draft.sports[0] || "",
        foundingYear: trimmed(draft.foundingYear) || null,
      },
    };
  }

  if (section === "contatti") {
    return {
      columns: {
        contact_email: trimmed(draft.companyEmail) || null,
        contact_phone: trimmed(draft.contact1Phone) || null,
      },
      settings: {
        email: trimmed(draft.companyEmail) || null,
        companyEmail: trimmed(draft.companyEmail) || null,
        companyPec: trimmed(draft.companyPec) || null,
        phone: trimmed(draft.contact1Phone) || null,
        contact1Name: trimmed(draft.contact1Name) || null,
        contact1Phone: trimmed(draft.contact1Phone) || null,
        contact1Email: trimmed(draft.contact1Email) || null,
        contact2Name: trimmed(draft.contact2Name) || null,
        contact2Phone: trimmed(draft.contact2Phone) || null,
        contact2Email: trimmed(draft.contact2Email) || null,
      },
    };
  }

  if (section === "social") {
    return {
      columns: {},
      settings: {
        website: trimmed(draft.website) || null,
        facebook: trimmed(draft.facebook) || null,
        instagram: trimmed(draft.instagram) || null,
        twitter: trimmed(draft.twitter) || null,
        youtube: trimmed(draft.youtube) || null,
      },
    };
  }

  // Le sezioni a conferma esplicita non passano di qui: se ci passassero,
  // scrivere un oggetto vuoto e piu sicuro che indovinare.
  return { columns: {}, settings: {} };
};

/** Impronta della sezione: due impronte uguali = niente da salvare. */
export const clubProfileSectionSnapshot = (
  section: ClubProfileSectionId,
  draft: ClubProfileDraft,
) => JSON.stringify(buildClubProfileSectionUpdate(section, draft));

const readClubSettings = async (clubId: string) => {
  const params = new URLSearchParams({ id: clubId, fields: "settings" });
  const response = await apiRequest<any[]>(`/api/v1/clubs?${params.toString()}`);

  if (response.error) {
    throw new Error(response.error.message || "Lettura del club non riuscita");
  }

  const record = Array.isArray(response.data) ? response.data[0] : response.data;
  return typeof record?.settings === "object" && record.settings
    ? (record.settings as Record<string, any>)
    : {};
};

/**
 * Scrive una sola sezione.
 *
 * `settings` e una colonna JSON unica: per cambiarne una chiave bisogna
 * rileggerla e riscriverla intera. La rilettura avviene **solo** quando la
 * sezione tocca davvero `settings`, e chiede al server la sola colonna
 * `settings`; la PATCH si fa restituire solo `id` (WP-36).
 */
export const saveClubProfileSection = async (
  clubId: string,
  section: ClubProfileSectionId,
  draft: ClubProfileDraft,
) => {
  const { columns, settings } = buildClubProfileSectionUpdate(section, draft);
  const payload: Record<string, any> = { ...columns };

  if (Object.keys(settings).length) {
    const currentSettings = await readClubSettings(clubId);
    payload.settings = { ...currentSettings, ...settings };
  }

  if (!Object.keys(payload).length) {
    return;
  }

  const response = await apiRequest<any>(
    `/api/v1/clubs/${encodeURIComponent(clubId)}?fields=id`,
    { method: "PATCH", body: { data: payload } },
  );

  if (response.error) {
    throw new Error(response.error.message || "Salvataggio non riuscito");
  }
};

// --- lettura ----------------------------------------------------------------

const CLUB_PROFILE_FIELDS = [
  "id",
  "name",
  "logo_url",
  "address",
  "city",
  "postal_code",
  "region",
  "province",
  "country",
  "contact_email",
  "contact_phone",
  "settings",
];

export const emptyClubProfileDraft = (): ClubProfileDraft => ({
  name: "",
  logoUrl: "",
  types: [],
  sports: [],
  foundingYear: "",
  address: "",
  city: "",
  postalCode: "",
  region: "",
  province: "",
  country: "Italia",
  contact1Name: "",
  contact1Phone: "",
  contact1Email: "",
  contact2Name: "",
  contact2Phone: "",
  contact2Email: "",
  companyEmail: "",
  companyPec: "",
  website: "",
  facebook: "",
  instagram: "",
  twitter: "",
  youtube: "",
});

const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);

/**
 * Bozza della scheda club a partire dalla riga salvata.
 *
 * Serve a chi modifica **una parte** del club — l'onboarding, per esempio —
 * senza azzerare il resto: la sezione si salva a partire dai valori reali,
 * non da un form vuoto.
 */
export const loadClubProfile = async (clubId: string) => {
  const params = new URLSearchParams({
    id: clubId,
    fields: CLUB_PROFILE_FIELDS.join(","),
  });
  const response = await apiRequest<any[]>(`/api/v1/clubs?${params.toString()}`);

  if (response.error) {
    throw new Error(response.error.message || "Lettura del club non riuscita");
  }

  const record = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!record) {
    throw new Error("Club non trovato");
  }

  const settings: Record<string, any> =
    typeof record.settings === "object" && record.settings ? record.settings : {};

  const draft: ClubProfileDraft = {
    ...emptyClubProfileDraft(),
    name: asText(record.name),
    logoUrl: asText(record.logo_url),
    types: asStringArray(settings.types),
    sports: asStringArray(settings.sports),
    foundingYear: asText(settings.foundingYear),
    address: asText(record.address),
    city: asText(record.city),
    postalCode: asText(record.postal_code),
    region: asText(record.region),
    province: asText(record.province),
    country: asText(record.country) || "Italia",
    contact1Name: asText(settings.contact1Name),
    contact1Phone: asText(settings.contact1Phone) || asText(record.contact_phone),
    contact1Email: asText(settings.contact1Email),
    contact2Name: asText(settings.contact2Name),
    contact2Phone: asText(settings.contact2Phone),
    contact2Email: asText(settings.contact2Email),
    companyEmail: asText(settings.companyEmail) || asText(record.contact_email),
    companyPec: asText(settings.companyPec),
    website: asText(settings.website),
    facebook: asText(settings.facebook),
    instagram: asText(settings.instagram),
    twitter: asText(settings.twitter),
    youtube: asText(settings.youtube),
  };

  return { id: String(record.id), draft, settings };
};

/**
 * Modifica mirata di `clubs.settings`.
 *
 * La colonna e un JSON unico: si rilegge, si applica la trasformazione e si
 * riscrive. Passare una funzione invece di un oggetto rende esplicito che la
 * fusione avviene sul valore appena letto, non su una copia vecchia tenuta in
 * memoria dalla pagina.
 */
export const patchClubSettings = async (
  clubId: string,
  transform: (settings: Record<string, any>) => Record<string, any>,
) => {
  const currentSettings = await readClubSettings(clubId);
  const nextSettings = transform(currentSettings);

  const response = await apiRequest<any>(
    `/api/v1/clubs/${encodeURIComponent(clubId)}?fields=id`,
    { method: "PATCH", body: { data: { settings: nextSettings } } },
  );

  if (response.error) {
    throw new Error(response.error.message || "Salvataggio non riuscito");
  }

  return nextSettings;
};
