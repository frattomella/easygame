import { apiRequest } from "@/lib/api/client";
import {
  isValidPostalCode,
  isWellFormedCodiceFiscale,
} from "@/lib/italian-registry";
import {
  normalizePaymentSettings,
  sanitizePaymentSettingsForStorage,
  validatePaymentSettingsForSave,
} from "@/lib/payments/payment-config-utils";

/**
 * Salvataggio per sezione della scheda club.
 *
 * La pagina Club aveva **un solo** pulsante "Salva Modifiche" in fondo a nove
 * schede: cambiare un numero di telefono e cambiare l'IBAN costavano lo stesso
 * gesto, e dimenticare quel gesto perdeva tutto. Il Blocco 4 mise in autosave
 * le tre schede descrittive e lascio le altre al pulsante, con una
 * motivazione ragionevole: un IBAN salvato a meta digitazione dirotta gli
 * incassi.
 *
 * **Perche in RC Fix 1 anche le altre passano all'autosave.** Il compromesso
 * a meta lasciava una pagina che si comportava in due modi diversi a seconda
 * della scheda aperta, e il pulsante rimasto **non salvava la scheda**:
 * salvava tutto il club, comprese le schede gia salvate da sole, ricaricando
 * poi la pagina. Il rischio vero — scrivere un valore incompleto — non si
 * risolve con un pulsante, che salva volentieri un IBAN sbagliato: si risolve
 * **non scrivendo un valore che non e ancora un valore**. E cio che fa
 * `validateClubProfileSection`, ed e la ragione per cui l'autosave qui e piu
 * sicuro del pulsante che sostituisce, non meno.
 *
 * Restano fuori dall'autosave le due schede che **non sono un modulo**:
 * Stagioni, che ha operazioni proprie con conferma esplicita (WP-32), e
 * Account e Fatturazione, che e in sola lettura.
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
    autosave: true,
    reason:
      "Finiscono in fattura: si scrivono solo quando partita IVA, codice fiscale e CAP sono formalmente validi.",
  },
  {
    id: "bancari",
    label: "Dati Bancari",
    autosave: true,
    reason:
      "Un IBAN a meta digitazione non e un IBAN: la validazione lo trattiene finche non lo diventa.",
  },
  {
    id: "federazione",
    label: "Federazione",
    autosave: true,
    reason:
      "Togliere un'affiliazione e gia un gesto esplicito: e il clic sul cestino, non il salvataggio.",
  },
  {
    id: "stagioni",
    label: "Stagioni",
    autosave: false,
    reason:
      "La stagione attiva e il perimetro dei dati visibili (WP-32): ha operazioni proprie con conferma, non un modulo da salvare.",
  },
  {
    id: "pagamenti",
    label: "Pagamenti",
    autosave: true,
    reason:
      "Restano due interruttori operativi (ADR-0050, ADR-0051): il conto e la commissione non si governano piu da qui.",
  },
  {
    id: "fatturazione",
    label: "Account e Fatturazione",
    autosave: false,
    reason: "Sola lettura: non c'e niente da salvare.",
  },
];

const AUTOSAVE_SECTION_IDS = new Set(
  CLUB_PROFILE_SECTIONS.filter((section) => section.autosave).map(
    (section) => section.id,
  ),
);

export const isAutosaveClubSection = (section: string) =>
  AUTOSAVE_SECTION_IDS.has(section as ClubProfileSectionId);

/** Un'affiliazione federale del club. */
export type ClubFederationEntry = {
  id?: string;
  name?: string;
  registrationNumber?: string;
  affiliationDate?: string;
};

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
  // --- dati fiscali
  businessName: string;
  vatNumber: string;
  fiscalCode: string;
  taxRegime: string;
  atecoCode: string;
  sdiCode: string;
  legalAddress: string;
  legalCity: string;
  legalPostalCode: string;
  legalRegion: string;
  legalProvince: string;
  legalCountry: string;
  representativeName: string;
  representativeSurname: string;
  representativeFiscalCode: string;
  // --- dati bancari
  bankName: string;
  iban: string;
  // --- federazioni e impostazioni di incasso
  federations: ClubFederationEntry[];
  paymentSettings: Record<string, any> | null;
};

export type ClubProfileSectionUpdate = {
  /** Colonne della tabella `clubs`. */
  columns: Record<string, any>;
  /** Chiavi da fondere dentro `clubs.settings`. */
  settings: Record<string, any>;
};

const trimmed = (value: string) => String(value || "").trim();

/** Solo cifre: gli spazi e il prefisso «IT» che si digitano non sono il numero. */
const normalizedVatNumber = (value: string) =>
  trimmed(value).toUpperCase().replace(/^IT/, "").replace(/[\s.]/g, "");

const normalizedFiscalCode = (value: string) =>
  trimmed(value).toUpperCase().replace(/\s/g, "");

const normalizedIban = (value: string) =>
  trimmed(value).toUpperCase().replace(/\s/g, "");

/**
 * Forma di un IBAN, non sua esistenza.
 *
 * Due lettere di paese, due cifre di controllo, poi da 11 a 30 caratteri
 * alfanumerici: e la struttura definita da ISO 13616, e basta a distinguere
 * «IT60X05» — che si sta ancora scrivendo — da un IBAN.
 */
const isWellFormedIban = (value: string) =>
  /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value);

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
        // La PEC si digita qui, ma ha una colonna sua perche finisce nei
        // documenti fiscali: prima la scriveva solo il pulsante «Salva».
        pec: trimmed(draft.companyPec) || null,
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

  if (section === "fiscali") {
    /*
      `atecoCode` vive solo dentro `settings`: la colonna `clubs.ateco_code`
      non esiste. Lo stesso vale per `businessName` e `tax_regime`, che pero
      una colonna ce l'hanno e vengono tenuti allineati perche la lettura
      preferisce la colonna e ricade sulle impostazioni.
    */
    return {
      columns: {
        business_name: trimmed(draft.businessName) || null,
        vat_number: normalizedVatNumber(draft.vatNumber) || null,
        fiscal_code: normalizedFiscalCode(draft.fiscalCode) || null,
        tax_regime: trimmed(draft.taxRegime) || null,
        sdi_code: trimmed(draft.sdiCode).toUpperCase() || null,
        legal_address: trimmed(draft.legalAddress) || null,
        legal_city: trimmed(draft.legalCity) || null,
        legal_postal_code: trimmed(draft.legalPostalCode) || null,
        legal_region: trimmed(draft.legalRegion) || null,
        legal_province: trimmed(draft.legalProvince) || null,
        legal_country: trimmed(draft.legalCountry) || "Italia",
        representative_name: trimmed(draft.representativeName) || null,
        representative_surname: trimmed(draft.representativeSurname) || null,
        representative_fiscal_code:
          normalizedFiscalCode(draft.representativeFiscalCode) || null,
      },
      settings: {
        businessName: trimmed(draft.businessName) || null,
        vat_number: normalizedVatNumber(draft.vatNumber) || null,
        fiscal_code: normalizedFiscalCode(draft.fiscalCode) || null,
        tax_regime: trimmed(draft.taxRegime) || null,
        atecoCode: trimmed(draft.atecoCode) || null,
      },
    };
  }

  if (section === "bancari") {
    return {
      columns: {
        bank_name: trimmed(draft.bankName) || null,
        iban: normalizedIban(draft.iban) || null,
      },
      settings: {
        bank_name: trimmed(draft.bankName) || null,
        iban: normalizedIban(draft.iban) || null,
      },
    };
  }

  if (section === "federazione") {
    // Non esiste una colonna `clubs.federations`: le affiliazioni vivono
    // dentro `settings`, ed e da li che le rilegge anche la scheda atleta.
    return {
      columns: {},
      settings: {
        federations: Array.isArray(draft.federations) ? draft.federations : [],
      },
    };
  }

  if (section === "pagamenti") {
    /*
      **Deterministica, come tutte le altre.** Qui passava
      `sanitizePaymentSettingsForStorage`, che marca `updatedAt` con l'ora
      corrente: l'impronta risultava diversa a ogni render, la sezione non
      tornava mai «pulita» e ogni tasto premuto in qualunque scheda della
      pagina riscriveva le impostazioni di incasso. Trovato in UAT su
      staging. L'ora di scrittura la mette `saveClubProfileSection`, che e il
      solo punto in cui una scrittura avviene davvero.
    */
    return {
      columns: {},
      settings: draft.paymentSettings
        ? { paymentSettings: normalizePaymentSettings(draft.paymentSettings as any) }
        : {},
    };
  }

  /*
    Restano fuori Stagioni — che ha un endpoint proprio e operazioni con
    conferma — e Account e Fatturazione, che e in sola lettura. Se ci
    passassero, scrivere un oggetto vuoto e piu sicuro che indovinare.
  */
  return { columns: {}, settings: {} };
};

/**
 * Un valore incompleto non si scrive.
 *
 * E il sostituto vero del pulsante «Salva»: il pulsante non impediva di
 * salvare un IBAN sbagliato, si limitava a chiedere un clic in piu. Qui la
 * sezione resta non scritta finche il valore non e formalmente un valore, e
 * la ragione viene mostrata a schermo.
 *
 * Solo controlli **di forma**: che una partita IVA esista davvero lo sa
 * l'Agenzia delle Entrate, non questa funzione.
 */
export const validateClubProfileSection = (
  section: ClubProfileSectionId,
  draft: ClubProfileDraft,
): string | null => {
  if (section === "generale") {
    if (!trimmed(draft.name)) {
      return "Il nome del club e obbligatorio.";
    }
    if (draft.postalCode && !isValidPostalCode(draft.postalCode)) {
      return "Il CAP ha cinque cifre.";
    }
    return null;
  }

  if (section === "fiscali") {
    const vat = normalizedVatNumber(draft.vatNumber);
    if (vat && !/^\d{11}$/.test(vat)) {
      return "La partita IVA ha undici cifre.";
    }

    const fiscalCode = normalizedFiscalCode(draft.fiscalCode);
    if (
      fiscalCode &&
      !/^\d{11}$/.test(fiscalCode) &&
      !isWellFormedCodiceFiscale(fiscalCode)
    ) {
      return "Il codice fiscale della societa ha undici cifre o sedici caratteri.";
    }

    const representative = normalizedFiscalCode(draft.representativeFiscalCode);
    if (representative && !isWellFormedCodiceFiscale(representative)) {
      return "Il codice fiscale del legale rappresentante non e valido.";
    }

    if (draft.legalPostalCode && !isValidPostalCode(draft.legalPostalCode)) {
      return "Il CAP della sede legale ha cinque cifre.";
    }

    return null;
  }

  if (section === "bancari") {
    const iban = normalizedIban(draft.iban);
    if (iban && !isWellFormedIban(iban)) {
      return "L'IBAN non e ancora completo: due lettere di paese, due cifre di controllo e almeno undici caratteri.";
    }
    return null;
  }

  if (section === "pagamenti") {
    return draft.paymentSettings
      ? validatePaymentSettingsForSave(draft.paymentSettings as any)
      : null;
  }

  return null;
};

/**
 * Toglie dall'impronta cio che cambia da solo.
 *
 * Un'impronta confronta **cio che l'utente puo cambiare**; l'ora dell'ultima
 * scrittura non lo e. `normalizePaymentSettings` marca `updatedAt` su ogni
 * provider che nel dato salvato non c'e ancora, quindi due letture della
 * stessa bozza davano impronte diverse di qualche millisecondo: la sezione
 * non tornava mai «pulita» e l'autosave riscriveva a ogni tasto premuto in
 * qualunque scheda della pagina. Trovato in UAT su staging, e poi una seconda
 * volta dal test — perche il primo tentativo di correzione aveva tolto solo
 * lo strato piu esterno.
 */
const withoutWriteStamps = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(withoutWriteStamps);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "updatedAt" && key !== "updated_at")
      .map(([key, nested]) => [key, withoutWriteStamps(nested)]),
  );
};

/** Impronta della sezione: due impronte uguali = niente da salvare. */
export const clubProfileSectionSnapshot = (
  section: ClubProfileSectionId,
  draft: ClubProfileDraft,
) =>
  JSON.stringify(
    withoutWriteStamps(buildClubProfileSectionUpdate(section, draft)),
  );

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
 * `settings` e una colonna JSON unica. Fino a RC FIX 3 la si rileggeva e la si
 * riscriveva **intera**: salvare i Contatti rimandava indietro anche i
 * Pagamenti, nella copia letta prima. Se qualcun altro aveva salvato i
 * Pagamenti nel frattempo — un'altra finestra, un'altra persona della stessa
 * societa — quella scrittura spariva senza un errore.
 *
 * Ora la sezione dichiara **solo le proprie chiavi**, in `settings_patch`, e
 * la fusione la fa il server sul valore corrente, sotto lock. Non c'e piu una
 * copia vecchia da riportare indietro, e cade anche la rilettura che serviva
 * a costruirla: una richiesta invece di due (WP-36).
 */
export const saveClubProfileSection = async (
  clubId: string,
  section: ClubProfileSectionId,
  draft: ClubProfileDraft,
) => {
  const { columns, settings } = buildClubProfileSectionUpdate(section, draft);
  const payload: Record<string, any> = { ...columns };

  /*
    L'ora di scrittura si mette **qui**, non nell'impronta: dentro
    `buildClubProfileSectionUpdate` renderebbe la sezione diversa a ogni
    render, quindi sempre da salvare.
  */
  const stamped =
    section === "pagamenti" && settings.paymentSettings
      ? {
          ...settings,
          paymentSettings: sanitizePaymentSettingsForStorage(
            settings.paymentSettings,
          ),
        }
      : settings;

  if (Object.keys(stamped).length) {
    payload.settings_patch = stamped;
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
  "pec",
  "business_name",
  "vat_number",
  "fiscal_code",
  "tax_regime",
  "sdi_code",
  "legal_address",
  "legal_city",
  "legal_postal_code",
  "legal_region",
  "legal_province",
  "legal_country",
  "representative_name",
  "representative_surname",
  "representative_fiscal_code",
  "bank_name",
  "iban",
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
  businessName: "",
  vatNumber: "",
  fiscalCode: "",
  taxRegime: "",
  atecoCode: "",
  sdiCode: "",
  legalAddress: "",
  legalCity: "",
  legalPostalCode: "",
  legalRegion: "",
  legalProvince: "",
  legalCountry: "Italia",
  representativeName: "",
  representativeSurname: "",
  representativeFiscalCode: "",
  bankName: "",
  iban: "",
  federations: [],
  paymentSettings: null,
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
    companyPec: asText(record.pec) || asText(settings.companyPec),
    website: asText(settings.website),
    facebook: asText(settings.facebook),
    instagram: asText(settings.instagram),
    twitter: asText(settings.twitter),
    youtube: asText(settings.youtube),
    businessName: asText(record.business_name) || asText(settings.businessName),
    vatNumber: asText(record.vat_number) || asText(settings.vat_number),
    fiscalCode: asText(record.fiscal_code) || asText(settings.fiscal_code),
    taxRegime: asText(record.tax_regime) || asText(settings.tax_regime),
    atecoCode: asText(settings.atecoCode),
    sdiCode: asText(record.sdi_code),
    legalAddress: asText(record.legal_address),
    legalCity: asText(record.legal_city),
    legalPostalCode: asText(record.legal_postal_code),
    legalRegion: asText(record.legal_region),
    legalProvince: asText(record.legal_province),
    legalCountry: asText(record.legal_country) || "Italia",
    representativeName: asText(record.representative_name),
    representativeSurname: asText(record.representative_surname),
    representativeFiscalCode: asText(record.representative_fiscal_code),
    bankName: asText(record.bank_name) || asText(settings.bank_name),
    iban: asText(record.iban) || asText(settings.iban),
    federations: Array.isArray(settings.federations) ? settings.federations : [],
    paymentSettings:
      typeof settings.paymentSettings === "object" && settings.paymentSettings
        ? settings.paymentSettings
        : null,
  };

  return { id: String(record.id), draft, settings };
};

/**
 * Il periodo della stagione attiva del club.
 *
 * Una richiesta sola, con la sola colonna `settings`. Serve al pro-rata: il
 * modulo del piano chiede un «periodo», e la stagione attiva **e** quel
 * periodo. Chiederlo due volte allo stesso club in una pagina sarebbe uno
 * spreco, quindi chi lo usa lo tiene in stato.
 *
 * Restituisce `null` quando non si riesce a leggerlo: un pro-rata che non si
 * applica e meglio di un pro-rata calcolato su un periodo inventato.
 */
export const loadActiveSeasonPeriod = async (
  clubId: string,
): Promise<{ startDate: string; endDate: string } | null> => {
  try {
    const settings = await readClubSettings(clubId);
    const { normalizeClubSeasons } = await import("@/lib/club-seasons");
    const { activeSeason } = normalizeClubSeasons(settings);

    return activeSeason?.startDate && activeSeason?.endDate
      ? { startDate: activeSeason.startDate, endDate: activeSeason.endDate }
      : null;
  } catch {
    return null;
  }
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
